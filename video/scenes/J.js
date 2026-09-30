/* Scene J: Privacy tiers (114–124 s).
 * 114.5 three stacked glass planes (Device only / My devices / Team) in 3D perspective
 * 116.0 client-deadline points rise from the Device plane to the Team plane
 * 118.0 a private point ("friend's private news") hits the boundary, a lock flashes, it bounces back
 * 119.5 code chip `filter: tier ∈ viewer_tiers` types in
 * 120.0 caption · 122.5 sub-line "No cloud calls. The local model does the reading."
 */
(function () {
  const START = 114, END = 124;
  const T = { planes: 114.5, labels: 114.95, rise: 116.0, privLabel: 117.0, privRise: 117.35, hit: 118.0, code: 119.5, sub: 122.5 };
  const PW2 = 2.15, PD2 = 1.05;           // plane half-width / half-depth (world units)
  const LV = [-1.72, 0, 1.72];             // plane heights: device, my devices, team
  const TIERS = [
    { name: 'Device only', sub: 'never leaves this laptop', tag: 'device', color: COL.amber },
    { name: 'My devices', sub: 'my laptop + my phone only', tag: 'my_devices', color: COL.indigo },
    { name: 'Team', sub: 'synced to everyone on the team', tag: 'team', color: COL.green },
  ];
  const CX = 810, CY = 410, F = 1480, DIST = 9;
  const PRIV = [-1.05, .42];               // xz of the private point
  let code, codeTxt, subLine;
  // scene I's closing cloud camera, replicated so the I->J handoff is continuous
  const SPIN = .035;
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const K18 = cloud.KEYS.note18, K16 = cloud.KEYS.email16;
  const IMID = lerp3(K18, K16, .5), IDIR = [K16[0] - K18[0], K16[1] - K18[1], K16[2] - K18[2]];
  function iCam(t) {
    const a = t * SPIN, d = rotY(IDIR, a);
    return { yaw: Math.atan2(d[2], -d[0]) + .32 + (t - 100) * .012, target: rotY([IMID[0], IMID[1] - .02, IMID[2]], a) };
  }
  const CODE_A = 'filter: tier ', CODE_B = ' viewer_tiers';
  const ELEM_SVG = '<svg width="17" height="22" viewBox="0 0 17 22" style="vertical-align:-3px;margin:0 .5px"><path d="M14 5.5H9a5.5 5.5 0 0 0 0 11h5M3.5 11h10.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
  let dots = [], risers = [];

  // ---- tiny 3D projector (own camera; independent of the cloud) ----
  let cam = { yaw: 0, pitch: .5, cy: 0, cp: 1, sy: 0, sp: 0 };
  function setCam(t) {
    const yaw = -.34 + .07 * easeInOutSine(P(t, START - .5, END - START + 1)) + .012 * Math.sin(t * .6);
    const pitch = lerp(.62, .5, easeOutCubic(P(t, START - .3, 2.2)));
    cam = { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
  }
  function pj(x, y, z) {
    const x1 = x * cam.cy - z * cam.sy, z1 = x * cam.sy + z * cam.cy;
    const y2 = y * cam.cp - z1 * cam.sp, z2 = y * cam.sp + z1 * cam.cp;
    const d = DIST - z2, s = F / d;
    return { x: CX + x1 * s, y: CY - y2 * s, s: s / (F / DIST) };
  }
  const tierColor = y => y <= LV[1] ? mixColor(COL.amber, COL.indigo, clamp(invLerp(LV[0], LV[1], y))) : mixColor(COL.indigo, COL.green, clamp(invLerp(LV[1], LV[2], y)));
  const easeOutBounce = x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375; return n * (x -= 2.625 / d) * x + .984375; };

  // ---- drawing helpers ----
  function planePath(ctx, lv, dy, inset = 0) {
    const y = lv + dy, w = PW2 - inset, d = PD2 - inset;
    const c = [pj(-w, y, -d), pj(w, y, -d), pj(w, y, d), pj(-w, y, d)];
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y); ctx.closePath();
    return c;
  }
  function drawPlane(ctx, i, t, f) {
    const tier = TIERS[i], t0 = T.planes + i * .18;
    const k = E(t, t0, 1.0, easeOutCubic); if (k <= 0) return;
    const dy = -.55 * (1 - k), a = f * clamp(k * 1.4);
    const flash = i === 1 ? pulse(t, T.hit + .04, .22) : 0;
    const col = tier.color, y = LV[i] + dy;
    ctx.save();
    // glass body
    const c = planePath(ctx, LV[i], dy);
    const g = ctx.createLinearGradient(0, Math.min(c[0].y, c[1].y), 0, Math.max(c[2].y, c[3].y));
    g.addColorStop(0, rgba(col, .035 * a)); g.addColorStop(1, rgba(col, (.13 + .15 * flash) * a));
    ctx.fillStyle = g; ctx.fill();
    // diagonal sheen
    const sx = lerp(c[3].x - 300, c[1].x + 300, (((t - t0) * .09) % 1 + 1) % 1);
    const sh = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, `rgba(255,255,255,${.045 * a})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fill();
    // grid
    ctx.strokeStyle = rgba(col, .09 * a); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 1; gx < 10; gx++) { const x = lerp(-PW2, PW2, gx / 10); const p = pj(x, y, -PD2), q = pj(x, y, PD2); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    for (let gz = 1; gz < 6; gz++) { const z = lerp(-PD2, PD2, gz / 6); const p = pj(-PW2, y, z), q = pj(PW2, y, z); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    // slab front edge (glass thickness)
    const th = .07, fl = pj(-PW2, y, PD2), fr = pj(PW2, y, PD2), fl2 = pj(-PW2, y - th, PD2), fr2 = pj(PW2, y - th, PD2), rb = pj(PW2, y, -PD2), rb2 = pj(PW2, y - th, -PD2);
    ctx.beginPath(); ctx.moveTo(fl.x, fl.y); ctx.lineTo(fr.x, fr.y); ctx.lineTo(fr2.x, fr2.y); ctx.lineTo(fl2.x, fl2.y); ctx.closePath();
    ctx.fillStyle = rgba(col, .28 * a); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fr.x, fr.y); ctx.lineTo(rb.x, rb.y); ctx.lineTo(rb2.x, rb2.y); ctx.lineTo(fr2.x, fr2.y); ctx.closePath();
    ctx.fillStyle = rgba(col, .16 * a); ctx.fill();
    // edges, drawn in
    const per = c.reduce((s, p, j) => s + Math.hypot(c[(j + 1) % 4].x - p.x, c[(j + 1) % 4].y - p.y), 0);
    const ek = E(t, t0 + .05, 1.1, easeInOutCubic);
    planePath(ctx, LV[i], dy);
    ctx.setLineDash([per * ek, per]); ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, (.16 + .3 * flash) * a); ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = rgba(mixColor(col, '#ffffff', .25 + .5 * flash), (.85) * a); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  function drawLabel(ctx, i, t, f) {
    const tier = TIERS[i], t0 = T.labels + i * .15;
    const k = E(t, t0, .7); if (k <= 0) return;
    const a = f * clamp(k * 1.2);
    const anchor = pj(PW2, LV[i], .15);
    const lx = 1330 + 20 * (1 - k), ly = anchor.y - 8;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgba(tier.color, .7); ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(anchor.x + 6, anchor.y); ctx.lineTo(lx - 16, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = tier.color; ctx.beginPath(); ctx.arc(anchor.x + 6, anchor.y, 3.5, 0, 6.283); ctx.fill();
    // label card
    ctx.font = `700 36px ${FONT}`; const nw = ctx.measureText(tier.name).width;
    ctx.font = `500 22px ${FONT}`; const sw = ctx.measureText(tier.sub).width;
    const bw = Math.max(nw + 150, sw) + 40, bh = 92, bx = lx - 12, by = ly - 40;
    ctx.fillStyle = 'rgba(12,16,26,.82)'; roundRect(ctx, bx, by, bw, bh, 14); ctx.fill();
    ctx.strokeStyle = rgba(tier.color, .45); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = tier.color; roundRect(ctx, bx, by + 14, 4, bh - 28, 2); ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mixColor(tier.color, '#ffffff', .15); ctx.font = `700 36px ${FONT}`; ctx.fillText(tier.name, bx + 22, by + 30);
    // mono tier tag
    ctx.font = `600 19px Consolas,monospace`; const tw = ctx.measureText(tier.tag).width;
    const tx = bx + 22 + nw + 16;
    ctx.fillStyle = rgba(tier.color, .14); roundRect(ctx, tx, by + 17, tw + 18, 27, 8); ctx.fill();
    ctx.fillStyle = tier.color; ctx.fillText(tier.tag, tx + 9, by + 31);
    ctx.fillStyle = COL.sub; ctx.font = `500 22px ${FONT}`; ctx.fillText(tier.sub, bx + 22, by + 67);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  function ringOnPlane(ctx, x, y, z, r, color, a, squash = 1) {
    if (a <= .01) return;
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) { const an = j / 40 * 6.283; const p = pj(x + Math.cos(an) * r, y, z + Math.sin(an) * r * squash); j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.globalAlpha = clamp(a); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function drawLock(ctx, x, y, s, color, a, flash) {
    if (a <= .01) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    drawGlow(ctx, 0, 0, 90, color, a * (.35 + .6 * flash), false);
    ctx.globalAlpha = clamp(a);
    ctx.lineWidth = 6; ctx.strokeStyle = mixColor(color, '#ffffff', .2 + .6 * flash); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -12, 13, Math.PI, 0); ctx.lineTo(13, -2); ctx.moveTo(-13, -12); ctx.lineTo(-13, -2); ctx.stroke();
    ctx.fillStyle = mixColor(color, '#ffffff', .15 + .6 * flash); roundRect(ctx, -22, -4, 44, 34, 7); ctx.fill();
    ctx.fillStyle = '#1A1206'; ctx.beginPath(); ctx.arc(0, 9, 4.5, 0, 6.283); ctx.fill(); ctx.fillRect(-2, 10, 4, 10);
    ctx.restore();
  }
  function tagLabel(ctx, x, y, text, color, a, side = 1) {
    if (a <= .01) return;
    ctx.save(); ctx.globalAlpha = clamp(a);
    ctx.font = `600 24px ${FONT}`; const w = ctx.measureText(text).width + 28;
    const x1 = x + side * 34, y1 = y - 44, bx = side > 0 ? x1 + 4 : x1 - 4 - w;
    ctx.strokeStyle = rgba(color, .85); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + side * 8, y - 8); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = 'rgba(10,14,22,.88)'; roundRect(ctx, bx, y1 - 20, w, 40, 10); ctx.fill();
    ctx.strokeStyle = rgba(color, .6); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = mixColor(color, '#ffffff', .25); ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 14, y1 + 1);
    ctx.restore();
  }

  Scene({
    id: 'J', start: START, end: END,
    drift: .03,
    captions: [[120.0, 124.0, 'Private stays private. Every Qdrant search carries a tier filter.']],

    build(root) {
      // static population on each plane (deterministic)
      const counts = [15, 7, 8];
      for (let i = 0; i < 3; i++) for (let j = 0; j < counts[i]; j++) {
        let x = (rand(i * 50 + j, 1) * 2 - 1) * (PW2 - .3), z = (rand(i * 50 + j, 2) * 2 - 1) * (PD2 - .2);
        if (i === 0 && Math.hypot(x - PRIV[0], z - PRIV[1]) < .45) x += .9;
        dots.push({ tier: i, x, z, ph: rand(i * 50 + j, 3) * 6.28, t0: T.planes - .25 + i * .2 + rand(i * 50 + j, 4) * .75, dur: .95 + rand(i * 50 + j, 6) * .3, src: (i * 50 + j) * 53 % cloud.N, size: .8 + rand(i * 50 + j, 5) * .5 });
      }
      // client-deadline risers (Device -> Team)
      for (let j = 0; j < 5; j++) risers.push({ x: .35 + j * .32 + (rand(j, 8) - .5) * .12, z: -.55 + rand(j, 9) * .9, t0: T.rise + j * .12, dur: 1.35 + rand(j, 10) * .2, ph: rand(j, 11) * 6.28 });

      code = el('div', { cls: 'card', style: 'left:1330px;top:716px;padding:14px 22px 16px;border-radius:16px;border-color:rgba(124,140,255,.5)' }, root);
      h(`<div style="display:flex;align-items:center;gap:10px;font-size:18px;color:#9AA4C0;letter-spacing:.6px;margin-bottom:8px">
          <span style="width:9px;height:9px;border-radius:50%;background:#7C8CFF;box-shadow:0 0 10px #7C8CFF"></span>EVERY QDRANT SEARCH</div>`, code);
      codeTxt = el('div', { cls: 'mono', style: 'font-size:30px;color:#E8ECF4;white-space:nowrap;min-width:470px' }, code);
      subLine = el('div', { cls: 'abs', style: 'left:0;right:0;top:826px;display:flex;justify-content:center' }, root);
      h(`<div style="display:flex;align-items:center;gap:14px;font-size:30px;color:#9AA4C0;font-weight:500">
          <svg width="40" height="34" viewBox="0 0 40 34" fill="none" stroke="#9AA4C0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 26h19a7 7 0 0 0 .8-13.96A10 10 0 0 0 11.4 14 6 6 0 0 0 11 26z"/><path d="M5 31L35 3" stroke="#F5A524"/></svg>
          <span><span style="color:#E8ECF4;font-weight:600">No cloud calls.</span> The local model does the reading.</span></div>`, subLine);
    },

    render(t, lt, fade) {
      // ambient cloud: dim, far, slow; the planes are the hero here
      const hk = easeInOutCubic(P(t, START + .1, 1.7));
      const ic = iCam(t);
      cloud.set({ opacity: lerp(.78, .3, hk), nebula: lerp(1, .7, hk), dof: lerp(.7, .8, hk), spin: SPIN,
        rect: { x: lerp(1060, 0, hk), y: lerp(20, 0, hk), w: lerp(860, 1920, hk), h: lerp(1000, 1080, hk) } });
      cloud.setCamera({ target: lerp3(ic.target, [0, 0, 0], hk), dist: lerp(3.6, 5.4, hk), yaw: ic.yaw + .5 * hk, pitch: lerp(.3, .45, hk), orbit: 0, fov: 46 });

      // DOM: code chip + sub-line
      const ck = show(code, t, T.code - .15, .6, { dy: 18, scale: .92, blur: 6 });
      {
        const L = CODE_A.length + 1 + CODE_B.length, cps = 34, end = T.code + L / cps;
        const n = Math.floor(clamp((t - T.code) * cps, 0, L));
        const cur = t >= T.code - .3 && t < end + 1.4 && (t < end || blink(t, 1.6));
        setHTML(codeTxt, esc(CODE_A.slice(0, n)) + (n > CODE_A.length ? ELEM_SVG : '') + (n > CODE_A.length + 1 ? esc(CODE_B.slice(0, n - CODE_A.length - 1)) : '')
          + (cur ? '<span style="color:#7C8CFF;font-weight:400;margin-left:1px">▍</span>' : ''));
      }
      code.style.boxShadow = `0 30px 80px rgba(0,0,0,.55),0 0 ${40 * pulse(t, T.code + .9, .35)}px rgba(124,140,255,.5)`;
      void ck;
      show(subLine, t, T.sub, .7, { dy: 16, blur: 6 });

      cloud.draw2D((ctx, t2, f) => {
        setCam(t2);
        const s = 1 + .03 * clamp((t2 - START) / (END - START), -.1, 1.1); // match the root drift zoom
        ctx.setTransform(s, 0, 0, s, 960 * (1 - s), 540 * (1 - s));
        ctx.globalCompositeOperation = 'source-over';

        // collect every glowing point with its world height, then interleave with planes (painter order)
        const pts = [];
        const flying = [];
        const cproj = cloud.projector();
        for (const d of dots) {
          if (t2 < d.t0) continue;
          if (t2 < d.t0 + d.dur) { flying.push(d); continue; }
          const k = 1 + 1.2 * pulse(t2, d.t0 + d.dur, .12);
          const y = LV[d.tier] + .06 + .025 * Math.sin(t2 * 1.6 + d.ph);
          pts.push({ x: d.x, y, z: d.z, color: TIERS[d.tier].color, a: k * (.75 + .25 * Math.sin(t2 * 2 + d.ph)), r: 13 * d.size });
        }
        const ripples = [];
        for (const r of risers) {
          const k0 = E(t2, r.t0 - .9, .6, easeOutCubic); if (k0 <= 0) continue;
          const k = easeInOutCubic(P(t2, r.t0, r.dur));
          const y = lerp(LV[0], LV[2], k) + .06 + .02 * Math.sin(t2 * 1.6 + r.ph);
          const charge = pulse(t2, r.t0 - .1, .25); // pre-rise glow
          pts.push({ x: r.x, y, z: r.z, color: tierColor(y), a: k0, r: 21 * (1 + .5 * charge), trail: k > 0 && k < 1 ? k : 0, flash: pulse(t2, r.t0 + r.dur, .15) });
          // crossing ripples on My devices and Team planes
          for (const [lv, kk, col] of [[LV[1], .5, COL.indigo], [LV[2], 1, COL.green]]) {
            const tc = r.t0 + r.dur * (kk === 1 ? 1 : .5); const q = P(t2, tc, .9);
            if (q > 0 && q < 1) ripples.push([r.x, lv + .01, r.z, .08 + .55 * easeOutCubic(q), col, (1 - q) * .8]);
          }
        }
        // private point: rises, hits the My devices plane, bounces back down
        let py;
        const privK = E(t2, T.privLabel - .9, .6, easeOutCubic);
        if (t2 < T.privRise) py = LV[0];
        else if (t2 < T.hit) py = lerp(LV[0], LV[1] - .12, easeInCubic(P(t2, T.privRise, T.hit - T.privRise)));
        else py = lerp(LV[1] - .12, LV[0], easeOutBounce(P(t2, T.hit, .95)));
        py += .06;
        const hit = pulse(t2, T.hit + .02, .12);
        if (privK > 0) pts.push({ x: PRIV[0], y: py, z: PRIV[1], color: COL.amber, a: privK, r: 17 * (1 + .6 * hit), priv: true, trail: t2 > T.privRise && t2 < T.hit ? P(t2, T.privRise, .65) * .5 : 0 });

        const drawPt = (p) => {
          const q = pj(p.x, p.y, p.z);
          const a = f * p.a;
          if (p.trail) {
            const base = pj(p.x, Math.max(LV[0], p.y - .9 * Math.min(1, p.trail * 3)), p.z);
            const g = ctx.createLinearGradient(base.x, base.y, q.x, q.y);
            g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(1, rgba(p.color, .7 * a));
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = g; ctx.lineWidth = 5 * q.s; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
          }
          drawGlow(ctx, q.x, q.y, p.r * 2.6 * q.s * (1 + (p.flash || 0)), p.color, a * .8, false);
          drawGlow(ctx, q.x, q.y, p.r * q.s, mixColor(p.color, '#ffffff', .35), a, true);
        };

        const order = pts.slice().sort((a, b) => a.y - b.y);
        let pi = 0;
        for (let i = 0; i < 3; i++) {
          while (pi < order.length && order[pi].y < LV[i] - .001) drawPt(order[pi++]);
          drawPlane(ctx, i, t2, f);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (const r of ripples) if (Math.abs(r[1] - LV[i]) < .05) ringOnPlane(ctx, r[0], r[1], r[2], r[3], r[4], f * r[5]);
          ctx.restore();
        }
        while (pi < order.length) drawPt(order[pi++]);

        // cloud points in flight toward their tier plane
        for (const d of flying) {
          const k = easeInOutCubic(P(t2, d.t0, d.dur));
          const sp = cproj(cloud.ambientLocal(d.src, t2));
          const sx = sp.vis ? (sp.x - 960 * (1 - s)) / s : 1500, sy = sp.vis ? (sp.y - 540 * (1 - s)) / s : 540;
          const q = pj(d.x, LV[d.tier] + .06, d.z);
          const bend = (rand(d.src, 91) - .5) * 260;
          const mx = (sx + q.x) / 2 + bend * .3, my = (sy + q.y) / 2 - 120 - bend * .4;
          const u = 1 - k, x = u * u * sx + 2 * u * k * mx + k * k * q.x, y = u * u * sy + 2 * u * k * my + k * k * q.y;
          const col = mixColor('#C9D2FF', TIERS[d.tier].color, easeInCubic(k));
          const a = f * clamp(P(t2, d.t0, .15)) * (1.1 - .2 * k);
          drawGlow(ctx, x, y, 30 * d.size * lerp(.6, q.s, k), col, a * .7, false);
          drawGlow(ctx, x, y, 11 * d.size * lerp(.6, q.s, k), mixColor(col, '#ffffff', .4), a, true);
        }

        // impact: lock + ripple on the underside of the My devices plane
        const lk = spring(P(t2, T.hit, .7));
        const lockA = f * clamp(P(t2, T.hit - .02, .08)) * lerp(1, .8, P(t2, T.hit + 1.2, .8));
        const lp = pj(PRIV[0], LV[1] + .02, PRIV[1]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [dly, mul] of [[0, 1], [.12, .6]]) {
          const q = P(t2, T.hit + dly, 1.0);
          if (q > 0 && q < 1) ringOnPlane(ctx, PRIV[0], LV[1] + .01, PRIV[1], .1 + .75 * mul * easeOutExpo(q), COL.amber, f * (1 - q) * .95);
        }
        drawGlow(ctx, lp.x, lp.y, 160 * (.6 + .6 * hit), '#FFFFFF', f * hit * .45, false);
        // impact sparks
        const sq = P(t2, T.hit, .6);
        if (sq > 0 && sq < 1) for (let j = 0; j < 12; j++) {
          const an = rand(j, 31) * 6.283, v = (.25 + .45 * rand(j, 32)) * easeOutCubic(sq);
          const p = pj(PRIV[0] + Math.cos(an) * v, LV[1] - .02, PRIV[1] + Math.sin(an) * v);
          drawGlow(ctx, p.x, p.y, 8, j % 3 ? COL.amber : '#ffffff', f * (1 - sq) * .9);
        }
        ctx.restore();
        drawLock(ctx, lp.x, lp.y - 54 * lk, lerp(.3, 1, lk) * (1 + .25 * hit), COL.amber, lockA, hit + .5 * pulse(t2, T.hit + .12, .2));

        // labels: plane tiers + moving tags
        for (let i = 0; i < 3; i++) drawLabel(ctx, i, t2, f);
        const lead = risers[2]; const lk2 = easeInOutCubic(P(t2, lead.t0, lead.dur));
        const ly = lerp(LV[0], LV[2], lk2) + .06;
        const lq = pj(lead.x, ly, lead.z);
        tagLabel(ctx, lq.x, lq.y, lk2 < .98 ? 'client deadlines' : 'client deadlines → Team', tierColor(ly), f * win(t2, T.rise - .3, 119.2, .4, .5), 1);
        const pq = pj(PRIV[0], py, PRIV[1]);
        tagLabel(ctx, pq.x, pq.y, "friend's private news", COL.amber, f * win(t2, T.privLabel, 121.0, .4, .6), -1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      });
    }
  });
})();
