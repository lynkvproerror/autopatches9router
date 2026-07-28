# check_status.ps1
$ErrorActionPreference = "SilentlyContinue"
$TargetPort = 53220
$TaskName = "9Router_Daemon_Task"

Write-Host "--- Node Processes ---"
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
    [PSCustomObject]@{
        ProcessId   = $_.ProcessId
        CommandLine = $_.CommandLine
    }
} | Format-Table -AutoSize

Write-Host "--- Windows Scheduled Task Status ---"
Get-ScheduledTask -TaskName $TaskName | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
    [PSCustomObject]@{
        TaskName    = $_.TaskName
        State       = $_.State
        LastRunTime = $info.LastRunTime
        LastTaskResult = $info.LastTaskResult
        NextRunTime = $info.NextRunTime
    }
} | Format-Table -AutoSize

Write-Host "--- TCP Connections on Port $TargetPort ---"
Get-NetTCPConnection -LocalPort $TargetPort | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Format-Table -AutoSize

Write-Host "--- Daemon Log File ---"
if (Test-Path "C:\Users\Linh\AppData\Roaming\9router\daemon\daemon_log.txt") {
    Get-Content "C:\Users\Linh\AppData\Roaming\9router\daemon\daemon_log.txt" -Tail 15
} else {
    Write-Host "Log file not found."
}
