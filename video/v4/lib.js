/* =====================================================================
 * Quorum v4 motion framework: lib.js  (the whiteboard world)
 * Classic script, everything exposed as globals. Full API: FRAMEWORK.md.
 * RULE: every visual is a PURE FUNCTION OF t. No Date.now(), Math.random(), CSS transitions or
 * animations, timers or rAF. Build DOM once; in render(t) write every animated property every frame.
 * ===================================================================== */
(function (G) {
'use strict';

const W = 1920, H = 1080, FPS = 30;
/** Palette (site/css/site.css). Meanings: STORYBOARD.md "Palette". */
const COL = {
  paper: '#eef0f3', white: '#ffffff', line: '#dfe2e8',
  ink: '#14171f', ink2: '#3b4150', ink3: '#656b7a',
  blue: '#1f4fd8', red: '#c81e34', green: '#14895a', black: '#1b1d22',
  yellow: '#ffe14d', yellowTop: '#ffe86a', sky: '#9fd6ff', skyTop: '#b3dfff',
  kraft: '#e2c08a', kraft2: '#c9a165', kraftInk: '#3a2a12', tape: 'rgba(239,227,184,.88)',
};
const HAND = '"Shantell Sans","Comic Sans MS",cursive';
const UI = '"Schibsted Grotesk",system-ui,sans-serif';
/** World: one giant whiteboard. The 3x3 grid of scene cells (5760x3240) sits inside a margin of half a
 *  screen of clean board on every side, so zoomed framings near a cell edge never run off the board. */
const BOARD = { w: 7680, h: 4320, ox: 960, oy: 540 };
/** Default scene regions (world px, top-left of a 1920x1080 cell). Scenes may place things anywhere. */
const REGIONS = {
  COLD: { x: 960, y: 540, w: 1920, h: 1080 },          // S01
  TITLE: { x: 2880, y: 540, w: 1920, h: 1080 },      // S02 title board
  LANDING: { x: 2880, y: 1620, w: 1920, h: 1080 }, // S02 landing hero plate (board centre; S15 logo lands here)
  STAGE: { x: 4800, y: 1620, w: 1920, h: 1080 },   // S03-S11 stage plate
  ARCH: { x: 4800, y: 2700, w: 1920, h: 1080 },    // S12 deck slide 5
  KEY: { x: 2880, y: 2700, w: 1920, h: 1080 },     // S13 key vector
  ASSIST: { x: 960, y: 2700, w: 1920, h: 1080 },     // S14 slide 6
  DAY: { x: 960, y: 1620, w: 1920, h: 1080 },        // S14 slide 7
  SPARE: { x: 4800, y: 540, w: 1920, h: 1080 },
  ALL: { x: 960, y: 540, w: 5760, h: 3240 },       // the scene grid
  WHOLE: { x: 0, y: 0, w: 7680, h: 4320 },         // the whole board including its margin
};

/* ---------------------------------------------------------------- math */
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const invLerp = (a, b, x) => clamp((x - a) / (b - a));
const remap = (x, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, x));
const P = (t, a, d = 0.6) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));
const linear = x => x;
const easeOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeInExpo = x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
const easeInOutExpo = x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
const easeInCubic = x => x * x * x;
const easeInOutCubic = x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeInOutSine = x => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOutQuart = x => 1 - Math.pow(1 - x, 4);
const easeOutBack = (x, s = 1.70158) => { const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
/** spring(x): damped 0 -> 1 with overshoot (~4% at the defaults used for stickies: spring(x, 7, 1.6)). */
const spring = (x, damping = 6.5, freq = 2.1) => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-damping * x) * Math.cos(freq * 2 * Math.PI * x) * (1 - x * x * x);
const E = (t, a, d = 0.6, ease = easeOutExpo) => ease(P(t, a, d));
const pulse = (t, t0, w = 0.15) => Math.exp(-Math.pow((t - t0) / w, 2));
const win = (t, a, b, fi = .5, fo = .5) => Math.min(easeOutCubic(P(t, a, fi)), 1 - easeInCubic(P(t, b - fo, fo)));
const EASE = { linear, easeOutExpo, easeInExpo, easeInOutExpo, easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine, easeOutQuart, outExpo: easeOutExpo, inOutCubic: easeInOutCubic, inOutSine: easeInOutSine, outCubic: easeOutCubic };
const easeOf = e => (typeof e === 'function' ? e : EASE[e] || easeInOutCubic);
function mixAny(a, b, k) {
  if (typeof a === 'number') return lerp(a, b, k);
  if (Array.isArray(a)) return a.map((v, i) => mixAny(v, b[i], k));
  if (a && typeof a === 'object') { const o = {}; for (const key in a) o[key] = key in b ? mixAny(a[key], b[key], k) : a[key]; for (const key in b) if (!(key in a)) o[key] = b[key]; return o; }
  return k < .5 ? a : b;
}
/** keyframes(t, [[t0,v0,ease?],[t1,v1,ease?],...], ease): piecewise tween; a key's ease shapes the segment ending at it. */
function keyframes(t, keys, ease = easeInOutCubic) {
  if (!keys.length) return null;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [ta, va] = keys[i - 1], [tb, vb, eb] = keys[i];
    return mixAny(va, vb, easeOf(eb || ease)((t - ta) / Math.max(1e-9, tb - ta)));
  }
  return keys[keys.length - 1][1];
}
/** pwl(x, [[x0,y0],[x1,y1],...]): piecewise-linear map, clamped at both ends (capture maps vt -> ct). */
function pwl(x, pts) {
  if (!pts || !pts.length) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = pts[i - 1], [c, d] = pts[i]; return c === a ? d : b + (d - b) * (x - a) / (c - a); }
  return pts[pts.length - 1][1];
}
/** pwlInverse(y, pts): first x where the map reaches y (for "when does ct c play in the film"). */
function pwlInverse(y, pts) {
  for (let i = 1; i < pts.length; i++) { const [a, b] = pts[i - 1], [c, d] = pts[i]; if ((y >= b && y <= d) || (y <= b && y >= d)) return d === b ? a : a + (c - a) * (y - b) / (d - b); }
  return null;
}

/* -------------------------------------------------------- deterministic rand */
function rand(i, salt = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(salt | 0, 668265263) + 0x9E3779B9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const randn = (i, salt = 0) => { const u = Math.max(1e-9, rand(i, salt)), v = rand(i, salt + 7919); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
function wiggle(t, seed = 0, freq = 1, amp = 1) { const a = rand(seed, 1) * 6.283, b = rand(seed, 2) * 6.283; return amp * (0.6 * Math.sin(t * freq + a) + 0.4 * Math.sin(t * freq * 2.31 + b)); }
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------------------------------------------------------------- colour */
function hexToRgb(c) { if (Array.isArray(c)) return c; if (c[0] === '#') { let s = c.slice(1); if (s.length === 3) s = s.split('').map(x => x + x).join(''); const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } const m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0]; }
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mixColor = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]); };
const rgba = (c, a) => { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; };
const markerColor = c => (c in COL ? COL[c] : c);

