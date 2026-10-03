# Project-local isolation for PowerShell. Dot-source before any uv/pip/npm/model work:  . .\scripts\env.ps1
# This machine exports UV_CACHE_DIR / PIP_CACHE_DIR / HF_HOME globally (pointing at another
# project's caches), and env vars beat uv.toml, so this override is required, not optional.
# Caches go to the MAIN checkout's .cache\ and models\ so every worktree shares them.
$root = "X:\Projects_X\code_cubicle_6"
$env:QUORUM_ROOT              = $root
$env:UV_CACHE_DIR             = Join-Path $root ".cache\uv"
$env:PIP_CACHE_DIR            = Join-Path $root ".cache\pip"
$env:npm_config_cache         = Join-Path $root ".cache\npm"
$env:XDG_CACHE_HOME           = Join-Path $root ".cache\xdg"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $root ".cache\ms-playwright"
$env:TORCH_HOME               = Join-Path $root ".cache\torch"
$env:HF_HOME                  = Join-Path $root "models\hf"
$env:FASTEMBED_CACHE_PATH     = Join-Path $root "models\fastembed"
$env:QUORUM_MODELS            = Join-Path $root "models"
$env:UV_PYTHON_DOWNLOADS      = "never"
$env:IMPECCABLE_HOME          = Join-Path $root ".cache\impeccable"   # skill engine; default is ~/.impeccable
foreach ($d in $env:UV_CACHE_DIR, $env:PIP_CACHE_DIR, $env:HF_HOME, $env:FASTEMBED_CACHE_PATH) {
  New-Item -ItemType Directory -Force $d | Out-Null
}
