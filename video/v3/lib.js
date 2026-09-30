/* =====================================================================
 * Quorum v3 motion framework: lib.js
 * Classic script (no modules). Everything below is exposed as globals.
 * RULE: every visual must be a PURE FUNCTION OF t. No Date.now(), no CSS
 * transitions/animations, no rAF. Write every animated property every frame.
 * Full API docs: FRAMEWORK.md
 * ===================================================================== */
(function (G) {
'use strict';

const W = 1920, H = 1080, FPS = 30;
const COL = {
  bg: '#0A0E16', amber: '#F5A524', green: '#22C55E', red: '#EF4444', indigo: '#7C8CFF',
  indigoLt: '#9DA9FF', text: '#E8ECF4', sub: '#9AA4C0', muted: '#5B6478', grey: '#8A93A8', white: '#FFFFFF',
  card: 'rgba(20,26,40,.92)', border: 'rgba(124,140,255,.28)', whatsapp: '#25D366'
};

/* ---------------------------------------------------------------- math */
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const invLerp = (a, b, x) => clamp((x - a) / (b - a));
const remap = (x, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, x));
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** P(t,a,d): linear clamped progress 0..1 of the window [a, a+d]. */
const P = (t, a, d = 0.6) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));

/* -------------------------------------------------------------- easing */
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
/** spring(x): damped spring 0 -> 1 with overshoot. x is progress 0..1. */
const spring = (x, damping = 6.5, freq = 2.1) => x <= 0 ? 0 : x >= 1 ? 1 :
  1 - Math.exp(-damping * x) * Math.cos(freq * 2 * Math.PI * x) * (1 - x * x * x);
/** E(t,a,d,ease): eased progress. Default ease = easeOutExpo. */
const E = (t, a, d = 0.6, ease = easeOutExpo) => ease(P(t, a, d));
/** pulse(t,t0,w): gaussian bump, 1 at t0, width w seconds. */
const pulse = (t, t0, w = 0.15) => Math.exp(-Math.pow((t - t0) / w, 2));
/** win(t,a,b,fi,fo): 0 -> 1 at a (over fi), 1 -> 0 ending at b (over fo). */
const win = (t, a, b, fi = .5, fo = .5) => Math.min(easeOutCubic(P(t, a, fi)), 1 - easeInCubic(P(t, b - fo, fo)));
/** blink(t, rate): square blink 0/1, deterministic. */
const blink = (t, rate = 2) => (Math.floor(t * rate * 2) % 2 === 0 ? 1 : 0);
/** keyframes(t, [[t0,v0],[t1,v1],...], ease): piecewise interpolation of numbers or arrays. */
function keyframes(t, keys, ease = easeInOutCubic) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [ta, va] = keys[i - 1], [tb, vb] = keys[i]; const k = ease((t - ta) / (tb - ta));
      return mixAny(va, vb, k);
    }
  }
  return keys[keys.length - 1][1];
}
function mixAny(a, b, k) {
  if (typeof a === 'number') return lerp(a, b, k);
  if (Array.isArray(a)) return a.map((v, i) => mixAny(v, b[i], k));
  if (a && typeof a === 'object') { const o = {}; for (const key in a) o[key] = key in b ? mixAny(a[key], b[key], k) : a[key]; for (const key in b) if (!(key in a)) o[key] = b[key]; return o; }
  return k < .5 ? a : b;
}

