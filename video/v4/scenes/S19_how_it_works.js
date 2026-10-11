/* S19 · How it works, one idea per press (320-350 s). LIVE-SHOW segment on the COLD cell (not in the
 * 168 s film); it replaces the film's deck walk-through (116-127.4) and key-vector page (127.4-137.3) on
 * stage, which went by too fast to follow. Same cell rules as S18: nothing exists before 320, a clean-board
 * patch goes down at 320 over S01/S17/S18 (all still on this cell), and the root sits above them (z 50).
 * Two columns, read top to bottom, left then right; the camera pushes onto each beat, then pulls out:
 *  left  (Tanishk's laptop)  1 a message, a local model reads it   2 it becomes a claim with its source
 *                            3 one point in Qdrant Edge, three vectors; the key is never the value
 *  right (the comparison)    4 the email's claim syncs in through the hub (it only relays)
 *                            5 one search on the key, due dates only: 0.73 another job, 0.85 this pair, bar 0.82
 *                            6 above the bar + a different value -> conflict, same id on both, ask the owner
 * The scene ends on that close-up (no pull-out: the last stop has to be readable).
 * The similarities are bge-small cosines of the key texts, measured 11 Oct 2026 with the app's embedder:
 * "Sharma delivery due date" vs "Sharma wedding edit due date" 0.853, vs "Mehta reel cutdowns due date" 0.733.
 * Pure function of t; every element holds its final state after its moment (the live player holds on stops). */
