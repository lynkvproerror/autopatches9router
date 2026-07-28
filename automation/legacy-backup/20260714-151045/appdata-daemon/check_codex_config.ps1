# check_codex_config.ps1
$ErrorActionPreference = "SilentlyContinue"

Write-Host "--- Checking for .codex directories ---"
Get-ChildItem -Path "C:\Users\Linh" -Filter "*codex*" -Directory -Force | Select-Object FullName

Write-Host "--- Checking AppData for Codex ---"
Get-ChildItem -Path "C:\Users\Linh\AppData\Local", "C:\Users\Linh\AppData\Roaming" -Filter "*codex*" -Directory -Force | Select-Object FullName

Write-Host "--- Searching for config files ---"
Get-ChildItem -Path "C:\Users\Linh\.codex", "C:\Users\Linh\AppData\Local\OpenAI\Codex" -Recurse -File -Force | Select-Object FullName

Write-Host "--- Port check on any Codex/Node process ---"
Get-NetTCPConnection | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and ($proc.Name -eq "node" -or $proc.CommandLine -like "*Codex*")) {
        [PSCustomObject]@{
            PID         = $_.OwningProcess
            Name        = $proc.Name
            LocalPort   = $_.LocalPort
            State       = $_.State
            CommandLine = $proc.CommandLine
        }
    }
} | Format-Table -AutoSize
