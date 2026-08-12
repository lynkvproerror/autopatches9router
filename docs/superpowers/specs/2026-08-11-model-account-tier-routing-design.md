# Model-to-Account Tier Routing Design

## Objective

Keep ordinary Codex work on `gpt-5.6-terra` while enforcing deterministic
model-to-account selection inside 9router:

- Codex chooses the requested model; 9router only selects an account and does
  not classify tasks.
- New primary tasks default to Terra. Existing tasks retain their selected
  model and must be switched or recreated to move from Sol to Terra.
- `gpt-5.6-sol` uses active Plus-or-higher accounts only and fails closed when
  none are available.
- `gpt-5.6-terra` prefers active Free, Go, K12, and Edu accounts, then may use
  Plus-or-higher accounts when no preferred account is available.
- Other models retain the upstream account-selection behavior.

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
2. Classify a requested model into `sol`, `terra`, or unrestricted policy.
3. Filter active connections according to the policy.
4. Patch the minified credential selector using the v3 marker, upgrading v1/v2 assignments, and fail-closed anchor validation.

`apply-patches.js` will add API Patch 28, scan `server/chunks/*.js`, require exactly one credential-selector target, and write only that target. The controller will run the routing regression test whenever API or full-scope patches are applied.

Codex global configuration registers `sol_analyst`, `sol_verifier`, and
`terra_coder`. The main Codex model is Terra. Sol is exceptional: use the
analyst for hard or evidence-heavy work and the verifier only for high-risk
changes or an explicit independent audit. All implementation belongs to
`terra_coder`; routine verification remains on Terra.

## Routing Policy

| Requested model | Eligible plans |
| --- | --- |
| Sol-tier model ID | `plus`, `pro`, `team`, `business`, `enterprise`, `premium`, `ultra`; no fallback |
| Terra-tier model ID | Prefer `free`, `go`, `k12`, `edu`; otherwise all upstream-eligible accounts, including Plus+ |
| Any other model | Unrestricted; all upstream-eligible plans |

Plan matching is case-insensitive and ignores spaces, underscores, and hyphens.
Only explicit Sol/Terra/Luna/Mini IDs or recognized reasoning suffixes are
tier-filtered. Unknown model IDs are unrestricted. Unknown or missing plans
are excluded from Sol, remain Terra fallback candidates, and remain eligible
for unrestricted models.

## Data Flow

```text
Codex request
  -> resolve provider/model
  -> load active Codex connections
  -> filter by model/account tier policy
  -> remove model-locked accounts
  -> existing round-robin/priority selection
  -> upstream request
```

## Failure Behavior

- If no Plus-or-higher account remains for Sol, reuse the upstream `No active credentials for provider: codex` response path.
- Sol never falls back to lower-tier, unknown, or otherwise ineligible plans. Terra may fall back to Plus+ only after no Free/Go/K12/Edu account is available.
- If the target selector anchor is absent or appears more than once, Patch 28 returns failure and the transactional controller keeps the previous verified installation.
- Inactive accounts remain excluded by the existing database query before tier filtering.

## Testing

- Unit tests cover plan normalization and every model-policy branch.
- Mutation-sensitive cases prove Sol rejects Free/K12/unknown plans, Terra prefers lower-tier plans before its explicit Plus+ fallback, inactive status is delegated to the upstream active query, and unrelated models stay unchanged.
- Patch tests cover v3 injection, idempotency, unsupported chunk layouts, and migration cleanup/upgrades of v1/v2 and the legacy exact Sol/Terra assignment.
- Controller validation runs the test against the explicit app root before API startup.
- Codex configuration smoke tests must confirm new primary tasks use Terra. Existing task sessions require an explicit model switch or recreation before their model changes.

## Rollout

Use the existing transactional API patch operation. It stops the API, creates a rollback snapshot, applies Patch 28, runs regression tests, records a new API patch fingerprint, starts 9router, and verifies health. No account records, priorities, or activation states are changed.