(function () {
  const K = KIT, L = K.list();
  const START = 320, END = 350.0;
  const CX = REGIONS.COLD.x, CY = REGIONS.COLD.y;

  // camera: the whole cell, and a push onto each beat (kept inside the cell so no neighbour shows)
  const ZQ = 1.62;
  const Z1 = regionCam('COLD', 1.0);
  const BOUNDS = { x0: CX - 300, y0: CY - 300, x1: CX + 1912, y1: CY + 1074 };
  const qcam = (x, y, z = ZQ) => K.clampView({ x: CX + x, y: CY + y, z, r: 0 }, BOUNDS);
  const C1 = qcam(500, 300), C2 = qcam(520, 640), C3 = qcam(500, 900), C4 = qcam(1420, 330), C5 = qcam(1430, 680, 1.5), C6 = qcam(1430, 900);

  // stops (where each press ends and holds)
  const S1 = 325.0, S2 = 329.5, S3 = 335.0, S4 = 339.5, S5 = 345.5, S6 = END;   // END = 350.0
  // 1 · a message, a local model
  const T_HEAD = 320.3, T_STK1 = 321.3, T_ARR1 = 322.0, T_LAP = 322.35, T_LLM = 323.15, T_NOTE1 = 323.5;
  // 2 · a claim with its source
  const T_ARR2 = 325.75, T_CARD = 326.1, T_ROWS = [326.45, 326.75, 327.05, 327.35], T_NOTE2 = 327.75;
  // 3 · one point, three vectors
  const T_V = [330.45, 331.15, 331.85], T_NEVER = 332.65, T_PT = 333.45, T_EDGE = 333.75, T_NOTE3 = 334.05;
  // 4 · the email syncs in through the hub
  const T_HUB = 335.85, T_HUBL = 336.45, T_DASH = 336.85, T_STK2 = 337.35, T_KEY2 = 338.1;
  // 5 · the search and the bar
  const T_Q5 = 340.3, T_SUB5 = 341.0, T_RULER = 341.55, T_BAR = 342.15, T_GDOT = 342.8, T_GLBL = 343.0, T_RROLL = 343.75, T_RLBL = 344.3, T_HATCH = 344.35;
  // 6 · conflict, same id, ask the owner
  const T_V6 = 346.3, T_CF = 347.15, T_ID = 347.9, T_ASK = 349.05;

  const css = `
.s19-chip{position:absolute;display:flex;align-items:center;gap:8px;font:700 24px/1 var(--ui);color:#3a2a12;background:linear-gradient(180deg,#ead0a0,#e2c08a 45%,#c9a165);padding:10px 13px 11px;border-radius:8px;white-space:nowrap;box-shadow:0 5px 9px -6px rgba(20,23,31,.5);transform-origin:50% 60%}
.s19-chip svg{flex:none;display:block}
.s19-card{position:absolute;width:580px;background:#fff;border-radius:14px;font-family:var(--ui);color:#14171f;box-shadow:0 22px 38px -20px rgba(20,23,31,.38),0 0 0 1px #dfe2e8;padding:20px 26px 18px;transform-origin:50% 30%}
.s19-card .tape{z-index:5}
.s19-kick{font:700 19px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:#656b7a;margin-bottom:12px}
.s19-row{display:grid;grid-template-columns:118px 1fr;align-items:baseline;gap:12px;padding:5px 0;border-top:1px solid #eef0f3}
.s19-row span{font:600 20px/1.2 var(--ui);letter-spacing:.06em;text-transform:uppercase;color:#656b7a}
.s19-row b{font:700 30px/1.2 var(--ui);color:#14171f}
.s19-row b.src{font-weight:600;font-size:25px;color:#3b4150}
.s19-vec{position:absolute;display:flex;align-items:center;gap:14px;height:62px;padding:0 18px;border-radius:12px;background:#fff;box-shadow:0 12px 20px -14px rgba(20,23,31,.45),0 0 0 1px #dfe2e8;font:600 25px/1 var(--ui);color:#3b4150;white-space:nowrap;transform-origin:0 50%}
.s19-vec i{font-style:normal;font:700 19px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:#656b7a;width:118px;flex:none}
.s19-vec.key{box-shadow:0 12px 20px -14px rgba(20,23,31,.45),0 0 0 3px #1f4fd8;color:#14171f}
.s19-vec.key i{color:#1f4fd8}
.s19-bars{display:flex;align-items:center;gap:5px;height:40px}
.s19-bars u{display:block;width:9px;border-radius:2px;background:#1f4fd8;text-decoration:none}
.s19-tok{display:inline-block;padding:6px 10px;border-radius:7px;background:#eef0f3;font:600 23px/1 var(--ui);color:#3b4150}
.s19-dot{position:absolute;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 6px rgba(20,23,31,.3)}
`;
  const SVG_DB = '<svg width="17" height="21" viewBox="0 0 16 20"><ellipse cx="8" cy="4" rx="6.5" ry="2.8" fill="none" stroke="#3a2a12" stroke-width="2"/><path d="M1.5 4 v12 c0 3.7 13 3.7 13 0 v-12 M1.5 10 c0 3.7 13 3.7 13 0" fill="none" stroke="#3a2a12" stroke-width="2"/></svg>';
  const SVG_CHIP = '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="#3a2a12" stroke-width="2"/><path d="M8 1v3M12 1v3M8 16v3M12 16v3M1 8h3M1 12h3M16 8h3M16 12h3" stroke="#3a2a12" stroke-width="2"/></svg>';

  // ---------------------------------------------------------------- helpers (as S18)
  const rrD = (x0, y0, x1, y1, r) => `M${x0 + r} ${y0} L ${x1 - r} ${y0} Q ${x1} ${y0}, ${x1} ${y0 + r} L ${x1} ${y1 - r} Q ${x1} ${y1}, ${x1 - r} ${y1} L ${x0 + r} ${y1} Q ${x0} ${y1}, ${x0} ${y1 - r} L ${x0} ${y0 + r} Q ${x0} ${y0}, ${x0 + r} ${y0}`;
  const laptopDs = (x0, x1, y0, y1, ov = 22) => [
    rrD(x0, y0, x1, y1, 16),
    `M${x0 - ov} ${y1 + 4} L ${x1 + ov} ${y1 + 4} L ${x1 + ov * 2.4} ${y1 + 36} L ${x0 - ov * 2.4} ${y1 + 36} Z`,
    `M${(x0 + x1) / 2 - 40} ${y1 + 22} L ${(x0 + x1) / 2 + 40} ${y1 + 22}`,
  ];
  function dashQ(parent, a, c, b, o = {}) {
    const n = o.n ?? 9, ds = [];
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = k0 + .55 / n, p0 = K.qpt(a, c, b, k0), p1 = K.qpt(a, c, b, k1);
      ds.push(`M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`);
    }
    if (o.head) {
      const tx = b[0] - c[0], ty = b[1] - c[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hs = o.head;
      ds.push(`M${(b[0] - ux * hs + uy * hs * .6).toFixed(1)} ${(b[1] - uy * hs - ux * hs * .6).toFixed(1)} L ${b[0]} ${b[1]} L ${(b[0] - ux * hs - uy * hs * .6).toFixed(1)} ${(b[1] - uy * hs + ux * hs * .6).toFixed(1)}`);
    }
    return strokeSeq(parent, ds, { color: o.color || 'blue', width: o.width ?? 4.5, t0: o.t0, durEach: o.durEach ?? .03, gap: .01, dry: false });
  }
  /** a DOM element that pops in at t0 (hidden before) */
  function popIn(e, t0, o = {}) {
    return {
      el: e, render(t) {
        if (t < t0) { e.style.display = 'none'; return; }
        e.style.display = '';
        const k = spring(P(t, t0, o.d ?? .45), 6.5, 1.5);
        xf(e, { s: lerp(o.from ?? .7, 1, k), r: o.r || 0, o: Math.min(1, P(t, t0, .08)) });
      },
    };
  }
  /** a DOM element that rises in at t0 (hidden before) */
  function riseIn(e, t0, o = {}) {
    return {
      el: e, render(t) {
        if (t < t0) { e.style.display = 'none'; return; }
        e.style.display = '';
        show(e, t, t0, o.d ?? .4, { dy: o.dy ?? 14, dx: o.dx ?? 0, ease: easeOutCubic });
      },
    };
  }
  function offsetIn(e, root) { let x = 0, y = 0, n = e; while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: e.offsetWidth, h: e.offsetHeight }; }
  const centre = (e, cx, cy) => { e.style.left = `${cx - e.offsetWidth / 2}px`; e.style.top = `${cy - e.offsetHeight / 2}px`; };

  // the ruler (beat 5): 0.70 .. 1.00
  const RY = 772, RX0 = 1030, RX1 = 1830, xOf = v => lerp(RX0, RX1, (v - .70) / .30);
  const V_OTHER = .733, V_PAIR = .853;
  let R = {};

  Scene({
    id: 'S19', start: START, end: END, region: 'COLD', z: 50,
    camera: [
      [320.0, Z1],
      [320.9, Z1, 'linear'],
      [321.7, C1, 'easeInOutCubic'],
      [S1, { ...C1, z: C1.z * 1.01 }, 'easeInOutSine'],
      [S1 + .75, C2, 'easeInOutCubic'],
      [S2, { ...C2, z: C2.z * 1.01 }, 'easeInOutSine'],
      [S2 + .75, C3, 'easeInOutCubic'],
      [S3, { ...C3, z: C3.z * 1.01 }, 'easeInOutSine'],
      [S3 + .8, C4, 'easeInOutCubic'],
      [S4, { ...C4, z: C4.z * 1.01 }, 'easeInOutSine'],
      [S4 + .75, C5, 'easeInOutCubic'],
      [S5, { ...C5, z: C5.z * 1.01 }, 'easeInOutSine'],
      [S5 + .75, C6, 'easeInOutCubic'],
      [END, { ...C6, z: C6.z * 1.008 }, 'easeInOutSine'],
    ],
    shakes: [[T_STK1, 2, .25], [T_CARD, 2, .2], [T_STK2, 2, .25], [T_CF, 3, .3], [T_ASK, 2, .25]],

    build(root, S) {
      if (!document.getElementById('s19-css')) { const st = document.createElement('style'); st.id = 's19-css'; st.textContent = css; document.head.appendChild(st); }
      // Same guard as S16/S18 (shared flag, so it wraps once): S15's paper fade must not cover show-only scenes.
      if (!Q.__s16guard) { const orig = Q.setFade; Q.setFade = v => { if (Q.t > 168.5) return; orig(v); }; Q.__s16guard = true; }

      // A clean-board patch under everything, from the first frame after 320 (S01, S17 and S18 all hold
      // their final drawings on this cell).
      L.add(eraser(root, { x: -40, y: -20, w: 2000, h: 1120, t0: START - .01, dur: .001, worldX: S.region.x, worldY: S.region.y }));   // down before the first frame the player shows
      K.fixSwath(root, S.region.x, S.region.y, -40, -20);
      root.querySelectorAll('.erase-swath, .erase-block').forEach(e => { e.style.zIndex = 0; });
      const G = el('div', { style: 'left:0;top:0;width:0;height:0' }, root);

      /* ================= heading ================= */
      const head = L.add(handText(G, 'How it works', 70, 112, { color: 'ink', size: 72, weight: 700, t0: T_HEAD, dur: .8, rot: -1.5 }));
      L.add(markerUnderline(G, 74, 74 + head.el.offsetWidth - 16, 134, { color: 'blue', width: 6, wave: 5, t0: T_HEAD + .85, dur: .35 }));

      /* ================= 1 · a message; a local model reads it ================= */
      L.add(sticky(G, { x: 250, y: 330, w: 380, color: 'yellow', rot: -3, t0: T_STK1, size: 32, from: { dx: -40, dy: -30 },
        html: 'Client just called:<br>Sharma delivery<br>moves to the 18th.', meta: 'call · Tanishk' }));
      L.add(markerArrow(G, [462, 318], [548, 316], { color: 'ink', width: 4.5, head: 16, bend: .12, t0: T_ARR1 }));
      const LP = [600, 860, 222, 392];
      L.add(strokeSeq(G, laptopDs(...LP), { color: 'ink', width: 5, t0: T_LAP, durEach: .26, gap: .03, dry: false }));
      const llm = el('div', { cls: 's19-chip', html: SVG_CHIP + 'llama3.2' }, G);
      centre(llm, (LP[0] + LP[1]) / 2, (LP[2] + LP[3]) / 2);
      L.add(popIn(llm, T_LLM, { r: -2 }));
      L.add(handText(G, 'a local model reads it', 732, 466, { color: 'blue', size: 32, weight: 700, t0: T_NOTE1, dur: .7, rot: -1.5, align: 'center' }));
      L.add(handText(G, 'on the laptop · no cloud', 732, 506, { color: 'blue', size: 30, weight: 600, t0: T_NOTE1 + .75, dur: .6, rot: -1.5, align: 'center' }));

      /* ================= 2 · a claim with its source ================= */
      L.add(markerArrow(G, [650, 530], [600, 566], { color: 'ink', width: 4.5, head: 15, bend: -.2, t0: T_ARR2 }));
      const card = R.card = el('div', { cls: 's19-card', style: 'left:52px;top:540px' }, G);
      el('i', { cls: 'tape', style: 'left:-18px;top:-6px;transform:rotate(-26deg)' }, card);
      el('i', { cls: 'tape', style: 'right:-18px;top:-6px;transform:rotate(24deg)' }, card);
      el('div', { cls: 's19-kick', text: 'a claim' }, card);
      R.rows = [['about', 'Sharma delivery'], ['fact', 'due date'], ['value', '18 Oct'], ['source', 'call · Tanishk · 3 Oct']]
        .map(([k, v], i) => el('div', { cls: 's19-row', html: `<span>${k}</span><b${i === 3 ? ' class="src"' : ''}>${v}</b>` }, card));
      const cardR = offsetIn(card, root);
      L.add(handText(G, 'every fact keeps', 668, cardR.y + 92, { color: 'blue', size: 32, weight: 700, t0: T_NOTE2, dur: .55, rot: -2 }));
      L.add(handText(G, 'where it came from', 668, cardR.y + 134, { color: 'blue', size: 32, weight: 700, t0: T_NOTE2 + .6, dur: .6, rot: -2 }));
      const src = offsetIn(R.rows[3].querySelector('b'), root);
      L.add(markerArrow(G, [748, cardR.y + 160], [src.x + src.w + 8, src.y + src.h / 2], { color: 'blue', width: 4, head: 14, bend: .25, t0: T_NOTE2 + 1.2 }));

      /* ================= 3 · one point in Qdrant Edge, three vectors ================= */
      const vy = [836, 904, 972];
      const vMean = el('div', { cls: 's19-vec', html: '<i>meaning</i>' }, G);
      const bars = el('div', { cls: 's19-bars' }, vMean);
      for (let i = 0; i < 22; i++) el('u', { style: `height:${(8 + 30 * rand(i, 19)).toFixed(0)}px;opacity:${(.35 + .65 * rand(i, 23)).toFixed(2)}` }, bars);
      const vKw = el('div', { cls: 's19-vec', html: '<i>keywords</i><span class="s19-tok">sharma</span><span class="s19-tok">delivery</span><span class="s19-tok">18th</span>' }, G);
      const vKey = R.vKey = el('div', { cls: 's19-vec key', html: '<i>key</i>Sharma delivery · due date' }, G);
      [vMean, vKw, vKey].forEach((e, i) => { e.style.left = '60px'; e.style.top = `${vy[i] - 31}px`; L.add(riseIn(e, T_V[i], { dx: -18, dy: 0 })); });
      const kR = offsetIn(vKey, root);
      // "never the value": a struck 18 Oct under the key
      const ny = kR.y + kR.h + 46, nx = kR.x + 132;
      const nv = L.add(handText(G, '18 Oct', nx, ny, { color: 'ink3', size: 30, weight: 600, t0: T_NEVER, dur: .3, rot: 0 }));
      const nvw = nv.el.offsetWidth;
      L.add(markerSlash(G, nx - 6, ny - 8, nx + nvw + 6, ny - 18, { color: 'red', width: 4.5, t0: T_NEVER + .35, dur: .2 }));
      L.add(handText(G, 'never the value', nx + nvw + 22, ny, { color: 'red', size: 30, weight: 700, t0: T_NEVER + .5, dur: .5, rot: -1.5 }));
      // a brace from the three vectors to the Qdrant Edge chip: one point
      const bx = 700;
      L.add(markerPath(G, `M${bx - 26} ${vy[0] - 30} Q ${bx} ${vy[0] - 26}, ${bx} ${vy[0] + 20} L ${bx} ${vy[1] - 12} Q ${bx} ${vy[1]}, ${bx + 18} ${vy[1]} Q ${bx} ${vy[1]}, ${bx} ${vy[1] + 12} L ${bx} ${vy[2] - 20} Q ${bx} ${vy[2] + 26}, ${bx - 26} ${vy[2] + 30}`,
        { color: 'ink', width: 4.5, t0: T_PT, dur: .35 }));
      const edge = el('div', { cls: 's19-chip', html: SVG_DB + 'Qdrant Edge' }, G);
      centre(edge, 868, vy[1]);
      L.add(popIn(edge, T_EDGE, { r: 2 }));
      L.add(handText(G, 'on the laptop', 868, vy[1] + 64, { color: 'blue', size: 28, weight: 700, t0: T_NOTE3, dur: .6, rot: -2, align: 'center' }));

      /* ================= 4 · the email syncs in through the hub ================= */
      const HB = [1636, 1806, 196, 300];
      L.add(strokeSeq(G, [
        rrD(HB[0], HB[2], HB[1], HB[3], 10),
        `M${HB[0] + 22} ${HB[2] + 34} L ${HB[1] - 22} ${HB[2] + 34}`,
        `M${HB[0] + 22} ${HB[2] + 62} L ${HB[1] - 50} ${HB[2] + 62}`,
      ], { color: 'ink', width: 5, t0: T_HUB, durEach: .22, gap: .03, dry: false }));
      L.add(markerPath(G, `M${HB[1] - 33} ${HB[2] + 62} L ${HB[1] - 32} ${HB[2] + 62}`, { color: 'green', width: 8, t0: T_HUB + .7, dur: .12, dry: false }));
      L.add(handText(G, 'team hub', (HB[0] + HB[1]) / 2, HB[3] + 44, { color: 'ink', size: 30, weight: 700, t0: T_HUBL, dur: .35, rot: -1, align: 'center' }));
      L.add(handText(G, 'only relays', (HB[0] + HB[1]) / 2, HB[3] + 82, { color: 'ink3', size: 28, weight: 600, t0: T_HUBL + .4, dur: .35, rot: -1, align: 'center' }));
      L.add(dashQ(G, [HB[0] - 16, 248], [1520, 214], [1426, 236], { n: 5, head: 16, width: 4.5, t0: T_DASH }));
      L.add(sticky(G, { x: 1230, y: 296, w: 400, color: 'blue', rot: 3, t0: T_STK2, size: 30, from: { dx: 60, dy: -40 },
        html: 'Confirming final<br>delivery of the<br>Sharma wedding edit<br>on 16 October.', meta: 'email · Rohit Sharma → Lakshya' }));
      const key2 = el('div', { cls: 's19-vec key', html: '<i>key</i>Sharma wedding edit · due date' }, G);
      key2.style.left = '1040px'; key2.style.top = '466px';
      L.add(riseIn(key2, T_KEY2, { dx: -18, dy: 0 }));

      /* ================= 5 · one search on the key; the bar ================= */
      L.add(handText(G, 'How alike are the two keys?', RX0 - 6, 588, { color: 'ink', size: 40, weight: 700, t0: T_Q5, dur: .65, rot: -1 }));
      L.add(handText(G, 'one Qdrant search on the key · due dates only', RX0 - 4, 628, { color: 'ink3', size: 27, weight: 600, t0: T_SUB5, dur: .6, rot: -1 }));
      L.add(K.ruler(G, { x0: RX0, x1: RX1, y: RY, size: 24, width: 5, t0: T_RULER, dur: .5 }));
      const xt = xOf(.82);
      L.add(markerPath(G, `M${xt} ${RY - 34} L ${xt + 1} ${RY + 26}`, { color: 'blue', width: 6, t0: T_BAR, dur: .2, dry: false }));
      L.add(handText(G, '0.82 · the bar', xt, RY + 84, { color: 'blue', size: 28, weight: 700, t0: T_BAR + .1, dur: .3, rot: -1, align: 'center' }));
      const hatch = [];
      for (let x = xt + 18; x < RX1 - 4; x += 30) hatch.push(`M${x} ${RY - 8} L ${x + 18} ${RY - 32}`);
      L.add(strokeSeq(G, hatch, { color: 'blue', width: 3, opacity: .45, t0: T_HATCH, durEach: .022, gap: .004, dry: false }));
      R.gdot = el('div', { cls: 's19-dot', style: `left:${xOf(V_OTHER) - 15}px;top:${RY - 15}px;width:30px;height:30px;background:${COL.ink3};z-index:4` }, G);
      L.add(handText(G, '0.73 · another job', xOf(V_OTHER), RY - 44, { color: 'ink3', size: 28, weight: 600, t0: T_GLBL, dur: .55, rot: -1.5, align: 'center' }));
      R.rdot = el('div', { cls: 's19-dot', style: `left:-17px;top:${RY - 17}px;width:34px;height:34px;background:${COL.red};z-index:5` }, G);
      const lbl = el('div', { cls: 'hand', text: '0.85 · same job', style: `left:${xOf(V_PAIR)}px;top:${RY - 92}px;font-size:36px;font-weight:700;color:${COL.red};transform-origin:50% 100%` }, G);
      lbl.style.marginLeft = `${-lbl.offsetWidth / 2}px`;
      L.add(K.popper(lbl, T_RLBL, { d: .45, from: .4, r: -2 }));

      /* ================= 6 · a conflict; the same id on both; ask the owner ================= */
      L.add(handText(G, 'above the bar, and 18 Oct ≠ 16 Oct', 1030, 912, { color: 'ink', size: 32, weight: 700, t0: T_V6, dur: .8, rot: -1 }));
      L.add(handText(G, '→ a conflict', 1030, 966, { color: 'red', size: 46, weight: 700, t0: T_CF, dur: .45, rot: -2 }));
      L.add(handText(G, 'both laptops find it on their own:', 1030, 1016, { color: 'ink2', size: 28, weight: 600, t0: T_ID, dur: .6, rot: -1 }));
      L.add(handText(G, 'same id, a hash of the two claims', 1030, 1052, { color: 'ink2', size: 28, weight: 600, t0: T_ID + .65, dur: .6, rot: -1 }));
      L.add(sticky(G, { x: 1752, y: 978, w: 270, h: 160, color: 'yellow', rot: 4, t0: T_ASK, size: 32, html: 'Ask the owner:<br><b style="font-weight:700">Tanishk</b>' }));

      // reset to the pre-entrance state (render() owns everything from here on)
      card.style.display = 'none';
    },

    render(t) {
      /* ---- the claim card: pinned at T_CARD, rows in order ---- */
      const card = R.card, a = T_CARD - .14;
      if (t < a) card.style.display = 'none';
      else {
        card.style.display = '';
        const kin = easeInCubic(P(t, a, .14)), ks = P(t, T_CARD, .5);
        const s = t < T_CARD ? lerp(1.06, 1, kin) : 1 - .012 * Math.sin(ks * Math.PI) * (1 - ks);
        const lift = t < T_CARD ? 1 - kin : 0;
        xf(card, { y: -24 * lift, s, r: lift * 2, o: Math.min(1, P(t, a, .06)) });
        R.rows.forEach((r, i) => {
          const k = t >= T_ROWS[i] ? easeOutCubic(P(t, T_ROWS[i], .3)) : 0;
          r.style.opacity = k.toFixed(3); r.style.transform = `translateX(${((1 - k) * -12).toFixed(1)}px)`;
        });
      }
      /* ---- the grey dot drops in; the red dot rolls 0.70 -> 0.853 ---- */
      const g = R.gdot;
      g.style.display = t >= T_GDOT ? '' : 'none';
      const bounce = t < T_GDOT + .1 ? -60 * (1 - easeInCubic(P(t, T_GDOT, .1))) : -10 * Math.abs(Math.sin(P(t, T_GDOT + .1, .35) * Math.PI)) * (1 - P(t, T_GDOT + .1, .35));
      g.style.transform = `translateY(${bounce.toFixed(1)}px)`; g.style.opacity = Math.min(1, P(t, T_GDOT, .25) * 4).toFixed(3);
      const r = R.rdot;
      r.style.display = t >= T_RROLL - .15 ? '' : 'none';
      const v = keyframes(t, [[T_RROLL, .70], [T_RROLL + .5, V_PAIR, easeInOutCubic]]) + (t > T_RROLL + .5 ? .005 * Math.sin(P(t, T_RROLL + .5, .3) * Math.PI * 2) * (1 - P(t, T_RROLL + .5, .3)) : 0);
      const x = xOf(v);
      r.style.transform = `translateX(${x.toFixed(1)}px) rotate(${((x - RX0) * 1.6).toFixed(1)}deg)`;
      r.style.opacity = Math.min(1, P(t, T_RROLL - .15, .1)).toFixed(3);
      L.render(t);
    },
  });

  /* ---- live-show player: stop points (t = where each step ends and holds) and sound cues ---- */
  window.SHOW_STOPS = window.SHOW_STOPS || {};
  // (literal times, the same as S1..S6 above: tools read this list on its own)
  window.SHOW_STOPS.S19 = [
    { t: 325.0, title: 'How it works: a message', say: '"How it works. The client calls Tanishk: the Sharma delivery moves to the 18th. A local model on his laptop reads it. No cloud."' },
    { t: 329.5, title: 'It becomes a claim', say: '"It becomes a claim: what it’s about, the kind of fact, the value, and where it came from. Every fact keeps its source."' },
    { t: 335.0, title: 'One point, three vectors', say: '"Each claim is one point in Qdrant Edge, on the laptop, with three vectors: its meaning, its keywords, and a key. The key is only what it’s about, never the value."' },
    { t: 339.5, title: 'The email syncs in', say: '"Lakshya’s email, the 16th, reaches Tanishk’s laptop through the team hub. The hub only relays."' },
    { t: 345.5, title: 'The 0.82 bar', say: '"Now one Qdrant search on the key, due dates only. How alike are the two keys? Another job’s deadline scores 0.73. This pair scores 0.85. Our bar is 0.82."' },
    { t: 350.0, title: 'A conflict: ask the owner', say: '"Above the bar with a different value: that’s a conflict. Both laptops find it on their own and give it the same ID, a hash of the two claims. Then it asks the owner."' },
  ];
  window.SHOW_SFX = window.SHOW_SFX || {};
  window.SHOW_SFX.S19 = [
    // 1
    [T_HEAD, 'marker_squeak'], [T_HEAD + .85, 'marker_squeak'], [320.95, 'paper_whoosh'], [T_STK1, 'sticky_slap'], [T_ARR1, 'marker_squeak'],
    [T_LAP, 'marker_squeak'], [T_LLM, 'ui_pop'], [T_NOTE1, 'marker_squeak'], [T_NOTE1 + .75, 'marker_squeak'],
    // 2
    [S1 + .05, 'paper_whoosh'], [T_ARR2, 'marker_squeak'], [T_CARD, 'sticky_slap'], ...T_ROWS.map(x => [x, 'ui_pop']), [T_NOTE2, 'marker_squeak'], [T_NOTE2 + 1.2, 'marker_squeak'],
    // 3
    [S2 + .05, 'paper_whoosh'], ...T_V.map(x => [x, 'ui_pop']), [T_NEVER, 'marker_squeak'], [T_NEVER + .35, 'marker_squeak'],
    [T_PT, 'marker_squeak'], [T_EDGE, 'ui_pop'], [T_NOTE3, 'marker_squeak'],
    // 4
    [S3 + .05, 'paper_whoosh'], [T_HUB, 'marker_squeak'], [T_HUBL, 'marker_squeak'], [T_DASH, 'sync_whoosh'], [T_STK2, 'sticky_slap'], [T_KEY2, 'ui_pop'],
    // 5
    [S4 + .05, 'paper_whoosh'], [T_Q5, 'marker_squeak'], [T_SUB5, 'marker_squeak'], [T_RULER, 'marker_squeak'], [T_BAR, 'marker_squeak'],
    [T_GDOT + .1, 'counter_tick'], [T_GLBL, 'marker_squeak'], [T_RROLL, 'counter_tick'], [T_RLBL, 'ui_pop'], [T_HATCH, 'marker_squeak'],
    // 6
    [S5 + .05, 'paper_whoosh'], [T_V6, 'marker_squeak'], [T_CF, 'alert_chime'], [T_ID, 'marker_squeak'], [T_ID + .65, 'marker_squeak'],
    [T_ASK, 'sticky_slap'],
  ].map(([t, type]) => [+t.toFixed(2), type]);
})();
