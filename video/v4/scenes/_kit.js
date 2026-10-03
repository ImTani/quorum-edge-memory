/* Scene kit: small helpers shared by the v4 scenes (S01-S15). Not a scene. Everything here is built
 * once and rendered as a pure function of t, like the lib components (FRAMEWORK.md ground rules).
 * Exposed as window.KIT. */
(function () {
  'use strict';

  /** A render list: add(component) returns it; render(t) renders all. */
  function list() {
    const items = [];
    return { items, add(x) { if (x) items.push(x); return x; }, render(t) { for (const x of items) x.render(t); } };
  }

  /** Wrap a plain element with an entrance (pop/show) and optional exit, as a component. */
  function popper(e, t0, o = {}) {
    const { d = .45, from = .7, r = 0, out = null, outD = .3, kind = 'pop' } = o;
    return {
      el: e, render(t) {
        const ko = out != null ? easeInOutCubic(P(t, out, outD)) : 0;
        if (t < t0 || ko >= 1) { e.style.visibility = 'hidden'; e.style.opacity = 0; return; }
        if (kind === 'pop') { const k = spring(P(t, t0, d), 6.5, 1.5); xf(e, { s: lerp(from, 1, k), r, o: P(t, t0, d * .25) * (1 - ko) }); }
        else { show(e, t, t0, d, { dy: o.dy ?? 14, r }); e.style.opacity = +e.style.opacity * (1 - ko); }
      },
    };
  }

  /**
   * note(parent, {x, y, text, color='blue', size=24, rot=-2, t0, out, kind='paper'|'tape'|'kraft', w, align})
   * A small paper slip with marker handwriting: the slip pops, then the words write on.
   * x, y = top-left (or the anchor given by align: 'center' | 'right').
   */
  function note(parent, o = {}) {
    const { x = 0, y = 0, text = '', color = 'blue', size = 24, rot = -2, kind = 'paper', out = null } = o;
    const e = el('div', { cls: `tag ${kind}`, style: `left:${x}px;top:${y}px;font-size:${size}px;padding:${size * .28}px ${size * .6}px ${size * .38}px;color:${markerColor(color)};font-weight:600;` + (o.w ? `width:${o.w}px;white-space:normal;line-height:1.15;` : 'width:auto;') + 'height:auto;' }, parent);   // .tape sets width/height too: override
    if (kind === 'paper') e.style.border = '1px solid #dfe2e8';
    const span = el('span', { html: o.html ?? esc(text) }, e);
    span.style.display = 'inline-block';
    if (o.align === 'center') e.style.marginLeft = `${-e.offsetWidth / 2}px`;
    if (o.align === 'right') e.style.marginLeft = `${-e.offsetWidth}px`;
    e.style.transformOrigin = '50% 60%';
    const t0 = o.t0 ?? 0, wdur = o.dur ?? clamp(text.length / 26, .3, 1.2);
    return {
      el: e, t0, render(t) {
        const ko = out != null ? easeInOutCubic(P(t, out, o.outD ?? .3)) : 0;
        if (t < t0 - .02 || ko >= 1) { e.style.display = 'none'; return; }
        e.style.display = '';
        const k = spring(P(t, t0, .4), 6.5, 1.6);
        xf(e, { s: lerp(.82, 1, k), r: rot + (1 - k) * 4, o: P(t, t0 - .02, .08) * (1 - ko) });
        const kw = P(t, t0 + .08, wdur);
        span.style.clipPath = kw >= 1 ? 'none' : `inset(-20% ${((1 - kw) * 100).toFixed(2)}% -30% -4%)`;
        span.style.fontVariationSettings = `"INFM" ${INFM[boilStep(t)]}`;
      },
    };
  }

  /** ffStamp: the fast-forward tag over extraction waits ("▸▸ local model reading · 4.5 s"). */
  function ffStamp(parent, o = {}) {
    const { x = 0, y = 0, text = '▸▸ reading · 4.5 s', size = 20, t0 = 0, t1 = 1, rot = -3 } = o;
    const e = el('div', { cls: 'tag tape', style: `left:${x}px;top:${y}px;font-size:${size}px;color:${COL.ink3};padding:${size * .25}px ${size * .55}px ${size * .32}px;width:auto;height:auto;` }, parent);
    const chev = el('b', { text: '▸▸', style: `color:${COL.ink};margin-right:.35em;display:inline-block` }, e);
    el('span', { text: text.replace(/^▸▸\s*/, '') }, e);
    e.style.transformOrigin = '30% 60%';
    return {
      el: e, render(t) {
        const ko = easeInOutCubic(P(t, t1, .3));
        if (t < t0 || ko >= 1) { e.style.display = 'none'; return; }
        e.style.display = '';
        const k = spring(P(t, t0, .35), 6, 1.6);
        xf(e, { s: lerp(.6, 1, k), r: rot, o: P(t, t0, .06) * (1 - ko) });
        // the chevrons tick forward while the clip races
        const ph = (t - t0) * 9;
        chev.style.transform = `translateX(${(Math.sin(ph) * .5 + .5) * size * .18}px)`;
      },
    };
  }

  /** flashRect: a thin coloured outline that flashes on (UI border flash). rect in parent coords. */
  function flashRect(parent, rect, o = {}) {
    const { color = 'red', t0 = 0, dur = .6, width = 4, radius = 14, hold = 0 } = o;
    const e = el('div', { style: `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;border:${width}px solid ${markerColor(color)};border-radius:${radius}px;pointer-events:none` }, parent);
    return {
      el: e, render(t) {
        const a = t < t0 ? 0 : t < t0 + .08 ? P(t, t0, .08) : t < t0 + .08 + hold ? 1 : 1 - easeOutCubic(P(t, t0 + .08 + hold, dur));
        e.style.display = a > .002 ? '' : 'none'; e.style.opacity = a.toFixed(3);
      },
    };
  }

  /** quadratic point */
  const qpt = (a, c, b, k) => [(1 - k) * (1 - k) * a[0] + 2 * (1 - k) * k * c[0] + k * k * b[0], (1 - k) * (1 - k) * a[1] + 2 * (1 - k) * k * c[1] + k * k * b[1]];

  /** dashedArrow(parent, a, b, {color='ink', width=3, bend=.2, n=9, head=12, t0}): dotted marker arrow (dash by dash, then head). */
  function dashedArrow(parent, a, b, o = {}) {
    const bend = o.bend ?? .2, n = o.n ?? 9, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const c = [a[0] + dx / 2 - dy / L * L * bend, a[1] + dy / 2 + dx / L * L * bend];
    const ds = [];
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = k0 + .55 / n, p0 = qpt(a, c, b, k0), p1 = qpt(a, c, b, k1);
      ds.push(`M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`);
    }
    const tx = b[0] - c[0], ty = b[1] - c[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hs = o.head ?? 12;
    ds.push(`M${(b[0] - ux * hs + uy * hs * .6).toFixed(1)} ${(b[1] - uy * hs - ux * hs * .6).toFixed(1)} L ${b[0]} ${b[1]} L ${(b[0] - ux * hs - uy * hs * .6).toFixed(1)} ${(b[1] - uy * hs + ux * hs * .6).toFixed(1)}`);
    const seq = strokeSeq(parent, ds, { color: 'ink', width: 3, ...o, durEach: o.durEach ?? .035, gap: .012, dry: false });
    seq.mid = qpt(a, c, b, .5);
    return seq;
  }

  /** stopwatch doodle (circle, crown, hand) centred at x,y, radius s. -> strokeSeq */
  function stopwatch(parent, x, y, s, o = {}) {
    const circ = circlePathD({ x: x - s, y: y - s, w: 2 * s, h: 2 * s }, 7, -6, 1.05);
    return strokeSeq(parent, [circ, `M${x - s * .25} ${y - s * 1.35} L ${x + s * .25} ${y - s * 1.35} M${x} ${y - s * 1.35} L ${x} ${y - s * 1.02}`, `M${x} ${y} L ${x + s * .45} ${y - s * .55}`],
      { color: 'ink', width: 3, ...o, durEach: .14, gap: .02 });
  }

  /** rough hand-drawn rectangle path around rect (for "boxing" words). */
  function roughRectD(r, pad = 6, seed = 1) {
    const j = i => (rand(seed, i) - .5) * 5;
    const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
    return `M${x0 + j(1)} ${y0 + j(2)} L ${x1 + 8 + j(3)} ${y0 - 2 + j(4)} M${x1 + j(5)} ${y0 - 6 + j(6)} L ${x1 + 2 + j(7)} ${y1 + 4 + j(8)} M${x1 + 6 + j(9)} ${y1 + j(10)} L ${x0 - 4 + j(11)} ${y1 + 2 + j(12)} M${x0 + j(13)} ${y1 + 6 + j(14)} L ${x0 - 2 + j(15)} ${y0 - 6 + j(16)}`;
  }

  /** lock doodle path (for "only on this laptop") at x,y (top-left), size s. */
  function lockD(x, y, s) {
    return `M${x + s * .22} ${y + s * .45} L ${x + s * .22} ${y + s * .28} C ${x + s * .22} ${y - s * .05}, ${x + s * .78} ${y - s * .05}, ${x + s * .78} ${y + s * .28} L ${x + s * .78} ${y + s * .45} M${x + s * .08} ${y + s * .45} L ${x + s * .92} ${y + s * .45} L ${x + s * .92} ${y + s} L ${x + s * .08} ${y + s} Z`;
  }

  /** settle a pinned element onto the board (tape slap): drops from scale `from` with a spring at t0. */
  function plateDrop(e, t0, o = {}) {
    const from = o.from ?? 1.035;
    return {
      render(t) {
        const a = t0 - .14;
        if (t >= t0 + .6) { if (e.__dropped !== 1) { e.style.transform = ''; e.style.boxShadow = ''; e.__dropped = 1; } return; }
        e.__dropped = 0;
        let s, lift;
        if (t < a) { s = from; lift = 1; }
        else if (t < t0) { const k = easeInCubic(P(t, a, .14)); s = lerp(from, 1, k); lift = 1 - k; }
        else { const k = P(t, t0, .6); s = 1 - .006 * Math.sin(k * Math.PI) * (1 - k); lift = 0; }
        e.style.transform = `scale(${s.toFixed(4)})`;
        e.style.boxShadow = `0 ${24 + lift * 40}px ${40 + lift * 50}px -20px rgba(20,23,31,${(.35 - lift * .1).toFixed(3)}),0 0 0 1px #dfe2e8`;
      },
    };
  }

  /**
   * slapCrop(overlay, src, rect, t0, {rot}): a crop of a still (plate CSS px rect) that slaps onto the
   * plate like a sticky (scale 1.18, +8deg, spring settle, shadow tightens). For the deck stickies.
   */
  function slapCrop(overlay, src, r, t0, o = {}) {
    // an <img> child (decoding=sync, preloaded at build) rather than a CSS background, so the crop is
    // painted in the same frame it first shows
    const e = el('div', { style: `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;overflow:hidden;transform-origin:50% 40%` }, overlay);
    el('img', { attrs: { src, decoding: 'sync', alt: '' }, style: `position:absolute;left:${-r.x}px;top:${-r.y}px;width:1920px;height:1080px;max-width:none` }, e);
    return {
      el: e, render(t) {
        const a = t0 - .12;
        if (t < a) { e.style.display = 'none'; return; }
        e.style.display = '';
        const kin = easeInCubic(P(t, a, .12)), ks = P(t, t0, .55);
        const s = t < t0 ? lerp(1.18, 1, kin) : 1 - .035 * Math.sin(ks * Math.PI) * (1 - ks);
        const rr = t < t0 ? lerp(8, 0, kin) : 0, lift = t < t0 ? 1 - kin : 0;
        xf(e, { s, r: rr, o: Math.min(1, P(t, a, .06)) });
        e.style.filter = lift > .01 || t < t0 + .3 ? `drop-shadow(0 ${(4 + lift * 20).toFixed(1)}px ${(6 + lift * 16).toFixed(1)}px rgba(20,23,31,${(.25 * Math.max(lift, 1 - P(t, t0, .3))).toFixed(3)}))` : 'none';
      },
    };
  }

  /**
   * ruler(parent, {x0, x1, y, v0=.70, v1=1.00, ticks=[.7,.8,.9,1], size=22, width=4, t0, color='ink', fmt})
   * A marker ruler: the line draws, then ticks and their labels write on. -> {xOf(v), render(t), end}
   */
  function ruler(parent, o = {}) {
    const { x0, x1, y, v0 = .70, v1 = 1.0, size = 22, width = 4, t0 = 0, color = 'ink' } = o;
    const xOf = v => lerp(x0, x1, (v - v0) / (v1 - v0));
    const L = list();
    const line = L.add(markerPath(parent, `M${x0 - 8} ${y + 1} C ${lerp(x0, x1, .3)} ${y - 2}, ${lerp(x0, x1, .7)} ${y + 2}, ${x1 + 8} ${y - 1}`, { color, width, t0, dur: o.dur ?? .5, dry: false, out: o.out }));
    const tk = o.ticks || [.7, .8, .9, 1];
    tk.forEach((v, i) => {
      const x = xOf(v), tt = t0 + line.dur * (i / (tk.length - 1)) * .9;
      L.add(markerPath(parent, `M${x} ${y - size * .32} L ${x + .5} ${y + size * .32}`, { color, width: width * .8, t0: tt, dur: .12, dry: false, out: o.out }));
      L.add(handText(parent, (o.fmt || (q => q.toFixed(2)))(v), x, y + size * 1.55, { color: 'ink3', size, weight: 500, rot: 0, align: 'center', t0: tt + .05, dur: .2, out: o.out }));
    });
    return { xOf, render: L.render, end: t0 + line.dur };
  }

  /** world-size helper: px on screen at zoom z -> world px */
  const ws = (px, z) => px / z;

  window.KIT = { list, popper, note, ffStamp, flashRect, dashedArrow, stopwatch, roughRectD, lockD, plateDrop, slapCrop, ruler, ws, qpt };
})();

