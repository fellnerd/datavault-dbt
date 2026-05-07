# Workaround: dbt docs serve hangs with Python 3.13 (venv).
# Uses Python 3.11 http.server directly instead.

param(
    [int]$Port = 8080,
    [string]$Target = "$PSScriptRoot\..\target"
)

$target = Resolve-Path $Target

Write-Host "Generating docs..."
Set-Location "$PSScriptRoot\.."
& ".venv\Scripts\dbt.exe" docs generate --target ewb-dev

Write-Host ""
Write-Host "Serving docs at http://localhost:$Port"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

Set-Location $target
& "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe" -m http.server $Port
