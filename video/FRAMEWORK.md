# Quorum v3 framework: API for scene authors

Read `STORYBOARD.md` first (timing + style bible). `scenes/C.js` is the full reference scene, and `scenes/_TEMPLATE.js` is the starting point.

## Ground rules
1. **Only edit your own `scenes/X.js`.** Put any helpers inside your scene file, wrapped in its IIFE. If you need a lib change, request it in your final report. Don't edit `lib.js`, `main.js`, `index.html`, `render.js`, or other scenes.
2. **Everything is a pure function of `t`.** Don't use `Date.now()`, `Math.random()` (use `rand(i, salt)`), CSS transitions/animations, timers, or rAF. Create DOM once in `build()`. In `render()`, set **every animated property every frame**. For example, `show(el, t, 3, .6)` always writes, but `if (t > 3) el.style.opacity = 1` leaks state when frames render out of order.
3. **Don't change key-event times.** The soundtrack is cut to them (see `cues.json`). A few sub-events in `cues.json` were interpolated by the framework author (for example D's stack layers at 33.5 / 34.3 / 35.2 / 36.0, E's annotations at 51.0 / 51.2 / 51.4, and the B card landings at +0.2 s). Match them, or list your actual times in your report.
4. The stage is 1920x1080 with absolute pixel positions. Fonts: `"Segoe UI Variable Display","Segoe UI"` (inherited) and the `.mono` class for Consolas.
5. **Test your scene:** run `node render.js sheet <start> <end> 8`, then open `stills/sheet_<start>_<end>.jpg`. For single frames, run `node render.js test 61 62.5`, which writes `stills/test_61.jpg` and so on. Run `node render.js verify 60 65 70` to confirm determinism: it renders the frames in different orders and they must come out identical. Page exceptions are printed, and the exit code is 2 if any occur. All commands run from `video/v3/`.

## Layers (bottom to top)
`#bg` grid (drifts) → `#glow` → `#vig` vignette → **`canvas#cloud`** (3D cloud and `cloud.draw2D` hooks) → **`#stage`** (one root div per scene, stacked by start time) → **`canvas#fx`** (`Q.fx`, free 2D context above the DOM, cleared every frame) → **caption** → `#black` (`Q.setBlack(v)`).

## Scene registry
```js
Scene({ id:'F', start:58, end:74,
  fadeIn:.5, fadeOut:.5,   // crossfade seconds, centred on the boundary (both scenes at 50% at t=start)
  drift:.03,               // root zoom 1.00 -> 1.03 across the scene (0 = off)
  z,                       // optional stacking override (default = order)
  captions:[[70, 73.8, 'No signal. Still remembers. Still searches.']],
  build(root, scene){...}, // once, at load. Put DOM inside root.
  render(t, lt, fade){...} // every frame while visible: t in (start - fadeIn/2, end + fadeOut/2)
});
```
- `lt = t - start`. `fade` is the scene's current crossfade weight (0..1).
- The framework owns `root.style.opacity` and `root.style.transform`, so don't set them. Use an inner wrapper div if you need to move everything.
- Anything you draw on a canvas (`cloud.draw2D`, `Q.fx`) is **not** faded by the root, so multiply your alpha by `fade`.
- An exception in your build/render is caught and logged. It won't break other scenes.

## Timing and easing (globals)
| fn | meaning |
|---|---|
| `P(t,a,d=.6)` | linear clamped progress 0..1 over [a, a+d] |
| `E(t,a,d=.6,ease=easeOutExpo)` | eased progress |
| `easeOutExpo, easeInExpo, easeInOutExpo, easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine, easeOutQuart, easeOutBack(x,s), spring(x,damping=6.5,freq=2.1), linear` | easings on x in 0..1 |
| `pulse(t,t0,w=.15)` | gaussian bump (flashes, button presses) |
| `win(t,a,b,fi=.5,fo=.5)` | 0→1 at a, 1→0 by b |
| `blink(t,rate=2)` | 0/1 square blink |
| `keyframes(t, [[t0,v0],[t1,v1],...], ease)` | piecewise tween of numbers, arrays, or objects (great for cameras) |
| `lerp, invLerp, remap, clamp, lerp3, mixAny` | math |
| `rand(i,salt)`, `randn(i,salt)`, `seeded(seed)` (use in build only), `wiggle(t,seed,freq,amp)` | deterministic randomness |
| `mixColor(a,b,k)`, `rgba(hex,a)`, `hexToRgb` | colour |
| `COL.amber/green/red/indigo/indigoLt/text/sub/muted/grey/card/border/whatsapp` | palette (never break the semantics) |