/* -------------------------------------------------------- deterministic rand */
/** rand(i, salt): hash -> [0,1). Same inputs, same output, always. */
function rand(i, salt = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(salt | 0, 668265263) + 0x9E3779B9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** randn(i, salt): gaussian (mean 0, sd 1). */
function randn(i, salt = 0) { const u = Math.max(1e-9, rand(i, salt)), v = rand(i, salt + 7919); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
/** seeded(seed): returns a generator () => [0,1) (mulberry32). Create it in build(), not per frame. */
function seeded(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** wiggle(t, seed, freq, amp): smooth deterministic noise in [-amp, amp]. */
function wiggle(t, seed = 0, freq = 1, amp = 1) {
  const a = rand(seed, 1) * 6.283, b = rand(seed, 2) * 6.283;
  return amp * (0.6 * Math.sin(t * freq * 1.0 + a) + 0.4 * Math.sin(t * freq * 2.31 + b));
}

/* ---------------------------------------------------------------- colour */
function hexToRgb(c) {
  if (Array.isArray(c)) return c;
  if (c[0] === '#') { let s = c.slice(1); if (s.length === 3) s = s.split('').map(x => x + x).join(''); const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
/** mixColor(a, b, k): hex blend. */
const mixColor = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]); };
/** rgba(hex, alpha) -> css string */
const rgba = (c, a) => { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; };

/* ------------------------------------------------------------------- DOM */
const $ = (sel, root = document) => (typeof sel === 'string' ? root.querySelector(sel) : sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
/** el(tag, {cls, style, html, text, attrs}, parent): create an element. style may be a string or object. */
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
/** h(html, parent): build DOM from an HTML string, returns the first element. */
function h(html, parent = null) { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild; if (parent) parent.appendChild(e); return e; }
const css = (e, obj) => (Object.assign(e.style, obj), e);
/** setHTML / setText: only touches the DOM when the value changes (fast, still deterministic). */
function setHTML(e, s) { if (e.__html !== s) { e.innerHTML = s; e.__html = s; e.__text = undefined; } }
function setText(e, s) { if (e.__text !== s) { e.textContent = s; e.__text = s; e.__html = undefined; } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** xf(el, {x, y, s, sx, sy, r, rx, ry, o, blur, persp}): set transform (+opacity) in one call. */
function xf(e, o = {}) {
  const p = [];
  if (o.persp) p.push(`perspective(${o.persp}px)`);
  if (o.x || o.y) p.push(`translate(${o.x || 0}px,${o.y || 0}px)`);
  if (o.rx) p.push(`rotateX(${o.rx}deg)`);
  if (o.ry) p.push(`rotateY(${o.ry}deg)`);
  if (o.r) p.push(`rotate(${o.r}deg)`);
  if (o.s != null && o.s !== 1) p.push(`scale(${o.s})`);
  if (o.sx != null || o.sy != null) p.push(`scale(${o.sx ?? 1},${o.sy ?? 1})`);
  e.style.transform = p.join(' ');
  if (o.o != null) e.style.opacity = clamp(o.o);
  if (o.blur != null) e.style.filter = o.blur > 0.05 ? `blur(${o.blur}px)` : 'none';
  return e;
}

/* ------------------------------------------------------------------ text */
/**
 * show(el, t, a, d=.6, {dy=24, dx=0, scale=1, ease=easeOutExpo, blur=0, out=null, outD=.4, outDy=0})
 * Entrance at time a over d seconds (opacity 0->1, slides from dy/dx, scales from `scale`).
 * Optional exit: `out` = time the exit starts. Returns the visible amount 0..1.
 */
function show(e, t, a, d = .6, o = {}) {
  const { dy = 24, dx = 0, scale = 1, ease = easeOutExpo, blur = 0, out = null, outD = .4, outDy = 0 } = o;
  const k = ease(P(t, a, d)); const kc = clamp(k);
  let ko = 0; if (out != null) ko = easeInOutCubic(P(t, out, outD));
  e.style.opacity = clamp(Math.min(kc * 1.15, 1) * (1 - ko));
  const s = lerp(scale, 1, k);
  e.style.transform = `translate(${(1 - k) * dx}px,${(1 - k) * dy - ko * outDy}px)` + (s !== 1 ? ` scale(${s})` : '');
  if (blur) e.style.filter = (1 - kc) * blur > .05 ? `blur(${(1 - kc) * blur}px)` : 'none';
  return kc * (1 - ko);
}
/** pop(el, t, a, d=.7): spring scale-in pop (0.6 -> 1 with overshoot). */
function pop(e, t, a, d = .7, from = .6) {
  const k = spring(P(t, a, d)); e.style.opacity = clamp(P(t, a, d * .3));
  e.style.transform = `scale(${lerp(from, 1, k)})`; return clamp(k);
}
/** hideAfter(el, t, a, d=.4): multiplies current opacity by an exit fade. Call AFTER show(). */
function hideAfter(e, t, a, d = .4) {
  const k = 1 - easeInOutCubic(P(t, a, d)); const cur = e.style.opacity === '' ? 1 : +e.style.opacity;
  e.style.opacity = cur * k; return k;
}
/**
 * typeText(el, str, t, start, cps=28, {cursor=true, cursorColor, hold=1.2, color})
 * Types str from `start` at cps chars/sec. Cursor blinks while typing and for `hold` s after.
 * Returns progress 0..1. Content is plain text (escaped).
 */
function typeText(e, str, t, start, cps = 28, o = {}) {
  const { cursor = true, cursorColor = COL.indigo, hold = 1.2 } = o;
  const n = Math.floor(clamp((t - start) * cps, 0, str.length));
  const end = start + str.length / cps;
  const cur = cursor && t >= start - .3 && t < end + hold && (t < end || blink(t, 1.6));
  setHTML(e, esc(str.slice(0, n)) + (cur ? `<span style="color:${cursorColor};font-weight:400;margin-left:1px">▍</span>` : ''));
  return str.length ? n / str.length : 1;
}
/** staggerIn(els, t, start, gap=.08, showOpts): show() each element with a stagger. Returns array of k. */
function staggerIn(els, t, start, gap = .08, o = {}) { return Array.from(els).map((e, i) => show(e, t, start + i * gap, o.d ?? .6, o)); }
/** splitWords(el): wraps each word of el's text into inline-block spans; returns the spans. (build() only) */
function splitWords(e) {
  const words = e.innerHTML.split(/(\s+)/); e.innerHTML = '';
  const out = [];
  for (const w of words) { if (/^\s+$/.test(w)) { e.appendChild(document.createTextNode(' ')); continue; } if (!w) continue; const s = el('span', { html: w, style: 'display:inline-block' }, e); out.push(s); }
  return out;
}
/** countUp(t, a, d, from, to, ease): number tween. */
const countUp = (t, a, d, from, to, ease = easeOutCubic) => lerp(from, to, ease(P(t, a, d)));
/** fmtTime(sec): "2:58:41" */
const fmtTime = s => { s = Math.floor(s); const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60; return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };

/* ------------------------------------------------------------ components */
const PLANE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align:-3px"><path fill="currentColor" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
const PILL = {
  offline: { c: COL.amber, html: `${PLANE_SVG}&nbsp;Airplane mode · 0 B/s` },
  online: { c: COL.green, html: `<span class="dot"></span>Online` },
  syncing: { c: COL.green, html: `<span class="dot"></span>Online · syncing` },
  resolved: { c: COL.green, html: `✓&nbsp;Resolved` },
};
/**
 * makeLaptop({parent, title, status='online', x, y, w=820, h=560, accent})
 * macOS-style window card. Returns {el, bar, body, titleEl, pill, setStatus(status, popK=0, custom)}
 * status: 'offline' | 'online' | 'syncing' | 'resolved' | 'custom' (custom = {color, html}).
 */
function makeLaptop(o = {}) {
  const { parent, title = "Tanishk's laptop · on a shoot", status = 'online', x = 0, y = 0, w = 820, h = 560 } = o;
  const e = el('div', { cls: 'card lap', style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px` }, parent);
  const bar = el('div', { cls: 'lap-bar' }, e);
  el('span', { cls: 'tl', style: 'background:#FF5F57' }, bar); el('span', { cls: 'tl', style: 'background:#FEBC2E' }, bar); el('span', { cls: 'tl', style: 'background:#28C840' }, bar);
  const titleEl = el('div', { cls: 'lap-title', text: title }, bar);
  const pill = el('div', { cls: 'lap-pill' }, bar);
  const body = el('div', { cls: 'lap-body' }, e);
  const api = {
    el: e, bar, body, titleEl, pill, status: null,
    setStatus(s, popK = 0, custom = null) {
      const spec = s === 'custom' ? { c: custom.color, html: custom.html } : PILL[s];
      const key = s + (custom ? custom.html : '');
      if (api.status !== key) {
        api.status = key; pill.innerHTML = spec.html;
        pill.style.color = spec.c; pill.style.background = rgba(spec.c, .13); pill.style.borderColor = rgba(spec.c, .5);
      }
      pill.style.transform = `scale(${1 + .14 * popK})`;
      pill.style.boxShadow = `0 0 ${24 * popK}px ${rgba(spec.c, .6 * popK)}`;
    },
    setTitle(s) { setText(titleEl, s); }
  };
  api.setStatus(status);
  return api;
}
/**
 * netGraph({parent, x, y, w=520, h=110, label='network'}) -> {el, render(t, {offAt, onAt})}
 * Scrolling network throughput line. Flatlines to 0 (amber, "0 B/s") between offAt and onAt,
 * springs back to life (green) after onAt. Pass offAt=Infinity for always-online.
 */
function netGraph(o = {}) {
  const { parent, x = 0, y = 0, w = 520, h = 110, label = 'network', pos = 'absolute' } = o;
  const e = el('div', { cls: 'netg', style: `position:${pos};left:${x}px;top:${y}px;width:${w}px;height:${h}px` }, parent);
  el('div', { cls: 'netg-lbl', text: label }, e);
  const bps = el('div', { cls: 'netg-bps mono' }, e);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
  const area = document.createElementNS(NS, 'polygon'); const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('fill', 'none'); line.setAttribute('stroke-width', '3'); line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(area); svg.appendChild(line); e.appendChild(svg);
  const N = 90, dt = .07;
  function level(tt, offAt, onAt) {
    let v = .52 + .26 * Math.sin(tt * 3.1) + .14 * Math.sin(tt * 7.7 + 1) + .07 * Math.sin(tt * 17.3 + 2);
    let m = 1;
    if (tt >= offAt) m = 1 - easeOutCubic(P(tt, offAt, .5));
    if (tt >= onAt) m = spring(P(tt, onAt, 1.0));
    return clamp(v * m, 0, 1.05);
  }
  return {
    el: e,
    render(t, { offAt = Infinity, onAt = Infinity } = {}) {
      const off = t >= offAt && t < onAt;
      const c = off ? COL.amber : COL.green;
      let pts = '';
      for (let i = 0; i <= N; i++) { const tt = t - (N - i) * dt; const v = level(tt, offAt, onAt); pts += `${(i / N * w).toFixed(1)},${(h - 10 - v * (h - 38)).toFixed(1)} `; }
      line.setAttribute('points', pts); line.setAttribute('stroke', c);
      area.setAttribute('points', pts + `${w},${h} 0,${h}`); area.setAttribute('fill', rgba(c, .10));
      svg.style.filter = `drop-shadow(0 0 6px ${rgba(c, .7)})`;
      const v = level(t, offAt, onAt);
      setHTML(bps, off ? `<span style="color:${COL.amber}">0 B/s</span>` : `<span style="color:${COL.green}">${(0.4 + v * 2.2).toFixed(1)} MB/s</span>`);
      return off;
    }
  };
}
/** chip(html, color, parent, style): small rounded tag. */
function chip(html, color = COL.indigo, parent = null, style = '') {
  return el('span', { cls: 'chip', html, style: `color:${color};background:${rgba(color, .12)};border-color:${rgba(color, .45)};${style}` }, parent);
}

/* --------------------------------------------------------------- captions */
const _cap = { list: [] };
/**
 * caption(text, t, start, end, {html=false}): shows a bottom caption (42px semibold, dark backing,
 * y≈958) with 0.45s fade-in and 0.4s fade-out. Call from a scene's render() every frame, or list
 * it in Scene({captions:[[start,end,text], ...]}). The strongest caption of the frame wins.
 */
function caption(text, t, start, end, o = {}) {
  if (t < start || t > end) return 0;
  const a = Math.min(easeOutCubic(P(t, start, .45)), 1 - easeInCubic(P(t, end - .4, .4)));
  if (a > 0) _cap.list.push({ text, a, o, rise: 1 - easeOutExpo(P(t, start, .6)) });
  return a;
}

/* ---------------------------------------------------------- glow sprites */
const _sprites = new Map();
function _q(c) { const [r, g, b] = hexToRgb(c); return [r & ~7, g & ~7, b & ~7]; }
/** glowSprite(color): cached 128px radial halo canvas (for drawImage with 'lighter'). */
function glowSprite(color) {
  const q = _q(color), key = 'g' + q.join(',');
  let s = _sprites.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 128; const c = s.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); const [r, gg, b] = q;
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`); g.addColorStop(.12, `rgba(${r},${gg},${b},.62)`);
  g.addColorStop(.32, `rgba(${r},${gg},${b},.2)`); g.addColorStop(.62, `rgba(${r},${gg},${b},.05)`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); _sprites.set(key, s); return s;
}
/** coreSprite(color): cached 32px bright core (white-hot centre tinted by color). */
function coreSprite(color) {
  const q = _q(color), key = 'c' + q.join(',');
  let s = _sprites.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 32; const c = s.getContext('2d');
  const hot = hexToRgb(mixColor(rgbToHex(q), '#ffffff', .75)); const [r, gg, b] = q;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},1)`); g.addColorStop(.35, `rgba(${r},${gg},${b},.95)`);
  g.addColorStop(.7, `rgba(${r},${gg},${b},.25)`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  c.fillStyle = g; c.fillRect(0, 0, 32, 32); _sprites.set(key, s); return s;
}
/** drawGlow(ctx, x, y, r, color, alpha, core=true): additive glowing dot, halo radius r (px). */
function drawGlow(ctx, x, y, r, color, alpha = 1, core = true) {
  if (alpha <= .003 || r <= 0) return;
  const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(alpha); const s = glowSprite(color); ctx.drawImage(s, x - r, y - r, 2 * r, 2 * r);
  if (core) { const cr = Math.max(1.2, r * .28); ctx.drawImage(coreSprite(color), x - cr, y - cr, 2 * cr, 2 * cr); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = prev;
}
/** glowLine(ctx, x1,y1,x2,y2, color, alpha, width): additive glowing beam. */
function glowLine(ctx, x1, y1, x2, y2, color, alpha = 1, width = 3) {
  if (alpha <= .003) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [wm, am] of [[6, .08], [3, .18], [1.6, .45], [.6, 1]]) {
    ctx.globalAlpha = clamp(alpha * am); ctx.strokeStyle = wm < 1 ? mixColor(color, '#ffffff', .6) : color; ctx.lineWidth = width * wm;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ===================================================================
 * 3D CLOUD ENGINE (immediate mode)
 * Each frame the framework calls cloud._begin(t); each active scene then
 * declares what it wants (camera, key points, effects); finally the
 * framework blends the scenes' settings by crossfade weight and draws.
 * Because nothing persists between frames, state is a pure function of t.
 * =================================================================== */
const FONT = '"Segoe UI Variable Display","Segoe UI",sans-serif';
const cloud = (function () {
  /* ---- ambient point set (built once, deterministic) ---- */
  const TINTS = ['#7C8CFF', '#9DB4FF', '#B49CFF', '#8FD3FF', '#C9D2FF', '#6F7CFF', '#A5B4FC'];
  const clusters = [];
  for (let c = 0; c < 7; c++) {
    const a = c / 7 * 6.283 + rand(c, 11) * .6, r = .45 + rand(c, 12) * .8;
    clusters.push({ x: Math.cos(a) * r, y: (rand(c, 13) - .5) * .45, z: Math.sin(a) * r, s: .16 + rand(c, 14) * .14, tint: TINTS[c] });
  }
  const pts = [];
  const N = 420;
  for (let i = 0; i < N; i++) {
    let x, y, z, tint, cl = -1;
    if (i < 290) { // semantic clusters
      cl = i % 7; const C = clusters[cl];
      x = C.x + randn(i, 1) * C.s; y = C.y + randn(i, 2) * C.s * .85; z = C.z + randn(i, 3) * C.s; tint = C.tint;
    } else { // spiral-arm dust + halo
      const r = .25 + 1.45 * Math.sqrt(rand(i, 4)); const arm = (i % 2) * Math.PI;
      const a = arm + r * 2.4 + randn(i, 5) * .35;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = randn(i, 6) * .09 * (1.6 - r * .5);
      tint = rand(i, 7) < .25 ? '#DDE3FF' : TINTS[i % TINTS.length];
    }
    const star = rand(i, 8) < .06;
    pts.push({ i, x, y, z, cl, tint, size: star ? 1.9 + rand(i, 9) : .55 + rand(i, 10) * .75, ph: rand(i, 15) * 6.283, tw: .6 + rand(i, 16) * 1.6, bright: .55 + rand(i, 17) * .45 });
  }

  /* ---- defaults (per scene param object) ---- */
  const DEF = () => ({
    opacity: .6, ambientAlpha: 1, nebula: 1, keyAlpha: 1, spin: .035, spinOffset: 0, pointScale: 1, dof: .8, fog: 1,
    rect: { x: 0, y: 0, w: W, h: H }, layer: 'back',
    cam: { target: [0, 0, 0], dist: 4.4, yaw: 0, pitch: .38, roll: 0, fov: 46, pos: null, orbit: .02, focus: null },
  });
  const S = { t: 0, cur: null, weight: 1, params: [], keys: new Map(), effects: [], hooks: [], instances: null, proj: null };

  const api = {
    points: pts, clusters, N,
    KEYS: { // shared positions for recurring key points (local cloud coords)
      note18: [-.8, .18, .35], email16: [.75, -.12, -.25],
      matchA: [.2, .25, .5], matchB: [-.35, -.2, -.45], matchC: [.7, .15, .25],
    },
    /* -- internal: called by main.js -- */
    _begin(t) { S.t = t; S.params = []; S.keys = new Map(); S.effects = []; S.hooks = []; S.instances = null; S.cur = null; S.weight = 1; },
    _enterScene(weight) { S.cur = DEF(); S.cur._w = weight; S.params.push(S.cur); S.weight = weight; },
    _leaveScene() { S.cur = null; S.weight = 1; },

    /** set({opacity, ambientAlpha, keyAlpha, spin, spinOffset, pointScale, dof, fog, rect, layer}) */
    set(o) { const p = S.cur || (S.cur = DEF(), S.cur._w = 1, S.params.push(S.cur), S.cur); for (const k in o) { if (k === 'cam') Object.assign(p.cam, o.cam); else if (k === 'rect') p.rect = Object.assign({}, p.rect, o.rect); else p[k] = o[k]; } return api; },
    /** setCamera({target:[x,y,z], dist, yaw, pitch, roll, fov, pos:[x,y,z]|null, orbit, focus})
     *  yaw/pitch/dist orbit around target unless pos is given. orbit = extra yaw rad/s (auto drift). */
    setCamera(c) { return api.set({ cam: c }); },
    get camera() { return (S.cur || DEF()).cam; },

    /**
     * addKeyPoint(id, {pos, color, label, sub, labelSide:'right'|'left', size=2.6, bornAt, alpha=1,
     *   pulse=0, pulseRate=2.2, fixed=false, labelAlpha=1, ring=false})
     * Declares a labelled hero point for THIS frame (call every frame). Returns the mutable key object.
     */
    addKeyPoint(id, o = {}) {
      const k = Object.assign({ id, pos: [0, 0, 0], color: COL.indigo, label: null, sub: null, labelSide: 'right', size: 2.6, bornAt: null, alpha: 1, pulse: 0, pulseRate: 2.2, fixed: false, labelAlpha: 1, labelDx: 0, labelDy: 0, ring: false, _w: S.weight }, o);
      k.pos = (o.pos || [0, 0, 0]).slice();
      const prev = S.keys.get(id); if (prev) k._w = Math.min(1, prev._w + S.weight);
      S.keys.set(id, k); return k;
    },
    key(id) { return S.keys.get(id); },
    /** birth(id, t0): the key point appears at t0 with a spring pop + flash + shockwave rings. */
    birth(id, t0) { const k = S.keys.get(id); if (k) k.bornAt = t0; return api; },
    /** pulseWave(t0, color='#22C55E', {origin=[0,0,0], speed=1.4, width=.3, stay=.0, boost=1.6}) */
    pulseWave(t0, color = COL.green, o = {}) { S.effects.push(Object.assign({ type: 'wave', t0, color, origin: [0, 0, 0], speed: 1.4, width: .3, stay: 0, boost: 1.6, _w: S.weight }, o)); return api; },
    /** pull(idA, idB, t0, dur=2.5, {gap=.3, beam=true, color}): drag two key points together with a glowing beam. */
    pull(a, b, t0, dur = 2.5, o = {}) { S.effects.push(Object.assign({ type: 'pull', a, b, t0, dur, gap: .3, beam: true, color: null, _w: S.weight }, o)); return api; },
    /** link(id, x, y, t0, {color, dur=.45, width=2}): a glowing line from a key point to a screen point (e.g. a DOM answer). */
    link(id, x, y, t0, o = {}) { S.effects.push(Object.assign({ type: 'link', id, x, y, t0, dur: .45, color: null, width: 2, _w: S.weight }, o)); return api; },
    /** tint(sel, color, amount=1, boost=0): recolour ambient points. sel = array of indices or fn(p,i)->weight. */
    tint(sel, color, amount = 1, boost = 0) { S.effects.push({ type: 'tint', sel, color, amount, boost, _w: S.weight }); return api; },
    /** nearest(pos, n): indices of the n ambient points nearest to local pos. */
    nearest(pos, n = 12) { return pts.map(p => [p.i, (p.x - pos[0]) ** 2 + (p.y - pos[1]) ** 2 + (p.z - pos[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, n).map(a => a[0]); },
    /** instances([{offset:[x,y,z], alpha=1, tint=null, decimate=1}]): replicate the ambient cloud (e.g. "many clouds"). */
    setInstances(list) { S.instances = list; return api; },
    /** draw2D(fn(ctx, t, fade, cloud)): custom drawing on the cloud canvas after points (additive-friendly). */
    draw2D(fn, o = {}) { S.hooks.push({ fn, pre: !!o.pre, _w: S.weight }); return api; },
    /** project(localPos) -> {x, y, z, s(px per unit), vis}. Uses this frame's camera as set SO FAR. */
    project(p, fixed = false) { return _project(_camFromParams(_blend()), _toWorld(p, fixed, _blend())); },
    /** projector(fixed=false) -> fn(localPos) -> {x,y,z,s,vis}. Fast batch projection with the camera as
     *  set so far. Inside a draw2D hook this is the FINAL blended camera of the frame (preferred). */
    projector(fixed = false) { const p = _blend(); const cam = _camFromParams(p); return pos => _project(cam, _toWorld(pos, fixed, p)); },
    /** ambientLocal(i, t): the drifting local position of ambient point i at time t. */
    ambientLocal(i, t) { const q = pts[i]; return [q.x + .018 * Math.sin(t * .31 + q.ph), q.y + .014 * Math.sin(t * .23 + q.ph * 1.7), q.z + .018 * Math.cos(t * .27 + q.ph)]; },
    /** screenOf(id): screen position of a key point after the last cloud render (or null). */
    screenOf(id) { return S.proj && S.proj.get(id) || null; },

    /* -- final draw, called by main.js -- */
    _render(t, back, front) {
      const p = _blend();
      back.clearRect(0, 0, W, H);
      const ctx = p.layer === 'front' ? front : back;
      if (p.opacity <= .002) { S.proj = new Map(); return; }
      const cam = _camFromParams(p);
      ctx.save();
      for (const hk of S.hooks) if (hk.pre) hk.fn(ctx, t, hk._w, api);
      _drawAmbient(ctx, t, p, cam);
      _drawKeys(ctx, t, p, cam);
      for (const hk of S.hooks) if (!hk.pre) { ctx.save(); hk.fn(ctx, t, hk._w, api); ctx.restore(); }
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    _hooksOnly: () => S.hooks.length,
  };
  // property shorthands: cloud.opacity = .4 etc. (write to the current scene's params)
  for (const k of ['opacity', 'ambientAlpha', 'nebula', 'keyAlpha', 'spin', 'spinOffset', 'pointScale', 'dof', 'fog', 'rect', 'layer']) {
    Object.defineProperty(api, k, { get() { return (S.cur || _blend())[k]; }, set(v) { api.set({ [k]: v }); } });
  }

  /* ---- blend all scene contributions by crossfade weight ---- */
  function _blend() {
    const L = S.params; if (!L.length) return DEF();
    if (L.length === 1) return L[0];
    let wsum = 0; for (const p of L) wsum += Math.max(1e-4, p._w);
    const out = DEF(); const num = ['opacity', 'ambientAlpha', 'nebula', 'keyAlpha', 'spin', 'spinOffset', 'pointScale', 'dof', 'fog'];
    for (const k of num) out[k] = L.reduce((s, p) => s + p[k] * Math.max(1e-4, p._w), 0) / wsum;
    for (const k of ['x', 'y', 'w', 'h']) out.rect[k] = L.reduce((s, p) => s + p.rect[k] * Math.max(1e-4, p._w), 0) / wsum;
    out.layer = L.reduce((a, b) => (b._w > a._w ? b : a)).layer;
    // cameras: resolve eyes + targets, blend them
    const cams = L.map(p => [_camFromParams(p, true), Math.max(1e-4, p._w) / wsum]);
    out.cam = { _resolved: true, eye: [0, 0, 0], target: [0, 0, 0], fov: 0, roll: 0, focus: 0 };
    for (const [c, w] of cams) { for (let i = 0; i < 3; i++) { out.cam.eye[i] += c.eye[i] * w; out.cam.target[i] += c.target[i] * w; } out.cam.fov += c.fov * w; out.cam.roll += c.roll * w; out.cam.focus += c.focus * w; }
    return out;
  }
  function _camFromParams(p, raw) {
    const c = p.cam; let eye, target, fov, roll, focus;
    if (c._resolved) { eye = c.eye; target = c.target; fov = c.fov; roll = c.roll; focus = c.focus; }
    else {
      target = c.target || [0, 0, 0]; fov = c.fov; roll = c.roll || 0;
      if (c.pos) eye = c.pos;
      else { const yaw = c.yaw + (c.orbit || 0) * S.t, pit = c.pitch; eye = [target[0] + c.dist * Math.cos(pit) * Math.sin(yaw), target[1] + c.dist * Math.sin(pit), target[2] + c.dist * Math.cos(pit) * Math.cos(yaw)]; }
      focus = c.focus != null ? c.focus : Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
    }
    if (raw) return { eye, target, fov, roll, focus };
    let f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]; const fl = Math.hypot(...f) || 1; f = f.map(v => v / fl);
    let r = [f[2] * 0 - 0 * f[1], 0, 0]; // right = f x up(0,1,0)
    r = [-f[2], 0, f[0]]; let rl = Math.hypot(...r); if (rl < 1e-5) { r = [1, 0, 0]; rl = 1; } r = r.map(v => v / rl);
    let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const r2 = r.map((v, i) => v * cr + u[i] * sr), u2 = u.map((v, i) => u[i] * cr - r[i] * sr); r = r2; u = u2; }
    const rect = p.rect; const F = (rect.h / 2) / Math.tan(fov * Math.PI / 360);
    return { eye, f, r, u, F, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, focus, rect };
  }
  function _toWorld(pos, fixed, p) {
    if (fixed) return pos;
    const a = S.t * p.spin + p.spinOffset, c = Math.cos(a), s = Math.sin(a);
    return [pos[0] * c + pos[2] * s, pos[1], -pos[0] * s + pos[2] * c];
  }
  function _project(cam, w) {
    const dx = w[0] - cam.eye[0], dy = w[1] - cam.eye[1], dz = w[2] - cam.eye[2];
    const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    if (z < .06) return { x: 0, y: 0, z, s: 0, vis: false };
    const x = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], y = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    const s = cam.F / z;
    return { x: cam.cx + x * s, y: cam.cy - y * s, z, s, vis: true };
  }
  function _depth(p, cam, z) { // -> [alphaMul, blurMul]
    const d = z - cam.focus;
    const fog = d > 0 ? clamp(1 - d / 4.2 * p.fog, .12, 1) : clamp(1 + d / 6, .5, 1);
    const blur = Math.abs(d) * p.dof;
    return [fog, blur];
  }

  function _drawAmbient(ctx, t, p, cam) {
    const aOp = p.opacity * p.ambientAlpha; if (aOp <= .002) return;
    ctx.globalCompositeOperation = 'lighter';
    const waves = S.effects.filter(e => e.type === 'wave' && t >= e.t0);
    const tints = S.effects.filter(e => e.type === 'tint');
    const inst = S.instances || [{ offset: [0, 0, 0], alpha: 1 }];
    const a = t * p.spin + p.spinOffset, ca = Math.cos(a), sa = Math.sin(a);
    for (const I of inst) {
      if ((I.nebula ?? 1) > 0 && p.nebula > 0) for (let c = 0; c < clusters.length; c++) { // soft nebula haze per cluster
        const C = clusters[c]; const isc0 = I.scale || 1;
        for (let b = 0; b < 3; b++) {
          const lx = (C.x + (rand(c * 3 + b, 21) - .5) * C.s) * isc0, ly = (C.y + (rand(c * 3 + b, 22) - .5) * C.s * .5) * isc0, lz = (C.z + (rand(c * 3 + b, 23) - .5) * C.s) * isc0;
          const off0 = I.offset || [0, 0, 0];
          const pr = _project(cam, [lx * ca + lz * sa + off0[0], ly + off0[1], -lx * sa + lz * ca + off0[2]]); if (!pr.vis) continue;
          const [fog] = _depth(p, cam, pr.z); const R = C.s * (2.4 + b * .8) * pr.s * isc0;
          ctx.globalAlpha = clamp(aOp * (I.alpha ?? 1) * p.nebula * .09 * fog * (1 + .15 * Math.sin(t * .4 + c + b)));
          ctx.drawImage(glowSprite(I.tint ? mixColor(C.tint, I.tint, .6) : C.tint), pr.x - R, pr.y - R, 2 * R, 2 * R);
        }
      }
      const dec = I.decimate || 1, off = I.offset || [0, 0, 0], ia = I.alpha == null ? 1 : I.alpha; if (ia <= .002) continue;
      const ispin = I.spin || 0, ic = Math.cos(ispin * t + (I.phase || 0)), is = Math.sin(ispin * t + (I.phase || 0)), isc = I.scale || 1;
      for (let n = 0; n < N; n += dec) {
        const q = pts[n];
        // gentle drift
        const lx0 = q.x + .018 * Math.sin(t * .31 + q.ph), ly = q.y + .014 * Math.sin(t * .23 + q.ph * 1.7), lz0 = q.z + .018 * Math.cos(t * .27 + q.ph);
        const lx = (lx0 * ic + lz0 * is) * isc, lz = (-lx0 * is + lz0 * ic) * isc;
        const w = [lx * ca + lz * sa + off[0], ly * isc + off[1], -lx * sa + lz * ca + off[2]];
        const pr = _project(cam, w); if (!pr.vis) continue;
        if (pr.x < -80 || pr.x > W + 80 || pr.y < -80 || pr.y > H + 80) continue;
        const [fog, blur] = _depth(p, cam, pr.z);
        let color = I.tint ? mixColor(q.tint, I.tint, .6) : q.tint, boost = 0, sz = 1;
        for (const e of tints) {
          let k = 0; if (Array.isArray(e.sel)) k = e.sel.includes(n) ? 1 : 0; else k = e.sel(q, n) || 0;
          if (k > 0) { color = mixColor(color, e.color, clamp(k * e.amount) * e._w); boost += e.boost * k * e._w; }
        }
        for (const e of waves) {
          const r = Math.hypot(q.x - e.origin[0], q.y - e.origin[1], q.z - e.origin[2]);
          const front = (t - e.t0) * e.speed; const k = Math.exp(-Math.pow((r - front) / e.width, 2)) * e._w;
          const stay = r < front ? e.stay * e._w : 0; const m = Math.max(k, stay);
          if (m > .003) { color = mixColor(color, e.color, clamp(m)); boost += e.boost * k; sz += .7 * k; }
        }
        const tw = .72 + .28 * Math.sin(t * q.tw + q.ph);
        const alpha = aOp * ia * q.bright * tw * fog * (1 + boost) / (1 + blur * 1.3);
        const R = Math.max(1.2, .012 * q.size * sz * p.pointScale * pr.s) * (1 + blur * .9);
        ctx.globalAlpha = clamp(alpha * 1.1); ctx.drawImage(glowSprite(color), pr.x - R * 3.4, pr.y - R * 3.4, R * 6.8, R * 6.8);
        const cr = Math.max(1, R * .85);
        ctx.globalAlpha = clamp(alpha * (1.25 - Math.min(.8, blur * .5))); ctx.drawImage(coreSprite(color), pr.x - cr, pr.y - cr, cr * 2, cr * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function _drawKeys(ctx, t, p, cam) {
    S.proj = new Map();
    const keys = [...S.keys.values()]; if (!keys.length && !S.effects.some(e => e.type === 'link')) return;
    // apply pulls (in local coords)
    for (const e of S.effects) if (e.type === 'pull') {
      const A = S.keys.get(e.a), B = S.keys.get(e.b); if (!A || !B) continue;
      const k = easeInOutCubic(P(t, e.t0, e.dur)); const mid = lerp3(A.pos, B.pos, .5);
      const dir = [B.pos[0] - A.pos[0], B.pos[1] - A.pos[1], B.pos[2] - A.pos[2]]; const L = Math.hypot(...dir) || 1;
      const g = e.gap / 2 / L;
      A.pos = lerp3(A.pos, lerp3(mid, A.pos, g * 2 > 1 ? 1 : g * 2), k); B.pos = lerp3(B.pos, lerp3(mid, B.pos, g * 2 > 1 ? 1 : g * 2), k);
      e._k = k;
    }
    const kOp = p.opacity * p.keyAlpha;
    ctx.globalCompositeOperation = 'lighter';
    const labels = [];
    for (const k of keys) {
      const pr = _project(cam, _toWorld(k.pos, k.fixed, p)); if (!pr.vis) continue;
      let born = 1, flash = 0;
      if (k.bornAt != null) { if (t < k.bornAt) { S.proj.set(k.id, Object.assign({ hidden: true }, pr)); continue; } born = spring(P(t, k.bornAt, .9)); flash = pulse(t, k.bornAt + .08, .22); }
      let waveB = 0; for (const e of S.effects) if (e.type === 'wave' && t >= e.t0) { const r = Math.hypot(k.pos[0] - e.origin[0], k.pos[1] - e.origin[1], k.pos[2] - e.origin[2]); waveB += Math.exp(-Math.pow((r - (t - e.t0) * e.speed) / e.width, 2)) * e._w; }
      const beat = k.pulse ? 1 + k.pulse * (.5 + .5 * Math.sin(t * k.pulseRate * 6.283)) : 1;
      const [fog] = _depth(p, cam, pr.z);
      const a = kOp * k.alpha * k._w * Math.max(.8, fog);
      const R = Math.max(5, .02 * k.size * pr.s * p.pointScale) * born * beat * (1 + .35 * waveB);
      drawGlow(ctx, pr.x, pr.y, R * 6 * (1 + flash * .8), k.color, a * (.75 + flash + waveB * .5), false);
      drawGlow(ctx, pr.x, pr.y, R * 2.4, k.color, a, true);
      drawGlow(ctx, pr.x, pr.y, R * .9, mixColor(k.color, '#ffffff', .55 + .4 * flash), a, true);
      if (k.ring) { ctx.globalAlpha = a * .7; ctx.strokeStyle = k.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pr.x, pr.y, R * 2.6, 0, 6.283); ctx.stroke(); }
      if (k.bornAt != null && t < k.bornAt + 1.6) { // shockwave rings
        for (const [dly, mul] of [[0, 1], [.16, .65]]) {
          const q = P(t, k.bornAt + dly, 1.25); if (q <= 0 || q >= 1) continue;
          const rr = 8 + easeOutExpo(q) * 190 * mul * Math.min(1.6, pr.s / 280);
          ctx.globalAlpha = clamp(a * (1 - q) * .95); ctx.strokeStyle = k.color; ctx.lineWidth = 1 + 3.5 * (1 - q);
          ctx.beginPath(); ctx.ellipse(pr.x, pr.y, rr, rr * .92, 0, 0, 6.283); ctx.stroke();
        }
      }
      S.proj.set(k.id, { x: pr.x, y: pr.y, z: pr.z, s: pr.s, r: R, vis: true });
      if (k.label && k.labelAlpha > 0) labels.push([k, pr, a * k.labelAlpha * clamp(P(t, (k.bornAt ?? -99) + .25, .5))]);
    }
    // beams
    for (const e of S.effects) if (e.type === 'pull' && e.beam) {
      const A = S.proj.get(e.a), B = S.proj.get(e.b); if (!A || !B || A.hidden || B.hidden) continue;
      const ka = S.keys.get(e.a), kb = S.keys.get(e.b);
      const col = e.color || mixColor(ka.color, kb.color, .5); const al = kOp * E(t, e.t0, .5, easeOutCubic) * e._w;
      glowLine(ctx, A.x, A.y, B.x, B.y, col, al * (.75 + .25 * Math.sin(t * 9)), 2.4);
      for (let j = 0; j < 4; j++) { const u = ((t - e.t0) * .9 + j / 4) % 1; drawGlow(ctx, lerp(A.x, B.x, u), lerp(A.y, B.y, u), 9, '#ffffff', al * .5 * Math.sin(u * Math.PI)); }
    }
    for (const e of S.effects) if (e.type === 'link') {
      const A = S.proj.get(e.id); if (!A || A.hidden || t < e.t0) continue;
      const kk = easeOutCubic(P(t, e.t0, e.dur)); const col = e.color || S.keys.get(e.id).color;
      glowLine(ctx, A.x, A.y, lerp(A.x, e.x, kk), lerp(A.y, e.y, kk), col, kOp * e._w * .8, e.width);
      drawGlow(ctx, lerp(A.x, e.x, kk), lerp(A.y, e.y, kk), 10, col, kOp * e._w * (kk < 1 ? 1 : .6));
    }
    // labels (normal compositing, on top)
    ctx.globalCompositeOperation = 'source-over';
    for (const [k, pr, a] of labels) _label(ctx, k, pr, a);
    ctx.globalAlpha = 1;
  }
  function _label(ctx, k, pr, a) {
    if (a <= .01) return;
    const side = k.labelSide === 'left' ? -1 : 1;
    const x0 = pr.x + side * 10, y0 = pr.y - 10, x1 = pr.x + side * (46 + k.labelDx), y1 = pr.y - 46 + k.labelDy, x2 = x1 + side * 18;
    ctx.globalAlpha = a; ctx.strokeStyle = rgba(k.color, .85); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
    ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(x2, y1, 2.5, 0, 6.283); ctx.fill();
    ctx.font = `600 24px ${FONT}`; const tw = ctx.measureText(k.label).width;
    let sw = 0; if (k.sub) { ctx.font = `400 18px ${FONT}`; sw = ctx.measureText(k.sub).width; }
    const bw = Math.max(tw, sw) + 28, bh = k.sub ? 62 : 40; const bx = side > 0 ? x2 + 6 : x2 - 6 - bw, by = y1 - 20;
    ctx.fillStyle = 'rgba(10,14,22,.86)'; roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = rgba(k.color, .55); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = k.labelColor || mixColor(k.color, '#ffffff', .25); ctx.font = `600 24px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillText(k.label, bx + 14, by + 20);
    if (k.sub) { ctx.fillStyle = COL.sub; ctx.font = `400 18px ${FONT}`; ctx.fillText(k.sub, bx + 14, by + 45); }
    ctx.textBaseline = 'alphabetic';
  }
  return api;
})();

/* ------------------------------------------------------------ wordmark */
/**
 * makeWordmark({text='QUORUM', size=200, weight=800, spacing=40, cx=960, baseY=470})
 * Canvas-rendered crisp wordmark + particle targets that align exactly.
 * -> {samples(step=5) -> [[x,y],...], draw(ctx, alpha, sweepK=-1, glow=1), bbox}
 * sweepK 0..1 moves a ~120px diagonal specular highlight left->right across the letters, clipped to them
 * (-1 = none). Drive it over ~0.6 s, e.g. sweepK = easeInOutSine(P(t, lockT, .6)).
 */
function makeWordmark(o = {}) {
  const { text = 'QUORUM', size = 200, weight = 800, spacing = 40, cx = 960, baseY = 470 } = o;
  const font = `${weight} ${size}px ${FONT}`;
  const m = document.createElement('canvas').getContext('2d'); m.font = font;
  const widths = [...text].map(ch => m.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  const xs = []; let x = cx - total / 2; for (const w of widths) { xs.push(x); x += w + spacing; }
  const pad = 80, bx = Math.floor(cx - total / 2 - pad), by = Math.floor(baseY - size * 1.0 - pad), bw = Math.ceil(total + pad * 2), bh = Math.ceil(size * 1.3 + pad * 2);
  const mk = () => { const c = document.createElement('canvas'); c.width = bw; c.height = bh; return c; };
  const txt = mk(), tc = txt.getContext('2d'); tc.font = font; tc.fillStyle = '#fff';
  [...text].forEach((ch, i) => tc.fillText(ch, xs[i] - bx, baseY - by));
  const glow = mk(), gc = glow.getContext('2d'); gc.filter = 'blur(26px)'; gc.globalAlpha = .9; gc.drawImage(txt, 0, 0);
  const tinted = mk(), tic = tinted.getContext('2d'); tic.drawImage(glow, 0, 0); tic.globalCompositeOperation = 'source-in'; tic.fillStyle = COL.indigo; tic.fillRect(0, 0, bw, bh);
  const cool = mk(), cc = cool.getContext('2d'); cc.drawImage(txt, 0, 0); cc.globalCompositeOperation = 'source-in'; cc.fillStyle = '#AEB8EC'; cc.fillRect(0, 0, bw, bh);
  const sweep = mk(), sc = sweep.getContext('2d');
  return {
    bbox: { x: bx + pad, y: by + pad, w: total, h: size * 1.3 }, xs, widths, font,
    samples(step = 5) {
      const d = tc.getImageData(0, 0, bw, bh).data; const out = [];
      for (let yy = 0; yy < bh; yy += step) for (let xx = 0; xx < bw; xx += step) {
        const jx = ((yy / step) % 2) * step / 2; const X = Math.floor(xx + jx);
        if (X < bw && d[(yy * bw + X) * 4 + 3] > 140) out.push([X + bx, yy + by]);
      }
      return out;
    },
    draw(ctx, alpha = 1, sweepK = -1, glowAmt = 1) {
      if (alpha <= .003) return;
      const sweeping = sweepK > 0 && sweepK < 1;
      // env: letters cool down slightly while the specular band passes, so the white highlight reads
      const env = sweeping ? Math.min(1, sweepK / .15, (1 - sweepK) / .15) : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(alpha * .55 * glowAmt); ctx.drawImage(tinted, bx, by);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(alpha); ctx.drawImage(txt, bx, by);
      if (sweeping) {
        ctx.globalAlpha = clamp(alpha * env * .85); ctx.drawImage(cool, bx, by);
        // diagonal specular band (~120px), leaning ~22deg, clipped to the letterforms (+ a soft edge bloom)
        const cx0 = lerp(pad - 170, bw - pad + 170, sweepK), cy0 = bh / 2, ang = -.38;
        const nx = Math.cos(ang), ny = Math.sin(ang);
        const band = (half, stops) => { const g = sc.createLinearGradient(cx0 - nx * half, cy0 - ny * half, cx0 + nx * half, cy0 + ny * half); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
        sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, bw, bh); sc.drawImage(txt, 0, 0);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = band(60, [[0, 'rgba(190,200,255,0)'], [.3, 'rgba(210,218,255,.55)'], [.5, 'rgba(255,255,255,1)'], [.7, 'rgba(210,218,255,.55)'], [1, 'rgba(190,200,255,0)']]);
        sc.fillRect(0, 0, bw, bh);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(alpha); ctx.drawImage(sweep, bx, by); ctx.drawImage(sweep, bx, by);
        // soft bloom of the same band on the blurred glow (spills just outside the letter edges)
        sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, bw, bh); sc.drawImage(glow, 0, 0);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = band(90, [[0, 'rgba(157,169,255,0)'], [.5, 'rgba(235,240,255,1)'], [1, 'rgba(157,169,255,0)']]);
        sc.fillRect(0, 0, bw, bh);
        ctx.globalAlpha = clamp(alpha * .8 * env); ctx.drawImage(sweep, bx, by);
      }
      ctx.restore();
    }
  };
}

/* ----------------------------------------------------------- scene registry */
const SCENES = [];
/**
 * Scene({id, start, end, fadeIn=.5, fadeOut=.5, drift=.03, z, captions:[[a,b,text]], build(root), render(t, lt, fade)})
 * build() runs once at load and creates DOM inside `root` (a 1920x1080 absolutely-positioned div).
 * render() runs every frame while the scene is visible: t in (start - fadeIn/2, end + fadeOut/2).
 * The framework owns root.style.opacity and root.style.transform (crossfade + slow 1.00 -> 1+drift zoom).
 */
function Scene(def) {
  const s = Object.assign({ fadeIn: .5, fadeOut: .5, drift: .03, captions: [], build: () => { }, render: () => { } }, def);
  s.z = s.z ?? SCENES.length;
  SCENES.push(s); return s;
}

/* ------------------------------------------------------------------ export */
Object.assign(G, {
  W, H, FPS, COL, FONT,
  clamp, lerp, invLerp, remap, lerp3, P, E, pulse, win, blink, keyframes, mixAny,
  linear, easeOutExpo, easeInExpo, easeInOutExpo, easeOutCubic, easeInCubic, easeInOutCubic, easeInOutSine, easeOutQuart, easeOutBack, spring,
  rand, randn, seeded, wiggle,
  hexToRgb, rgbToHex, mixColor, rgba,
  $, $$, el, h, css, setHTML, setText, esc, xf,
  show, pop, hideAfter, typeText, staggerIn, splitWords, countUp, fmtTime,
  makeLaptop, netGraph, chip, PLANE_SVG,
  caption, _cap,
  glowSprite, coreSprite, drawGlow, glowLine, roundRect,
  cloud, makeWordmark,
  Scene, SCENES,
});
})(window);