/* ---- camera helpers for the STAGE plate (S03-S11) ---- */
(function () {
  /** clampView(cam, b): keep the camera's view inside world bounds b {x0,y0,x1,y1} (centre it on an axis
   *  where the view is larger than the bounds). */
  function clampView(c, b) {
    const hw = W / 2 / c.z, hh = H / 2 / c.z, o = { ...c };
    o.x = (b.x1 - b.x0) <= 2 * hw ? (b.x0 + b.x1) / 2 : clamp(c.x, b.x0 + hw, b.x1 - hw);
    o.y = (b.y1 - b.y0) <= 2 * hh ? (b.y0 + b.y1) / 2 : clamp(c.y, b.y0 + hh, b.y1 - hh);
    return o;
  }
  /** STAGE framing that never shows the neighbouring cells: the view stays on the plate (a little board
   *  above/beside it, at most 110 px below it). mod: {zk, dx, dy} applied before the clamp; mod.top raises the top bound (118 keeps the stage's own caption bar out of shot). */
  function SF(what, t, opts = {}, mod = {}) {
    const R = REGIONS.STAGE;
    let c = window.STAGE_PLATE.frame(what, t, opts);
    c = { ...c, z: c.z * (mod.zk || 1), x: c.x + (mod.dx || 0), y: c.y + (mod.dy || 0) };
    return clampView(c, { x0: R.x - 20, x1: R.x + 1940, y0: R.y + (mod.top ?? -20), y1: R.y + 1190 });
  }
  /** fixSwath(root): make the last eraser swath in root match the board exactly (the board's sheen and
   *  gloss stripe are laid out over the whole board, so the swath uses the same layers, sized and offset
   *  to the board). wx, wy: root's world origin; x, y: the swath's position in root. */
  function fixSwath(root, wx, wy, x, y) {
    const s = [...root.querySelectorAll('.erase-swath')].pop(); if (!s) return;
    const px = -(wx + x), py = -(wy + y);
    s.style.backgroundImage = 'linear-gradient(112deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.28) 38%,rgba(255,255,255,0) 46%),radial-gradient(140% 90% at 12% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),var(--tex)';
    s.style.backgroundSize = `${BOARD.w}px ${BOARD.h}px,${BOARD.w}px ${BOARD.h}px,512px 512px`;
    s.style.backgroundPosition = `${px}px ${py}px,${px}px ${py}px,${px}px ${py}px`;
    s.style.backgroundRepeat = 'no-repeat,no-repeat,repeat';
  }
  /** tight(r): a wordRect range rect shrunk to the glyph band. Shantell Sans has a tall content area (about
   *  1.8 em), so a range rect spans into the neighbouring lines; keep its centre, halve its height. */
  const tight = r => r && ({ x: r.x, y: r.y + .25 * r.h, w: r.w, h: .5 * r.h });
  Object.assign(window.KIT, { clampView, SF, fixSwath, tight });
})();
