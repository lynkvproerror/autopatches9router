[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("Install", "Update", "Start", "Check", "Repair", "Validate")]
    [string]$Action = "Install",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$AutomationRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PatchRoot = Split-Path -Parent $AutomationRoot
$ControlScript = Join-Path $AutomationRoot "9router-control.ps1"
$ControlConfig = Join-Path $AutomationRoot "9router-control.json"
$MonitorStateFile = Join-Path $AutomationRoot "state\central-monitor.json"
$HiddenLauncher = Join-Path $AutomationRoot "start-9router-hidden.vbs"
$StartupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$StartupFile = Join-Path $StartupDir "9router.vbs"
$RouterDataDir = Join-Path $env:APPDATA "9router"
$DefaultNpmPrefix = Join-Path $env:APPDATA "npm"
$DefaultNpmRoot = Join-Path $DefaultNpmPrefix "node_modules"
$GeneratedRuntimeNames = @("state", "logs", "work", "legacy-backup", "__pycache__")
$LegacyDaemonFiles = @(
    "start_9router_hidden.vbs",
    "monitor_task_hidden.vbs",
    "monitor_task.ps1",
    "monitor_9router.ps1",
    "restart_daemon.ps1",
    "register_daemon_task.ps1",
    "check_status.ps1",
    "test_http.ps1"
)
$LegacyScratchFiles = @(
    "verify_9router_health.py",
    "search_9router.py"
)
$RequiredSourceFiles = @(
    "install-9router.bat",
    "update-9router.bat",
    "start-9router.bat",
    "check-9router.bat",
    "repair-9router.bat",
    "apply-patches.ps1",
    "apply-patches.js",
    "default-account-routing.js",
    "default-account-routing.test.js",
    "provider-detail-patch.js",
    "provider-detail-patch.test.js",
    "update-shim-cutover.test.js",
    "automation\9router-control.ps1",
    "automation\9router-control.json",
    "automation\dashboard-staging-server.js",
    "automation\install-automation.ps1",
    "automation\README.md",
    "automation\start-9router-hidden.vbs",
    "automation\verify-9router-health.py"
)

function Write-Step {
    param([string]$Message)
    Write-Output "[9router] $Message"
}

function Get-CommandInfo {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { return $command }
    }
    return $null
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Assert-SourceBundle {
    $missing = @($RequiredSourceFiles | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $PatchRoot $_))
    })
    if ($missing.Count -gt 0) {
        throw "Portable source bundle is incomplete: $($missing -join ', ')"
    }
}

function Get-PrerequisiteState {
    [pscustomobject]@{
        PowerShellVersion = $PSVersionTable.PSVersion.ToString()
        PowerShell7 = Get-CommandInfo -Names @("pwsh.exe", "pwsh")
        Node = Get-CommandInfo -Names @("node.exe", "node")
        Npm = Get-CommandInfo -Names @("npm.cmd", "npm")
        Winget = Get-CommandInfo -Names @("winget.exe", "winget")
    }
}

function Show-PrerequisiteState {
    param([object]$State)
    Write-Output "PowerShell runtime: $($State.PowerShellVersion)"
    Write-Output "PowerShell 7: $(if ($State.PowerShell7) { $State.PowerShell7.Source } else { 'missing' })"
    Write-Output "node: $(if ($State.Node) { $State.Node.Source } else { 'missing' })"
    Write-Output "npm: $(if ($State.Npm) { $State.Npm.Source } else { 'missing' })"
}

function Ensure-NodePrerequisites {
    $state = Get-PrerequisiteState
    if ($state.Node -and $state.Npm) { return $state }
    if ($DryRun) {
        throw "Node.js and npm are required; Install without -DryRun can bootstrap Node.js through winget."
    }
    if (-not $state.Winget) {
        throw "Node.js or npm is missing and winget is unavailable. Install Node.js LTS, then run Install again."
    }
    Write-Step "Installing Node.js LTS through winget."
    & $state.Winget.Source install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed with exit code $LASTEXITCODE." }
    Refresh-ProcessPath
    $state = Get-PrerequisiteState
    if (-not $state.Node -or -not $state.Npm) {
        throw "Node.js installation finished but node/npm are not available in PATH. Open a new terminal and retry."
    }
    return $state
}

function Get-PwshPath {
    $command = Get-CommandInfo -Names @("pwsh.exe", "pwsh")
    if (-not $command) { throw "PowerShell 7 is required. Run install-9router.bat Install to bootstrap it." }
    return $command.Source
}

