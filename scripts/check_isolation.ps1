# Isolation guard: fail if anything wrote into a machine-global cache recently.
# Checks CreationTime as well as LastWriteTime: uv extracts wheels with their archive mtimes,
# so a LastWriteTime-only check missed a fresh 222 MB install (measured 3 Oct 2026).
# Some of these globals belong to other projects on this machine (X:\aihello-cache), so a hit
# means "check what wrote it", not automatically "Quorum leaked".
param([double]$SinceHours = 6, [double]$WarnMB = 5, [switch]$Quiet)
$since = (Get-Date).AddHours(-$SinceHours)
$targets = [ordered]@{
  "uv(aihello)"    = "X:\aihello-cache\uv"
  "hf(aihello)"    = "X:\aihello-cache\hf"
  "torch(aihello)" = "X:\aihello-cache\torch"
  "pip(X:)"        = "X:\Caches\pip"
  "uv"             = "$env:LOCALAPPDATA\uv"
  "uv-python"      = "$env:APPDATA\uv\python"
  "pip"            = "$env:LOCALAPPDATA\pip\Cache"
  "npm"            = "$env:LOCALAPPDATA\npm-cache"
  "hf"             = "$env:USERPROFILE\.cache\huggingface"
  "fastembed"      = "$env:TEMP\fastembed_cache"
  "playwright"     = "$env:LOCALAPPDATA\ms-playwright"
  "impeccable"     = "$env:USERPROFILE\.impeccable"
}
$leaks = @()
foreach ($name in $targets.Keys) {
  $path = $targets[$name]
  if (-not (Test-Path $path)) { continue }
  $recent = Get-ChildItem $path -Recurse -Force -File -EA SilentlyContinue |
            Where-Object { $_.CreationTime -ge $since -or $_.LastWriteTime -ge $since }
  if (-not $recent) { continue }
  $mb = [math]::Round((($recent | Measure-Object Length -Sum).Sum) / 1MB, 1)
  if ($mb -ge $WarnMB) { $leaks += [pscustomobject]@{ Name = $name; MB = $mb; Path = $path } }
}
if ($leaks) {
  Write-Output ("LEAK: {0} global cache(s) grew in the last {1} h:" -f $leaks.Count, $SinceHours)
  $leaks | ForEach-Object { Write-Output ("  {0,-15} {1,8:N1} MB  {2}" -f $_.Name, $_.MB, $_.Path) }
  Write-Output "  Fix the config that let it happen (scripts/env.*, uv.toml, .npmrc), not just the bytes."
  exit 1
}
if (-not $Quiet) { Write-Output "isolation OK - no machine-global cache grew in the last $SinceHours h" }
exit 0
