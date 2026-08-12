[CmdletBinding()]
param(
    [ValidateSet("Monitor", "EnsureRunning", "RestartApi", "InstallPreparedUpdate", "Health", "Status", "CheckUpdate", "Update", "ApplyPatches", "StageDashboard", "StartDashboard", "RestartDashboard", "DashboardStatus", "StopDashboard")]
    [string]$Action = "Monitor",
    [ValidateSet("all", "api", "dashboard")]
    [string]$Scope = "all"
)

$ErrorActionPreference = "Stop"
$AutomationRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PatchRoot = Split-Path -Parent $AutomationRoot
$ControlScript = $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $AutomationRoot "9router-control.json"
$Config = Get-Content -Raw -LiteralPath $ConfigFile | ConvertFrom-Json
$LoadedControlHash = (Get-FileHash -LiteralPath $ControlScript -Algorithm SHA256).Hash
$LoadedConfigHash = (Get-FileHash -LiteralPath $ConfigFile -Algorithm SHA256).Hash
$Port = [int]$Config.port
$BindHost = [string]$Config.bindHost
$HealthHost = [string]$Config.healthHost
$DashboardPort = [int]$Config.dashboardPort
$DashboardHost = [string]$Config.dashboardHost
$UpdaterPort = [int]$Config.updaterPort
$StateDir = Join-Path $AutomationRoot "state"
$LogDir = Join-Path $AutomationRoot "logs"
$LogFile = Join-Path $LogDir "9router-control.log"
$PendingUpdateFile = Join-Path $StateDir "pending-update.json"
$PreparedUpdateFile = Join-Path $StateDir "prepared-update.json"
$TransactionFile = Join-Path $StateDir "update-transaction.json"
$ApiPatchStateFile = Join-Path $StateDir "api-patch-state.json"
$MonitorStateFile = Join-Path $StateDir "central-monitor.json"
$UpdateWorkDir = Join-Path $AutomationRoot "work\updates"
$DashboardStageStateFile = Join-Path $StateDir "dashboard-stage.json"
$DashboardStageFailureFile = Join-Path $StateDir "dashboard-stage-failure.json"
$DashboardStageWorkDir = Join-Path $AutomationRoot "work\dashboard-stage"
$DashboardStageServer = Join-Path $AutomationRoot "dashboard-staging-server.js"
$PatchScript = Join-Path $PatchRoot "apply-patches.js"
$PatchTest = Join-Path $PatchRoot "quota-patch.test.js"
$BulkImportNormalizerTest = Join-Path $PatchRoot "bulk-import-normalizer.test.js"
$AutomationTest = Join-Path $PatchRoot "automation.test.js"
$DashboardStagingTest = Join-Path $PatchRoot "dashboard-staging.test.js"
$ApiGatewayTest = Join-Path $PatchRoot "api-gateway.test.js"
$ModelAccountRoutingTest = Join-Path $PatchRoot "model-account-routing.test.js"
$ProviderDetailPatchTest = Join-Path $PatchRoot "provider-detail-patch.test.js"
$UpdateShimCutoverTest = Join-Path $PatchRoot "update-shim-cutover.test.js"
$StartupFile = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\9router.vbs"
$HiddenLauncher = Join-Path $AutomationRoot "start-9router-hidden.vbs"
$RouterRoot = Join-Path $env:APPDATA "npm\node_modules\9router"
$RouterCli = Join-Path $RouterRoot "cli.js"
$PackageFile = Join-Path $RouterRoot "package.json"
$ProductionDataDir = Join-Path $env:APPDATA "9router"
$GlobalPrefix = Split-Path -Parent (Split-Path -Parent $RouterRoot)
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$NpmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$TarExe = (Get-Command tar.exe -ErrorAction Stop).Source
$RobocopyExe = (Get-Command robocopy.exe -ErrorAction Stop).Source

if ($Port -eq $DashboardPort -or $Port -eq $UpdaterPort -or $DashboardPort -eq $UpdaterPort) {
    throw "API, dashboard, and updater ports must be distinct."
}
if ($DashboardHost -notin @("127.0.0.1", "::1", "localhost")) {
    throw "Dashboard staging must bind to loopback."
}

New-Item -ItemType Directory -Force -Path $StateDir, $LogDir, $UpdateWorkDir, $DashboardStageWorkDir | Out-Null

function Write-ControlLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $LogFile -Value $line
    Write-Host $line
}

