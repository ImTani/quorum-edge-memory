#!/bin/sh
# Encode frames/%05d.jpg -> out/quorum-v3-silent.mp4, and mux audio/soundtrack.wav if present.
# (Same as: node render.js encode)
cd "$(dirname "$0")" && mkdir -p out
ffmpeg -hide_banner -y -framerate 30 -i frames/%05d.jpg -frames:v 4500 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart out/quorum-v3-silent.mp4 || exit 1
if [ -f audio/soundtrack.wav ]; then
  ffmpeg -hide_banner -y -i out/quorum-v3-silent.mp4 -i audio/soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/quorum-v3.mp4
fi