/* ------------------------------------------------------------------- DOM */
const $ = (sel, root = document) => (typeof sel === 'string' ? root.querySelector(sel) : sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function el(tag = 'div', props = {}, parent = null) {
  const e = document.createElement(tag);
  if (props.cls) e.className = props.cls;
  if (props.style) { if (typeof props.style === 'string') e.style.cssText = props.style; else Object.assign(e.style, props.style); }
  if (props.html != null) e.innerHTML = props.html;
  if (props.text != null) e.textContent = props.text;
  if (props.attrs) for (const k in props.attrs) e.setAttribute(k, props.attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function h(html, parent = null) { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild; if (parent) parent.appendChild(e); return e; }
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent = null) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
/** A 1x1 overflow-visible SVG at the parent's origin: draw in the parent's coordinates. */
function svgLayer(parent, style = '') { return svgEl('svg', { width: 1, height: 1, style: `position:absolute;left:0;top:0;overflow:visible;pointer-events:none;${style}` }, parent); }
const css = (e, obj) => (Object.assign(e.style, obj), e);
function setHTML(e, s) { if (e.__html !== s) { e.innerHTML = s; e.__html = s; } }
function setText(e, s) { if (e.__text !== s) { e.textContent = s; e.__text = s; } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** xf(el, {x, y, s, sx, sy, r, o, blur, origin}): transform + opacity in one write. */
function xf(e, o = {}) {
  const p = [];
  if (o.x || o.y) p.push(`translate(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px)`);
  if (o.r) p.push(`rotate(${o.r.toFixed(3)}deg)`);
  if (o.s != null && o.s !== 1) p.push(`scale(${o.s.toFixed(4)})`);
  if (o.sx != null || o.sy != null) p.push(`scale(${o.sx ?? 1},${o.sy ?? 1})`);
  e.style.transform = p.join(' ');
  if (o.o != null) { const v = clamp(o.o); e.style.opacity = v; e.style.visibility = v <= 0.001 ? 'hidden' : 'visible'; }
  if (o.blur != null) e.style.filter = o.blur > .05 ? `blur(${o.blur}px)` : 'none';
  return e;
}
/** vis(el, on): display toggle that only writes on change. */
function vis(e, on) { const v = on ? '' : 'none'; if (e.style.display !== v) e.style.display = v; }
/** show(el, t, a, d=.6, {dy=18, dx=0, scale=1, ease, out, outD=.3}): standard entrance (and optional exit). Returns 0..1. */
function show(e, t, a, d = .6, o = {}) {
  const { dy = 18, dx = 0, scale = 1, ease = easeOutExpo, out = null, outD = .3, r = 0 } = o;
  const k = ease(P(t, a, d)), kc = clamp(k), ko = out != null ? easeInOutCubic(P(t, out, outD)) : 0;
  xf(e, { x: (1 - k) * dx, y: (1 - k) * dy, s: lerp(scale, 1, k), r, o: Math.min(kc * 1.2, 1) * (1 - ko) });
  return kc * (1 - ko);
}
/** pop(el, t, a, d=.6, from=.6): spring scale pop. */
function pop(e, t, a, d = .6, from = .6, r = 0) { const k = spring(P(t, a, d)); xf(e, { s: lerp(from, 1, k), r, o: P(t, a, d * .25) }); return clamp(k); }
/** countUp(t, a, d, from, to). */
const countUp = (t, a, d, from, to, ease = easeOutCubic) => lerp(from, to, ease(P(t, a, d)));

/* ---------------------------------------------------------------- boil */
const BOIL_FPS = 7;
/** boilStep(t, n=3): which of n drawings shows at t (shape-only boil, ~7 fps, from t not wall clock). */
const boilStep = (t, n = 3) => ((Math.floor(t * BOIL_FPS) % n) + n) % n;
/** jitterPath(d, amp, seed): every number in d nudged by +-amp (site/js/board.js). Only for M/L/C/Q/S/T/H/V/Z paths. */
function jitterPath(d, amp, seed) {
  let i = 0;
  const r = () => { const x = Math.sin(seed * 9301 + (i++) * 49297) * 233280; return x - Math.floor(x); };
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, n => (parseFloat(n) + (r() * 2 - 1) * amp).toFixed(2));
}
/** boilVariants(d, amp=1.2, seed): [d, jitter1, jitter2]. */
const boilVariants = (d, amp = 1.2, seed = 1) => [jitterPath(d, amp * 0.5, seed * 7 + 1), jitterPath(d, amp, seed * 7 + 3), jitterPath(d, amp, seed * 7 + 5)];
/** INFM axis values cycled for handwriting boil (Shantell Sans "Informality"). */
const INFM = [0, 6, 3];
let _measure = null;
function pathLength(d) {
  if (!_measure) { const s = svgEl('svg', { width: 0, height: 0, style: 'position:absolute;left:-9999px' }, document.body); _measure = svgEl('path', {}, s); }
  _measure.setAttribute('d', d); try { return _measure.getTotalLength(); } catch (e) { return 100; }
}

/* ============================================================== MARKER */
/** Stroke time from length: length/1400 px/s, clamped to 0.25-0.8 s (style bible). */
const strokeDur = len => clamp(len / 1400, .25, .8);
/**
 * markerPath(parent, d, {color='blue', width=5, t0=0, dur=auto, seed, opacity=1, dry=true, out=null, outD=.3, cap='round', fill})
 * A marker stroke drawn progressively along an SVG path (parent coordinates), boiled at ~7 fps.
 * -> {el, len, dur, t0, render(t) -> progress}
 */
function markerPath(parent, d, o = {}) {
  const { color = 'blue', width = 5, opacity = 1, dry = true, cap = 'round', fill = 'none' } = o;
  const svg = o.svg || svgLayer(parent);
  const len = pathLength(d), dur = o.dur ?? strokeDur(len), seed = o.seed ?? (hashStr(d) % 997);
  const p = svgEl('path', { d, fill, stroke: markerColor(color), 'stroke-width': width, 'stroke-linecap': cap, 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, svg);
  // dry-marker texture; skipped for straight horizontal/vertical strokes (a zero-size bbox would hide them)
  if (dry) { let bb = null; try { _measure.setAttribute('d', d); bb = _measure.getBBox(); } catch (e) { /* ignore */ } if (bb && bb.width > 6 && bb.height > 6) p.setAttribute('filter', 'url(#dry)'); }
  const vars = boilVariants(d, o.amp ?? 1.2, seed);
  const api = {
    el: p, svg, len, dur, t0: o.t0 ?? 0, d,
    render(t) {
      const k = easeInOutSine(P(t, api.t0, api.dur));
      const ko = o.out != null ? easeInOutCubic(P(t, o.out, o.outD ?? .3)) : 0;
      if (k <= 0 || ko >= 1) { p.style.display = 'none'; return 0; }
      p.style.display = '';
      p.setAttribute('d', vars[boilStep(t + seed * .013)]);
      p.setAttribute('stroke-dashoffset', (1 - k).toFixed(4));
      p.style.opacity = opacity * (1 - ko);
      return k;
    },
  };
  return api;
}
/** A group of strokes drawn one after another (gap s between them). -> {render(t), parts, end} */
function strokeSeq(parent, ds, o = {}) {
  const svg = svgLayer(parent); let t = o.t0 ?? 0; const parts = [];
  for (const d of ds) { const m = markerPath(parent, d, { ...o, svg, t0: t, dur: o.durEach }); parts.push(m); t += m.dur + (o.gap ?? .04); }
  return { parts, svg, end: t, render(tt) { let k = 0; for (const m of parts) k += m.render(tt); return k / parts.length; } };
}
/** Hand-drawn loop around a rect {x,y,w,h} (overshoots its start). */
function circlePathD(r, seed = 1, pad = 10, turns = 1.12) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + pad + 6, ry = r.h / 2 + pad;
  const n = 28, a0 = -2.2 + rand(seed, 3) * .5, pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 * turns, wob = 1 + (rand(seed, i) - .5) * .06 + (i / n) * .05;
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  return smoothD(pts);
}
/** Catmull-Rom through points -> cubic path d. */
function smoothD(pts) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
/** markerCircle(parent, rect, {color='red', width=5, t0, pad=10, ...markerPath}) */
const markerCircle = (parent, rect, o = {}) => markerPath(parent, circlePathD(rect, o.seed ?? (Math.round(rect.x + rect.y) % 97), o.pad ?? 10, o.turns ?? 1.12), { color: 'red', width: 5, ...o });
/** markerUnderline(parent, x1, x2, y, {color='blue', width=5, wave=4, t0}) */
function markerUnderline(parent, x1, x2, y, o = {}) {
  const wv = o.wave ?? 4, m = (x1 + x2) / 2;
  const d = `M${x1 - 4} ${y + wv * .4} C ${lerp(x1, m, .5)} ${y - wv}, ${lerp(m, x2, .5)} ${y + wv}, ${x2 + 6} ${y - wv * .6}`;
  return markerPath(parent, d, { color: 'blue', width: 5, ...o });
}
/** markerArrow(parent, from:[x,y], to:[x,y], {color='ink', width=4, bend=.18, head=18, t0}): shaft then head. -> strokeSeq */
function markerArrow(parent, a, b, o = {}) {
  const bend = o.bend ?? .18, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, c = [a[0] + dx / 2 + nx * L * bend, a[1] + dy / 2 + ny * L * bend];
  const shaft = `M${a[0]} ${a[1]} Q ${c[0].toFixed(1)} ${c[1].toFixed(1)}, ${b[0]} ${b[1]}`;
  const tx = b[0] - c[0], ty = b[1] - c[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hs = o.head ?? 18;
  const h1 = [b[0] - ux * hs + uy * hs * .6, b[1] - uy * hs - ux * hs * .6], h2 = [b[0] - ux * hs - uy * hs * .6, b[1] - uy * hs + ux * hs * .6];
  const head = `M${h1[0].toFixed(1)} ${h1[1].toFixed(1)} L ${b[0]} ${b[1]} L ${h2[0].toFixed(1)} ${h2[1].toFixed(1)}`;
  return strokeSeq(parent, [shaft, head], { color: 'ink', width: 4, ...o, gap: .02, durEach: undefined });
}
/** markerCross(parent, cx, cy, size, o): an X (two strokes). */
const markerCross = (parent, cx, cy, s = 24, o = {}) => strokeSeq(parent, [`M${cx - s} ${cy - s} L ${cx + s} ${cy + s * .9}`, `M${cx + s * .9} ${cy - s} L ${cx - s} ${cy + s}`], { color: 'red', width: 6, ...o });
/** markerTick(parent, cx, cy, size, o): a check mark. */
const markerTick = (parent, cx, cy, s = 20, o = {}) => markerPath(parent, `M${cx - s} ${cy} L ${cx - s * .3} ${cy + s * .7} L ${cx + s * 1.1} ${cy - s * .9}`, { color: 'green', width: 5, ...o });
/** markerSlash(parent, x1, y1, x2, y2, o): one straight-ish stroke (strike-throughs, cut links). */
const markerSlash = (parent, x1, y1, x2, y2, o = {}) => markerPath(parent, `M${x1} ${y1} Q ${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2 - 4}, ${x2} ${y2}`, { color: 'red', width: 5, ...o });
/** markerScribble(parent, rect, {loops=2}): looping scribble around a rect (the hero "both cards" loops). */
function markerScribble(parent, rect, o = {}) {
  const loops = o.loops ?? 2, seed = o.seed ?? 5, d = circlePathD(rect, seed, o.pad ?? 14, loops + .15);
  return markerPath(parent, d, { color: 'red', width: 5, dur: o.dur ?? .7, ...o });
}

/**
 * handText(parent, text, x, y, {color='blue', size=34, weight=600, t0=0, cps=22, rot=-2, align='left', maxW, out, html})
 * A handwritten annotation (Shantell Sans), written on left to right, boiled through the INFM axis.
 * Baseline-ish at y (top of the text box is y - size). -> {el, render(t), dur}
 */
function handText(parent, text, x, y, o = {}) {
  const { color = 'blue', size = 34, weight = 600, rot = -2, align = 'left' } = o;
  const e = el('div', { cls: 'hand', style: `left:${x}px;top:${y - size * 1.1}px;font-size:${size}px;font-weight:${weight};color:${markerColor(color)};` + (o.maxW ? `max-width:${o.maxW}px;white-space:normal;` : '') + (align === 'center' ? 'transform-origin:50% 50%;' : '') }, parent);
  if (o.html) e.innerHTML = o.html; else e.textContent = text;
  if (align === 'center') e.style.marginLeft = `${-0.5 * e.offsetWidth}px`;
  if (align === 'right') e.style.marginLeft = `${-e.offsetWidth}px`;
  const dur = o.dur ?? clamp(String(text || e.textContent).length / (o.cps ?? 22), .25, 1.6);
  const api = {
    el: e, dur, t0: o.t0 ?? 0,
    render(t) {
      const k = P(t, api.t0, api.dur), ko = o.out != null ? easeInOutCubic(P(t, o.out, o.outD ?? .3)) : 0;
      if (k <= 0 || ko >= 1) { e.style.display = 'none'; return 0; }
      e.style.display = '';
      e.style.clipPath = k >= 1 ? 'none' : `inset(-20% ${((1 - k) * 100).toFixed(2)}% -30% -5%)`;
      e.style.transform = `rotate(${rot}deg)`;
      e.style.opacity = 1 - ko;
      e.style.fontVariationSettings = `"INFM" ${INFM[boilStep(t)]}`;
      return k;
    },
  };
  return api;
}

/* ============================================================== STICKIES */
const STICKY_BG = {
  yellow: `linear-gradient(180deg, ${COL.yellowTop}, ${COL.yellow} 30%)`,
  blue: `linear-gradient(180deg, ${COL.skyTop}, ${COL.sky} 30%)`,
  kraft: `linear-gradient(180deg, #ead0a0, ${COL.kraft} 40%, ${COL.kraft2})`,
  white: 'linear-gradient(180deg, #ffffff, #f7f8fa)',
};
/**
 * sticky(parent, {x, y, w=280, h, color='yellow'|'blue'|'kraft'|'white', rot=-3, text, html, meta, size=30,
 *                 tape=1|2|0, t0 (contact time), from:{dx,dy}, out})
 * Square-ish note, tape strip(s), lighter top band, curl, soft shadow. Slap: scale 1.18 and +8deg,
 * spring settle, shadow tightens on contact. x/y = centre. -> {el, body, render(t) -> settle 0..1}
 */
function sticky(parent, o = {}) {
  const { x = 0, y = 0, w = 280, color = 'yellow', rot = -3, size = 30, tape = 1 } = o;
  const e = el('div', { cls: `sticky ${color}`, style: `left:${x - w / 2}px;top:${y - (o.h || w) / 2}px;width:${w}px;${o.h ? `height:${o.h}px;` : `min-height:${w * .82}px;`}background:${STICKY_BG[color] || color};font-size:${size}px;` + (color === 'kraft' ? `color:${COL.kraftInk};` : '') }, parent);
  const body = el('div', { cls: 'sticky-body', html: o.html ?? esc(o.text || '') }, e);
  if (o.meta) el('div', { cls: 'sticky-meta', html: o.meta }, e);
  if (tape >= 1) el('i', { cls: 'tape', style: tape === 2 ? 'left:8%;transform:rotate(-8deg)' : `left:50%;margin-left:-38px;transform:rotate(${(rand(x | 0, y | 0) - .5) * 8}deg)` }, e);
  if (tape >= 2) el('i', { cls: 'tape', style: 'right:8%;transform:rotate(7deg)' }, e);
  e.style.transformOrigin = '50% 40%';
  const api = {
    el: e, body, t0: o.t0 ?? 0, rot,
    render(t) {
      const t0 = api.t0, a = t0 - .12;                       // motion starts 0.12 s before contact
      if (t < a) { e.style.display = 'none'; return 0; }
      e.style.display = '';
      const kin = easeInCubic(P(t, a, .12));                 // falling onto the board
      const ks = spring(P(t, t0, .55), 7, 1.6);               // settle after contact
      const s = t < t0 ? lerp(1.18, 1.0, kin) : 1 + (1 - ks) * -0.04 * Math.sin(P(t, t0, .55) * Math.PI);
      const r = rot + (t < t0 ? lerp(8, 0, kin) : 0);
      const fx = o.from ? (1 - kin) * (o.from.dx || 0) : 0, fy = o.from ? (1 - kin) * (o.from.dy || 0) : 0;
      const ko = o.out != null ? easeInOutCubic(P(t, o.out, o.outD ?? .3)) : 0;
      xf(e, { x: fx, y: fy, s, r, o: Math.min(1, P(t, a, .06)) * (1 - ko) });
      const lift = t < t0 ? 1 - kin : 0;                     // shadow: big and soft in the air, tight on contact
      e.style.boxShadow = `0 ${10 + lift * 26}px ${18 + lift * 30}px -8px rgba(20,23,31,${.35 - lift * .12}), 0 2px 3px rgba(20,23,31,.10)`;
      return t < t0 ? 0 : ks;
    },
  };
  return api;
}
/** tag(parent, {x, y, text, html, kind='kraft'|'tape'|'paper', rot=-2, size=24, w}): a small label slip (no animation; use show/pop on .el). */
function tag(parent, o = {}) {
  const e = el('div', { cls: `tag ${o.kind || 'kraft'}`, html: o.html ?? esc(o.text || ''), style: `left:${o.x || 0}px;top:${o.y || 0}px;font-size:${o.size || 24}px;${o.w ? `width:${o.w}px;white-space:normal;` : ''}` }, parent);
  e.style.setProperty('--r', `${o.rot ?? -2}deg`);
  return e;
}

/**
 * wordRect(root, elOrApi, word, {final=true}): rect of `word` inside an element, in root's coordinates
 * (build() time only, before the camera moves the world). For stickies, measured in their settled pose.
 */
function wordRect(root, target, word, o = {}) {
  const e = target.el || target, prevD = e.style.display, prevT = e.style.transform, prevV = e.style.visibility;
  e.style.display = ''; e.style.visibility = 'visible';
  if (o.final !== false && target.rot != null) e.style.transform = `rotate(${target.rot}deg)`;
  const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let node, r = null;
  while ((node = walker.nextNode())) {
    const i = node.textContent.indexOf(word); if (i < 0) continue;
    const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + word.length);
    const a = range.getBoundingClientRect(), b = root.getBoundingClientRect();
    r = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; break;
  }
  e.style.display = prevD; e.style.transform = prevT; e.style.visibility = prevV;
  return r;
}

/* ============================================================ WHITEBOARD */
const TRAY_SVG = `<svg viewBox="0 0 204 70" width="204" height="70" aria-hidden="true"><defs><linearGradient id="wbBarrel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#f4f5f7"/><stop offset=".8" stop-color="#d4d8de"/><stop offset="1" stop-color="#b9bec7"/></linearGradient><linearGradient id="wbCapB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f86ff"/><stop offset=".45" stop-color="#1f4fd8"/><stop offset="1" stop-color="#14328f"/></linearGradient><linearGradient id="wbCapR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b7e"/><stop offset=".45" stop-color="#d7263d"/><stop offset="1" stop-color="#8f1424"/></linearGradient><linearGradient id="wbGrip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f59"/><stop offset=".5" stop-color="#2a2e35"/><stop offset="1" stop-color="#16181c"/></linearGradient><linearGradient id="wbFelt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece7da"/><stop offset="1" stop-color="#cfc8b7"/></linearGradient></defs>
<g transform="translate(18 41) rotate(-11)"><rect x="0" y="0" width="64" height="11" rx="5.5" fill="url(#wbBarrel)"/><rect x="18" y="2.4" width="26" height="6.2" rx="1.2" fill="#d7263d" opacity=".9"/><rect x="60" y="-0.6" width="24" height="12.2" rx="3" fill="url(#wbCapR)"/><rect x="66" y="-2.6" width="16" height="2.6" rx="1.2" fill="#a51a2e"/><rect x="-3" y="2" width="4.5" height="7" rx="1.8" fill="#8f1424"/><path d="M3 2.2 H58" stroke="#fff" stroke-width="1.2" opacity=".9" stroke-linecap="round"/></g>
<g transform="translate(6 23) rotate(-4)"><rect x="0" y="0" width="74" height="13" rx="6.5" fill="url(#wbBarrel)"/><rect x="20" y="2.8" width="32" height="7.4" rx="1.4" fill="#1f4fd8"/><rect x="70" y="-0.8" width="27" height="14.6" rx="3.4" fill="url(#wbCapB)"/><path d="M76 -3.2 H95 Q 97 -3.2 96.6 -1 L 95.6 2.4" stroke="#14328f" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="-3.6" y="2.4" width="5" height="8.2" rx="2" fill="#14328f"/><path d="M3 2.6 H66" stroke="#fff" stroke-width="1.4" opacity=".95" stroke-linecap="round"/></g>
<g transform="translate(118 20) rotate(3)"><path d="M2 18 H76 L74 30 Q 73 32 70 32 H8 Q 5 32 4 30 Z" fill="url(#wbFelt)"/><path d="M10 27 C 22 25, 30 29, 44 26" stroke="#1f4fd8" stroke-width="2.4" opacity=".22" fill="none" stroke-linecap="round"/><rect x="0" y="8" width="78" height="11" rx="2.5" fill="url(#wbGrip)"/><path d="M10 2 H68 Q 74 2 74 8 V 10 H 4 V 8 Q 4 2 10 2 Z" fill="url(#wbGrip)"/><path d="M14 5.2 H64" stroke="rgba(255,255,255,.28)" stroke-width="1.4" stroke-linecap="round"/></g></svg>`;
/**
 * whiteboard(parent, {x, y, w, h, tray=true, frame=14}): a framed board (aluminium edge, dark corner caps,
 * enamel sheen, marker tray with the blue and red markers and the eraser). -> {el, surface}
 */
function whiteboard(parent, o = {}) {
  const { x = 0, y = 0, w = 1600, h = 900, tray = true, frame = 14 } = o;
  const e = el('div', { cls: 'wb', style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:${frame}px` }, parent);
  for (const c of ['tl', 'tr', 'bl', 'br']) el('i', { cls: `wb-cap ${c}` }, e);
  const surface = el('div', { cls: 'wb-surface' }, e);
  if (tray) { const t = el('div', { cls: 'wb-tray' }, e); el('div', { cls: 'wb-tools', html: TRAY_SVG }, t); }
  return { el: e, surface };
}

/* ============================================================== ERASER */
/**
 * eraser(parent, {x, y, w, h, t0, dur=1, worldX, worldY}): wipes the rect left to right. The swath is a
 * patch of clean board (same texture, aligned to the world) that grows behind the eraser block.
 * worldX/worldY: the parent's world origin (scene.region.x/y) so the texture lines up.
 * -> {render(t) -> progress, done(t)}
 */
function eraser(parent, o = {}) {
  const { x = 0, y = 0, w = 1920, h = 1080, dur = 1 } = o;
  const swath = el('div', { cls: 'erase-swath board-tex', style: `left:${x}px;top:${y}px;height:${h}px;width:0;background-position:${-(o.worldX || 0) - x}px ${-(o.worldY || 0) - y}px` }, parent);
  const block = el('div', { cls: 'erase-block', html: '<i></i>', style: `top:${y + h / 2 - 90}px` }, parent);
  const api = {
    t0: o.t0 ?? 0, dur,
    render(t) {
      const k = easeInOutSine(P(t, api.t0, dur));
      if (k <= 0) { swath.style.display = 'none'; block.style.display = 'none'; return 0; }
      swath.style.display = ''; swath.style.width = `${(w + 80) * k}px`;
      const bx = x + (w + 80) * k - 40, wob = Math.sin(k * 18) * 26;
      block.style.display = k >= 1 ? 'none' : '';
      block.style.transform = `translate(${bx}px, ${wob}px) rotate(${-8 + Math.sin(k * 9) * 6}deg)`;
      return k;
    },
  };
  return api;
}

/* ============================================================ CAMERA */
/**
 * The camera looks at world point (x, y) with zoom z (screen px per world px) and roll r (deg).
 * main.js evaluates one global keyframe track merged from every scene's `camera` keys, adds the
 * scenes' shakes and punches and the constant micro drift, and sets CAM.cur before any render(t).
 */
const CAM = {
  cur: { x: 960, y: 540, z: 1, r: 0, sx: 0, sy: 0 },   // sx/sy: screen-space offset (drift + shake)
  /** world -> screen point with this frame's camera */
  toScreen(x, y) {
    const c = CAM.cur, rr = c.r * Math.PI / 180, cs = Math.cos(rr), sn = Math.sin(rr);
    const dx = (x - c.x) * c.z, dy = (y - c.y) * c.z;
    return { x: W / 2 + dx * cs - dy * sn + c.sx, y: H / 2 + dx * sn + dy * cs + c.sy };
  },
  /** world rect -> screen rect (axis-aligned bounds) */
  rectToScreen(r) { const a = CAM.toScreen(r.x, r.y), b = CAM.toScreen(r.x + r.w, r.y + r.h); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; },
  /** screen -> world */
  toWorld(sx, sy) {
    const c = CAM.cur, rr = -c.r * Math.PI / 180, cs = Math.cos(rr), sn = Math.sin(rr);
    const dx = sx - W / 2 - c.sx, dy = sy - H / 2 - c.sy;
    return { x: c.x + (dx * cs - dy * sn) / c.z, y: c.y + (dx * sn + dy * cs) / c.z };
  },
  /** the world rect currently on screen (bounds, ignoring roll) */
  view() { const c = CAM.cur; const hw = W / 2 / c.z, hh = H / 2 / c.z; return { x: c.x - hw, y: c.y - hh, w: 2 * hw, h: 2 * hh }; },
};
/** frameRect(worldRect, {pad=60, zMin=.2, zMax=2.6, dx=0, dy=0, z}) -> camera {x, y, z} fitting the rect. */
function frameRect(r, o = {}) {
  const pad = o.pad ?? 60;
  const z = o.z ?? clamp(Math.min(W / (r.w + 2 * pad), (H - (o.capSafe ? 170 : 0)) / (r.h + 2 * pad)), o.zMin ?? .2, o.zMax ?? 2.6);
  return { x: r.x + r.w / 2 + (o.dx || 0), y: r.y + r.h / 2 + (o.dy || 0) + (o.capSafe ? 85 / z : 0), z, r: o.r || 0 };
}
const unionRect = rs => { rs = rs.filter(Boolean); if (!rs.length) return null; const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const regionCam = (name, z = 1) => { const r = REGIONS[name] || name; return { x: r.x + r.w / 2, y: r.y + r.h / 2, z, r: 0 }; };

/* ============================================================ CLIPS (real UI) */
/** Clip data: render.js injects window.CLIPS = {SHOT: {meta, actions}}; opened by hand, it is read with sync XHR. */
function clipData(shot) {
  G.CLIPS = G.CLIPS || {};
  if (G.CLIPS[shot]) return G.CLIPS[shot];
  const read = f => { try { const x = new XMLHttpRequest(); x.open('GET', f, false); x.send(); return x.status === 0 || x.status === 200 ? JSON.parse(x.responseText) : null; } catch (e) { return null; } };
  return (G.CLIPS[shot] = { meta: read(`clips/${shot}/meta.json`), actions: read(`clips/${shot}/actions.json`) });
}
/** capture map for a shot over the whole film: every scene's capture_maps[shot], joined in time order. */
function globalMap(shot) {
  const pts = [];
  for (const s of (G.CUES && G.CUES.scenes) || []) for (const p of ((s.capture_maps || {})[shot] || [])) pts.push(p.slice());
  pts.sort((a, b) => a[0] - b[0]);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}
/** STAGE framings (STORYBOARD "Named camera framings"): rect names to fit, padding, z cap. */
const STAGE_FRAMINGS = {
  WIDE: { all: true, z: .86 }, FULL: { all: true, z: 1 },
  L_SWITCH: { rects: ['L.header'], pad: 30, zMax: 2.1 }, L_ASK: { rects: ['L.suggestDue', 'L.answer'], pad: 40, zMax: 1.9 },
  L_CAPTURE: { rects: ['L.capture'], pad: 50, zMax: 2.0 }, L_CLOUD: { rects: ['L.cloud'], pad: 30, zMax: 2.2 },
  L_CARD: { rects: ['L.conflictCard'], pad: 40, zMax: 1.9 }, R_ASK: { rects: ['R.suggestDue', 'R.answer'], pad: 40, zMax: 1.9 },
  R_INBOX: { rects: ['R.capture'], pad: 50, zMax: 1.9 }, R_HUB: { rects: ['R.pane', 'HUB.total'], pad: 30, zMax: 1.3 },
  HUB: { rects: ['HUB.total', 'HUB.privacy'], pad: 50, zMax: 2.0 }, BOTH_CARDS: { rects: ['L.conflictCard', 'R.conflictCard'], pad: 40, zMax: 1.15 },
};

const _plates = [];
/**
 * screenFrame({parent, scene|world:{x,y}, clip, x, y, w=1920, chrome='card'|'browser'|'none', tape=true,
 *              map (pts [[vt,ct],...] or fn(vt)->ct; default: globalMap(clip)), inner (keys [[t,{cx,cy,z}]]), z})
 * A captured clip pinned to the board. x, y, w are in the parent's coordinates; plate CSS px scale
 * = w / 1920. The frame shown at video time t is round(map(t)*30). For stills, frame is still.png
 * (variant: plate.setStill('nostk')).
 *   plate.render(t)            set the frame (call every frame the plate is visible)
 *   plate.ct(t)                capture time at t
 *   plate.rect(name, t)        logged element rect -> parent coords (null if hidden at that ct)
 *   plate.worldRect(name, t)   same in world coords; plate.screenRect(name, t) in screen px
 *   plate.point(name, t, ax=.5, ay=.5) -> world point; plate.toWorld(px, py) plate CSS px -> world
 *   plate.frame(nameOrRects, t, {pad, zMax, capSafe}) -> camera {x,y,z} fitting rects (STAGE_FRAMINGS names work)
 *   plate.overlay              div in plate CSS px (1920x1080), drawn over the UI, zooms with it
 *   plate.events(type, ct0, ct1) actions.json events; plate.clickTimes() -> [{vt, ct, sel, rect}]
 *   plate.lift(name, t0, {scale=1.12, dur=.5}) pop a crop of the plate (counter pops)
 *   plate.caret(t)             -> world rect of the typing caret while typing, else null
 */
function screenFrame(o = {}) {
  const shot = o.clip, data = clipData(shot), meta = data.meta || { frames: 1, fps: 30, track: [], actions: [], dsf: 2 };
  const still = !!meta.still;
  const wx = o.world ? o.world.x : o.scene ? o.scene.region.x : 0, wy = o.world ? o.world.y : o.scene ? o.scene.region.y : 0;
  const pw = o.w || 1920, scale = pw / 1920, ph = 1080 * scale;
  const chrome = o.chrome || 'card';
  const barH = chrome === 'browser' ? 34 * scale : 0;
  const e = el('div', { cls: `plate ${chrome}`, style: `left:${o.x || 0}px;top:${(o.y || 0) - barH}px;width:${pw}px;height:${ph + barH}px;` + (o.zIndex != null ? `z-index:${o.zIndex};` : '') }, o.parent);
  if (chrome === 'browser') el('div', { cls: 'plate-bar', html: '<i></i><i></i><i></i>', style: `height:${barH}px` }, e);
  if (o.tape !== false && chrome !== 'none') { el('i', { cls: 'tape plate-tape l' }, e); el('i', { cls: 'tape plate-tape r' }, e); }
  const vp = el('div', { cls: 'plate-vp', style: `top:${barH}px;width:${pw}px;height:${ph}px` }, e);
  const inner = el('div', { cls: 'plate-inner', style: `width:1920px;height:1080px;transform-origin:0 0` }, vp);
  const img = el('img', { cls: 'plate-img', attrs: { decoding: 'sync', alt: '' } }, inner);
  const overlay = el('div', { cls: 'plate-overlay' }, inner);
  const mapPts = typeof o.map === 'function' ? null : (o.map || globalMap(shot));
  const ctOf = t => (typeof o.map === 'function' ? o.map(t) : pwl(t, mapPts));
  const frameOf = t => clamp(Math.round(ctOf(t) * (meta.fps || 30)), 0, (meta.frames || 1) - 1);
  const track = meta.track || [];
  let stillVariant = 'still';
  // inner camera (crop inside the frame): keys of {cx, cy, z} in plate px; default whole plate
  const innerAt = t => (o.inner ? keyframes(t, o.inner) : null);
  const innerXf = t => { const c = innerAt(t); if (!c) return { s: scale, tx: 0, ty: 0 }; const s = scale * c.z; return { s, tx: pw / 2 - c.cx * s, ty: ph / 2 - c.cy * s }; };
  function sample(ct, name) {
    if (!track.length) return (meta.rects || {})[name] || null;
    let lo = 0, hi = track.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (track[m].ct <= ct + 1e-6) lo = m; else hi = m - 1; }
    const a = track[lo], b = track[Math.min(track.length - 1, lo + 1)];
    const ra = a.rects[name], rb = b.rects[name];
    if (ra && rb && b.ct > a.ct) { const k = clamp((ct - a.ct) / (b.ct - a.ct)); return { x: lerp(ra.x, rb.x, k), y: lerp(ra.y, rb.y, k), w: lerp(ra.w, rb.w, k), h: lerp(ra.h, rb.h, k) }; }
    return ra || null;
  }
  /** nearest sample (in ct) where the rect exists: for framings of things that appear later */
  function sampleNear(ct, name) {
    const r = sample(ct, name); if (r || !track.length) return r;
    let best = null, bd = 1e9; for (const s of track) if (s.rects[name] && Math.abs(s.ct - ct) < bd) { bd = Math.abs(s.ct - ct); best = s.rects[name]; }
    return best;
  }
  const toParent = (px, py, t) => { const f = innerXf(t); return { x: (o.x || 0) + f.tx + px * f.s, y: (o.y || 0) + f.ty + py * f.s }; };
  const api = {
    el: e, img, overlay, inner, meta, shot, data, scale, x: o.x || 0, y: o.y || 0, w: pw, h: ph, world: { x: wx, y: wy },
    map: mapPts, ct: ctOf, frame: null, still,
    setStill(v) { stillVariant = v === 'nostk' ? 'still_nostk' : 'still'; },
    src(t) { return still ? `clips/${shot}/${stillVariant}.png` : `clips/${shot}/f${String(frameOf(t)).padStart(5, '0')}.jpg`; },
    render(t) {
      const s = api.src(t);
      if (img.__src !== s) { img.src = s; img.__src = s; _pending.add(img); }
      const f = innerXf(t);
      inner.style.transform = `translate(${f.tx}px,${f.ty}px) scale(${f.s})`;
    },
    rect(name, t, near = false) { const ct = ctOf(t); const r = near ? sampleNear(ct, name) : sample(ct, name); if (!r) return null; const a = toParent(r.x, r.y, t), f = innerXf(t); return { x: a.x, y: a.y, w: r.w * f.s, h: r.h * f.s }; },
    worldRect(name, t, near) { const r = api.rect(name, t, near); return r && { x: r.x + wx, y: r.y + wy, w: r.w, h: r.h }; },
    screenRect(name, t, near) { const r = api.worldRect(name, t, near); return r && CAM.rectToScreen(r); },
    point(name, t, ax = .5, ay = .5) { const r = api.worldRect(name, t, true); return r && { x: r.x + r.w * ax, y: r.y + r.h * ay }; },
    toWorld(px, py, t = 0) { const p = toParent(px, py, t); return { x: p.x + wx, y: p.y + wy }; },
    toParent,
    /** camera that fits named rects (or a STAGE_FRAMINGS name) at video time t */
    frame(what, t, opt = {}) {
      const fr = typeof what === 'string' && STAGE_FRAMINGS[what] ? STAGE_FRAMINGS[what] : null;
      if ((fr && fr.all) || what === 'all') return frameRect({ x: wx + api.x, y: wy + api.y - barH, w: pw, h: ph + barH }, { z: opt.z ?? (fr ? fr.z : 1), ...opt });
      const names = fr ? fr.rects : Array.isArray(what) ? what : [what];
      const rs = names.map(n => (typeof n === 'string' ? api.worldRect(n, t, true) : n));
      const u = unionRect(rs) || { x: wx + api.x, y: wy + api.y, w: pw, h: ph };
      return frameRect(u, { pad: opt.pad ?? (fr && fr.pad) ?? 50, zMax: opt.zMax ?? (fr && fr.zMax) ?? 2.6, ...opt });
    },
    events(type, ct0 = -1, ct1 = 1e9) { return ((data.actions && data.actions.events) || []).filter(e2 => (!type || e2.type === type) && e2.ct >= ct0 && e2.ct <= ct1); },
    markers(ct0 = -1, ct1 = 1e9) { return ((data.actions && data.actions.markers) || []).filter(m => m.ct >= ct0 && m.ct <= ct1); },
    /** clicks in this clip with the video time they play at (first time the map reaches their ct) */
    clickTimes() { return (meta.actions || []).filter(a => a.do === 'click').map(a => ({ ...a, vt: mapPts ? pwlInverse(a.ct, mapPts) : null })); },
    lift(name, t0, opt = {}) {
      const r0 = sampleNear(pwl(t0, mapPts || [[0, 0]]), name); if (!r0) return { render() {} };
      const padp = opt.pad ?? 6, rr = { x: r0.x - padp, y: r0.y - padp, w: r0.w + 2 * padp, h: r0.h + 2 * padp };
      const d = el('div', { cls: 'plate-lift', style: `left:${rr.x}px;top:${rr.y}px;width:${rr.w}px;height:${rr.h}px` }, overlay);
      return {
        el: d, render(t) {
          const k = P(t, t0, opt.dur ?? .5);
          if (k <= 0 || k >= 1) { d.style.display = 'none'; return; }
          d.style.display = '';
          d.style.backgroundImage = `url(${img.__src})`;
          d.style.backgroundSize = '1920px 1080px'; d.style.backgroundPosition = `${-rr.x}px ${-rr.y}px`;
          const s = 1 + ((opt.scale ?? 1.12) - 1) * (1 - spring(k, 6, 1.4));
          d.style.transform = `scale(${s})`;
          d.style.boxShadow = `0 ${8 * (s - 1) * 10}px ${14 * (s - 1) * 10}px -6px rgba(20,23,31,.35)`;
        },
      };
    },
    caret(t) {
      const ct = ctOf(t), keys = api.events('key');
      if (!keys.length) return null;
      let k = null; for (const e2 of keys) if (e2.ct <= ct + 1e-6) k = e2; else break;
      if (!k || ct - k.ct > .6 || !k.caret) return null;
      const a = toParent(k.caret.x, k.caret.y, t), f = innerXf(t);
      return { x: a.x + wx, y: a.y + wy, w: 2.5 * f.s, h: k.caret.h * f.s, age: ct - k.ct };
    },
  };
  _plates.push(api);
  return api;
}
const _pending = new Set();
/** settle(): resolves when every plate image set this frame is decoded (render.js awaits it before a screenshot). */
async function settle() {
  const list = [..._pending]; _pending.clear();
  await Promise.all(list.map(i => (i.complete && i.naturalWidth ? Promise.resolve() : i.decode().catch(() => {}))));
  await document.fonts.ready;
}
const _prefetch = new Map();
/** prefetch(t): start loading the plate frames needed at t (render.js calls it for the next frame). */
function prefetch(t) {
  for (const p of _plates) {
    const s = p.src(t); if (_prefetch.has(s)) continue;
    const im = new Image(); im.decoding = 'async'; im.src = s; _prefetch.set(s, im.decode().catch(() => {}));
    if (_prefetch.size > 24) _prefetch.delete(_prefetch.keys().next().value);
  }
}

/* ============================================================== HUD (screen space) */
/** Immediate-mode screen-space pools, reset every frame by main.js. */
const HUD = {
  root: null, pools: {}, used: {},
  _get(kind, make) {
    const pool = HUD.pools[kind] || (HUD.pools[kind] = []), i = HUD.used[kind] = (HUD.used[kind] || 0) + 1;
    if (pool.length < i) pool.push(make());
    const e = pool[i - 1]; e.style.display = ''; return e;
  },
  _begin() { HUD.used = {}; },
  _end() { for (const k in HUD.pools) HUD.pools[k].forEach((e, i) => { if (i >= (HUD.used[k] || 0) && e.style.display !== 'none') e.style.display = 'none'; }); },
  /** ripple(x, y, t, t0, color='blue'): click ripple: a 3px ring 0 -> 46 px over 0.35 s, fading, plus three boiled ticks. */
  ripple(x, y, t, t0, color = 'blue') {
    const k = P(t, t0, .35); if (k <= 0 || k >= 1) return;
    const c = markerColor(color), e = HUD._get('ripple', () => { const d = el('div', { cls: 'hud-ripple', html: '<svg width="140" height="140" viewBox="-70 -70 140 140"><circle r="10" fill="none" stroke-width="3"/><path fill="none" stroke-width="3.5" stroke-linecap="round"/></svg>' }, HUD.root); return d; });
    const circ = e.querySelector('circle'), ticks = e.querySelector('path');
    const r = 46 * easeOutCubic(k);
    circ.setAttribute('r', r.toFixed(2)); circ.setAttribute('stroke', c); circ.style.opacity = 1 - k;
    const r1 = 30 + 26 * easeOutCubic(k), r2 = r1 + 12, st = boilStep(t);
    let d = ''; for (const a of [-2.4, -1.6, -.8]) { const j = (rand(st, a * 10 | 0) - .5) * .08; d += `M${(Math.cos(a + j) * r1).toFixed(1)} ${(Math.sin(a + j) * r1).toFixed(1)} L${(Math.cos(a) * r2).toFixed(1)} ${(Math.sin(a) * r2).toFixed(1)} `; }
    ticks.setAttribute('d', d); ticks.setAttribute('stroke', c); ticks.style.opacity = (1 - k) * Math.min(1, k * 4);
    e.style.transform = `translate(${x - 70}px,${y - 70}px)`;
  },
  /** spot(rect, amount, {radius=14, dim=.2}): spotlight: everything outside the screen rect dims. */
  spot(r, amount = 1, o = {}) {
    if (!r || amount <= .002) return;
    const e = HUD._get('spot', () => el('div', { cls: 'hud-spot' }, HUD.root));
    const pad = o.pad ?? 10;
    css(e, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + 2 * pad}px`, height: `${r.h + 2 * pad}px`, borderRadius: `${o.radius ?? 14}px`,
      boxShadow: `0 0 0 4000px rgba(20,23,31,${((o.dim ?? .22) * amount).toFixed(3)}), 0 0 ${24 * amount}px ${6 * amount}px rgba(20,23,31,${(.12 * amount).toFixed(3)})` });
  },
  /** caret(rect, t, age): small blue caret bar at the typing position (screen rect). */
  caret(r, t) {
    if (!r) return;
    const e = HUD._get('caret', () => el('div', { cls: 'hud-caret' }, HUD.root));
    css(e, { left: `${r.x - 1}px`, top: `${r.y}px`, height: `${Math.max(8, r.h)}px`, opacity: (.65 + .35 * Math.cos(t * 12)).toFixed(3) });
  },
};

/* ============================================================== CURSOR */
const CURSOR_D = 'M2 2 L2 36 L10.5 28.5 L16.5 42 L23.5 39 L17.5 25.8 L29 25.4 Z';
const CURSOR_VARS = boilVariants(CURSOR_D, .7, 11);
/**
 * The film's one drawn cursor (screen space). Scenes add waypoints in build() with Cursor.plan(list):
 *   {t, enter:'right'|'left'|'top'|'bottom', y?|x?}     appear at that frame edge at t
 *   {t, at:'R.suggestDue', plate, ax, ay}               be on the target at t (hover)
 *   {t, click:'R.suggestDue', plate, color, dwell=.3}   arrive by t-dwell, press at t (0.88 for 0.08 s),
 *                                                       release + ripple at t+0.1
 *   {t, at:{x,y}} / {t, click:{x,y}}                    world point targets (MG elements)
 *   {t, exit:'right'}                                   leave through that edge by t
 * Targets are re-projected every frame, so the cursor stays locked to the UI while the camera moves.
 * Travel: curved arc, easeInOutCubic, ~1200 screen px/s (0.35-0.9 s), 4 px overshoot and settle.
 */
const Cursor = {
  pts: [], el: null,
  plan(list) { for (const p of list) Cursor.pts.push({ dwell: .3, ...p }); Cursor.pts.sort((a, b) => a.t - b.t); },
  _target(p, t) {
    if (p.enter || p.exit) return null;
    const tg = p.click ?? p.at;
    if (typeof tg === 'string') { const r = p.plate.screenRect(tg, t, true); return r ? { x: r.x + r.w * (p.ax ?? .5), y: r.y + r.h * (p.ay ?? .55) } : null; }
    return CAM.toScreen(tg.x, tg.y);
  },
  _edge(p, near) {
    const e = p.enter || p.exit, n = near || { x: W / 2, y: H / 2 };
    return e === 'left' ? { x: -60, y: p.y ?? n.y } : e === 'right' ? { x: W + 60, y: p.y ?? n.y } : e === 'top' ? { x: p.x ?? n.x, y: -60 } : { x: p.x ?? n.x, y: H + 60 };
  },
  /** -> {x, y, s, visible} at t */
  state(t) {
    const pts = Cursor.pts; if (!pts.length) return null;
    let i = -1; for (let k = 0; k < pts.length; k++) if (pts[k].t <= t + 1e-9) i = k;
    const next = pts[i + 1];
    const cur = pts[i];
    if (!cur || cur.exit) return null;            // before the first entrance, or gone through an exit
    // arrival time of the next waypoint
    const arrive = next ? (next.click != null ? next.t - next.dwell : next.t) : Infinity;
    const posOf = (p, tt, near) => (p.enter || p.exit ? Cursor._edge(p, near) : Cursor._target(p, tt));
    const nextPos = next ? posOf(next, t) : null;
    const curPos = cur ? posOf(cur, t, nextPos) : null;
    let x, y, s = 1;
    if (next && curPos && nextPos) {
      const dist = Math.hypot(nextPos.x - curPos.x, nextPos.y - curPos.y);
      const dur = clamp(dist / 1200, .35, .9);
      const start = Math.max(cur.click != null ? cur.t + .15 : cur.t, arrive - dur);
      const k = P(t, start, Math.max(.05, arrive - start));
      if (k <= 0) { x = curPos.x; y = curPos.y; }
      else {
        const e = easeInOutCubic(k), dx = nextPos.x - curPos.x, dy = nextPos.y - curPos.y, L = Math.hypot(dx, dy) || 1;
        const bend = .12 * L * (rand(Math.round(cur.t * 10), 3) > .5 ? 1 : -1);
        const mx = (curPos.x + nextPos.x) / 2 - dy / L * bend, my = (curPos.y + nextPos.y) / 2 + dx / L * bend;
        x = (1 - e) * (1 - e) * curPos.x + 2 * (1 - e) * e * mx + e * e * nextPos.x;
        y = (1 - e) * (1 - e) * curPos.y + 2 * (1 - e) * e * my + e * e * nextPos.y;
        // 4 px overshoot along the travel direction, settling right after arrival
        const os = 4 * Math.sin(P(t, arrive - .12, .3) * Math.PI) * (k > .8 ? 1 : 0);
        x += dx / L * os; y += dy / L * os;
      }
    } else if (curPos) { x = curPos.x; y = curPos.y; }
    else return null;
    // press / hover
    const press = p => (p && p.click != null ? (t >= p.t && t < p.t + .1 ? lerp(1, .88, easeOutCubic(P(t, p.t, .05))) : t >= p.t + .1 && t < p.t + .25 ? lerp(.88, 1, easeOutBack(P(t, p.t + .1, .15))) : null) : null);
    const pr = press(cur) ?? press(next);
    if (pr != null) s = pr;
    else if (cur && !cur.enter && !cur.exit && (!next || t < arrive - .5)) s = .96;
    return { x, y, s, visible: true };
  },
  _render(t) {
    const st = Cursor.state(t);
    if (!st) { Cursor.el.style.display = 'none'; }
    else {
      Cursor.el.style.display = '';
      Cursor.el.style.transform = `translate(${st.x.toFixed(2)}px,${st.y.toFixed(2)}px) scale(${st.s.toFixed(4)})`;
      Cursor.path.setAttribute('d', CURSOR_VARS[boilStep(t)]);
    }
    for (const p of Cursor.pts) if (p.click != null && t >= p.t + .1 && t < p.t + .5) {
      const pos = Cursor._target(p, t); if (pos) HUD.ripple(pos.x, pos.y, t, p.t + .1, p.color || 'blue');
    }
  },
};

/* ============================================================== CAPTIONS */
const Captions = {
  list: [], emph: [], els: [],
  /** emphasize(captionText or substring, word, color='blue'): boiled marker underline under `word` once written. */
  emphasize(captionMatch, word, color = 'blue') { Captions.emph.push({ captionMatch, word, color }); },
  _build(root) {
    for (const c of ((G.CUES && G.CUES.captions) || [])) {
      const strip = el('div', { cls: 'cap-strip' }, root);
      el('i', { cls: 'cap-tape' }, strip);
      const txt = el('span', { cls: 'cap-text', text: c.text }, strip);
      const svg = svgLayer(strip, 'z-index:2');
      Captions.els.push({ c, strip, txt, svg, unders: [], built: false });
    }
  },
  _layout(item) {
    // emphasis underlines need text metrics: measured once, the first time the strip is shown
    item.built = true;
    for (const em of Captions.emph) {
      if (!item.c.text.includes(em.captionMatch)) continue;
      const i = item.c.text.indexOf(em.word); if (i < 0) continue;
      const range = document.createRange(), node = item.txt.firstChild;
      range.setStart(node, i); range.setEnd(node, i + em.word.length);
      const r = range.getBoundingClientRect(), sr = item.strip.getBoundingClientRect();
      const x1 = r.left - sr.left, x2 = r.right - sr.left, y = r.bottom - sr.top - 2;
      const m = markerUnderline(item.strip, x1, x2, y, { color: em.color, width: 4.5, svg: item.svg, wave: 3 });
      item.unders.push({ m, at: (i + em.word.length) / item.c.text.length });
    }
  },
  _render(t) {
    for (const it of Captions.els) {
      const { c, strip } = it;
      if (t < c.start - .05 || t > c.end + .35) { if (strip.style.display !== 'none') strip.style.display = 'none'; continue; }
      strip.style.display = '';
      if (!it.built) Captions._layout(it);
      const wdur = clamp(c.text.length / 45, .4, 1.4);
      const kw = P(t, c.start, wdur), ko = P(t, c.end, .3);
      it.txt.style.clipPath = kw >= 1 ? 'none' : `inset(-30% ${((1 - kw) * 100).toFixed(2)}% -30% -2%)`;
      const ks = Math.min(1, .12 + kw * 1.5);              // the strip unrolls just ahead of the writing
      strip.style.clipPath = ks >= 1 ? 'none' : `inset(-30px ${((1 - ks) * 100).toFixed(2)}% -30px -60px)`;
      it.txt.style.fontVariationSettings = `"INFM" ${INFM[boilStep(t)]}`;
      const rise = (1 - easeOutCubic(P(t, c.start, .45))) * 6;
      strip.style.transform = `translate(0, ${rise.toFixed(2)}px) rotate(-.6deg)`;
      strip.style.opacity = (Math.min(1, P(t, c.start - .05, .18)) * (1 - easeInCubic(ko))).toFixed(3);
      for (const u of it.unders) { u.m.t0 = c.start + wdur * u.at + .05; u.m.render(t); }
    }
  },
};

/* ----------------------------------------------------------- scene registry */
const SCENES = [];
/**
 * Scene({id, start, end, region:'STAGE'|{x,y,w,h}, camera:[[t, cam|fn(t)->cam, ease?], ...],
 *        shakes:[[t0, amp, dur]], punches:[[t0, amount, dur]], margin=500, z, build(root, S), render(t, lt, S)})
 * root is a div at the region's world origin; build() puts DOM in it once. render() runs every frame
 * the region is on camera (or always:true), with the camera of this frame already in CAM.cur.
 * S.cues = this scene's entry in cues.json (keys, captions, capture_maps).
 */
function Scene(def) {
  const s = Object.assign({ camera: [], shakes: [], punches: [], margin: 500, always: false, build: () => {}, render: () => {} }, def);
  s.region = typeof s.region === 'string' ? REGIONS[s.region] : (s.region || REGIONS.ALL);
  s.z = s.z ?? SCENES.length + 10;
  SCENES.push(s); return s;
}
/** Fixture({id, region, z, build, render}): like a Scene but shared (e.g. the STAGE plate used by S03-S11). */
const Fixture = def => Scene(Object.assign({ fixture: true, z: 1 }, def));

/* ------------------------------------------------------------------ export */
Object.assign(G, {
  W, H, FPS, COL, HAND, UI, BOARD, REGIONS,
  clamp, lerp, invLerp, remap, P, E, pulse, win, keyframes, mixAny, pwl, pwlInverse, easeOf, EASE,
  linear, easeOutExpo, easeInExpo, easeInOutExpo, easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine, easeOutQuart, easeOutBack, spring,
  rand, randn, wiggle, hashStr, hexToRgb, rgbToHex, mixColor, rgba, markerColor,
  $, $$, el, h, svgEl, svgLayer, css, setHTML, setText, esc, xf, vis, show, pop, countUp,
  BOIL_FPS, boilStep, jitterPath, boilVariants, INFM, pathLength, strokeDur, smoothD, circlePathD,
  markerPath, strokeSeq, markerCircle, markerUnderline, markerArrow, markerCross, markerTick, markerSlash, markerScribble, handText,
  sticky, tag, whiteboard, eraser, STICKY_BG, wordRect,
  CAM, frameRect, unionRect, regionCam,
  clipData, globalMap, screenFrame, STAGE_FRAMINGS, settle, prefetch, _plates,
  HUD, Cursor, Captions, Scene, Fixture, SCENES,
});
})(window);
