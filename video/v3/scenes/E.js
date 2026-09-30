/* Scene E: Claims, not facts (46–58 s).
 * 46.5 email "Confirming delivery on the 16th." types in · 48.0 words fly apart along curves
 * 48.6 they snap into the claim JSON card · 51.0 / 51.2 / 51.4 annotations (source / tier / status)
 * 52.0 caption · 55.5 card collapses into one glowing point that flies into the 3D cloud (match cut to F)
 */
(function () {
  const START = 46, END = 58, DUR = END - START, DRIFT = .03;
  const T_MAIL = 45.95, T_TYPE = 46.5, CPS = 30, T_FLY = 48.0, T_SNAP = 48.6, T_ANN = [51.0, 51.2, 51.4], T_CAP = 52.0, T_COL = 55.5;
  const MAIL = { x: 440, y: 390, w: 1040, h: 250 };
  const CARD = { x: 380, y: 142, w: 740, h: 716 };
  const FS = 29, LINE_H = 45, J_TOP = 88, J_LEFT = 44;
  const TARGET = [.22, .1, .12];               // neutral spot: a claim joining the memory (NOT the 16th key point, born at 77 in G)
  const PTC = '#9DA9FF', PTH = '#DDE3FF';       // the flying claim point is neutral indigo/white
  const RECT_F = { x: 860, y: 0, w: 1060, h: 1080 };
  const GREEN = COL.green, KEY = COL.indigo, STR = '#E8ECF4', PUN = '#8A93A8';

  // JSON (valid, standard 2-space pretty print). token: [type, text, id?]
  const JSON_LINES = [
    [['p', '{']],
    [['i', '  '], ['k', '"entity_id"'], ['p', ': '], ['s', '"task_sharma_edit"', 'ent'], ['p', ',']],
    [['i', '  '], ['k', '"attribute"'], ['p', ': '], ['s', '"due_date"', 'attr'], ['p', ',']],
    [['i', '  '], ['k', '"value"'], ['p', ': '], ['v', '"2026-10-16"', 'val'], ['p', ',']],
    [['i', '  '], ['k', '"source"'], ['p', ': {']],
    [['i', '    '], ['k', '"kind"'], ['p', ': '], ['s', '"email"', 'kind'], ['p', ',']],
    [['i', '    '], ['k', '"author"'], ['p', ': '], ['s', '"client:sharma"', 'author']],
    [['i', '  '], ['p', '},']],
    [['i', '  '], ['k', '"captured_by"'], ['p', ': '], ['s', '"lakshya"', 'cap'], ['p', ',']],
    [['i', '  '], ['k', '"tier"'], ['p', ': '], ['s', '"team"', 'tier'], ['p', ',']],
    [['i', '  '], ['k', '"status"'], ['p', ': '], ['s', '"active"', 'status']],
    [['p', '}']],
  ];
  const lineLen = i => JSON_LINES[i].reduce((s, tk) => s + tk[1].length, 0);
  // email words / header bits that fly into JSON tokens (src key -> token id), with launch + landing times
  const FLY = [
    { src: 'hEmail', tok: 'kind', t0: 47.96, d: .6 },
    { src: 'hAuthor', tok: 'author', t0: 48.0, d: .58 },
    { src: 'w0', tok: 'status', t0: 48.02, d: .6 },    // "Confirming" -> "active"
    { src: 'w1', tok: 'attr', t0: 48.05, d: .52 },     // "delivery"   -> "due_date"
    { src: 'w4', tok: 'val', t0: 48.0, d: .6 },        // "16th."      -> "2026-10-16"   (lands at 48.6)
  ];
  const ANN = [
    { title: 'who said it', sub: 'source · kind + author', lines: [4, 7], y: 510 },
    { title: 'who may see it', sub: 'tier · device | my devices | team', lines: [9, 9], y: 650 },
    { title: 'still true?', sub: 'status · active | disputed | superseded', lines: [10, 10], y: 776 },
  ];
  const ANN_X = 1196;
  const lineY = i => CARD.y + J_TOP + i * LINE_H + LINE_H / 2;   // centre of JSON line i (page coords, pre-drift)

  let wrap, mail, mailChrome, mailText, words = [], chars = [], hdr = {}, card, cardInner, lines = [], toks = {}, flyers = [], footer, cardHead;
  let annEls = [], bands = [], svg, leaders = [];
  let charW = 16;

  const drift = lt => 1 + DRIFT * clamp(lt / DUR, -.1, 1.1);
  const scr = (x, y, sd) => [960 + (x - 960) * sd, 540 + (y - 540) * sd];

  Scene({
    id: 'E', start: START, end: END, drift: DRIFT,
    captions: [[T_CAP, 57.4, 'Every fact is a claim with a source, so Quorum can spot when two disagree.']],

    build(root) {
      // pre-warm glow sprites (lazily cached in lib): a sprite's first use can rasterise differently from later uses
      { const sc = document.createElement('canvas'); sc.width = sc.height = 8; const g2 = sc.getContext('2d');
        for (const c of ['#C9D2FF', '#9DA9FF', '#DFFFE9', '#FFFFFF', COL.green, COL.indigo, '#E8ECF4'].concat([...Array(41)].map((_, i) => mixColor('#DDE3FF', '#9DA9FF', i / 40)))) { g2.drawImage(glowSprite(c), 0, 0, 4, 4); g2.drawImage(coreSprite(c), 0, 0, 4, 4); } }
      wrap = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px' }, root);
      const m = document.createElement('canvas').getContext('2d'); m.font = `${FS}px Consolas`; charW = m.measureText('0123456789').width / 10;

      // ---------------- email card ----------------
      mail = el('div', { cls: 'abs', style: `left:${MAIL.x}px;top:${MAIL.y}px;width:${MAIL.w}px;height:${MAIL.h}px` }, wrap);
      mailChrome = el('div', { cls: 'card', style: 'left:0;top:0;width:100%;height:100%' }, mail);
      const hb = el('div', { cls: 'abs', style: 'left:0;right:0;top:0;height:66px;border-bottom:1px solid rgba(124,140,255,.16);background:rgba(255,255,255,.02);border-radius:18px 18px 0 0' }, mailChrome);
      el('div', { cls: 'abs', style: 'left:26px;top:17px;width:32px;height:32px;color:#9DA9FF',
        html: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.8 6.5 8.2 6.3 8.2-6.3"/></svg>' }, hb);
      el('div', { cls: 'abs', style: 'right:28px;top:20px;font-size:21px;color:#5B6478', text: 'to: lakshya · 4:31 PM' }, hb);
      const hl = el('div', { cls: 'abs', style: 'left:74px;top:17px;font-size:24px;color:#9AA4C0;font-weight:600;white-space:nowrap' }, mail);
      hdr.hEmail = el('span', { text: 'Email', style: 'display:inline-block;color:#E8ECF4' }, hl);
      el('span', { text: ' · from ', style: 'white-space:pre' }, hl);
      hdr.hAuthor = el('span', { text: 'client:sharma', style: 'display:inline-block;color:#C9D2FF' }, hl);
      hdr.rest = hl;
      mailText = el('div', { cls: 'abs', style: 'left:56px;top:110px;font-size:66px;font-weight:650;color:#fff;letter-spacing:.2px;white-space:nowrap' }, mail);
      const W = 'Confirming delivery on the 16th.'.split(' ');
      W.forEach((w, i) => {
        const s = el('span', { style: 'display:inline-block;position:relative' }, mailText);
        const cs = [...w].map(ch => el('span', { text: ch }, s));
        words.push(s); chars.push(...cs.map(c => [c, i]));
        if (i < W.length - 1) { const sp = el('span', { text: ' ', style: 'white-space:pre' }, mailText); chars.push([sp, -1]); }
      });
      hdr.w0 = words[0]; hdr.w1 = words[1]; hdr.w4 = words[4];

      // ---------------- claim JSON card ----------------
      card = el('div', { cls: 'abs', style: `left:${CARD.x}px;top:${CARD.y}px;width:${CARD.w}px;height:${CARD.h}px;transform-origin:50% 50%` }, wrap);
      cardInner = el('div', { cls: 'card', style: 'left:0;top:0;width:100%;height:100%;overflow:hidden' }, card);
      cardHead = el('div', { cls: 'abs', style: 'left:0;right:0;top:0;height:62px;border-bottom:1px solid rgba(124,140,255,.16);background:linear-gradient(180deg,rgba(124,140,255,.10),rgba(124,140,255,.02))' }, cardInner);
      el('div', { cls: 'abs', style: 'left:24px;top:15px;font-size:17px;font-weight:700;letter-spacing:2.6px;color:#C9D2FF;padding:4px 12px;border-radius:8px;border:1px solid rgba(124,140,255,.5);background:rgba(124,140,255,.14)', text: 'CLAIM' }, cardHead);
      el('div', { cls: 'abs mono', style: 'right:24px;top:18px;font-size:19px;color:#5B6478', html: 'qdrant point · <span style="color:#9AA4C0">payload</span>' }, cardHead);
      // highlight bands for annotated lines
      ANN.forEach(A => {
        bands.push(el('div', { cls: 'abs', style: `left:14px;right:14px;top:${J_TOP + A.lines[0] * LINE_H + 2}px;height:${(A.lines[1] - A.lines[0] + 1) * LINE_H - 4}px;border-radius:10px;background:rgba(124,140,255,.11);border:1px solid rgba(124,140,255,.28)` }, cardInner));
      });
      JSON_LINES.forEach((L, i) => {
        const ln = el('div', { cls: 'abs mono', style: `left:${J_LEFT}px;top:${J_TOP + i * LINE_H}px;height:${LINE_H}px;line-height:${LINE_H}px;font-size:${FS}px;white-space:pre` }, cardInner);
        const parts = [];
        L.forEach(([ty, txt, id]) => {
          const color = ty === 'k' ? KEY : ty === 'v' ? GREEN : ty === 's' ? STR : PUN;
          const s = el('span', { text: txt, style: `color:${color};` + (ty === 'v' ? 'text-shadow:0 0 14px rgba(34,197,94,.45);' : '') }, ln);
          if (id) toks[id] = { el: s, line: i, txt, color, ty }; else parts.push(s);
        });
        lines.push({ el: ln, parts });
      });
      footer = el('div', { cls: 'abs mono', style: `left:${J_LEFT}px;right:24px;bottom:18px;font-size:19px;color:#5B6478;border-top:1px dashed rgba(124,140,255,.18);padding-top:12px`,
        html: 'vectors <span style="color:#9AA4C0">dense + sparse(bm25)</span> · FastEmbed, on-device' }, cardInner);

      // flyers (word -> token morph)
      flyers = FLY.map(f => {
        const fe = el('div', { cls: 'abs', style: 'left:0;top:0;white-space:pre;will-change:transform' }, wrap);
        const a = el('div', { cls: 'abs', style: 'left:0;top:0;transform-origin:0 50%;white-space:pre' }, fe);
        const b = el('div', { cls: 'abs mono', style: `left:0;top:0;transform-origin:0 50%;white-space:pre;font-size:${FS}px;line-height:${LINE_H}px` }, fe);
        return Object.assign({ fe, a, b }, f);
      });

      // annotations + leader lines
      const NS = 'http://www.w3.org/2000/svg';
      svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', 1920); svg.setAttribute('height', 1080);
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'; wrap.appendChild(svg);
      ANN.forEach((A, i) => {
        const a = el('div', { cls: 'abs', style: `left:${ANN_X}px;top:${A.y - 42}px;height:84px;padding:10px 22px 0 22px;border-radius:14px;background:rgba(14,19,31,.9);border:1px solid rgba(124,140,255,.45);box-shadow:0 14px 40px rgba(0,0,0,.5),0 0 24px rgba(124,140,255,.16);transform-origin:0 50%;white-space:nowrap` }, wrap);
        el('div', { text: A.title, style: 'font-size:32px;font-weight:700;color:#fff;line-height:38px' }, a);
        el('div', { cls: 'mono', text: A.sub, style: 'font-size:18px;color:#9DA9FF;line-height:26px' }, a);
        annEls.push(a);
        // leader: from the end of the longest annotated line to the annotation (bracket for multi-line blocks)
        const x0 = CARD.x + J_LEFT + Math.max(...[...Array(A.lines[1] - A.lines[0] + 1)].map((_, k) => lineLen(A.lines[0] + k))) * charW + 16;
        const ya = lineY(A.lines[0]), yb = lineY(A.lines[1]), ym = (ya + yb) / 2;
        let d, len;
        const xe = ANN_X - 6, xm = CARD.x + CARD.w + 30;
        if (A.lines[1] > A.lines[0]) {
          d = `M${x0 - 6} ${ya - 14} H${x0 + 8} V${yb + 14} H${x0 - 6} M${x0 + 8} ${ym} H${xm} L${xe} ${A.y}`;
          len = 14 + (yb - ya + 28) + 14 + (xm - x0 - 8) + Math.hypot(xe - xm, A.y - ym);
        } else {
          d = `M${x0} ${ya} H${xm} L${xe} ${A.y}`;
          len = (xm - x0) + Math.hypot(xe - xm, A.y - ya);
        }
        const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#9DA9FF'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round');
        p.style.filter = 'drop-shadow(0 0 4px rgba(124,140,255,.8))';
        svg.appendChild(p);
        const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('cx', A.lines[1] > A.lines[0] ? x0 + 8 : x0); dot.setAttribute('cy', ym); dot.setAttribute('r', 4); dot.setAttribute('fill', '#C9D2FF');
        svg.appendChild(dot);
        leaders.push({ p, dot, len: len + 4 });
      });
    },

    render(t, lt, fade) {
      const sd = drift(lt);
      const ctx = Q.fx;

      // ================= email =================
      const mk = show(mail, t, T_MAIL, .8, { dx: 110, dy: 0, scale: .94, blur: 6 });
      // the incoming line arrives whole (no typing): fade + slide in at 46.5
      const lk = E(t, T_TYPE, .45, easeOutCubic);
      mailText.style.opacity = clamp(P(t, T_TYPE, .4));
      mailText.style.transform = `translateY(${(1 - lk) * 18}px)`;
      mailText.style.filter = lk < .98 ? `blur(${(1 - lk) * 6}px)` : 'none';
      const typeEnd = T_TYPE + .4;
      // "16th." warms to green once it has arrived
      const g = E(t, typeEnd + .15, .5, easeOutCubic);
      hdr.w4.style.color = mixColor('#ffffff', GREEN, g);
      hdr.w4.style.textShadow = `0 0 ${22 * g}px rgba(34,197,94,${.55 * g})`;
      // chrome dissolves as the words leave
      const dis = easeInOutCubic(P(t, T_FLY, .45));
      mailChrome.style.opacity = 1 - dis;
      mailChrome.style.transform = `scale(${1 - .04 * dis})`;
      mailChrome.style.filter = dis > .02 ? `blur(${6 * dis}px)` : 'none';
      hdr.rest.style.opacity = 1 - dis;
      const flying = t >= FLY[0].t0 - .001;
      for (const f of FLY) hdr[f.src].style.opacity = t >= f.t0 ? 0 : 1;
      // "on" / "the" dissolve into particles (drawn below)
      const dust = easeInCubic(P(t, T_FLY + .02, .25));
      words[2].style.opacity = 1 - dust; words[3].style.opacity = 1 - dust;
      words[2].style.filter = words[3].style.filter = dust > .02 ? `blur(${4 * dust}px)` : 'none';

      // ================= claim card =================
      const cin = show(card, t, T_FLY + .05, .55, { dy: 0, scale: .95, blur: 8 });
      show(cardHead, t, T_FLY + .15, .5, { dy: -10 });
      lines.forEach((L, i) => L.parts.forEach(p => { const k = E(t, T_FLY + .12 + i * .035, .45); p.style.opacity = k; })) ;
      lines.forEach((L, i) => { L.el.style.transform = `translateX(${(1 - E(t, T_FLY + .12 + i * .035, .5)) * -14}px)`; });
      // flown tokens appear exactly when their flyer lands
      for (const f of FLY) {
        const land = f.t0 + f.d; const T = toks[f.tok];
        T.el.style.opacity = t >= land ? 1 : 0;
        const fl = pulse(t, land + .05, .16);
        T.el.style.textShadow = `0 0 ${6 + 20 * fl}px ${rgba(T.color === STR ? '#9DA9FF' : T.color, .35 + .6 * fl)}`;
      }
      // entity_id forms from the "on the" dust; captured_by + tier type in
      const typeTok = (id, t0, cps) => { const T = toks[id]; const n = Math.floor(clamp((t - t0) * cps, 0, T.txt.length)); setText(T.el, T.txt.slice(0, n) + ' '.repeat(T.txt.length - n)); T.el.style.opacity = 1; };
      typeTok('ent', T_FLY + .62, 70); typeTok('cap', T_SNAP + .2, 60); typeTok('tier', T_SNAP + .32, 60);
      show(footer, t, T_SNAP + .6, .6, { dy: 8 });
      const snap = pulse(t, T_SNAP + .04, .18);
      cardInner.style.borderColor = rgba(COL.indigo, .28 + .6 * snap);
      cardInner.style.boxShadow = `0 30px 80px rgba(0,0,0,.55),0 0 ${70 * snap + 10}px ${rgba(COL.indigo, .12 + .45 * snap)}`;

      // ================= flyers =================
      const cardR = [CARD.x, CARD.y];
      flyers.forEach((f, i) => {
        const src = hdr[f.src], T = toks[f.tok];
        const k0 = P(t, f.t0, f.d);
        const on = t >= f.t0 && t < f.t0 + f.d;
        f.fe.style.display = on ? 'block' : 'none';
        if (!on) return;
        // source rect (page coords; offsets are layout-only, so transforms don't disturb them)
        const isHdr = f.src[0] === 'h';
        const par = isHdr ? hdr.rest : mailText;
        const sx = MAIL.x + par.offsetLeft + src.offsetLeft, sy = MAIL.y + par.offsetTop + src.offsetTop + src.offsetHeight / 2;
        const tx = cardR[0] + J_LEFT + T.el.offsetLeft, ty = cardR[1] + J_TOP + T.line * LINE_H + LINE_H / 2;
        const k = easeInOutCubic(k0);
        // cubic path: first burst outward ("fly apart"), then glide into the slot
        const ox = (i - 2) * 150, oy = (i % 2 ? -1 : 1) * 190 + (isHdr ? -160 : 0);
        const p = bezP([sx, sy], [sx + ox, sy + oy], [tx - 260, ty + (i % 2 ? 60 : -60)], [tx, ty], k);
        const srcFs = isHdr ? 24 : 66;
        setText(f.a, src.textContent); f.a.style.fontSize = srcFs + 'px'; f.a.style.fontWeight = isHdr ? 600 : 650;
        f.a.style.color = f.src === 'w4' ? GREEN : isHdr ? (f.src === 'hAuthor' ? '#C9D2FF' : '#E8ECF4') : '#fff';
        setText(f.b, T.txt); f.b.style.color = T.color;
        const sc = lerp(1, FS / srcFs, k), cross = easeInOutSine(P(k0, .3, .45));
        f.a.style.transform = `translateY(-50%) scale(${sc})`; f.a.style.opacity = 1 - cross;
        f.b.style.transform = `translateY(-50%) scale(${lerp(srcFs / FS * .8, 1, easeOutCubic(k))})`; f.b.style.opacity = cross;
        const rot = Math.sin(Math.PI * k) * (i % 2 ? -9 : 8);
        f.fe.style.transform = `translate(${p[0]}px,${p[1]}px) rotate(${rot}deg)`;
        f.fe.style.filter = `blur(${(Math.sin(Math.PI * k) * 1.6).toFixed(2)}px) drop-shadow(0 0 10px rgba(157,169,255,.7))`;
        f.fe.style.opacity = 1;
      });

      // ================= annotations =================
      const out = easeInOutCubic(P(t, T_COL - .45, .4));
      ANN.forEach((A, i) => {
        const ta = T_ANN[i];
        const lk = easeOutCubic(P(t, ta - .14, .34)) * (1 - out);
        leaders[i].p.setAttribute('stroke-dasharray', `${leaders[i].len} ${leaders[i].len}`);
        leaders[i].p.setAttribute('stroke-dashoffset', leaders[i].len * (1 - lk));
        leaders[i].p.style.opacity = lk > 0 ? 1 : 0;
        leaders[i].dot.setAttribute('r', 4 + 3 * pulse(t, ta - .1, .12));
        leaders[i].dot.style.opacity = clamp(P(t, ta - .16, .1)) * (1 - out);
        pop(annEls[i], t, ta, .7, .55);
        annEls[i].style.opacity = +annEls[i].style.opacity * (1 - out);
        const bk = E(t, ta - .05, .4) * (1 - out);
        bands[i].style.opacity = bk * (.75 + .25 * pulse(t, ta + .1, .2));
      });

      // ================= collapse (55.5) =================
      const c1 = easeInCubic(P(t, T_COL, .4));            // squash to a line
      const c2 = easeInCubic(P(t, T_COL + .36, .26));      // line to a point
      const inner = 1 - clamp(P(t, T_COL, .3));
      if (t >= T_COL) {
        card.style.transform = `scale(${lerp(1, .82, c1) * (1 - c2)}, ${Math.max(.004, 1 - c1 * .996)})`;
        card.style.filter = c1 > .01 ? `brightness(${1 + .7 * c1})` : 'none';
        card.style.opacity = clamp(1 - c2 * 1.1) * (1 - .45 * c1);
      }
      lines.forEach(L => { L.el.style.opacity = inner; }); footer.style.opacity = +footer.style.opacity * inner; cardHead.style.opacity = +cardHead.style.opacity * inner;

      // ================= cloud =================
      const mv = easeInOutCubic(P(t, T_COL + .2, 2.2));
      const rx = lerp(0, RECT_F.x, mv), rw = lerp(1920, RECT_F.w, mv);
      cloud.set({ opacity: lerp(.18, .62, easeInOutCubic(P(t, T_COL, 2.3))), spin: .035, rect: { x: rx, y: 0, w: rw, h: 1080 } });
      const u = easeInOutSine(P(t, START - .5, DUR));
      cloud.setCamera({ target: [0, 0, 0], dist: lerp(lerp(3.7, 4.0, u), 4.6, mv), yaw: lerp(.5, .3, mv), pitch: lerp(.24, .25, mv), orbit: .02, fov: 46 });
      const tp = cloud.project(TARGET);
      const T_LAND = 57.45;
      const arr = pulse(t, T_LAND + .05, .3);
      if (t > T_LAND - .1) cloud.tint(cloud.nearest(TARGET, 18), PTH, clamp(P(t, T_LAND, .2)) * (1 - .6 * P(t, T_LAND + .4, 1)), 1.4 * arr + .3);

      // ================= fx canvas =================
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // dust from "on the" -> entity_id value
      if (t > T_FLY && t < T_FLY + 1.1) {
        const ent = toks.ent;
        const ex = CARD.x + J_LEFT + ent.el.offsetLeft, ey = CARD.y + J_TOP + ent.line * LINE_H + LINE_H / 2;
        const ew = ent.txt.length * charW;
        for (let wi = 2; wi <= 3; wi++) {
          const w = words[wi]; const wx = MAIL.x + mailText.offsetLeft + w.offsetLeft, wy = MAIL.y + mailText.offsetTop + w.offsetTop, ww = w.offsetWidth, wh = w.offsetHeight;
          for (let n = 0; n < 26; n++) {
            const id = wi * 100 + n;
            const t0 = T_FLY + .02 + rand(id, 1) * .12, d = .5 + rand(id, 2) * .12;
            const k0 = P(t, t0, d); if (k0 <= 0 || k0 >= 1) continue;
            const k = easeInOutCubic(k0);
            const s0 = [wx + rand(id, 3) * ww, wy + wh * (.3 + .45 * rand(id, 4))];
            const e0 = [ex + rand(id, 5) * ew, ey + (rand(id, 6) - .5) * 14];
            const pp = bezP(s0, [s0[0] + (rand(id, 7) - .5) * 260, s0[1] - 150 - rand(id, 8) * 200], [e0[0] - 120, e0[1] - 40], e0, k);
            const a = fade * Math.sin(Math.PI * k0) ** .6;
            const q = scr(pp[0], pp[1], sd);
            drawGlow(ctx, q[0], q[1], 7 + 4 * rand(id, 9), '#C9D2FF', a);
          }
        }
      }
      // snap sparks at landings
      for (const f of FLY) {
        const land = f.t0 + f.d, a = pulse(t, land + .03, .12); if (a < .02) continue;
        const T = toks[f.tok]; const x = CARD.x + J_LEFT + T.el.offsetLeft + T.txt.length * charW / 2, y = CARD.y + J_TOP + T.line * LINE_H + LINE_H / 2;
        const q = scr(x, y, sd);
        drawGlow(ctx, q[0], q[1], 60 + T.txt.length * 4, T.color === STR ? '#9DA9FF' : T.color, fade * a * .55, false);
      }
      // collapse glow + the flying point
      const cc = scr(CARD.x + CARD.w / 2, CARD.y + CARD.h / 2, sd);
      if (t > T_COL) {
        const lineA = clamp(c1 * 1.2) * (1 - c2);
        const hw = CARD.w / 2 * lerp(1, .82, c1) * (1 - c2) * sd;
        glowLine(ctx, cc[0] - hw, cc[1], cc[0] + hw, cc[1], '#C9D2FF', fade * lineA, 3);
        // sparks sucked in
        for (let n = 0; n < 28; n++) {
          const k0 = P(t, T_COL + rand(n, 41) * .25, .45); if (k0 <= 0 || k0 >= 1) continue;
          const ang = rand(n, 42) * 6.283, r = (1 - easeInCubic(k0)) * (260 + rand(n, 43) * 200);
          drawGlow(ctx, cc[0] + Math.cos(ang) * r, cc[1] + Math.sin(ang) * r * .6, 8, rand(n, 44) < .3 ? PTH : PTC, fade * Math.sin(Math.PI * k0));
        }
      }
      const T_PT = T_COL + .5;
      if (t > T_COL + .3 && t < T_LAND + 1.2) {
        const grow = easeOutCubic(P(t, T_COL + .3, .35));
        const fk0 = P(t, T_PT + .15, T_LAND - T_PT - .15), fk = easeInOutCubic(fk0);
        const tgt = [tp.x, tp.y];
        const ctrl1 = [cc[0] + 180, cc[1] - 330], ctrl2 = [tgt[0] - 160, tgt[1] - 300];
        const at = u2 => bezP(cc, ctrl1, ctrl2, tgt, u2);
        const pos = at(fk);
        const alive = 1 - clamp(P(t, T_LAND, .25));
        // comet trail
        if (fk0 > 0 && fk0 < 1) for (let q = 1; q <= 40; q++) {
          const pq = at(clamp(fk - q * .0105));
          drawGlow(ctx, pq[0], pq[1], 30 * (1 - q / 41), mixColor(PTH, PTC, q / 40), fade * .75 * (1 - q / 41));
        }
        const br = 1 + .5 * pulse(t, T_PT, .2) + .25 * Math.sin(t * 14);
        const sz = lerp(1.15, .85, fk);
        drawGlow(ctx, pos[0], pos[1], 110 * grow * sz * br, PTC, fade * .55 * grow * alive, false);
        drawGlow(ctx, pos[0], pos[1], 46 * grow * sz, PTH, fade * grow * alive, true);
        drawGlow(ctx, pos[0], pos[1], 20 * grow * sz, '#FFFFFF', fade * grow * alive, true);
        // arrival: flash + shockwave into the cloud
        if (t > T_LAND - .05) {
          drawGlow(ctx, tgt[0], tgt[1], 160 * (.5 + arr), PTC, fade * arr * .6, false);
          drawGlow(ctx, tgt[0], tgt[1], 20, '#FFFFFF', fade * (.4 + .6 * arr) * (1 - clamp(P(t, T_LAND + .3, .5))), true);
          for (const [dl, mul] of [[0, 1], [.14, .6]]) {
            const q = P(t, T_LAND + dl, 1.0); if (q <= 0 || q >= 1) continue;
            ctx.save(); ctx.globalAlpha = fade * (1 - q) * .9; ctx.strokeStyle = PTC; ctx.lineWidth = 1 + 3 * (1 - q);
            const rr = 10 + easeOutExpo(q) * 170 * mul; ctx.beginPath(); ctx.ellipse(tgt[0], tgt[1], rr, rr * .9, 0, 0, 6.283); ctx.stroke(); ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  });

  function bezP(p0, p1, p2, p3, u) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }
})();
