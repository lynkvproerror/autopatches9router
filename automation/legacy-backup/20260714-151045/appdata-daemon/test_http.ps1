# test_http.ps1
$ErrorActionPreference = "Stop"

try {
    Write-Host "Sending request to http://127.0.0.1:53220/dashboard/providers ..."
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:53220/dashboard/providers" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Success! StatusCode: $($res.StatusCode)"
    Write-Host "Headers:"
    $res.Headers | Out-String
    # Print first 200 chars of the content to see if it's the dashboard HTML
    $contentSnippet = $res.Content
    if ($contentSnippet.Length -gt 200) { $contentSnippet = $contentSnippet.Substring(0, 200) }
    Write-Host "Content Snippet:`n$contentSnippet"
} catch {
    Write-Host "FAILED: $_"
}
