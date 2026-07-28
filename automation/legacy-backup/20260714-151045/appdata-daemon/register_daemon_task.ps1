# register_daemon_task.ps1
$ErrorActionPreference = "Stop"

$TaskName = "9Router_Daemon_Task"
$StartupFolder = "C:\Users\Linh\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
$OldShortcut = Join-Path $StartupFolder "Start_9Router_Background.lnk"
$MonitorTaskHidden = "C:\Users\Linh\AppData\Roaming\9router\daemon\monitor_task_hidden.vbs"

# 1. Clean up old Startup folder shortcut if it exists
if (Test-Path $OldShortcut) {
    Write-Host "Removing old Startup folder shortcut..."
    Remove-Item $OldShortcut -Force
}

# 2. Unregister any existing tasks with the same name
Write-Host "Cleaning up existing tasks..."
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

# 3. Create the new task action and trigger
Write-Host "Registering new scheduled task..."
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$MonitorTaskHidden"""

# Start at logon and repeat every 1 minute as a safety net if the persistent monitor exits.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$periodicTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)

# Task settings: allow on battery, run as soon as available after boot/missed schedules
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

# Register the task under the current user context. Some Windows policies deny
# Register-ScheduledTask, so fall back to schtasks.exe if needed.
$registeredWithPowerShell = $false
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logonTrigger, $periodicTrigger) -Settings $settings -Force | Out-Null
    $registeredWithPowerShell = $true
} catch {
    Write-Warning "Register-ScheduledTask failed: $($_.Exception.Message)"
    Write-Host "Falling back to schtasks.exe..."

    $taskCmd = 'wscript.exe "C:\Users\Linh\AppData\Roaming\9router\daemon\monitor_task_hidden.vbs"'
    schtasks.exe /Create /TN $TaskName /SC MINUTE /MO 1 /TR $taskCmd /F /RL LIMITED | Out-Host

    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $taskSettings = $task.Settings
        $taskSettings.DisallowStartIfOnBatteries = $false
        $taskSettings.StopIfGoingOnBatteries = $false
        $taskSettings.MultipleInstances = 'IgnoreNew'
        $taskSettings.ExecutionTimeLimit = 'PT5M'
        Set-ScheduledTask -TaskName $TaskName -Settings $taskSettings | Out-Null
    } catch {
        Write-Warning "Could not adjust fallback task settings: $($_.Exception.Message)"
    }
}

# 4. Start the task immediately to initialize/check the service. The monitor task
# preserves the running 9router API when /v1/models is healthy.
Write-Host "Starting the scheduled task immediately..."
if ($registeredWithPowerShell) {
    Start-ScheduledTask -TaskName $TaskName
} else {
    schtasks.exe /Run /TN $TaskName | Out-Host
}

Write-Host "Successfully registered and started $TaskName!"