function Get-NpmLayout {
    param([object]$NpmCommand, [switch]$RepairDefaultPrefix)

    $prefix = (& $NpmCommand.Source prefix -g | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $prefix) { throw "npm prefix -g failed." }
    if (-not ([IO.Path]::GetFullPath($prefix).TrimEnd('\').Equals(
        [IO.Path]::GetFullPath($DefaultNpmPrefix).TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase
    ))) {
        if (-not $RepairDefaultPrefix) {
            throw "npm global prefix is '$prefix'; 9router requires the Windows default '$DefaultNpmPrefix'."
        }
        if ($DryRun) {
            Write-Step "Dry-run: npm config set prefix $DefaultNpmPrefix"
        } else {
            & $NpmCommand.Source config set prefix $DefaultNpmPrefix
            if ($LASTEXITCODE -ne 0) { throw "Could not set the default npm global prefix." }
            $env:Path = "$DefaultNpmPrefix;$env:Path"
        }
    }

    $root = (& $NpmCommand.Source root -g | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $root) { throw "npm root -g failed." }
    if (-not ([IO.Path]::GetFullPath($root).TrimEnd('\').Equals(
        [IO.Path]::GetFullPath($DefaultNpmRoot).TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase
    ))) {
        if ($DryRun -and $RepairDefaultPrefix) {
            $root = $DefaultNpmRoot
        } else {
            throw "npm root -g resolved to '$root', expected '$DefaultNpmRoot'."
        }
    }
    return [pscustomobject]@{
        Prefix = $DefaultNpmPrefix
        Root = $root
        RouterRoot = Join-Path $root "9router"
    }
}

function Invoke-Controller {
    param(
        [string]$ControllerAction,
        [string]$Scope,
        [switch]$AllowDeferred
    )
    $arguments = @(
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", $ControlScript, "-Action", $ControllerAction
    )
    if ($Scope) { $arguments += @("-Scope", $Scope) }
    & (Get-PwshPath) @arguments | Out-Host
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not ($AllowDeferred -and $exitCode -eq 2)) {
        throw "Controller action $ControllerAction failed with exit code $exitCode."
    }
    return $exitCode
}

function Get-CentralMonitors {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
            (Test-CommandLineReferencesExactPath -CommandLine $_.CommandLine -ResolvedPath $ControlScript) -and
            (Test-CommandLineHasExactAction -CommandLine $_.CommandLine -Action "Monitor") -and
            (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
    })
}

function Get-AllCentralMonitors {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
            (Test-CommandLineReferencesScriptName -CommandLine $_.CommandLine -ScriptName "9router-control.ps1") -and
            (Test-CommandLineHasExactAction -CommandLine $_.CommandLine -Action "Monitor") -and
            (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
    })
}

function Assert-NoForeignCentralMonitor {
    $foreign = @(Get-AllCentralMonitors | Where-Object {
        -not (Test-CommandLineReferencesExactPath -CommandLine $_.CommandLine -ResolvedPath $ControlScript)
    })
    if ($foreign.Count -gt 0) {
        $details = ($foreign | ForEach-Object { "PID $($_.ProcessId): $($_.CommandLine)" }) -join "; "
        throw "Another patch-root monitor is active. Stop it before installing from this folder: $details"
    }
}

