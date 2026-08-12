# Model-to-Account Tier Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route implementation work to Terra/Free, route delegated debugging and verification work to Sol/K12-or-Plus+, and preserve upstream routing for unrelated models.

**Architecture:** Add a pure routing-policy and chunk-patching module, invoke it from a new API-scoped patch, and register its regression test in the transactional controller. Filtering occurs before upstream model-lock and round-robin logic, so existing availability behavior is preserved within each allowed tier.

**Tech Stack:** Node.js CommonJS, Node test runner, PowerShell controller, minified Next.js server bundles.

## Global Constraints

- Sol must never fall back to Free.
- Terra must never use K12, Plus, Pro, Team, Business, Enterprise, Edu, Premium, or Ultra accounts.
- Only active accounts are considered; existing 9router active-state querying remains authoritative.
- Other model IDs retain upstream account-selection behavior.
- Unsupported upstream bundle layouts fail the patch instead of silently skipping enforcement.
- No account data, priorities, tokens, or activation states are mutated.

---

### Task 1: Routing Policy Tests and Module

**Files:**
- Create: `model-account-routing.test.js`
- Create: `model-account-routing.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `normalizeAccountPlan(connection): string`
- Produces: `getModelAccountPolicy(provider, model): "premium" | "free" | "unrestricted"`
- Produces: `filterConnectionsForModel(connections, provider, model): object[]`
- Produces: `patchCredentialSelectorContent(content): { changed: boolean, content: string }`

- [x] **Step 1: Unignore the routing regression test**

Add this exception immediately after `*.test.js`:

```gitignore
!model-account-routing.test.js
```

- [x] **Step 2: Write failing behavior tests**

Create table-driven tests with literal expected connection IDs:

```js
test('terra keeps only free Codex accounts', () => {
  assert.deepEqual(
    filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'gpt-5.6-terra').map(item => item.id),
    ['free'],
  );
});

