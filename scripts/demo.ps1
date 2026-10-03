# Start the whole demo: hub (:6333) + seed + two devices (tanishk :8001, lakshya :8002).
#   .\scripts\demo.ps1           reset to the seed and start everything (safe to re-run)
#   .\scripts\demo.ps1 -NoSeed   restart without touching data
#   .\scripts\demo.ps1 -Stop     stop all three processes
# Processes run in hidden windows; logs go to app\data\logs.
param([switch]$Stop, [switch]$NoSeed)
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "env.ps1")

$app    = (Resolve-Path (Join-Path $PSScriptRoot "..\app")).Path
$python = Join-Path $app ".venv\Scripts\python.exe"
$hubExe = Join-Path $app "hub\bin\qdrant.exe"
$logs   = Join-Path $app "data\logs"
$hubUrl = "http://127.0.0.1:6333"
$devices = [ordered]@{ tanishk = 8001; lakshya = 8002 }

function Stop-Port([int]$port) {
  $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $owners) {
    if ($procId -gt 0) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $procId -Timeout 10 -ErrorAction SilentlyContinue
    }
  }
  # Windows keeps shard files locked until the process is gone; wait for the port to free up.
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
}

function Stop-All {
  foreach ($port in @($devices.Values) + 6333) { Stop-Port $port }
}

function Wait-Http([string]$url, [int]$timeoutSec, [string]$what) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return }
    } catch { Start-Sleep -Milliseconds 300 }
  }
  throw "$what did not answer $url within $timeoutSec s (logs: $logs)"
}

function Start-Hidden([string]$name, [string]$file, [string[]]$arguments) {
  $params = @{
    FilePath               = $file
    WorkingDirectory       = $app
    WindowStyle            = "Hidden"
    RedirectStandardOutput = (Join-Path $logs "$name.log")
    RedirectStandardError  = (Join-Path $logs "$name.err.log")
    PassThru               = $true
  }
  if ($arguments) { $params.ArgumentList = $arguments }
  Start-Process @params | Out-Null
}

# Child processes inherit these; set them only for the launch, then put the session back.
function Invoke-WithEnv([hashtable]$vars, [scriptblock]$body) {
  $saved = @{}
  foreach ($k in $vars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); Set-Item "env:$k" $vars[$k] }
  try { & $body } finally {
    foreach ($k in $vars.Keys) {
      if ($null -eq $saved[$k]) { Remove-Item "env:$k" -ErrorAction SilentlyContinue } else { Set-Item "env:$k" $saved[$k] }
    }
  }
}

Stop-All
if ($Stop) { Write-Host "Stopped hub and devices."; return }

if (-not (Test-Path $hubExe)) { throw "Hub binary missing: run .\scripts\fetch_hub.ps1" }
if (-not (Test-Path $python)) { throw "Venv missing: app\.venv (see CLAUDE.md, Commands)" }
New-Item -ItemType Directory -Force $logs | Out-Null

Write-Host "Starting hub on :6333 ..."
Invoke-WithEnv @{
  QDRANT__STORAGE__STORAGE_PATH   = "data\hub\storage"
  QDRANT__STORAGE__SNAPSHOTS_PATH = "data\hub\snapshots"
  QDRANT__SERVICE__HTTP_PORT      = "6333"
  QDRANT__SERVICE__GRPC_PORT      = "6334"
  QDRANT__TELEMETRY_DISABLED      = "true"
  QDRANT_INIT_FILE_PATH           = "data\hub\.qdrant-initialized"   # else it lands in app\ (tracked)
} { Start-Hidden "hub" $hubExe @() }
Wait-Http "$hubUrl/readyz" 30 "Hub"

if (-not $NoSeed) {
  Write-Host "Seeding devices and hub ..."
  Push-Location $app
  try {
    & $python -m edge.seed --hub $hubUrl
    if ($LASTEXITCODE -ne 0) { throw "Seeding failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

Invoke-WithEnv @{ PYTHONUNBUFFERED = "1" } {
  foreach ($d in $devices.Keys) {
    Write-Host "Starting device $d on :$($devices[$d]) ..."
    Start-Hidden $d $python @("-m", "edge", "--device", $d, "--port", "$($devices[$d])", "--hub", $hubUrl)
  }
}
foreach ($d in $devices.Keys) { Wait-Http "http://127.0.0.1:$($devices[$d])/api/state" 90 "Device $d" }

Write-Host ""
Write-Host "Quorum is running:"
foreach ($d in $devices.Keys) { Write-Host ("  {0,-8} http://127.0.0.1:{1}" -f $d, $devices[$d]) }
Write-Host "  hub      $hubUrl/dashboard"
Write-Host "Stop with: .\scripts\demo.ps1 -Stop"
