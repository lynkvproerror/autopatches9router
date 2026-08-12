# Model-to-Account Tier Routing Design

## Objective

Enforce deterministic Codex account selection inside 9router:

- Implementation and code-editing work stays on `gpt-5.6-terra`.
- Debugging, verification, review, and read-heavy analysis use dedicated `gpt-5.6-sol` roles when delegation is useful.
- `gpt-5.6-sol` uses only active K12 or Plus-and-higher accounts.
- `gpt-5.6-terra` uses only active Free accounts.
- Other models preserve the upstream 9router selection behavior.
- Requests never cross tiers when the required tier has no eligible account.

## Current State

9router resolves the requested model and calls the credential selector in the server chunk that exports module `80238`. The selector loads every active connection for the resolved provider, removes model-locked accounts, and then applies the configured `fill-first` or `round-robin` strategy. Account plan is available at `connection.providerSpecificData.chatgptPlanType`, but the selector does not currently use it.

Runtime evidence collected on 2026-08-11:

- Active Codex accounts: 21 Free and 3 Plus.
- Inactive Codex accounts: 1 Plus and 1 K12.
- Last 1,000 Sol/Terra requests: Sol used Plus 730 times; Terra used Plus 263 times and Free 7 times.

## Considered Approaches

### 1. Filter inside the credential selector (recommended)

Inject a small plan-policy filter immediately after `getProviderConnections({ provider, isActive: true })`. Existing model locks, cooldowns, fallback, priority, and round-robin then operate on the eligible tier only.

Advantages: strict enforcement, one decision point, no database mutation, preserves upstream behavior after filtering, and can be reapplied after 9router updates.

Trade-off: the patch depends on a recognizable minified credential-selector anchor and must fail closed when upstream layout changes.

### 2. Rewrite account priorities dynamically

Change priorities before each request so the desired tier sorts first.

Rejected because round-robin and fallback can still cross tiers, concurrent Sol/Terra requests would race on shared priorities, and persistent priority mutations would affect the dashboard.

### 3. Add separate virtual Codex providers

Clone Codex into `codex-premium` and `codex-free`, then map models to the corresponding provider.

Rejected for this scope because it duplicates authentication/provider configuration and expands the patch surface across model discovery, OAuth import, usage, and dashboard pages.

## Architecture

Create `model-account-routing.js` as a focused, testable module with four responsibilities:

1. Normalize a connection's plan without reading secrets.
2. Classify a model into `premium`, `free`, or `unrestricted` policy.
3. Filter active connections according to the policy.
4. Patch the minified credential selector using a version marker and fail-closed anchor validation.

`apply-patches.js` will add API Patch 28, scan `server/chunks/*.js`, require exactly one credential-selector target, and write only that target. The controller will run the routing regression test whenever API or full-scope patches are applied.

Codex global configuration will register three custom roles in `~/.codex/config.toml` and point them to config layers under `~/.codex/agents/`: `sol_analyst`, `sol_verifier`, and `terra_coder`. This registry-plus-layer format is compatible with the installed Codex CLI 0.144.1. Global instructions will keep direct implementation on Terra, delegate evidence-heavy debugging and verification to the Sol roles when useful, and avoid parallel write conflicts. The main Codex model remains Terra; the role config layers inherit the 9router provider.

## Routing Policy

| Requested model | Eligible plans |
| --- | --- |
| Model ID containing `gpt-5.6-sol` | `k12`, `plus`, `pro`, `team`, `business`, `enterprise`, `edu`, `premium`, `ultra` |
| Model ID containing `gpt-5.6-terra` | `free` |
| Any other model | All upstream-eligible plans |

Plan matching is case-insensitive and ignores spaces, underscores, and hyphens. Unknown or missing plans are excluded from Sol and Terra requests but remain eligible for unrelated models.

## Data Flow

```text
Codex task classification
  -> implementation/editing: Terra primary or terra_coder
  -> debugging/verification/analysis: sol_analyst or sol_verifier
Codex request
  -> resolve provider/model
  -> load active Codex connections
  -> filter by model/account tier policy
  -> remove model-locked accounts
  -> existing round-robin/priority selection
  -> upstream request
```

## Failure Behavior

- If no account remains after tier filtering, reuse the upstream `No active credentials for provider: codex` response path.
- Do not fall back from Sol to Free or from Terra to Plus/K12.
- If the target selector anchor is absent or appears more than once, Patch 28 returns failure and the transactional controller keeps the previous verified installation.
- Inactive accounts remain excluded by the existing database query before tier filtering.

## Testing

- Unit tests cover plan normalization and every model-policy branch.
- Mutation-sensitive cases prove Terra rejects Plus, Sol rejects Free, inactive status is delegated to the upstream active query, unknown plans fail closed for restricted models, and unrelated models stay unchanged.
- Patch tests cover successful injection, marker idempotency, and rejection of unsupported chunk layouts.
- Controller validation runs the test against the explicit app root before API startup.
- Codex CLI smoke tests must load the global configuration without the existing malformed-agent warning, spawn the named roles, and produce matching Sol/Plus+ and Terra/Free runtime records in 9router.

## Rollout

Use the existing transactional API patch operation. It stops the API, creates a rollback snapshot, applies Patch 28, runs regression tests, records a new API patch fingerprint, starts 9router, and verifies health. No account records, priorities, or activation states are changed.