## DOM and text helpers
- `el(tag, {cls, style, html, text, attrs}, parent)` and `h(htmlString, parent)` create elements. `css(el, obj)` sets styles.
- `setText(el, s)` / `setHTML(el, s)` write only when the value changes (fast).
- `xf(el, {x, y, s, sx, sy, r, rx, ry, persp, o, blur})` sets the transform and opacity in one call.
- `show(el, t, a, d=.6, {dy=24, dx=0, scale=1, ease=easeOutExpo, blur=0, out, outD=.4, outDy})` is the standard entrance (and optional exit at `out`). It returns the visible amount.
- `pop(el, t, a, d=.7, from=.6)` is a spring scale pop.
- `hideAfter(el, t, a, d=.4)` multiplies the current opacity by an exit fade. Call it after `show`.
- `typeText(el, str, t, start, cps=28, {cursor=true, cursorColor, hold=1.2})` types with a blinking cursor and returns progress 0..1.
- `staggerIn(els, t, start, gap=.08, showOpts)` staggers entrances (the style bible says 60–120 ms).
- `splitWords(el)` wraps words in spans (call it in build) so they can go through `staggerIn`.
- `countUp(t, a, d, from, to)` and `fmtTime(sec)` → `"2:58:41"`.
- `chip(html, color, parent, style)` makes a rounded tag.
- CSS classes: `.card` (style-bible card), `.abs`, `.mono`, `.hero`, `.amber .green .red .indigo .sub .muted .grey`, `.strike`, `.chip`, `.btn`.

## Components
```js
const lap = makeLaptop({ parent: root, x, y, w: 820, h: 560, title: "Tanishk's laptop · on a shoot", status: 'online' });
// lap.el (card), lap.body (content area, position:absolute, padding 24/28), lap.bar, lap.titleEl, lap.pill
lap.setStatus(t < 59 ? 'online' : 'offline', pulse(t, 59, .15));   // 2nd arg = pop amount 0..1
//   statuses: 'offline' (amber plane "Airplane mode · 0 B/s"), 'online' (green dot "Online"), 'syncing', 'resolved',
//             'custom' with lap.setStatus('custom', k, {color, html})
lap.setTitle("Lakshya's laptop · in the studio");

const net = netGraph({ parent: lap.body, x: 0, y: 0, w: 700, h: 110, label: 'network' });
net.render(t, { offAt: 59, onAt: 82.5 });   // flatlines to 0 B/s (amber) at offAt, springs back (green) at onAt
```
Note that `lap.body` is `position:absolute`. Absolutely-placed children ignore its padding, so use `x:28, y:24` or pass `pos:'relative'` to `netGraph`. For a 3D tilt, wrap it: `xf(lap.el, { persp: 1600, ry: 8, o: k })`.

## Captions
`caption(text, t, start, end, {html})`: 42px semibold on a dark rounded backing at y≈930–1000, fading in 0.45 s and out 0.4 s. The strongest caption of the frame wins, so they crossfade cleanly. Either list captions in `Scene({captions:[[a,b,text]]})` (these are evaluated even while your scene is fading) or call `caption()` inside `render`. Keep the bottom ~160 px clear of important content while a caption is up. Hold time is at least 3 words/sec.

## 3D cloud engine (`cloud`)
The cloud works in **immediate mode**. Every frame starts from defaults, and each visible scene *declares* what it wants during its `render()`. When two scenes overlap in a crossfade, their numeric settings and cameras are **blended by crossfade weight** automatically, so handoffs are smooth. Declare the same key-point id in both scenes for continuity; the later scene's declaration wins.

The world is about 3 units wide (a galaxy disc of radius about 1.6, centred at the origin), made of about 420 ambient points in 7 soft clusters plus spiral dust and nebula haze. It spins slowly around Y (`spin` rad/s). Key-point positions are in these same local (spinning) coordinates.