function Test-CurrentRootInstalled {
    if ((Get-CentralMonitors).Count -gt 0) { return $true }
    if (Test-Path -LiteralPath $StartupFile) {
        $startupContent = Get-Content -Raw -LiteralPath $StartupFile
        return $startupContent.IndexOf($AutomationRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    return $false
}

function Assert-AutomationChildPath {
    param([string]$Path)
    $root = [IO.Path]::GetFullPath($AutomationRoot).TrimEnd('\')
    $resolved = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not $resolved.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Generated path escaped the automation root: $resolved"
    }
}

function Reset-CopiedRuntimeIfNeeded {
    if (Test-CurrentRootInstalled) { return }
    $generatedPaths = @($GeneratedRuntimeNames | ForEach-Object { Join-Path $AutomationRoot $_ })
    $existing = @($generatedPaths | Where-Object { Test-Path -LiteralPath $_ })
    if ($existing.Count -eq 0) { return }

    Write-Step "Detected a copied folder; machine-specific state/log/work data will be reset."
    foreach ($path in $existing) {
        Assert-AutomationChildPath -Path $path
        if ($DryRun) {
            Write-Step "Dry-run: remove generated runtime path $path"
        } else {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}

function Test-UpstreamPackageIntegrity {
    param([object]$Layout)
    foreach ($relativePath in @("package.json", "cli.js", "app\custom-server.js", "app\server.js")) {
        if (-not (Test-Path -LiteralPath (Join-Path $Layout.RouterRoot $relativePath))) { return $false }
    }
    return $true
}

function Install-UpstreamPackageIfMissing {
    param([object]$NpmCommand, [object]$Layout, [switch]$ForceRepair)
    if ((Test-UpstreamPackageIntegrity -Layout $Layout) -and -not $ForceRepair) {
        Write-Step "Upstream 9router is already installed at $($Layout.RouterRoot)."
        return
    }
    if ($DryRun) {
        $suffix = if ($ForceRepair) { " --force" } else { "" }
        Write-Step "Dry-run: npm install -g 9router@latest$suffix"
        return
    }
    $apiListener = Get-NetTCPConnection -State Listen -LocalPort 53220 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($apiListener) { throw "The upstream package cannot be installed or repaired while API port 53220 is active; stop the API first." }
    Write-Step "Installing upstream 9router in the default global npm location."
    if ($ForceRepair) {
        & $NpmCommand.Source install -g 9router@latest --force
    } else {
        & $NpmCommand.Source install -g 9router@latest
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install -g 9router failed with exit code $LASTEXITCODE." }
    if (-not (Test-UpstreamPackageIntegrity -Layout $Layout)) {
        throw "9router was not installed at the expected location: $($Layout.RouterRoot)"
    }
}

function Write-StartupLauncher {
    $startupContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wscript.exe ""$HiddenLauncher""", 0, False
"@
    if ($DryRun) {
        Write-Step "Dry-run: write managed Startup launcher $StartupFile"
        return
    }
    New-Item -ItemType Directory -Force -Path $StartupDir | Out-Null
    $current = if (Test-Path -LiteralPath $StartupFile) { Get-Content -Raw -LiteralPath $StartupFile } else { "" }
    if ($current.Trim() -ne $startupContent.Trim() -or -not (Test-Utf16LeBom -Path $StartupFile)) {
        Set-Content -LiteralPath $StartupFile -Value $startupContent -Encoding Unicode
    }
}

function Test-Utf16LeBom {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $bytes = [IO.File]::ReadAllBytes($Path)
    return $bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE
}

function Test-CommandLineReferencesExactPath {
    param([string]$CommandLine, [string]$ResolvedPath)
    if (-not $CommandLine -or -not $ResolvedPath) { return $false }
    $pattern = '(?i)(?:^|[\s"])' + [regex]::Escape($ResolvedPath) + '(?:$|[\s"])'
    return $CommandLine -match $pattern
}

function Test-CommandLineReferencesScriptName {
    param([string]$CommandLine, [string]$ScriptName)
    if (-not $CommandLine -or -not $ScriptName) { return $false }
    $pattern = '(?i)(?:^|[\s"])(?:[^"]*[\\/])?' + [regex]::Escape($ScriptName) + '(?=$|[\s"])'
    return $CommandLine -match $pattern
}

function Test-CommandLineHasExactAction {
    param([string]$CommandLine, [string]$Action)
    if (-not $CommandLine -or -not $Action) { return $false }
    $pattern = '(?i)(?:^|\s)-Action(?:\s+|=)"?' + [regex]::Escape($Action) + '"?(?=$|\s)'
    return $CommandLine -match $pattern
}

function Get-ActiveLegacyMonitors {
    $daemonDir = Join-Path $RouterDataDir "daemon"
    $monitorPaths = @(
        [IO.Path]::GetFullPath((Join-Path $daemonDir "monitor_task.ps1")),
        [IO.Path]::GetFullPath((Join-Path $daemonDir "monitor_9router.ps1"))
    )
    @(Get-CimInstance Win32_Process | Where-Object {
        $commandLine = $_.CommandLine
        $legacyPath = $monitorPaths | Where-Object {
            Test-CommandLineReferencesExactPath -CommandLine $commandLine -ResolvedPath $_
        } | Select-Object -First 1
        $legacyPath -and (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
    })
}

function Get-LegacySourceFiles {
    $items = @()
    $daemonDir = Join-Path $RouterDataDir "daemon"
    foreach ($name in $LegacyDaemonFiles) {
        $path = Join-Path $daemonDir $name
        if (Test-Path -LiteralPath $path) {
            $items += [pscustomobject]@{ Source = $path; Group = "appdata-daemon"; Name = $name }
        }
    }
    $scratchDir = Join-Path $env:USERPROFILE ".gemini\antigravity\scratch"
    foreach ($name in $LegacyScratchFiles) {
        $path = Join-Path $scratchDir $name
        if (Test-Path -LiteralPath $path) {
            $items += [pscustomobject]@{ Source = $path; Group = "antigravity-scratch"; Name = $name }
        }
    }
    return @($items)
}

function Restore-LegacyMigration {
    param([object]$Context)
    if (-not $Context) { return }

    $rollbackErrors = [Collections.Generic.List[string]]::new()
    $centralMonitorStopped = $true
    try {
        $centralMonitorPidsBefore = @($Context.CentralMonitorPidsBefore)
        $newCentralMonitors = @(Get-CentralMonitors | Where-Object {
            $centralMonitorPidsBefore -notcontains [int]$_.ProcessId
        })
        foreach ($monitor in $newCentralMonitors) {
            $termination = Invoke-CimMethod -InputObject $monitor -MethodName Terminate -Arguments @{ Reason = 0 }
            if ($termination.ReturnValue -ne 0 -and (Get-Process -Id $monitor.ProcessId -ErrorAction SilentlyContinue)) {
                throw "Could not stop transaction-created central monitor PID $($monitor.ProcessId)."
            }
        }
        $monitorDeadline = (Get-Date).AddSeconds(5)
        do {
            $remainingNewMonitors = @(Get-CentralMonitors | Where-Object {
                $centralMonitorPidsBefore -notcontains [int]$_.ProcessId
            })
            if ($remainingNewMonitors.Count -eq 0) { break }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $monitorDeadline)
        if ($remainingNewMonitors.Count -gt 0) {
            throw "Transaction-created central monitor is still running: $($remainingNewMonitors.ProcessId -join ', ')."
        }
    } catch {
        $centralMonitorStopped = $false
        $rollbackErrors.Add($_.Exception.Message)
    }

    foreach ($item in $Context.LegacyFiles) {
        try {
            $backup = Join-Path (Join-Path $Context.BackupRoot $item.Group) $item.Name
            if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $item.Source)) {
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $item.Source) | Out-Null
                Copy-Item -LiteralPath $backup -Destination $item.Source -Force
            }
        } catch {
            $rollbackErrors.Add($_.Exception.Message)
        }
    }

    try {
        if ($Context.StartupExisted -and (Test-Path -LiteralPath $Context.StartupBackup)) {
            Copy-Item -LiteralPath $Context.StartupBackup -Destination $StartupFile -Force
        } elseif (Test-Path -LiteralPath $StartupFile) {
            Remove-Item -LiteralPath $StartupFile -Force
        }
    } catch {
        $rollbackErrors.Add($_.Exception.Message)
    }

    try {
        if ($Context.TaskExisted -and (Test-Path -LiteralPath $Context.TaskXml)) {
            Register-ScheduledTask -TaskName $Context.TaskName -Xml (Get-Content -Raw -LiteralPath $Context.TaskXml) -Force | Out-Null
        }
    } catch {
        $rollbackErrors.Add($_.Exception.Message)
    }

    if (@($Context.LegacyMonitorPidsBefore).Count -gt 0) {
        if (-not $centralMonitorStopped) {
            $rollbackErrors.Add("Legacy monitor restart was skipped because the transaction-created central monitor did not stop.")
        } else {
            try {
                $activeLegacyMonitors = @(Get-ActiveLegacyMonitors)
                if ($activeLegacyMonitors.Count -eq 0) {
                    $legacyLauncherStarted = $false
                    foreach ($launcherName in @("monitor_task_hidden.vbs", "start_9router_hidden.vbs")) {
                        $launcher = Join-Path $Context.DaemonDir $launcherName
                        if (Test-Path -LiteralPath $launcher) {
                            Start-Process -FilePath "wscript.exe" -ArgumentList "`"$launcher`"" -WindowStyle Hidden
                            $legacyLauncherStarted = $true
                            break
                        }
                    }
                    if (-not $legacyLauncherStarted) {
                        throw "Legacy monitor was active before migration, but no allowlisted launcher was restored."
                    }
                }
            } catch {
                $rollbackErrors.Add($_.Exception.Message)
            }
        }
    }

    if ($rollbackErrors.Count -gt 0) {
        Write-Warning "Legacy migration rollback was incomplete: $($rollbackErrors -join '; ')"
    } else {
        Write-Step "Legacy migration was rolled back from $($Context.BackupRoot)."
    }
}

function Begin-LegacyMigration {
    if ($DryRun) {
        Write-Step "Dry-run: copy allowlisted legacy helpers, replace Startup, and retain rollback data."
        return $null
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupRoot = Join-Path $AutomationRoot "legacy-backup\$timestamp"
    Assert-AutomationChildPath -Path $backupRoot
    $daemonDir = Join-Path $RouterDataDir "daemon"
    $taskName = "9Router_Daemon_Task"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $startupExisted = Test-Path -LiteralPath $StartupFile
    $startupBackup = Join-Path $backupRoot "startup\9router.vbs.before-migration"
    $taskXml = Join-Path $backupRoot "appdata-daemon\$taskName.xml"
    $listenerBefore = Get-NetTCPConnection -State Listen -LocalPort 53220 -ErrorAction SilentlyContinue | Select-Object -First 1
    $centralMonitorPidsBefore = @((Get-CentralMonitors).ProcessId)
    $legacyMonitorPidsBefore = @((Get-ActiveLegacyMonitors).ProcessId)
    $legacyFiles = @(Get-LegacySourceFiles)

    New-Item -ItemType Directory -Force -Path (Join-Path $backupRoot "startup"), (Join-Path $backupRoot "appdata-daemon"), (Join-Path $backupRoot "antigravity-scratch") | Out-Null
    if ($startupExisted) { Copy-Item -LiteralPath $StartupFile -Destination $startupBackup }
    foreach ($item in $legacyFiles) {
        Copy-Item -LiteralPath $item.Source -Destination (Join-Path (Join-Path $backupRoot $item.Group) $item.Name)
    }
    if ($task) { Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath $taskXml -Encoding Unicode }

    $context = [pscustomobject]@{
        BackupRoot = $backupRoot
        StartupExisted = $startupExisted
        StartupBackup = $startupBackup
        TaskExisted = [bool]$task
        TaskName = $taskName
        TaskXml = $taskXml
        DaemonDir = $daemonDir
        LegacyFiles = $legacyFiles
        CentralMonitorPidsBefore = $centralMonitorPidsBefore
        LegacyMonitorPidsBefore = $legacyMonitorPidsBefore
    }

    try {
        if ($task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        Get-ActiveLegacyMonitors | ForEach-Object {
            $termination = Invoke-CimMethod -InputObject $_ -MethodName Terminate -Arguments @{ Reason = 0 }
            if ($termination.ReturnValue -ne 0 -and (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)) {
                throw "Could not terminate legacy monitor PID $($_.ProcessId)."
            }
        }
        $legacyMonitorDeadline = (Get-Date).AddSeconds(5)
        do {
            $legacyMonitors = @(Get-ActiveLegacyMonitors)
            if ($legacyMonitors.Count -eq 0) { break }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $legacyMonitorDeadline)
        if ($legacyMonitors.Count -gt 0) {
            throw "A legacy monitor is still running: $($legacyMonitors.ProcessId -join ', ')."
        }
        Write-StartupLauncher
        $listenerAfter = Get-NetTCPConnection -State Listen -LocalPort 53220 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listenerBefore -and (-not $listenerAfter -or $listenerBefore.OwningProcess -ne $listenerAfter.OwningProcess)) {
            throw "The API listener changed during automation migration."
        }
        return $context
    } catch {
        Restore-LegacyMigration -Context $context
        throw
    }
}

function Complete-LegacyMigration {
    param([object]$Context)
    if (-not $Context) { return }
    foreach ($item in $Context.LegacyFiles) {
        $backup = Join-Path (Join-Path $Context.BackupRoot $item.Group) $item.Name
        if (-not (Test-Path -LiteralPath $backup) -or -not (Test-Path -LiteralPath $item.Source)) { continue }
        if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -eq
            (Get-FileHash -LiteralPath $item.Source -Algorithm SHA256).Hash) {
            Remove-Item -LiteralPath $item.Source -Force
        } else {
            Write-Warning "Legacy source changed during migration and was retained: $($item.Source)"
        }
    }
    Write-Step "Central automation migration committed. Backup: $($Context.BackupRoot)"
}

function Stop-CentralMonitor {
    param([switch]$OnlyIfStale)

    $monitors = @(Get-CentralMonitors)
    if ($monitors.Count -gt 1) { throw "Multiple central monitors are active: $($monitors.ProcessId -join ', ')" }
    if ($monitors.Count -eq 0) { return $false }

    if ($OnlyIfStale) {
        $monitorState = try {
            if (Test-Path -LiteralPath $MonitorStateFile) {
                Get-Content -Raw -LiteralPath $MonitorStateFile | ConvertFrom-Json
            }
        } catch { $null }
        $controlHash = (Get-FileHash -LiteralPath $ControlScript -Algorithm SHA256).Hash
        $configHash = (Get-FileHash -LiteralPath $ControlConfig -Algorithm SHA256).Hash
        $heartbeatFresh = $false
        if ($monitorState -and $monitorState.heartbeatAt) {
            try { $heartbeatFresh = (Get-Date) -lt ([datetime]$monitorState.heartbeatAt).AddSeconds(45) }
            catch { $heartbeatFresh = $false }
        }
        $monitorCurrent = $monitorState -and [int]$monitorState.pid -eq [int]$monitors[0].ProcessId -and
            $monitorState.controlHash -eq $controlHash -and $monitorState.configHash -eq $configHash -and $heartbeatFresh
        if ($monitorCurrent) { return $false }
    }
    $reason = if ($OnlyIfStale) { "stale" } else { "for maintenance" }
    if ($DryRun) {
        Write-Step "Dry-run: stop central monitor PID $($monitors[0].ProcessId) $reason without touching API or dashboard listeners."
        return $true
    }
    Write-Step "Stopping central monitor PID $($monitors[0].ProcessId) $reason; API and dashboard processes are preserved."
    $termination = Invoke-CimMethod -InputObject $monitors[0] -MethodName Terminate -Arguments @{ Reason = 0 }
    if ($termination.ReturnValue -ne 0) { throw "Could not terminate stale central monitor PID $($monitors[0].ProcessId)." }
    $stopDeadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $monitors = @(Get-CentralMonitors)
    } while ($monitors.Count -gt 0 -and (Get-Date) -lt $stopDeadline)
    if ($monitors.Count -gt 0) { throw "Stale central monitor did not stop." }
    return $true
}

function Start-CentralMonitorProcess {
    if ($DryRun) {
        Write-Step "Dry-run: start the central monitor through $HiddenLauncher"
        return
    }
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$HiddenLauncher`"" -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $monitors = @(Get-CentralMonitors)
    } while ($monitors.Count -eq 0 -and (Get-Date) -lt $deadline)
    if ($monitors.Count -ne 1) { throw "The central monitor did not start exactly once." }
}

function Start-CentralMonitor {
    Write-StartupLauncher
    Stop-CentralMonitor -OnlyIfStale | Out-Null
    $monitors = @(Get-CentralMonitors)
    if ($monitors.Count -eq 1) { return }
    Start-CentralMonitorProcess
}

function Restore-CentralMonitorAfterFailedMaintenance {
    param([bool]$WasRunning)
    if (-not $WasRunning -or @(Get-CentralMonitors).Count -gt 0) { return }
    try {
        Start-CentralMonitorProcess
        Write-Warning "Central monitor was restored after the maintenance action failed; API and dashboard listeners were preserved."
    } catch {
        Write-Warning "Maintenance failed and the previous central monitor could not be restored: $($_.Exception.Message)"
    }
}

function Get-ResponseHeader {
    param([object]$Response, [string]$Name)
    if (-not $Response -or -not $Response.Headers) { return "" }
    try {
        $direct = $Response.Headers[$Name]
        if ($direct) { return [string]($direct -join ",") }
    } catch {}
    foreach ($header in $Response.Headers) {
        if ([string]$header.Key -ieq $Name) { return [string]($header.Value -join ",") }
    }
    return ""
}

function Get-WebProbe {
    param([string]$Uri, [int]$MaximumRedirection = 5)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 8 `
            -MaximumRedirection $MaximumRedirection -ErrorAction Stop
    } catch {
        if (-not $_.Exception.Response) { throw }
        $response = $_.Exception.Response
    }
    return [pscustomobject]@{
        Status = [int]$response.StatusCode
        Location = Get-ResponseHeader -Response $response -Name "Location"
        RedirectHeader = Get-ResponseHeader -Response $response -Name "x-9router-dashboard-redirect"
        DashboardProxy = Get-ResponseHeader -Response $response -Name "x-9router-dashboard-proxy"
        DashboardRole = Get-ResponseHeader -Response $response -Name "x-9router-role"
    }
}

function Test-RuntimeContract {
    $apiHealth = Get-WebProbe -Uri "http://127.0.0.1:53220/api/health"
    $models = Get-WebProbe -Uri "http://127.0.0.1:53220/v1/models"
    $dashboardHealth = Get-WebProbe -Uri "http://127.0.0.1:20128/api/health"
    $dashboardStage = Get-WebProbe -Uri "http://127.0.0.1:20128/_9router/dashboard-health"
    $blockedModels = Get-WebProbe -Uri "http://127.0.0.1:20128/v1/models" -MaximumRedirection 0
    $redirect = Get-WebProbe -Uri "http://localhost:53220/dashboard/quota?portable-check=1" -MaximumRedirection 0

    if ($apiHealth.Status -ne 200 -or $models.Status -ne 200) { throw "API health contract failed." }
    if ($dashboardHealth.Status -ne 200 -or $dashboardHealth.DashboardProxy -ne "53220") {
        throw "Dashboard control API proxy contract failed."
    }
    if ($dashboardStage.Status -ne 200 -or $dashboardStage.DashboardRole -ne "dashboard") {
        throw "Dashboard stage role contract failed."
    }
    if ($blockedModels.Status -ne 421) { throw "Dashboard port did not block inference routes." }
    if ($redirect.Status -ne 307 -or
        $redirect.Location -ne "http://localhost:20128/dashboard/quota?portable-check=1" -or
        $redirect.RedirectHeader -ne "20128") {
        throw "API-to-dashboard redirect contract failed."
    }
    Write-Step "Runtime verified: API 53220, dashboard 20128, redirect and isolation are healthy."
}

function Test-RunningApiPatchContract {
    param([object]$Layout)
    $customServer = Join-Path $Layout.RouterRoot "app\custom-server.js"
    $bulkImportRoute = Join-Path $Layout.RouterRoot "app\.next-cli-build\server\app\api\oauth\codex\bulk-import\route.js"
    if (-not (Test-Path -LiteralPath $customServer)) { throw "Production custom-server.js is missing." }
    if (-not (Select-String -LiteralPath $customServer -Pattern 'x-9router-dashboard-redirect' -Quiet)) {
        throw "API is running without the durable dashboard redirect patch. Stop API 53220 and run Repair."
    }
    if (-not (Test-Path -LiteralPath $bulkImportRoute) -or
        -not (Select-String -LiteralPath $bulkImportRoute -Pattern 'item\.credentials&&item\.credentials\.access_token' -Quiet)) {
        throw "API is running without the durable bulk-import patch. Stop API 53220 and run Repair."
    }
    $apiHealth = Get-WebProbe -Uri "http://127.0.0.1:53220/api/health"
    $models = Get-WebProbe -Uri "http://127.0.0.1:53220/v1/models"
    $redirect = Get-WebProbe -Uri "http://localhost:53220/dashboard/quota?install-preflight=1" -MaximumRedirection 0
    if ($apiHealth.Status -ne 200 -or $models.Status -ne 200 -or
        $redirect.Status -ne 307 -or
        $redirect.Location -ne "http://localhost:20128/dashboard/quota?install-preflight=1" -or
        $redirect.RedirectHeader -ne "20128") {
        throw "The running API has not loaded the durable patch contract; restart API 53220 before Install or Repair."
    }
}

function Invoke-Check {
    param([object]$Prerequisites, [object]$Layout)
    Show-PrerequisiteState -State $Prerequisites
    Write-Output "npm global root: $($Layout.Root)"
    Write-Output "patch root: $PatchRoot"
    if ($DryRun) {
        Write-Step "Portable source Check -DryRun passed without runtime state or mutations."
        return
    }
    $startupContent = if (Test-Path -LiteralPath $StartupFile) { Get-Content -Raw -LiteralPath $StartupFile } else { "" }
    if ($startupContent.IndexOf($HiddenLauncher, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "The managed Startup entry does not point to this patch root."
    }
    $monitors = @(Get-CentralMonitors)
    if ($monitors.Count -ne 1) { throw "Expected exactly one central monitor for this patch root, found $($monitors.Count)." }
    Invoke-Controller -ControllerAction "Status" | Out-Null
    Test-RuntimeContract
}

Assert-SourceBundle
$prerequisites = Get-PrerequisiteState
Show-PrerequisiteState -State $prerequisites
if (-not $prerequisites.PowerShell7) {
    throw "PowerShell 7 is missing. Run install-9router.bat Install."
}
if (-not $prerequisites.Node -or -not $prerequisites.Npm) {
    if ($Action -in @("Install", "Repair")) {
        $prerequisites = Ensure-NodePrerequisites
    } else {
        throw "Node.js and npm are required. Run install-9router.bat Install."
    }
}
$repairNpmPrefix = $Action -in @("Install", "Repair")
$npmLayout = Get-NpmLayout -NpmCommand $prerequisites.Npm -RepairDefaultPrefix:$repairNpmPrefix

if (-not $DryRun -and $Action -in @("Install", "Update", "Start", "Check", "Repair")) {
    Assert-NoForeignCentralMonitor
}

if ($Action -in @("Check", "Validate")) {
    Invoke-Check -Prerequisites $prerequisites -Layout $npmLayout
    exit 0
}

if ($DryRun) {
    Reset-CopiedRuntimeIfNeeded
    if ($Action -eq "Install") {
        Install-UpstreamPackageIfMissing -NpmCommand $prerequisites.Npm -Layout $npmLayout
        Write-Step "Dry-run: apply API scope, then EnsureRunning owns the StageDashboard lifecycle."
        Begin-LegacyMigration | Out-Null
    } elseif ($Action -eq "Repair") {
        Install-UpstreamPackageIfMissing -NpmCommand $prerequisites.Npm -Layout $npmLayout -ForceRepair
        Write-Step "Dry-run: apply API scope, then EnsureRunning owns the StageDashboard lifecycle."
        Begin-LegacyMigration | Out-Null
    } elseif ($Action -eq "Update") {
        Write-Step "Dry-run: run the transactional Update action; active APIs are safely deferred."
    } elseif ($Action -eq "Start") {
        Write-Step "Dry-run: ensure API/dashboard listeners and start the monitor."
    }
    exit 0
}

switch ($Action) {
    "Install" {
        Reset-CopiedRuntimeIfNeeded
        $monitorWasRunning = @(Get-CentralMonitors).Count -eq 1
        Stop-CentralMonitor | Out-Null
        $installCompleted = $false
        try {
            Install-UpstreamPackageIfMissing -NpmCommand $prerequisites.Npm -Layout $npmLayout
            $apiListener = Get-NetTCPConnection -State Listen -LocalPort 53220 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($apiListener) {
                Test-RunningApiPatchContract -Layout $npmLayout
            } else {
                Invoke-Controller -ControllerAction "ApplyPatches" -Scope "api" | Out-Null
            }
            $migrationContext = $null
            try {
                $migrationContext = Begin-LegacyMigration
                Invoke-Controller -ControllerAction "EnsureRunning" | Out-Null
                Start-CentralMonitor
                Test-RuntimeContract
                Complete-LegacyMigration -Context $migrationContext
            } catch {
                Restore-LegacyMigration -Context $migrationContext
                throw
            }
            $installCompleted = $true
        } finally {
            if (-not $installCompleted) {
                Restore-CentralMonitorAfterFailedMaintenance -WasRunning $monitorWasRunning
            }
        }
        Write-Step "Install completed. The upstream package stays in the default npm location; patches stay in $PatchRoot."
    }
    "Update" {
        $updateCode = Invoke-Controller -ControllerAction "Update" -AllowDeferred
        Start-CentralMonitor
        if ($updateCode -eq 2) {
            Write-Step "Update was downloaded/queued safely and will apply when API port 53220 is next stopped."
            exit 2
        }
        Invoke-Controller -ControllerAction "EnsureRunning" | Out-Null
        Test-RuntimeContract
        Write-Step "Update completed and runtime health passed."
    }
    "Start" {
        Write-StartupLauncher
        Invoke-Controller -ControllerAction "EnsureRunning" | Out-Null
        Start-CentralMonitor
        Test-RuntimeContract
        Write-Step "API, dashboard, and central monitor are running."
    }
    "Repair" {
        Reset-CopiedRuntimeIfNeeded
        $monitorWasRunning = @(Get-CentralMonitors).Count -eq 1
        Stop-CentralMonitor | Out-Null
        $repairCompleted = $false
        try {
            Install-UpstreamPackageIfMissing -NpmCommand $prerequisites.Npm -Layout $npmLayout -ForceRepair
            $apiListener = Get-NetTCPConnection -State Listen -LocalPort 53220 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($apiListener) {
                Test-RunningApiPatchContract -Layout $npmLayout
            } else {
                Invoke-Controller -ControllerAction "ApplyPatches" -Scope "api" | Out-Null
            }
            Invoke-Controller -ControllerAction "ApplyPatches" -Scope "dashboard" | Out-Null
            Invoke-Controller -ControllerAction "EnsureRunning" | Out-Null
            Write-StartupLauncher
            Start-CentralMonitor
            Test-RuntimeContract
            $repairCompleted = $true
        } finally {
            if (-not $repairCompleted) {
                Restore-CentralMonitorAfterFailedMaintenance -WasRunning $monitorWasRunning
            }
        }
        Write-Step "Repair completed."
    }
}

exit 0
