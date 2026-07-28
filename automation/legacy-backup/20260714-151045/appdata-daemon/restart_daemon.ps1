# restart_daemon.ps1
$ErrorActionPreference = "SilentlyContinue"

$TargetPort = 53220
$MonitorScript = "C:\Users\Linh\AppData\Roaming\9router\daemon\monitor_9router.ps1"
$HiddenLauncher = "C:\Users\Linh\AppData\Roaming\9router\daemon\start_9router_hidden.vbs"

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

function Test-MonitorRunning {
    $escaped = [Regex]::Escape($MonitorScript)
    $monitor = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -match $escaped
    } | Select-Object -First 1
    return ($null -ne $monitor)
}

function Start-HiddenMonitor {
    Write-Host "Starting the daemon monitor via hidden VBScript..."
    $wsh = New-Object -ComObject WScript.Shell
    $wsh.Run("wscript.exe ""$HiddenLauncher""", 0, $false) | Out-Null
}

$isHealthy = Test-9RouterHealth

if ($isHealthy) {
    Write-Host "9router API is healthy on port $TargetPort. Preserving the running API process."
    if (Test-MonitorRunning) {
        Write-Host "Daemon monitor is already running. No restart needed."
    } else {
        Start-HiddenMonitor
        Write-Host "Monitor was missing and has been started. Existing 9router API was not stopped."
    }
} else {
    Write-Host "9router API is not healthy. Restarting only genuine 9router Node processes..."
    Get-9RouterNodeProcesses | ForEach-Object {
        Write-Host "Killing unhealthy 9router process: $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force
    }
    Start-HiddenMonitor
}

Write-Host "Waiting 5 seconds for verification..."
Start-Sleep -Seconds 5

Write-Host "Done. Checking status..."
powershell -ExecutionPolicy Bypass -File "C:\Users\Linh\AppData\Roaming\9router\daemon\check_status.ps1"
