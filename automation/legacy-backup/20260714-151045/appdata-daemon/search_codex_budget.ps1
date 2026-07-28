# search_codex_budget.ps1
$ErrorActionPreference = "SilentlyContinue"

$paths = @(
    "C:\Users\Linh\.codex",
    "C:\Users\Linh\AppData\Local\OpenAI\Codex"
)

Write-Host "Searching for 'budget' or 'limit' in Codex configuration/logs..."
$paths | ForEach-Object {
    $p = $_
    Write-Host "Path: $p"
    Get-ChildItem -Path $p -Filter "*.toml" -Recurse | ForEach-Object {
        $file = $_.FullName
        $matches = Get-Content $file | Select-String "budget"
        if ($matches) {
            Write-Host "  Found in $file :"
            $matches | ForEach-Object { Write-Host "    Line $($_.LineNumber): $($_.Line.Trim())" }
        }
    }
    Get-ChildItem -Path $p -Filter "*.json" -Recurse | ForEach-Object {
        $file = $_.FullName
        $matches = Get-Content $file | Select-String "budget"
        if ($matches) {
            Write-Host "  Found in $file :"
            $matches | ForEach-Object { Write-Host "    Line $($_.LineNumber): $($_.Line.Trim())" }
        }
    }
}
