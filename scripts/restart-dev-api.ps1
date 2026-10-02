Set-Location 'D:\Projects\atlas'

# Find the server windows created by dev-local.ps1.
$atlasServers = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'powershell.exe' -and
    $_.CommandLine -like "*Set-Location 'D:\Projects\atlas';*" -and
    $_.CommandLine -match "WindowTitle = 'Atlas (API|Web|K-1 Worker)'"
}

# Stop those windows and their server processes.
$atlasServers | ForEach-Object {
    taskkill.exe /PID $_.ProcessId /T /F
}

# Start everything again.
npm.cmd run dev:local