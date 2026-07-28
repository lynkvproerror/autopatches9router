"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const batchInstaller = path.join(root, "install-9router.bat");
const powershellInstaller = path.join(root, "automation", "install-automation.ps1");
const generatedAutomationDirs = new Set([
    "automation/__pycache__",
    "automation/legacy-backup",
    "automation/logs",
    "automation/state",
    "automation/work",
]);

function read(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function copyPortableSource(destination) {
    fs.cpSync(root, destination, {
        recursive: true,
        filter(sourcePath) {
            const relativePath = path.relative(root, sourcePath).replaceAll("\\", "/");
            return ![...generatedAutomationDirs].some(
                (generatedDir) => relativePath === generatedDir || relativePath.startsWith(generatedDir + "/"),
            );
        },
    });
}

function listRelativeFiles(directory) {
    const files = [];
    const visit = (currentDirectory) => {
        for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
            const fullPath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
            } else {
                files.push(path.relative(directory, fullPath).replaceAll("\\", "/"));
            }
        }
    };
    visit(directory);
    return files.sort();
}

test("root installer is relocatable and delegates all work to the central PowerShell installer", () => {
    assert.ok(fs.existsSync(batchInstaller), "install-9router.bat is missing from the portable folder root");

    const launcher = read(batchInstaller);
    assert.match(launcher, /%~dp0/i, "the launcher must resolve files relative to its copied folder");
    assert.match(launcher, /automation[\\/]install-automation\.ps1/i);
    assert.match(launcher, /-File/i);
    assert.match(launcher, /\bchoice\b/i, "the lifecycle launcher must use a fixed interactive menu");
    assert.doesNotMatch(launcher, /%(?:\*|~?[1-9])/i, "the launcher must not parse arbitrary cmd.exe arguments");
    for (const action of ["Install", "Update", "Start", "Check", "Repair", "Validate"]) {
        assert.match(launcher, new RegExp("\\b" + action + "\\b", "i"), action + " is not allowlisted");
    }
    assert.match(launcher, /-DryRun/i);
    assert.doesNotMatch(launcher, /[A-Z]:\\Music\\Ruby\\Produce for Customer/i);
});

test("batch launchers use fixed actions without forwarding command-line data", () => {
    for (const [fileName, action] of [
        ["update-9router.bat", "Update"],
        ["start-9router.bat", "Start"],
        ["check-9router.bat", "Check"],
        ["repair-9router.bat", "Repair"],
    ]) {
        const launcher = read(path.join(root, fileName));
        assert.match(launcher, new RegExp("-Action[ \\\"']+" + action, "i"));
        assert.doesNotMatch(launcher, /%(?:\*|~?[1-9])/i);
    }
});

test("central installer exposes complete lifecycle actions and checks local prerequisites", () => {
    assert.ok(fs.existsSync(powershellInstaller), "automation/install-automation.ps1 is missing");

    const installer = read(powershellInstaller);
    for (const action of ["Install", "Update", "Start", "Check"]) {
        assert.match(
            installer,
            new RegExp("ValidateSet\\([^)]*['\\\"]" + action + "['\\\"]", "is"),
            action + " action is missing",
        );
    }
    assert.match(installer, /\[switch\]\s*\$DryRun/i);
    assert.match(installer, /\$PSVersionTable|Get-Host/i, "PowerShell compatibility is not checked");
    assert.match(installer, /Get-Command[^\r\n]+node(?:\.exe)?/i, "Node.js prerequisite discovery is missing");
    assert.match(installer, /Get-Command[^\r\n]+npm(?:\.cmd)?/i, "npm prerequisite discovery is missing");
    assert.match(installer, /throw|exit\s+[1-9]/i, "missing prerequisites must produce a failing result");
});

