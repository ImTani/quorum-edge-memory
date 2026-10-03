# Fetch the team sync hub into app\hub (gitignored): the Qdrant server binary (bin\) and its web
# dashboard (static\, served at :6333/dashboard). The Windows release zip ships qdrant.exe only;
# Qdrant's own Docker image adds the dashboard the same way (tools/sync-web-ui.sh).
# A standalone binary instead of Docker: no daemon to start, nothing installed machine-wide.
param([string]$Version = "v1.19.1", [string]$WebUiVersion = "v0.2.18")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"     # the progress bar slows Invoke-WebRequest down many times over
$hub   = Join-Path $PSScriptRoot "..\app\hub"
$bin    = Join-Path $hub "bin"
$static = Join-Path $hub "static"

if (-not (Test-Path (Join-Path $bin "qdrant.exe"))) {
  New-Item -ItemType Directory -Force $bin | Out-Null
  $zip = Join-Path $bin "qdrant.zip"
  Invoke-WebRequest "https://github.com/qdrant/qdrant/releases/download/$Version/qdrant-x86_64-pc-windows-msvc.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $bin -Force
  Remove-Item $zip
}
& (Join-Path $bin "qdrant.exe") --version

if (-not (Test-Path (Join-Path $static "index.html"))) {
  $zip = Join-Path $hub "dist-qdrant.zip"
  $unpack = Join-Path $hub "static-unpack"
  Invoke-WebRequest "https://github.com/qdrant/qdrant-web-ui/releases/download/$WebUiVersion/dist-qdrant.zip" -OutFile $zip
  if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
  Expand-Archive $zip -DestinationPath $unpack -Force
  if (Test-Path $static) { Remove-Item $static -Recurse -Force }
  Move-Item (Join-Path $unpack "dist") $static      # the zip holds a single dist\ folder
  Remove-Item $unpack -Recurse -Force
  Remove-Item $zip
}
Write-Host "dashboard: $((Resolve-Path $static).Path) (qdrant-web-ui $WebUiVersion)"