function Get-PortListener {
    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-ListenerProcess {
    $listener = Get-PortListener
    if (-not $listener) { return $null }
    Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-CommandLineReferencesExactPath {
    param([string]$CommandLine, [string]$ResolvedPath)
    if (-not $CommandLine -or -not $ResolvedPath) { return $false }
    $path = [IO.Path]::GetFullPath($ResolvedPath)
    $pattern = '(?i)(?:^|[\s"])' + [regex]::Escape($path) + '(?=$|[\s"])'
    return $CommandLine -match $pattern
}

function Test-CommandLineReferencesPathUnderRoot {
    param([string]$CommandLine, [string]$RootPath)
    if (-not $CommandLine -or -not $RootPath) { return $false }
    $root = [IO.Path]::GetFullPath($RootPath).TrimEnd('\', '/')
    $pattern = '(?i)(?:^|[\s"])' + [regex]::Escape($root) + '(?:[\\/][^"]*)?(?=$|[\s"])'
    return $CommandLine -match $pattern
}

function Test-Utf16LeBom {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $bytes = [IO.File]::ReadAllBytes($Path)
    return $bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE
}

function Test-ExpectedListener {
    $process = Get-ListenerProcess
    if (-not $process) { return $false }
    $customServer = Join-Path $RouterRoot "app\custom-server.js"
    $server = Join-Path $RouterRoot "app\server.js"
    return (Test-CommandLineReferencesExactPath -CommandLine $process.CommandLine -ResolvedPath $customServer) -or
        (Test-CommandLineReferencesExactPath -CommandLine $process.CommandLine -ResolvedPath $server)
}

function Get-DashboardPortListener {
    Get-NetTCPConnection -State Listen -LocalPort $DashboardPort -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-DashboardListenerProcess {
    $listener = Get-DashboardPortListener
    if (-not $listener) { return $null }
    Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-ExpectedDashboardListener {
    $process = Get-DashboardListenerProcess
    if (-not $process -or -not $process.CommandLine) { return $false }
    return Test-CommandLineReferencesExactPath -CommandLine $process.CommandLine -ResolvedPath $DashboardStageServer
}

function Test-Endpoint {
    param([string]$Path)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://${HealthHost}:${Port}${Path}" `
            -TimeoutSec ([int]$Config.healthTimeoutSeconds) -ErrorAction Stop
        return ($response.StatusCode -in @(200, 401, 403))
    } catch {
        if ($_.Exception.Response) {
            return ([int]$_.Exception.Response.StatusCode -in @(200, 401, 403))
        }
        return $false
    }
}

function Test-9RouterHealth {
    return (Test-Endpoint "/api/health") -and (Test-Endpoint "/v1/models")
}

function Get-HttpStatusCode {
    param(
        [string]$Uri,
        [hashtable]$Headers = @{}
    )
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $Headers `
            -TimeoutSec ([int]$Config.healthTimeoutSeconds) -MaximumRedirection 5 -ErrorAction Stop
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

function Get-BytesSha256Hex {
    param([byte[]]$Bytes)

    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace("-", "") }
    finally { $sha.Dispose() }
}

function Test-DashboardStageHealth {
    param([object]$Stage)

    if (-not $Stage -or -not $Stage.releaseId -or -not $Stage.uiProbePath -or -not $Stage.uiProbeHash) {
        return $false
    }

    try {
        $health = Invoke-WebRequest -UseBasicParsing `
            -Uri "http://${DashboardHost}:${DashboardPort}/_9router/dashboard-health" `
            -TimeoutSec ([int]$Config.healthTimeoutSeconds) -MaximumRedirection 0 -ErrorAction Stop
        if ($health.StatusCode -ne 200 -or $health.Headers["x-9router-role"] -ne "dashboard") { return $false }
        if ($health.Headers["x-9router-dashboard-release"] -ne $Stage.releaseId) { return $false }
        $healthBody = $health.Content | ConvertFrom-Json
        if (-not $healthBody.ok -or $healthBody.releaseId -ne $Stage.releaseId) { return $false }

        $asset = Invoke-WebRequest -UseBasicParsing `
            -Uri "http://${DashboardHost}:${DashboardPort}$($Stage.uiProbePath)" `
            -Headers @{ "Accept-Encoding" = "identity" } `
            -TimeoutSec ([int]$Config.healthTimeoutSeconds) -MaximumRedirection 0 -ErrorAction Stop
        if ($asset.StatusCode -ne 200 -or $asset.Headers["x-9router-role"] -ne "dashboard") { return $false }
        if ($asset.Headers["x-9router-dashboard-release"] -ne $Stage.releaseId) { return $false }
        $assetBytes = if ($asset.RawContentStream) {
            $memory = New-Object IO.MemoryStream
            try {
                $asset.RawContentStream.CopyTo($memory)
                $memory.ToArray()
            } finally {
                $memory.Dispose()
            }
        } else {
            [Text.Encoding]::UTF8.GetBytes([string]$asset.Content)
        }
        if ((Get-BytesSha256Hex -Bytes $assetBytes) -ne $Stage.uiProbeHash) { return $false }

        $blocked = Get-HttpStatusCode -Uri "http://${DashboardHost}:${DashboardPort}/v1/models"
        return $blocked -eq 421
    } catch {
        return $false
    }
}

function Get-InstalledVersion {
    if (-not (Test-Path -LiteralPath $PackageFile)) { return $null }
    return (Get-Content -Raw -LiteralPath $PackageFile | ConvertFrom-Json).version
}

function Get-LatestVersion {
    try {
        return (Invoke-RestMethod -Uri "https://registry.npmjs.org/9router/latest" `
            -TimeoutSec ([int]$Config.healthTimeoutSeconds) -ErrorAction Stop).version
    } catch {
        Write-ControlLog "Update check skipped: $($_.Exception.Message)"
        return $null
    }
}

function Set-PendingUpdate {
    param([string]$Version)
    [pscustomobject]@{
        requestedAt = (Get-Date).ToString("o")
        version = $Version
    } | ConvertTo-Json | Set-Content -LiteralPath $PendingUpdateFile -Encoding UTF8
}

function Get-PendingVersion {
    if (-not (Test-Path -LiteralPath $PendingUpdateFile)) { return $null }
    try {
        return (Get-Content -Raw -LiteralPath $PendingUpdateFile | ConvertFrom-Json).version
    } catch {
        Write-ControlLog "Pending update state is invalid and will be replaced."
        return $null
    }
}

function Write-JsonState {
    param(
        [string]$Path,
        [object]$Value
    )

    $temporaryPath = "$Path.tmp-$PID-$([guid]::NewGuid().ToString('N'))"
    try {
        $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

function Read-JsonState {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Get-ApiPatchFingerprint {
    $targets = @(
        Join-Path $RouterRoot "app\custom-server.js"
        Join-Path $RouterRoot "app\.next-cli-build\server\app\api\oauth\codex\bulk-import\route.js"
    )
    if (-not (Test-Path -LiteralPath $PatchScript) -or -not (Get-InstalledVersion)) { return $null }

    $targetStates = @()
    foreach ($target in $targets) {
        if (-not (Test-Path -LiteralPath $target)) { return $null }
        $targetStates += [pscustomobject]@{
            path = [IO.Path]::GetRelativePath($RouterRoot, $target).Replace('\', '/')
            hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        }
    }
    $version = Get-InstalledVersion
    $patchHash = (& $NodeExe $PatchScript --scope-hash api | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or $patchHash -notmatch '^[A-F0-9]{64}$') {
        throw "Could not compute the API-scoped patch fingerprint."
    }
    $parts = @("schema=api-patch-state-v2", "version=$version", "patch=$patchHash") +
        @($targetStates | ForEach-Object { "target=$($_.path):$($_.hash)" })
    return [pscustomobject]@{
        schema = "api-patch-state-v2"
        version = $version
        patchScriptHash = $patchHash
        targets = $targetStates
        fingerprint = Get-BytesSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes(($parts -join "`n")))
        verifiedAt = (Get-Date).ToString("o")
    }
}

function Test-ApiPatchStateCurrent {
    try {
        $state = Read-JsonState $ApiPatchStateFile
        $current = Get-ApiPatchFingerprint
        return $state -and $current -and $state.schema -eq $current.schema -and
            $state.fingerprint -eq $current.fingerprint
    } catch {
        Write-ControlLog "API patch state is invalid: $($_.Exception.Message)"
        return $false
    }
}

function Set-ApiPatchState {
    $state = Get-ApiPatchFingerprint
    if (-not $state) { throw "Could not fingerprint the patched API files." }
    Write-JsonState -Path $ApiPatchStateFile -Value $state
}

function Write-MonitorState {
    param([string]$Phase = "running")
    [pscustomobject]@{
        schema = "central-monitor-v1"
        pid = $PID
        phase = $Phase
        controlHash = $LoadedControlHash
        configHash = $LoadedConfigHash
        heartbeatAt = (Get-Date).ToString("o")
    } | ForEach-Object { Write-JsonState -Path $MonitorStateFile -Value $_ }
}

function Get-DashboardStageFingerprint {
    $parts = @(
        "schema=dashboard-stage-v2"
        "patch=$((Get-FileHash -LiteralPath $PatchScript -Algorithm SHA256).Hash)"
        "gateway=$((Get-FileHash -LiteralPath $DashboardStageServer -Algorithm SHA256).Hash)"
        "controller=$((Get-FileHash -LiteralPath $ControlScript -Algorithm SHA256).Hash)"
        "config=$((Get-FileHash -LiteralPath $ConfigFile -Algorithm SHA256).Hash)"
    )
    return Get-BytesSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes(($parts -join "`n")))
}

function Assert-DashboardControllerSourcesCurrent {
    $controlHash = (Get-FileHash -LiteralPath $ControlScript -Algorithm SHA256).Hash
    $configHash = (Get-FileHash -LiteralPath $ConfigFile -Algorithm SHA256).Hash
    if ($controlHash -ne $LoadedControlHash -or $configHash -ne $LoadedConfigHash) {
        throw "Dashboard controller or config changed on disk; restart the central monitor before staging."
    }
}

function Get-DashboardStageState {
    try { return Read-JsonState $DashboardStageStateFile }
    catch {
        Write-ControlLog "Dashboard stage state is invalid: $($_.Exception.Message)"
        return $null
    }
}

function Assert-DashboardStagePath {
    param([string]$Path)

    $workRoot = [IO.Path]::GetFullPath($DashboardStageWorkDir).TrimEnd('\')
    $candidate = [IO.Path]::GetFullPath($Path)
    if (-not $candidate.StartsWith("$workRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Dashboard stage path escaped the managed root: $candidate"
    }
}

function Assert-ApiListenerPreserved {
    param([object]$ListenerBefore)

    if (-not $ListenerBefore) { return }
    $listenerAfter = Get-PortListener
    if (-not $listenerAfter -or $listenerAfter.OwningProcess -ne $ListenerBefore.OwningProcess) {
        throw "API listener PID changed while managing the dashboard stage."
    }
}

function Initialize-DashboardStageData {
    param([string]$DataDir)

    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    foreach ($name in @("jwt-secret", "machine-id")) {
        $source = Join-Path $ProductionDataDir $name
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $DataDir $name) -Force
        }
    }
}

function Prepare-DashboardStage {
    param(
        [string]$SourceAppRoot = (Join-Path $RouterRoot "app"),
        [string]$SourceVersion = (Get-InstalledVersion)
    )

    Assert-DashboardControllerSourcesCurrent
    if (-not (Test-Path -LiteralPath (Join-Path $SourceAppRoot "server.js"))) {
        throw "Dashboard source app is invalid: $SourceAppRoot"
    }
    $listenerBefore = Get-PortListener
    $apiWasHealthy = Test-9RouterHealth
    $releaseId = "{0}-{1}-{2}" -f $SourceVersion, (Get-Date -Format "yyyyMMdd-HHmmss"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
    $releaseRoot = Join-Path $DashboardStageWorkDir "releases\$releaseId"
    $appRoot = Join-Path $releaseRoot "app"
    $dataDir = Join-Path $releaseRoot "data"
    Assert-DashboardStagePath $releaseRoot
    New-Item -ItemType Directory -Force -Path $appRoot | Out-Null

    try {
        Write-ControlLog "Copying dashboard $SourceVersion into isolated stage $releaseId."
        & $RobocopyExe $SourceAppRoot $appRoot /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /NFL /NDL /NJH /NJS /NP /XD (Join-Path $SourceAppRoot "logs") | Out-Null
        $copyExitCode = $LASTEXITCODE
        if ($copyExitCode -ge 8) { throw "Dashboard stage copy failed with robocopy exit code $copyExitCode." }
        Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $SourceAppRoot) "package.json") `
            -Destination (Join-Path $releaseRoot "package.json") -Force

        Initialize-DashboardStageData -DataDir $dataDir
        Invoke-PatchSet -Scope dashboard -AppRoot $appRoot
        $quotaDir = Join-Path $appRoot ".next-cli-build\static\chunks\app\(dashboard)\dashboard\quota"
        $quotaChunk = @(Get-ChildItem -LiteralPath $quotaDir -Filter "page-*.js" -File)
        if ($quotaChunk.Count -ne 1) { throw "Expected exactly one dashboard quota chunk." }
        $stage = [pscustomobject]@{
            releaseId = $releaseId
            sourceVersion = $SourceVersion
            stageFingerprint = Get-DashboardStageFingerprint
            preparedAt = (Get-Date).ToString("o")
            appRoot = $appRoot
            dataDir = $dataDir
            uiProbePath = "/_next/static/chunks/app/(dashboard)/dashboard/quota/$($quotaChunk[0].Name)"
            uiProbeHash = (Get-FileHash -LiteralPath $quotaChunk[0].FullName -Algorithm SHA256).Hash
        }
        Write-JsonState -Path (Join-Path $releaseRoot "release.json") -Value $stage
        Assert-ApiListenerPreserved -ListenerBefore $listenerBefore
        if ($apiWasHealthy -and -not (Test-9RouterHealth)) {
            throw "API health changed while preparing the dashboard stage."
        }
        Write-ControlLog "Dashboard stage $releaseId passed dashboard-only patches and tests."
        return $stage
    } catch {
        if (Test-Path -LiteralPath $releaseRoot) {
            Assert-DashboardStagePath $releaseRoot
            Remove-Item -LiteralPath $releaseRoot -Recurse -Force
        }
        throw
    }
}

function Start-DashboardStage {
    param([object]$Stage = (Get-DashboardStageState))

    if (-not $Stage -or -not (Test-Path -LiteralPath (Join-Path $Stage.appRoot "server.js"))) {
        throw "No valid dashboard stage is prepared."
    }
    $listener = Get-DashboardPortListener
    if ($listener) {
        if (-not (Test-ExpectedDashboardListener)) {
            throw "Dashboard port $DashboardPort is owned by unexpected PID $($listener.OwningProcess)."
        }
        return Test-DashboardStageHealth -Stage $Stage
    }

    $bootstrap = Join-Path $AutomationRoot "dashboard-staging-server.js"
    if (-not (Test-Path -LiteralPath $bootstrap)) { throw "Dashboard bootstrap is missing: $bootstrap" }
    $releaseRoot = Split-Path -Parent ([string]$Stage.appRoot)
    $attemptId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $stdoutLog = Join-Path $releaseRoot "dashboard-$attemptId.stdout.log"
    $stderrLog = Join-Path $releaseRoot "dashboard-$attemptId.stderr.log"
    $nodePath = @(
        (Join-Path $ProductionDataDir "runtime\node_modules"),
        (Join-Path $Stage.appRoot "node_modules")
    ) -join [IO.Path]::PathSeparator
    $environment = @{
        PORT = "$DashboardPort"
        HOSTNAME = $DashboardHost
        DATA_DIR = [string]$Stage.dataDir
        NODE_PATH = $nodePath
        NINE_ROUTER_DASHBOARD_APP_ROOT = [string]$Stage.appRoot
        NINE_ROUTER_DASHBOARD_RELEASE = [string]$Stage.releaseId
        NINE_ROUTER_API_ORIGIN = "http://${HealthHost}:${Port}"
        NINE_ROUTER_ROLE = "dashboard"
    }
    $savedEnvironment = @{}
    try {
        foreach ($name in $environment.Keys) {
            $savedEnvironment[$name] = [pscustomobject]@{
                existed = Test-Path "Env:$name"
                value = [Environment]::GetEnvironmentVariable($name, "Process")
            }
            [Environment]::SetEnvironmentVariable($name, $environment[$name], "Process")
        }
        $process = Start-Process -FilePath $NodeExe -ArgumentList "`"$bootstrap`"" `
            -WorkingDirectory $AutomationRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
    } finally {
        foreach ($name in $savedEnvironment.Keys) {
            $saved = $savedEnvironment[$name]
            [Environment]::SetEnvironmentVariable($name, $(if ($saved.existed) { $saved.value } else { $null }), "Process")
        }
    }

    Write-ControlLog "Started dashboard stage $($Stage.releaseId) as PID $($process.Id) on $DashboardHost`:$DashboardPort."
    $deadline = (Get-Date).AddSeconds([int]$Config.dashboardStartTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        if ($process.HasExited) {
            Write-ControlLog "Dashboard stage $($Stage.releaseId) exited during startup with code $($process.ExitCode). Logs: $stdoutLog ; $stderrLog"
            break
        }
        if (Test-DashboardStageHealth -Stage $Stage) { return $true }
    } while ((Get-Date) -lt $deadline)

    $startedProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction SilentlyContinue
    if ($startedProcess -and
        (Test-CommandLineReferencesExactPath -CommandLine $startedProcess.CommandLine -ResolvedPath $DashboardStageServer)) {
        Invoke-CimMethod -InputObject $startedProcess -MethodName Terminate -Arguments @{ Reason = 0 } | Out-Null
    }
    Write-ControlLog "Dashboard stage $($Stage.releaseId) did not become healthy before timeout. Logs: $stdoutLog ; $stderrLog"
    return $false
}

function Restart-DashboardStage {
    param([object]$Stage = (Get-DashboardStageState))

    $listenerBefore = Get-PortListener
    $previous = Get-DashboardStageState
    if (Get-DashboardPortListener) { Stop-DashboardStage | Out-Null }
    if (-not (Start-DashboardStage -Stage $Stage)) {
        if ($previous -and $previous.releaseId -ne $Stage.releaseId) {
            Write-ControlLog "Restoring previous dashboard stage $($previous.releaseId)."
            Start-DashboardStage -Stage $previous | Out-Null
        }
        throw "Dashboard stage $($Stage.releaseId) failed health verification."
    }

    $listener = Get-DashboardPortListener
    $Stage | Add-Member -NotePropertyName activatedAt -NotePropertyValue (Get-Date).ToString("o") -Force
    $Stage | Add-Member -NotePropertyName listenerPid -NotePropertyValue $listener.OwningProcess -Force
    Write-JsonState -Path $DashboardStageStateFile -Value $Stage
    Assert-ApiListenerPreserved -ListenerBefore $listenerBefore
    Remove-OldDashboardStages -KeepReleaseId $Stage.releaseId
    Write-ControlLog "Dashboard stage $($Stage.releaseId) is active on port $DashboardPort."
    return $true
}

function Stop-DashboardStage {
    $listenerBefore = Get-PortListener
    $listener = Get-DashboardPortListener
    if (-not $listener) { return $true }
    if (-not (Test-ExpectedDashboardListener)) {
        throw "Refusing to stop unexpected process PID $($listener.OwningProcess) on dashboard port $DashboardPort."
    }

    $process = Get-DashboardListenerProcess
    $termination = Invoke-CimMethod -InputObject $process -MethodName Terminate -Arguments @{ Reason = 0 }
    if ($termination.ReturnValue -ne 0) {
        throw "Failed to terminate dashboard PID $($process.ProcessId): $($termination.ReturnValue)"
    }
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 200
        $remaining = Get-DashboardPortListener
    } while ($remaining -and (Get-Date) -lt $deadline)
    if ($remaining) { throw "Dashboard port $DashboardPort did not stop before timeout." }
    Assert-ApiListenerPreserved -ListenerBefore $listenerBefore
    Write-ControlLog "Stopped dashboard stage PID $($process.ProcessId); API listener was preserved."
    return $true
}

function Remove-OldDashboardStages {
    param([string]$KeepReleaseId)

    $releasesRoot = Join-Path $DashboardStageWorkDir "releases"
    if (-not (Test-Path -LiteralPath $releasesRoot)) { return }
    Get-ChildItem -LiteralPath $releasesRoot -Directory | Where-Object {
        $_.Name -ne $KeepReleaseId
    } | ForEach-Object {
        Assert-DashboardStagePath $_.FullName
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Maintain-DashboardStage {
    if (-not (Test-9RouterHealth)) {
        Write-ControlLog "Dashboard maintenance deferred until API port $Port is healthy."
        return $false
    }

    Assert-DashboardControllerSourcesCurrent
    $stage = Get-DashboardStageState
    $installedVersion = Get-InstalledVersion
    $stageFingerprint = Get-DashboardStageFingerprint
    $stageUsable = $stage -and $stage.appRoot -and
        (Test-Path -LiteralPath (Join-Path $stage.appRoot "server.js"))
    $needsRebuild = -not $stageUsable -or $stage.sourceVersion -ne $installedVersion -or
        $stage.stageFingerprint -ne $stageFingerprint
    if ($needsRebuild) {
        $failure = try { Read-JsonState $DashboardStageFailureFile } catch { $null }
        $sameFailure = $failure -and $failure.sourceVersion -eq $installedVersion -and
            $failure.stageFingerprint -eq $stageFingerprint
        $retryAt = if ($sameFailure -and $failure.failedAt) {
            try { ([datetime]$failure.failedAt).AddSeconds([int]$Config.dashboardFailureRetrySeconds) }
            catch { [datetime]::MinValue }
        } else { [datetime]::MinValue }
        $backoffActive = $stageUsable -and $sameFailure -and (Get-Date) -lt $retryAt

        if (-not $backoffActive) {
            try {
                $candidate = Prepare-DashboardStage -SourceVersion $installedVersion
                Remove-Item -LiteralPath $DashboardStageFailureFile -Force -ErrorAction SilentlyContinue
                return Restart-DashboardStage -Stage $candidate
            } catch {
                [pscustomobject]@{
                    sourceVersion = $installedVersion
                    stageFingerprint = $stageFingerprint
                    failedAt = (Get-Date).ToString("o")
                    message = $_.Exception.Message
                } | ForEach-Object { Write-JsonState -Path $DashboardStageFailureFile -Value $_ }
                if (-not $stageUsable) { throw }
                Write-ControlLog "Dashboard update to $installedVersion failed; preserving last-known-good release $($stage.releaseId) and retrying after $($Config.dashboardFailureRetrySeconds)s."
            }
        }

        # A failed new stage must not prevent the last verified dashboard from serving.
        $fallbackListener = Get-DashboardPortListener
        if (-not $fallbackListener) { return Start-DashboardStage -Stage $stage }
        if (-not (Test-ExpectedDashboardListener)) {
            throw "Dashboard port $DashboardPort is owned by unexpected PID $($fallbackListener.OwningProcess)."
        }
        if (Test-DashboardStageHealth -Stage $stage) { return $true }
        return Restart-DashboardStage -Stage $stage
    }

    $listener = Get-DashboardPortListener
    if (-not $listener) { return Start-DashboardStage -Stage $stage }
    if (-not (Test-ExpectedDashboardListener)) {
        throw "Dashboard port $DashboardPort is owned by unexpected PID $($listener.OwningProcess)."
    }
    if (Test-DashboardStageHealth -Stage $stage) { return $true }
    Write-ControlLog "Dashboard stage health is degraded; restarting only dashboard port $DashboardPort."
    return Restart-DashboardStage -Stage $stage
}

function Show-DashboardStageStatus {
    $listener = Get-DashboardPortListener
    $process = Get-DashboardListenerProcess
    $stage = Get-DashboardStageState
    [pscustomobject]@{
        DashboardPort = $DashboardPort
        DashboardHost = $DashboardHost
        ListenerPid = $listener.OwningProcess
        ExpectedProcess = Test-ExpectedDashboardListener
        Healthy = Test-DashboardStageHealth -Stage $stage
        ReleaseId = $stage.releaseId
        SourceVersion = $stage.sourceVersion
        AppRoot = $stage.appRoot
        CommandLine = $process.CommandLine
    } | Format-List
}

function Assert-9RouterStopped {
    if (Get-PortListener) { throw "Port $Port must be stopped before changing the global 9router package." }
    $packageProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
            (Test-CommandLineReferencesPathUnderRoot -CommandLine $_.CommandLine -RootPath $RouterRoot) -and
            (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
    })
    if ($packageProcesses.Count -gt 0) {
        foreach ($proc in $packageProcesses) {
            try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
        Start-Sleep -Milliseconds 500
        $packageProcesses = @(Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -and
                (Test-CommandLineReferencesPathUnderRoot -CommandLine $_.CommandLine -RootPath $RouterRoot) -and
                (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)
        })
    }
    if ($packageProcesses.Count -gt 0) {
        throw "9router package files are still in use by PID(s): $($packageProcesses.ProcessId -join ', ')."
    }
}

function Assert-UpdateWorkPath {
    param([string]$Path)
    $workRoot = [IO.Path]::GetFullPath($UpdateWorkDir).TrimEnd('\')
    $candidate = [IO.Path]::GetFullPath($Path)
    if (-not $candidate.StartsWith("$workRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Update work path escaped the managed root: $candidate"
    }
}

function Test-PreparedCandidateCurrent {
    param([object]$Candidate)
    try {
        Assert-UpdateWorkPath -Path $Candidate.transactionRoot
        Assert-UpdateWorkPath -Path $Candidate.tarball
        Assert-UpdateWorkPath -Path $Candidate.appRoot
        if (-not (Test-Path -LiteralPath $Candidate.transactionRoot) -or
            -not (Test-Path -LiteralPath $Candidate.tarball) -or
            -not (Test-Path -LiteralPath $Candidate.appRoot)) { return $false }
        if (-not $Candidate.sha512) { return $false }
        return (Get-FileHash -LiteralPath $Candidate.tarball -Algorithm SHA512).Hash -eq $Candidate.sha512
    } catch {
        Write-ControlLog "Prepared update candidate failed path or integrity validation: $($_.Exception.Message)"
        return $false
    }
}

function Get-Managed9RouterProcessTree {
    param([int]$RootProcessId)

    $allProcesses = @(Get-CimInstance Win32_Process)
    $processIds = [Collections.Generic.HashSet[int]]::new()
    $processIds.Add($RootProcessId) | Out-Null
    do {
        $added = $false
        foreach ($process in $allProcesses) {
            if ($processIds.Contains([int]$process.ParentProcessId) -and $processIds.Add([int]$process.ProcessId)) {
                $added = $true
            }
        }
    } while ($added)

    @($allProcesses | Where-Object {
        $processIds.Contains([int]$_.ProcessId) -and
            $_.CommandLine -and
            (Test-CommandLineReferencesPathUnderRoot -CommandLine $_.CommandLine -RootPath $RouterRoot)
    })
}

function Get-Managed9RouterRootProcess {
    $listener = Get-PortListener
    if (-not $listener) { return $null }

    $allProcesses = @(Get-CimInstance Win32_Process)
    $processesById = @{}
    foreach ($process in $allProcesses) { $processesById[[int]$process.ProcessId] = $process }
    $current = $processesById[[int]$listener.OwningProcess]
    while ($current) {
        $parent = $processesById[[int]$current.ParentProcessId]
        if (-not $parent -or -not $parent.CommandLine -or
            -not (Test-CommandLineReferencesPathUnderRoot -CommandLine $parent.CommandLine -RootPath $RouterRoot)) { break }
        $current = $parent
    }
    return $current
}

function Stop-Managed9RouterProcessTree {
    param([int]$RootProcessId)

    $targets = @(Get-Managed9RouterProcessTree -RootProcessId $RootProcessId | Sort-Object {
        if ($_.ProcessId -eq $RootProcessId) { 1 } else { 0 }
    })
    foreach ($target in $targets) {
        if (-not (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue)) { continue }
        try {
            $termination = Invoke-CimMethod -InputObject $target -MethodName Terminate -Arguments @{ Reason = 0 }
        } catch {
            if (-not (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue)) { continue }
            throw
        }
        if ($termination.ReturnValue -ne 0) {
            if (-not (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue)) { continue }
            throw "Failed to terminate managed update process PID $($target.ProcessId): $($termination.ReturnValue)"
        }
    }

    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $remaining = @(Get-Managed9RouterProcessTree -RootProcessId $RootProcessId | Where-Object {
            Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        })
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)
    if ($remaining.Count -gt 0) { throw "Managed update process tree did not stop before rollback." }
    Assert-9RouterStopped
}

function Invoke-MaintenanceOperation {
    param(
        [scriptblock]$Operation,
        [int]$WaitMilliseconds = 0
    )

    $maintenanceMutex = [Threading.Mutex]::new($false, "Global\9router-central-maintenance-$Port")
    $maintenanceAcquired = $false
    try {
        try {
            $maintenanceAcquired = $maintenanceMutex.WaitOne($WaitMilliseconds)
        } catch [Threading.AbandonedMutexException] {
            $maintenanceAcquired = $true
        }
        if (-not $maintenanceAcquired) { throw "Another 9router maintenance operation is active." }
        & $Operation
    } finally {
        if ($maintenanceAcquired) { $maintenanceMutex.ReleaseMutex() }
        $maintenanceMutex.Dispose()
    }
}

function Ensure-StartupLauncher {
    $content = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wscript.exe ""$HiddenLauncher""", 0, False
"@
    $current = if (Test-Path -LiteralPath $StartupFile) { Get-Content -Raw -LiteralPath $StartupFile } else { "" }
    if ($current.Trim() -ne $content.Trim() -or -not (Test-Utf16LeBom -Path $StartupFile)) {
        Set-Content -LiteralPath $StartupFile -Value $content -Encoding Unicode
        Write-ControlLog "Repaired the managed Startup launcher."
    }
}

function Ensure-ManagedCommandShims {
    $managedStart = Join-Path $PatchRoot "start-9router.bat"
    if (-not (Test-Path -LiteralPath $managedStart)) {
        throw "Managed 9router command target is missing: $managedStart"
    }

    $shPath = Join-Path $GlobalPrefix "9router"
    $cmdPath = Join-Path $GlobalPrefix "9router.cmd"
    $ps1Path = Join-Path $GlobalPrefix "9router.ps1"
    $shTemplate = @'
#!/bin/sh
# 9router-managed-controller
if [ "$#" -ne 0 ]; then
  echo "The managed 9router command does not accept upstream CLI arguments." >&2
  exit 2
fi
MSYS2_ARG_CONV_EXCL='*'
export MSYS2_ARG_CONV_EXCL
exec cmd.exe /d /c call __MANAGED_START__
'@
    $apostrophe = [string][char]39
    $quotationMark = [string][char]34
    $shellApostropheEscape = $apostrophe + $quotationMark + $apostrophe + $quotationMark + $apostrophe
    $shStartLiteral = $apostrophe + $managedStart.Replace($apostrophe, $shellApostropheEscape) + $apostrophe
    $shContent = $shTemplate.Replace("__MANAGED_START__", $shStartLiteral)
    $cmdContent = @"
@echo off
rem 9router-managed-controller
if not "%~1"=="" (
  echo The managed 9router command does not accept upstream CLI arguments. 1>&2
  exit /b 2
)
call "$managedStart"
exit /b %ERRORLEVEL%
"@
    $ps1Template = @'
# 9router-managed-controller
if ($args.Count -gt 0) {
    Write-Error "The managed 9router command does not accept upstream CLI arguments."
    exit 2
}
& '__MANAGED_START__'
exit $LASTEXITCODE
'@
    $ps1Content = $ps1Template.Replace("__MANAGED_START__", $managedStart.Replace("'", "''"))

    $changed = $false
    foreach ($shim in @(
        @{ Path = $shPath; Content = $shContent; Encoding = "ASCII" },
        @{ Path = $cmdPath; Content = $cmdContent; Encoding = "ASCII" },
        @{ Path = $ps1Path; Content = $ps1Content; Encoding = "UTF8" }
    )) {
        $current = if (Test-Path -LiteralPath $shim.Path) { Get-Content -Raw -LiteralPath $shim.Path } else { "" }
        if ($current.Trim() -ne $shim.Content.Trim()) {
            Set-Content -LiteralPath $shim.Path -Value $shim.Content -Encoding $shim.Encoding
            $changed = $true
        }
    }
    if ($changed) {
        Write-ControlLog "Repaired the managed 9router command shims; bare '9router' now delegates to the isolated two-port controller."
    }
}

function Invoke-PatchSet {
    param(
        [ValidateSet("all", "api", "dashboard")]
        [string]$Scope = "all",
        [string]$AppRoot = (Join-Path $RouterRoot "app")
    )

    if (-not (Test-Path -LiteralPath $PatchScript)) { throw "Patch runner not found: $PatchScript" }
    $resolvedAppRoot = [IO.Path]::GetFullPath($AppRoot).TrimEnd('\')
    $globalAppRoot = [IO.Path]::GetFullPath((Join-Path $RouterRoot "app")).TrimEnd('\')
    if ($Scope -in @("all", "dashboard") -and
        $resolvedAppRoot.Equals($globalAppRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Dashboard patches must target an isolated stage, never the global 9router app root."
    }
    & $NodeExe $PatchScript --scope $Scope --app-root $AppRoot | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Patch runner failed with exit code $LASTEXITCODE" }

    $tests = @($AutomationTest, $DashboardStagingTest, $ApiGatewayTest, $BulkImportNormalizerTest, $ModelAccountRoutingTest, $ProviderDetailPatchTest, $UpdateShimCutoverTest)
    if ($Scope -in @("all", "dashboard")) { $tests += $PatchTest }
    $existingTests = $tests | Where-Object { Test-Path -LiteralPath $_ }
    if ($existingTests.Count -gt 0) {
        $previousAppRoot = $env:NINE_ROUTER_APP
        $hadPreviousAppRoot = Test-Path Env:NINE_ROUTER_APP
        try {
            $env:NINE_ROUTER_APP = $AppRoot
            & $NodeExe --test $existingTests | Out-Host
            if ($LASTEXITCODE -ne 0) { throw "Patch validation failed with exit code $LASTEXITCODE" }
        } finally {
            if ($hadPreviousAppRoot) { $env:NINE_ROUTER_APP = $previousAppRoot }
            else { Remove-Item Env:NINE_ROUTER_APP -ErrorAction SilentlyContinue }
        }
    }
    Write-ControlLog "Patch scope '$Scope' and regression tests passed."
}

function Get-PreparedUpdate {
    try { return Read-JsonState $PreparedUpdateFile }
    catch {
        Write-ControlLog "Prepared update state is invalid: $($_.Exception.Message)"
        return $null
    }
}

function Assert-PreparedUpdateReady {
    $candidate = Get-PreparedUpdate
    if (-not $candidate) { throw "No prepared 9router update is available for cutover." }
    if ($candidate.phase -ne "prepared" -or $candidate.validationSchema -ne "all-patches-v1") {
        throw "Prepared update validation schema or phase is stale."
    }
    $pendingVersion = Get-PendingVersion
    if (-not $pendingVersion -or $pendingVersion -ne $candidate.targetVersion) {
        throw "Prepared update does not match the pending target version."
    }
    $patchScriptHash = (Get-FileHash -LiteralPath $PatchScript -Algorithm SHA256).Hash
    if ($candidate.patchScriptHash -ne $patchScriptHash) {
        throw "Prepared update was validated with a different patch runner."
    }
    if (-not (Test-PreparedCandidateCurrent -Candidate $candidate)) {
        throw "Prepared update failed managed-path or tarball integrity validation."
    }
    $candidatePackageFile = Join-Path (Split-Path -Parent $candidate.appRoot) "package.json"
    if (-not (Test-Path -LiteralPath $candidatePackageFile) -or
        (Get-Content -Raw -LiteralPath $candidatePackageFile | ConvertFrom-Json).version -ne $candidate.targetVersion) {
        throw "Prepared update package identity does not match its target version."
    }
    return $candidate
}

function Prepare-UpdateCandidate {
    param([string]$TargetVersion)

    if (-not $TargetVersion) { throw "Cannot prepare an update without a target version." }
    $patchScriptHash = (Get-FileHash -LiteralPath $PatchScript -Algorithm SHA256).Hash
    $existing = Get-PreparedUpdate
    if ($existing -and $existing.targetVersion -eq $TargetVersion -and
        $existing.validationSchema -eq "all-patches-v1" -and $existing.patchScriptHash -eq $patchScriptHash -and
        (Test-PreparedCandidateCurrent -Candidate $existing)) {
        Write-ControlLog "Reusing prepared 9router $TargetVersion candidate."
        return $existing
    }

    $transactionRoot = Join-Path $UpdateWorkDir ("{0}-{1}" -f $TargetVersion, [guid]::NewGuid().ToString("N"))
    Assert-UpdateWorkPath $transactionRoot
    $downloadDir = Join-Path $transactionRoot "download"
    $extractDir = Join-Path $transactionRoot "candidate"
    New-Item -ItemType Directory -Force -Path $downloadDir, $extractDir | Out-Null

    try {
        Write-ControlLog "Downloading and validating 9router $TargetVersion in isolation."
        $packErrorFile = Join-Path $transactionRoot "npm-pack.stderr.log"
        $packOutput = & $NpmCmd pack "9router@$TargetVersion" --pack-destination $downloadDir --json --ignore-scripts 2> $packErrorFile
        if ($LASTEXITCODE -ne 0) {
            $packError = if (Test-Path -LiteralPath $packErrorFile) { Get-Content -Raw -LiteralPath $packErrorFile } else { "" }
            throw "npm pack failed: $packError"
        }
        $packData = ($packOutput -join [Environment]::NewLine) | ConvertFrom-Json
        $packRecord = @($packData)[0]
        if ($packRecord.name -ne "9router" -or $packRecord.version -ne $TargetVersion) {
            throw "Downloaded package identity did not match 9router@$TargetVersion."
        }

        $tarball = Join-Path $downloadDir $packRecord.filename
        if (-not (Test-Path -LiteralPath $tarball)) { throw "Downloaded tarball not found: $tarball" }
        & $TarExe -xf $tarball -C $extractDir | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Tarball extraction failed with exit code $LASTEXITCODE" }

        $candidateRoot = Join-Path $extractDir "package"
        $candidateAppRoot = Join-Path $candidateRoot "app"
        $candidatePackage = Get-Content -Raw -LiteralPath (Join-Path $candidateRoot "package.json") | ConvertFrom-Json
        if ($candidatePackage.version -ne $TargetVersion -or -not (Test-Path -LiteralPath $candidateAppRoot)) {
            throw "Extracted candidate layout or version is invalid."
        }

        Invoke-PatchSet -Scope all -AppRoot $candidateAppRoot
        $prepared = [pscustomobject]@{
            phase = "prepared"
            validationSchema = "all-patches-v1"
            patchScriptHash = $patchScriptHash
            preparedAt = (Get-Date).ToString("o")
            targetVersion = $TargetVersion
            transactionRoot = $transactionRoot
            tarball = $tarball
            appRoot = $candidateAppRoot
            integrity = $packRecord.integrity
            sha512 = (Get-FileHash -LiteralPath $tarball -Algorithm SHA512).Hash
        }
        Write-JsonState -Path $PreparedUpdateFile -Value $prepared
        Write-ControlLog "Prepared update 9router $TargetVersion passed isolated patch validation."
        return $prepared
    } catch {
        if (Test-Path -LiteralPath $transactionRoot) {
            Assert-UpdateWorkPath $transactionRoot
            Remove-Item -LiteralPath $transactionRoot -Recurse -Force
        }
        throw
    }
}

function Set-TransactionPhase {
    param(
        [object]$Transaction,
        [string]$Phase
    )
    $Transaction.phase = $Phase
    $Transaction.updatedAt = (Get-Date).ToString("o")
    Write-JsonState -Path $TransactionFile -Value $Transaction
}

function Backup-GlobalInstall {
    param([object]$Prepared)

    Assert-9RouterStopped
    $rollbackRoot = Join-Path $Prepared.transactionRoot "rollback"
    $packageParent = Join-Path $rollbackRoot "node_modules"
    $packageBackup = Join-Path $packageParent "9router"
    $shimBackup = Join-Path $rollbackRoot "shims"
    New-Item -ItemType Directory -Force -Path $packageParent, $shimBackup | Out-Null

    $oldVersion = Get-InstalledVersion
    if (Test-Path -LiteralPath $RouterRoot) {
        Copy-Item -LiteralPath $RouterRoot -Destination $packageParent -Recurse -Force
        if (-not (Test-Path -LiteralPath $packageBackup)) { throw "Global package backup was not created." }
    }

    $shimManifest = @()
    foreach ($name in @("9router", "9router.cmd", "9router.ps1")) {
        $livePath = Join-Path $GlobalPrefix $name
        $exists = Test-Path -LiteralPath $livePath
        if ($exists) { Copy-Item -LiteralPath $livePath -Destination (Join-Path $shimBackup $name) -Force }
        $shimManifest += [pscustomobject]@{ name = $name; existed = $exists }
    }

    $transaction = [pscustomobject]@{
        phase = "backup-complete"
        updatedAt = (Get-Date).ToString("o")
        targetVersion = $Prepared.targetVersion
        transactionRoot = $Prepared.transactionRoot
        tarball = $Prepared.tarball
        oldVersion = $oldVersion
        packageBackup = $packageBackup
        rollbackRoot = $rollbackRoot
        shimBackup = $shimBackup
        shims = $shimManifest
    }
    Write-JsonState -Path $TransactionFile -Value $transaction
    Write-ControlLog "Created an exact rollback snapshot for 9router $oldVersion."
    return $transaction
}

function Remove-ManagedCommandShimsForNpmInstall {
    param([object]$Transaction)

    if (-not $Transaction -or $Transaction.phase -notin @("backup-complete", "installing")) {
        throw "Managed npm shims can only be released after a rollback snapshot exists."
    }
    $manifestNames = @($Transaction.shims | ForEach-Object { [string]$_.name })
    foreach ($name in @("9router", "9router.cmd", "9router.ps1")) {
        if ($name -notin $manifestNames) {
            throw "Rollback manifest is missing managed npm shim '$name'."
        }
        $livePath = Join-Path $GlobalPrefix $name
        if (Test-Path -LiteralPath $livePath) { Remove-Item -LiteralPath $livePath -Force }
        if (Test-Path -LiteralPath $livePath) { throw "Managed npm shim remained locked: $livePath" }
    }
    Write-ControlLog "Released snapshotted 9router command shims for npm package installation."
}

function Restore-GlobalInstallExact {
    param([object]$Transaction)

    Assert-9RouterStopped
    try {
        if (Test-Path -LiteralPath $RouterRoot) { Remove-Item -LiteralPath $RouterRoot -Recurse -Force }
        if ($Transaction.oldVersion) {
            if (-not (Test-Path -LiteralPath $Transaction.packageBackup)) { throw "Rollback package snapshot is missing." }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RouterRoot) | Out-Null
            Copy-Item -LiteralPath $Transaction.packageBackup -Destination (Split-Path -Parent $RouterRoot) -Recurse -Force
        }

        foreach ($shim in @($Transaction.shims)) {
            $livePath = Join-Path $GlobalPrefix $shim.name
            if (Test-Path -LiteralPath $livePath) { Remove-Item -LiteralPath $livePath -Force }
            $backupPath = Join-Path $Transaction.shimBackup $shim.name
            if ($shim.existed -and (Test-Path -LiteralPath $backupPath)) {
                Copy-Item -LiteralPath $backupPath -Destination $livePath -Force
            }
        }

        if ((Get-InstalledVersion) -ne $Transaction.oldVersion) { throw "Rollback version verification failed." }
        Ensure-ManagedCommandShims
        Remove-Item -LiteralPath $ApiPatchStateFile -Force -ErrorAction SilentlyContinue
        Set-TransactionPhase -Transaction $Transaction -Phase "rolled-back"
        Write-ControlLog "Restored exact 9router $($Transaction.oldVersion) package and repaired the managed command shims."
    } catch {
        try { Set-TransactionPhase -Transaction $Transaction -Phase "rollback-failed" } catch {}
        throw
    }
}

function Invoke-TransactionalPatchSet {
    param(
        [ValidateSet("api")]
        [string]$Scope = "api"
    )

    Assert-9RouterStopped
    $transactionRoot = Join-Path $UpdateWorkDir ("patch-{0}-{1}" -f $Scope, [guid]::NewGuid().ToString("N"))
    Assert-UpdateWorkPath $transactionRoot
    New-Item -ItemType Directory -Force -Path $transactionRoot | Out-Null
    $prepared = [pscustomobject]@{
        targetVersion = Get-InstalledVersion
        transactionRoot = $transactionRoot
        tarball = $null
    }
    $transaction = Backup-GlobalInstall -Prepared $prepared
    try {
        Set-TransactionPhase -Transaction $transaction -Phase "patching"
        Invoke-PatchSet -Scope $Scope -AppRoot (Join-Path $RouterRoot "app")
        Set-ApiPatchState
        Set-TransactionPhase -Transaction $transaction -Phase "ready-to-start"
        Write-ControlLog "Transactional patch scope '$Scope' passed and is waiting for runtime health."
        return $true
    } catch {
        $patchError = $_.Exception.Message
        try {
            Restore-GlobalInstallExact -Transaction $transaction
            Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
            Write-ControlLog "Patch failed and exact rollback succeeded: $patchError"
            return $false
        } catch {
            throw "Patch failed ($patchError) and exact rollback failed: $($_.Exception.Message)"
        }
    }
}

function Recover-InterruptedUpdate {
    $transaction = Read-JsonState $TransactionFile
    if (-not $transaction) { return }
    if ($transaction.phase -eq "rollback-failed") { throw "A previous 9router rollback failed; automatic start is blocked." }
    if ($transaction.phase -in @("backup-complete", "installing", "installed", "patching", "runtime-starting")) {
        Write-ControlLog "Recovering interrupted update phase '$($transaction.phase)' before start."
        if ($transaction.phase -eq "runtime-starting" -and $transaction.runtimeRootPid) {
            Stop-Managed9RouterProcessTree -RootProcessId ([int]$transaction.runtimeRootPid)
        }
        Restore-GlobalInstallExact -Transaction $transaction
        Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
    }
}

function Commit-PreparedUpdate {
    param([object]$Prepared)

    if (-not (Test-PreparedCandidateCurrent -Candidate $Prepared)) {
        throw "Prepared update candidate failed path or integrity validation before commit."
    }
    $transaction = Backup-GlobalInstall -Prepared $Prepared
    try {
        Set-TransactionPhase -Transaction $transaction -Phase "installing"
        Remove-ManagedCommandShimsForNpmInstall -Transaction $transaction
        & $NpmCmd install -g $Prepared.tarball --prefer-offline --no-audit --no-fund | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "npm update failed with exit code $LASTEXITCODE" }
        if ((Get-InstalledVersion) -ne $Prepared.targetVersion) { throw "Installed version did not match prepared update." }
        Ensure-ManagedCommandShims

        Set-TransactionPhase -Transaction $transaction -Phase "installed"
        Invoke-PatchSet -Scope api -AppRoot (Join-Path $RouterRoot "app")
        Set-ApiPatchState
        Set-TransactionPhase -Transaction $transaction -Phase "ready-to-start"
        Write-ControlLog "Installed and verified 9router $($Prepared.targetVersion); waiting for runtime health."
        return $true
    } catch {
        $updateError = $_.Exception.Message
        try {
            Restore-GlobalInstallExact -Transaction $transaction
            Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
            Write-ControlLog "Update failed and exact rollback succeeded: $updateError"
            return $false
        } catch {
            throw "Update failed ($updateError) and exact rollback failed: $($_.Exception.Message)"
        }
    }
}

function Complete-VerifiedUpdate {
    $transaction = Read-JsonState $TransactionFile
    if (-not $transaction -or $transaction.phase -notin @("ready-to-start", "runtime-starting", "committed", "rolled-back")) { return }
    $isRollback = $transaction.phase -eq "rolled-back"
    if ($isRollback -and (Get-InstalledVersion) -ne $transaction.oldVersion) {
        throw "Rolled-back runtime version does not match the exact snapshot."
    }
    Set-TransactionPhase -Transaction $transaction -Phase $(if ($isRollback) { "rollback-complete" } else { "committed" })
    Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
    if ($transaction.transactionRoot -and (Test-Path -LiteralPath $transaction.transactionRoot)) {
        Assert-UpdateWorkPath $transaction.transactionRoot
        Remove-Item -LiteralPath $transaction.transactionRoot -Recurse -Force
    }
    Remove-Item -LiteralPath $TransactionFile -Force -ErrorAction SilentlyContinue
    if ($isRollback) { Write-ControlLog "Cleaned the rollback snapshot after restored runtime health passed." }
    else { Write-ControlLog "Committed the verified update after runtime health passed." }
}

function Mark-UpdateRuntimeStarting {
    param([int]$RootProcessId)
    $transaction = Read-JsonState $TransactionFile
    if (-not $transaction -or $transaction.phase -ne "ready-to-start") { return }
    $transaction | Add-Member -NotePropertyName runtimeRootPid -NotePropertyValue $RootProcessId -Force
    $transaction | Add-Member -NotePropertyName runtimeStartedAt -NotePropertyValue (Get-Date).ToString("o") -Force
    Set-TransactionPhase -Transaction $transaction -Phase "runtime-starting"
}

function Rollback-UnhealthyVerifiedRuntime {
    param([int]$RootProcessId)
    $transaction = Read-JsonState $TransactionFile
    if (-not $transaction -or $transaction.phase -ne "runtime-starting") { return $false }
    Write-ControlLog "Verified update did not become healthy; restoring the exact previous package."
    Stop-Managed9RouterProcessTree -RootProcessId $RootProcessId
    Restore-GlobalInstallExact -Transaction $transaction
    Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
    return $true
}

function Invoke-UpdateWhenStopped {
    $pendingVersion = Get-PendingVersion
    if (Get-PortListener) {
        $latest = Get-LatestVersion
        $installed = Get-InstalledVersion
        $targetVersion = if ($pendingVersion) { $pendingVersion } elseif ($latest) { $latest } else { $installed }
        if (-not $targetVersion) { throw "Could not resolve an installed or registry version for the update request." }
        if ($installed -eq $targetVersion) {
            if ($pendingVersion) {
                Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
            }
            Write-ControlLog "9router $installed is current; no global update was queued."
            return 0
        }
        if ($installed -ne $targetVersion) { Prepare-UpdateCandidate -TargetVersion $targetVersion | Out-Null }
        Set-PendingUpdate $targetVersion
        Write-ControlLog "Update deferred because port $Port is active."
        return 2
    }

    Assert-9RouterStopped
    Recover-InterruptedUpdate
    $verifiedTransaction = Read-JsonState $TransactionFile
    if ($verifiedTransaction -and $verifiedTransaction.phase -eq "ready-to-start") { return 0 }

    $installed = Get-InstalledVersion
    $latest = Get-LatestVersion
    $targetVersion = if ($pendingVersion) {
        $pendingVersion
    } elseif ([bool]$Config.checkUpdateWhenStopped -and $latest) {
        $latest
    } else {
        $installed
    }
    if ($targetVersion -and $installed -ne $targetVersion) {
        try {
            $prepared = Prepare-UpdateCandidate -TargetVersion $targetVersion
        } catch {
            Write-ControlLog "Update candidate $targetVersion was rejected before global install: $($_.Exception.Message)"
            Remove-Item -LiteralPath $PendingUpdateFile, $PreparedUpdateFile -Force -ErrorAction SilentlyContinue
            $fallbackPatched = Invoke-TransactionalPatchSet -Scope api
            if ($fallbackPatched) {
                Write-ControlLog "Starting verified installed version $installed after rejecting update $targetVersion."
                return 0
            }
            return 3
        }
        $updateInstalled = Commit-PreparedUpdate -Prepared $prepared
        if (-not $updateInstalled) {
            $fallbackPatched = Invoke-TransactionalPatchSet -Scope api
            if ($fallbackPatched) { return 0 }
            return 3
        }
        return 0
    }

    if (Test-ApiPatchStateCurrent) {
        Write-ControlLog "API patch fingerprint is current; skipped unchanged backup and regression run."
        return 0
    }
    $patchApplied = Invoke-TransactionalPatchSet -Scope api
    if (-not $patchApplied) { return 3 }
    return 0
}

function Invoke-PreparedUpdateWhenStopped {
    param([object]$Candidate)

    Assert-9RouterStopped
    $current = Assert-PreparedUpdateReady
    if ($current.targetVersion -ne $Candidate.targetVersion -or
        $current.sha512 -ne $Candidate.sha512 -or
        $current.transactionRoot -ne $Candidate.transactionRoot) {
        throw "Prepared update changed after the cutover preflight."
    }

    $transaction = Read-JsonState $TransactionFile
    if ($transaction -and $transaction.phase -eq "ready-to-start" -and
        $transaction.targetVersion -eq $current.targetVersion -and
        (Get-InstalledVersion) -eq $current.targetVersion) {
        Write-ControlLog "Resuming prepared 9router $($current.targetVersion) after a completed package commit."
        return 0
    }
    if ($transaction) {
        Recover-InterruptedUpdate
        $current = Assert-PreparedUpdateReady
    }

    if ((Get-InstalledVersion) -eq $current.targetVersion) {
        if (Invoke-TransactionalPatchSet -Scope api) { return 0 }
        return 3
    }
    if (Commit-PreparedUpdate -Prepared $current) { return 0 }
    return 3
}

function Start-9RouterWhenStopped {
    param([switch]$SkipUpdate)

    $listener = Get-PortListener
    if ($listener) {
        if (-not (Test-ExpectedListener)) {
            throw "Port $Port is owned by an unexpected process (PID $($listener.OwningProcess))."
        }
        if (Test-9RouterHealth) {
            if (-not (Test-ApiPatchStateCurrent)) {
                Write-ControlLog "9router is healthy on port $Port, but API patch state is missing or stale; patching is deferred until the API is stopped."
                return $false
            }
            Complete-VerifiedUpdate
            Write-ControlLog "9router is healthy on port $Port; preserving PID $($listener.OwningProcess)."
            return $true
        }
        $runtimeTransaction = Read-JsonState $TransactionFile
        if ($runtimeTransaction -and $runtimeTransaction.phase -eq "runtime-starting") {
            $runtimeDeadline = ([datetime]$runtimeTransaction.runtimeStartedAt).AddSeconds([int]$Config.startTimeoutSeconds)
            if ((Get-Date) -ge $runtimeDeadline) {
                if (Rollback-UnhealthyVerifiedRuntime -RootProcessId ([int]$runtimeTransaction.runtimeRootPid)) {
                    return Start-9RouterWhenStopped -SkipUpdate
                }
            }
            Write-ControlLog "Verified update listener is still inside its runtime health grace period."
            return $false
        }
        Write-ControlLog "Port $Port still has a 9router listener but health is degraded; no automatic restart was attempted."
        return $false
    }

    if (-not $SkipUpdate) {
        Recover-InterruptedUpdate
        $updateResult = Invoke-UpdateWhenStopped
        if ($updateResult -ne 0) {
            Write-ControlLog "API start blocked because update or patch verification returned $updateResult."
            return $false
        }
    } elseif (-not (Test-ApiPatchStateCurrent)) {
        $patchApplied = Invoke-TransactionalPatchSet -Scope api
        if (-not $patchApplied) {
            Write-ControlLog "API start blocked because the installed package could not be patched and verified."
            return $false
        }
    }
    $arguments = @(
        "`"$RouterCli`"",
        "--no-browser",
        "--tray",
        "--port", "$Port",
        "--host", "$BindHost",
        "--skip-update"
    )
    $process = Start-Process -FilePath $NodeExe -ArgumentList $arguments -WindowStyle Hidden -PassThru
    Mark-UpdateRuntimeStarting -RootProcessId $process.Id
    Write-ControlLog "Started the 9router CLI supervisor as PID $($process.Id)."

    $deadline = (Get-Date).AddSeconds([int]$Config.startTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 250
        if (Test-9RouterHealth) {
            Write-ControlLog "9router is ready on port $Port."
            Complete-VerifiedUpdate
            return $true
        }
    } while ((Get-Date) -lt $deadline)

    $runtimeTransaction = Read-JsonState $TransactionFile
    if ($runtimeTransaction -and $runtimeTransaction.phase -eq "runtime-starting" -and
        [int]$runtimeTransaction.runtimeRootPid -eq $process.Id) {
        if (Rollback-UnhealthyVerifiedRuntime -RootProcessId $process.Id) {
            return Start-9RouterWhenStopped -SkipUpdate
        }
    }
    Write-ControlLog "9router did not become healthy before the startup timeout; the process was left intact for diagnosis."
    return $false
}

function Restart-9RouterApi {
    $listener = Get-PortListener
    $dashboardBefore = Get-DashboardPortListener
    $dashboardPidBefore = if ($dashboardBefore) { [int]$dashboardBefore.OwningProcess } else { 0 }

    if ($listener) {
        if (-not (Test-ExpectedListener)) {
            throw "Port $Port is owned by an unexpected process (PID $($listener.OwningProcess))."
        }
        $rootProcess = Get-Managed9RouterRootProcess
        if (-not $rootProcess) { throw "Could not resolve the managed 9router API root process." }
        Write-ControlLog "Restarting only the 9router API process tree rooted at PID $($rootProcess.ProcessId)."
        Stop-Managed9RouterProcessTree -RootProcessId ([int]$rootProcess.ProcessId)
    }

    if (-not (Start-9RouterWhenStopped -SkipUpdate)) {
        throw "9router API did not become healthy after the controlled restart."
    }
    $dashboardAfter = Get-DashboardPortListener
    $dashboardPidAfter = if ($dashboardAfter) { [int]$dashboardAfter.OwningProcess } else { 0 }
    if ($dashboardPidAfter -ne $dashboardPidBefore) {
        throw "Dashboard listener changed during the API-only restart."
    }
    $newListener = Get-PortListener
    Write-ControlLog "API-only restart completed on port $Port as PID $($newListener.OwningProcess); dashboard PID $dashboardPidBefore was preserved."
    return $true
}

function Show-Status {
    $listener = Get-PortListener
    $process = Get-ListenerProcess
    $dashboardListener = Get-DashboardPortListener
    $dashboardStage = Get-DashboardStageState
    [pscustomobject]@{
        ApiPort = $Port
        ApiListenerPid = $listener.OwningProcess
        ApiExpectedProcess = Test-ExpectedListener
        ApiPatchesCurrent = Test-ApiPatchStateCurrent
        ApiHealth = Test-Endpoint "/api/health"
        ModelsHealth = Test-Endpoint "/v1/models"
        DashboardPort = $DashboardPort
        DashboardListenerPid = $dashboardListener.OwningProcess
        DashboardExpectedProcess = Test-ExpectedDashboardListener
        DashboardHealth = Test-DashboardStageHealth -Stage $dashboardStage
        DashboardRelease = $dashboardStage.releaseId
        InstalledVersion = Get-InstalledVersion
        PendingUpdate = Test-Path -LiteralPath $PendingUpdateFile
        PreparedUpdate = Test-Path -LiteralPath $PreparedUpdateFile
        UpdatePhase = (Read-JsonState $TransactionFile).phase
        ApiCommandLine = $process.CommandLine
    } | Format-List
}

function Start-Monitor {
    $mutex = [Threading.Mutex]::new($false, "Global\9router-central-monitor-$Port")
    try {
        try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (-not $acquired) {
            Write-ControlLog "Another central monitor is already active."
            return
        }

        Write-MonitorState -Phase "starting"
        Ensure-StartupLauncher
        Ensure-ManagedCommandShims
        $lastUpdateCheck = [datetime]::MinValue
        while ($true) {
            try {
                Write-MonitorState -Phase "running"
                Ensure-StartupLauncher
                Ensure-ManagedCommandShims
                Invoke-MaintenanceOperation -WaitMilliseconds 0 -Operation {
                    Start-9RouterWhenStopped | Out-Null
                    Maintain-DashboardStage | Out-Null
                }
                if ((Get-Date) -ge $lastUpdateCheck.AddMinutes([int]$Config.updateCheckIntervalMinutes)) {
                    $latest = Get-LatestVersion
                    $installed = Get-InstalledVersion
                    if ($latest -and $installed -ne $latest) {
                        Set-PendingUpdate $latest
                        Write-ControlLog "Update $latest is pending until port $Port is stopped."
                    }
                    $lastUpdateCheck = Get-Date
                }
            } catch {
                Write-ControlLog "Monitor error: $($_.Exception.Message)"
            }
            Start-Sleep -Seconds ([int]$Config.monitorIntervalSeconds)
        }
    } finally {
        try {
            $monitorState = Read-JsonState $MonitorStateFile
            if ($monitorState -and [int]$monitorState.pid -eq $PID) {
                Remove-Item -LiteralPath $MonitorStateFile -Force -ErrorAction SilentlyContinue
            }
        } catch {}
        if ($acquired) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

switch ($Action) {
    "Monitor" { Start-Monitor }
    "EnsureRunning" {
        Ensure-ManagedCommandShims
        $started = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            $apiReady = Start-9RouterWhenStopped
            if (-not $apiReady) { return $false }
            return Maintain-DashboardStage
        }
        if (-not $started) { exit 1 }
    }
    "RestartApi" {
        $restarted = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            Restart-9RouterApi
        }
        if (-not $restarted) { exit 1 }
    }
    "InstallPreparedUpdate" {
        $installed = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            $preflightCandidate = Assert-PreparedUpdateReady
            $dashboardBefore = Get-DashboardPortListener
            $dashboardPidBefore = if ($dashboardBefore) { [int]$dashboardBefore.OwningProcess } else { 0 }
            try {
                $listener = Get-PortListener
                if ($listener) {
                    if (-not (Test-ExpectedListener)) {
                        throw "Port $Port is owned by an unexpected process (PID $($listener.OwningProcess))."
                    }
                    $rootProcess = Get-Managed9RouterRootProcess
                    if (-not $rootProcess) { throw "Could not resolve the managed 9router API root process." }
                    Write-ControlLog "Stopping only the 9router API process tree rooted at PID $($rootProcess.ProcessId) for prepared-update cutover."
                    Stop-Managed9RouterProcessTree -RootProcessId ([int]$rootProcess.ProcessId)
                }

                $dashboardDuring = Get-DashboardPortListener
                $dashboardPidDuring = if ($dashboardDuring) { [int]$dashboardDuring.OwningProcess } else { 0 }
                if ($dashboardPidDuring -ne $dashboardPidBefore) {
                    throw "Dashboard listener changed while only the API process tree was stopped."
                }

                $postStopCandidate = Assert-PreparedUpdateReady
                if ($postStopCandidate.targetVersion -ne $preflightCandidate.targetVersion -or
                    $postStopCandidate.sha512 -ne $preflightCandidate.sha512 -or
                    $postStopCandidate.transactionRoot -ne $preflightCandidate.transactionRoot) {
                    throw "Prepared update changed after API downtime began."
                }
                $updateExitCode = Invoke-PreparedUpdateWhenStopped -Candidate $preflightCandidate
                if ($updateExitCode -ne 0) {
                    throw "Prepared-update cutover was blocked because update verification returned $updateExitCode."
                }
                if (-not (Start-9RouterWhenStopped -SkipUpdate)) {
                    throw "Prepared-update cutover did not restore a healthy API runtime."
                }
            } catch {
                $cutoverError = $_.Exception.Message
                $apiRecovered = $false
                try {
                    if (Test-9RouterHealth) { $apiRecovered = $true }
                    elseif (-not (Get-PortListener)) { $apiRecovered = Start-9RouterWhenStopped -SkipUpdate }
                } catch {
                    Write-ControlLog "API recovery after prepared-update failure also failed: $($_.Exception.Message)"
                }
                if ($apiRecovered) { throw "Prepared-update cutover failed but the API was restored: $cutoverError" }
                throw "Prepared-update cutover failed and API recovery did not pass health: $cutoverError"
            }

            $dashboardAfterApi = Get-DashboardPortListener
            $dashboardPidAfterApi = if ($dashboardAfterApi) { [int]$dashboardAfterApi.OwningProcess } else { 0 }
            if ($dashboardPidAfterApi -ne $dashboardPidBefore) {
                Write-ControlLog "Dashboard listener changed before explicit post-update maintenance; rebuilding the isolated stage."
            }
            try {
                if (-not (Maintain-DashboardStage)) { throw "Dashboard stage health did not pass." }
            } catch {
                Write-ControlLog "API update committed successfully; dashboard maintenance was deferred to the central monitor: $($_.Exception.Message)"
            }
            return $true
        }
        if (-not $installed) { exit 1 }
    }
    "Health" { if (Test-9RouterHealth) { Write-Output "healthy"; exit 0 } else { Write-Output "unhealthy"; exit 1 } }
    "Status" { Show-Status }
    "CheckUpdate" {
        $installed = Get-InstalledVersion
        $latest = Get-LatestVersion
        [pscustomobject]@{ Installed = $installed; Latest = $latest; UpdateAvailable = ($latest -and $installed -ne $latest) } | Format-List
    }
    "Update" {
        $updateExitCode = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            Invoke-UpdateWhenStopped
        }
        exit ([int]$updateExitCode)
    }
    "ApplyPatches" {
        $patchExitCode = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            if ($Scope -eq "dashboard") {
                $candidate = Prepare-DashboardStage -SourceVersion (Get-InstalledVersion)
                Restart-DashboardStage -Stage $candidate | Out-Null
                return 0
            }
            if (Get-PortListener) {
                Write-ControlLog "Patch application deferred because port $Port is active."
                return 2
            }
            Assert-9RouterStopped
            $patchApplied = Invoke-TransactionalPatchSet -Scope api
            if ($patchApplied) { return 0 }
            return 3
        }
        exit ([int]$patchExitCode)
    }
    "StageDashboard" {
        $staged = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            $candidate = Prepare-DashboardStage -SourceVersion (Get-InstalledVersion)
            return Restart-DashboardStage -Stage $candidate
        }
        if (-not $staged) { exit 1 }
    }
    "StartDashboard" {
        $started = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            $stage = Get-DashboardStageState
            if ($stage) { return Start-DashboardStage -Stage $stage }
            return Maintain-DashboardStage
        }
        if (-not $started) { exit 1 }
    }
    "RestartDashboard" {
        $restarted = Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            $stage = Get-DashboardStageState
            if (-not $stage) { $stage = Prepare-DashboardStage -SourceVersion (Get-InstalledVersion) }
            return Restart-DashboardStage -Stage $stage
        }
        if (-not $restarted) { exit 1 }
    }
    "DashboardStatus" { Show-DashboardStageStatus }
    "StopDashboard" {
        Invoke-MaintenanceOperation -WaitMilliseconds 30000 -Operation {
            Stop-DashboardStage | Out-Null
        }
    }
}
