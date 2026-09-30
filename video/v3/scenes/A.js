/* Scene A: Hook (0–14 s). Intimate typographic cold open.
 * 0.5  seven project orbs fade in on a slow tilted ring (labelled subtly)
 * 2.0  "I run seven projects at once."
 * 5.0  "Game project" swells and drifts to the centre; the others dim into bokeh.
 *      A tiny red deadline orb beside "Sharma edit" starts blinking, unnoticed.
 * 5.5  "When one gets interesting, / I forget the others exist."
 * 9.5  the ring divides into four rings (four people), linked by sync lines
 * 10.5 signal-bars icon glitches in and is crossed out; the links break (amber)
 * 10.5 "Now imagine four of us. / Half the time on shoots with no signal."
 */
(function () {
  const START = 0, END = 14;
  const FOCUS = 5.0, MULT = 9.5, SIG = 10.5;
  const CX = 960, CY = 390, RX = 440, RY = 132;
  const NAMES = ['Game project', 'Sharma edit', 'Reel cutdowns', 'Invoices', "Riya's birthday", 'Brand shoot', 'Podcast'];
  const TINTS = ['#AEB8FF', '#8FD3FF', '#B49CFF', '#A5B4FC', '#C9D2FF', '#7C8CFF', '#9DB4FF'];
  const SLOTS = [300, 740, 1180, 1620], ROW_Y = 425;
  const SLOT_OF = [1, 2, 0, 3];           // ring j -> slot index
  const AMBER_SLOTS = [0, 2];              // "half the time on shoots"
  const TAU = Math.PI * 2;
  // shared with scene B so the cloud camera is continuous 0 -> 24 s (and meets C's camera at 24)
  const camDist = t => lerp(7.6, 4.9, easeInOutSine(clamp(t / 23.75)));
  const rectY = t => lerp(-150, 0, easeInOutSine(P(t, 12.5, 11)));

  let L1, L2a, L2b, L3a, L3b, icon, iconLayers, others, forgetWords;

  function mkLine(root, segs, top, size = 72, weight = 600) {
    const d = el('div', { cls: 'abs', style: `left:0;right:0;top:${top}px;text-align:center;font-size:${size}px;font-weight:${weight};letter-spacing:-.012em;line-height:1;color:#E8ECF4;white-space:nowrap;text-shadow:0 0 34px rgba(124,140,255,.22)` }, root);
    const words = [];
    segs.forEach(([txt, st]) => txt.split(/\s+/).filter(Boolean).forEach(w => {
      words.push(el('span', { text: w, style: `display:inline-block;margin:0 .135em;${st || ''}` }, d));
    }));
    return words;
  }
  // per-word entrance (rise + unblur) and optional exit (lift + blur)
  function wordsAnim(ws, t, a, gap, out = null, outGap = .03) {
    ws.forEach((w, i) => {
      const ki = easeOutExpo(P(t, a + i * gap, .9));
      const ko = out == null ? 0 : easeInOutCubic(P(t, out + i * outGap, .5));
      w.style.opacity = clamp(Math.min(1, ki * 1.25) * (1 - ko));
      w.style.transform = `translateY(${((1 - ki) * 30 - ko * 20).toFixed(2)}px)`;
      const b = (1 - ki) * 12 + ko * 10; w.style.filter = b > .05 ? `blur(${b.toFixed(2)}px)` : 'none';
    });
  }

  function signalSVG(bars, slash, cut) {
    const r = [[18, 64, 18], [36, 50, 32], [54, 36, 46], [72, 22, 60]]
      .map(([x, y, hh]) => `<rect class="b" x="${x}" y="${y}" width="12" height="${hh}" rx="3" fill="${bars}"/>`).join('');
    return `<svg width="96" height="96" viewBox="0 0 100 100" style="position:absolute;left:22px;top:22px;overflow:visible">${r}` +
      (cut ? `<line class="s" x1="14" y1="16" x2="86" y2="88" stroke="${cut}" stroke-width="15" stroke-linecap="round" stroke-dasharray="102" stroke-dashoffset="102"/>` : '') +
      `<line class="s" x1="14" y1="16" x2="86" y2="88" stroke="${slash}" stroke-width="7" stroke-linecap="round" stroke-dasharray="102" stroke-dashoffset="102"/></svg>`;
  }

  // glitch state for the frame (deterministic per 30fps frame index)
  function glitch(t, t0, dur, amp) {
    if (t < t0 || t > t0 + dur) return { a: 0, dx: 0, dy: 0, sp: 0, fl: 1 };
    const f = Math.floor(t * 30), a = 1 - P(t, t0, dur) * .7;
    return { a, dx: (rand(f, 1) - .5) * 2 * amp * a, dy: (rand(f, 2) - .5) * amp * .6 * a, sp: (6 + rand(f, 3) * 10) * a, fl: rand(f, 4) > .3 ? 1 : .35 };
  }

  // glass orb, crossfading into an out-of-focus bokeh disc with `blur`
  function orb(ctx, x, y, R, color, a, blur) {
    if (a <= .003) return;
    const sharp = a * (1 - blur), bo = a * blur;
    if (sharp > .003) {
      drawGlow(ctx, x, y, R * 3.6, color, sharp * .5, false);
      drawGlow(ctx, x, y, R * 1.35, color, sharp * .95, true);
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x - R * .3, y - R * .35, R * .1, x, y, R);
      gr.addColorStop(0, rgba(color, .26)); gr.addColorStop(.7, rgba(color, .08)); gr.addColorStop(1, rgba(color, .2));
      ctx.globalAlpha = clamp(sharp); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp(sharp * .55); ctx.strokeStyle = mixColor(color, '#ffffff', .4); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.globalAlpha = clamp(sharp * .5); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, R * .72, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
    }
    if (bo > .003) {
      const Rb = R * (1 + 1.5 * blur);
      drawGlow(ctx, x, y, Rb * 2.4, color, bo * .22, false);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(bo * .16); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Rb, 0, TAU); ctx.fill();
      ctx.globalAlpha = clamp(bo * .3); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  Scene({
    id: 'A', start: START, end: END,
    fadeOut: .6,

    build(root) {
      L1 = mkLine(root, [['I run'], ['seven', 'color:#C9D0FF'], ['projects at once.']], 748);
      L2a = mkLine(root, [['When one gets'], ['interesting,', 'color:#fff']], 700);
      L2b = mkLine(root, [['I forget'], ['the others exist.', '']], 796);
      forgetWords = L2b.slice(2);
      L3a = mkLine(root, [['Now imagine'], ['four', 'color:#C9D0FF'], ['of us.']], 700);
      L3b = mkLine(root, [['Half the time on shoots with'], ['no signal.', 'color:#F5A524']], 796);

      icon = el('div', { cls: 'abs', style: `left:${960 - 70}px;top:${ROW_Y - 70}px;width:140px;height:140px;border-radius:50%;background:rgba(13,18,30,.94);border:1.5px solid rgba(245,165,36,.5);box-shadow:0 0 50px rgba(245,165,36,.18),0 20px 50px rgba(0,0,0,.6)` }, root);
      const inner = el('div', { cls: 'abs', style: 'left:0;top:0;width:140px;height:140px' }, icon);
      const gR = el('div', { cls: 'abs', style: 'left:0;top:0;width:140px;height:140px;mix-blend-mode:screen', html: signalSVG('#FF2E63', '#FF2E63') }, inner);
      const gC = el('div', { cls: 'abs', style: 'left:0;top:0;width:140px;height:140px;mix-blend-mode:screen', html: signalSVG('#2EE6FF', '#2EE6FF') }, inner);
      const base = el('div', { cls: 'abs', style: 'left:0;top:0;width:140px;height:140px', html: signalSVG('#C9D2FF', '#F5A524', 'rgb(13,18,30)') }, inner);
      iconLayers = { inner, gR, gC, base, bars: $$('rect', base), slashes: [...$$('line', base), ...$$('line', gR), ...$$('line', gC)] };
    },

    render(t, lt, f) {
      Q.setBlack(1 - easeInOutSine(P(t, 0, 1.1)));

      const fk = E(t, FOCUS, 1.3, easeInOutCubic) * (1 - E(t, 8.85, .65, easeInOutCubic));  // focus on "Game project"
      // ---- ambient world: the same cloud later scenes use, far away and dim ----
      cloud.set({ opacity: lerp(.1, .34, E(t, .2, 2.6, easeOutCubic)) * (1 - .3 * fk), spin: .035, rect: { x: 0, y: rectY(t), w: 1920, h: 1080 } });
      cloud.setCamera({ target: [0, 0, 0], dist: camDist(t), yaw: .15, pitch: .32, orbit: .02, fov: 46 });

      // ---- orbs, rings, links (cloud canvas, under the DOM) ----
      cloud.draw2D((ctx, t, fa) => {
        const s = 1 + .03 * clamp(t / (END - START), -.1, 1.1);
        ctx.setTransform(s, 0, 0, s, 960 * (1 - s), 540 * (1 - s));
        const fkk = E(t, FOCUS, 1.3, easeInOutCubic) * (1 - E(t, 8.85, .65, easeInOutCubic));
        const orbs = [], labels = [], hubs = [];
        const amberK = E(t, 11.2, .9, easeInOutCubic);
        for (let j = 0; j < 4; j++) {
          // divide: the ring contracts first, then four rings fan out to their slots
          const shrink = E(t, MULT - .05, .6, easeInOutCubic);
          const mj = E(t, MULT + .2 + .04 * j, .72, easeInOutCubic);
          const ra = j === 0 ? 1 : E(t, MULT + .3 + .04 * j, .4, easeOutCubic);
          if (ra <= .003) continue;
          const slot = SLOT_OF[j];
          const cx = lerp(CX, SLOTS[slot], mj), cy = lerp(CY, ROW_Y, mj), sc = lerp(1, .32, shrink);
          const amb = AMBER_SLOTS.includes(slot) ? amberK : 0;
          const spread = j === 0 ? 1 + .2 * fkk : 1;
          // ring hairline (ring 0 draws itself on at the start)
          const drawK = j === 0 ? easeInOutCubic(P(t, .25, 1.6)) : 1;
          if (drawK > 0) {
            const rc = mixColor('#7C8CFF', COL.amber, amb);
            ctx.globalCompositeOperation = 'lighter';
            for (const [lw, al] of [[5, .035], [1.3, .2]]) {
              ctx.globalAlpha = clamp(fa * ra * al * (1 - .5 * fkk)); ctx.strokeStyle = rc; ctx.lineWidth = lw;
              ctx.beginPath(); ctx.ellipse(cx, cy, RX * sc * spread, RY * sc * spread, 0, Math.PI / 2, Math.PI / 2 + TAU * drawK); ctx.stroke();
            }
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          }
          if (mj > .01) hubs.push({ x: cx, y: cy, a: ra * mj, amb });
          for (let i = 0; i < 7; i++) {
            const t0 = .5 + i * .12;
            const app = j === 0 ? E(t, t0, 1.0, easeOutCubic) : 1;
            if (app <= .003) continue;
            const th = .085 * (t - FOCUS) + Math.PI / 2 + i * TAU / 7 + j * .9;
            const dp = (Math.sin(th) + 1) / 2;                    // 0 back .. 1 front
            let x = cx + RX * sc * spread * Math.cos(th), y = cy + RY * sc * spread * Math.sin(th);
            let R = 21 * Math.pow(sc, .68) * (.8 + .3 * dp) * lerp(.4, 1, spring(P(t, t0, 1.1)));
            let a = fa * ra * app * (.6 + .4 * dp), blur = 0;
            let col = mixColor(TINTS[i], COL.amber, .72 * amb);
            const hero = j === 0 && i === 0;
            if (j === 0) {
              if (hero) { x = lerp(x, CX, fkk); y = lerp(y, CY - 8, fkk); R *= 1 + 1.65 * fkk; a = lerp(a, fa, fkk); col = mixColor(col, '#DDE2FF', .5 * fkk); }
              else { a *= 1 - .75 * fkk; R *= 1 - .4 * fkk; blur = .3 * fkk; }
            }
            orbs.push({ x, y, R, col, a, blur, dp: hero ? 2 + fkk : dp, hero, i, j, sc });
            // label (ring 0 only; fades as the ring divides)
            if (j === 0) {
              const la = fa * app * E(t, t0 + .35, .8, easeOutCubic) * (1 - E(t, 9.1, .45, easeInOutCubic)) * (hero ? 1 : 1 - .6 * fkk) * (.55 + .45 * dp);
              labels.push({ x, y: y + R + (hero ? lerp(28, 44, fkk) : 28), text: NAMES[i], a: la, hero });
            }
            // the red deadline orb rides beside "Sharma edit"
            if (i === 1) {
              const blip = Math.max(Math.pow(Math.max(0, Math.cos(TAU * .85 * (t - FOCUS) + j * 1.3)), 10), j === 0 ? pulse(t, 7.0, .12) : 0);
              const da = fa * ra * app * E(t, FOCUS - .04, .1, linear) * (.35 + .65 * blip);
              const off = R * 1.25 + 9 * sc;
              orbs.push({ red: true, x: x + off, y: y - off * .8, R: 7 * Math.max(.55, sc), a: da, blip, big: j === 0 ? pulse(t, 7.0, .14) : 0, dp: 3, j });
            }
          }
        }
        orbs.sort((p, q) => p.dp - q.dp);
        for (const o of orbs) {
          if (o.red) {
            drawGlow(ctx, o.x, o.y, o.R * 5 * (1 + .5 * o.blip + 1.2 * o.big), COL.red, o.a * (.55 + .4 * o.big), false);
            drawGlow(ctx, o.x, o.y, o.R * 1.6, COL.red, o.a, true);
            continue;
          }
          if (o.hero) drawGlow(ctx, o.x, o.y, o.R * 7, '#8E9BFF', o.a * .28 * fkk, false);
          orb(ctx, o.x, o.y, o.R, o.col, o.a, o.blur);
        }
        // tiny "due tomorrow" beside the blinking deadline orb (ring 0), easy to miss
        const dl = orbs.find(o => o.red && o.j === 0);
        if (dl) {
          const la = fa * (.5 + .5 * dl.blip) * (1 - E(t, 9.1, .4, easeInOutCubic)) * E(t, FOCUS + .2, .6, easeOutCubic);
          if (la > .01) { ctx.globalAlpha = la; ctx.fillStyle = '#F87171'; ctx.font = `600 18px ${FONT}`; ctx.letterSpacing = '1.2px'; ctx.textAlign = 'left'; ctx.fillText('DUE TOMORROW', dl.x + 14, dl.y - 12); }
        }
        // labels
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const l of labels) {
          if (l.a <= .01) continue;
          const sz = l.hero ? lerp(21, 30, fkk) : 21;
          ctx.font = `${l.hero && fkk > .5 ? 600 : 500} ${sz.toFixed(1)}px ${FONT}`; ctx.letterSpacing = l.hero ? `${lerp(.4, 1.2, fkk).toFixed(2)}px` : '.4px';
          ctx.globalAlpha = clamp(l.a * (l.hero ? lerp(.75, 1, fkk) : .75)); ctx.fillStyle = l.hero ? mixColor('#9AA4C0', '#FFFFFF', fkk) : '#9AA4C0';
                    ctx.fillText(l.text, l.x, l.y);
        }
        ctx.filter = 'none';
        ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        // hubs: one person at the centre of each ring
        for (const hb of hubs) {
          const c = mixColor('#E8ECF4', COL.amber, hb.amb);
          drawGlow(ctx, hb.x, hb.y, 34, c, fa * hb.a * .35, false);
          drawGlow(ctx, hb.x, hb.y, 9, c, fa * hb.a, true);
        }
        // sync links between neighbouring people; they glitch and break when the signal dies
        const g = glitch(t, SIG, .3, 1);
        for (let k = 0; k < 3; k++) {
          const lk = E(t, 10.12 + k * .05, .38, easeOutCubic); if (lk <= .003) continue;
          const x1 = SLOTS[k] + RX * .32 + 20, x2 = SLOTS[k + 1] - RX * .32 - 20, mid = (x1 + x2) / 2;
          const brk = E(t, SIG + .12, .6, easeOutExpo);
          const col = mixColor('#7C8CFF', COL.amber, brk);
          const al = fa * lk * lerp(.55, .4, brk) * g.fl;
          const gap = brk * (x2 - x1) * .5;
          const xe = lerp(x1, x2, lk);
          glowLine(ctx, x1, ROW_Y, Math.min(xe, mid - gap / 2), ROW_Y, col, al, 1.3);
          if (xe > mid + gap / 2) glowLine(ctx, mid + gap / 2, ROW_Y, xe, ROW_Y, col, al, 1.3);
          if (brk > .02) { // frayed ends
            drawGlow(ctx, mid - gap / 2, ROW_Y, 10, COL.amber, al * .9, true);
            drawGlow(ctx, mid + gap / 2, ROW_Y, 10, COL.amber, al * .9, true);
          }
          for (let q = 0; q < 2; q++) { // data packets (stop when the link breaks)
            const u = ((t * .9 + k * .37 + q * .5) % 1);
            drawGlow(ctx, lerp(x1, x2, u), ROW_Y, 11, '#C9D2FF', fa * lk * (1 - brk) * Math.sin(u * Math.PI) * .9, true);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      });

      // ---- kinetic type ----
      wordsAnim(L1, t, 2.0, .085, 4.85);
      wordsAnim(L2a, t, 5.5, .085, 9.0);
      wordsAnim(L2b, t, 6.05, .085, 9.08);
      // "the others exist." fade away as they are forgotten
      const fg = E(t, 7.4, 1.4, easeInOutCubic);
      forgetWords.forEach(w => { w.style.opacity = +w.style.opacity * (1 - .62 * fg); w.style.color = mixColor('#E8ECF4', '#8A93A8', fg); });
      wordsAnim(L3a, t, SIG, .08, 13.72, .02);
      wordsAnim(L3b, t, 11.05, .065, 13.76, .02);

      // ---- signal icon: pops in with an RGB-split glitch, bars die, slash draws ----
      const ik = spring(P(t, SIG, .8), 6, 1.6);
      icon.style.opacity = clamp(P(t, SIG, .05)) * (t >= SIG ? 1 : 0);
      const g = glitch(t, SIG, .3, 22);
      icon.style.transform = `translate(${g.dx.toFixed(1)}px,${g.dy.toFixed(1)}px) scale(${lerp(.55, 1, ik).toFixed(4)})`;
      xf(iconLayers.gR, { x: g.sp, o: g.a > 0 ? .85 : 0 });
      xf(iconLayers.gC, { x: -g.sp, o: g.a > 0 ? .85 : 0 });
      iconLayers.base.style.opacity = g.fl;
      iconLayers.bars.forEach((b, i) => b.setAttribute('fill', mixColor('#C9D2FF', '#4A5266', E(t, SIG + .08 + (3 - i) * .05, .3, easeOutCubic))));
      const sl = 102 * (1 - E(t, SIG + .08, .32, easeOutCubic));
      iconLayers.slashes.forEach(s => s.setAttribute('stroke-dashoffset', sl.toFixed(1)));
      const bord = .5 + .35 * pulse(t, SIG + .35, .25);
      icon.style.borderColor = `rgba(245,165,36,${bord.toFixed(3)})`;
    }
  });
})();
