/* S18 · Where it goes next (280-304 s). LIVE-SHOW segment on the COLD cell (not in the 168 s film).
 * The cell is shared: S01 draws here at 0-16 and S17 at 240-262, both erase themselves back to a clean
 * board, so nothing of S18 exists before 280 (every component's t0 >= 280). The root sits at z 45 so the
 * earlier scenes' eraser swaths (they stay on the board) can't cover it.
 * S02's title lockup stays in this cell for good, so a clean-board patch (an instant eraser swath) goes
 * down at the first frame after 280: invisible after S17's own wipe, and S18 is still clean without S17.
 * A 2x2 roadmap under a handwritten heading, read in order 1 2 / 3 4; the camera pushes onto each item:
 *  1 (280-285.5)   a native app, built in Rust: phone + laptop outlines, each with a "Qdrant Edge" chip
 *  2 (285.5-291.5) assistants on Discord: Lakshya's Quorum asks @Tanishk, he picks 18 Oct, his Quorum replies
 *  3 (291.5-297.5) after a call: "voice call ended" pill, a sticky of the decisions drafted from the call
 *  4 (297.5-304)   two real laptops in airplane mode + the hub on a small home server; pull out, a blue
 *                  dashed route ties 1 -> 2 -> 3 -> 4, and a "now -> next" sticky
 * Pure function of t; every element holds its final state after its moment (the live player holds on stops). */
