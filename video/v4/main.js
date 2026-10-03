/* Quorum v4 main.js: builds the whiteboard world and every registered scene once, then exposes
 * window.render(t). Frame order: camera (global keyframe track + shakes + punches + drift) ->
 * world transform -> scenes on camera -> cursor -> captions -> HUD -> paper fade.
 * Pure function of t: nothing depends on the previous frame. */
(function () {
'use strict';
window.__errors = [];
const logErr = (where, e) => { const m = `[${where}] ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`; window.__errors.push(m); console.error(m); };
window.addEventListener('error', ev => logErr('window', ev.error || ev.message));

/* ------------------------------------------------------------------ cues */
if (!window.CUES) {
  try { const x = new XMLHttpRequest(); x.open('GET', 'cues.json', false); x.send(); window.CUES = JSON.parse(x.responseText); }
  catch (e) { logErr('cues', 'cues.json not injected and not readable (open with render.js, or allow file access)'); window.CUES = { duration: 168, scenes: [], captions: [] }; }
}
window.DURATION = CUES.duration || 168;
const cuesById = Object.fromEntries((CUES.scenes || []).map(s => [s.id, s]));

/* Fonts load before anything is built: scenes measure text in build() (wordRect, centred labels). */
const FONTS = ['400 30px "Shantell Sans"', '600 30px "Shantell Sans"', '700 30px "Shantell Sans"', '400 30px "Schibsted Grotesk"',
  '500 30px "Schibsted Grotesk"', '600 30px "Schibsted Grotesk"', '700 30px "Schibsted Grotesk"', '800 30px "Schibsted Grotesk"'];
Promise.all(FONTS.map(f => document.fonts.load(f))).catch(e => logErr('fonts', e)).then(start);

function start() {
/* ------------------------------------------------------------------ world */
const world = document.getElementById('world');
const board = el('div', { cls: 'board board-tex', style: `width:${BOARD.w}px;height:${BOARD.h}px` }, world);
el("div", { cls: "board-edge", style: `width:${BOARD.w + 52}px;height:${BOARD.h + 52}px` }, world);
// ghosted smudges of old marker (deterministic)
for (let i = 0; i < 26; i++) {
  const x = rand(i, 1) * BOARD.w, y = rand(i, 2) * BOARD.h, w = 220 + rand(i, 3) * 520, hgt = 60 + rand(i, 4) * 160;
  el('div', { cls: 'smudge', style: `left:${x}px;top:${y}px;width:${w}px;height:${hgt}px;transform:rotate(${(rand(i, 5) - .5) * 40}deg)` }, board);
}
// board texture: fine grain, painted once into a tile
(function texture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const img = g.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const v = 238 + (rand(i, 77) - .5) * 9; img.data[i * 4] = v; img.data[i * 4 + 1] = v + 1; img.data[i * 4 + 2] = v + 4; img.data[i * 4 + 3] = 20; }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--tex', `url(${c.toDataURL('image/png')})`);
})();

window.Q = { t: 0, fade: 0, setFade(v) { Q.fade = Math.max(Q.fade, clamp(v)); }, world, board };

/* ------------------------------------------------------------------ scenes */
SCENES.sort((a, b) => a.z - b.z);
for (const s of SCENES) {
  s.cues = cuesById[s.id] || {};
  s.root = el('div', { cls: 'scene' + (s.fixture ? ' fixture' : ''), attrs: { id: 'scene-' + s.id }, style: `left:${s.region.x}px;top:${s.region.y}px;z-index:${s.z}` }, world);
  try { s.build(s.root, s); } catch (e) { logErr('build ' + s.id, e); s._broken = true; }
}
HUD.root = document.getElementById('hud');
Cursor.el = el('div', { cls: 'cursor', html: '<svg width="48" height="52" viewBox="-2 -2 46 50"><path fill="#fff" stroke="#14171f" stroke-width="3" stroke-linejoin="round"/></svg>' }, document.getElementById('cursor-layer'));
Cursor.path = Cursor.el.querySelector('path');
Captions._build(document.getElementById('cap'));
const fadeEl = document.getElementById('paperfade');

/* ------------------------------------------------------------------ camera track */
const DEFAULT_CAM = { x: BOARD.w / 2, y: BOARD.h / 2, z: Math.min(W / BOARD.w, H / BOARD.h), r: 0 };
let TRACK = [];
function buildTrack() {
  const keys = [];
  for (const s of SCENES) if (!s._broken) for (const k of s.camera || []) {
    try { const v = typeof k[1] === 'function' ? k[1](k[0]) : k[1]; keys.push([k[0], { r: 0, ...v }, k[2]]); }
    catch (e) { logErr('camera ' + s.id + ' @' + k[0], e); }
  }
  keys.sort((a, b) => a[0] - b[0]);
  TRACK = keys.length ? keys : [[0, DEFAULT_CAM]];
}
buildTrack();
const SHAKES = [], PUNCHES = [];
for (const s of SCENES) { for (const k of s.shakes || []) SHAKES.push(k); for (const k of s.punches || []) PUNCHES.push(k); }

function cameraAt(t) {
  const c = Object.assign({ r: 0 }, keyframes(t, TRACK));
  // punches: quick zoom kick that settles (impacts)
  let zk = 1; for (const [t0, amt, dur = .45] of PUNCHES) { if (t >= t0 && t < t0 + dur) { const k = (t - t0) / dur; zk *= 1 + amt * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * Math.pow(1 - k, 2); } }
  // constant micro drift (+-6 px, 0.1 Hz) and a 0.3% breathe
  let sx = wiggle(t, 11, .628, 6), sy = wiggle(t, 12, .628 * .8, 6);
  zk *= 1 + .003 * Math.sin(t * .628);
  // shakes: decaying jitter
  for (const [t0, amp, dur = .4] of SHAKES) if (t >= t0 && t < t0 + dur) {
    const k = (t - t0) / dur, a = amp * Math.pow(1 - k, 2);
    sx += a * Math.sin(t * 91 + t0) ; sy += a * Math.cos(t * 77 + t0 * 3);
  }
  return { x: c.x, y: c.y, z: c.z * zk, r: c.r || 0, sx, sy };
}

function intersects(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

/* ------------------------------------------------------------------ render */
window.render = function (t) {
  t = +t; Q.t = t; Q.fade = 0;
  const cam = cameraAt(t); CAM.cur = cam;
  world.style.transform = `translate(${(W / 2 + cam.sx).toFixed(2)}px,${(H / 2 + cam.sy).toFixed(2)}px) rotate(${cam.r.toFixed(3)}deg) scale(${cam.z.toFixed(5)}) translate(${(-cam.x).toFixed(2)}px,${(-cam.y).toFixed(2)}px)`;
  const view = CAM.view();
  HUD._begin();
  for (const s of SCENES) {
    if (s._broken) continue;
    const m = s.margin, r = s.region;
    const on = s.always || intersects(view, { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
    if (!on) { if (s.root.style.display !== 'none') s.root.style.display = 'none'; continue; }
    s.root.style.display = '';
    try { s.render(t, t - (s.start ?? 0), s); } catch (e) { logErr('render ' + s.id + ' @' + t.toFixed(2), e); }
  }
  // typing caret on any visible plate
  for (const p of _plates) { const c = p.caret(t); if (c) { const r = CAM.rectToScreen(c); HUD.caret(r, t); } }
  try { Cursor._render(t); } catch (e) { logErr('cursor', e); }
  try { Captions._render(t); } catch (e) { logErr('captions', e); }
  HUD._end();
  fadeEl.style.opacity = Q.fade;
  return window.__errors.length;
};
window.__settle = settle;
window.prefetch = prefetch;
window.__ready = true;
window.render(0);
}
})();
