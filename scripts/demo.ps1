# Start the whole demo: hub (:6333) + seed + two devices (tanishk :8001, lakshya :8002).
#   .\scripts\demo.ps1           reset to the seed and start everything (safe to re-run)
#   .\scripts\demo.ps1 -NoSeed   restart without touching data
#   .\scripts\demo.ps1 -Stop     stop all three processes
#   -Force                       also stop foreign processes holding :6333/:8001/:8002
#   -Look studio                 serve the optional studio look (default: classic, the look as built).
#                                Any page also takes ?look=studio or ?look=classic, no restart needed.
# Processes run in hidden windows; logs go to app\data\logs.
# Only processes this checkout started are stopped (PID files in app\data\run, plus this checkout's
# own qdrant.exe). Anything else on the demo ports is reported, never killed, unless -Force.
# The stop is a hard kill; that is safe because devices flush their shard after every write.
param([switch]$Stop, [switch]$NoSeed, [switch]$Force, [ValidateSet("classic", "studio")][string]$Look = "classic")
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "env.ps1")

$app    = (Resolve-Path (Join-Path $PSScriptRoot "..\app")).Path
$python = Join-Path $app ".venv\Scripts\python.exe"
$hubExe = Join-Path $app "hub\bin\qdrant.exe"
$hubWeb = Join-Path $app "hub\static"
$logs   = Join-Path $app "data\logs"
$pids   = Join-Path $app "data\run"
$hubUrl = "http://127.0.0.1:6333"
$devices = [ordered]@{ tanishk = 8001; lakshya = 8002 }
$ports  = @($devices.Values) + 6333

function Get-Listeners([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
}

# The venv's python.exe is a launcher: the process that listens is its child, so a recorded PID
# covers its children too.
function Get-StartedPids {
  if (-not (Test-Path $pids)) { return @() }
  Get-ChildItem $pids -Filter *.pid | ForEach-Object { [int](Get-Content $_.FullName -Raw) }
}

function Test-Ours([int]$procId, [int[]]$started) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $p) { return $true }                                    # already gone
  if ($started -contains $procId -or $started -contains [int]$p.ParentProcessId) { return $true }
  return $p.ExecutablePath -and ((Resolve-Path $p.ExecutablePath).Path -eq $hubExe)
}

function Stop-All {
  foreach ($procId in Get-StartedPids) {
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null }
  }
  if (Test-Path $pids) { Remove-Item (Join-Path $pids "*.pid") -ErrorAction SilentlyContinue }
  foreach ($port in $ports) {
    foreach ($procId in Get-Listeners $port) {
      if ((Test-Ours $procId @()) -or $Force) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      } else {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        Write-Warning ":$port is held by PID $procId ($($p.ExecutablePath)), which this checkout did not start. Left running; use -Force to stop it."
      }
    }
  }
  # Windows keeps shard files locked until the process is gone; wait for our ports to free up.
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline -and ($ports | Where-Object { Get-Listeners $_ })) { Start-Sleep -Milliseconds 200 }
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
  $proc = Start-Process @params
  New-Item -ItemType Directory -Force $pids | Out-Null
  Set-Content -Path (Join-Path $pids "$name.pid") -Value $proc.Id -NoNewline
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

$busy = $ports | Where-Object { Get-Listeners $_ }
if ($busy) { throw "Port(s) $($busy -join ', ') still in use by another program; stop it or re-run with -Force." }
if (-not (Test-Path $hubExe)) { throw "Hub binary missing: run .\scripts\fetch_hub.ps1" }
if (-not (Test-Path (Join-Path $hubWeb "index.html"))) { Write-Warning "Hub dashboard missing (:6333/dashboard will 404): run .\scripts\fetch_hub.ps1" }
if (-not (Test-Path $python)) { throw "Venv missing: app\.venv (see CLAUDE.md, Commands)" }
New-Item -ItemType Directory -Force $logs | Out-Null

Write-Host "Starting hub on :6333 ..."
Invoke-WithEnv @{
  QDRANT__STORAGE__STORAGE_PATH   = "data\hub\storage"
  QDRANT__STORAGE__SNAPSHOTS_PATH = "data\hub\snapshots"
  QDRANT__SERVICE__HTTP_PORT      = "6333"
  QDRANT__SERVICE__GRPC_PORT      = "6334"
  QDRANT__TELEMETRY_DISABLED      = "true"
  QDRANT__SERVICE__STATIC_CONTENT_DIR = "hub\static"                 # the dashboard (fetch_hub.ps1)
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
    $deviceArgs = @("-m", "edge", "--device", $d, "--port", "$($devices[$d])", "--hub", $hubUrl)
    if ($Look -ne "classic") { $deviceArgs += @("--look", $Look) }
    Start-Hidden $d $python $deviceArgs
  }
}
foreach ($d in $devices.Keys) { Wait-Http "http://127.0.0.1:$($devices[$d])/api/state" 90 "Device $d" }

Write-Host ""
Write-Host "Quorum is running. Demo stage (both devices and the hub, one window):"
Write-Host "  stage    http://127.0.0.1:$($devices['tanishk'])/stage"
Write-Host "Single-device pages:"
foreach ($d in $devices.Keys) { Write-Host ("  {0,-8} http://127.0.0.1:{1}" -f $d, $devices[$d]) }
Write-Host "  hub      $hubUrl/dashboard"
if ($Look -ne "classic") { Write-Host "Look: $Look (add ?look=classic to any page for the classic look)" }
Write-Host "Stop with: .\scripts\demo.ps1 -Stop"
