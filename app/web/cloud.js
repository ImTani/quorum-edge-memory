// The memory cloud: every claim is a glowing point in a slowly rotating 3D galaxy.
// Ported from the film's 3D cloud engine (video/lib.js). The film rendered a pure function of t;
// here the same projection, sprites and effects run in a requestAnimationFrame loop with real
// time and persistent per-point state (births, colour fades, the conflict pull).

export const COLORS = {
  private: '#A98BE8',   // device tier, never leaves this machine
  queued: '#F5A524',    // in the outbox
  synced: '#22C55E',    // acknowledged by / pulled from the hub
  disputed: '#EF4444',
  superseded: '#5B6478',
  indigo: '#7C8CFF',
  text: '#E8ECF4',
  sub: '#9AA4C0',
};

const FONT = '"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';
const MONO = 'Consolas,"Cascadia Mono",monospace';
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ math */
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = v => Math.hypot(v[0], v[1], v[2]);
const progress = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));
const easeOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const spring = (x, damping = 6.5, freq = 2.1) => (x <= 0 ? 0 : x >= 1 ? 1
  : 1 - Math.exp(-damping * x) * Math.cos(freq * TAU * x) * (1 - x * x * x));
const pulse = (t, t0, w) => Math.exp(-Math.pow((t - t0) / w, 2));
/** Frame-rate independent approach of `cur` toward `target` (rate = 1/seconds). */
const approach = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

