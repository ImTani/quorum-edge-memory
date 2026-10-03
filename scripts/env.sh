# Project-local isolation for bash. Source before any uv/pip/npm/model work:  . scripts/env.sh
# This machine exports UV_CACHE_DIR / PIP_CACHE_DIR / HF_HOME globally (pointing at another
# project's caches), and env vars beat uv.toml, so this override is required, not optional.
# Caches go to the MAIN checkout's .cache/ and models/ so every worktree shares them.
export QUORUM_ROOT='X:/Projects_X/code_cubicle_6'
export UV_CACHE_DIR="$QUORUM_ROOT/.cache/uv"
export PIP_CACHE_DIR="$QUORUM_ROOT/.cache/pip"
export npm_config_cache="$QUORUM_ROOT/.cache/npm"
export XDG_CACHE_HOME="$QUORUM_ROOT/.cache/xdg"
export PLAYWRIGHT_BROWSERS_PATH="$QUORUM_ROOT/.cache/ms-playwright"
export TORCH_HOME="$QUORUM_ROOT/.cache/torch"
export HF_HOME="$QUORUM_ROOT/models/hf"
export FASTEMBED_CACHE_PATH="$QUORUM_ROOT/models/fastembed"
export QUORUM_MODELS="$QUORUM_ROOT/models"
export UV_PYTHON_DOWNLOADS=never
export IMPECCABLE_HOME="$QUORUM_ROOT/.cache/impeccable"   # skill engine; default is ~/.impeccable
export IMPECCABLE_NO_TELEMETRY=1   # no usage pings from the skill
mkdir -p "$UV_CACHE_DIR" "$PIP_CACHE_DIR" "$HF_HOME" "$FASTEMBED_CACHE_PATH"
