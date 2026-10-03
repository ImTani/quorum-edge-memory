# Fetch the Qdrant server binary used as the team sync hub into app\hub\bin (gitignored).
# A standalone binary instead of Docker: no daemon to start, nothing installed machine-wide.
param([string]$Version = "v1.19.1")
$bin = Join-Path $PSScriptRoot "..\app\hub\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
if (Test-Path (Join-Path $bin "qdrant.exe")) { & (Join-Path $bin "qdrant.exe") --version; exit 0 }
$zip = Join-Path $bin "qdrant.zip"
Invoke-WebRequest "https://github.com/qdrant/qdrant/releases/download/$Version/qdrant-x86_64-pc-windows-msvc.zip" -OutFile $zip
Expand-Archive $zip -DestinationPath $bin -Force
Remove-Item $zip
& (Join-Path $bin "qdrant.exe") --version
