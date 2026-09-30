/* Scene F: Offline (58–74 s)  +  shared engine for the hero sequence F/G/H (58–100 s).
 *
 * F/G/H are one continuous shot. Tanishk's window, Lakshya's window, the hub and the 3D
 * camera are built by the shared helpers below (window.FGH) so that every scene renders
 * them as the SAME pure function of t. F->G and G->H join with fadeOut/fadeIn = 0: at the
 * boundary frame both scenes draw identical pixels and the earlier one hides itself, so the
 * shot never dips or double-exposes.
 *
 * F timeline: 58.0 laptop + cloud · 59.0 pill flips to Airplane mode, graph flatlines
 * · 61.0 query types · 62.5 answer + citations + "14 ms · on-device" · 63.0 matching points
 * link to the answer · 66.0 note types · 68.5 amber point born · 69.0 outbox 0->1 · 70 caption
 */
(function () {
'use strict';
const X = window.FGH = {};
const SPIN = .035;
const K = X.K = {
  off: 59, q: 61, qEnter: 62.05, ans: 62.5, link: 63, note: 66, noteEnter: 67.85, born18: 68.5, outbox: 69,
  g: 74, lakIn: 74.4, hub: 75.0, mail: 75.5, claim16: 76.35, born16: 77,
  on: 82.5, pkt: 83, pktHub: 83.5, pktB: 84.0, wave: 84, red: 86, swoop: 86.5, exit: 86.5, panel: 88.8, found: 90, disp: 91,
};
const QUERY = "what's due this week?";
const NOTE = 'Client says push the Sharma delivery to the 18th';
const WW = 880, WH = 800;          // laptop window size (unscaled)
X.WW = WW; X.WH = WH;

/* ------------------------------------------------------------------ small helpers */
// piecewise keyframes, each key carries the ease of the segment that ENDS at it
function seg(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [ta, va] = keys[i - 1], [tb, vb, ez] = keys[i];
    return mixAny(va, vb, (ez || linear)((t - ta) / (tb - ta)));
  }
  return keys[keys.length - 1][1];
}
X.seg = seg;
const quad = (a, c, b) => u => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]; };
X.quad = quad;
/** glowing polyline (additive, multi-pass like glowLine) */
function glowPath(ctx, pts, color, alpha, width = 2) {
  if (alpha <= .003 || pts.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [wm, am] of [[6, .07], [3, .16], [1.6, .42], [.6, 1]]) {
    ctx.globalAlpha = clamp(alpha * am); ctx.strokeStyle = wm < 1 ? mixColor(color, '#ffffff', .6) : color; ctx.lineWidth = width * wm;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  }
  ctx.restore();
}
X.glowPath = glowPath;
/** comet along path(u): head eased over [t0,t1], fading trail. colorAt(u) optional. */
function comet(ctx, path, t, t0, t1, color, alpha, o = {}) {
  const { r = 16, trail = 28, gap = .016, colorAt = null, ease = easeInOutCubic } = o;
  if (t < t0 || alpha <= .003) return null;
  const hu = ease(P(t, t0, t1 - t0));
  const tailOut = P(t, t1, .35);                 // trail catches up after arrival
  const a = alpha * (1 - tailOut);
  if (a <= .003) return path(1);
  for (let k = trail; k >= 0; k--) {
    const u = hu - k * gap * (1 - tailOut * .9); if (u < 0) continue;
    const [x, y] = path(Math.min(1, u)); const f = 1 - k / (trail + 1);
    drawGlow(ctx, x, y, r * (.35 + .65 * f), colorAt ? colorAt(u) : color, a * f * f * .75, k === 0);
  }
  const [hx, hy] = path(hu);
  drawGlow(ctx, hx, hy, r * 2.2, colorAt ? colorAt(hu) : color, a * .9, true);
  return [hx, hy];
}
X.comet = comet;
/** rotateX flip for a pill / chip whose content switches at tS */
function flipAngle(t, tS, d = .2) {
  if (t >= tS - d && t < tS) return 90 * easeInCubic(P(t, tS - d, d));
  if (t >= tS && t < tS + d) return -90 * (1 - easeOutCubic(P(t, tS, d)));
  return 0;
}
X.flipAngle = flipAngle;
/** local cloud coords -> spinning world coords at time t (same maths as the engine) */
const toWorld = (p, t) => { const a = t * SPIN, c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
X.toWorld = toWorld;

const ENV = (stroke, fill) => `<svg width="26" height="20" viewBox="0 0 26 20" style="display:block"><rect x="1.2" y="1.2" width="23.6" height="17.6" rx="3.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M2.5 3.5 L13 11.2 L23.5 3.5" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const SEARCH_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" style="flex:none"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="#9DA9FF" stroke-width="2.2"/><path d="M15.5 15.5 L21 21" stroke="#9DA9FF" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PEN_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" style="flex:none"><path d="M4 20 L5 15 L16 4 L20 8 L9 19 Z" fill="none" stroke="#F5A524" stroke-width="2" stroke-linejoin="round"/><path d="M14 6 L18 10" stroke="#F5A524" stroke-width="2"/></svg>';
const BOLT_SVG = '<svg width="16" height="18" viewBox="0 0 16 18" style="vertical-align:-3px;margin-right:6px"><path d="M9.5 0 L1 10.5 H7 L5.5 18 L15 6.5 H9 Z" fill="currentColor"/></svg>';
const SERVER_SVG = '<svg width="34" height="34" viewBox="0 0 34 34" style="flex:none"><rect x="4" y="5" width="26" height="10" rx="3" fill="none" stroke="#9DA9FF" stroke-width="2"/><rect x="4" y="19" width="26" height="10" rx="3" fill="none" stroke="#9DA9FF" stroke-width="2"/><circle cx="10" cy="10" r="1.8" fill="#22C55E"/><circle cx="10" cy="24" r="1.8" fill="#22C55E"/><path d="M16 10 H25 M16 24 H25" stroke="#5B6478" stroke-width="2"/></svg>';
X.SVG = { ENV, SEARCH_SVG, PEN_SVG, BOLT_SVG, SERVER_SVG };

const LABEL = 'font-size:16px;letter-spacing:2px;color:#5B6478;font-weight:700';
const BOX = 'border-radius:14px;background:rgba(0,0,0,.32);border:1.5px solid rgba(124,140,255,.22);display:flex;align-items:center;padding:0 18px;gap:14px';
const chipCss = c => `color:${c};background:${rgba(c, .12)};border-color:${rgba(c, .45)}`;
X.chipCss = chipCss;

/* ------------------------------------------------------------------ network graph
 * Own version of netGraph: the history keeps its colour (green before offline, amber while
 * offline, green again after reconnect) and the moments are marked with dashed ticks. */
function makeNet(parent, o = {}) {
  const { x = 28, y = 82, w = 824, h = 116, seed = 0 } = o;
  const e = el('div', { cls: 'netg', style: `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px` }, parent);
  el('div', { cls: 'netg-lbl', text: 'network' }, e);
  const bps = el('div', { cls: 'netg-bps mono' }, e);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
  const segs = [COL.green, COL.amber, COL.green].map(c => ({
    c, area: mk('polygon', { fill: rgba(c, .11) }),
    halo: mk('polyline', { fill: 'none', stroke: rgba(c, .22), 'stroke-width': 9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    line: mk('polyline', { fill: 'none', stroke: c, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
  }));
  const marks = [[COL.amber, 'airplane mode'], [COL.green, 'back online']].map(([c, txt]) => ({
    ln: mk('line', { stroke: rgba(c, .75), 'stroke-width': 1.5, 'stroke-dasharray': '4 5', y1: 34, y2: h }),
    tx: mk('text', { fill: c, 'font-size': 15, 'font-weight': 700, y: 50, 'font-family': 'Segoe UI', 'letter-spacing': '.5' }), txt,
  }));
  marks.forEach(m => { m.tx.textContent = m.txt; });
  e.appendChild(svg);
  const N = 120, dt = .055;
  const lvl = (tt, offAt, onAt) => {
    const v = .5 + .24 * Math.sin(tt * 3.1 + seed) + .14 * Math.sin(tt * 7.7 + 1 + seed * 2) + .07 * Math.sin(tt * 17.3 + 2 + seed * 3);
    let m = 1;
    if (tt >= offAt) m = 1 - easeOutCubic(P(tt, offAt, .45));
    if (tt >= onAt) m = spring(P(tt, onAt, 1.1), 5, 1.6);
    return clamp(v * m, 0, 1.12);
  };
  return {
    el: e,
    render(t, offAt = Infinity, onAt = Infinity) {
      const buf = [[], [], []]; let prev = -1, prevPt = null;
      for (let i = 0; i <= N; i++) {
        const tt = t - (N - i) * dt; const s = tt < offAt ? 0 : tt < onAt ? 1 : 2;
        const pt = `${(i / N * w).toFixed(1)},${(h - 12 - lvl(tt, offAt, onAt) * (h - 46)).toFixed(1)}`;
        if (prev >= 0 && s !== prev) buf[s].push(prevPt);
        buf[s].push(pt); prev = s; prevPt = pt;
      }
      for (let s = 0; s < 3; s++) {
        const b = buf[s], G = segs[s];
        if (b.length < 2) { G.line.setAttribute('points', ''); G.halo.setAttribute('points', ''); G.area.setAttribute('points', ''); continue; }
        const p = b.join(' '); G.line.setAttribute('points', p); G.halo.setAttribute('points', p);
        G.area.setAttribute('points', p + ` ${b[b.length - 1].split(',')[0]},${h} ${b[0].split(',')[0]},${h}`);
      }
      [offAt, onAt].forEach((tm, i) => {
        const m = marks[i]; const xm = w - (t - tm) / (N * dt) * w; const vis = isFinite(tm) && t >= tm && xm >= 0;
        m.ln.setAttribute('opacity', vis ? 1 : 0); m.tx.setAttribute('opacity', vis ? clamp(P(t, tm, .3)) : 0);
        if (vis) {
          m.ln.setAttribute('x1', xm); m.ln.setAttribute('x2', xm);
          const right = xm < w - 170; m.tx.setAttribute('x', right ? xm + 8 : xm - 8); m.tx.setAttribute('text-anchor', right ? 'start' : 'end');
        }
      });
      const off = t >= offAt && t < onAt; const v = lvl(t, offAt, onAt);
      setHTML(bps, off ? `<span style="color:${COL.amber}">0 B/s</span>` : `<span style="color:${COL.green}">${(0.4 + v * 2.2).toFixed(1)} MB/s</span>`);
      return off;
    }
  };
}
X.makeNet = makeNet;

/* ------------------------------------------------------------------ app header (logo + outbox) */
function makeHeader(body) {
  const hdr = h(`<div class="abs" style="left:28px;right:28px;top:18px;height:46px;display:flex;align-items:center;gap:14px">
    <div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#7C8CFF,#B49CFF);box-shadow:0 0 18px rgba(124,140,255,.55);flex:none"></div>
    <div style="font-size:27px;font-weight:700;letter-spacing:.5px">Quorum</div>
    <span class="chip" style="font-size:16px;padding:3px 12px;${chipCss('#9DA9FF')}">Qdrant Edge · on-device</span>
    <div style="flex:1"></div>
    <div class="obx" style="display:flex;align-items:center;gap:10px;padding:6px 10px 6px 12px;border-radius:12px;border:1px solid rgba(154,164,192,.28);background:rgba(255,255,255,.03);font-size:19px;color:#9AA4C0;font-weight:600">
      <div style="position:relative;width:32px;height:26px">
        <div class="env1" style="position:absolute;left:0;top:6px;color:#5B6478">${ENV('#5B6478', 'none')}</div>
        <div class="env2" style="position:absolute;left:5px;top:0">${ENV('#F5A524', 'rgba(245,165,36,.28)')}</div>
      </div>
      <span>Outbox</span>
      <div style="position:relative;width:28px;height:30px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.07)">
        <div class="roll mono" style="position:absolute;left:0;right:0;top:0;text-align:center;font-size:21px;font-weight:700;line-height:30px">0<br>1<br>0</div>
      </div>
    </div>
  </div>`, body);
  return { hdr, obx: hdr.querySelector('.obx'), env2: hdr.querySelector('.env2'), roll: hdr.querySelector('.roll') };
}

/* ------------------------------------------------------------------ Tanishk's window */
function makeTanishk(parent) {
  const lap = makeLaptop({ parent, x: 0, y: 0, w: WW, h: WH, title: "Tanishk's laptop · on a shoot", status: 'online' });
  lap.el.style.transformOrigin = '0 0';
  const b = lap.body;
  const H = makeHeader(b);
  const net = makeNet(b, { seed: 0 });
  el('div', { cls: 'abs', style: `left:28px;top:220px;${LABEL}`, text: 'ASK' }, b);
  const ask = h(`<div class="abs" style="left:28px;top:248px;width:824px;height:64px;${BOX}">${SEARCH_SVG}
      <div class="q" style="font-size:27px;flex:1;white-space:nowrap;overflow:hidden"></div>
      <div class="kbd mono" style="font-size:15px;color:#5B6478;border:1px solid rgba(154,164,192,.3);border-radius:6px;padding:2px 8px">↵</div></div>`, b);
  const q = ask.querySelector('.q');
  const ans = h(`<div class="abs" style="left:28px;top:322px;width:824px;height:238px;border-radius:14px;background:rgba(124,140,255,.055);border:1px solid rgba(124,140,255,.2)"></div>`, b);
  const hint = h(`<div class="abs" style="left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#5B6478">Answers cite their sources · searched on this laptop</div>`, ans);
  const srch = h(`<div class="abs" style="left:20px;top:22px;right:20px;font-size:21px;color:#9AA4C0">
      <span>Searching 1,310 claims on this laptop…</span>
      <div class="bar" style="margin-top:16px;height:8px;border-radius:4px;background:rgba(124,140,255,.12);overflow:hidden;position:relative"><div class="sh" style="position:absolute;top:0;bottom:0;width:180px;background:linear-gradient(90deg,transparent,rgba(157,169,255,.8),transparent)"></div></div></div>`, ans);
  const sh = srch.querySelector('.sh');
  const ahead = h(`<div class="abs" style="left:20px;right:20px;top:10px;height:44px;display:flex;align-items:center;gap:12px">
      <span style="font-size:24px;font-weight:700">3 things due this week</span><div style="flex:1"></div>
      <span class="chip badge" style="font-size:24px;padding:3px 16px;${chipCss('#9DA9FF')}">on-device · no network</span></div>`, ans);
  const badge = ahead.querySelector('.badge');
  const mkRow = (y, n, title, when, src, c = '#9DA9FF') => h(`<div class="abs" style="left:14px;right:14px;top:${y}px;height:52px;border-radius:12px;background:rgba(124,140,255,.07);display:flex;align-items:center;gap:14px;padding:0 14px">
      <span class="mono" style="flex:none;width:28px;height:28px;border-radius:50%;background:rgba(124,140,255,.2);color:#C9D2FF;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</span>
      <span style="font-size:23px;font-weight:600;white-space:nowrap">${title}<span style="color:${c === '#9DA9FF' ? '#9AA4C0' : c};font-weight:500"> · ${when}</span></span>
      <div style="flex:1"></div>
      <span class="chip src" style="font-size:17px;${chipCss('#9DA9FF')}">source: ${src}</span></div>`, ans);
  // Tanishk's laptop has NOT seen the client's 16th yet: the Sharma date is still open here.
  const rows = [mkRow(60, 1, 'Reel cutdowns', 'Wed 14 Oct', 'typed note'), mkRow(118, 2, 'Game project build', 'Thu 15 Oct', 'WhatsApp'),
    mkRow(176, 3, 'Sharma edit', 'date not confirmed yet', 'WhatsApp', COL.amber)];
  const srcChips = rows.map(r => r.querySelector('.src'));
  el('div', { cls: 'abs', style: `left:28px;top:574px;${LABEL}`, text: 'QUICK NOTE' }, b);
  const noteBox = h(`<div class="abs" style="left:28px;top:600px;width:824px;height:64px;${BOX};border-color:rgba(245,165,36,.25)">${PEN_SVG}
      <div class="n" style="font-size:25px;flex:1;white-space:nowrap;overflow:hidden"></div>
      <div class="kbd mono" style="font-size:15px;color:#5B6478;border:1px solid rgba(154,164,192,.3);border-radius:6px;padding:2px 8px">↵</div></div>`, b);
  const nText = noteBox.querySelector('.n');
  const nStat = h(`<div class="abs" style="left:28px;top:678px;height:40px;display:flex;align-items:center;gap:12px"><span class="chip st" style="font-size:18px"></span><span class="sub2" style="font-size:18px;color:#5B6478"></span></div>`, b);
  const stChip = nStat.querySelector('.st'), stSub = nStat.querySelector('.sub2');
  return { lap, H, net, ask, q, ans, hint, srch, sh, ahead, badge, rows, srcChips, noteBox, nText, nStat, stChip, stSub };
}

function renderOutbox(H, t, count1At, count0At) {
  // count: 0 -> 1 at count1At (spring roll), 1 -> 0 at count0At
  const up = spring(P(t, count1At - .05, .6), 6, 1.8), dn = spring(P(t, count0At, .6), 6, 1.8);
  H.roll.style.transform = `translateY(${-30 * (up + dn)}px)`;
  const has = t >= count1At && t < count0At + .1;
  const glow = pulse(t, count1At + .05, .22) + pulse(t, count0At + .05, .22) * .6;
  const c = has ? COL.amber : '#9AA4C0';
  H.obx.style.color = c; H.obx.style.borderColor = has ? rgba(COL.amber, .55) : 'rgba(154,164,192,.28)';
  H.obx.style.background = has ? rgba(COL.amber, .08) : 'rgba(255,255,255,.03)';
  H.obx.style.boxShadow = `0 0 ${30 * glow}px ${rgba(COL.amber, .7 * glow)}`;
  const drain = isFinite(count0At) ? spring(P(t, count0At - .45, .6), 5, 1.4) * (1 - easeInOutCubic(P(t, count0At + 1.3, .6))) : 0;
  H.obx.style.transformOrigin = '100% 50%';
  H.obx.style.transform = `scale(${1 + .1 * glow + .6 * drain})`;
  // the envelope pops onto the stack at count1At, lifts off at count0At
  const inK = spring(P(t, count1At - .08, .55), 6, 1.8), outK = easeInCubic(P(t, count0At - .1, .35));
  H.env2.style.opacity = clamp(P(t, count1At - .08, .12)) * (1 - outK);
  H.env2.style.transform = `translate(${outK * 30}px,${(1 - inK) * -26 - outK * 30}px) scale(${lerp(.4, 1, clamp(inK, 0, 1.3))})`;
}

X.renderTanishk = function (A, t) {
  // ---- pill: flips Online -> Airplane at 59, back to Online at 82.5
  const off = t >= K.off && t < K.on;
  const nearOn = Math.abs(t - K.on) < Math.abs(t - K.off);
  const tS = nearOn ? K.on : K.off;
  const pk = pulse(t, tS + .12, .2);
  A.lap.setStatus(off ? 'offline' : 'online', pk);
  A.lap.pill.style.transform = `perspective(300px) rotateX(${flipAngle(t, tS, .16)}deg) scale(${1 + .16 * pk})`;
  // window rim: amber while offline
  const offK = t < K.on ? easeOutCubic(P(t, K.off, .5)) : 1 - easeOutCubic(P(t, K.on, .6));
  const flash = pulse(t, K.off + .05, .25) + pulse(t, K.on + .05, .25);
  const stc = t < K.on ? COL.amber : COL.green;
  const rim = mixColor('#7C8CFF', stc, clamp(offK + flash));
  A.lap.el.style.borderColor = rgba(rim, .3 + .25 * offK + .4 * flash);
  A.lap.el.style.boxShadow = `0 30px 80px rgba(0,0,0,.55), 0 0 ${50 + 40 * flash}px ${rgba(stc, .09 * offK + .3 * flash)}`;
  A.net.render(t, K.off, K.on);

  // ---- ask: types at 61.0, enter at 62.05
  if (t < K.q - .25) setHTML(A.q, '<span style="color:#5B6478">Ask your team\'s memory…</span>');
  else typeText(A.q, QUERY, t, K.q, 24, { hold: .5, cursorColor: '#9DA9FF' });
  const focusQ = win(t, K.q - .3, K.ans + .3, .25, .5), pressQ = pulse(t, K.qEnter, .07);
  A.ask.style.borderColor = rgba('#7C8CFF', .22 + .5 * focusQ + .3 * pressQ);
  A.ask.style.boxShadow = `0 0 ${24 * focusQ}px ${rgba('#7C8CFF', .25 * focusQ + .4 * pressQ)}`;
  A.ask.style.transform = `scale(${1 - .012 * pressQ})`;

  // ---- answer card
  const ak = E(t, K.qEnter, .4);
  A.ans.style.opacity = lerp(.7, 1, ak); A.ans.style.borderStyle = ak > .5 ? 'solid' : 'dashed';
  A.ans.style.background = rgba('#7C8CFF', lerp(.02, .055, ak));
  A.hint.style.opacity = 1 - P(t, K.q - .1, .35);
  A.srch.style.opacity = win(t, K.qEnter + .02, K.ans + .05, .12, .15);
  A.sh.style.transform = `translateX(${-180 + ((t - K.qEnter) * 1400) % 1000}px)`;
  show(A.ahead, t, K.ans, .5, { dy: 12, blur: 4 });
  pop(A.badge, t, K.ans + .12, .6, .5);
  A.badge.style.boxShadow = `0 0 ${22 * pulse(t, K.ans + .25, .25)}px rgba(124,140,255,.8)`;
  staggerIn(A.rows, t, K.ans + .08, .11, { d: .55, dy: 16, blur: 5 });
  A.srcChips.forEach((c, i) => {
    const arrive = pulse(t, K.link + .1 * i + .45, .18), lit = win(t, K.link + .1 * i + .4, 66.2, .15, .6);
    c.style.boxShadow = `0 0 ${10 + 18 * arrive}px ${rgba('#9DA9FF', .35 * lit + .6 * arrive)}`;
    c.style.background = rgba('#9DA9FF', .12 + .16 * lit);
  });

  // ---- quick note: types at 66.0, enter at 67.85, point born 68.5
  if (t < K.note - .25) setHTML(A.nText, '<span style="color:#5B6478">Quick note…</span>');
  else typeText(A.nText, NOTE, t, K.note, 30, { hold: .3, cursorColor: COL.amber });
  const focusN = win(t, K.note - .3, K.noteEnter + .5, .25, .5), pressN = pulse(t, K.noteEnter, .07);
  A.noteBox.style.borderColor = rgba(COL.amber, .25 + .45 * focusN + .3 * pressN);
  A.noteBox.style.boxShadow = `0 0 ${24 * focusN}px ${rgba(COL.amber, .2 * focusN + .45 * pressN)}`;
  A.noteBox.style.transform = `scale(${1 - .012 * pressN})`;
  const synced = t >= K.pktHub;
  setHTML(A.stChip, synced ? '✓&nbsp;Synced to the team' : '●&nbsp;Saved on this laptop · queued');
  A.stChip.style.cssText = `font-size:18px;${chipCss(synced ? COL.green : COL.amber)};transform:perspective(300px) rotateX(${flipAngle(t, K.pktHub, .15)}deg)`;
  setText(A.stSub, synced ? 'sent via home server' : 'syncs when back online');
  show(A.nStat, t, K.born18 + .05, .5, { dx: -16, dy: 0 });

  renderOutbox(A.H, t, K.outbox, K.pkt);
};

/* ------------------------------------------------------------------ Lakshya's window */
function makeLakshya(parent) {
  const lap = makeLaptop({ parent, x: 0, y: 0, w: WW, h: WH, title: "Lakshya's laptop · in the studio", status: 'online' });
  lap.el.style.transformOrigin = '0 0';
  const b = lap.body;
  const H = makeHeader(b);
  const net = makeNet(b, { seed: 2.3 });
  el('div', { cls: 'abs', style: `left:28px;top:220px;${LABEL}`, text: 'INBOX' }, b);
  const list = el('div', { cls: 'abs', style: 'left:28px;top:250px;width:824px;height:306px;overflow:hidden' }, b);
  const oldRow = (y, from, subj, when) => h(`<div class="abs" style="left:0;right:0;top:${y}px;height:74px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(154,164,192,.1);padding:10px 18px">
      <div style="display:flex;font-size:21px;font-weight:600;color:#9AA4C0"><span>${from}</span><div style="flex:1"></div><span style="font-size:17px;color:#5B6478;font-weight:500">${when}</span></div>
      <div style="font-size:19px;color:#5B6478;margin-top:4px;white-space:nowrap">${subj}</div></div>`, list);
  const olds = [oldRow(0, 'Rahul Mehta', 'Moodboard v2 for the brand shoot', '9:12'), oldRow(86, 'Figma', "3 new comments on 'Sharma cut v4'", '8:40'), oldRow(172, 'Studio calendar', 'Colour grading booked · Wed 2 pm', 'Mon')];
  const mail = h(`<div class="abs" style="left:0;right:0;top:0;height:156px;border-radius:14px;background:rgba(124,140,255,.09);border:1.5px solid rgba(124,140,255,.5);padding:12px 18px">
      <div style="display:flex;align-items:center;gap:10px;font-size:21px;font-weight:700"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:#7C8CFF;box-shadow:0 0 10px #7C8CFF"></span>
        <span>client:sharma</span><span style="font-weight:500;color:#9AA4C0">· Re: Sharma edit delivery</span><div style="flex:1"></div><span style="font-size:17px;color:#9DA9FF">now</span></div>
      <div style="font-size:30px;font-weight:700;margin-top:8px;color:#fff">Delivery confirmed for the <span style="color:#22C55E">16th</span>.</div>
      <div class="claim" style="margin-top:10px;height:36px;display:flex;align-items:center"><span class="chip c1" style="font-size:17px"></span></div></div>`, list);
  const claim = mail.querySelector('.claim');
  const c1 = claim.querySelector('.c1');
  el('div', { cls: 'abs', style: `left:28px;top:574px;${LABEL}`, text: 'SYNC' }, b);
  const syncIdle = el('div', { cls: 'abs', style: 'left:28px;top:604px;font-size:20px;color:#5B6478', html: `<span style="color:#22C55E">●</span>&nbsp; Connected to home server · up to date` }, b);
  const syncRow = h(`<div class="abs" style="left:28px;top:602px;width:824px;height:66px;border-radius:12px;background:rgba(34,197,94,.08);border:1.5px solid rgba(34,197,94,.45);display:flex;align-items:center;gap:14px;padding:0 16px">
      <span style="font-size:24px;color:#22C55E">↓</span>
      <span style="font-size:21px;font-weight:600;white-space:nowrap">From Tanishk: <span style="color:#F5A524">“push the Sharma delivery to the 18th”</span></span>
      <div style="flex:1"></div><span class="chip" style="font-size:17px;${chipCss(COL.green)}">synced</span></div>`, b);
  return { lap, H, net, olds, mail, claim, c1, syncIdle, syncRow };
}

X.renderLakshya = function (L, t) {
  const pk = pulse(t, K.pktB + .05, .25);
  L.lap.setStatus('online', 0);
  L.lap.el.style.borderColor = rgba(mixColor('#7C8CFF', COL.green, .35 + .65 * pk), .35 + .5 * pk);
  L.lap.el.style.boxShadow = `0 30px 80px rgba(0,0,0,.55), 0 0 ${40 + 50 * pk}px ${rgba(COL.green, .06 + .35 * pk)}`;
  L.net.render(t + 3.7, Infinity, Infinity);
  // new email drops in at 75.5, pushing the old ones down
  const push = easeOutCubic(P(t, K.mail - .05, .55)) * 170;
  L.olds.forEach((r, i) => { r.style.transform = `translateY(${push}px)`; r.style.opacity = 1 - .55 * P(t, K.mail, .5); });
  show(L.mail, t, K.mail, .8, { dy: -70, ease: x => spring(x, 5.2, 1.5) });
  const mg = pulse(t, K.mail + .35, .35);
  L.mail.style.boxShadow = `0 0 ${10 + 40 * mg}px ${rgba('#7C8CFF', .25 + .5 * mg)}`;
  // captured as a claim (76.35) -> synced (77.0)
  const sy = t >= K.born16;
  setHTML(L.c1, sy ? '✓&nbsp;claim · due_date 2026-10-16 · synced' : '→&nbsp;claim · due_date 2026-10-16');
  L.c1.style.cssText = `font-size:17px;${chipCss(sy ? COL.green : '#9DA9FF')};transform:perspective(300px) rotateX(${flipAngle(t, K.born16, .15)}deg);box-shadow:0 0 ${24 * pulse(t, K.born16 + .1, .25)}px ${rgba(COL.green, .7)}`;
  show(L.claim, t, K.claim16, .5, { dx: -16, dy: 0 });
  // sync row arrives with the packet (84.0)
  const sk = show(L.syncRow, t, K.pktB, .6, { dy: 16, blur: 4 });
  L.syncIdle.style.opacity = 1 - sk;
  renderOutbox(L.H, t, Infinity, Infinity);
};

/* ------------------------------------------------------------------ hub + links */
function makeHub(parent) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', 1920); svg.setAttribute('height', 1080);
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'; parent.appendChild(svg);
  const mk = (attrs) => { const n = document.createElementNS(NS, 'path'); for (const k in attrs) n.setAttribute(k, attrs[k]); n.setAttribute('fill', 'none'); svg.appendChild(n); return n; };
  const aOff = mk({ stroke: COL.amber, 'stroke-width': 2.5, 'stroke-dasharray': '3 11', 'stroke-linecap': 'round' });
  const aOnHalo = mk({ stroke: rgba(COL.green, .25), 'stroke-width': 9, 'stroke-linecap': 'round' });
  const aOn = mk({ stroke: COL.green, 'stroke-width': 2.5, 'stroke-dasharray': '10 10', 'stroke-linecap': 'round' });
  const bHalo = mk({ stroke: rgba(COL.green, .22), 'stroke-width': 9, 'stroke-linecap': 'round' });
  const bOn = mk({ stroke: COL.green, 'stroke-width': 2.5, 'stroke-dasharray': '10 10', 'stroke-linecap': 'round' });
  const xMark = h(`<div class="abs mono" style="left:0;top:0;font-size:17px;font-weight:700;color:#F5A524;white-space:nowrap;background:rgba(10,14,22,.85);border:1px solid rgba(245,165,36,.5);border-radius:8px;padding:2px 10px">✕ no signal</div>`, parent);
  const card = h(`<div class="card" style="left:770px;top:52px;width:380px;height:78px;display:flex;align-items:center;gap:14px;padding:0 20px;border-radius:16px">${SERVER_SVG}
      <div><div style="font-size:23px;font-weight:700">Sync hub</div><div style="font-size:17px;color:#9AA4C0">Qdrant Server · team hub</div></div>
      <div style="flex:1"></div><span class="hd" style="width:11px;height:11px;border-radius:50%;background:#22C55E;box-shadow:0 0 10px #22C55E"></span></div>`, parent);
  return { svg, aOff, aOn, aOnHalo, bOn, bHalo, xMark, card };
}

/* layouts (pure functions of t, shared by F/G/H so the joins are seamless) */
X.layoutT = function (t) {
  const drift = P(t, 58, 16);
  const fx = 64 - 6 * drift, fy = 96 - 4 * drift, fs = 1 + .012 * drift;
  const g = easeInOutCubic(P(t, K.g, 1.15));
  let x = lerp(fx, 48, g), y = lerp(fy, 186, g), s = lerp(fs, .7, g);
  const en = easeOutExpo(P(t, 57.7, 1.1));
  const ex = easeInCubic(P(t, K.exit, .5));
  x += -(1 - en) * 90 - ex * 300; const o = clamp(P(t, 57.7, .5)) * (1 - ex);
  return { x, y, s, o, blur: (1 - en) * 10 + ex * 6 };
};
X.layoutL = function (t) {
  const en = easeOutExpo(P(t, K.lakIn, 1.0));
  const ex = easeInCubic(P(t, K.exit, .5));
  return { x: 1290 + (1 - en) * 760 + ex * 300, y: 186, s: .7, o: clamp(P(t, K.lakIn, .35)) * (1 - ex), blur: (1 - en) * 12 + ex * 6 };
};
X.hubK = t => easeOutExpo(P(t, K.hub, .8)) * (1 - easeInCubic(P(t, K.exit, .45)));

/* anchor points in screen space (from layouts, no DOM reads) */
X.anchors = function (t) {
  const T = X.layoutT(t), L = X.layoutL(t);
  return {
    aTop: [T.x + T.s * (WW - 190), T.y],                         // Tanishk window top edge, right side
    outbox: [T.x + T.s * (WW - 28 - 60), T.y + T.s * (58 + 18 + 23)], // outbox badge
    bTop: [L.x + L.s * 190, L.y],                                 // Lakshya window top edge, left side
    bSync: [L.x + L.s * (28 + 60), L.y + L.s * (58 + 602 + 33)],   // Lakshya sync row
    hubL: [790, 116], hubR: [1130, 116], hubC: [960, 91],
  };
};

X.buildStage = function (root) {
  const wrap = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px' }, root);
  const hub = makeHub(wrap);
  const A = makeTanishk(wrap);
  const L = makeLakshya(wrap);
  const alert = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(239,68,68,.55) 100%);opacity:0' }, root);
  // Own overlay canvas INSIDE the scene root (Q.fx paints below scene DOM, see report), faded by the root.
  const fxc = el('canvas', { cls: 'abs', attrs: { width: 1920, height: 1080 }, style: 'left:0;top:0;width:1920px;height:1080px;pointer-events:none' }, root);
  return { wrap, hub, A, L, alert, fxc, ctx: fxc.getContext('2d') };
};

X.renderStage = function (S, t) {
  S.ctx.setTransform(1, 0, 0, 1, 0, 0); S.ctx.globalAlpha = 1; S.ctx.globalCompositeOperation = 'source-over'; S.ctx.clearRect(0, 0, 1920, 1080);
  const T = X.layoutT(t), L = X.layoutL(t);
  xf(S.A.lap.el, { x: T.x, y: T.y, s: T.s, o: T.o, blur: T.blur });
  if (T.o > .002) X.renderTanishk(S.A, t);
  S.L.lap.el.style.display = L.o > .002 ? 'block' : 'none';
  xf(S.L.lap.el, { x: L.x, y: L.y, s: L.s, o: L.o, blur: L.blur });
  if (L.o > .002) X.renderLakshya(S.L, t);
  // shake on the red alert (86.0)
  const sh = pulse(t, K.red + .1, .22);
  if (sh > .01) { const dx = wiggle(t, 3, 60, 6) * sh, dy = wiggle(t, 4, 55, 4) * sh; S.wrap.style.transform = `translate(${dx}px,${dy}px)`; } else S.wrap.style.transform = 'none';
  S.alert.style.opacity = .55 * pulse(t, K.red + .08, .28);

  // hub + links
  const hk = X.hubK(t), Hb = S.hub; const an = X.anchors(t);
  Hb.card.style.opacity = hk; Hb.card.style.transform = `translateY(${(1 - easeOutExpo(P(t, K.hub, .8))) * -24}px) scale(${1 + .08 * pulse(t, K.pktHub, .18)})`;
  Hb.card.style.boxShadow = `0 30px 80px rgba(0,0,0,.55), 0 0 ${50 * pulse(t, K.pktHub, .25)}px rgba(34,197,94,.6)`;
  const draw = easeInOutCubic(P(t, K.hub + .2, .8));
  const pathA = `M ${an.hubL[0]} ${an.hubL[1]} C ${an.hubL[0] - 160} ${an.hubL[1]}, ${an.aTop[0] + 40} ${an.aTop[1] - 80}, ${an.aTop[0]} ${an.aTop[1]}`;
  const pathB = `M ${an.hubR[0]} ${an.hubR[1]} C ${an.hubR[0] + 160} ${an.hubR[1]}, ${an.bTop[0] - 40} ${an.bTop[1] - 80}, ${an.bTop[0]} ${an.bTop[1]}`;
  const on = easeOutCubic(P(t, K.on, .5));
  Hb.aOff.setAttribute('d', pathA); Hb.aOn.setAttribute('d', pathA); Hb.aOnHalo.setAttribute('d', pathA);
  Hb.bOn.setAttribute('d', pathB); Hb.bHalo.setAttribute('d', pathB);
  const flow = (-t * 38).toFixed(1);
  Hb.aOff.setAttribute('opacity', hk * draw * .6 * (1 - on)); Hb.aOff.setAttribute('stroke-dashoffset', 0);
  Hb.aOn.setAttribute('opacity', hk * on); Hb.aOnHalo.setAttribute('opacity', hk * on * (.6 + .4 * pulse(t, K.pkt + .25, .3)));
  Hb.aOn.setAttribute('stroke-dashoffset', (t * 38).toFixed(1));
  Hb.bOn.setAttribute('opacity', hk * draw); Hb.bHalo.setAttribute('opacity', hk * draw * .7); Hb.bOn.setAttribute('stroke-dashoffset', flow);
  const mx = lerp(an.hubL[0], an.aTop[0], .5) - 55, my = lerp(an.hubL[1], an.aTop[1], .5) - 34;
  Hb.xMark.style.opacity = hk * draw * (1 - on) * (.75 + .25 * Math.sin(t * 4));
  Hb.xMark.style.transform = `translate(${mx}px,${my}px) scale(${1 - .3 * on})`;
};

/* ------------------------------------------------------------------ the 3D shot (camera + key points) */
// rel = camera yaw relative to the spinning cloud (0 = note18 left, email16 right)
// Scene I (100 s) opens on a co-rotating camera looking at the pulled pair with email16 LEFT, note18 RIGHT.
// The swoop therefore orbits ~120° round the pair and H's last seconds ease onto I's exact camera.
const KN = [-.8, .18, .35], KE = [.75, -.12, -.25];                       // = cloud.KEYS (lib not loaded yet)
const MIDL = lerp3(KN, KE, .5), DIRL = [KE[0] - KN[0], KE[1] - KN[1], KE[2] - KN[2]];
const DLL = Math.hypot(...DIRL), GAP = .3;           // pulled pair = scene I's opening positions
const PULL18 = MIDL.map((m, i) => m - DIRL[i] / DLL * GAP / 2), PULL16 = MIDL.map((m, i) => m + DIRL[i] / DLL * GAP / 2);
/** own pull (front-loaded) so the push-in can start fast while the pair's screen gap only ever shrinks */
const pullK = t => { const x = P(t, 86.5, 2.5); return easeOutCubic(x * x * (3 - 2 * x)) * .7 + easeOutCubic(x) * .3; };
X.pullK = pullK;
const REL_I = Math.atan2(DIRL[2], -DIRL[0]) + .32;   // I's original yaw (rel. to spin) at t=100; H ends at REL_I + PI (note18 left)
const CAM = [
  [57.0, { rel: -.555, ld: Math.log(4.6), p: .25, fov: 46, cx: 1390, cy: 540, rh: 1080, ty: 0 }],   // = E's closing camera
  [74.0, { rel: -.84, ld: Math.log(4.2), p: .32, fov: 46, cx: 1400, cy: 535, rh: 1080, ty: 0 }],
  [75.6, { rel: -.36, ld: Math.log(5.5), p: .47, fov: 46, cx: 900, cy: 600, rh: 1080, ty: 0 }, easeInOutCubic],
  [82.0, { rel: -.2, ld: Math.log(5.3), p: .45, fov: 46, cx: 900, cy: 600, rh: 1080, ty: 0 }],
  [86.45, { rel: -.1, ld: Math.log(5.1), p: .44, fov: 46, cx: 900, cy: 596, rh: 1080, ty: 0 }],
  [89.0, { rel: .45, ld: Math.log(2.5), p: .16, fov: 40, cx: 1395, cy: 510, rh: 1080, ty: 1 }, x => Math.pow(pullK(86.45 + x * 2.55), 1.5)],
  [96.8, { rel: .55, ld: Math.log(2.35), p: .19, fov: 40, cx: 1395, cy: 510, rh: 1080, ty: 1 }],
  [100.0, { rel: REL_I + Math.PI, ld: Math.log(2.7), p: .3, fov: 46, cx: 1490, cy: 520, rh: 1000, ty: 1 }, easeInOutCubic],
  [100.5, { rel: REL_I + Math.PI + .006, ld: Math.log(2.7), p: .3, fov: 46, cx: 1490, cy: 520, rh: 1000, ty: 1 }],
];
X.camAt = function (t) {
  const c = seg(t, CAM);
  const sw = P(t, K.swoop - .05, 2.55);
  const roll = -.1 * Math.sin(Math.PI * easeInOutSine(sw)) + (t > K.red ? wiggle(t, 7, 40, .025) * pulse(t, K.red + .1, .2) : 0);
  const tl = [MIDL[0] * c.ty, (MIDL[1] - .02) * c.ty, MIDL[2] * c.ty];     // I targets the pair's midpoint
  return {
    cam: { target: toWorld(tl, t), dist: Math.exp(c.ld), yaw: c.rel + t * SPIN, pitch: c.p, roll, fov: c.fov, orbit: 0 },
    rect: { x: c.cx - 960, y: c.cy - c.rh / 2, w: 1920, h: c.rh },
  };
};

/** key-point tag in the lib's style; side is continuous (-1 left .. 1 right) so it can glide across */
function drawTag(ctx, pt, L, f) {
  const a = L.a * f; if (a <= .01) return;
  const s = L.side, x = pt.x, y = pt.y;
  const x0 = x + s * 10, y0 = L.dy > 30 ? y + 10 : y - 10, x1 = x + s * (46 + L.dx), y1 = y - 46 + L.dy, x2 = x1 + s * 18;
  ctx.font = `600 24px ${FONT}`; const tw = ctx.measureText(L.text).width;
  let sw = 0; if (L.sub) { ctx.font = `400 18px ${FONT}`; sw = ctx.measureText(L.sub).width; }
  const bw = Math.max(tw, sw) + 28, bh = L.sub ? 62 : 40;
  const bx = lerp(x2 - 6 - bw, x2 + 6, (s + 1) / 2), by = y1 - 20;
  ctx.globalAlpha = a; ctx.strokeStyle = rgba(L.color, .85); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
  ctx.fillStyle = L.color; ctx.beginPath(); ctx.arc(x2, y1, 2.5, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(10,14,22,.86)'; roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
  ctx.strokeStyle = rgba(L.color, .55); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.fillStyle = mixColor(L.color, '#ffffff', .25); ctx.font = `600 24px ${FONT}`; ctx.fillText(L.text, bx + 14, by + 20);
  if (L.sub) { ctx.fillStyle = L.sub === 'disputed' || L.sub === 'conflict?' ? '#FF9A9A' : COL.sub; ctx.font = `400 18px ${FONT}`; ctx.fillText(L.sub, bx + 14, by + 45); }
  ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
}

/** Declare the shared cloud state for this frame. */
X.declareCloud = function (t) {
  const c = X.camAt(t);
  const op = seg(t, [[57.5, .62], [59, .82], [74, .82], [75.5, .78], [86.3, .78], [87.6, .95]]);
  cloud.set({ opacity: op, spin: SPIN, spinOffset: 0, rect: c.rect, dof: .75, keyAlpha: 1 });
  cloud.setCamera(c.cam);
  const redK = t >= K.red ? 1 : 0;                // colour + 'conflict?' switch on the same frame as the red flash
  const ov = easeInOutCubic(P(t, K.g, 1.1));       // split-screen label layout
  const cl = easeInOutCubic(P(t, 87.0, 1.1));      // close-up layout: note18's tag glides from right to left, never hidden
  const n18col = t < K.wave ? COL.amber : redK ? COL.red : mixColor(COL.amber, COL.green, easeOutCubic(P(t, K.wave, .45)));
  const e16col = redK ? COL.red : COL.green;
  const pk = pullK(t);
  cloud.addKeyPoint('note18', { pos: lerp3(KN, PULL18, pk), color: n18col, bornAt: K.born18, size: redK ? 2.8 : 2.7,
    pulse: redK ? .22 : (t < K.on ? .12 : 0), pulseRate: redK ? 2.4 : 1.1 });
  cloud.addKeyPoint('email16', { pos: lerp3(KE, PULL16, pk), color: e16col, bornAt: K.born16, size: redK ? 2.8 : 2.7,
    pulse: redK ? .22 : 0, pulseRate: 2.4 });
  const sub = !redK ? null : t < K.disp ? 'conflict?' : 'disputed';
  const L18 = { color: n18col, text: t < K.wave + .3 ? '18th · Tanishk · queued' : !redK ? '18th · Tanishk · synced' : '18th · Tanishk on set', sub,
    side: lerp(1, -1, cl), dx: lerp(0, 10, cl), dy: lerp(-92 * ov, 100, cl), a: clamp(P(t, K.born18 + .6, .4)) };   // close-up = scene I's tag layout
  const L16 = { color: e16col, text: !redK ? '16th · synced' : '16th · client email', sub: redK ? sub : 'client email',
    side: 1, dx: lerp(-8 * ov, 10, cl), dy: lerp(64 * ov, -10, cl), a: clamp(P(t, K.born16 + .6, .4)) };
  cloud.draw2D((ctx, tt, f, c2) => {
    ctx.globalCompositeOperation = 'source-over';
    const A = c2.screenOf('note18'), B = c2.screenOf('email16');
    if (A && A.vis && !A.hidden) drawTag(ctx, A, L18, f);
    if (B && B.vis && !B.hidden) drawTag(ctx, B, L16, f);
  });
  if (t >= K.wave - .01) cloud.pulseWave(K.wave, COL.green, { origin: cloud.KEYS.note18, speed: 1.55, width: .34, boost: 1.8 });
};

/* ================================================================== Scene F */
let S, matchIdx;
const MATCH = [['matchC', 0], ['matchB', 1], ['matchA', 2]];   // rows top->bottom map to points top->bottom (no crossing)

Scene({
  id: 'F', start: 58, end: 74,
  fadeIn: .8, fadeOut: 0, drift: 0,
  captions: [[70, 73.8, 'No signal. Still remembers. Still searches.']],

  build(root) {
    S = X.buildStage(root);
    matchIdx = [cloud.nearest(cloud.KEYS.matchA, 12), cloud.nearest(cloud.KEYS.matchB, 12), cloud.nearest(cloud.KEYS.matchC, 8)];
  },

  render(t, lt, fade) {
    const live = t < 74;                          // at t = 74 G draws the identical frame on top
    S.wrap.style.visibility = live ? 'visible' : 'hidden'; S.fxc.style.visibility = S.wrap.style.visibility;
    if (!live) return;
    X.renderStage(S, t);
    X.declareCloud(t);

    // ---- search hits light up in the cloud (63.0) and link to the answer's citations
    const lit = win(t, K.link - .1, 66.4, .3, .8);
    if (lit > 0) {
      ['matchA', 'matchB', 'matchC'].forEach((id, i) => {
        const w = i < 2 ? 1 : .8;
        cloud.addKeyPoint(id, { pos: cloud.KEYS[id], color: '#B7C2FF', size: 2.0 * w, alpha: lit * w * (1 + .6 * pulse(t, K.link + .1 * i, .2)), ring: true });
        cloud.tint(matchIdx[i], '#DDE3FF', lit * w, 1.6 * lit * w);
      });
    }
    const ctx = S.ctx; fade = 1;   // the root's crossfade already fades this canvas
    if (lit > 0) {
      MATCH.forEach(([id, i]) => {
        const t0 = K.link + .1 * i;
        if (t < t0) return;
        const pr = cloud.project(cloud.KEYS[id]); if (!pr.vis) return;
        const r = S.A.srcChips[i].getBoundingClientRect();
        const end = [r.right + 10, r.top + r.height / 2];
        const k = easeOutCubic(P(t, t0, .5));
        const ctl = [lerp(pr.x, end[0], .5), i < 2 ? Math.min(pr.y, end[1]) - 40 - 25 * (2 - i) : Math.max(pr.y, end[1]) + 20];   // fan: top rows arc over, the last bows under
        const path = quad([pr.x, pr.y], ctl, end);
        const pts = []; for (let j = 0; j <= 28; j++) pts.push(path(j / 28 * k));
        const a = fade * win(t, t0, 66.4, .05, .8);
        glowPath(ctx, pts, '#9DA9FF', a * .85, 1.8);
        const hd = pts[pts.length - 1];
        drawGlow(ctx, hd[0], hd[1], 14 + 10 * pulse(t, t0 + .5, .15), '#C9D2FF', a * (k < 1 ? 1 : .7));
        // a bead travelling cloud -> answer once connected
        if (k >= 1) { const u = ((t - t0 - .5) * .7) % 1; const bp = path(u); drawGlow(ctx, bp[0], bp[1], 10, '#FFFFFF', a * .6 * Math.sin(u * Math.PI)); }
      });
    }

    // ---- the note leaves the laptop as a spark and becomes the amber point (68.5)
    if (t >= K.noteEnter && t < K.born18 + .6) {
      const r = S.A.noteBox.getBoundingClientRect();
      const from = [r.right - 60, r.top + r.height / 2];
      const pr = cloud.project(cloud.KEYS.note18);
      const to = [pr.x, pr.y];
      const path = quad(from, [lerp(from[0], to[0], .55), Math.min(from[1], to[1]) - 170], to);
      comet(ctx, path, t, K.noteEnter + .08, K.born18, COL.amber, fade, { r: 13, trail: 30 });
    }
    // ---- ...and an envelope drops into the outbox (69.0)
    if (t >= K.born18 + .05 && t < K.outbox + .3) {
      const r = S.A.noteBox.getBoundingClientRect(), ob = S.A.H.obx.getBoundingClientRect();
      const from = [r.left + 140, r.top], to = [ob.left + 26, ob.top + ob.height / 2];
      const path = quad(from, [from[0] + 260, lerp(from[1], to[1], .5)], to);
      comet(ctx, path, t, K.born18 + .08, K.outbox, COL.amber, fade * .9, { r: 9, trail: 22, gap: .02 });
    }
  }
});
})();