test('sol keeps K12 and Plus-or-higher Codex accounts', () => {
  assert.deepEqual(
    filterConnectionsForModel(FIXTURE_CONNECTIONS, 'codex', 'gpt-5.6-sol').map(item => item.id),
    ['k12', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu', 'premium', 'ultra'],
  );
});
```

Also cover case normalization, separators, unknown plans, non-Codex providers, unrelated models, patch injection, idempotency, and unsupported content.

- [x] **Step 3: Run tests and verify RED**

Run: `node --test model-account-routing.test.js`

Expected: FAIL because `model-account-routing.js` does not exist.

- [x] **Step 4: Implement the minimal pure module**

Use an explicit premium-plan set and a marker named `/*__9router_model_account_tier_v1__*/`. Locate the selector function parameters and `getProviderConnections({provider, isActive: true})` anchor, then inject a call equivalent to:

```js
connections = filterConnectionsForModel(connections, normalizedProvider, model);
```

The injected bundle code must be self-contained because the built server chunk cannot import the source helper at runtime.

- [x] **Step 5: Run tests and verify GREEN**

Run: `node --test model-account-routing.test.js`

Expected: all routing and patch-transformation tests pass.

### Task 2: API Patch Integration

**Files:**
- Modify: `apply-patches.js`

**Interfaces:**
- Consumes: `patchCredentialSelectorContent(content)` from Task 1.
- Produces: `patchModelAccountTierRouting(): boolean` as API Patch 28.

- [x] **Step 1: Import the patch helper**

Add:

```js
const { patchCredentialSelectorContent } = require('./model-account-routing');
```

- [x] **Step 2: Implement Patch 28**

Scan `BUILD/server/chunks/*.js`, collect files where the helper returns `changed: true` or the marker already exists, require exactly one matched file, and write only when changed.

- [x] **Step 3: Register Patch 28**

Add an API-scoped definition targeting `server/chunks/*.js` before dashboard-only patches so the API scope hash includes the policy.

- [x] **Step 4: Verify syntax and target discovery**

Run: `node --check apply-patches.js`

Run: `node apply-patches.js --list-targets`

Expected: syntax exit 0 and Patch 28 listed as API scope.

### Task 3: Portable Bundle and Controller Validation

**Files:**
- Modify: `automation/install-automation.ps1`
- Modify: `automation/9router-control.ps1`

**Interfaces:**
- Consumes: `model-account-routing.js` and `model-account-routing.test.js`.
- Produces: installation source validation and automatic regression execution during patch transactions.

- [x] **Step 1: Require the new source files**

Add both files to `$RequiredSourceFiles` so incomplete copied bundles are rejected.

- [x] **Step 2: Register the regression test**

Define `$ModelAccountRoutingTest` and append it to the controller's base `$tests` list so both `api` and `all` patch scopes execute it.

- [x] **Step 3: Validate PowerShell parsing**

Run:

```powershell
$errors=$null
[System.Management.Automation.Language.Parser]::ParseFile('automation/9router-control.ps1',[ref]$null,[ref]$errors) | Out-Null
if($errors){$errors | Format-List; exit 1}
```

Repeat for `automation/install-automation.ps1`; expected exit 0 with no parser errors.

### Task 4: Isolated Patch Verification

**Files:**
- Test: a temporary copy under `automation/work/` of the installed 9router app.

**Interfaces:**
- Consumes: complete patch set and installed v0.5.45 app layout.
- Produces: evidence that Patch 28 applies once, is idempotent, and keeps all regression tests green.

- [x] **Step 1: Copy the installed app into an isolated verification root**

Use `robocopy` into `automation/work/model-account-routing-verification/app` and copy the parent `package.json` required by the patch runner.

- [x] **Step 2: Run API patch scope on the isolated root**

Run: `node apply-patches.js --scope api --app-root <isolated-app-root>`

Expected: Patch 28 reports OK and the command exits 0.

- [x] **Step 3: Run the patch a second time**

Run the same command again.

Expected: Patch 28 reports already patched and exits 0.

- [x] **Step 4: Run all repository regression tests**

Run: `node --test model-account-routing.test.js`

Expected: zero failures.

### Task 5: Transactional Deployment and Runtime Evidence

**Files:**
- Modify at runtime through controller: installed 9router server chunk and API patch state.

**Interfaces:**
- Consumes: verified API Patch 28.
- Produces: a healthy API listener enforcing model/account tiers.

- [x] **Step 1: Apply through the controlled API maintenance path**

Run:

```powershell
pwsh -NoProfile -File automation/9router-control.ps1 -Action ApplyPatches -Scope api
```

The controller must stop the managed API, create its rollback snapshot, apply patches and tests, update the fingerprint, and restore health.

- [x] **Step 2: Verify service health**

Run:

```powershell
pwsh -NoProfile -File automation/9router-control.ps1 -Action Health
```

Expected: `healthy`.

- [x] **Step 3: Verify patched runtime selection with controlled fixtures**

Run the unit test against representative Free, K12, Plus, and unknown-plan connections and confirm zero failures. Inspect the installed selector chunk to ensure the transaction deployed the versioned marker exactly once.

- [x] **Step 4: Verify observed routing after requests occur**

Query `usageHistory` joined to `providerConnections` and confirm new Terra entries use `free`, while new Sol entries use only the premium whitelist. Report that live traffic evidence is pending if no post-deployment requests exist yet.

### Task 6: Codex Task-to-Model Agent Roles

**Files:**
- Modify: `C:\Users\Linh\.codex\config.toml`
- Modify: `C:\Users\Linh\.codex\bridge.md`
- Create: `C:\Users\Linh\.codex\agents\sol_analyst.toml`
- Create: `C:\Users\Linh\.codex\agents\sol_verifier.toml`
- Create: `C:\Users\Linh\.codex\agents\terra_coder.toml`

**Interfaces:**
- Produces: valid custom roles selectable by Codex based on their descriptions.
- Produces: persistent orchestration guidance mapping read-heavy/debug work to Sol and write-heavy implementation to Terra.

- [x] **Step 1: Preserve a timestamped configuration backup**

Copy the current `config.toml`, `bridge.md`, and any existing role files into `automation/work/codex-config-backup-<timestamp>` before editing.

- [x] **Step 2: Register version-compatible custom agent roles**

Replace `[agents.subagent]` with role declarations compatible with the installed Codex CLI 0.144.1:

```toml
[agents.sol_analyst]
description = "Use for debugging, root-cause analysis, architecture tracing, security analysis, and other evidence-heavy read-only investigation."
config_file = "agents/sol_analyst.toml"

[agents.sol_verifier]
description = "Use for verification, regression testing, code review, adversarial checks, and independent confirmation of completed changes."
config_file = "agents/sol_verifier.toml"

[agents.terra_coder]
description = "Use for implementation, refactoring, and targeted code fixes after requirements and evidence are clear."
config_file = "agents/terra_coder.toml"
```

Do not use scalar defaults under `[agents]` on Codex CLI 0.144.1; that release parses every child as an `AgentRoleToml` declaration.

- [x] **Step 3: Create valid custom agent files**

Each referenced config layer must contain `developer_instructions` and its pinned model settings. Pin `sol_analyst` and `sol_verifier` to `gpt-5.6-sol`; pin `terra_coder` to `gpt-5.6-terra`. Keep the analyst read-only and avoid concurrent writes from multiple agents. Role names and descriptions remain in `config.toml` for compatibility with this CLI release.

- [x] **Step 4: Add durable orchestration instructions**

Append a `Model orchestration` section to `bridge.md` that keeps implementation on Terra, uses Sol roles for debugging/verification/read-heavy analysis when delegation materially helps, and requires the primary agent to synthesize results.

- [x] **Step 5: Verify configuration loading**

Run a minimal `codex exec` request and inspect stderr. Then explicitly spawn each custom role and inspect 9router usage history. Expected: no `Ignoring malformed agent role definition` warning, Terra requests use Free, and Sol requests use K12/Plus-or-higher.

## Deployment Results

- Patch 28 was applied transactionally to installed 9router v0.5.45 and remains idempotent with one marker in `server/chunks/4664.js`.
- Routing regression suite passes 8/8 tests; Node syntax, PowerShell parsing, target discovery, API scope hashing, and `git diff --check` pass.
- Controller reports current API patches, healthy API/model endpoints, and a healthy isolated dashboard; HTTP probes return 200.
- Fresh Codex CLI smoke tests load all custom roles without a malformed-role warning.
- Delegated Sol role traffic produced successful `gpt-5.6-sol` records on Plus accounts; Terra primary and delegated traffic produced successful `gpt-5.6-terra` records on Free accounts.