function rand(i, salt = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(salt | 0, 668265263) + 0x9E3779B9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function randn(i, salt = 0) {
  const u = Math.max(1e-9, rand(i, salt)), v = rand(i, salt + 7919);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/* ---------------------------------------------------------------- colour */
function hexToRgb(c) {
  let s = c.slice(1); if (s.length === 3) s = s.split('').map(x => x + x).join('');
  const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mixColor = (a, b, k) => {
  if (k <= 0) return a; if (k >= 1) return b;
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]);
};
const rgba = (c, a) => { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; };

/* ---------------------------------------------------------- glow sprites */
const sprites = new Map();
const quant = c => hexToRgb(c).map(v => v & ~7);
function glowSprite(color) {
  const q = quant(color), key = 'g' + q.join(',');
  let s = sprites.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 128;
  const c = s.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64), [r, gg, b] = q;
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`); g.addColorStop(0.12, `rgba(${r},${gg},${b},.62)`);
  g.addColorStop(0.32, `rgba(${r},${gg},${b},.2)`); g.addColorStop(0.62, `rgba(${r},${gg},${b},.05)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); sprites.set(key, s); return s;
}
function coreSprite(color) {
  const q = quant(color), key = 'c' + q.join(',');
  let s = sprites.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 32;
  const c = s.getContext('2d'), [r, gg, b] = q, hot = hexToRgb(mixColor(rgbToHex(q), '#ffffff', 0.75));
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},1)`); g.addColorStop(0.35, `rgba(${r},${gg},${b},.95)`);
  g.addColorStop(0.7, `rgba(${r},${gg},${b},.25)`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  c.fillStyle = g; c.fillRect(0, 0, 32, 32); sprites.set(key, s); return s;
}
function drawGlow(ctx, x, y, r, color, alpha = 1, core = true) {
  if (alpha <= 0.003 || r <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(alpha); ctx.drawImage(glowSprite(color), x - r, y - r, 2 * r, 2 * r);
  if (core) { const cr = Math.max(1.2, r * 0.28); ctx.drawImage(coreSprite(color), x - cr, y - cr, 2 * cr, 2 * cr); }
  ctx.globalAlpha = 1;
}
function glowLine(ctx, x1, y1, x2, y2, color, alpha = 1, width = 3) {
  if (alpha <= 0.003) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [wm, am] of [[6, 0.08], [3, 0.18], [1.6, 0.45], [0.6, 1]]) {
    ctx.globalAlpha = clamp(alpha * am); ctx.strokeStyle = wm < 1 ? mixColor(color, '#ffffff', 0.6) : color;
    ctx.lineWidth = width * wm; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* --------------------------------------------------- ambient galaxy dust */
// Decorative only: faint, tiny, indigo. Claims are the bright coloured points drawn on top.
const TINTS = ['#7C8CFF', '#9DB4FF', '#B49CFF', '#8FD3FF', '#C9D2FF', '#6F7CFF', '#A5B4FC'];
const CLUSTERS = [];
for (let c = 0; c < 7; c++) {
  const a = c / 7 * TAU + rand(c, 11) * 0.6, r = 0.45 + rand(c, 12) * 0.8;
  CLUSTERS.push({ x: Math.cos(a) * r, y: (rand(c, 13) - 0.5) * 0.45, z: Math.sin(a) * r, s: 0.16 + rand(c, 14) * 0.14, tint: TINTS[c] });
}
const DUST = [];
for (let i = 0; i < 360; i++) {
  let x, y, z, tint;
  if (i < 230) {
    const C = CLUSTERS[i % 7];
    x = C.x + randn(i, 1) * C.s; y = C.y + randn(i, 2) * C.s * 0.85; z = C.z + randn(i, 3) * C.s; tint = C.tint;
  } else {
    const r = 0.25 + 1.45 * Math.sqrt(rand(i, 4)), arm = (i % 2) * Math.PI, a = arm + r * 2.4 + randn(i, 5) * 0.35;
    x = Math.cos(a) * r; z = Math.sin(a) * r; y = randn(i, 6) * 0.09 * (1.6 - r * 0.5);
    tint = rand(i, 7) < 0.25 ? '#DDE3FF' : TINTS[i % TINTS.length];
  }
  const star = rand(i, 8) < 0.05;
  DUST.push({ x, y, z, tint, size: star ? 1.7 + rand(i, 9) : 0.5 + rand(i, 10) * 0.7, ph: rand(i, 15) * TAU, tw: 0.6 + rand(i, 16) * 1.6, bright: 0.5 + rand(i, 17) * 0.45 });
}

/** The visual state of a claim: drives its colour and legend bucket. */
export function claimState(c) {
  if (c.status === 'disputed') return 'disputed';
  if (c.status === 'superseded') return 'superseded';
  return c.sync || 'synced';
}

const PAIR_GAP = 0.34;        // local units between a conflicting pair once pulled together
const PULL_SECONDS = 2.4;
const RELEASE_AFTER = 3.5;    // seconds after resolution before the pair drifts home
const NEW_LABEL_SECONDS = 7;

export class MemoryCloud {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onHover?:Function, onSelect?:Function, onFrame?:Function, labelFor?:Function}} opts
   *   onHover(claim|null, x, y), onSelect(claim|null), onFrame(screenOf) each frame,
   *   labelFor(claim) -> {label, sub} for leader-line tags. fontScale scales the canvas tags.
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.fs = opts.fontScale || 1;
    this.labelTop = opts.labelTop || 6;   // keep canvas tags below any overlay header
    this.nodes = new Map();          // claim_id -> node
    this.conflicts = new Map();      // conflict_id -> {ids, sim, openedAt, resolvedAt, winner}
    this.focusId = null;             // conflict the camera looks at
    this.view = 'mine';
    this.fit = null;
    this.hoverId = null;
    this.selectedId = null;
    this.highlights = new Map();     // claim_id -> until (s)
    this.waves = [];
    this.screen = new Map();         // claim_id -> {x, y, r} after the last frame
    this.w = 1; this.h = 1; this.dpr = 1;
    this.insetBottom = 0; this.insetTarget = 0;
    this.cam = { angle: 0.6, spin: 0.045, pitch: 0.36, dist: 3.4, target: [0, 0, 0], fov: 46 };
    this.drag = null;
    this.last = performance.now() / 1000;

    new ResizeObserver(() => this._resize()).observe(canvas);
    this._resize();
    this._bindPointer();
    const loop = () => { this._frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------ public API */
  now() { return performance.now() / 1000; }

  /** Replace every claim (initial load or resync). No birth animations. */
  setClaims(claims) {
    if (!this.fit || this.nodes.size < 3) this.fit = fitOf(claims);
    const seen = new Set();
    for (const c of claims) { seen.add(c.claim_id); this.upsert(c, { quiet: true }); }
    for (const id of [...this.nodes.keys()]) if (!seen.has(id)) this.nodes.delete(id);
  }

  /** Add or update one claim. New claims pop in; queued -> synced flashes green. */
  upsert(c, { quiet = false } = {}) {
    if (!this.fit) this.fit = fitOf([c]);
    const t = this.now(), state = claimState(c), color = COLORS[state];
    let n = this.nodes.get(c.claim_id);
    if (!n) {
      n = { id: c.claim_id, claim: c, home: this._local(c.xyz), pos: null, from: color, to: color, changedAt: -9,
        bornAt: quiet ? null : t, flashAt: -9, vis: this._visible(c) ? 1 : 0, state };
      n.pos = n.home.slice();
      this.nodes.set(c.claim_id, n);
      return;
    }
    const prev = n.state;
    n.claim = c; n.state = state;
    if (c.xyz) n.home = this._local(c.xyz);
    if (prev !== state) {
      n.from = this._colorOf(n, t); n.to = color; n.changedAt = t;
      if (!quiet && state === 'synced' && prev === 'queued') n.flashAt = t;
    }
  }

  setView(view) { this.view = view; }

  /** Show / update a conflict: the pair glows red, a beam joins them, they ease together. */
  setConflict(cf) {
    const t = this.now();
    let e = this.conflicts.get(cf.conflict_id);
    const resolved = cf.status === 'resolved';
    if (!e) {
      // A conflict already open at page load appears settled, without the entrance.
      e = { ids: cf.claim_ids.slice(0, 2), sim: cf.similarity, openedAt: t, resolvedAt: null, winner: null, fresh: true };
      this.conflicts.set(cf.conflict_id, e);
      if (!resolved) this.focusId = cf.conflict_id;
    }
    e.sim = cf.similarity;
    if (resolved && e.resolvedAt == null) {
      e.resolvedAt = t; e.winner = cf.winner_claim_id;
      if (this.focusId === cf.conflict_id) setTimeout(() => { if (this.focusId === cf.conflict_id) this.focusId = null; }, RELEASE_AFTER * 1000);
    }
  }

  /** Load-time conflicts: no pull animation, resolved ones are simply at rest. */
  setConflicts(list) {
    for (const cf of list) {
      this.setConflict(cf);
      const e = this.conflicts.get(cf.conflict_id);
      e.openedAt = this.now() - 60;
      if (cf.status === 'resolved') { e.resolvedAt = this.now() - 60; this.focusId = this.focusId === cf.conflict_id ? null : this.focusId; }
    }
  }

  highlight(ids, seconds = 5) { const until = this.now() + seconds; for (const id of ids) this.highlights.set(id, until); }
  select(id) { this.selectedId = id; }
  /** Green pulse wave through the whole cloud (outbox drained after reconnect). */
  wave(color = COLORS.synced) { this.waves.push({ t0: this.now(), color, speed: 1.5, width: 0.32 }); }
  /** Reserve space at the bottom (an overlay card); the projection centre slides up. */
  setInsetBottom(px) { this.insetTarget = px; }
  screenOf(id) { return this.screen.get(id) || null; }

  /* --------------------------------------------------------------- helpers */
  _visible(c) {
    if (c.status === 'retracted' || c.attribute === 'resolution') return false;
    if (this.view === 'team' && c.tier !== 'team') return false;
    return true;
  }
  _local(xyz) {
    if (!xyz || !this.fit) return [0, 0, 0];
    const { c, s } = this.fit;
    let p = [(xyz[0] - c[0]) / s * 1.3, (xyz[1] - c[1]) / s * 0.6, (xyz[2] - c[2]) / s * 1.3];
    const r = len3(p);
    if (r > 2.1) p = p.map(v => v * 2.1 / r);  // keep outliers on screen
    return p;
  }
  _colorOf(n, t) { return mixColor(n.from, n.to, easeOutCubic(progress(t, n.changedAt, 0.8))); }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }

  _bindPointer() {
    const cv = this.canvas;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { const [x, y] = pos(e); this.drag = { x, y, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const [x, y] = pos(e);
      if (this.drag) {
        const dx = x - this.drag.x, dy = y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
        if (this.drag.moved) {
          this.cam.angle += dx * 0.006; this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, -0.2, 1.1);
          this.drag.x = x; this.drag.y = y; return;
        }
      }
      const id = this._pick(x, y);
      if (id !== this.hoverId) { this.hoverId = id; cv.style.cursor = id ? 'pointer' : 'grab'; }
      this.opts.onHover?.(id ? this.nodes.get(id).claim : null, x, y);
    });
    cv.addEventListener('pointerup', e => {
      const [x, y] = pos(e), wasDrag = this.drag?.moved; this.drag = null;
      if (wasDrag) return;
      const id = this._pick(x, y);
      this.selectedId = id === this.selectedId ? null : id;
      this.opts.onSelect?.(this.selectedId ? this.nodes.get(this.selectedId).claim : null);
    });
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.hoverId = null; this.opts.onHover?.(null, 0, 0); } });
  }

  _pick(x, y) {
    let best = null, bd = Infinity;
    for (const [id, s] of this.screen) {
      const d = Math.hypot(s.x - x, s.y - y), reach = Math.max(14, s.r * 2.2);
      if (d < reach && d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /* ---------------------------------------------------------------- camera */
  _camera() {
    const c = this.cam, yaw = 0, pit = c.pitch, tg = c.target;
    const eye = [tg[0] + c.dist * Math.cos(pit) * Math.sin(yaw), tg[1] + c.dist * Math.sin(pit), tg[2] + c.dist * Math.cos(pit) * Math.cos(yaw)];
    let f = sub3(tg, eye); const fl = len3(f) || 1; f = f.map(v => v / fl);
    let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r) || 1; r = r.map(v => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const F = (this.h / 2) / Math.tan(c.fov * Math.PI / 360);
    return { eye, f, r, u, F, cx: this.w / 2, cy: (this.h - this.insetBottom) / 2, focus: c.dist };
  }
  _world(p) {
    const a = this.cam.angle, c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  }
  _project(cam, w) {
    const dx = w[0] - cam.eye[0], dy = w[1] - cam.eye[1], dz = w[2] - cam.eye[2];
    const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    if (z < 0.06) return { x: 0, y: 0, z, s: 0, vis: false };
    const x = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], y = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    const s = cam.F / z;
    return { x: cam.cx + x * s, y: cam.cy - y * s, z, s, vis: true };
  }
  _fog(cam, z) {
    const d = z - cam.focus;
    return d > 0 ? clamp(1 - d / 4.2, 0.18, 1) : clamp(1 + d / 6, 0.55, 1);
  }

  /* ----------------------------------------------------------------- frame */
  _frame() {
    const t = this.now(), dt = clamp(t - this.last, 0, 0.05); this.last = t;
    const ctx = this.ctx, cam0 = this.cam;
    this.insetBottom = approach(this.insetBottom, this.insetTarget, 5, dt);

    // Conflict pull: eased local offsets toward a fixed gap (never overlapping).
    for (const n of this.nodes.values()) n.pos = n.home.slice();
    let focusMid = null;
    for (const [id, e] of this.conflicts) {
      const A = this.nodes.get(e.ids[0]), B = this.nodes.get(e.ids[1]); if (!A || !B) continue;
      let k = easeInOutCubic(progress(t, e.openedAt, PULL_SECONDS));
      if (e.resolvedAt != null) k *= 1 - easeInOutCubic(progress(t, e.resolvedAt + RELEASE_AFTER, 2.2));
      const mid = lerp3(A.home, B.home, 0.5);
      let dir = sub3(B.home, A.home); const d = len3(dir);
      dir = d > 1e-4 ? dir.map(v => v / d) : [1, 0, 0];
      const half = PAIR_GAP / 2;
      A.pos = lerp3(A.home, [mid[0] - dir[0] * half, mid[1] - dir[1] * half, mid[2] - dir[2] * half], k);
      B.pos = lerp3(B.home, [mid[0] + dir[0] * half, mid[1] + dir[1] * half, mid[2] + dir[2] * half], k);
      e.k = k;
      if (id === this.focusId) focusMid = lerp3(A.pos, B.pos, 0.5);
    }

    // Camera: drift, and swoop toward the focused conflict.
    const focused = !!focusMid;
    cam0.spin = approach(cam0.spin, focused ? 0.012 : 0.045, 1.5, dt);
    if (!this.drag) cam0.angle += cam0.spin * dt;
    cam0.dist = approach(cam0.dist, focused ? 2.85 : 3.4, 1.6, dt);
    // Lean toward the pair without losing the rest of the cloud from the frame.
    const tgt = focused ? this._world(focusMid).map(v => v * 0.75) : [0, 0, 0];
    cam0.target = cam0.target.map((v, i) => approach(v, tgt[i], 1.8, dt));
    const cam = this._camera();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.waves = this.waves.filter(w => t - w.t0 < 4);
    this._drawDust(ctx, t, cam, focused);
    const proj = this._drawClaims(ctx, t, dt, cam);
    this._drawConflicts(ctx, t, proj);
    this.opts.onFrame?.(id => this.screen.get(id) || null);
  }

  _drawDust(ctx, t, cam, focused) {
    const aOp = focused ? 0.3 : 0.48;
    const a = this.cam.angle, ca = Math.cos(a), sa = Math.sin(a);
    ctx.globalCompositeOperation = 'lighter';
    for (let c = 0; c < CLUSTERS.length; c++) {  // soft nebula haze per cluster
      const C = CLUSTERS[c];
      for (let b = 0; b < 3; b++) {
        const lx = C.x + (rand(c * 3 + b, 21) - 0.5) * C.s, ly = C.y + (rand(c * 3 + b, 22) - 0.5) * C.s * 0.5, lz = C.z + (rand(c * 3 + b, 23) - 0.5) * C.s;
        const pr = this._project(cam, [lx * ca + lz * sa, ly, -lx * sa + lz * ca]); if (!pr.vis) continue;
        const R = C.s * (2.4 + b * 0.8) * pr.s;
        ctx.globalAlpha = clamp(aOp * 0.11 * this._fog(cam, pr.z) * (1 + 0.15 * Math.sin(t * 0.4 + c + b)));
        ctx.drawImage(glowSprite(C.tint), pr.x - R, pr.y - R, 2 * R, 2 * R);
      }
    }
    for (const q of DUST) {
      const lx = q.x + 0.018 * Math.sin(t * 0.31 + q.ph), ly = q.y + 0.014 * Math.sin(t * 0.23 + q.ph * 1.7), lz = q.z + 0.018 * Math.cos(t * 0.27 + q.ph);
      const pr = this._project(cam, [lx * ca + lz * sa, ly, -lx * sa + lz * ca]); if (!pr.vis) continue;
      if (pr.x < -40 || pr.x > this.w + 40 || pr.y < -40 || pr.y > this.h + 40) continue;
      let color = q.tint, boost = 0, sz = 1;
      for (const w of this.waves) {
        const r = Math.hypot(q.x, q.y, q.z), front = (t - w.t0) * w.speed;
        const k = Math.exp(-Math.pow((r - front) / w.width, 2));
        if (k > 0.003) { color = mixColor(color, w.color, k); boost += 1.6 * k; sz += 0.7 * k; }
      }
      const blur = Math.abs(pr.z - cam.focus) * 0.8;
      const alpha = aOp * q.bright * (0.72 + 0.28 * Math.sin(t * q.tw + q.ph)) * this._fog(cam, pr.z) * (1 + boost) / (1 + blur * 1.3);
      const R = Math.max(1, 0.011 * q.size * sz * pr.s) * (1 + blur * 0.9);
      ctx.globalAlpha = clamp(alpha); ctx.drawImage(glowSprite(color), pr.x - R * 3.4, pr.y - R * 3.4, R * 6.8, R * 6.8);
      const cr = Math.max(0.8, R * 0.85);
      ctx.globalAlpha = clamp(alpha * 1.1); ctx.drawImage(coreSprite(color), pr.x - cr, pr.y - cr, cr * 2, cr * 2);
    }
    ctx.globalAlpha = 1;
  }

  _drawClaims(ctx, t, dt, cam) {
    this.screen = new Map();
    const proj = new Map(), labels = [];
    const items = [];
    for (const n of this.nodes.values()) {
      n.vis = approach(n.vis, this._visible(n.claim) ? 1 : 0, 6, dt);
      if (n.vis < 0.01) continue;
      const pr = this._project(cam, this._world(n.pos)); if (!pr.vis) continue;
      items.push([n, pr]);
    }
    items.sort((a, b) => b[1].z - a[1].z);  // far first
    for (const [n, pr] of items) {
      const color = this._colorOf(n, t);
      const born = n.bornAt == null ? 1 : spring(progress(t, n.bornAt, 0.9));
      const flash = Math.max(n.bornAt == null ? 0 : pulse(t, n.bornAt + 0.08, 0.22), pulse(t, n.flashAt + 0.15, 0.35));
      let waveB = 0;
      for (const w of this.waves) { const r = len3(n.pos); waveB += Math.exp(-Math.pow((r - (t - w.t0) * w.speed) / w.width, 2)); }
      const disputed = n.state === 'disputed', superseded = n.state === 'superseded';
      const queued = n.state === 'queued';
      const beat = disputed ? 1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4 * TAU)) : queued ? 1.15 + 0.2 * Math.sin(t * 1.2 * TAU) : 1;
      const hl = (this.highlights.get(n.id) || 0) > t;
      const sel = n.id === this.selectedId || n.id === this.hoverId;
      const size = superseded ? 0.7 : disputed ? 1.35 : n.claim.tier === 'device' ? 0.9 : 1;
      const fog = Math.max(0.6, this._fog(cam, pr.z));
      const a = n.vis * fog * (superseded ? 0.45 : 1);
      const R = Math.max(3.2, 0.034 * size * pr.s) * born * beat * (1 + 0.35 * waveB) * (sel ? 1.25 : 1);
      drawGlow(ctx, pr.x, pr.y, R * (disputed ? 7 : 4.6) * (1 + flash * 0.9), color, a * (0.5 + flash + waveB * 0.5 + (hl ? 0.35 : 0)), false);
      drawGlow(ctx, pr.x, pr.y, R * 2.2, color, a * 0.95, true);
      drawGlow(ctx, pr.x, pr.y, R * 0.85, mixColor(color, '#ffffff', 0.5 + 0.4 * flash), a, true);
      if (sel || hl) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * (sel ? 0.9 : 0.55 + 0.35 * Math.sin(t * 5));
        ctx.strokeStyle = sel ? '#ffffff' : color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, R * 2.4 + 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const t0 of [n.bornAt, n.flashAt]) {  // shockwave rings on birth and on sync
        if (t0 == null || t - t0 > 1.6 || t < t0) continue;
        for (const [dly, mul] of [[0, 1], [0.16, 0.65]]) {
          const q = progress(t, t0 + dly, 1.25); if (q <= 0 || q >= 1) continue;
          const rr = 6 + easeOutExpo(q) * 90 * mul;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = clamp(a * (1 - q) * 0.9); ctx.strokeStyle = color; ctx.lineWidth = 1 + 3 * (1 - q);
          ctx.beginPath(); ctx.ellipse(pr.x, pr.y, rr, rr * 0.92, 0, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const s = { x: pr.x, y: pr.y, r: R };
      proj.set(n.id, s);
      if (n.vis > 0.5) this.screen.set(n.id, s);
      const isNew = n.bornAt != null && t - n.bornAt < NEW_LABEL_SECONDS;
      const inConflict = this._inOpenConflict(n.id);
      // Hovered / selected points get the DOM claim card instead of a canvas tag.
      if ((isNew || inConflict) && !sel && this.opts.labelFor) {
        const fade = isNew && !inConflict ? Math.min(progress(t, n.bornAt + 0.25, 0.5), 1 - progress(t, n.bornAt + NEW_LABEL_SECONDS - 0.6, 0.6)) : 1;
        labels.push({ n, pr, color, a: a * fade });
      }
    }
    // Pair labels go outward from each other; others to the right unless near the edge.
    ctx.globalCompositeOperation = 'source-over';
    for (const L of labels) {
      const partner = this._partnerOf(L.n.id), ps = partner && proj.get(partner);
      let side = L.pr.x > this.w * 0.7 ? -1 : 1;
      if (ps) side = L.pr.x < ps.x ? -1 : 1;
      const { label, sub } = this.opts.labelFor(L.n.claim);
      this._label(ctx, L.pr, L.color, label, sub, side, L.a, !!ps);
    }
    ctx.globalAlpha = 1;
    return proj;
  }

  _inOpenConflict(id) {
    for (const e of this.conflicts.values()) if (e.ids.includes(id) && (e.resolvedAt == null || this.now() - e.resolvedAt < RELEASE_AFTER + 1)) return true;
    return false;
  }
  _partnerOf(id) {
    for (const e of this.conflicts.values()) { const i = e.ids.indexOf(id); if (i >= 0) return e.ids[1 - i]; }
    return null;
  }

  _drawConflicts(ctx, t, proj) {
    for (const e of this.conflicts.values()) {
      const A = proj.get(e.ids[0]), B = proj.get(e.ids[1]); if (!A || !B) continue;
      let al = easeOutCubic(progress(t, e.openedAt, 0.5)), color = COLORS.disputed, text = `similarity ${(+e.sim).toFixed(2)}`;
      if (e.resolvedAt != null) {
        const k = progress(t, e.resolvedAt, 0.6);
        color = mixColor(COLORS.disputed, COLORS.synced, k); text = 'resolved';
        al *= 1 - easeInOutCubic(progress(t, e.resolvedAt + RELEASE_AFTER - 0.5, 1.5));
      }
      if (al <= 0.01) continue;
      glowLine(ctx, A.x, A.y, B.x, B.y, color, al * (0.7 + 0.3 * Math.sin(t * 9)), 2.2);
      for (let j = 0; j < 4; j++) {
        const u = ((t - e.openedAt) * 0.9 + j / 4) % 1;
        drawGlow(ctx, lerp(A.x, B.x, u), lerp(A.y, B.y, u), 8, '#ffffff', al * 0.45 * Math.sin(u * Math.PI));
      }
      // similarity tag above the beam's midpoint
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `700 ${Math.round(15 * this.fs)}px ${MONO}`;
      const tw = ctx.measureText(text).width, bw = tw + 22, bh = Math.round(28 * this.fs);
      const bx = clamp(mx - bw / 2, 6, this.w - bw - 6), by = clamp(my - 48, this.labelTop, this.h - bh - 6);
      ctx.globalAlpha = al;
      ctx.strokeStyle = rgba(color, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, my - 6); ctx.lineTo(mx, by + bh); ctx.stroke();
      ctx.fillStyle = 'rgba(10,14,22,.9)'; roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = rgba(color, 0.75); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = mixColor(color, '#ffffff', 0.3); ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 11, by + bh / 2 + 1);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
  }

  /** beside: a conflict pair's tags sit level with their points, leaving the space above for the similarity tag. */
  _label(ctx, pr, color, label, sub, side, a, beside = false) {
    if (a <= 0.01 || !label) return;
    const x0 = pr.x + side * 9, y0 = beside ? pr.y + 3 : pr.y - 8;
    const x1 = pr.x + side * (beside ? 26 : 30), y1 = beside ? pr.y + 18 : pr.y - 32, x2 = x1 + side * 12;
    ctx.globalAlpha = a; ctx.strokeStyle = rgba(color, 0.85); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
    const f1 = Math.round(15 * this.fs), f2 = Math.round(12.5 * this.fs * 10) / 10;
    ctx.font = `600 ${f1}px ${FONT}`; const tw = ctx.measureText(label).width;
    let sw = 0; if (sub) { ctx.font = `400 ${f2}px ${FONT}`; sw = ctx.measureText(sub).width; }
    const bw = Math.max(tw, sw) + 20, bh = Math.round((sub ? 44 : 28) * this.fs);
    let bx = side > 0 ? x2 + 4 : x2 - 4 - bw; bx = clamp(bx, 4, this.w - bw - 4);
    const by = clamp(y1 - 14, Math.max(4, this.labelTop - 2), this.h - bh - 4);
    ctx.fillStyle = 'rgba(10,14,22,.88)'; roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 1; ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mixColor(color, '#ffffff', 0.3); ctx.font = `600 ${f1}px ${FONT}`; ctx.fillText(label, bx + 10, by + 14 * this.fs);
    if (sub) { ctx.fillStyle = COLORS.sub; ctx.font = `400 ${f2}px ${FONT}`; ctx.fillText(sub, bx + 10, by + 32 * this.fs); }
    ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }
}

/**
 * Normalisation from raw claim.xyz into cloud space, computed once and then frozen, so points
 * never jump when new claims arrive. Team claims define it when possible: they are identical
 * on every device, so both windows draw the same shape.
 */
function fitOf(claims) {
  const withXyz = claims.filter(c => Array.isArray(c.xyz));
  const team = withXyz.filter(c => c.tier === 'team');
  const basis = team.length >= 3 ? team : withXyz;
  if (!basis.length) return { c: [0, 0, 0], s: 6 };
  const c = [0, 1, 2].map(i => basis.reduce((s, p) => s + p.xyz[i], 0) / basis.length);
  const rms = Math.sqrt(basis.reduce((s, p) => s + len3(sub3(p.xyz, c)) ** 2, 0) / basis.length);
  return { c, s: rms > 1e-6 ? rms : 6 };
}
