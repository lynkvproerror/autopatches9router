"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const automationDir = path.join(root, "automation");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("central automation control plane is complete", () => {
    for (const relativePath of [
        "automation/9router-control.json",
        "automation/9router-control.ps1",
        "automation/dashboard-staging-server.js",
        "api-gateway.test.js",
        "automation/start-9router-hidden.vbs",
        "automation/verify-9router-health.py",
        "automation/install-automation.ps1",
    ]) {
        assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} is missing`);
    }
    assert.ok(fs.statSync(automationDir).isDirectory());
    assert.match(read("automation/start-9router-hidden.vbs"), /PowerShell\\7\\pwsh\.exe/i);
});

test("hidden Startup launcher retries for a bounded window and records durable diagnostics", () => {
    const launcher = read("automation/start-9router-hidden.vbs");

    assert.match(launcher, /startup-launch\.log/i, "launcher must write a durable boot diagnostic log");
    assert.match(launcher, /OpenTextFile|CreateTextFile/i, "launcher must create or append the diagnostic log");
    assert.match(launcher, /WScript\.Sleep\s+\d+/i, "launcher must wait between retry attempts");
    assert.match(launcher, /Do\s+(?:While|Until)|For\s+\w+\s*=\s*\d+\s+To\s+\w+/i, "launcher must retry instead of firing once");
    assert.match(launcher, /MaxAttempts|RetryDeadline|DateAdd\s*\(/i, "launcher retries must have an explicit upper bound");
});

test("control config reserves distinct API, dashboard, and updater ports", () => {
    const config = JSON.parse(read("automation/9router-control.json"));
    const apiPort = config.apiPort ?? config.api?.port ?? config.port;
    const dashboardPort = config.dashboardPort ?? config.dashboard?.port ?? config.dashboardStage?.port;
    const dashboardHost = config.dashboardHost ?? config.dashboard?.bindHost ?? config.dashboardStage?.bindHost;
    const updaterPort = config.updaterPort ?? config.updater?.port;

    assert.equal(apiPort, 53220, "API must remain on port 53220");
    assert.equal(dashboardPort, 20128, "dashboard staging must use port 20128");
    assert.equal(updaterPort, 20129, "updater status must reserve port 20129");
    assert.equal(dashboardHost, "127.0.0.1", "dashboard staging must bind to loopback");
    assert.ok(config.dashboardStartTimeoutSeconds >= 420, "dashboard cold-start grace must cover the observed fresh-stage startup time");
    assert.ok(config.dashboardFailureRetrySeconds >= 300, "dashboard stage failures need a bounded retry backoff");
    assert.equal(new Set([apiPort, dashboardPort, updaterPort]).size, 3, "managed ports must be distinct");
});

test("controller exposes an independent dashboard lifecycle", () => {
    const controller = read("automation/9router-control.ps1");

    for (const action of [
        "StageDashboard",
        "StartDashboard",
        "RestartDashboard",
        "DashboardStatus",
        "StopDashboard",
    ]) {
        assert.match(controller, new RegExp(`\\"${action}\\"`), `${action} action is missing`);
    }

    for (const functionName of [
        "Prepare-DashboardStage",
        "Start-DashboardStage",
        "Restart-DashboardStage",
        "Show-DashboardStageStatus",
        "Stop-DashboardStage",
        "Maintain-DashboardStage",
    ]) {
        assert.match(
            controller,
            new RegExp(`function\\s+${functionName.replaceAll("-", "\\-")}\\b`, "i"),
            `${functionName} function is missing`,
        );
    }
});

test("dashboard stage failures preserve the last-known-good release with backoff", () => {
    const controller = read("automation/9router-control.ps1");
    assert.match(controller, /DashboardStageFailureFile/);
    assert.match(controller, /Dashboard update to .*last-known-good/);
    assert.match(controller, /dashboardFailureRetrySeconds/);
    assert.match(controller, /if\s*\(-not \$stageUsable\)\s*\{\s*throw\s*\}/);
    assert.match(controller, /return Start-DashboardStage -Stage \$stage/);
});

test("bare 9router delegates to the managed two-port launcher", () => {
    const controller = read("automation/9router-control.ps1");
    const installer = read("automation/install-automation.ps1");
    const launcher = read("automation/start-9router-hidden.vbs");

    assert.match(controller, /function Ensure-ManagedCommandShims/);
    assert.match(controller, /\$shPath\s*=\s*Join-Path \$GlobalPrefix "9router"/);
    assert.match(controller, /#!\/bin\/sh/);
    assert.match(controller, /exec cmd\.exe \/d \/c call __MANAGED_START__/);
    assert.match(controller, /start-9router.bat/);
    assert.match(controller, /9router-managed-controller/);
    assert.match(controller, /Ensure-ManagedCommandShims/);
    assert.doesNotMatch(controller, /%\*/);
    assert.match(launcher, /ControlCommand\("EnsureRunning"\)/);
    assert.match(launcher, /API and dashboard are healthy/i);

    const startCase = installer.slice(
        installer.indexOf('"Start" {'),
        installer.indexOf('"Repair" {'),
    );
    assert.ok(
        startCase.indexOf("Start-CentralMonitor") < startCase.indexOf('Invoke-Controller -ControllerAction "EnsureRunning"'),
        "manual Start must replace a stale monitor before entering controller maintenance",
    );
});

test("update cutover and rollback repair every managed command shim before restart", () => {
    const controller = read("automation/9router-control.ps1");
    const commitStart = controller.indexOf("function Commit-PreparedUpdate");
    const commitEnd = controller.indexOf("function Confirm-PreparedUpdateRuntime", commitStart);
    const commitBody = controller.slice(commitStart, commitEnd);
    const restoreStart = controller.indexOf("function Restore-GlobalInstallExact");
    const restoreEnd = controller.indexOf("function Invoke-TransactionalPatchSet", restoreStart);
    const restoreBody = controller.slice(restoreStart, restoreEnd);

    assert.match(commitBody, /npm update failed[\s\S]*Ensure-ManagedCommandShims[\s\S]*Set-TransactionPhase[^\n]+installed/);
    assert.match(restoreBody, /Rollback version verification failed[\s\S]*Ensure-ManagedCommandShims[\s\S]*rolled-back/);
    assert.match(controller, /foreach \(\$name in @\("9router", "9router\.cmd", "9router\.ps1"\)\)/);
});

test("Install and Repair stop the same-root monitor before package or controller maintenance", () => {
    const installer = read("automation/install-automation.ps1");
    const installCase = installer.slice(
        installer.indexOf('"Install" {'),
        installer.indexOf('"Update" {'),
    );
    const repairCase = installer.slice(
        installer.indexOf('"Repair" {'),
        installer.indexOf("\n}", installer.indexOf('"Repair" {')),
    );

    assert.match(installer, /function Stop-CentralMonitor/);
    assert.match(installer, /function Start-CentralMonitor[\s\S]*Stop-CentralMonitor -OnlyIfStale/);
    assert.match(installer, /function Restore-CentralMonitorAfterFailedMaintenance/);
    assert.ok(
        installCase.indexOf("Stop-CentralMonitor") < installCase.indexOf("Install-UpstreamPackageIfMissing") &&
            installCase.indexOf("Stop-CentralMonitor") < installCase.indexOf("Invoke-Controller"),
        "Install must stop its monitor before package and controller maintenance",
    );
    assert.ok(
        repairCase.indexOf("Stop-CentralMonitor") < repairCase.indexOf("Install-UpstreamPackageIfMissing") &&
            repairCase.indexOf("Stop-CentralMonitor") < repairCase.indexOf("Invoke-Controller"),
        "Repair must stop its monitor before package and controller maintenance",
    );
    assert.match(installCase, /finally\s*\{[\s\S]*Restore-CentralMonitorAfterFailedMaintenance -WasRunning \$monitorWasRunning/);
    assert.match(repairCase, /finally\s*\{[\s\S]*Restore-CentralMonitorAfterFailedMaintenance -WasRunning \$monitorWasRunning/);
});

test("controller exposes a controlled API-only restart", () => {
    const controller = read("automation/9router-control.ps1");

    assert.match(controller, /["']RestartApi["']/);
    assert.match(controller, /function\s+Get-Managed9RouterRootProcess\b/i);
    assert.match(controller, /function\s+Restart-9RouterApi\b/i);
    const restartStart = controller.indexOf("function Restart-9RouterApi");
    const restartEnd = controller.indexOf("function Show-Status", restartStart);
    const restartBody = controller.slice(restartStart, restartEnd);
    assert.match(restartBody, /Stop-Managed9RouterProcessTree/);
    assert.match(restartBody, /Start-9RouterWhenStopped\s+-SkipUpdate/);
    assert.match(restartBody, /Get-DashboardPortListener/);
    assert.match(restartBody, /\$dashboardPidAfter\s*=/);
    assert.match(restartBody, /\$dashboardPidAfter\s+-ne\s+\$dashboardPidBefore/);
});

test("controller exposes a transactional prepared-update cutover", () => {
    const controller = read("automation/9router-control.ps1");
    assert.match(controller, /["']InstallPreparedUpdate["']/);
    const actionStart = controller.lastIndexOf('"InstallPreparedUpdate" {');
    const actionEnd = controller.indexOf('"Health" {', actionStart);
    const actionBody = controller.slice(actionStart, actionEnd);

    assert.match(actionBody, /Invoke-MaintenanceOperation/);
    assert.match(actionBody, /Stop-Managed9RouterProcessTree/);
    assert.match(actionBody, /Invoke-PreparedUpdateWhenStopped/);
    assert.match(actionBody, /Start-9RouterWhenStopped\s+-SkipUpdate/);
    assert.match(actionBody, /Maintain-DashboardStage/);
    const preflight = actionBody.indexOf("Assert-PreparedUpdateReady");
    const stop = actionBody.indexOf("Stop-Managed9RouterProcessTree");
    const secondPreflight = actionBody.indexOf("Assert-PreparedUpdateReady", preflight + 1);
    const commit = actionBody.indexOf("Invoke-PreparedUpdateWhenStopped");
    const start = actionBody.indexOf("Start-9RouterWhenStopped -SkipUpdate");
    const dashboard = actionBody.indexOf("Maintain-DashboardStage");
    assert.ok(preflight >= 0 && preflight < stop, "candidate must be validated before API downtime");
    assert.ok(secondPreflight > stop && secondPreflight < commit, "candidate must be revalidated after the API stops");
    assert.ok(commit < start && start < dashboard, "cutover ordering must be commit, API health, then dashboard maintenance");
    assert.match(actionBody, /\$preflightCandidate\s*=\s*Assert-PreparedUpdateReady/);
    assert.match(actionBody, /\$postStopCandidate\s*=\s*Assert-PreparedUpdateReady/);
    assert.match(actionBody, /Prepared update changed after API downtime began/);
    assert.match(actionBody, /Invoke-PreparedUpdateWhenStopped\s+-Candidate\s+\$preflightCandidate/);
    assert.match(actionBody, /dashboardPidDuring\s+-ne\s+\$dashboardPidBefore/);
    assert.match(actionBody, /catch\s*\{[\s\S]*Test-9RouterHealth[\s\S]*Start-9RouterWhenStopped\s+-SkipUpdate/);
    assert.match(actionBody, /API update committed successfully; dashboard maintenance was deferred/);
});

test("prepared-update cutover commits only the prevalidated candidate", () => {
    const controller = read("automation/9router-control.ps1");
    const helperStart = controller.indexOf("function Invoke-PreparedUpdateWhenStopped");
    const helperEnd = controller.indexOf("function Start-9RouterWhenStopped", helperStart);
    const helperBody = controller.slice(helperStart, helperEnd);

    assert.match(helperBody, /Assert-9RouterStopped/);
    assert.match(helperBody, /Assert-PreparedUpdateReady/);
    assert.match(helperBody, /Prepared update changed after the cutover preflight/);
    assert.match(helperBody, /Commit-PreparedUpdate\s+-Prepared\s+\$current/);
    assert.doesNotMatch(helperBody, /Get-LatestVersion|Prepare-UpdateCandidate/);
});

test("dashboard health uses a release endpoint and exact static asset probe", () => {
    const controller = read("automation/9router-control.ps1");
    const healthStart = controller.indexOf("function Test-DashboardStageHealth");
    const healthEnd = controller.indexOf("function Get-InstalledVersion", healthStart);
    const healthBody = controller.slice(healthStart, healthEnd);

    assert.match(healthBody, /\/_9router\/dashboard-health/);
    assert.match(healthBody, /uiProbePath/);
    assert.match(healthBody, /uiProbeHash/);
    assert.match(healthBody, /Accept-Encoding[^\r\n]+identity/i);
    assert.match(healthBody, /RawContentStream/);
    assert.doesNotMatch(healthBody, /\/dashboard\/quota/);
    assert.doesNotMatch(healthBody, /MaximumRedirection\s+5/i);
});

test("dashboard lifecycle health remains independent from API availability", () => {
    const controller = read("automation/9router-control.ps1");
    const healthStart = controller.indexOf("function Test-DashboardStageHealth");
    const healthEnd = controller.indexOf("function Get-InstalledVersion", healthStart);
    const healthBody = controller.slice(healthStart, healthEnd);

    assert.doesNotMatch(healthBody, /\/api\/health/);
    assert.doesNotMatch(healthBody, /x-9router-dashboard-proxy/i);
    assert.match(healthBody, /\/v1\/models/);
});

test("dashboard process output is retained per release for startup diagnostics", () => {
    const controller = read("automation/9router-control.ps1");
    const startStart = controller.indexOf("function Start-DashboardStage");
    const startEnd = controller.indexOf("function Restart-DashboardStage", startStart);
    const startBody = controller.slice(startStart, startEnd);

    assert.match(startBody, /RedirectStandardOutput/);
    assert.match(startBody, /RedirectStandardError/);
    assert.match(startBody, /dashboard-\$attemptId\.stdout\.log/i);
    assert.match(startBody, /dashboard-\$attemptId\.stderr\.log/i);
});

test("dashboard startup fails fast when the child process exits", () => {
    const controller = read("automation/9router-control.ps1");
    const startStart = controller.indexOf("function Start-DashboardStage");
    const startEnd = controller.indexOf("function Restart-DashboardStage", startStart);
    const startBody = controller.slice(startStart, startEnd);

    assert.match(startBody, /\$process\.Refresh\(\)/);
    assert.match(startBody, /\$process\.HasExited/);
    assert.match(startBody, /\$process\.ExitCode/);
});

test("dashboard stage fingerprint covers every runtime control input", () => {
    const controller = read("automation/9router-control.ps1");
    const fingerprintStart = controller.indexOf("function Get-DashboardStageFingerprint");
    const fingerprintEnd = controller.indexOf("function Get-DashboardStageState", fingerprintStart);
    const fingerprintBody = controller.slice(fingerprintStart, fingerprintEnd);

    assert.match(fingerprintBody, /schema=dashboard-stage-v2/);
    assert.match(fingerprintBody, /\$PatchScript/);
    assert.match(fingerprintBody, /\$DashboardStageServer/);
    assert.match(fingerprintBody, /\$ControlScript/);
    assert.match(fingerprintBody, /\$ConfigFile/);
    assert.match(controller, /stageFingerprint\s*=\s*Get-DashboardStageFingerprint/);
    assert.match(controller, /\$stage\.stageFingerprint\s+-ne\s+\$stageFingerprint/);
    assert.match(controller, /Assert-DashboardControllerSourcesCurrent/);
    assert.match(controller, /restart the central monitor before staging/i);
});

test("dashboard stage is patched under the automation work root without using cli.js", () => {
    const controller = read("automation/9router-control.ps1");
    const prepareStart = controller.indexOf("function Prepare-DashboardStage");
    const startStart = controller.indexOf("function Start-DashboardStage");
    const restartStart = controller.indexOf("function Restart-DashboardStage");

    assert.notEqual(prepareStart, -1, "Prepare-DashboardStage function is missing");
    assert.notEqual(startStart, -1, "Start-DashboardStage function is missing");
    assert.notEqual(restartStart, -1, "Restart-DashboardStage function is missing");

    const prepareBody = controller.slice(prepareStart, startStart);
    const startBody = controller.slice(startStart, restartStart);
    assert.match(prepareBody, /Invoke-PatchSet\s+-Scope\s+dashboard/i);
    assert.match(prepareBody, /AutomationRoot|DashboardStageWorkDir|DashboardWorkDir/i);
    assert.doesNotMatch(prepareBody, /-AppRoot\s+\(Join-Path\s+\$RouterRoot/i);
    assert.match(startBody, /dashboard-staging-server\.js/i);
    assert.doesNotMatch(startBody, /\$RouterCli|cli\.js|--tray/i);
});

test("dashboard stage preserves the package layout required by the patch runner", () => {
    const controller = read("automation/9router-control.ps1");
    const prepareStart = controller.indexOf("function Prepare-DashboardStage");
    const startStart = controller.indexOf("function Start-DashboardStage");
    const prepareBody = controller.slice(prepareStart, startStart);

    assert.match(prepareBody, /package\.json/i);
    assert.match(prepareBody, /Copy-Item[^\r\n]+package\.json/is);
});

test("dashboard patches remain available while the API listener is active", () => {
    const controller = read("automation/9router-control.ps1");
    const applyAction = controller.slice(controller.lastIndexOf('"ApplyPatches" {'));

    assert.match(applyAction, /\$Scope\s+-eq\s+["']dashboard["']/i);
    assert.match(applyAction, /Prepare-DashboardStage|StageDashboard|Invoke-Dashboard/i);
    assert.match(applyAction, /Get-PortListener/i);
});

test("central monitor maintains API and dashboard listeners independently", () => {
    const controller = read("automation/9router-control.ps1");
    const monitorStart = controller.indexOf("function Start-Monitor");
    const actionSwitch = controller.indexOf("switch ($Action)");
    const monitorBody = controller.slice(monitorStart, actionSwitch);

    assert.match(monitorBody, /Start-9RouterWhenStopped/i, "API maintenance is missing");
    assert.match(monitorBody, /Maintain-DashboardStage/i, "dashboard maintenance is missing");
    assert.match(controller, /Get-(?:Dashboard)?PortListener|Get-PortListener[^\r\n]*Dashboard/i);
});

test("supervisor preserves a live API listener", () => {
    const controller = read("automation/9router-control.ps1");
    const supervisorStart = controller.indexOf("function Start-9RouterWhenStopped");
    const supervisorEnd = controller.indexOf("function Restart-9RouterApi", supervisorStart);
    const supervisorBody = controller.slice(supervisorStart, supervisorEnd);

    assert.doesNotMatch(controller, /taskkill\s+\/IM\s+node\.exe/i);
    assert.doesNotMatch(supervisorBody, /Stop-Process/i);
    assert.match(controller, /--port/);
    assert.match(controller, /--skip-update/);
    assert.match(controller, /Get-NetTCPConnection/);
    assert.match(controller, /Global\\9router-central-maintenance/);
    assert.match(controller, /pendingVersion/i);
});

test("manual updater invokes the fixed portable Update action", () => {
    const updater = read("update-9router.bat");
    assert.doesNotMatch(updater, /taskkill/i);
    assert.doesNotMatch(updater, /npm\s+i(?:nstall)?\s+-g/i);
    assert.match(updater, /%~dp0automation[\\/]install-automation\.ps1/i);
    assert.match(updater, /-Action[ "']+Update/i);
    assert.doesNotMatch(updater, /%(?:\*|~?[1-9])/i);
});

test("legacy patch wrapper delegates to staged controller", () => {
    const wrapper = read("apply-patches.ps1");
    assert.match(wrapper, /9router-control\.ps1/i);
    assert.match(wrapper, /-Action\s+ApplyPatches/i);
    assert.match(wrapper, /-Scope\s+\$Scope/i);
    assert.doesNotMatch(wrapper, /npm\\node_modules\\9router\\app/i);
    assert.doesNotMatch(wrapper, /WriteAllText|Set-Content/i);
});

test("updates are staged and have an exact local rollback journal", () => {
    const controller = read("automation/9router-control.ps1");
    assert.match(controller, /npm.+pack|\$NpmCmd\s+pack/is);
    assert.match(controller, /update-transaction\.json/i);
    assert.match(controller, /prepared-update\.json/i);
    assert.match(controller, /Backup-GlobalInstall/);
    assert.match(controller, /Restore-GlobalInstallExact/);
    assert.match(controller, /Copy-Item\s+-LiteralPath\s+\$RouterRoot/i);
    assert.match(controller, /--app-root/);
    assert.match(controller, /\|\s*Out-Host/);
    assert.match(controller, /Stop-Managed9RouterProcessTree/);
    assert.match(controller, /runtime-starting/);
    assert.match(controller, /2>\s*\$packErrorFile/);
    assert.match(controller, /Invoke-TransactionalPatchSet/);
    const cleanup = controller.slice(
        controller.indexOf("function Complete-VerifiedUpdate"),
        controller.indexOf("function Mark-UpdateRuntimeStarting"),
    );
    assert.match(cleanup, /rolled-back/);
    assert.match(cleanup, /oldVersion/);
});

test("update candidate validates all patches before prepared state while the global install remains API-only", () => {
    const controller = read("automation/9router-control.ps1");
    const prepareStart = controller.indexOf("function Prepare-UpdateCandidate");
    const prepareEnd = controller.indexOf("function Set-TransactionPhase", prepareStart);
    const commitStart = controller.indexOf("function Commit-PreparedUpdate");
    const commitEnd = controller.indexOf("function Complete-VerifiedUpdate", commitStart);
    const updateStart = controller.indexOf("function Invoke-UpdateWhenStopped");
    const updateEnd = controller.indexOf("function Start-9RouterWhenStopped", updateStart);
    const prepareBody = controller.slice(prepareStart, prepareEnd);
    const candidatePreflight = prepareBody.search(/Invoke-PatchSet\s+-Scope\s+all\s+-AppRoot\s+\$candidateAppRoot/i);
    const preparedStateWrite = prepareBody.search(/Write-JsonState\s+-Path\s+\$PreparedUpdateFile/i);

    assert.notEqual(candidatePreflight, -1, "candidate must pass both API and dashboard patch validation");
    assert.notEqual(preparedStateWrite, -1, "candidate prepared state write is missing");
    assert.ok(candidatePreflight < preparedStateWrite, "prepared-update.json must be written only after full patch validation");
    assert.match(prepareBody, /validationSchema\s*=\s*["']all-patches-v1["']/i);
    assert.match(prepareBody, /patchScriptHash/i);
    assert.match(prepareBody, /Test-PreparedCandidateCurrent/i);
    assert.match(controller.slice(commitStart, commitEnd), /Invoke-PatchSet\s+-Scope\s+api\s+-AppRoot\s+\(Join-Path\s+\$RouterRoot/i);
    assert.match(controller.slice(commitStart, commitEnd), /Test-PreparedCandidateCurrent|sha512/i);
    assert.doesNotMatch(controller.slice(commitStart, commitEnd), /Invoke-PatchSet\s+-Scope\s+all/i);
    assert.doesNotMatch(controller.slice(updateStart, updateEnd), /Invoke-TransactionalPatchSet\s+-Scope\s+all/i);
    assert.match(controller, /Dashboard patches must target an isolated stage, never the global 9router app root/i);
});

test("cold-start update selection honors prepared pending state and the update config gate", () => {
    const controller = read("automation/9router-control.ps1");
    const updateStart = controller.indexOf("function Invoke-UpdateWhenStopped");
    const updateEnd = controller.indexOf("function Start-9RouterWhenStopped", updateStart);
    const updateBody = controller.slice(updateStart, updateEnd);

    assert.match(updateBody, /Config\.checkUpdateWhenStopped/i);
    assert.match(updateBody, /if\s*\(\$pendingVersion\)[\s\S]*elseif[\s\S]*\$latest/i);
    assert.match(updateBody, /\$pendingVersion\s*=\s*Get-PendingVersion[\s\S]*if\s*\(Get-PortListener\)[\s\S]*\$pendingVersion/i);
});

test("startup health confirmation requires a fresh central-monitor heartbeat", () => {
    const launcher = read("automation/start-9router-hidden.vbs");
    const installer = read("automation/install-automation.ps1");

    assert.match(launcher, /central-monitor\.json/i);
    assert.match(launcher, /DateLastModified|DateDiff/i);
    assert.match(installer, /heartbeatAt/i);
    assert.match(installer, /AddSeconds\(45\)/i);
});

test("prepared updates revalidate managed paths and tarball integrity before reuse", () => {
    const controller = read("automation/9router-control.ps1");
    assert.match(controller, /function\s+Test-PreparedCandidateCurrent\b/i);
    assert.match(controller, /Assert-UpdateWorkPath\s+-Path\s+\$Candidate\.(?:transactionRoot|tarball|appRoot)/i);
    assert.match(controller, /Get-FileHash\s+-LiteralPath\s+\$Candidate\.tarball\s+-Algorithm\s+SHA512/i);
});

test("API patch state fingerprints the version, patch runner, and patched target files", () => {
    const controller = read("automation/9router-control.ps1");
    const fingerprintStart = controller.indexOf("function Get-ApiPatchFingerprint");
    const stateCheckStart = controller.indexOf("function Test-ApiPatchStateCurrent");
    const transactionStart = controller.indexOf("function Invoke-TransactionalPatchSet");
    const transactionEnd = controller.indexOf("function Recover-InterruptedUpdate", transactionStart);

    assert.notEqual(
        controller.search(/\$ApiPatchStateFile\s*=\s*Join-Path\s+\$StateDir\s+["']api-patch-state\.json["']/i),
        -1,
        "api-patch-state.json path is missing",
    );
    assert.notEqual(fingerprintStart, -1, "Get-ApiPatchFingerprint is missing");
    assert.notEqual(stateCheckStart, -1, "Test-ApiPatchStateCurrent is missing");

    const fingerprintEnd = controller.indexOf("function ", fingerprintStart + "function ".length);
    const fingerprintBody = controller.slice(fingerprintStart, fingerprintEnd);
    assert.match(fingerprintBody, /schema=api-patch-state-v\d+/i);
    assert.match(fingerprintBody, /Get-InstalledVersion/i);
    assert.match(fingerprintBody, /\$PatchScript/);
    assert.match(fingerprintBody, /Get-FileHash/i);
    assert.match(fingerprintBody, /--list-targets|custom-server\.js/i);
    assert.match(fingerprintBody, /--list-targets|bulk-import/i);

    const stateCheckEnd = controller.indexOf("function ", stateCheckStart + "function ".length);
    const stateCheckBody = controller.slice(stateCheckStart, stateCheckEnd);
    assert.match(stateCheckBody, /Read-JsonState[^\r\n]+\$ApiPatchStateFile/i);
    assert.match(stateCheckBody, /Get-ApiPatchFingerprint/i);

    const transactionBody = controller.slice(transactionStart, transactionEnd);
    const patchRun = transactionBody.search(/Invoke-PatchSet\s+-Scope\s+\$Scope/i);
    const stateWrite = transactionBody.search(/Write-JsonState[^\r\n]+\$ApiPatchStateFile|Set-ApiPatchState/i);
    assert.notEqual(stateWrite, -1, "successful API patch transaction must persist the verified patch state");
    assert.ok(patchRun < stateWrite, "API patch state must not be written before patch validation succeeds");
});

test("unchanged cold start skips the API patch transaction only after fingerprint verification", () => {
    const controller = read("automation/9router-control.ps1");
    const updateStart = controller.indexOf("function Invoke-UpdateWhenStopped");
    const updateEnd = controller.indexOf("function Start-9RouterWhenStopped", updateStart);
    const updateBody = controller.slice(updateStart, updateEnd);
    const stateCheck = updateBody.search(/Test-ApiPatchStateCurrent/i);
    const patchTransactions = [...updateBody.matchAll(/Invoke-TransactionalPatchSet\s+-Scope\s+api/ig)];
    const patchTransaction = patchTransactions.at(-1)?.index ?? -1;

    assert.notEqual(stateCheck, -1, "cold start does not verify the persisted API patch fingerprint");
    assert.notEqual(patchTransaction, -1, "cold start API patch fallback is missing");
    assert.ok(stateCheck < patchTransaction, "patch-state verification must happen before the transaction can be skipped");
    assert.match(updateBody.slice(stateCheck, patchTransaction), /return\s+0/i, "matching patch state must be the only fast path");
});

test("patch or update failure blocks the API process launch", () => {
    const controller = read("automation/9router-control.ps1");
    const startStart = controller.indexOf("function Start-9RouterWhenStopped");
    const startEnd = controller.indexOf("function Restart-9RouterApi", startStart);
    const startBody = controller.slice(startStart, startEnd);
    const updateResult = startBody.match(/\$([A-Za-z_]\w*)\s*=\s*Invoke-UpdateWhenStopped\b/i);

    assert.ok(updateResult, "Start-9RouterWhenStopped discards the update/patch result");
    const updateCall = startBody.indexOf(updateResult[0]);
    const processLaunch = startBody.indexOf("Start-Process", updateCall);
    const preLaunchGuard = startBody.slice(updateCall + updateResult[0].length, processLaunch);
    const resultName = updateResult[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(preLaunchGuard, new RegExp(`\\$${resultName}\\s+-ne\\s+0|if\\s*\\(\\s*-not\\s+\\$${resultName}`, "i"));
    assert.match(preLaunchGuard, /return\s+\$false|throw\b/i, "a failed patch/update must stop before Start-Process");
});

test("healthy API listener requires current patch state before it is preserved", () => {
    const controller = read("automation/9router-control.ps1");
    const startStart = controller.indexOf("function Start-9RouterWhenStopped");
    const startEnd = controller.indexOf("function Restart-9RouterApi", startStart);
    const startBody = controller.slice(startStart, startEnd);
    const healthStart = startBody.indexOf("if (Test-9RouterHealth)");
    const preserved = startBody.indexOf("preserving PID", healthStart);
    const healthyBranch = startBody.slice(healthStart, preserved);

    assert.notEqual(healthStart, -1, "healthy-listener branch is missing");
    assert.notEqual(preserved, -1, "healthy-listener preservation log is missing");
    assert.match(healthyBranch, /Test-ApiPatchStateCurrent/i, "process path and health alone must not prove patches are current");
});

test("stale central monitors are identified by source hashes without restarting API or dashboard", () => {
    const controller = read("automation/9router-control.ps1");
    const installer = read("automation/install-automation.ps1");

    assert.match(controller, /MonitorStateFile\s*=\s*Join-Path\s+\$StateDir\s+["']central-monitor\.json["']/i);
    assert.match(controller, /Write-MonitorState|monitor.*heartbeat/i);
    assert.match(controller, /LoadedControlHash/);
    assert.match(controller, /LoadedConfigHash/);
    assert.match(installer, /central-monitor\.json/i);
    assert.match(installer, /Get-FileHash[^\r\n]+ControlScript/i);
    assert.match(installer, /Terminate/);
    assert.doesNotMatch(installer, /Stop-Managed9RouterProcessTree/);
});

test("ApplyPatches rechecks the stopped invariant inside the maintenance lock", () => {
    const controller = read("automation/9router-control.ps1");
    const applyAction = controller.slice(controller.lastIndexOf('"ApplyPatches" {'));
    assert.match(applyAction, /Invoke-MaintenanceOperation/);
    assert.match(applyAction, /Assert-9RouterStopped/);
    assert.match(applyAction, /Invoke-TransactionalPatchSet\s+-Scope\s+api/);
    assert.match(applyAction, /\$Scope\s+-eq\s+["']dashboard["']/i);
});

test("patch runner separates dashboard and API scopes", () => {
    const patchRunner = read("apply-patches.js");
    const controller = read("automation/9router-control.ps1");
    assert.match(patchRunner, /--scope/);
    assert.match(patchRunner, /--list-targets/);
    assert.match(patchRunner, /--scope-hash/);
    assert.match(patchRunner, /scope:\s*['"]api['"]/);
    assert.match(patchRunner, /scope:\s*['"]dashboard['"]/);
    assert.match(patchRunner, /experimental:\s*true/);
    assert.match(controller, /ValidateSet\("all",\s*"api",\s*"dashboard"\)/i);
    assert.match(controller, /Invoke-PatchSet\s+-Scope\s+\$Scope/i);
});

test("API patch validation runs the Bulk Add normalizer regression suite", () => {
    const controller = read("automation/9router-control.ps1");
    const patchSetStart = controller.indexOf("function Invoke-PatchSet");
    const patchSetEnd = controller.indexOf("function Get-PreparedUpdate", patchSetStart);
    const patchSetBody = controller.slice(patchSetStart, patchSetEnd);

    assert.match(controller, /\$BulkImportNormalizerTest\s*=/);
    assert.match(patchSetBody, /\$tests\s*\+=\s*\$BulkImportNormalizerTest/);
});

test("dashboard-only patch edits do not invalidate the API patch fingerprint", () => {
    const patchRunner = read("apply-patches.js");
    const controller = read("automation/9router-control.ps1");
    assert.match(patchRunner, /definition\.scope === requestedScopeHash/);
    assert.match(patchRunner, /definition\.run\.toString\(\)/);
    assert.match(controller, /--scope-hash api/);
    assert.match(controller, /schema=api-patch-state-v2/);
});

test("API patch owns the legacy dashboard redirect contract", () => {
    const patchRunner = read("apply-patches.js");
    const controller = read("automation/9router-control.ps1");

    assert.match(patchRunner, /function\s+patchApiDashboardRedirect\b/);
    assert.match(patchRunner, /scope:\s*['"]api['"][^\r\n]+custom-server\.js/i);
    assert.match(patchRunner, /x-9router-dashboard-redirect/);
    assert.match(controller, /api-gateway\.test\.js/i);
});

test("patch runner refuses an implicit global app root", () => {
    const result = childProcess.spawnSync(
        process.execPath,
        [path.join(root, "apply-patches.js"), "--scope", "dashboard"],
        { encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to patch an implicit global install/i);
    assert.match(result.stderr, /--app-root/);
});

test("dashboard patch targets never include API bundles", () => {
    const output = childProcess.execFileSync(
        process.execPath,
        [path.join(root, "apply-patches.js"), "--list-targets"],
        { encoding: "utf8" },
    );
    const definitions = JSON.parse(output);
    const dashboardTargets = definitions
        .filter((definition) => definition.scope === "dashboard")
        .flatMap((definition) => definition.targets);

    assert.ok(dashboardTargets.length > 0);
    assert.equal(dashboardTargets.some((target) => /(^|\/)api(\/|$)/i.test(target)), false);
    assert.equal(definitions.find((definition) => definition.id === 15).experimental, true);
});

test("default dashboard patch flow repairs the experimental SSR bypass", () => {
    const patchRunner = read("apply-patches.js");
    assert.match(patchRunner, /restoreServerSsrBypass/);
    assert.doesNotMatch(patchRunner, /scan\(BUILD\)/);
    assert.match(patchRunner, /const suspenseAnchor = 'fallback:\(0,d\.jsx\)\(f\.CardSkeleton,\{\}\),'/);
    assert.match(patchRunner, /children:null\}\)`/);
});

