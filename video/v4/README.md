# Quorum showcase film (v4)

A 168 s, 1920x1080, 30 fps film set on one big whiteboard. Motion graphics carry the story;
the real UI appears as reconstructed captures of the landing page, the Q&A deck and a replica of
the two-device demo stage, all driven by a scripted mock backend. Nothing in the film is recorded
live: numbers and timings are mocked for drama but stay consistent with the product (answers in
8-11 ms, both laptops catch the conflict within a second, similarity 0.85 against a 0.82 bar,
0 device-only claims on the hub).

Output: `out/quorum-showcase.mp4` (with the soundtrack) and `out/quorum-showcase-silent.mp4`.
Media is never committed: `clips/`, `frames/`, `out/`, `stills/` and every `*.wav` are gitignored.

## Files

| Path | What |
|---|---|
| `STORYBOARD.md` | the director's plan: scenes, captions, style bible, camera framings, capture shot list |
| `cues.json` | the same plan in machine form; the single source of timing (scenes, captions, SFX, music marks, capture maps) |
| `index.html`, `lib.js`, `main.js` | the compositor: a deterministic `render(t)` over one 7680x4320 board |
| `FRAMEWORK.md` | the scene API (components, camera, screenFrame plates, cursor, captions) |
| `scenes/` | `manifest.js` (load order), `_stage_plate.js` (shared stage plate), `_kit.js` (helpers), `S01`-`S15` |
| `capture/` | `capture.js` + `vclock.js`: records the UI plates on a virtual clock into `clips/` |
| `mockstage/` | the stage replica used for the STAGE plate (copies of `app/web` + scripted `backend.js`) |
| `audio/` | `probe.js` reads picture event times from the scenes; `compose.py` synthesises music + SFX |
| `render.js` | renders stills, sheets, ranges or the full film and encodes it |
| `remote.sh`, `remote/` | optional: run the same commands on a render server inside a throwaway container |

Requirements (nothing to install): node with `puppeteer-core` resolved from `video/node_modules`,
Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` (or set `CHROME`, plus `CHROME_ARGS`
if needed), ffmpeg on PATH, and Python 3 with numpy and scipy. Run everything from `video/v4`.

## 1. Recapture the UI plates (only if the UI or the mocked timeline changes)

```
node capture/capture.js all                 # STAGE LANDING_HERO DECK_ARCH DECK_ASSIST DECK_DAY
node capture/capture.js STAGE --workers=3   # one shot; ~2800 frames at 3840x2160, about 2.2 GB
node capture/capture.js sheet STAGE 36      # contact sheet -> clips/STAGE/sheet.jpg
node capture/capture.js STAGE --from=50 --to=56   # partial re-take, merged into the existing records
```

Each moving shot writes `clips/<SHOT>/f%05d.jpg` (frame k = capture time k/30 s), `meta.json` (element
rects every 0.1 s, the actions) and `actions.json` (pointer, keys, UI markers). Stills write
`still.png` + `still_nostk.png`. The stage replica reads `../../site/` and `mockstage/`; the real
app is never started. The shot list (selectors, action times) is `cues.json` -> `captures`.

## 2. Re-score (after any scene timing change)

```
node audio/probe.js          # -> audio/picture_events.json (strokes, slaps, clicks, camera moves)
python audio/compose.py      # -> audio/soundtrack.wav (+ music.wav, sfx.wav); prints loudness and peaks
python audio/compose.py --list           # the resolved SFX table (time, type, gain, source)
python audio/compose.py --analyze-only   # levels of the existing soundtrack.wav
```

Picture-driven sounds (marker strokes, sticky slaps, cursor clicks, typing from
`clips/STAGE/actions.json`, camera whooshes) follow the scenes automatically; UI and story sounds
come from `cues.json` -> `sfx`. Target: about -16 LUFS integrated, true peak under -1 dBTP.

## 3. Render

```
node render.js test 36 81.6              # stills -> stills/test_<t>.jpg
node render.js sheet 72 90 10            # stamped contact sheet -> stills/sheet_72_90.jpg
node render.js verify 9 41.8 81 160.5    # determinism: each t rendered in two orders must match
node render.js range 72 90               # -> out/range_72_90.mp4 (with the soundtrack slice)
node render.js --workers=8               # full film -> out/quorum-showcase.mp4 + -silent.mp4
```

The full render writes `frames/%05d.jpg`, encodes with libx264 (CRF 18, yuv420p), muxes
`audio/soundtrack.wav` as AAC 192k, then deletes the frames (`--keep-frames` keeps them). With 8
workers on a 12-core PC it takes about 6-7 minutes; on the 3-CPU server, about 20. Each worker
renders 30-frame chunks and pre-rolls the two frames before each chunk, so chunk starts are
identical to a sequential render.

Workflow after an edit: `test`/`sheet` the scene, `verify` a few times, re-score if any time moved,
then render the film.
