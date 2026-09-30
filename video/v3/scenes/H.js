/* Scene H: Reconnect + Qdrant conflict detection (82–100 s). HERO. Continuous with G (shared engine in F.js).
 * 82.5 Tanishk's pill flips to Online, network springs back, the hub link turns green; callout "Back online"
 * 83.0 outbox 1->0 (badge springs 1.6x): packet flies laptop A -> hub (83.5) -> laptop B (84.0);
 *      callout flips to "Outbox 1 -> 0 · synced via home server"
 * 84.0 green pulse wave sweeps the cloud (the 18th turns green: synced)
 * 86.0 both Sharma points flash RED (alert vignette + shake) · 86.3 caption "Back online. Same deadline, two different dates."
 * 86.5–89 windows slide out, camera swoops in (note18 stays left); the pair is pulled together along a beam with sparks
 * 88.8 Qdrant query console slides in: NEW CLAIM pinned, hybrid search + filter, nearest active claims
 * 90.0 "Found 2 claims about the Sharma delivery · similarity 0.91"
 * 91.0 "Dates disagree -> both marked disputed", chips flip active -> disputed (91.3 / 91.45)
 * 92 caption · 92–100 slow push on the console, beam re-pulses at 95.8, camera eases onto scene I's opening
 */
(function () {
'use strict';
const X = window.FGH, K = X.K;
const MONO = 'font-family:Consolas,"Cascadia Mono",monospace';
const REPULSE = 95.8;
let S, pn, call, rowAnchor = null;

function buildPanel(root) {
  const p = {};
  p.wrap = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px;transform-origin:64px 498px' }, root);
  p.el = h(`<div class="card" style="left:64px;top:92px;width:744px;height:812px;overflow:hidden"></div>`, p.wrap);
  h(`<div class="abs" style="left:0;right:0;top:0;height:60px;display:flex;align-items:center;gap:12px;padding:0 22px;border-bottom:1px solid rgba(124,140,255,.16);background:rgba(124,140,255,.05)">
      <svg width="26" height="28" viewBox="0 0 26 28"><path d="M13 1 L25 8 V20 L13 27 L1 20 V8 Z" fill="none" stroke="#9DA9FF" stroke-width="2.2" stroke-linejoin="round"/><path d="M13 9 L19 12.5 V19.5 L13 23 L7 19.5 V12.5 Z" fill="rgba(157,169,255,.35)"/></svg>
      <span style="font-size:23px;font-weight:700">Qdrant Edge</span><span style="font-size:21px;color:#9AA4C0">· query console</span>
      <div style="flex:1"></div><span style="${MONO};font-size:16px;color:#5B6478">claims · 1,310 points</span></div>`, p.el);
  const B = el('div', { cls: 'abs', style: 'left:24px;right:24px;top:78px;bottom:0' }, p.el);
  // the new claim that just synced is the query
  p.newc = h(`<div class="abs" style="left:0;right:0;top:0;height:86px;border-radius:12px;padding:8px 16px;border:1.5px solid rgba(245,165,36,.55);background:rgba(245,165,36,.07)">
      <div style="${MONO};font-size:14px;letter-spacing:2px;color:#F5A524;font-weight:700">NEW CLAIM · SYNCED FROM TANISHK</div>
      <div style="${MONO};font-size:20px;white-space:nowrap;margin-top:5px">task_sharma_edit · due_date = <span style="font-weight:700">2026-10-18</span></div>
      <div style="font-size:16px;color:#9AA4C0;margin-top:2px;white-space:nowrap">source: note on set · captured_by tanishk</div></div>`, B);
  const line = (y) => el('div', { cls: 'abs', style: `left:0;right:0;top:${y}px;${MONO};font-size:21px;white-space:nowrap;color:#E8ECF4` }, B);
  p.l2 = line(102); p.l2.innerHTML = `<span style="color:#5B6478">›</span> <span style="color:#9DA9FF">hybrid search</span> · dense + BM25`;
  p.l3 = line(136); p.l3.innerHTML = `<span style="color:#5B6478">›</span> <span style="color:#9DA9FF">filter:</span> attribute = <span style="color:#fff;font-weight:700">due_date</span> AND status = <span style="color:#fff;font-weight:700">active</span>`;
  p.rh = h(`<div class="abs" style="left:0;right:0;top:172px;height:30px;display:flex;align-items:center;border-top:1px solid rgba(124,140,255,.16);padding-top:12px;${MONO};font-size:15px;letter-spacing:1.5px;color:#5B6478">
      <span>NEAREST ACTIVE CLAIMS · 4 ms</span><div style="flex:1"></div><span>SIMILARITY</span></div>`, B);
  const rows = [
    ['task_sharma_edit', '2026-10-16', 'client email · captured_by lakshya', .91, true],
    ['task_game_build', '2026-10-15', 'WhatsApp · captured_by tanishk', .42, false],
    ['task_reel_cutdowns', '2026-10-14', 'typed note · captured_by tanishk', .31, false],
  ];
  p.rows = rows.map(([id, d, src, sc, hot], i) => {
    const r = h(`<div class="abs" style="left:0;right:0;top:${214 + i * 74}px;height:66px;border-radius:12px;padding:7px 16px;border:1.5px solid ${hot ? 'rgba(124,140,255,.55)' : 'rgba(154,164,192,.12)'};background:${hot ? 'rgba(124,140,255,.1)' : 'rgba(255,255,255,.025)'}">
        <div style="${MONO};font-size:20px;white-space:nowrap;color:${hot ? '#fff' : '#8A93A8'}">${id} · due_date = <span style="font-weight:700">${d}</span></div>
        <div style="font-size:16px;color:${hot ? '#9AA4C0' : '#5B6478'};margin-top:3px;white-space:nowrap">source: ${src}</div>
        <div class="abs" style="right:16px;top:8px;width:150px;text-align:right;${MONO};font-size:22px;font-weight:700;color:${hot ? '#C9D2FF' : '#5B6478'}"><span class="sc">0.00</span></div>
        <div class="abs" style="right:16px;top:41px;width:150px;height:9px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden"><div class="fill" style="height:100%;width:0;border-radius:5px;background:${hot ? 'linear-gradient(90deg,#7C8CFF,#C9D2FF)' : '#4A5266'}"></div></div></div>`, B);
    return { el: r, sc: r.querySelector('.sc'), fill: r.querySelector('.fill'), score: sc, hot };
  });
  p.found = h(`<div class="abs" style="left:0;right:0;top:444px;height:78px">
      <div style="font-size:27px;font-weight:700;white-space:nowrap">Found 2 claims about the Sharma delivery</div>
      <div style="margin-top:8px;display:flex;gap:10px;align-items:center"><span class="chip sim" style="font-size:18px;${MONO};${X.chipCss('#9DA9FF')}">similarity 0.91</span>
        <span style="font-size:18px;color:#9AA4C0">new claim ↔ client email · same task, different dates</span></div></div>`, B);
  p.sim = p.found.querySelector('.sim');
  p.disp = h(`<div class="abs" style="left:0;right:0;top:534px;height:164px;border-radius:14px;border:1.5px solid rgba(239,68,68,.6);background:rgba(239,68,68,.08);padding:12px 18px">
      <div style="font-size:27px;font-weight:700;color:#FF7A7A;white-space:nowrap">Dates disagree <span style="color:#EF4444">→</span> both marked disputed</div></div>`, B);
  const crow = (y, date, who) => h(`<div class="abs" style="left:18px;right:18px;top:${y}px;height:44px;display:flex;align-items:center;gap:12px">
      <span style="${MONO};font-size:21px;font-weight:700">${date}</span><span style="font-size:19px;color:#9AA4C0">· ${who}</span><div style="flex:1"></div>
      <span class="chip st" style="font-size:18px;min-width:118px;text-align:center"></span></div>`, p.disp);
  p.crows = [crow(56, '2026-10-18', 'Tanishk · note on set'), crow(104, '2026-10-16', 'client email · Lakshya')];
  p.chips = p.crows.map(r => r.querySelector('.st'));
  return p;
}

function renderPanel(p, t) {
  const P0 = K.panel;                                   // 88.8
  // slow push through the long hold (92 -> 100)
  p.wrap.style.transform = `scale(${1 + .04 * easeInOutSine(P(t, 91.6, 8.4))})`;
  show(p.el, t, P0, .6, { dx: -90, dy: 0, blur: 10 });
  show(p.newc, t, P0 + .15, .45, { dx: -20, dy: 0, blur: 4 });
  p.newc.style.boxShadow = `0 0 ${26 * pulse(t, P0 + .45, .25)}px rgba(245,165,36,.6)`;
  show(p.l2, t, P0 + .35, .35, { dx: -14, dy: 0 });
  show(p.l3, t, P0 + .5, .35, { dx: -14, dy: 0 });
  show(p.rh, t, P0 + .65, .35, { dy: 8 });
  p.rows.forEach((r, i) => {
    const t0 = P0 + .7 + i * .1;
    show(r.el, t, t0, .45, { dx: -24, dy: 0, blur: 4 });
    const k = easeOutExpo(P(t, t0 + .05, .6));
    r.fill.style.width = (r.score * 100 * k).toFixed(2) + '%';
    setText(r.sc, (r.score * k).toFixed(2));
    if (r.hot) {
      const red = easeOutCubic(P(t, K.disp, .4));
      const g = pulse(t, K.found - .05, .3) + .35 * P(t, t0 + .4, .3) + .6 * pulse(t, REPULSE, .3);
      const c = mixColor('#7C8CFF', COL.red, red);
      r.el.style.borderColor = rgba(c, .55 + .3 * g);
      r.el.style.background = rgba(c, .1 + .06 * g);
      r.el.style.boxShadow = `0 0 ${30 * g}px ${rgba(c, .45 * g)}`;
      r.fill.style.background = red > .5 ? 'linear-gradient(90deg,#EF4444,#FF9A9A)' : 'linear-gradient(90deg,#7C8CFF,#C9D2FF)';
    } else r.el.style.opacity = +r.el.style.opacity * .8;
  });
  const red = easeOutCubic(P(t, K.disp, .4));
  p.newc.style.borderColor = rgba(mixColor(COL.amber, COL.red, red), .6);
  p.newc.style.background = rgba(mixColor(COL.amber, COL.red, red), .08);
  show(p.found, t, K.found, .6, { dy: 18, blur: 5 });
  p.sim.style.boxShadow = `0 0 ${26 * pulse(t, K.found + .3, .3)}px rgba(124,140,255,.8)`;
  show(p.disp, t, K.disp, .6, { dy: 18, blur: 5 });
  p.disp.style.boxShadow = `0 0 ${40 * (pulse(t, K.disp + .25, .3) + .8 * pulse(t, REPULSE, .35))}px rgba(239,68,68,.6)`;
  p.chips.forEach((c, i) => {
    const tS = K.disp + .3 + i * .15, d = t >= tS;
    setHTML(c, d ? 'disputed' : 'active');
    const pk = pulse(t, tS + .1, .18) + .7 * pulse(t, REPULSE + .1 + i * .08, .2);
    c.style.cssText = `font-size:18px;min-width:118px;text-align:center;${X.chipCss(d ? COL.red : COL.green)};transform:perspective(300px) rotateX(${X.flipAngle(t, tS, .14)}deg) scale(${1 + .12 * pk});box-shadow:0 0 ${24 * pk}px ${rgba(COL.red, .8 * pk)}`;
  });
}

/* the reconnect callout: big enough to read (the in-window badges are ~14 px at this scale) */
function buildCallout(root) {
  const c = h(`<div class="abs" style="left:560px;width:800px;top:146px;text-align:center"><div class="in" style="display:inline-block;padding:10px 26px 12px;border-radius:18px;background:rgba(10,14,22,.9);border:1.5px solid rgba(34,197,94,.6);box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div class="big" style="font-size:32px;font-weight:700;white-space:nowrap;color:#fff"></div>
      <div class="small" style="font-size:20px;color:#9AA4C0;margin-top:2px;white-space:nowrap"></div></div></div>`, root);
  return { el: c, inn: c.querySelector('.in'), big: c.querySelector('.big'), small: c.querySelector('.small') };
}
function renderCallout(c, t) {
  const ph2 = t >= K.pkt + .05;
  setHTML(c.big, ph2 ? `Outbox <span style="color:#F5A524">1</span> → <span style="color:#22C55E">0</span>` : `<span style="color:#22C55E">●</span> Back online`);
  setText(c.small, ph2 ? 'synced via home server' : "Tanishk's laptop · 2.4 MB/s");
  const k = spring(P(t, K.on + .05, .7), 5.5, 1.6), out = easeInCubic(P(t, 85.6, .4));
  c.el.style.opacity = clamp(P(t, K.on + .05, .15)) * (1 - out);
  c.inn.style.transform = `scale(${lerp(.6, 1, k) * (1 + .08 * pulse(t, K.pkt + .12, .15))}) translateY(${-12 * out}px) perspective(400px) rotateX(${X.flipAngle(t, K.pkt + .05, .14)}deg)`;
  c.inn.style.boxShadow = `0 20px 60px rgba(0,0,0,.5), 0 0 ${40 * pulse(t, K.pktB, .25)}px rgba(34,197,94,.6)`;
}

/* cloud-layer FX: red flash at 86, electric beam + sparks while the points are pulled together, re-pulse at 95.8,
 * and the result-row link, which lands on email16's ACTUAL (pulled) screen position */
function conflictFx(ctx, t, f, cl) {
  const A = cl.screenOf('note18'), B = cl.screenOf('email16');
  if (!A || !B || !A.vis || !B.vis || A.hidden || B.hidden) return;
  // 86.0 red alarm (and the 95.8 re-pulse): flash + double ring on both points
  for (const [T0, amp] of [[K.red, 1], [REPULSE, .7]]) for (const Q of [A, B]) {
    const fl = pulse(t, T0 + .05, .2);
    drawGlow(ctx, Q.x, Q.y, 120 * (1 + fl), COL.red, f * fl * .9 * amp, false);
    for (const [dly, m] of [[0, 1], [.18, .6]]) {
      const q = P(t, T0 + dly, 1.0); if (q <= 0 || q >= 1) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(f * (1 - q) * .9 * amp);
      ctx.strokeStyle = COL.red; ctx.lineWidth = 1 + 3 * (1 - q);
      ctx.beginPath(); ctx.arc(Q.x, Q.y, 10 + easeOutExpo(q) * 150 * m * amp, 0, 6.283); ctx.stroke(); ctx.restore();
    }
  }
  if (t >= K.swoop) {
    const during = t < K.swoop + 2.5;
    const rp = pulse(t, REPULSE, .4);
    const inten = f * ((during ? 1 : .55) + .6 * rp) * E(t, K.swoop, .4);
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const fr = Math.floor(t * 20), pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, j = (rand(i, fr) - .5) * 26 * Math.sin(Math.PI * u); pts.push([A.x + dx * u + nx * j, A.y + dy * u + ny * j]); }
    glowLine(ctx, A.x, A.y, B.x, B.y, COL.red, f * E(t, K.swoop, .5, easeOutCubic) * (.75 + .25 * Math.sin(t * 9)), 2.4);
    X.glowPath(ctx, pts, '#FF6B6B', inten * .55, 1.4);
    glowLine(ctx, A.x, A.y, B.x, B.y, COL.red, f * rp * .8, 3.2);
    const lock = pulse(t, K.swoop + 2.5, .2);
    drawGlow(ctx, (A.x + B.x) / 2, (A.y + B.y) / 2, 90 + 80 * lock + 60 * rp, '#FF8080', f * (.18 + .8 * lock + .45 * rp), false);
    const s = Math.min(1.6, (A.s || 400) / 400);
    for (let j = 0; j < 70; j++) {
      const per = .75 + rand(j, 3) * .5, age = ((t - K.swoop + rand(j, 1) * per) % per) / per;
      if (t - K.swoop < age * per) continue;
      const src = j % 2 ? B : A, ang = rand(j, 2) * 6.283 + Math.floor((t - K.swoop + rand(j, 1) * per) / per) * 2.1;
      const sp = (50 + rand(j, 4) * 130) * s;
      const x = src.x + Math.cos(ang) * sp * age, y = src.y + Math.sin(ang) * sp * age + 40 * age * age;
      const col = rand(j, 5) < .3 ? '#FFFFFF' : rand(j, 5) < .65 ? '#FF9A6B' : COL.red;
      drawGlow(ctx, x, y, (5 + 4 * rand(j, 6)) * (1 - age * .6), col, inten * (1 - age) * (1 - age) * .9, true);
    }
    for (let j = 0; j < 8; j++) {
      const u = ((t - K.swoop) * .8 + j / 8) % 1, v = j % 2 ? 1 - u : u;
      drawGlow(ctx, A.x + dx * v, A.y + dy * v, 8, '#FFD0D0', inten * .8 * Math.sin(u * Math.PI));
    }
  }
  // 0.91 result row (the client-email claim) -> the 16th point
  const lk = win(t, 90.05, 99.9, .1, .6);
  if (lk > 0 && rowAnchor) {
    const from = rowAnchor, to = [B.x, B.y];
    const k = easeOutCubic(P(t, 90.05, .55));
    const path = X.quad(from, [lerp(from[0], to[0], .5), Math.min(from[1], to[1]) - 150], to);   // arcs over the pair, clear of the 18th tag (below-left)
    const pts = []; for (let j = 0; j <= 30; j++) pts.push(path(j / 30 * k));
    const col = mixColor('#9DA9FF', COL.red, easeOutCubic(P(t, K.disp, .4)));
    X.glowPath(ctx, pts, col, f * lk * .6, 1.5);
    const hd = pts[pts.length - 1]; drawGlow(ctx, hd[0], hd[1], 12, col, f * lk * (k < 1 ? 1 : .5));
    if (k >= 1) { const u = ((t - 90.6) * .6) % 1; const bp = path(u); drawGlow(ctx, bp[0], bp[1], 9, '#FFFFFF', f * lk * .5 * Math.sin(u * Math.PI)); }
  }
}

Scene({
  id: 'H', start: 82, end: 100,
  fadeIn: 0, fadeOut: .8, drift: 0,
  captions: [[86.3, 91.6, 'Back online. Same deadline, two different dates.'],
             [92, 99.6, 'Qdrant finds the conflict. Nothing wins by default.']],

  build(root) {
    S = X.buildStage(root);
    pn = buildPanel(root);
    call = buildCallout(root);
    root.appendChild(S.fxc);                 // overlay canvas stays on top of the panel
  },

  render(t, lt, fade) {
    X.renderStage(S, t);
    X.declareCloud(t);
    renderPanel(pn, t);
    renderCallout(call, t);
    if (t >= K.found - .1) { const r = pn.rows[0].el.getBoundingClientRect(); rowAnchor = [r.right + 4, r.top + r.height / 2]; } else rowAnchor = null;
    cloud.draw2D(conflictFx);
    cloud.set({ nebula: lerp(1, 1.6, E(t, K.swoop, 2.5, easeInOutCubic)) });

    const ctx = S.ctx, an = X.anchors(t);
    // ---- 83.0 the queued claim leaves the outbox: A -> hub -> B, amber turning green at the hub
    if (t >= K.pkt - .05 && t < K.pktB + .6) {
      const a = an.outbox, hb = [an.hubC[0], an.hubC[1] + 34], b = an.bSync;
      const p1 = X.quad(a, [a[0] + 60, hb[1] - 40], hb), p2 = X.quad(hb, [b[0] - 60, hb[1] - 40], b);
      const path = u => (u < .5 ? p1(u * 2) : p2(u * 2 - 1));
      X.comet(ctx, path, t, K.pkt, K.pktB, COL.amber, 1, { r: 15, trail: 40, gap: .012, ease: easeInOutSine, colorAt: u => mixColor(COL.amber, COL.green, clamp((u - .42) * 6)) });
      drawGlow(ctx, hb[0], hb[1] - 30, 120, COL.green, .6 * pulse(t, K.pktHub, .15), false);
      drawGlow(ctx, b[0], b[1], 90, COL.green, .6 * pulse(t, K.pktB + .02, .15), false);
    }
    // ---- 82.5 reconnect: a green signal races down the hub link to Tanishk
    if (t >= K.on && t < K.on + .8) {
      const path = X.quad(an.hubL, [an.aTop[0] + 20, an.hubL[1] - 10], an.aTop);
      X.comet(ctx, path, t, K.on, K.on + .45, COL.green, 1, { r: 11, trail: 22, ease: easeOutCubic });
    }
  }
});
})();
