# search_budget.ps1
$ErrorActionPreference = "SilentlyContinue"

$Path = "C:\Users\Linh\AppData\Roaming\npm\node_modules\9router"
Write-Host "Searching for 'budget' or 'limit' in 9router source..."
Get-ChildItem -Path $Path -Filter "*.js" -Recurse | ForEach-Object {
    $file = $_.FullName
    $matches = Get-Content $file | Select-String "budget" -SimpleMatch
    if ($matches) {
        Write-Host "Found in: $file"
        $matches | ForEach-Object { Write-Host "  Line $($_.LineNumber): $($_.Line.Trim())" }
    }
}