test("install and update use upstream global 9router while durable patches stay owned by this folder", () => {
    const installer = read(powershellInstaller);

    assert.match(installer, /npm(?:\.cmd)?|\$Npm\w*/i);
    assert.match(installer, /(?:install|update)[\s\S]{0,160}-g[\s\S]{0,80}9router/i);
    assert.match(installer, /(?:npm(?:\.cmd)?|\$Npm\w*)[\s\S]{0,100}root[\s\S]{0,40}-g/i);
    assert.match(installer, /\$PatchRoot/i);
    assert.match(installer, /apply-patches\.js|9router-control\.ps1/i);
    assert.match(installer, /(?:-Scope\s+|['"])api\b/i, "API patches are not part of the install/update contract");
    assert.match(
        installer,
        /(?:-Scope\s+|['"])dashboard\b|StageDashboard/i,
        "dashboard patches are not part of the install/update contract",
    );
    assert.doesNotMatch(installer, /D:\\Music\\Ruby\\Produce for Customer/i);
});

test("migration and repair are bounded, reversible, and preflight the live runtime", () => {
    const installer = read(powershellInstaller);

    assert.match(installer, /\$LegacyDaemonFiles\s*=\s*@\(/i);
    assert.match(installer, /\$LegacyScratchFiles\s*=\s*@\(/i);
    assert.doesNotMatch(installer, /Get-ChildItem\s+-LiteralPath\s+\$daemonDir\s+-Force\s+-File/i);
    assert.doesNotMatch(installer, /scratchControlPattern/i);
    assert.match(installer, /function\s+Restore-LegacyMigration/i);
    assert.match(installer, /Register-ScheduledTask/i);
    assert.match(installer, /function\s+Assert-NoForeignCentralMonitor/i);
    assert.match(installer, /function\s+Test-RunningApiPatchContract/i);
    assert.match(installer, /function\s+Test-UpstreamPackageIntegrity/i);
    assert.match(installer, /npm install -g 9router@latest --force|install\s+-g\s+9router@latest\s+--force/i);
    assert.match(installer, /CentralMonitorPidsBefore/i);
    assert.match(installer, /Copy-Item[\s\S]{0,160}\$item\.Source/i);
    assert.match(installer, /Join-Path\s+\$daemonDir\s+["']monitor_task\.ps1["']/i);
    assert.doesNotMatch(installer, /monitor_task\\\.ps1\|monitor_9router\\\.ps1/i);
    assert.match(installer, /Test-UpstreamPackageIntegrity[\s\S]{0,100}-and\s+-not\s+\$ForceRepair/i);
    assert.match(installer, /Set-Content[\s\S]{0,100}-Encoding\s+Unicode/i);

    const installBranch = installer.slice(installer.indexOf('"Install" {'), installer.indexOf('"Update" {'));
    assert.ok(
        installBranch.indexOf("Test-RunningApiPatchContract") < installBranch.indexOf("Begin-LegacyMigration"),
        "Install mutates migration state before validating the running API",
    );
    assert.match(installBranch, /try\s*\{[\s\S]*catch\s*\{[\s\S]*Restore-LegacyMigration/i);
});

test("installation creates a machine-relative Startup entry and starts the central monitor", () => {
    const installer = read(powershellInstaller);

    assert.match(installer, /\$env:APPDATA/i);
    assert.match(installer, /Microsoft[\\/]Windows[\\/]Start Menu[\\/]Programs[\\/]Startup/i);
    assert.match(installer, /9router\.(?:vbs|lnk)/i);
    assert.match(installer, /\$AutomationRoot|\$PatchRoot/i);
    assert.match(installer, /start-9router-hidden\.vbs|9router-control\.ps1[\s\S]{0,120}(?:-Action\s+)?Monitor/i);
    assert.match(installer, /Start-Process|WScript\.Shell/i);
    assert.doesNotMatch(installer, /D:\\Music\\Ruby\\Produce for Customer/i);
});

test("copied portable source passes Check dry-run without generated runtime directories or mutations", (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "9router-portable-test-"));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const portableRoot = path.join(tempRoot, "copied 9router-patches");
    copyPortableSource(portableRoot);
    for (const generatedDir of generatedAutomationDirs) {
        assert.equal(
            fs.existsSync(path.join(portableRoot, generatedDir)),
            false,
            generatedDir + " leaked into portable source",
        );
    }

    const filesBefore = listRelativeFiles(portableRoot);
    const result = childProcess.spawnSync(
        "powershell.exe",
        [
            "-NoLogo",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(portableRoot, "automation", "install-automation.ps1"),
            "-Action",
            "Check",
            "-DryRun",
        ],
        { encoding: "utf8", timeout: 30000 },
    );

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    assert.match(result.stdout + "\n" + result.stderr, /node/i);
    assert.match(result.stdout + "\n" + result.stderr, /npm/i);
    assert.match(result.stdout + "\n" + result.stderr, /PowerShell/i);
    assert.deepEqual(listRelativeFiles(portableRoot), filesBefore, "Check -DryRun mutated the copied source folder");
    for (const generatedDir of generatedAutomationDirs) {
        assert.equal(
            fs.existsSync(path.join(portableRoot, generatedDir)),
            false,
            generatedDir + " was required or generated by dry-run",
        );
    }
});

test("copied full folder plans a safe reset of machine-specific runtime data", (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "9router-copied-runtime-test-"));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const portableRoot = path.join(tempRoot, "copied full 9router-patches");
    copyPortableSource(portableRoot);
    for (const generatedDir of generatedAutomationDirs) {
        const directory = path.join(portableRoot, generatedDir);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "old-machine.txt"), "D:\\old-machine\\runtime\n");
    }

    const filesBefore = listRelativeFiles(portableRoot);
    const result = childProcess.spawnSync(
        "powershell.exe",
        [
            "-NoLogo",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(portableRoot, "automation", "install-automation.ps1"),
            "-Action",
            "Install",
            "-DryRun",
        ],
        { encoding: "utf8", timeout: 30000 },
    );

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    assert.match(result.stdout, /Detected a copied folder/i);
    for (const generatedDir of generatedAutomationDirs) {
        assert.match(result.stdout, new RegExp(generatedDir.split("/").at(-1), "i"));
    }
    assert.deepEqual(listRelativeFiles(portableRoot), filesBefore, "Install -DryRun mutated copied runtime data");
});
