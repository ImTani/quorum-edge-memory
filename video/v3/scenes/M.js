/* Scene M: Close (138–150 s).
 * 138.5 camera pulls far out of the cloud: it is one of many clouds (teams / devices), faintly linked
 * 140.1 "Shared memory for small teams that work where the signal doesn't." ("the signal doesn't" amber)
 * 144.0 QUORUM wordmark returns (particles from the constellation, light sweep)
 * 145.0 "Priced per team, per month. We're customer zero." · 146.0 event line + repo URL · 148.5–150 fade to black
 */
(function () {
  const START = 138, END = 150, PULL = 138.5, LINE = 140.1, WM = 144.0, PRICE = 145.0, CREDS = 146.0, BLACK = 148.5;
  const BASE_Y = 505;
  const DRIFT = .02;
  let inner, inst = [], edges = [], wm, parts = [], lineWords = [], lineBox, hair, price, creds, url;

  Scene({
    id: 'M', start: START, end: END,
    fadeIn: .5, fadeOut: 0, drift: DRIFT,

    build(root0) {
      // inner wrapper so our DOM can follow the fade-to-black itself (see report: scene roots' z-index
      // escapes #stage, so #black does not cover scene DOM)
      inner = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px' }, root0);
      const root = inner;
      // ---- the constellation: our cloud at the origin + many other teams' clouds ----
      inst.push({ offset: [0, 0, 0], r: 0, scale: 1, tint: null, amber: false, dec: 1, phase: 0 });
      const NI = 20;
      const tints = ['#9DB4FF', '#B49CFF', '#8FD3FF', '#C9D2FF', '#A5B4FC'];
      for (let i = 1; i <= NI; i++) {
        const a = i * 2.39996 + rand(i, 41) * .5, r = 5.2 * Math.sqrt(i) * (.9 + rand(i, 42) * .25);
        const amber = [4, 9, 15].includes(i);
        inst.push({
          offset: [Math.cos(a) * r, randn(i, 43) * 1.4, Math.sin(a) * r], r,
          scale: .62 + rand(i, 44) * .5, tint: amber ? '#F5A524' : tints[i % tints.length], amber,
          dec: r > 16 ? 3 : 2, phase: rand(i, 45) * 6.283, spin: (rand(i, 46) - .5) * .12,
        });
      }
      // links: each cloud to its 2 nearest neighbours (dedup)
      const seen = new Set();
      inst.forEach((A, i) => {
        const near = inst.map((B, j) => [j, (A.offset[0] - B.offset[0]) ** 2 + (A.offset[1] - B.offset[1]) ** 2 + (A.offset[2] - B.offset[2]) ** 2])
          .filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2);
        for (const [j] of near) { const key = Math.min(i, j) + '-' + Math.max(i, j); if (!seen.has(key)) { seen.add(key); edges.push([i, j]); } }
      });

      // ---- the returning wordmark + particle targets ----
      wm = makeWordmark({ text: 'QUORUM', size: 184, weight: 800, spacing: 42, cx: 960, baseY: BASE_Y });
      const S = wm.samples(6), bb = wm.bbox;
      parts = S.map(([x, y], i) => {
        const xn = (x - bb.x) / bb.w, pal = rand(i, 53);
        return {
          x, y, src: 1 + Math.floor(rand(i, 51) * (inst.length - 1)), jx: randn(i, 55) * 26, jy: randn(i, 56) * 18,
          start: WM - 1.05 + .42 * xn + rand(i, 52) * .18, dur: .5 + rand(i, 54) * .1,
          bend: (rand(i, 57) - .5) * 360, size: .75 + rand(i, 58) * .6, ph: rand(i, 59) * 6.283,
          color: pal < .55 ? '#9DA9FF' : pal < .85 ? '#C9D2FF' : pal < .95 ? '#7C8CFF' : '#FFFFFF',
        };
      });

      // ---- DOM text ----
      lineBox = el('div', { cls: 'abs', style: 'left:0;right:0;top:748px;text-align:center;font-size:62px;font-weight:700;line-height:1.22;color:#fff;letter-spacing:.2px;text-shadow:0 4px 30px rgba(0,0,0,.8)' }, root);
      const L1 = el('div', {}, lineBox), L2 = el('div', {}, lineBox);
      const add = (parent, words, amber) => words.split(' ').forEach(w => lineWords.push(el('span', { text: w, style: 'display:inline-block;margin:0 .14em' + (amber ? ';color:#F5A524' : '') }, parent)));
      add(L1, 'Shared memory for small teams', false);
      add(L2, 'that work where', false); add(L2, 'the signal doesn\'t.', true);

      hair = el('div', { cls: 'abs', style: `left:560px;width:800px;top:${BASE_Y + 44}px;height:2px;background:linear-gradient(90deg,transparent,rgba(124,140,255,.9),transparent)` }, root);
      price = el('div', { cls: 'abs', style: `left:0;right:0;top:${BASE_Y + 78}px;text-align:center;font-size:46px;font-weight:600;color:#E8ECF4`,
        html: 'Priced per team, per month. <span style="color:#9DA9FF">We\'re customer zero.</span>' }, root);
      creds = el('div', { cls: 'abs', style: `left:0;right:0;top:${BASE_Y + 196}px;text-align:center;font-size:30px;font-weight:600;color:#9AA4C0;letter-spacing:.6px`,
        html: 'Code Cubicle 6.0 <span style="color:#5B6478;margin:0 10px">·</span> PS3 <span style="color:#5B6478;margin:0 10px">·</span> <span style="color:#9DA9FF">Qdrant Edge</span>' }, root);
      url = el('div', { cls: 'abs', style: `left:0;right:0;top:${BASE_Y + 252}px;text-align:center` }, root);
      el('span', { cls: 'mono', style: 'display:inline-flex;align-items:center;gap:14px;font-size:30px;color:#C9D2FF;padding:10px 26px;border-radius:14px;background:rgba(124,140,255,.08);border:1px solid rgba(124,140,255,.3)',
        html: '<svg width="30" height="30" viewBox="0 0 16 16" style="display:block"><path fill="#C9D2FF" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>github.com/ImTani/quorum-edge-memory' }, url);
    },

    render(t, lt, fade) {
      // ---- camera: from inside our cloud, pull far back (log-space dolly) ----
      const px = P(t, PULL, 3.2), pk = lerp(easeInOutCubic(px), easeOutQuart(px), .6);   // front-loaded dolly: the constellation is on screen by ~139.5
      const dist = Math.exp(lerp(Math.log(2.7), Math.log(33), pk)) * (1 + .06 * easeInOutSine(P(t, PULL + 3.2, END - PULL - 3.2)));
      const pitch = lerp(.26, .64, pk), yaw = lerp(-.2, .35, pk) + .012 * (t - START);
      const wmK = E(t, WM - .8, 1.6, easeInOutCubic);                    // clouds step back for the wordmark
      cloud.set({
        opacity: lerp(.85, 1, pk) * lerp(1, .42, wmK), spin: .05, nebula: lerp(1.2, 1.8, pk),
        dof: lerp(.8, .03, clamp(pk * 1.6)), fog: lerp(1, .1, pk), pointScale: lerp(1, 1.5, pk),
      });
      cloud.setCamera({ target: [0, lerp(0, -.6, pk), 0], dist, yaw, pitch, orbit: 0, fov: 46, focus: dist });

      const aOf = I => I.r === 0 ? 1 : clamp(P(t, PULL + .05 + I.r * .025, .8)) * (I.amber ? 1.35 : 1.2);   // ~1.5x brighter teams
      cloud.setInstances(inst.map(I => ({
        offset: I.offset, alpha: aOf(I), tint: I.tint, decimate: I.dec, scale: I.scale, spin: I.spin || 0, phase: I.phase,
      })));

      // ---- links, packets, labels + wordmark particles (cloud canvas, under the DOM) ----
      cloud.draw2D((ctx, tt, f) => {
        const proj = cloud.projector(true);
        const s = 1 + DRIFT * clamp((tt - START) / (END - START), -.1, 1.1);  // match the root drift zoom
        const P2 = p => { const q = proj(p); return { x: 960 + (q.x - 960) * s, y: 540 + (q.y - 540) * s, vis: q.vis }; };
        const C = inst.map(I => P2(I.offset)), C0 = inst.map(I => proj(I.offset));
        const linkK = E(tt, PULL + 1.1, 1.6, easeOutCubic) * lerp(1, .45, wmK);
        ctx.globalCompositeOperation = 'lighter';
        edges.forEach(([i, j], n) => {
          const A = C[i], B = C[j]; if (!A.vis || !B.vis) return;
          const a = f * linkK * Math.min(aOf(inst[i]), aOf(inst[j]));
          if (a <= .01) return;
          const off = inst[i].amber || inst[j].amber;
          ctx.globalAlpha = a * (off ? .32 : .26); ctx.strokeStyle = off ? '#F5A524' : '#9DA9FF'; ctx.lineWidth = 1.3;
          ctx.setLineDash(off ? [5, 9] : []);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
          if (!off) { // sync packets travel along live links
            const u = ((tt - START) * (.28 + rand(n, 61) * .2) + rand(n, 62)) % 1;
            drawGlow(ctx, lerp(A.x, B.x, u), lerp(A.y, B.y, u), 7, '#22C55E', a * .8 * Math.sin(u * Math.PI));
          }
        });
        ctx.setLineDash([]);

        // "your team" tag on our cloud
        const la = f * win(tt, PULL + 1.6, WM - .7, .6, .5);
        if (la > .01 && C[0].vis) {
          const x0 = C[0].x, y0 = C[0].y - 16, x1 = x0 + 60, y1 = y0 - 70;
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = la;
          ctx.strokeStyle = 'rgba(201,210,255,.8)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + 22, y1); ctx.stroke();
          ctx.font = `600 26px ${FONT}`; const tw = ctx.measureText('your team').width;
          ctx.fillStyle = 'rgba(10,14,22,.86)'; roundRect(ctx, x1 + 28, y1 - 22, tw + 28, 44, 10); ctx.fill();
          ctx.strokeStyle = 'rgba(157,169,255,.55)'; ctx.stroke();
          ctx.fillStyle = '#E8ECF4'; ctx.textBaseline = 'middle'; ctx.fillText('your team', x1 + 42, y1 + 1); ctx.textBaseline = 'alphabetic';
          ctx.globalCompositeOperation = 'lighter';
        }

        // particles stream from the constellation into the wordmark
        ctx.setTransform(s, 0, 0, s, 960 * (1 - s), 540 * (1 - s));
        const lock = E(tt, WM, .35, easeOutCubic);
        for (let i = 0; i < parts.length; i++) {
          const q = parts[i];
          if (tt < q.start - .05) continue;
          const k = easeInOutCubic(P(tt, q.start, q.dur));
          let x, y;
          if (k < 1) {
            const src = C0[q.src]; const sx = (src.vis ? src.x : 960) + q.jx, sy = (src.vis ? src.y : 540) + q.jy;
            const mx = (sx + q.x) / 2 + q.bend * .35, my = (sy + q.y) / 2 - q.bend * .6;
            const u = 1 - k; x = u * u * sx + 2 * u * k * mx + k * k * q.x; y = u * u * sy + 2 * u * k * my + k * k * q.y;
          } else { x = q.x + Math.sin(tt * 2.1 + q.ph) * .8; y = q.y + Math.cos(tt * 1.7 + q.ph) * .8; }
          const arrive = pulse(tt, q.start + q.dur, .1);
          const post = lerp(1, .18 + .1 * Math.sin(tt * 3 + q.ph), lock);
          const a = f * P(tt, q.start, .2) * post * (.55 + .45 * arrive) * (k > 0 && k < 1 ? 1.3 : 1);
          drawGlow(ctx, x, y, (6 + 5 * arrive) * q.size, q.color, a * .85, true);
        }
        const sweep = easeInOutSine(P(tt, WM + .05, .6));   // matches C: 144.05-144.65 specular pass
        const bloom = pulse(tt, WM + .06, .16);
        wm.draw(ctx, f * lock, sweep > 0 && sweep < 1 ? sweep : -1, 1 + bloom * 1.5 + .15 * Math.sin(tt * 1.3));
        drawGlow(ctx, 960, BASE_Y - 66, 520 * (.6 + .4 * bloom), '#7C8CFF', f * bloom * .35, false);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      });

      // ---- DOM text ----
      staggerIn(lineWords, t, LINE, .065, { d: .6, dy: 20, blur: 8 });
      const lo = E(t, WM - .6, .5, easeInOutCubic);
      xf(lineBox, { y: 30 * lo, o: 1 - lo });
      const hk = easeOutExpo(P(t, WM + .25, .9));
      hair.style.opacity = hk * .9; hair.style.transform = `scaleX(${hk})`;
      show(price, t, PRICE, .8, { dy: 22, blur: 8 });
      show(creds, t, CREDS, .7, { dy: 18, blur: 6 });
      show(url, t, CREDS + .15, .7, { dy: 18, blur: 6 });

      // ---- end on full black ----
      const blk = easeInOutSine(P(t, BLACK, END - BLACK));
      Q.setBlack(blk);                                   // #black now covers scene DOM too
    }
  });
})();
