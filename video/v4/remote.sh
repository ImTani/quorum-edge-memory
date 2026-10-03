#!/usr/bin/env bash
# Run Quorum v4 render work on the shared server, inside one throwaway Docker container.
#
# Everything lives in ~/quorum-render on the server and in the container `quorum-render`
# (base image node:22-slim, which the server already had; chromium, ffmpeg, python3-numpy/scipy
# and puppeteer-core are installed inside the container only). `cleanup` removes both and leaves
# the server exactly as it was. The container is capped at 3 CPUs / 4 GB (the server runs other
# services).
#
# usage (from Git Bash, anywhere in the repo):
#   video/v4/remote.sh sync                 copy video/v4 sources + site/ + app/web/ to the server
#   video/v4/remote.sh setup                one-time: puppeteer-core inside the container
#   video/v4/remote.sh run "<command>"      run in /work/repo/video/v4 inside the container
#   video/v4/remote.sh pull <path> [...]    copy paths (relative to video/v4) back, e.g. out stills clips
#   video/v4/remote.sh status               container state and disk use
#   video/v4/remote.sh cleanup              remove the container and ~/quorum-render (when the video is final)
#
# Inside the container: CHROME=/usr/bin/chromium, CHROME_ARGS="--no-sandbox --disable-dev-shm-usage",
# RENDER_WORKERS=3. render.js / capture.js read these env vars; python is `python3` (numpy, scipy).
set -euo pipefail
HOST="${QUORUM_RENDER_HOST:-server}"
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
NAME=quorum-render
ENVS="-e CHROME=/usr/bin/chromium -e CHROME_ARGS='--no-sandbox --disable-dev-shm-usage' -e RENDER_WORKERS=3"

cmd="${1:-}"; shift || true
case "$cmd" in
  sync)
    # sources only; generated media (frames, out, stills, clips, wavs) stays where it was rendered
    tar -czf - -C "$ROOT" \
      --exclude='video/v4/frames' --exclude='video/v4/out' --exclude='video/v4/stills' \
      --exclude='video/v4/clips' --exclude='*.wav' --exclude='*.mp4' --exclude='node_modules' \
      video/v4 site app/web \
      | ssh "$HOST" "mkdir -p ~/quorum-render/repo && tar -xzf - -C ~/quorum-render/repo"
    echo "synced to $HOST:~/quorum-render/repo"
    ;;
  setup)
    ssh "$HOST" "mkdir -p ~/quorum-render/repo/video/v4 && docker exec -w /work/repo/video $NAME bash -lc 'test -d node_modules/puppeteer-core || (npm init -y >/dev/null && npm install --no-audit --no-fund puppeteer-core@25.12.0 >/dev/null) && node -e \"require(\\\"puppeteer-core\\\"); console.log(\\\"puppeteer-core ok\\\")\"'"
    ;;
  run)
    [ -n "${1:-}" ] || { echo "run needs a command" >&2; exit 2; }
    ssh "$HOST" "docker exec -w /work/repo/video/v4 $ENVS $NAME bash -lc $(printf '%q' "$1")"
    ;;
  pull)
    [ $# -gt 0 ] || { echo "pull needs paths" >&2; exit 2; }
    ssh "$HOST" "tar -czf - -C ~/quorum-render/repo/video/v4 $*" | tar -xzf - -C "$ROOT/video/v4"
    echo "pulled: $*"
    ;;
  status)
    ssh "$HOST" "docker ps -a --filter name=$NAME --format '{{.Names}} {{.Status}}'; du -sh ~/quorum-render 2>/dev/null; df -h ~ | tail -1"
    ;;
  cleanup)
    ssh "$HOST" "docker rm -f $NAME >/dev/null 2>&1; rm -rf ~/quorum-render; docker ps -a --filter name=$NAME --format '{{.Names}}'; ls -d ~/quorum-render 2>/dev/null || echo 'server clean: container and ~/quorum-render removed'"
    ;;
  *)
    sed -n '2,24p' "$0"; exit 2 ;;
esac
