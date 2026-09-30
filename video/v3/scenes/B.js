/* Scene B: Problem (14–24 s).
 * 14.2 WhatsApp (dark mode) slides in from the left (storyboard 14.5), lands 14.7
 * 16.0 email (dark mode) slides in from the right, lands 16.2
 * 17.5 the dates lift out of the messages and SLAM to centre: "18th" (amber) · "16th" (green), 180px
 * 18.5 red "?" pops between them with an RGB-split glitch shake (~0.3 s)
 * 19.5 caption
 * 23.0 the three glyphs dissolve into particles that fly into the 3D cloud (C then pulls
 *      particles back out of the cloud to build the wordmark, so it plays as one move)
 */
(function () {
  const START = 14, END = 24;
  const WA_IN = 14.2, EM_IN = 16.0, SLAM = 17.5, QM = 18.5, DIS = 23.0;
  const FLY = .34;                                   // flight time; the impact lands exactly on SLAM
  const NUM_Y = 492, X18 = 590, X16 = 1330, XQ = 960;
  const TAU = Math.PI * 2;
  // shared with scene A (continuous cloud camera 0 -> 24 s, meets C's camera at 24)
  const camDist = t => lerp(7.6, 4.9, easeInOutSine(clamp(t / 23.75)));
  const rectY = t => lerp(-150, 0, easeInOutSine(P(t, 12.5, 11)));

  let rootEl, wrap, wa, em, waBubble, waCtx, waWord, emWord, tag18, tag16, clockEl;
  let G18, G16, GQ, GQc, GQr, parts = [], cv, cx2;

  /* ---------- canvas glyph sprite (2x supersampled) with glow + particle samples ---------- */
  function glyph(text, size, c1, c2, glowCol, weight = 800, spacing = -4) {
    const S = 2, font = `${weight} ${size * S}px ${FONT}`;
    const m = document.createElement('canvas').getContext('2d'); m.font = font; m.letterSpacing = `${spacing * S}px`;
    const mt = m.measureText(text);
    const asc = mt.actualBoundingBoxAscent, dsc = mt.actualBoundingBoxDescent, l = mt.actualBoundingBoxLeft, r = mt.actualBoundingBoxRight;
    const pad = 70 * S, w = Math.ceil(l + r + pad * 2), h = Math.ceil(asc + dsc + pad * 2);
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const img = mk(), c = img.getContext('2d'); c.font = font; c.letterSpacing = `${spacing * S}px`;
    const gr = c.createLinearGradient(0, pad, 0, h - pad); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    c.fillStyle = gr; c.fillText(text, pad + l, pad + asc);
    const glow = mk(), g = glow.getContext('2d'); g.filter = `blur(${22 * S}px)`; g.drawImage(img, 0, 0);
    g.filter = 'none'; g.globalCompositeOperation = 'source-in'; g.fillStyle = glowCol; g.fillRect(0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data, pts = [], step = 9;
    for (let y = 0; y < h; y += step) for (let x = ((y / step) % 2) * step / 2; x < w; x += step) {
      const X = Math.floor(x); if (d[(y * w + X) * 4 + 3] > 150) pts.push([(X - w / 2) / S, (y - h / 2) / S]);
    }
    return { img, glow, w: w / S, h: h / S, pts, ink: (l + r) / S };
  }
  function drawG(ctx, G, x, y, sx, sy, a, glowA = 1) {
    if (a <= .003) return;
    const w = G.w * sx, h = G.h * sy;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a * .6 * glowA); ctx.drawImage(G.glow, x - w / 2, y - h / 2, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(a); ctx.drawImage(G.img, x - w / 2, y - h / 2, w, h);
  }
  // glitched draw: horizontal slices displaced per frame + RGB split ghosts
  function drawGlitch(ctx, G, Gc, Gr, x, y, s, a, amt, t, salt) {
    if (amt <= .001) { drawG(ctx, G, x, y, s, s, a); return; }
    const f = Math.floor(t * 30), w = G.w * s, h = G.h * s, S = G.img.width / G.w;
    const sp = (8 + rand(f, salt + 1) * 16) * amt;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a * .75);
    ctx.drawImage(Gc.img, x - w / 2 - sp, y - h / 2 + sp * .25, w, h);
    ctx.drawImage(Gr.img, x - w / 2 + sp, y - h / 2 - sp * .2, w, h);
    ctx.globalAlpha = clamp(a * .6); ctx.drawImage(G.glow, x - w / 2, y - h / 2, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(a);
    const N = 7;
    for (let k = 0; k < N; k++) {
      const off = rand(f * 13 + k, salt + 2) < .45 ? (rand(f * 7 + k, salt + 3) - .5) * 70 * amt : 0;
      const sy0 = G.img.height * k / N, sh = G.img.height / N;
      ctx.drawImage(G.img, 0, sy0, G.img.width, sh, x - w / 2 + off, y - h / 2 + sy0 / S * s, w, sh / S * s);
    }
  }

  function offsetIn(e, anc) { let x = 0, y = 0; while (e && e !== anc) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return [x, y]; }
  function centreOf(e) { const [x, y] = offsetIn(e, rootEl); return [x + e.offsetWidth / 2, y + e.offsetHeight / 2]; }
  // card slide: arrives at t0 + .2 s, overshoots slightly, settles (spring)
  //   WA: Hermite ease 14.2 -> 14.7, arriving WITH momentum (lands on the 14.7 cue), then a damped overshoot.
  //   email: spring first crosses 1 at x = 1/(4 f) = .286 of .7 s -> lands 16.2, settled ~16.7.
  function slideWA(t) {
    const u = (t - WA_IN) / .5, v1 = 1.2, w = 2 * Math.PI * 1.2;
    if (u <= 0) return 0;
    if (u < 1) return (-2 * u * u * u + 3 * u * u) + v1 * (u * u * u - u * u);
    const q = u - 1; return 1 + (v1 / w) * Math.exp(-8 * q) * Math.sin(w * q);
  }
  const slide = (t, t0) => t0 === WA_IN ? slideWA(t) : spring(P(t, t0, .7), 7, .875);

  const WA_LOGO = `<svg width="42" height="42" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#25D366"/><path fill="#fff" d="M24 11.5c-6.9 0-12.5 5.5-12.5 12.3 0 2.3.6 4.4 1.8 6.3L11.5 36.5l6.6-1.7c1.8 1 3.8 1.5 5.9 1.5 6.9 0 12.5-5.5 12.5-12.3S30.9 11.5 24 11.5zm0 22.6c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.3-.4c-1-1.6-1.6-3.5-1.6-5.4 0-5.7 4.7-10.3 10.5-10.3s10.5 4.6 10.5 10.3S29.8 34.1 24 34.1zm5.8-7.7c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1c-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.1-1.2 2.7 1.2 3.1 1.4 3.4c.2.2 2.3 3.5 5.6 4.9 2.8 1.1 3.3.9 3.9.8.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>`;
  const CLOCK = `<svg width="17" height="17" viewBox="0 0 16 16" style="vertical-align:-3px"><circle cx="8" cy="8" r="6.3" fill="none" stroke="#8696A0" stroke-width="1.4"/><path d="M8 4.6V8.2l2.4 1.4" fill="none" stroke="#8696A0" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const MAIL = `<svg width="30" height="30" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="#22C55E" stroke-width="1.7"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="#22C55E" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

  Scene({
    id: 'B', start: START, end: END,
    captions: [[19.5, 23.7, "Same deadline. Two versions. Nobody notices until it's too late."]],

    build(root) {
      rootEl = root;
      wrap = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px' }, root);

      // ---------------- WhatsApp, dark mode (Tanishk's phone, on set) ----------------
      wa = h(`<div class="abs" style="left:130px;top:214px;width:760px;border-radius:22px;overflow:hidden;background:#0B141A;border:1px solid rgba(255,255,255,.08);box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.3)">
        <div style="height:4px;background:#25D366"></div>
        <div style="display:flex;align-items:center;gap:16px;padding:16px 24px;background:#1F2C34">
          ${WA_LOGO}
          <div style="flex:1;min-width:0">
            <div style="font-size:25px;font-weight:700;color:#E9EDEF;white-space:nowrap"><span style="color:#25D366">WhatsApp</span><span style="color:#8696A0;font-weight:500"> · on set · Tanishk</span></div>
            <div style="font-size:18px;color:#F5A524;margin-top:2px;font-weight:500">Sharma edit crew · waiting for network…</div>
          </div>
        </div>
        <div style="position:relative;padding:18px 26px 26px;background-color:#0B141A;background-image:radial-gradient(rgba(255,255,255,.035) 1.2px,transparent 1.3px);background-size:22px 22px">
          <div style="text-align:center;margin-bottom:14px"><span style="display:inline-block;font-size:16px;letter-spacing:.8px;color:#8696A0;background:#182229;padding:4px 12px;border-radius:8px">TODAY</span></div>
          <div class="wactx" style="max-width:470px;background:#202C33;color:#E9EDEF;border-radius:4px 14px 14px 14px;padding:10px 16px 8px;font-size:23px;line-height:1.3;box-shadow:0 2px 4px rgba(0,0,0,.3)">
            <div style="font-size:18px;font-weight:600;color:#53BDEB;margin-bottom:2px">Lakshya</div>Any word from Sharma on delivery?
            <span style="float:right;font-size:15px;color:#8696A0;margin:10px 0 0 14px">4:09 PM</span></div>
          <div class="wab" style="margin:14px 0 0 auto;max-width:560px;width:fit-content;background:#005C4B;color:#E9EDEF;border-radius:14px 4px 14px 14px;padding:12px 18px 10px;font-size:30px;line-height:1.3;box-shadow:0 2px 4px rgba(0,0,0,.3);transform-origin:100% 0">
            Client says push the Sharma delivery to the <span class="w18" style="display:inline-block;font-weight:700;color:#F5A524">18th</span>
            <span style="float:right;font-size:16px;color:#8FB5AC;margin:14px 0 0 16px;white-space:nowrap">4:12 PM&nbsp;<span class="clk" style="display:inline-block">${CLOCK}</span></span></div>
        </div></div>`, wrap);
      waBubble = $('.wab', wa); waCtx = $('.wactx', wa); waWord = $('.w18', wa); clockEl = $('.clk', wa);

      // ---------------- Email, dark mode (Lakshya's inbox, from the client) ----------------
      em = h(`<div class="abs" style="left:1030px;top:372px;width:760px;border-radius:22px;overflow:hidden;background:#1B1D23;border:1px solid rgba(255,255,255,.08);box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.3)">
        <div style="height:4px;background:#22C55E"></div>
        <div style="display:flex;align-items:center;gap:14px;padding:16px 24px;background:#23262E;border-bottom:1px solid rgba(255,255,255,.06)">
          ${MAIL}
          <div style="flex:1;font-size:25px;font-weight:700;color:#E8EAED;white-space:nowrap">Email<span style="color:#9AA0A6;font-weight:500"> · from </span><span class="mono" style="color:#86EFAC;font-weight:400;font-size:23px">client:sharma</span></div>
          <span style="font-size:16px;color:#9AA0A6;border:1px solid rgba(255,255,255,.14);padding:3px 11px;border-radius:7px">Inbox</span>
        </div>
        <div style="padding:20px 28px 26px">
          <div style="font-size:27px;font-weight:700;color:#E8EAED;margin-bottom:16px">Re: Sharma edit · final delivery</div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
            <div style="width:48px;height:48px;border-radius:50%;background:#0F766E;color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center">S</div>
            <div style="flex:1"><div style="font-size:21px;font-weight:600;color:#E8EAED">Sharma Productions</div><div style="font-size:17px;color:#9AA0A6">to Lakshya</div></div>
            <div style="font-size:17px;color:#9AA0A6">4:31 PM</div>
          </div>
          <div style="font-size:30px;line-height:1.35;color:#E8EAED">Confirming delivery on the <span class="w16" style="display:inline-block;font-weight:700;color:#FFFFFF">16th</span>.</div>
          <div style="font-size:19px;color:#9AA0A6;margin-top:12px">Thanks, R. Sharma</div>
        </div></div>`, wrap);
      emWord = $('.w16', em);

      // own overlay canvas ABOVE the cards (Q.fx sits under scene roots with z>=1, see report)
      cv = el('canvas', { cls: 'abs', attrs: { width: 1920, height: 1080 }, style: 'left:0;top:0;width:1920px;height:1080px;pointer-events:none' }, root);
      cx2 = cv.getContext('2d');
      // source tags under the slammed dates
      const mkTag = (x, html, c) => { const o = el('div', { cls: 'abs', style: `left:${x - 300}px;width:600px;top:${NUM_Y + 140}px;text-align:center` }, root); return chip(html, c, o, 'font-size:27px;padding:8px 22px;font-weight:600;background:rgba(10,14,22,.85)'); };
      tag18 = mkTag(X18, 'Tanishk · WhatsApp · on set', COL.amber);
      tag16 = mkTag(X16, 'client:sharma · email', '#C9D2FF');

      // glyph sprites
      G18 = glyph('18th', 180, '#FFD58C', '#F5A524', '#F5A524');
      G16 = glyph('16th', 180, '#FFFFFF', '#C9D0E0', '#9DA9FF');
      GQ = glyph('?', 210, '#FF8A8A', '#EF4444', '#EF4444');
      GQc = glyph('?', 210, '#22D3EE', '#22D3EE', '#22D3EE');
      GQr = glyph('?', 210, '#FF2D55', '#FF2D55', '#FF2D55');

      // dissolve particles: every sample of the three glyphs flies into an ambient cloud point
      const add = (G, cx, col, k0) => G.pts.forEach(([dx, dy], i) => {
        const n = parts.length;
        parts.push({ dx, dy, cx, col, src: (n * 37 + 11) % cloud.N,
          start: DIS + k0 + (dx + G.ink / 2) / G.ink * .22 + rand(n, 1) * .22, dur: .8 + rand(n, 2) * .3,
          bend: (rand(n, 3) - .5) * 360, size: .7 + rand(n, 4) * .6, ph: rand(n, 5) * TAU });
      });
      add(G18, X18, COL.amber, 0); add(GQ, XQ, COL.red, .12); add(G16, X16, '#E8ECF4', .06);
    },

    render(t, lt, f) {
      cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.globalAlpha = 1; cx2.globalCompositeOperation = 'source-over'; cx2.clearRect(0, 0, 1920, 1080);
      // ---- cloud: dim behind the chats, wakes up for the hand-off into C ----
      const wake = easeInOutSine(P(t, 22.6, 1.3));
      cloud.set({ opacity: lerp(.22, .55, wake), spin: .035, rect: { x: 0, y: rectY(t), w: 1920, h: 1080 } });
      cloud.setCamera({ target: [0, 0, 0], dist: camDist(t), yaw: .15, pitch: .32, orbit: .02, fov: 46 });

      // ---- impact shake (17.5) + small glitch shake (18.5) ----
      const u = t - SLAM, v = t - QM;
      let shx = 0, shy = 0;
      if (u >= 0 && u < .8) { const d = Math.exp(-7 * u); shx += 13 * d * Math.sin(TAU * 11 * u); shy += 9 * d * Math.sin(TAU * 8.5 * u + 1.3); }
      if (v >= 0 && v < .3) { const fr = Math.floor(t * 30); shx += (rand(fr, 41) - .5) * 12; shy += (rand(fr, 42) - .5) * 7; }
      shx = Math.round(shx); shy = Math.round(shy);            // whole pixels: avoids sub-pixel re-raster of the blurred cards
      wrap.style.transform = shx || shy ? `translate(${shx}px,${shy}px)` : 'none';

      // ---- cards: slide + land, idle float, recede under the slam, leave before the dissolve ----
      const rec = E(t, SLAM - .1, .6, easeOutCubic), gone = E(t, 22.5, .7, easeInOutCubic);
      const cardXf = (e, t0, dir, seed) => {
        const k = slide(t, t0);
        const x = dir * 340 * (1 - k) + wiggle(t, seed, .5, 2);
        const y = wiggle(t, seed + 5, .45, 3) + gone * -16;
        const o = clamp(P(t, t0, .14)) * lerp(1, .13, rec) * (1 - gone);
        const s = lerp(1, .94, rec) * lerp(1, .97, gone);
        e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
        e.style.opacity = o.toFixed(4);
        const b = Math.max((1 - P(t, t0, t0 === WA_IN ? .45 : .22)) * 5, rec * 4 + gone * 4);
        e.style.filter = b > .05 ? `blur(${b.toFixed(2)}px)` : 'none';
      };
      cardXf(wa, WA_IN, -1, 3); cardXf(em, EM_IN, 1, 9);
      // bubbles inside the chat settle in just behind the card
      pop(waCtx, t, WA_IN + .3, .6, .92);
      const bk = spring(P(t, WA_IN + .42, .7), 6, 1.6);
      waBubble.style.opacity = clamp(P(t, WA_IN + .42, .12)); waBubble.style.transform = `scale(${lerp(.85, 1, bk).toFixed(4)})`;
      clockEl.style.transform = `rotate(${((t * 140) % 360).toFixed(1)}deg)`;     // pending: no network
      // the dates lift out of the messages when they fly
      const lift = 1 - clamp(P(t, SLAM - FLY, .05));
      waWord.style.opacity = lift; emWord.style.opacity = lift;

      // flight origins (layout coords of the words in the cards)
      const o18 = centreOf(waWord), o16 = centreOf(emWord);
      o18[0] += 0; o16[0] += 0;

      // ---- tags ----
      show(tag18, t, SLAM + .45, .6, { dy: 14, blur: 4, out: 22.55, outD: .4 });
      show(tag16, t, SLAM + .55, .6, { dy: 14, blur: 4, out: 22.55, outD: .4 });

      // ---- glyphs, impacts, glitch, dissolve (drawn above the DOM on the fx canvas) ----
      cloud.draw2D((_ctx, t, fa) => {
        // the overlay canvas lives in the scene root: root opacity + drift already apply to it
        const ctx = cx2; ctx.save(); fa = 1;
        ctx.setTransform(1, 0, 0, 1, shx, shy);
        const dis = E(t, DIS, .45, easeInOutCubic);        // glyphs hand over to particles

        // --- slam: flight (accelerating) -> impact at SLAM -> spring settle ---
        const fl = P(t, SLAM - FLY, FLY), fk = easeInCubic(fl);
        const uu = t - SLAM;
        const settle = uu >= 0 ? 1 + .2 * Math.exp(-6 * uu) * Math.cos(TAU * 2.4 * uu) : 0;
        const squash = uu >= 0 ? Math.exp(-16 * uu) : 0;
        const numA = fa * (1 - dis) * clamp(P(t, SLAM - FLY, .06));
        const gl = (t >= QM && t < QM + .3) ? 1 - P(t, QM, .3) * .6 : 0;       // glitch envelope
        const fr = Math.floor(t * 30);
        const slamOne = (G, o, X, salt) => {
          if (t < SLAM - FLY || numA <= .003) return;
          let x, y, sc, sx, sy;
          if (uu < 0) { x = lerp(o[0], X, fk); y = lerp(o[1], NUM_Y, fk); sc = lerp(30 / 180, 1.2, fk); sx = sy = sc; }
          else { x = X; y = NUM_Y; sc = settle; sx = sc * (1 + .12 * squash); sy = sc * (1 - .14 * squash); }
          // idle breathing + tiny jitter during the "?" glitch
          const br = 1 + .012 * Math.sin((t - SLAM) * 2.2 + salt);
          x += gl * (rand(fr, salt) - .5) * 14; y += gl * (rand(fr, salt + 1) - .5) * 8;
          if (uu < 0) { // motion-blur ghosts during the flight
            for (let g = 1; g <= 3; g++) {
              const k2 = easeInCubic(clamp(fl - g * .07)); const s2 = lerp(30 / 180, 1.2, k2);
              drawG(ctx, G, lerp(o[0], X, k2), lerp(o[1], NUM_Y, k2), s2, s2, numA * .22 / g, .6);
            }
          }
          drawG(ctx, G, x, y, sx * br, sy * br, numA, 1 + 1.4 * pulse(t, SLAM + .04, .14));
        };
        slamOne(G18, o18, X18, 5); slamOne(G16, o16, X16, 9);

        // impact: flash + shockwaves + sparks
        if (uu >= 0 && uu < 1.2) {
          for (const [X, c] of [[X18, COL.amber], [X16, '#C9D2FF']]) {
            drawGlow(ctx, X, NUM_Y, 420, c, fa * .5 * pulse(t, SLAM + .03, .12), false);
            for (const [dl, m] of [[0, 1], [.07, .7]]) {
              const q = P(t, SLAM + dl, .9); if (q <= 0 || q >= 1) continue;
              const rr = 70 + easeOutExpo(q) * 330 * m;
              ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(fa * (1 - q) * (1 - q) * .55); ctx.strokeStyle = c; ctx.lineWidth = 1 + 3 * (1 - q);
              ctx.beginPath(); ctx.ellipse(X, NUM_Y, rr, rr * .55, 0, 0, TAU); ctx.stroke();
            }
            for (let k = 0; k < 14; k++) { // sparks
              const ang = rand(k, X) * TAU, sp = 160 + rand(k, X + 1) * 360, q = P(t, SLAM, .55 + rand(k, X + 2) * .3);
              if (q <= 0 || q >= 1) continue;
              const d = easeOutExpo(q) * sp;
              drawGlow(ctx, X + Math.cos(ang) * d * 1.3, NUM_Y + Math.sin(ang) * d * .6, 9, c, fa * (1 - q) * .9, true);
            }
          }
          // horizontal light streak across the impact line
          const st = pulse(t, SLAM + .02, .1);
          if (st > .01) glowLine(ctx, 140, NUM_Y, 1780, NUM_Y, '#FFFFFF', fa * st * .35, 1.2);
        }

        // --- the red "?" : spring pop + glitch ---
        if (t >= QM && numA > .003) {
          const pk = spring(P(t, QM, .9), 5.5, 1.8);
          const qs = Math.max(0, pk) * (1 + .015 * Math.sin((t - QM) * 3));
          const qa = fa * (1 - dis) * clamp(P(t, QM, .05));
          const jx = gl * (rand(fr, 71) - .5) * 30, jy = gl * (rand(fr, 72) - .5) * 16;
          drawGlow(ctx, XQ, NUM_Y, 260 * qs, COL.red, qa * (.3 + .5 * pulse(t, QM + .05, .2) + .08 * Math.sin(t * 3.4)), false);
          drawGlitch(ctx, GQ, GQc, GQr, XQ + jx, NUM_Y + jy, qs, qa, gl, t, 3);
          if (gl > 0) { // scanline tears across the frame
            ctx.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 5; k++) {
              if (rand(fr * 5 + k, 81) < .35) continue;
              const yy = 180 + rand(fr * 5 + k, 82) * 640, hh = 2 + rand(fr * 5 + k, 83) * 10;
              ctx.globalAlpha = clamp(fa * gl * (.05 + rand(fr * 5 + k, 84) * .12));
              ctx.fillStyle = rand(fr * 5 + k, 85) < .5 ? '#FF2D55' : '#22D3EE';
              ctx.fillRect(0, yy, 1920, hh);
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        // red wash on the glitch
        const wash = fa * pulse(t, QM + .05, .18) * .22;
        if (wash > .005) drawGlow(ctx, 960, 540, 1100, COL.red, wash, false);

        // --- dissolve into the cloud (particles fly to ambient cloud points) ---
        if (t >= DIS - .05) {
          const proj = cloud.projector();
          const sQ = spring(1, 5.5, 1.8);
          for (let i = 0; i < parts.length; i++) {
            const q = parts[i];
            const k = easeInOutCubic(P(t, q.start, q.dur));
            if (k >= 1) continue;
            const hx = q.cx + q.dx * (q.cx === XQ ? sQ : 1), hy = NUM_Y + q.dy;
            let x = hx, y = hy;
            if (k > 0) {
              const sp = proj(cloud.ambientLocal(q.src, t)); const tx = sp.vis ? sp.x : 960, ty = sp.vis ? sp.y : 540;
              const mx = (hx + tx) / 2 + q.bend * .4, my = (hy + ty) / 2 - q.bend * .6;
              const w = 1 - k; x = w * w * hx + 2 * w * k * mx + k * k * tx; y = w * w * hy + 2 * w * k * my + k * k * ty;
            } else { x += Math.sin(t * 9 + q.ph) * .8; }
            const col = mixColor(q.col, '#C9D2FF', easeInCubic(k));
            const a = fa * E(t, DIS - .05, .3, easeOutCubic) * (1 - k * k) * (k > 0 && k < 1 ? 1.2 : .8);
            drawGlow(ctx, x, y, (5.5 + 3 * Math.sin(k * Math.PI)) * q.size, col, a * .8, true);
          }
        }
        ctx.restore();
      });
    }
  });
})();
