# monitor_task.ps1
$ErrorActionPreference = "SilentlyContinue"
$LogFile = "C:\Users\Linh\AppData\Roaming\9router\daemon\daemon_log.txt"
$LastOpenFile = "C:\Users\Linh\AppData\Roaming\9router\daemon\last_browser_open.txt"
$TargetPort = 53220
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

function Test-9RouterHealth {
    try {
        # Verify the OpenAI-compatible API endpoint Codex uses, not just the dashboard.
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$TargetPort/v1/models" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
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

# 1. Clean up duplicate or orphaned 9router processes that are not holding the active listening port
$activePID = (Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
$parentPID = $null
if ($activePID) {
    $parentPID = (Get-CimInstance Win32_Process -Filter "ProcessId = $activePID").ParentProcessId
}

Get-9RouterNodeProcesses | ForEach-Object {
    $cmd = $_.CommandLine
    $procId = $_.ProcessId

    if ($procId -ne $activePID -and $procId -ne $parentPID) {
        Log-Message "Found redundant 9router process (PID: $procId). Terminating it."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

# 2. Verify health with retries and restore if down
$isHealthy = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
    if (Test-9RouterHealth) {
        $isHealthy = $true
        break
    }
    if ($attempt -lt 3) {
        Log-Message "Warning: Health check failed (attempt $attempt/3). Retrying in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}

if ($isHealthy) {
    # 9router is running and responding.
    # Check if we should open the browser
    $shouldOpen = $false
    if (-not $OpenDashboardAutomatically) {
        $shouldOpen = $false
    } elseif (-not (Test-Path $LastOpenFile)) {
        $shouldOpen = $true
    } else {
        $lastOpenStr = Get-Content $LastOpenFile -Raw -ErrorAction SilentlyContinue
        if ($lastOpenStr) {
            try {
                $lastOpenDate = [DateTime]::Parse($lastOpenStr.Trim())
                # If last open was more than 10 hours ago, open it again
                if ((Get-Date) -gt $lastOpenDate.AddHours(10)) {
                    $shouldOpen = $true
                }
            } catch {
                $shouldOpen = $true
            }
        } else {
            $shouldOpen = $true
        }
    }
    
    if ($shouldOpen) {
        Log-Message "Server is active. Opening dashboard in browser..."
        Start-Process "http://localhost:$TargetPort/dashboard/usage"
        (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") | Out-File -FilePath $LastOpenFile -Force
    }
} else {
    Log-Message "9router is NOT responding on port $TargetPort. Restoring service..."
    
    # Kill any remaining node processes for 9router
    Get-9RouterNodeProcesses | ForEach-Object {
        $procId = $_.ProcessId
        Log-Message "Terminating process (PID: $procId) to prepare for clean start."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    
    # Apply patches before starting (in case of npm update)
    Apply-9RouterPatches
    
    # Start 9router hidden. Do not use -NoNewWindow here: under Task Scheduler it can flash a console window.
    $proc = Start-Process -FilePath $NodeExe -ArgumentList """$RouterCli"" --no-browser --tray --port $TargetPort --skip-update" -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
    
    if ($proc) {
        Log-Message "Launched 9router process (PID: $($proc.Id)). Waiting 8 seconds for initialization..."
        Start-Sleep -Seconds 8
        
        if (Test-9RouterHealth) {
            Log-Message "9router is now successfully responding on port $TargetPort."
            
            # Open browser to the dashboard
            if ($OpenDashboardAutomatically) {
                Log-Message "Opening dashboard in browser..."
                Start-Process "http://localhost:$TargetPort/dashboard/usage"
                (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") | Out-File -FilePath $LastOpenFile -Force
            }
        } else {
            Log-Message "Warning: 9router process started (PID: $($proc.Id)) but port $TargetPort is not responding yet. Will check on next schedule."
        }
    } else {
        Log-Message "CRITICAL: Failed to launch 9router process."
    }
}
