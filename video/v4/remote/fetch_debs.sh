#!/usr/bin/env bash
# Runs on the server host. Docker container networking stalls on large downloads there, so the
# packages are fetched on the host into the shared folder and apt installs them from it.
set -euo pipefail
PKGS="chromium ffmpeg python3 python3-numpy python3-scipy imagemagick fonts-dejavu-core ca-certificates"
ARCH=~/quorum-render/apt-archives
rm -rf "$ARCH"; mkdir -p "$ARCH/partial"
docker exec quorum-render bash -lc "apt-get install --print-uris -y -qq --no-install-recommends $PKGS" \
  | awk '/^.http/ { gsub(/\047/, "", $1); print $1 " " $2 }' > ~/quorum-render/uris.txt
echo "packages: $(wc -l < ~/quorum-render/uris.txt)"
cd "$ARCH"
# url filename pairs; save under apt's expected filename
xargs -P 6 -L 1 bash -c 'curl -sf --retry 3 -o "$1" "$0" || echo "FAILED $0"' < ~/quorum-render/uris.txt
echo "downloaded: $(ls *.deb | wc -l) files, $(du -sh . | cut -f1)"
docker exec quorum-render bash -lc "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends -o Dir::Cache::archives=/work/apt-archives $PKGS >/work/install2.log 2>&1 && echo INSTALLED || (tail -5 /work/install2.log; exit 1)"
docker exec quorum-render bash -lc "command -v chromium ffmpeg python3 convert; chromium --version; python3 -c 'import numpy, scipy; print(numpy.__version__, scipy.__version__)'"
rm -rf "$ARCH" ~/quorum-render/uris.txt