test("migration inventories the complete legacy daemon and 9router scratch helpers", () => {
    const installer = read("automation/install-automation.ps1");
    assert.match(installer, /\$LegacyDaemonFiles\s*=\s*@\(/i);
    assert.match(installer, /\$LegacyScratchFiles\s*=\s*@\(/i);
    assert.doesNotMatch(installer, /Get-ChildItem\s+-LiteralPath\s+\$daemonDir\s+-Force\s+-File/i);
    assert.doesNotMatch(installer, /scratchControlPattern/i);
    assert.match(installer, /Join-Path\s+\$daemonDir\s+["']monitor_task\.ps1["']/i);
    assert.match(installer, /listenerBefore\.OwningProcess\s+-ne\s+\$listenerAfter\.OwningProcess/i);
    assert.match(installer, /Get-Process\s+-Id\s+\$_\.ProcessId/i);
    assert.match(installer, /\$legacyMonitorDeadline/);
    assert.match(installer, /Invoke-CimMethod.+-MethodName\s+Terminate/i);
    assert.match(installer, /Restore-LegacyMigration/i);
    assert.match(installer, /CentralMonitorPidsBefore/i);
});

test("Startup writers preserve Unicode patch-root paths", () => {
    assert.match(read("automation/install-automation.ps1"), /Set-Content[^\r\n]+\$StartupFile[^\r\n]+-Encoding\s+Unicode/i);
    const controller = read("automation/9router-control.ps1");
    const ensureStart = controller.indexOf("function Ensure-StartupLauncher");
    const ensureEnd = controller.indexOf("function Invoke-PatchSet", ensureStart);
    assert.match(controller.slice(ensureStart, ensureEnd), /-Encoding\s+Unicode/i);
});

test("process ownership uses exact path and action tokens", () => {
    const installer = read("automation/install-automation.ps1");
    const centralStart = installer.indexOf("function Get-CentralMonitors");
    const centralEnd = installer.indexOf("function Test-CurrentRootInstalled", centralStart);
    const central = installer.slice(centralStart, centralEnd);
    assert.match(central, /Test-CommandLineReferencesExactPath[^\r\n]+\$ControlScript/i);
    assert.match(central, /Test-CommandLineHasExactAction[^\r\n]+Monitor/i);
    assert.doesNotMatch(central, /-Action\\s\+Monitor/);

    const controller = read("automation/9router-control.ps1");
    const listener = controller.slice(
        controller.indexOf("function Test-ExpectedListener"),
        controller.indexOf("function Test-Endpoint"),
    );
    assert.match(listener, /Test-CommandLineReferencesExactPath/i);
    assert.doesNotMatch(listener, /CommandLine\s+-like/i);

    const processTree = controller.slice(
        controller.indexOf("function Assert-9RouterStopped"),
        controller.indexOf("function Invoke-MaintenanceOperation"),
    );
    assert.match(processTree, /Test-CommandLineReferencesPathUnderRoot/i);
    assert.doesNotMatch(processTree, /\[regex\]::Escape\(\$RouterRoot\)/i);
});

test("managed process stop tolerates a process that exits before CIM termination", () => {
    const controller = read("automation/9router-control.ps1");
    const stopStart = controller.indexOf("function Stop-Managed9RouterProcessTree");
    const stopEnd = controller.indexOf("function Invoke-MaintenanceOperation", stopStart);
    const stopBody = controller.slice(stopStart, stopEnd);

    assert.match(stopBody, /try\s*\{[\s\S]*Invoke-CimMethod[\s\S]*\}\s*catch\s*\{/i);
    assert.match(stopBody, /catch\s*\{[\s\S]*Get-Process\s+-Id\s+\$target\.ProcessId[\s\S]*continue/i);
    assert.match(stopBody, /if\s*\(\$termination\.ReturnValue\s+-ne\s+0\)[\s\S]*Get-Process\s+-Id\s+\$target\.ProcessId/i);
});

test("migration rollback preserves legacy monitor state and Unicode bytes", () => {
    const installer = read("automation/install-automation.ps1");
    assert.match(installer, /LegacyMonitorPidsBefore/i);
    assert.match(installer, /centralMonitorStopped/i);
    assert.match(installer, /LegacyMonitorPidsBefore[\s\S]{0,300}centralMonitorStopped/i);
    assert.match(installer, /function\s+Test-Utf16LeBom/i);

    const controller = read("automation/9router-control.ps1");
    assert.match(controller, /function\s+Test-Utf16LeBom/i);
    assert.match(controller, /Test-Utf16LeBom[^\r\n]+\$StartupFile/i);
});
