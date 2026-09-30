/* Scene D: Architecture (32–46 s).
 * 32.5 two laptop windows float in (rotateY ±8°) · 33.5 / 34.3 / 35.2 / 36.0 stack layers slide in
 * 37.0 hub card pops · 37.5 dashed sync lines draw, packets travel both ways
 * 39.5 sources stream into laptop A as particles ("Phone (mocked)" ghosted)
 * 41.0 caption · 45.3 push into Lakshya's laptop (hand-off to E's email)
 */
(function () {
  const START = 32, END = 46, DUR = END - START, DRIFT = .03;
  const LW = 700, LH = 470, LY = 360, AX = 120, BX = 1100, PERSP = 1800, TILT = 8;
  const T_LAP = 31.9, LAYER_T = [33.5, 34.3, 35.2, 36.0], T_HUB = 37.0, T_SYNC = 37.5, T_SRC = 39.5, T_CAP = 41.0;
  const HUB = { x: 716, y: 92, w: 580, h: 120 };
  const PUSH = { x: 1450, y: 600, t: 45.3, d: .95 };
  const ROW_H = 80, ROW_GAP = 10, ROW_TOP = 44;

  const ICON = {
    qdrant: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3z"/><path d="M12 12 20.5 7.3M12 12 3.5 7.3M12 12v9.5" opacity=".75"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
    embed: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 20 19 6M4 20l7-15M4 20l16-5"/><circle cx="19" cy="6" r="1.7" fill="currentColor"/><circle cx="11" cy="5" r="1.7" fill="currentColor"/><circle cx="20" cy="15" r="1.7" fill="currentColor"/><circle cx="4" cy="20" r="1.5" fill="currentColor"/></svg>',
    sqlite: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" opacity=".7"/></svg>',
    llm: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" opacity=".55"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/></svg>',
    server: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="17" height="7" rx="1.8"/><path d="M7 7h5M7 17h5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.8 6.5 8.2 6.3 8.2-6.3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M8.5 10.5h7M8.5 13.5h4.5" stroke-linecap="round"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h10l4 4v13H5z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.2 2.2"><rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3" stroke-dasharray="none" stroke-linecap="round"/></svg>',
  };
  const LAYERS = [
    { name: 'Qdrant Edge', sub: 'vectors · embedded, on-device', tag: 'HNSW', icon: 'qdrant', c: '#7C8CFF' },
    { name: 'FastEmbed', sub: 'dense + BM25, on-device', tag: 'ONNX', icon: 'embed', c: '#8FD3FF' },
    { name: 'SQLite', sub: 'graph + outbox', tag: 'WAL', icon: 'sqlite', c: '#B49CFF' },
    { name: 'Local LLM', sub: 'llama.cpp', tag: 'GGUF', icon: 'llm', c: '#9DB4FF' },
  ];
  // sources that stream into laptop A (tile x, particle colour, emission gap, target on A's top edge)
  const SOURCES = [
    { label: 'Gmail', icon: 'mail', c: '#C9D2FF', gap: .11, lx: 160 },
    { label: 'WhatsApp export', icon: 'chat', c: COL.whatsapp, gap: .12, lx: 270 },
    { label: 'Typed notes', icon: 'note', c: '#9DA9FF', gap: .16, lx: 380 },
    { label: 'Phone', sub: 'mocked', icon: 'phone', c: '#8A93A8', gap: .42, lx: 490, ghost: true },
  ];
  const TILE = { x0: 200, y: 96, w: 116, h: 116, gap: 10 };

  let wrap, hub, hubLeds = [], hubGlow, tiles = [], legend, laps = [];

  // ------------------------------------------------------------------ geometry
  const lapX = i => (i === 0 ? AX : BX);
  /** state of laptop i at time t: entrance + bob + tilt */
  function lapState(i, t) {
    const a = T_LAP + i * .12;
    const k = easeOutExpo(P(t, a, 1.2));
    const sgn = i === 0 ? 1 : -1;
    return {
      k, o: clamp(P(t, a, .45)),
      tx: (1 - k) * -sgn * 90, ty: (1 - k) * 80 + wiggle(t, 11 + i, .55, 4),
      ry: sgn * lerp(26, TILT, k) + wiggle(t, 21 + i, .4, .5),
      blur: (1 - k) * 8,
    };
  }
  /** local laptop point (px from the window's top-left) -> wrapper-space screen point, matching CSS
   *  `perspective(PERSP) translate(tx,ty) rotateY(ry)` with the default centre origin. */
  function lapPt(i, st, lx, ly) {
    const cx = lapX(i) + LW / 2, cy = LY + LH / 2, dx = lx - LW / 2, dy = ly - LH / 2;
    const a = st.ry * Math.PI / 180, w = 1 + dx * Math.sin(a) / PERSP;
    return [cx + (dx * Math.cos(a) + st.tx) / w, cy + (dy + st.ty) / w];
  }
  const bez = (p0, p1, p2, p3, u) => {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  };
  /** draw the first `k` (0..1) of a cubic as a polyline */
  function strokeBez(ctx, c, k, n = 48) {
    ctx.beginPath();
    const m = Math.max(1, Math.ceil(n * k));
    for (let j = 0; j <= m; j++) { const p = bez(c[0], c[1], c[2], c[3], Math.min(k, j / n)); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ build
  function buildLaptop(i) {
    const lap = makeLaptop({ parent: wrap, x: lapX(i), y: LY, w: LW, h: LH,
      title: i === 0 ? "Tanishk's laptop · on a shoot" : "Lakshya's laptop · in the studio", status: 'online' });
    lap.el.style.transformOrigin = '50% 50%';
    lap.el.style.willChange = 'transform';
    const head = el('div', { cls: 'abs', style: 'left:28px;right:28px;top:14px;height:24px;display:flex;align-items:center;justify-content:space-between' }, lap.body);
    el('div', { style: 'font-size:17px;letter-spacing:2.2px;color:#5B6478;font-weight:700', text: 'LOCAL STACK · FULL EDGE NODE' }, head);
    const count = el('div', { cls: 'mono', style: 'font-size:20px;color:#9AA4C0' }, head);
    const rows = LAYERS.map((L, j) => {
      const r = el('div', { cls: 'abs', style: `left:28px;right:28px;top:${ROW_TOP + j * (ROW_H + ROW_GAP)}px;height:${ROW_H}px;border-radius:14px;overflow:hidden;` +
        `background:linear-gradient(180deg,rgba(255,255,255,.085),rgba(255,255,255,.025) 52%,rgba(0,0,0,.10));` +
        `border:1px solid ${rgba(L.c, .24)};box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 26px rgba(0,0,0,.35)` }, lap.body);
      el('div', { cls: 'abs', style: `left:0;top:0;bottom:0;width:4px;background:${L.c};opacity:.85;box-shadow:0 0 12px ${L.c}` }, r);
      const ic = el('div', { cls: 'abs', html: ICON[L.icon], style: `left:18px;top:13px;width:54px;height:54px;border-radius:13px;display:flex;align-items:center;justify-content:center;` +
        `color:${mixColor(L.c, '#ffffff', .35)};background:linear-gradient(135deg,${rgba(L.c, .34)},${rgba(L.c, .10)});border:1px solid ${rgba(L.c, .55)};box-shadow:0 0 18px ${rgba(L.c, .28)}` }, r);
      el('div', { cls: 'abs', text: L.name, style: 'left:90px;top:6px;font-size:27px;font-weight:700;color:#fff;letter-spacing:.2px' }, r);
      el('div', { cls: 'abs', text: L.sub, style: 'left:90px;top:41px;font-size:22px;color:#9AA4C0' }, r);
      el('div', { cls: 'abs mono', text: L.tag, style: `right:18px;top:22px;font-size:18px;color:${mixColor(L.c, '#ffffff', .25)};border:1px solid ${rgba(L.c, .45)};background:${rgba(L.c, .10)};padding:3px 10px;border-radius:8px;letter-spacing:.5px` }, r);
      const glint = el('div', { cls: 'abs', style: 'top:-10px;bottom:-10px;left:0;width:140px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.20),transparent);' }, r);
      return { r, ic, glint, c: L.c };
    });
    return { lap, rows, head, count };
  }

  Scene({
    id: 'D', start: START, end: END, drift: DRIFT, fadeIn: .8,
    captions: [[T_CAP, 45.8, 'Every laptop is a full edge node. The hub only syncs.']],

    build(root) {
      // pre-warm glow sprites (lazily cached in lib): a sprite's first use can rasterise differently from later uses
      { const sc = document.createElement('canvas'); sc.width = sc.height = 8; const g2 = sc.getContext('2d');
        for (const c of [COL.indigo, '#C9D2FF', '#9DA9FF', COL.whatsapp, '#8A93A8', COL.green, COL.amber].concat([...Array(65)].map((_, i) => mixColor(COL.amber, COL.green, i / 64)))) { g2.drawImage(glowSprite(c), 0, 0, 4, 4); g2.drawImage(coreSprite(c), 0, 0, 4, 4); } }
      wrap = el('div', { cls: 'abs', style: `left:0;top:0;width:1920px;height:1080px;transform-origin:${PUSH.x}px ${PUSH.y}px` }, root);

      laps = [buildLaptop(0), buildLaptop(1)];

      // hub card
      hub = el('div', { cls: 'card', style: `left:${HUB.x}px;top:${HUB.y}px;width:${HUB.w}px;height:${HUB.h}px;transform-origin:50% 60%` }, wrap);
      el('div', { cls: 'abs', html: ICON.server, style: `left:20px;top:28px;width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#C9D2FF;` +
        `background:linear-gradient(135deg,rgba(124,140,255,.38),rgba(124,140,255,.10));border:1px solid rgba(124,140,255,.6);box-shadow:0 0 26px rgba(124,140,255,.35)` }, hub);
      el('div', { cls: 'abs', text: 'Sync hub', style: 'left:104px;top:16px;font-size:34px;font-weight:700;color:#fff' }, hub);
      el('div', { cls: 'abs', html: '<span style="color:#9DA9FF;font-weight:600">Qdrant Server</span> · relays team + my-devices tiers', style: 'left:104px;top:66px;font-size:20px;color:#9AA4C0;white-space:nowrap' }, hub);
      const leds = el('div', { cls: 'abs', style: 'right:24px;top:30px;display:flex;gap:9px' }, hub);
      hubLeds = [0, 1, 2].map(() => el('div', { style: 'width:9px;height:9px;border-radius:50%;background:#22C55E' }, leds));

      // tiny legend between the two sync lines
      legend = el('div', { cls: 'abs mono', style: `left:${HUB.x + HUB.w / 2 - 80}px;width:160px;top:268px;text-align:center;font-size:19px;line-height:30px`,
        html: `<div style="color:${COL.amber}"><svg width="13" height="11" viewBox="0 0 13 11" style="vertical-align:0;margin-right:8px"><path d="M6.5 0 13 11H0z" fill="${COL.amber}"/></svg>outbox</div><div style="color:${COL.green}"><svg width="13" height="11" viewBox="0 0 13 11" style="vertical-align:0;margin-right:8px"><path d="M0 0h13L6.5 11z" fill="${COL.green}"/></svg>synced</div>` }, wrap);

      // source tiles (top-left, above laptop A)
      tiles = SOURCES.map((S, i) => {
        const x = TILE.x0 + i * (TILE.w + TILE.gap);
        const tl = el('div', { cls: 'abs', style: `left:${x}px;top:${TILE.y}px;width:${TILE.w}px;height:${TILE.h}px;border-radius:16px;text-align:center;` +
          (S.ghost ? `border:2px dashed rgba(138,147,168,.55);background:rgba(20,26,40,.35);`
                   : `border:1px solid ${rgba(S.c, .45)};background:linear-gradient(180deg,rgba(28,35,54,.95),rgba(20,26,40,.92));box-shadow:0 14px 34px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);`) }, wrap);
        el('div', { html: ICON[S.icon], style: `margin-top:12px;height:32px;color:${S.ghost ? '#8A93A8' : mixColor(S.c, '#ffffff', .2)}` }, tl);
        el('div', { html: S.label + (S.sub ? `<div style="display:inline-block;margin-top:5px;font-size:16px;line-height:20px;color:#C9D0E0;font-weight:600;letter-spacing:.6px;padding:1px 9px;border-radius:999px;border:1px solid rgba(154,164,192,.6);background:rgba(154,164,192,.14)">${S.sub}</div>` : ''),
          style: `margin:6px 6px 0;font-size:${S.ghost ? 22 : S.label.length > 12 ? 17 : 19}px;line-height:1.12;font-weight:600;color:${S.ghost ? '#9AA4C0' : '#E8ECF4'}` }, tl);
        return tl;
      });
    },

    render(t, lt, fade) {
      // ---------------- push into Lakshya's laptop at the end (hand-off to E) ----------------
      const pk = easeInCubic(P(t, PUSH.t, PUSH.d));
      const sp = 1 + .24 * pk;
      wrap.style.transform = pk > 0 ? `scale(${sp})` : 'none';
      wrap.style.filter = pk > .02 ? `blur(${(pk * 5).toFixed(2)}px)` : 'none';

      // ---------------- laptops + stack layers ----------------
      const st = [lapState(0, t), lapState(1, t)];
      const capGlow = pulse(t, T_CAP + .35, .45);
      laps.forEach((L, i) => {
        const s = st[i];
        xf(L.lap.el, { persp: PERSP, x: s.tx, y: s.ty, ry: s.ry, o: s.o, blur: s.blur });
        L.lap.el.style.boxShadow = `0 30px 80px rgba(0,0,0,.55),0 0 ${70 * capGlow}px ${rgba(COL.indigo, .45 * capGlow)}`;
        L.lap.el.style.borderColor = rgba(COL.indigo, .28 + .4 * capGlow);
        L.lap.setStatus('online', 0);
        show(L.head, t, 33.1 + i * .08, .6, { dy: 8 });
        // claim counter: A ingests from the sources, B receives the same claims ~1 s later via the hub
        const n = 1284 + Math.floor(clamp((t - (T_SRC + .45) - i * 1.1) * 6.5, 0, 26));   // ends at 1,310 (F: "Searching 1,310 claims")
        setHTML(L.count, `<span style="color:#5B6478">claims</span> <span style="color:${i === 0 && t > T_SRC + .45 ? '#E8ECF4' : '#9AA4C0'}">${n.toLocaleString('en-US')}</span>`);
        L.rows.forEach((R, j) => {
          const a = LAYER_T[j] + i * .06;
          show(R.r, t, a, .6, { dx: i === 0 ? -46 : 46, dy: 0, blur: 6 });
          if (i === 1) R.r.style.opacity = +R.r.style.opacity * lerp(1, .45, E(t, T_HUB, .9, easeInOutCubic));
          pop(R.ic, t, a + .06, .7, .5);
          R.glint.style.transform = `translateX(${lerp(-180, LW, easeInOutCubic(P(t, a + .12, .75)))}px) skewX(-12deg)`;
          const fl = pulse(t, a + .22, .22);
          R.r.style.borderColor = rgba(R.c, .24 + .6 * fl);
          R.r.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,.12),0 10px 26px rgba(0,0,0,.35),0 0 ${30 * fl}px ${rgba(R.c, .5 * fl)}`;
        });
      });

      // ---------------- hub ----------------
      pop(hub, t, T_HUB, .8, .55);
      const hubFlash = pulse(t, T_HUB + .12, .25);
      hub.style.boxShadow = `0 30px 80px rgba(0,0,0,.55),0 0 ${60 * hubFlash + 18}px ${rgba(COL.indigo, .25 + .45 * hubFlash)}`;
      hubLeds.forEach((d, j) => {
        const on = t > T_SYNC + .6 ? .35 + .65 * blink(t + j * .37, 1.6 + j * .5) : .25;
        d.style.opacity = on; d.style.boxShadow = `0 0 ${8 * on}px #22C55E`;
      });
      show(legend, t, T_SYNC + .7, .7, { dy: 10 });

      // ---------------- source tiles ----------------
      tiles.forEach((tl, i) => {
        show(tl, t, T_SRC + i * .1, .6, { dy: -26, scale: .9 });
        if (SOURCES[i].ghost) tl.style.opacity = +tl.style.opacity * .88;
      });

      // ---------------- cloud: dim, centred, continuing C's camera ----------------
      const u = easeInOutSine(P(t, START - .5, DUR + .5));
      cloud.set({ opacity: lerp(.28, .2, E(t, START, 1.5, easeInOutCubic)), spin: .035 });
      cloud.setCamera({ target: [0, lerp(0, .08, u), 0], dist: lerp(4.1, 3.6, u), yaw: lerp(.15, .5, u), pitch: lerp(.32, .24, u), orbit: .02, fov: 46 });

      // ---------------- canvas overlay: sync lines, packets, source streams ----------------
      const ctx = Q.fx;
      const sd = 1 + DRIFT * clamp(lt / DUR, -.1, 1.1);
      const a = sp * sd;  // push (around PUSH) then root drift (around 960,540)
      ctx.setTransform(a, 0, 0, a, sd * PUSH.x * (1 - sp) + 960 * (1 - sd), sd * PUSH.y * (1 - sp) + 540 * (1 - sd));
      const F = fade * (1 - .6 * pk);

      // sync lines (hub -> inner edge of each laptop)
      const hubK = clamp(P(t, T_HUB, .25));
      const lines = [0, 1].map(i => {
        const sgn = i === 0 ? -1 : 1;
        const p0 = [HUB.x + HUB.w / 2 + sgn * 60, HUB.y + HUB.h + 2];
        const p3 = lapPt(i, st[i], i === 0 ? LW : 0, 205);
        return [p0, [p0[0], p0[1] + 230], [p3[0] - sgn * 110, p3[1]], p3];
      });
      const drawK = easeInOutCubic(P(t, T_SYNC, .85));
      if (drawK > 0 && hubK > 0) {
        lines.forEach((c, i) => {
          const k = clamp(drawK * 1.04 - i * .04);
          ctx.save();
          ctx.lineCap = 'round';
          ctx.globalAlpha = F * .22; ctx.strokeStyle = COL.indigo; ctx.lineWidth = 9; strokeBez(ctx, c, k);
          ctx.globalAlpha = F * .95; ctx.strokeStyle = '#9DA9FF'; ctx.lineWidth = 2.6;
          ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 34; strokeBez(ctx, c, k);
          ctx.restore();
          // drawing head + ports
          if (k > 0 && k < 1) { const h = bez(c[0], c[1], c[2], c[3], k); drawGlow(ctx, h[0], h[1], 26, '#C9D2FF', F); }
          drawGlow(ctx, c[0][0], c[0][1], 16, COL.indigo, F * .9 * clamp(k * 8));
          const land = clamp(P(t, T_SYNC + .8, .2));
          drawGlow(ctx, c[3][0], c[3][1], 18 + 20 * pulse(t, T_SYNC + .85, .18), COL.indigo, F * land);
        });
      }

      // packets: up = outbox (amber, turns green as it lands at the hub), down = synced claims (green)
      const T_PK = T_SYNC + .75, TRAVEL = 1.35, EMIT = .55;
      if (t > T_PK) {
        lines.forEach((c, i) => {
          for (const dir of [0, 1]) {
            const off = dir * .27 + i * .13;
            const n1 = Math.floor((t - T_PK - off) / EMIT);
            for (let n = n1 - 3; n <= n1; n++) {
              if (n < 0 || rand(n * 4 + i * 2 + dir, 77) < .22) continue;
              const u0 = (t - (T_PK + off + n * EMIT)) / TRAVEL; if (u0 < 0 || u0 > 1) continue;
              const uu = easeInOutSine(u0);
              const along = dir === 0 ? 1 - uu : uu;   // dir 0: laptop -> hub
              const col = dir === 0 ? mixColor(COL.amber, COL.green, clamp((uu - .55) / .45)) : COL.green;
              const env = Math.sin(Math.PI * clamp(u0 * 1.08)) ** .5;
              for (let q = 5; q >= 0; q--) {
                const ua = clamp(along + (dir === 0 ? q : -q) * .018);
                const p = bez(c[0], c[1], c[2], c[3], ua);
                drawGlow(ctx, p[0], p[1], q ? 11 - q : 20, col, F * env * (q ? .4 * (1 - q / 6) : 1), !q);
              }
            }
          }
        });
      }

      // source streams into laptop A (top edge)
      const srcK = clamp(P(t, T_SRC + .1, .4));
      if (srcK > 0) {
        SOURCES.forEach((S, i) => {
          const sx = TILE.x0 + i * (TILE.w + TILE.gap) + TILE.w / 2, sy = TILE.y + TILE.h + 4;
          const tgt = lapPt(0, st[0], S.lx, 0);
          const c = [[sx, sy], [sx, sy + 70], [tgt[0], tgt[1] - 70], tgt];
          const t0 = T_SRC + .15 + i * .1, a0 = F * clamp(P(t, t0, .4)) * (S.ghost ? .5 : 1);
          // faint guide
          ctx.save(); ctx.globalAlpha = a0 * .35; ctx.strokeStyle = S.ghost ? '#8A93A8' : S.c; ctx.lineWidth = 1.4;
          ctx.setLineDash(S.ghost ? [2, 7] : [3, 6]); ctx.lineDashOffset = -t * 20; strokeBez(ctx, c, 1); ctx.restore();
          const TR = .8, n1 = Math.floor((t - t0) / S.gap);
          for (let n = Math.max(0, n1 - Math.ceil(TR / S.gap)); n <= n1; n++) {
            const u0 = (t - t0 - n * S.gap) / TR; if (u0 < 0 || u0 > 1) continue;
            const uu = easeInCubic(u0) * .6 + u0 * .4;
            const p = bez(c[0], c[1], c[2], c[3], uu);
            const jx = (rand(n, 31 + i) - .5) * 16 * Math.sin(Math.PI * uu);
            const env = clamp(u0 * 5) * clamp((1 - u0) * 6);
            if (S.ghost) {
              ctx.save(); ctx.globalAlpha = a0 * env * .8; ctx.strokeStyle = '#9AA4C0'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(p[0] + jx, p[1], 4, 0, 6.283); ctx.stroke(); ctx.restore();
            } else {
              drawGlow(ctx, p[0] + jx, p[1], 10 + 4 * rand(n, 9), S.c, a0 * env);
            }
            if (u0 > .9) drawGlow(ctx, tgt[0], tgt[1], 22, S.c, a0 * (1 - u0) * 6 * .5, false);
          }
        });
        // intake glow along laptop A's top edge
        const e0 = lapPt(0, st[0], 90, 0), e1 = lapPt(0, st[0], 560, 0);
        glowLine(ctx, e0[0], e0[1], e1[0], e1[1], '#9DA9FF', F * srcK * (.3 + .08 * Math.sin(t * 9)), 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  });
})();
