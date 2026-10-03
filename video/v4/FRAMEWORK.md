# Quorum v4 framework: API for scene authors

Read `STORYBOARD.md` first (timing, style bible, framings). `cues.json` holds the same plan in machine form. Start a scene from `scenes/_TEMPLATE.js`. The finished scenes S01-S15 are the working examples (S01 for motion graphics, S04 for a stage scene on the STAGE capture). `--demo` still loads `DEMO_FILES` from the manifest (empty now).

## Ground rules
1. **Only edit your own scene files** (and add them to `scenes/manifest.js`). Put helpers inside your scene's IIFE. If you need a lib change, ask for it in your report.
2. **Everything is a pure function of `t`.** Don't use `Date.now()`, `Math.random()` (use `rand(i, salt)`), CSS transitions or animations, timers or rAF. Create DOM once in `build()`. In `render(t)`, call every component's `render(t)` every frame. Components always write their properties, so frames rendered out of order come out identical (`render.js verify` checks this).
3. **Don't move key-event times.** The score is cut to `cues.json`.
4. **Captions are drawn by the framework** from `cues.json`, bottom-left, so don't add them in scenes. Keep the bottom 170 px of the frame free of important content while one is up (`frameRect(..., {capSafe:true})` helps).
5. **Where it runs.** Locally (Windows, Chrome at the default path) or on a render server via `remote.sh`; see `README.md`. render.js reads `CHROME`, `CHROME_ARGS` and `RENDER_WORKERS` from the environment.

## Running (from `video/v4`)
```
node render.js test 36 37.5        # -> stills/test_36.jpg ...
node render.js sheet 34 44 8       # -> stills/sheet_34_44.jpg (8 stamped tiles)
node render.js verify 36 40 77     # determinism check (exit 3 if frames differ)
node render.js range 34 44         # -> out/range_34_44.mp4 (frames deleted after encode)
node render.js --workers=8         # full film -> out/quorum-showcase.mp4 (+ -silent.mp4)
```
On the server, wrap each command: `remote.sh sync`, `remote.sh run "node render.js ..."`, `remote.sh pull stills`.
Flags: `--workers=N` (default `$RENDER_WORKERS`, else 2; max 8; keep 3 on the shared server), `--demo`, `--only=_stage_plate,S04_beat1` (load just these scene files), `--keep-frames`, `--crf=18`, `--quality=92`. Exit code 2 means page errors; they're printed.

`render.js` injects `window.CUES` (cues.json) and `window.CLIPS` (every `clips/<SHOT>/meta.json` and `actions.json`) before the page loads, then for each frame calls `render(t)`, awaits `__settle()` (plate images decoded, fonts ready), screenshots, and prefetches the next frame's plate images. It encodes with libx264 (CRF 18, yuv420p, 30 fps) and muxes `audio/soundtrack.wav` when it exists.

## Layers (bottom to top)
`#world` (the camera transform: the board, then fixtures and scene roots by `z`) → `#hud` (screen-space pools: ripples, spotlight, typing caret) → `#cursor-layer` (the one drawn cursor) → `#cap` (captions) → `#paperfade` (`Q.setFade(v)`: fade to clean paper, used at the very end).

