[CmdletBinding()]
param(
    [ValidateSet("dashboard", "api", "all")]
    [string]$Scope = "dashboard"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$controller = Join-Path $root "automation\9router-control.ps1"
$pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$pwsh = if ($pwshCommand) { $pwshCommand.Source } else { $null }

if (-not (Test-Path -LiteralPath $controller)) {
    throw "9router controller is missing: $controller"
}
if (-not $pwsh -or -not (Test-Path -LiteralPath $pwsh)) {
    throw "PowerShell 7 is required. Run install-9router.bat Install first."
}

& $pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass `
    -File $controller -Action ApplyPatches -Scope $Scope
exit $LASTEXITCODE
