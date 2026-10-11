# Start the stage show: the live demo (hub + two devices, studio look), the show server (:9000) and
# Chrome full screen on the show. The phone remote URL is printed at the end.
#   .\scripts\show.ps1            reset the demo to its seed, start everything, open the show in kiosk mode
#   .\scripts\show.ps1 -Window    same, in a normal window (rehearsal; F to go full screen)
#   .\scripts\show.ps1 -NoDemo    leave the demo as it is (already running, or not needed)
#   .\scripts\show.ps1 -NoBrowser start the servers only
#   .\scripts\show.ps1 -NoPhone   without the teammate's phone device (tushar, :8003/phone; on by default)
#   .\scripts\show.ps1 -Stop      stop the show server and its Chrome window, then the demo
# Chrome runs with its own profile in .cache\chrome-show and autoplay allowed, so sound needs no click.
param([switch]$Stop, [switch]$Window, [switch]$NoDemo, [switch]$NoBrowser, [switch]$NoPhone, [int]$Port = 9000)
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "env.ps1")

$root    = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python  = Join-Path $root "app\.venv\Scripts\python.exe"
$server  = Join-Path $root "video\v4\show\server.py"
$run     = Join-Path $root ".cache\run"
$pidFile = Join-Path $run "show.pid"
$chromeProfile = Join-Path $root ".cache\chrome-show"
$chrome  = @("C:\Program Files\Google\Chrome\Application\chrome.exe",
             "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1

function Stop-Show {
  if (Test-Path $pidFile) {
    $procId = [int](Get-Content $pidFile -Raw)
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }
  # only the Chrome started with the show's own profile
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($chromeProfile) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Stop-Show
if ($Stop) {
  if (-not $NoDemo) { & (Join-Path $PSScriptRoot "demo.ps1") -Stop }
  Write-Host "Stopped the show."
  return
}

$held = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($held) { throw ":$Port is in use by PID $($held[0].OwningProcess). Stop it or pass -Port." }

# the same arguments go to the show server, so the phone's "Reset demo" restarts the demo the same way
$demoArgs = @("-Look", "studio") + $(if ($NoPhone) { @() } else { @("-Phone") })
if (-not $NoDemo) { & (Join-Path $PSScriptRoot "demo.ps1") @demoArgs }

# the stage SFX stem (softer marker and eraser) is rendered once from the film's composer; it needs numpy
# and scipy, which the system Python has. Without it the show uses the film's own stem.
$stem = Join-Path $root "video/v4/audio/sfx_show.wav"
if (-not (Test-Path $stem)) {
  Write-Host "Rendering the stage SFX stem ..."
  try { & python (Join-Path $root "video/v4/show/sfx_show.py") | Select-Object -Last 1 } catch { Write-Warning "Couldn't render sfx_show.wav; the show will use the film's stem." }
}

New-Item -ItemType Directory -Force $run | Out-Null
$logOut = Join-Path $run "show.out.log"; $logErr = Join-Path $run "show.err.log"
$env:QUORUM_DEMO_ARGS = $demoArgs -join " "
try {
  $proc = Start-Process -FilePath $python -ArgumentList @("-u", "`"$server`"", $Port) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr
} finally { Remove-Item Env:QUORUM_DEMO_ARGS -ErrorAction SilentlyContinue }
Set-Content -Path $pidFile -Value $proc.Id -NoNewline

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try { Invoke-WebRequest "http://127.0.0.1:$Port/api/now" -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { }
}
if (-not $ok) { Get-Content $logErr -ErrorAction SilentlyContinue | Select-Object -Last 20; throw "The show server didn't start (logs in $run)." }

$url = "http://127.0.0.1:$Port/v4/show.html"
if (-not $NoBrowser) {
  if (-not $chrome) { throw "Chrome not found; open $url yourself." }
  $chromeArgs = @("--user-data-dir=`"$chromeProfile`"", "--autoplay-policy=no-user-gesture-required", "--no-first-run",
            "--disable-session-crashed-bubble", "--disable-infobars", "--disable-features=Translate")
  $chromeArgs += $(if ($Window) { @("--new-window", "--window-size=1600,900") } else { @("--kiosk") })
  Start-Process -FilePath $chrome -ArgumentList ($chromeArgs + $url) | Out-Null
}

Write-Host ""
Write-Host "Show:   $url"
# the server works out the laptop's address (the interface with the default route), as the start screen shows it
try { $urls = (Invoke-RestMethod "http://127.0.0.1:$Port/api/remote" -TimeoutSec 3).urls } catch { $urls = @() }
if ($urls.Count -gt 0) { Write-Host "Remote: $($urls[0])   <- open this on the phone (same Wi-Fi or hotspot), or scan the QR on screen" }
foreach ($u in ($urls | Select-Object -Skip 1)) { Write-Host "        $u" }
if (-not $NoPhone -and $urls.Count -gt 0) {
  Write-Host ("Phone:  {0}   <- the teammate's phone (Tushar's Quorum); allow Python through the firewall if Windows asks" -f ($urls[0] -replace ":$Port/remote$", ":8003/phone"))
}
Write-Host "Keys:   Right/PageDown/Space next · Left/PageUp back · B blank · M mute · C captions · Q Q&A · U phone address · F fullscreen"
Write-Host "Stop:   .\scripts\show.ps1 -Stop"