## The world and the camera
- One giant whiteboard: `BOARD = {w:7680, h:4320}`. The 3x3 grid of 1920x1080 scene cells (`REGIONS.ALL`, 5760x3240) sits inside half a screen of clean board on every side. Default cells: `COLD, TITLE, SPARE` (top row), `DAY, LANDING (centre), STAGE` (middle), `ASSIST, KEY, ARCH` (bottom). `REGIONS.WHOLE` is the whole board (the S15 pull-out: `regionCam('WHOLE', .25)`).
- Each scene has a `root` div at its region's top-left; build in region-local px (0..1920, 0..1080, overflow is fine).
- The camera looks at world point `(x, y)` with zoom `z` (screen px per world px) and roll `r` (deg). **Camera keys from every scene form one global track**, sorted by time, so a hand-off between scenes is the segment from one scene's last key to the next scene's first key. A key is `[t, cam, ease?]`; `ease` shapes the segment that ends at that key (default `easeInOutCubic`; names: `easeOutExpo` for snaps and whips, `easeInOutSine`, `linear`...). `cam` can be a function `(t) => cam`, evaluated once after every scene is built (that's how framings read plate rects).
- Shakes and impacts are declared per scene: `shakes: [[t0, amp px, dur]]` (10 px / 0.4 s for the 76.0 hit, 2-4 px for small events), `punches: [[t0, amount, dur]]` (zoom kick, e.g. `[76, .06, .45]`). The framework adds the constant micro drift (±6 px, 0.1 Hz) and a 0.3% breathe.
- Helpers: `regionCam(name|rect, z)`, `frameRect(worldRect, {pad=60, zMax=2.6, z, dx, dy, capSafe})`, `unionRect([...])`, `CAM.toScreen(x, y)`, `CAM.rectToScreen(r)`, `CAM.toWorld(sx, sy)`, `CAM.view()`, `CAM.cur` (this frame's camera, set before any `render`).

## Scene registry
```js
Scene({ id:'S04', start:34, end:44, region:'STAGE',      // REGIONS name or {x,y,w,h} in world px
  camera:[[34, () => STAGE_PLATE.frame('WIDE', 34)], [34.9, () => STAGE_PLATE.frame('R_ASK', 37)]],
  shakes:[[36, 2, .25]], punches:[], margin:500, always:false, z,
  build(root, S){...},          // once. S.region, S.cues (this scene's cues.json entry: keys, captions, capture_maps)
  render(t, lt, S){...} });     // every frame the region (+margin) is on camera; lt = t - start
Fixture({ id, region, z, build, render })   // a shared thing (z low: under the scenes), e.g. the STAGE plate
```
A scene renders whenever its region is on camera, before and after its time range too (the S15 pull-out shows every region). So design every element to hold its final state after its moment, and use `out:` options only for things that must go away. An exception in your build/render is caught and logged, and it won't break other scenes.

## Timing and easing
`P(t,a,d)` linear progress over [a, a+d] · `E(t,a,d,ease)` eased · `pulse(t,t0,w)` · `win(t,a,b,fi,fo)` · `keyframes(t, [[t,v,ease?],...])` (numbers, arrays, objects) · `pwl(x, pts)` / `pwlInverse(y, pts)` (capture maps) · easings: `easeOutExpo easeInExpo easeInOutExpo easeOutCubic easeInCubic easeInOutCubic easeInOutSine easeOutQuart easeOutBack spring(x, damping, freq) linear` · `rand(i,salt) randn wiggle(t,seed,freq,amp) hashStr` · `lerp invLerp remap clamp mixAny mixColor rgba`.
Palette: `COL.paper ink ink2 ink3 blue red green yellow sky kraft kraft2 kraftInk tape line white`. Marker colours can be given by name: `'blue' | 'red' | 'green' | 'ink'`. Fonts: `HAND` (Shantell Sans), `UI` (Schibsted Grotesk); CSS classes `.head` (Schibsted 800 headline), `.hand`, `.ui`.

## DOM helpers
`el(tag, {cls, style, html, text, attrs}, parent)`, `h(html, parent)`, `svgEl(tag, attrs, parent)`, `svgLayer(parent)` (a 1x1 overflow-visible SVG: draw in the parent's coordinates), `xf(el, {x, y, s, sx, sy, r, o, blur})`, `vis(el, on)`, `show(el, t, a, d, {dy, dx, scale, r, ease, out, outD})`, `pop(el, t, a, d, from, r)`, `setText/setHTML` (write on change), `countUp(t, a, d, from, to)`, `wordRect(root, elOrSticky, word)` (rect of a word in root coords, at build time; for stickies, in their settled pose: circle "the 18th" with it).

## Whiteboard components (all retained: build once, call `.render(t)` every frame)
| component | notes |
|---|---|
| `markerPath(parent, d, {color='blue', width=5, t0, dur, seed, opacity, dry=true, out, outD, amp=1.2})` | a stroke drawn along an SVG path; duration = length/1400 px/s clamped to 0.25-0.8 s, easeInOutSine; boiled (3 jittered drawings cycled at 7 fps from `t`); dry-marker texture. `.t0` can be changed after build. |
| `strokeSeq(parent, [d...], {t0, gap=.04, durEach, ...})` | strokes one after another; `.end` = when the last finishes |
| `markerCircle(parent, rect, {color='red', pad=10, turns=1.12, t0})` | hand loop around a rect that overshoots its start |
| `markerUnderline(parent, x1, x2, y, {color='blue', wave=4, t0})` | |
| `markerArrow(parent, [x,y], [x,y], {color='ink', bend=.18, head=18, t0})` | shaft then head |
| `markerCross(parent, cx, cy, s)`, `markerTick(parent, cx, cy, s)`, `markerSlash(parent, x1, y1, x2, y2)` | ×, ✓, strike / cut-link stroke |
| `markerScribble(parent, rect, {loops=2, dur=.7})` | the hero "loops around both cards" scribble |
| `handText(parent, text, x, y, {color='blue', size=34, weight=600, t0, cps=22, dur, rot=-2, align, maxW, html, out})` | handwritten label written left to right; boils through Shantell's INFM axis; y is roughly the baseline |
| `sticky(parent, {x, y (centre), w=280, h, color='yellow'\|'blue'\|'kraft'\|'white', rot, text\|html, meta, size=30, tape=1\|2\|0, t0 (contact), from:{dx,dy}, out})` | slap: motion starts 0.12 s before `t0` at scale 1.18 and +8°, settles with a ~4% spring; the shadow tightens on contact. Add a `shakes` entry at `t0` for the board bump. `.el`, `.body`, `.rot` |
| `tag(parent, {x, y, text\|html, kind='kraft'\|'tape'\|'paper', rot, size, w})` | static label slip; animate with `show`/`pop` (it returns the element) |
| `whiteboard(parent, {x, y, w, h, tray=true, frame=14})` | framed board (aluminium edge, corner caps, enamel sheen, marker tray). `.surface` |
| `eraser(parent, {x, y, w, h, t0, dur=1, worldX, worldY})` | left-to-right wipe: clean board grows behind an eraser block. Pass `worldX/worldY = S.region.x/y` so the texture lines up. Draws over earlier siblings |

## Real UI: plates, cursor, HUD
### Clips
Captured by `capture/capture.js` into `clips/<SHOT>/` (see "Clip formats" below). Shots: `STAGE` (ct 0-93), `LANDING_HERO` (ct 0-7), `DECK_ARCH` (ct 0-12), `DECK_ASSIST` and `DECK_DAY` (stills).

### screenFrame
```js
const plate = screenFrame({ parent: root, scene: S /* or world:{x,y} */, clip:'LANDING_HERO', x:120, y:160, w:1680,
  chrome:'browser' /* 'card' | 'none' */, tape:true, map /* default: globalMap(clip) */, inner /* crop keys */ });
plate.render(t);   // every frame
```
- `map`: capture time for a video time. By default the clip's maps from every scene in cues.json are joined (`globalMap`), so `round(map(t)*30)` is the frame. Before the first point the first frame holds, after the last the last. Pass `[[vt,ct],...]` or a function to override. Flat segments hold; steep segments are speed ramps.
- `inner: [[t, {cx, cy, z}], ...]` zooms inside the frame (a crop camera in plate px) for card or bare plates that shouldn't move the world camera.
- Geometry, all from `meta.json` rects at the plate's ct: `plate.rect(name, t, near)` (parent coords), `worldRect`, `screenRect`, `point(name, t, ax, ay)`, `toWorld(px, py, t)`. `near=true` uses the nearest logged sample if the element isn't there at that ct (for framings of things that appear later).
- `plate.frame(what, t, {pad, zMax, z, dx, dy, capSafe})` returns a camera fitting rect names, rects, `'all'`, or a STAGE framing name: `WIDE FULL L_SWITCH L_ASK L_CAPTURE L_CLOUD L_CARD R_ASK R_INBOX R_HUB HUB BOTH_CARDS`.
- `plate.overlay` is a div in plate CSS px (1920x1080), above the UI, that zooms with it.
- `plate.lift(name, t0, {scale=1.12, dur=.5, pad=6})` pops a crop of the plate around a rect (counter pops: Outbox, hub total). Call `.render(t)`.
- `plate.events(type, ct0, ct1)` and `plate.markers(...)` come from actions.json. `plate.clickTimes()` gives each captured click with the video time `vt` its ct first plays.
- `plate.caret(t)`: the framework already draws a blue caret at the typing position while the capture types.
- Stills: `plate.setStill('nostk')` shows `still_nostk.png`; rects are `meta.rects`.

**The STAGE plate is shared.** `scenes/_stage_plate.js` pins it at region `STAGE` (0, 0, w 1920, card chrome) as `window.STAGE_PLATE`. S03-S11 use `region:'STAGE'`, so its rects are already in their roots' coordinates.

### Cursor (screen space, one for the whole film)
```js
Cursor.plan([
  { t:35.0, enter:'right' },                               // appears at that frame edge (y follows the next target)
  { t:36.0, click:'R.suggestDue', plate:STAGE_PLATE },      // arrives by t - dwell (.3), press at t, release + ripple at t + .1
  { t:37.3, at:'R.answer', plate:STAGE_PLATE, ax:.9, ay:.2 },   // be here at t (hover)
  { t:44.0, click:{ x: S.region.x + 900, y: S.region.y + 400 }, color:'green' },   // world-point targets for MG
  { t:39.8, exit:'right' },
]);
```
Use the **film times of the captured clicks** (cues.json key events, or `plate.clickTimes()`), so the drawn press lands on the frame where the real UI reacts. Targets are re-projected every frame, so the cursor stays locked to the control while the camera zooms. Travel is a curved arc, easeInOutCubic at ~1200 px/s (0.35-0.9 s) with a 4 px overshoot. Hover scale is 0.96; the press is 0.88 for 0.08 s. The ripple is a 3 px ring (0 to 46 px over 0.35 s) plus three boiled ticks, `color:'blue'` by default (`'red'` for the hub switch going off, `'green'` for Keep). SFX for presses are already in cues.json.

### HUD (immediate mode, screen space; call inside render every frame you want it)
`HUD.spot(screenRect, amount, {pad=10, radius=14, dim=.22})` spotlight · `HUD.ripple(x, y, t, t0, color)` extra ripples · `HUD.caret(rect, t)`. For screen-space marker drawings (the S08 ruler), build them in your own `svgLayer(document.getElementById('hud'))` and position them from `CAM.toScreen` each frame.

### Captions
Drawn from `cues.json → captions`: Shantell Sans 600 46 px on a taped white paper strip at bottom-left (x 120, baseline ~990). The strip unrolls just ahead of a ~45 chars/s writing wipe with a 6 px rise, and fades out over 0.3 s at its end. `Captions.emphasize(captionSubstring, word, color)` (in build) adds a boiled marker underline under `word` once it's written.

## Clip formats (written by capture/capture.js)
Moving shots, `clips/<SHOT>/`:
- `f%05d.jpg`: frame k = capture time ct = k/30 s (virtual clock, exact), viewport 1920x1080 CSS px at DSF 2, so 3840x2160 JPEG q90.
- `meta.json`: `{shot, viewport:{width,height,deviceScaleFactor}, dsf, fps:30, frames, pattern:'f%05d.jpg', size:{w,h}, captured_at_ct:[a,b], actions:[{ct, do, sel, text_match?, rect:{x,y,w,h}}], track:[{ct, rects:{name:{x,y,w,h}}}]}`. Rects are CSS px of the viewport, sampled every 0.1 s of ct and at every input. Hidden elements are left out.
- `actions.json`: `{shot, fps, frames, viewport, pointer:[{ct,x,y}], events:[{ct, type:'move'|'mousedown'|'mouseup', x, y, sel} | {ct, type:'key', key, caret:{x,y,h}}], markers:[...]}`. STAGE markers are the UI's own events: `{ct, side, type:'answer'|'working'|'draft'|'view'|'event', ev:{type:'claim'|'conflict'|'activity', id, status, text}, took}` and `{ct, type:'hub', total, device}`. Deck markers are class changes, `{ct, type:'class', el, cls}` (flow steps lighting).
- Stills (`DECK_ASSIST`, `DECK_DAY`): `still.png`, `still_nostk.png` (stickies hidden), `meta.json` `{shot, still:true, dsf, size, files, rects}` (`stk.0..n`, `inp.i`, `dot.i`, `chip.i`, `mk.i`, `laptop`, `title`...).
- `clips/manifest.json`: `{shots:{SHOT:{frames, frames_on_disk, fps, pattern, dsf, size, ct_end} | {still:true, files, dsf, size}}}`.

STAGE rect names: `L.* / R.*` = Tanishk (left) / Lakshya (right) pane: `pane header name switch outbox outboxNum rate rateNum cloud legend ask askInput noteInput save capture suggestDue suggestSharma answer answerText answerTook disputedTag cites cite1..3 conflictCard cfTitle cfSim cfOwn cfVal16 cfVal18 keep16 keep18 verdictKept verdictLost viewTeam viewMine simTag ptNote ptEmail` (left), `inbox mail receive cfWait askOwner draft draftText` (right); `HUB.node total totalNum privacy device recent recent1`; `LINK.left LINK.right`; `CAP CAP.head CAP.tag` (the stage's own caption bar). LANDING_HERO: `heroTitle board watchDemo cta nav lede`. DECK_ARCH: `flowSync diagram info infoSteps.i comp.<store|memory|hub|lakshya|conflicts|ui|api|extract|ollama|answer|sync>`.

## Capturing (capture/capture.js)
```
video/v4/remote.sh run "node capture/capture.js STAGE"          # or LANDING_HERO DECK_ARCH DECK_ASSIST DECK_DAY | all
video/v4/remote.sh run "node capture/capture.js sheet STAGE 36" # contact sheet -> clips/STAGE/sheet.jpg
```
Flags: `--workers=3` (the ct range is split; each worker replays the prefix without screenshots), `--dsf=2`, `--from=ct --to=ct --every=n` (quick looks), `--quality=90`. Pages are opened from `file://` with `capture/vclock.js` injected first. That script replaces performance.now, Date, timers, rAF and Math.random with a virtual clock and seeks every CSS animation and transition to it. Inputs are real mouse and keyboard events: the pointer jumps onto a target 0.25 s before a click (so nothing in between gets hovered), presses at ct, and releases at ct+0.1. Every click has an expectation checked on the page (answer rendered, conflict on both, etc.), and a take that misses one is retried.

The STAGE replica lives in `mockstage/`: copies of `app/web` (stage, device UI, cloud, CSS, studio look) as classic scripts, `fixtures.js` (copied `app/fixtures`), `backend.js` (the in-page scripted backend with the film's mocked timings), and `film.css` (one layout nudge so the 3-source answer fits). Never edit `app/web` for the film.
