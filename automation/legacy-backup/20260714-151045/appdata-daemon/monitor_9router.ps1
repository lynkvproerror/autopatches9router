# monitor_9router.ps1
$ErrorActionPreference = "SilentlyContinue"
$LogFile = "C:\Users\Linh\AppData\Roaming\9router\daemon\daemon_log.txt"
$LastOpenFile = "C:\Users\Linh\AppData\Roaming\9router\daemon\last_browser_open.txt"
$TargetPort = 53220
$HasOpenedBrowser = $false
$OpenDashboardAutomatically = $false
$NodeExe = "C:\Program Files\nodejs\node.exe"
$RouterCli = "C:\Users\Linh\AppData\Roaming\npm\node_modules\9router\cli.js"
$PatchScript = "D:\Downloads\converjson\9router-patches\apply-patches.js"

function Apply-9RouterPatches {
    if (Test-Path $PatchScript) {
        Log-Message "Applying custom patches..."
        try {
            $output = & $NodeExe $PatchScript 2>&1 | Out-String
            Log-Message "Patches: $output"
        } catch {
            Log-Message "Warning: Patch script failed: $_"
        }
    }
}

function Log-Message($Message) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogLine = "[$Timestamp] $Message"
    Write-Output $LogLine
    
    # Limit log size to ~5MB to prevent filling up disk
    if (Test-Path $LogFile) {
        $size = (Get-Item $LogFile).Length
        if ($size -gt 5MB) {
            Clear-Content $LogFile
            Add-Content -Path $LogFile -Value "[$Timestamp] Log cleared due to size limit (> 5MB)"
        }
    }
    Add-Content -Path $LogFile -Value $LogLine
}

function Test-AnotherPersistentMonitor {
    $thisPid = $PID
    $monitorPath = "C:\Users\Linh\AppData\Roaming\9router\daemon\monitor_9router.ps1"
    $escapedMonitorPath = [Regex]::Escape($monitorPath)

    $otherMonitor = Get-CimInstance Win32_Process | Where-Object {
        ($_.ProcessId -ne $thisPid) -and
        ($_.CommandLine -match $escapedMonitorPath) -and
        ($_.CommandLine -notmatch "Get-CimInstance|Select-Object|Format-List|Where-Object")
    } | Select-Object -First 1

    return ($null -ne $otherMonitor)
}

function Test-ShouldOpenBrowser {
    if ($HasOpenedBrowser) {
        return $false
    }

    if (-not (Test-Path $LastOpenFile)) {
        return $true
    }

    $lastOpenStr = Get-Content $LastOpenFile -Raw -ErrorAction SilentlyContinue
    if (-not $lastOpenStr) {
        return $true
    }

    try {
        $lastOpenDate = [DateTime]::Parse($lastOpenStr.Trim())
        return ((Get-Date) -gt $lastOpenDate.AddHours(10))
    } catch {
        return $true
    }
}

function Test-9RouterHealth {
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/v1/models" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return ($res.StatusCode -eq 200)
    } catch {
        $response = $_.Exception.Response
        if ($response) {
            $statusCode = [int]$response.StatusCode
            return ($statusCode -in @(200, 401, 403))
        }
        return $false
    }
}

function Get-9RouterNodeProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $cmd = $_.CommandLine
        ($cmd -like "*node_modules\9router\cli.js*") -or
        ($cmd -like "*node_modules\9router\app\custom-server.js*") -or
        ($cmd -like "*node_modules\9router\app\server.js*")
    }
}

if (Test-AnotherPersistentMonitor) {
    Log-Message "Another persistent 9router monitor is already running. Exiting this duplicate monitor."
    exit 0
}

Log-Message "9router Daemon Monitor started."
Apply-9RouterPatches

$FailedChecks = 0
while ($true) {
    $isHealthy = Test-9RouterHealth
    if ($isHealthy) {
        $FailedChecks = 0
        # Open browser to the dashboard ONLY ONCE when the monitor script starts up and server is ready
        if ($OpenDashboardAutomatically -and (Test-ShouldOpenBrowser)) {
            Log-Message "9router API is healthy. Opening dashboard in browser..."
            Start-Process "http://localhost:$TargetPort/dashboard/usage"
            $HasOpenedBrowser = $true
            (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") | Out-File -FilePath $LastOpenFile -Force
        }
        
        # 9router is running and responding, check again in 10 seconds
        Start-Sleep -Seconds 10
    } else {
        $FailedChecks++
        if ($FailedChecks -lt 3) {
            Log-Message "Warning: 9router API health check failed ($FailedChecks/3). Retrying in 10 seconds..."
            Start-Sleep -Seconds 10
            continue
        }
        
        $FailedChecks = 0
        Log-Message "9router API is NOT healthy on port $TargetPort after 3 attempts. Starting 9router..."
        
        # Kill only genuine 9router Node processes. Do not match generic Next.js servers or Codex kernels.
        Get-9RouterNodeProcesses | ForEach-Object {
            Log-Message "Found unhealthy 9router process (PID: $($_.ProcessId)). Terminating it."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        
        # Apply patches before starting (in case of npm update)
        Apply-9RouterPatches
        
        # Run 9router in tray mode, hidden, on the configured port.
        $proc = Start-Process -FilePath $NodeExe -ArgumentList """$RouterCli"" --no-browser --tray --port $TargetPort --skip-update" -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
        
        if ($proc) {
            Log-Message "Started 9router process (PID: $($proc.Id)). Waiting 8 seconds for it to initialize..."
            Start-Sleep -Seconds 8
            
            if (Test-9RouterHealth) {
                Log-Message "9router API is now successfully responding on port $TargetPort."
            } else {
                Log-Message "Warning: 9router process started (PID: $($proc.Id)) but API is not responding yet. Will check again."
            }
        } else {
            Log-Message "CRITICAL: Failed to start 9router process. Will retry in 10 seconds."
            Start-Sleep -Seconds 10
        }
    }
}