```js
cloud.set({ opacity:.6, ambientAlpha:1, nebula:1, keyAlpha:1, spin:.035, spinOffset:0, pointScale:1, dof:.8, fog:1,
            rect:{x:860,y:0,w:1060,h:1080},   // projection centre/scale region (e.g. right half of the screen)
            layer:'back' });                  // 'front' draws the cloud on the fx canvas ABOVE the DOM
cloud.opacity = .4;                           // shorthand setters exist for all of the above
cloud.setCamera({ target:[0,0,0], dist:4.4, yaw:0, pitch:.38, roll:0, fov:46, orbit:.02, pos:null, focus:null });
//  orbit camera around target (yaw/pitch/dist). orbit = auto yaw drift rad/s. pos:[x,y,z] overrides yaw/pitch/dist.
//  Tip: cloud.setCamera(keyframes(t, [[86.5,{dist:4.2,yaw:.4}], [89,{dist:2.4,yaw:.9}]]))

const k = cloud.addKeyPoint('note18', { pos: cloud.KEYS.note18, color: COL.amber,
      label: '18th · Tanishk · queued', sub: 'note on set', labelSide: 'right'|'left', labelDx, labelDy,
      size: 2.6, bornAt: 68.5, alpha: 1, pulse: 0 /*heartbeat amp*/, pulseRate: 2.2, ring: false, fixed: false });
// k is mutable for this frame (k.color = COL.red ...). Call addKeyPoint EVERY frame you want it.
cloud.birth('note18', 68.5);                  // same as bornAt: spring pop + flash + double shockwave ring
cloud.pulseWave(84, COL.green, { origin:[0,0,0], speed:1.4, width:.3, stay:0, boost:1.6 }); // wave through all points
cloud.pull('note18', 'email16', 86.5, 2.5, { gap:.3, beam:true, color });  // drag together + glowing beam + sparks
cloud.link('m1', 700, 520, 63, { color, dur:.45, width:2 });  // glowing line from key point to a screen point (DOM answer)
cloud.tint(cloud.nearest([.2,.25,.5], 14), COL.green, 1, 1.2); // recolour/boost ambient points (indices or fn(p,i)->w)
cloud.setInstances([{offset:[0,0,0]}, {offset:[5,0,-4], alpha:.6, tint:'#9DB4FF', decimate:2, scale:1, spin:0, phase:0}]); // "many clouds" (M)
cloud.draw2D((ctx, t, fade, cloud) => { ... }, { pre:false }); // custom canvas drawing in the cloud layer
const proj = cloud.projector();  proj([x,y,z]) // -> {x,y,z,s,vis}; inside draw2D this uses the FINAL blended camera
cloud.project([x,y,z]);  cloud.ambientLocal(i, t);  cloud.screenOf(id) /* after draw, i.e. next call in a hook */
cloud.KEYS  // shared positions: note18, email16, matchA, matchB, matchC (use these so F/G/H agree)
cloud.points, cloud.clusters, cloud.N
```
- Defaults when no scene sets anything: opacity .6, centred galaxy, slow orbit. The ambient field is always alive, so dim it (`cloud.opacity=.25`) behind dense UI rather than hiding it.
- To put the cloud in the right half, use `cloud.set({rect:{x:860,y:0,w:1060,h:1080}})`.
- To position DOM next to a key point in the same frame, set the camera first and then call `cloud.project(pos)`. For pixel-perfect alignment during crossfades, draw inside `cloud.draw2D` with `cloud.projector()`.
- Semantic colours in the cloud: amber = local/queued, green = synced, red = disputed, and indigo/white for ambient.

## Canvas helpers
`drawGlow(ctx, x, y, r, color, alpha, core=true)` (additive glowing dot), `glowLine(ctx, x1, y1, x2, y2, color, alpha, width)`, `glowSprite(color)`, `coreSprite(color)`, `roundRect(ctx, x, y, w, h, r)`.
`makeWordmark({text:'QUORUM', size:200, weight:800, spacing:44, cx:960, baseY:480})` returns `{samples(step), draw(ctx, alpha, sweepK, glow), bbox}`. Scene M can reuse this for the returning wordmark: copy C's particle code, or just `wm.draw` it inside a `cloud.draw2D` hook.

## Globals
`Q.t`, `Q.fx` (front 2D ctx), `Q.setBlack(v)` (fade to black, max of all scenes), `Q.scene`, `W=1920, H=1080, FPS=30, DURATION=150`. `window.__errors` collects exceptions.

## render.js
```
node render.js                        # full 0-150 s -> frames/ -> out/quorum-v3-silent.mp4 (+ out/quorum-v3.mp4 if audio/soundtrack.wav)
node render.js range 58 74            # frames for 58-74 s -> out/range_58_74.mp4   (--no-encode to skip)
node render.js test 61 62.5           # stills/test_<t>.jpg
node render.js sheet 58 74 8          # stills/sheet_58_74.jpg (8 time-stamped tiles)
node render.js verify 60 65 70        # determinism check
node render.js encode                 # re-encode existing frames
flags: --workers=8 --fps=30 --quality=92
```