(function () {
  const K = KIT, L = K.list();
  const START = 280, END = 304;
  const CX = REGIONS.COLD.x, CY = REGIONS.COLD.y;
  const W2 = p => ({ x: CX + p.x, y: CY + p.y });   // region-local -> world

  // camera: the whole cell, and a push onto each quadrant (kept inside the cell so no neighbour shows)
  const ZQ = 1.6;
  const Z1 = regionCam('COLD', 1.0);
  const BOUNDS = { x0: CX - 300, y0: CY - 300, x1: CX + 1912, y1: CY + 1074 };
  const qcam = (x, y) => K.clampView({ x: CX + x, y: CY + y, z: ZQ, r: 0 }, BOUNDS);
  const C1 = qcam(470, 360), C2 = qcam(1440, 380), C3 = qcam(470, 860), C4 = qcam(1440, 860);

  // step 1
  const T_HEAD = 280.3, T_B1 = 281.65, T_PHONE = 282.45, T_LAP1 = 282.95, T_CHIP = [283.55, 284.05], T_NOTE1 = 284.0;
  // step 2
  const T_B2 = 285.8, T_CARD = 286.6, T_MSG1 = 287.0, T_RX = [287.5, 287.62], T_PICK = 288.3, T_MSG2 = 289.0, T_NOTE2 = 289.65, T_ARR2 = 290.6;
  // step 3
  const T_B3 = 291.8, T_PILL = 293.1, T_ARR3 = 293.8, T_STK = 294.6, T_UND3 = 295.35;
  // step 4
  const T_B4 = 297.8, T_LA = 298.85, T_LB = 299.2, T_AIR = [299.75, 300.05], T_SRV = 300.0, T_SRVL = 300.55, T_LINK = 300.75, T_NOTE4 = 301.05;
  const T_PULL0 = 301.95, T_PULL1 = 302.7, T_PATH = [302.55, 302.75, 303.0], T_NN = 303.35;

  const css = `
.s18-chip{position:absolute;display:flex;align-items:center;gap:8px;font:700 22px/1 var(--ui);color:#3a2a12;background:linear-gradient(180deg,#ead0a0,#e2c08a 45%,#c9a165);padding:9px 12px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 5px 9px -6px rgba(20,23,31,.5);transform-origin:50% 60%}
.s18-chip svg{flex:none;display:block}
.s18-dc{position:absolute;width:700px;background:#fff;border:1px solid #dfe2e8;border-radius:14px;font-family:var(--ui);color:#313338;box-shadow:0 24px 40px -20px rgba(20,23,31,.35),0 0 0 1px #dfe2e8;transform-origin:50% 30%}
.s18-dc .tape{z-index:5}
.s18-dchead{height:58px;display:flex;align-items:center;gap:10px;padding:0 22px;border-top:7px solid #5865F2;border-bottom:2px solid #e3e5e8;border-radius:13px 13px 0 0;font-size:26px;font-weight:700;color:#060607}
.s18-hash{color:#80848e;font-weight:500;font-size:34px;margin-top:-3px}
.s18-msg{display:flex;gap:16px;padding:14px 22px 4px}
.s18-msg:last-child{padding-bottom:18px}
.s18-av{width:54px;height:54px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font:800 28px/1 var(--ui);color:#14171f;letter-spacing:-.04em}
.s18-nm{font-size:24px;font-weight:700;display:flex;align-items:center;gap:9px;line-height:1.15;color:#060607}
.s18-bot{font:700 22px/1 var(--ui);padding:3px 7px 3px;border-radius:5px;background:#5865F2;color:#fff;letter-spacing:.02em}
.s18-tx{font-size:24px;line-height:1.32;margin-top:3px;color:#313338}
.s18-men{background:#e6e8fd;color:#4752c4;border-radius:4px;padding:0 3px;font-weight:600}
.s18-rxs{display:flex;gap:10px;margin-top:10px}
.s18-rx{display:flex;align-items:center;gap:8px;height:42px;padding:0 13px;border-radius:9px;background:#f2f3f5;border:2px solid #e3e5e8;font-size:22px;font-weight:600;color:#4e5058;transform-origin:50% 50%}
.s18-rx.on{background:#e6e8fd;border-color:#5865F2;color:#3c45a5}
.s18-rx b{font-weight:700;min-width:12px;margin-left:2px}
.s18-pill{position:absolute;display:flex;align-items:center;gap:14px;height:62px;padding:0 24px 0 10px;border-radius:31px;background:#fff;border:1px solid #dfe2e8;font:600 24px/1 var(--ui);color:#3b4150;white-space:nowrap;box-shadow:0 14px 22px -14px rgba(20,23,31,.45);transform-origin:20% 50%}
.s18-spk{width:44px;height:44px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;flex:none}
`;
  const SVG_DB = '<svg width="16" height="20" viewBox="0 0 16 20"><ellipse cx="8" cy="4" rx="6.5" ry="2.8" fill="none" stroke="#3a2a12" stroke-width="2"/><path d="M1.5 4 v12 c0 3.7 13 3.7 13 0 v-12 M1.5 10 c0 3.7 13 3.7 13 0" fill="none" stroke="#3a2a12" stroke-width="2"/></svg>';
  const SVG_SPK = '<svg width="26" height="24" viewBox="0 0 26 24"><path d="M2 8 h5 l7 -6 v20 l-7 -6 h-5 z" fill="#fff"/><path d="M18 7 q3 5 0 10 M21.5 4 q5.5 8 0 16" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- helpers
  /** rounded-rect path */
  const rrD = (x0, y0, x1, y1, r) => `M${x0 + r} ${y0} L ${x1 - r} ${y0} Q ${x1} ${y0}, ${x1} ${y0 + r} L ${x1} ${y1 - r} Q ${x1} ${y1}, ${x1 - r} ${y1} L ${x0 + r} ${y1} Q ${x0} ${y1}, ${x0} ${y1 - r} L ${x0} ${y0 + r} Q ${x0} ${y0}, ${x0 + r} ${y0}`;
  /** marker laptop: screen, base, trackpad slit */
  const laptopDs = (x0, x1, y0, y1, ov = 26) => [
    rrD(x0, y0, x1, y1, 18),
    `M${x0 - ov} ${y1 + 4} L ${x1 + ov} ${y1 + 4} L ${x1 + ov * 2.4} ${y1 + 40} L ${x0 - ov * 2.4} ${y1 + 40} Z`,
    `M${(x0 + x1) / 2 - 46} ${y1 + 26} L ${(x0 + x1) / 2 + 46} ${y1 + 26}`,
  ];
  /** marker phone: body, speaker slit, home bar */
  const phoneDs = (x0, x1, y0, y1) => [
    rrD(x0, y0, x1, y1, 30),
    `M${(x0 + x1) / 2 - 22} ${y0 + 22} L ${(x0 + x1) / 2 + 22} ${y0 + 22}`,
    `M${(x0 + x1) / 2 - 34} ${y1 - 20} L ${(x0 + x1) / 2 + 34} ${y1 - 20}`,
  ];
  /** airplane glyph (top view, nose up-right like the airplane-mode icon), size s around (cx, cy) */
  function airplaneDs(cx, cy, s, rot = 45) {
    const a = rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const p = (x, y) => `${(cx + (x * cs - y * sn) * s).toFixed(1)} ${(cy + (x * sn + y * cs) * s).toFixed(1)}`;
    return [
      `M${p(0, -1)} L ${p(0, .95)}`,                                  // fuselage
      `M${p(-1, .2)} L ${p(0, -.32)} L ${p(1, .2)}`,                  // wings
      `M${p(-.42, 1.02)} L ${p(0, .76)} L ${p(.42, 1.02)}`,           // tail
    ];
  }
  /** dashed marker line a -> b through control c (quadratic), with an optional arrow head */
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
  /** solid marker arrow a -> b through control c (quadratic): shaft, then head */
  function arrowQ(parent, a, c, b, o = {}) {
    const f = v => v.toFixed(1), hs = o.head ?? 15;
    const tx = b[0] - c[0], ty = b[1] - c[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    return strokeSeq(parent, [
      `M${f(a[0])} ${f(a[1])} Q ${f(c[0])} ${f(c[1])}, ${f(b[0])} ${f(b[1])}`,
      `M${f(b[0] - ux * hs + uy * hs * .6)} ${f(b[1] - uy * hs - ux * hs * .6)} L ${f(b[0])} ${f(b[1])} L ${f(b[0] - ux * hs - uy * hs * .6)} ${f(b[1] - uy * hs + ux * hs * .6)}`,
    ], { color: o.color || 'blue', width: o.width ?? 4.5, t0: o.t0, gap: .02 });
  }
  /** handwritten lines written one after another; -> end time */
  function lines(parent, arr, x, y, o = {}) {
    let t = o.t0;
    arr.forEach((s, i) => {
      const d = o.dur ?? clamp(s.length / (o.cps ?? 50), .18, .5);
      L.add(handText(parent, s, x + (o.indent || 0) * i, y + i * (o.lh ?? o.size * 1.18), { color: o.color || 'blue', size: o.size, weight: o.weight ?? 600, t0: t, dur: d, rot: o.rot ?? -1.5 }));
      t += d + .04;
    });
    return t;
  }
  /** the item number in a blue marker ring, then its title */
  function item(parent, n, x, y, title, t0, o = {}) {
    const num = handText(parent, String(n), x, y, { color: 'blue', size: 46, weight: 700, t0, dur: .18, rot: 0, align: 'center' });
    L.add(num);
    L.add(markerCircle(parent, { x: x - 18, y: y - 42, w: 36, h: 44 }, { color: 'blue', width: 4.5, pad: 6, t0: t0 + .1, dur: .32, seed: n * 7 }));
    const ttl = handText(parent, title, x + 46, y + 2, { color: 'ink', size: o.size ?? 44, weight: 700, t0: t0 + .25, dur: o.dur ?? .8, rot: -1 });
    L.add(ttl);
    return ttl;
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
        show(e, t, t0, o.d ?? .4, { dy: o.dy ?? 16, ease: easeOutCubic });
      },
    };
  }
  /** offset of e inside root (layout px; no transforms involved) */
  function offsetIn(e, root) { let x = 0, y = 0, n = e; while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: e.offsetWidth, h: e.offsetHeight }; }

  let R = {};

  Scene({
    id: 'S18', start: START, end: END, region: 'COLD', z: 45,
    camera: [
      [280.0, Z1],
      [281.45, Z1, 'linear'],
      [282.25, C1, 'easeInOutCubic'],
      [285.5, { ...C1, z: C1.z * 1.01 }, 'easeInOutSine'],
      [286.3, C2, 'easeInOutCubic'],
      [291.5, { ...C2, z: C2.z * 1.01 }, 'easeInOutSine'],
      [292.3, C3, 'easeInOutCubic'],
      [297.5, { ...C3, z: C3.z * 1.01 }, 'easeInOutSine'],
      [298.3, C4, 'easeInOutCubic'],
      [T_PULL0, { ...C4, z: C4.z * 1.008 }, 'easeInOutSine'],
      [T_PULL1, Z1, 'easeInOutCubic'],
      [304.0, Z1, 'linear'],
    ],
    shakes: [[T_CARD, 2, .25], [T_STK, 2, .25], [T_NN, 1.5, .2]],

    build(root, S) {
      if (!document.getElementById('s18-css')) { const st = document.createElement('style'); st.id = 's18-css'; st.textContent = css; document.head.appendChild(st); }
      // Same guard as S16 (shared flag, so it wraps once): S15's paper fade must not cover show-only scenes
      // past the film's 168 s end. Repeated here so S18 works without S16 loaded.
      if (!Q.__s16guard) { const orig = Q.setFade; Q.setFade = v => { if (Q.t > 168.5) return; orig(v); }; Q.__s16guard = true; }

      // A clean-board patch under everything, from the first frame after 280. S02's title lockup lives in
      // this cell for good (it holds for the S15 pull-out); S17 normally erases the cell before us, and
      // then this patch changes nothing. It keeps S18 clean even when S17 is skipped or not loaded.
      L.add(eraser(root, { x: -40, y: -20, w: 2000, h: 1120, t0: START, dur: .001, worldX: S.region.x, worldY: S.region.y }));
      K.fixSwath(root, S.region.x, S.region.y, -40, -20);
      root.querySelectorAll('.erase-swath, .erase-block').forEach(e => { e.style.zIndex = 0; });   // under our groups (CSS puts swaths at 50)

      // one group per item (plus heading and route) so the items not in focus can be ghosted while the
      // camera is pushed in; all come back for the final pull-out
      const G = R.G = [0, 1, 2, 3, 4, 5].map(i => el('div', { style: 'left:0;top:0;width:0;height:0', attrs: { 'data-g': i } }, root));

      /* ================= heading ================= */
      const head = L.add(handText(G[0], 'Where it goes next', 96, 116, { color: 'ink', size: 76, weight: 700, t0: T_HEAD, dur: 1.0, rot: -1.5 }));
      const hw = head.el.offsetWidth;
      L.add(markerUnderline(G[0], 100, 100 + hw - 20, 140, { color: 'blue', width: 6, wave: 5, t0: T_HEAD + 1.05, dur: .4 }));

      /* ================= 1 · a native app, built in Rust (top left) ================= */
      const g1 = G[1];
      item(g1, 1, 92, 238, 'A native app, built in Rust', T_B1);
      L.add(strokeSeq(g1, phoneDs(72, 274, 290, 604), { color: 'ink', width: 5, t0: T_PHONE, durEach: .3, gap: .03, dry: false }));
      L.add(strokeSeq(g1, laptopDs(338, 604, 330, 518), { color: 'ink', width: 5, t0: T_LAP1, durEach: .3, gap: .03, dry: false }));
      const chip1 = el('div', { cls: 's18-chip', html: SVG_DB + 'Qdrant Edge', style: 'left:0;top:0' }, g1);
      const chip2 = el('div', { cls: 's18-chip', html: SVG_DB + 'Qdrant Edge', style: 'left:0;top:0' }, g1);
      chip1.style.left = `${173 - chip1.offsetWidth / 2}px`; chip1.style.top = `${447 - chip1.offsetHeight / 2}px`;
      chip2.style.left = `${471 - chip2.offsetWidth / 2}px`; chip2.style.top = `${424 - chip2.offsetHeight / 2}px`;
      L.add(popIn(chip1, T_CHIP[0], { r: -3 }));
      L.add(popIn(chip2, T_CHIP[1], { r: 2 }));
      lines(g1, ['Qdrant Edge is a', 'Rust library:', 'the phone keeps', 'its own memory,', 'offline'], 654, 372, { size: 34, t0: T_NOTE1, dur: .23, lh: 42 });

      /* ================= 2 · assistants on Discord (top right) ================= */
      const g2 = G[2];
      item(g2, 2, 1022, 238, 'Assistants on Discord', T_B2);
      const card = R.card = el('div', { cls: 's18-dc', style: 'left:1012px;top:282px' }, g2);
      el('i', { cls: 'tape', style: 'left:-20px;top:-6px;transform:rotate(-26deg)' }, card);
      el('i', { cls: 'tape', style: 'right:-20px;top:-6px;transform:rotate(24deg)' }, card);
      el('div', { cls: 's18-dchead', html: '<span class="s18-hash">#</span>sharma-wedding' }, card);
      const msg = (av, avBg, name, html) => {
        const m = el('div', { cls: 's18-msg' }, card);
        el('div', { cls: 's18-av', text: av, style: `background:${avBg}` }, m);
        const col = el('div', { style: 'flex:1;min-width:0' }, m);
        el('div', { cls: 's18-nm', html: `${name}<span class="s18-bot">BOT</span>` }, col);
        el('div', { cls: 's18-tx', html }, col);
        return { m, col };
      };
      const m1 = msg('Q', `linear-gradient(180deg,${COL.skyTop},${COL.sky} 40%)`, 'Lakshya’s Quorum',
        'Client’s email says 16&nbsp;Oct; Tanishk’s note says 18&nbsp;Oct. <span class="s18-men">@Tanishk</span>, which is right?');
      const rxs = el('div', { cls: 's18-rxs' }, m1.col);
      R.rx18 = el('div', { cls: 's18-rx', html: '<span>✅</span>18 Oct<b></b>' }, rxs);
      R.rx16 = el('div', { cls: 's18-rx', html: '16 Oct' }, rxs);
      R.rx18n = R.rx18.querySelector('b');
      const m2 = msg('Q', `linear-gradient(180deg,${COL.yellowTop},${COL.yellow} 40%)`, 'Tanishk’s Quorum', 'Tanishk chose 18 Oct. Updated everywhere.');
      R.m1 = m1.m; R.m2 = m2.m;
      // geometry (layout px, no transforms yet)
      const rx18 = offsetIn(R.rx18, root), bot2 = offsetIn(m2.m.querySelector('.s18-bot'), root), cardR = offsetIn(card, root);
      const note2 = L.add(handText(g2, 'posts as itself, never as you', 1034, cardR.y + cardR.h + 50, { color: 'blue', size: 36, weight: 700, t0: T_NOTE2, dur: .85, rot: -1.5 }));
      // arrow from the end of the note, round the right of the reply text, to the reply's BOT badge
      const nx = 1034 + note2.el.offsetWidth + 22, ny = cardR.y + cardR.h + 26, bx = bot2.x + bot2.w + 12, by = bot2.y + bot2.h / 2 + 2;
      L.add(arrowQ(g2, [nx, ny], [Math.max(nx + 80, cardR.x + cardR.w + 24), by - 6], [bx, by], { t0: T_ARR2 }));
      // Tanishk picks 18 Oct (the drawn cursor)
      const pick = W2({ x: rx18.x + rx18.w * .45, y: rx18.y + rx18.h * .55 });
      Cursor.plan([
        { t: 287.55, enter: 'right' },
        { t: T_PICK, click: pick },
        { t: 288.75, at: { x: pick.x + 70, y: pick.y + 95 } },
        { t: 289.35, exit: 'right' },
      ]);

      /* ================= 3 · after a call (bottom left) ================= */
      const g3 = G[3];
      item(g3, 3, 92, 760, 'After a call: what did we decide?', T_B3, { size: 42, dur: 1.0 });
      const pill = R.pill = el('div', { cls: 's18-pill', html: `<span class="s18-spk">${SVG_SPK}</span>voice call ended · 32 min`, style: 'left:84px;top:808px' }, g3);
      L.add(popIn(pill, T_PILL, { from: .8 }));
      L.add(markerArrow(g3, [250, 892], [418, 950], { color: 'blue', width: 4.5, head: 16, bend: .28, t0: T_ARR3 }));
      const stk = L.add(sticky(g3, {
        x: 680, y: 918, w: 470, h: 206, color: 'yellow', rot: 2, size: 30, tape: 2, t0: T_STK, from: { dx: 30, dy: -20 },
        html: '<div>• Teaser by <b style="font-weight:700">Friday</b> · Tushar</div><div style="margin-top:6px">• Delivery <b style="font-weight:700">18 Oct</b> · Tanishk</div>',
        meta: '<span style="font-size:23px">drafted from the call · you confirm</span>',
      }));
      const yc = K.tight(wordRect(root, stk, 'you confirm'));
      if (yc) {
        const sl = Math.tan(2 * Math.PI / 180) * yc.w, cy = yc.y + yc.h / 2 + 14, x1 = yc.x - 2, x2 = yc.x + yc.w + 4;
        L.add(markerPath(g3, `M${x1} ${(cy - sl / 2 + 1).toFixed(1)} C ${lerp(x1, x2, .3).toFixed(1)} ${(cy - sl * .2 - 2).toFixed(1)}, ${lerp(x1, x2, .7).toFixed(1)} ${(cy + sl * .2 + 2).toFixed(1)}, ${x2} ${(cy + sl / 2 - 1).toFixed(1)}`,
          { color: 'blue', width: 4.5, t0: T_UND3, dur: .3 }));
      }

      /* ================= 4 · two real laptops, one small server (bottom right) ================= */
      const g4 = G[4];
      item(g4, 4, 1022, 760, 'Two real laptops, one small server', T_B4, { size: 40, dur: 1.0 });
      const LA = [1046, 1236, 800, 916], LB = [1608, 1798, 800, 916];
      L.add(strokeSeq(g4, laptopDs(...LA, 13), { color: 'ink', width: 5, t0: T_LA, durEach: .27, gap: .03, dry: false }));
      L.add(strokeSeq(g4, laptopDs(...LB, 13), { color: 'ink', width: 5, t0: T_LB, durEach: .27, gap: .03, dry: false }));
      L.add(strokeSeq(g4, airplaneDs((LA[0] + LA[1]) / 2, (LA[2] + LA[3]) / 2, 40), { color: 'ink', width: 5, t0: T_AIR[0], durEach: .1, gap: .02, dry: false }));
      L.add(strokeSeq(g4, airplaneDs((LB[0] + LB[1]) / 2, (LB[2] + LB[3]) / 2, 40), { color: 'ink', width: 5, t0: T_AIR[1], durEach: .1, gap: .02, dry: false }));
      // the hub: a small box between them
      const SB = [1374, 1474, 806, 932];
      L.add(strokeSeq(g4, [
        rrD(SB[0], SB[2], SB[1], SB[3], 10),
        `M${SB[0] + 18} ${SB[2] + 34} L ${SB[1] - 18} ${SB[2] + 34}`,
        `M${SB[0] + 18} ${SB[2] + 62} L ${SB[1] - 18} ${SB[2] + 62}`,
        `M${SB[0] + 18} ${SB[2] + 90} L ${SB[1] - 40} ${SB[2] + 90}`,
      ], { color: 'ink', width: 5, t0: T_SRV, durEach: .22, gap: .03, dry: false }));
      L.add(markerPath(g4, `M${SB[1] - 27} ${SB[2] + 90} L ${SB[1] - 26} ${SB[2] + 90}`, { color: 'green', width: 8, t0: T_SRV + .9, dur: .12, dry: false }));
      L.add(handText(g4, 'home server · the hub', (SB[0] + SB[1]) / 2, 994, { color: 'ink', size: 32, weight: 600, t0: T_SRVL, dur: .5, rot: -1, align: 'center' }));
      // the laptops reach the hub when they can: dashed links
      L.add(dashQ(g4, [LA[1] + 14, 862], [1316, 852], [SB[0] - 14, 862], { n: 4, color: 'ink3', width: 4, t0: T_LINK }));
      L.add(dashQ(g4, [LB[0] - 14, 862], [1532, 852], [SB[1] + 14, 862], { n: 4, color: 'ink3', width: 4, t0: T_LINK + .2 }));
      L.add(handText(g4, 'real airplane mode; the hub on a box we own', 1040, 1054, { color: 'blue', size: 34, weight: 700, t0: T_NOTE4, dur: .85, rot: -1 }));

      /* ================= the route: 1 -> 2 -> 3 -> 4, and "now -> next" ================= */
      const g5 = G[5];
      L.add(dashQ(g5, [880, 214], [945, 196], [990, 220], { n: 4, head: 15, width: 5, t0: T_PATH[0] }));
      L.add(dashQ(g5, [990, 646], [520, 648], [92, 712], { n: 18, head: 16, width: 5, t0: T_PATH[1], durEach: .022 }));
      L.add(dashQ(g5, [944, 738], [975, 722], [990, 740], { n: 3, head: 14, width: 5, t0: T_PATH[2] }));
      L.add(sticky(g5, { x: 1690, y: 96, w: 360, h: 112, color: 'yellow', rot: 3, size: 46, tape: 1, t0: T_NN, html: '<div style="text-align:center;margin-top:-8px;font-weight:700;white-space:nowrap">now → next</div>' }));

      // focus veils: clean board laid over the heading and items 1-3 (texture aligned like K.fixSwath), above
      // their groups; render() sets each veil's opacity
      const veil = (x, y, w, h) => {
        const v = el('div', { cls: 'board-tex', style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:none` }, root);
        const px = -(S.region.x + x), py = -(S.region.y + y);
        v.style.backgroundImage = 'linear-gradient(112deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.28) 38%,rgba(255,255,255,0) 46%),radial-gradient(140% 90% at 12% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),var(--tex)';
        v.style.backgroundSize = `${BOARD.w}px ${BOARD.h}px,${BOARD.w}px ${BOARD.h}px,512px 512px`;
        v.style.backgroundPosition = `${px}px ${py}px,${px}px ${py}px,${px}px ${py}px`;
        v.style.backgroundRepeat = 'no-repeat,no-repeat,repeat';
        return v;
      };
      R.veils = [veil(40, 0, 900, 168), veil(30, 168, 945, 480), veil(985, 168, 905, 502), veil(30, 676, 940, 390)];
      // the route sits above the veils (it only appears once they are gone anyway)
      root.appendChild(G[5]);

      // reset to the pre-entrance state (render() owns everything from here on)
      card.style.display = 'none';
    },

    render(t) {
      /* ---- focus: while the camera is pushed onto an item, the earlier ones ghost; all return on the pull-out ---- */
      // (veils of clean board over the item, not opacity on the item's group: group opacity rasterizes
      // differently depending on the previous frame, which breaks render.js verify)
      const ghost = a0 => .74 * easeInOutCubic(P(t, a0, .8)) * (1 - easeInOutCubic(P(t, T_PULL0, .75)));
      [285.5, 285.5, 291.5, 297.5].forEach((a0, i) => {
        const v = R.veils[i], k = ghost(a0);
        if (k <= .001) { v.style.display = 'none'; return; }
        v.style.display = ''; v.style.opacity = k.toFixed(3);
      });

      /* ---- the Discord card: pinned at T_CARD, messages in order ---- */
      const card = R.card, a = T_CARD - .14;
      if (t < a) card.style.display = 'none';
      else {
        card.style.display = '';
        const kin = easeInCubic(P(t, a, .14)), ks = P(t, T_CARD, .5);
        const s = t < T_CARD ? lerp(1.06, 1, kin) : 1 - .012 * Math.sin(ks * Math.PI) * (1 - ks);
        const lift = t < T_CARD ? 1 - kin : 0;
        xf(card, { y: -24 * lift, s, r: lift * 2, o: Math.min(1, P(t, a, .06)) });
        card.style.boxShadow = `0 ${(24 + lift * 30).toFixed(1)}px ${(40 + lift * 36).toFixed(1)}px -20px rgba(20,23,31,${(.35 - lift * .08).toFixed(3)}),0 0 0 1px #dfe2e8`;
        // messages and reactions (laid out from the start; shown by opacity so the card never resizes)
        const k1 = t >= T_MSG1 ? easeOutCubic(P(t, T_MSG1, .35)) : 0;
        R.m1.style.opacity = k1.toFixed(3); R.m1.style.transform = `translateY(${((1 - k1) * 14).toFixed(1)}px)`;
        [R.rx18, R.rx16].forEach((e, i) => {
          if (t < T_RX[i]) { e.style.opacity = 0; e.style.transform = 'scale(.6)'; return; }
          const k = spring(P(t, T_RX[i], .4), 6.5, 1.5);
          const pr = i === 0 && t >= T_PICK && t < T_PICK + .1 ? .92 : i === 0 && t >= T_PICK + .1 ? lerp(.92, 1, easeOutBack(P(t, T_PICK + .1, .2))) : 1;
          e.style.opacity = Math.min(1, P(t, T_RX[i], .08)).toFixed(3);
          e.style.transform = `scale(${(lerp(.6, 1, k) * pr).toFixed(4)})`;
        });
        const on = t >= T_PICK + .05;
        R.rx18.classList.toggle('on', on);
        setText(R.rx18n, on ? '1' : '');
        const k2 = t >= T_MSG2 ? easeOutCubic(P(t, T_MSG2, .35)) : 0;
        R.m2.style.opacity = k2.toFixed(3); R.m2.style.transform = `translateY(${((1 - k2) * 14).toFixed(1)}px)`;
      }
      L.render(t);
    },
  });

  /* ---- live-show player: stop points (t = where each step ends and holds) and sound cues ---- */
  window.SHOW_STOPS = window.SHOW_STOPS || {};
  window.SHOW_STOPS.S18 = [
    { t: 285.5, title: 'Next: a native app in Rust', say: 'Next is a native app on phone and desktop, built in Rust. Qdrant Edge is a Rust library, so the phone keeps its own memory, offline.' },
    { t: 291.5, title: 'Assistants on Discord', say: "Each person's assistant lives where we talk. It asks the owner on Discord, and it posts as itself, never as you." },
    { t: 297.5, title: 'After a call: what did we decide?', say: 'Most of our decisions happen on voice calls. After one, it drafts what we decided, and you confirm.' },
    { t: 304.0, title: 'Two real laptops, one small server', say: 'And the setup we want to show you next time: two real laptops in airplane mode, and the hub on a small server we own.' },
  ];
  window.SHOW_SFX = window.SHOW_SFX || {};
  window.SHOW_SFX.S18 = [
    // 1 · heading, the native app
    [T_HEAD, 'marker_squeak'], [T_HEAD + 1.05, 'marker_squeak'], [281.45, 'paper_whoosh'],
    [T_B1, 'marker_squeak'], [T_B1 + .25, 'marker_squeak'], [T_PHONE, 'marker_squeak'], [T_LAP1, 'marker_squeak'],
    [T_CHIP[0], 'ui_pop'], [T_CHIP[1], 'ui_pop'], [T_NOTE1, 'marker_squeak'], [T_NOTE1 + .55, 'marker_squeak'],
    // 2 · Discord
    [285.55, 'paper_whoosh'], [T_B2, 'marker_squeak'], [T_B2 + .25, 'marker_squeak'],
    [T_CARD, 'sticky_slap'], [T_MSG1, 'ui_pop'], [T_RX[0], 'ui_pop'], [T_RX[1], 'ui_pop'],
    [T_PICK, 'click_down'], [T_PICK + .1, 'click_up'], [T_PICK + .12, 'toggle_clack'],
    [T_MSG2, 'ui_pop'], [T_MSG2 + .05, 'resolve_chime'], [T_NOTE2, 'marker_squeak'], [T_ARR2, 'marker_squeak'],
    // 3 · after a call
    [291.55, 'paper_whoosh'], [T_B3, 'marker_squeak'], [T_B3 + .25, 'marker_squeak'],
    [T_PILL, 'ui_pop'], [T_ARR3, 'marker_squeak'], [T_STK, 'sticky_slap'], [T_UND3, 'marker_squeak'],
    // 4 · two laptops, one small server; the route
    [297.55, 'paper_whoosh'], [T_B4, 'marker_squeak'], [T_B4 + .25, 'marker_squeak'],
    [T_LA, 'marker_squeak'], [T_LB, 'marker_squeak'], [T_AIR[0], 'marker_squeak'], [T_SRV, 'marker_squeak'],
    [T_SRVL, 'marker_squeak'], [T_LINK, 'marker_squeak'], [T_NOTE4, 'marker_squeak'],
    [T_PULL0, 'paper_whoosh'], [T_PATH[0], 'marker_squeak'], [T_PATH[1], 'marker_squeak'], [T_PATH[2], 'marker_squeak'],
    [T_NN, 'sticky_slap'],
  ].map(([t, type]) => [+t.toFixed(2), type]);
})();
