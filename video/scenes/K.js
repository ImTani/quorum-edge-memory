/* Scene K: Proactive nudge (124–131 s).
 * 124.5 active-app timer "Game project · Unity" 2:58:41 ticks up (odometer digits) and lands on 3:00:00 at 126.5
 * 126.5 nudge notification springs in: Quorum mark, message (2nd sentence amber bold), claim ref, 2 buttons
 * 128.0 caption "A reminders app can't do this."
 */
(function () {
  const START = 124, END = 131, TICK = 124.5, NUDGE = 126.5;
  const V0 = 2 * 3600 + 58 * 60 + 41;            // 2:58:41
  const V1 = 3 * 3600;                           // 3:00:00 (lands exactly at NUDGE)
  const DH = 184;                                // digit cell height (px) for the 168px timer
  const ROLL = .38;                              // odometer roll length (in timer-seconds, ends on the integer)

  // timer value: 1x before TICK, accelerates through 79 s, 1x again after NUDGE (velocity-continuous)
  const timerV = t => t < TICK ? V0 + (t - TICK)
    : t < NUDGE ? V0 + (t - TICK) + (V1 - V0 - (NUDGE - TICK)) * easeInOutSine(P(t, TICK, NUDGE - TICK))
      : V1 + (t - NUDGE);

  const QMARK = (sz, glow = true) => `<svg width="${sz}" height="${sz}" viewBox="0 0 48 48" style="display:block">
    <defs><linearGradient id="kqg${sz}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9DA9FF"/><stop offset="1" stop-color="#5B63E6"/></linearGradient></defs>
    <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#kqg${sz})"/>
    <circle cx="23" cy="22" r="10.5" fill="none" stroke="#0A0E16" stroke-width="4.2"/>
    <circle cx="33.5" cy="33" r="4" fill="#0A0E16"/>
    <circle cx="16.5" cy="17.5" r="2" fill="#fff" opacity=".9"/><circle cx="27" cy="26" r="1.6" fill="#fff" opacity=".75"/>
    ${glow ? '' : ''}</svg>`;
  const CUBE = `<svg width="30" height="30" viewBox="0 0 24 24" style="display:block"><path d="M12 2.2 21 7.3v9.4L12 21.8 3 16.7V7.3z" fill="none" stroke="#E8ECF4" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 12 21 7.3M12 12 3 7.3M12 12v9.8" stroke="#E8ECF4" stroke-width="1.7"/></svg>`;

  let menu, clockEl, menuMark, editor, wrap, card, strips = [], chipRow, liveDot, sinceEl, barFill, barTick, flash, timerBox;
  let notif, nHead, nBody, nAmber, nRef, nBtns, nSheen, nRing, ping;

  function strip(parent, base) {
    const cell = el('span', { style: `display:inline-block;position:relative;width:.55em;height:${DH}px;overflow:hidden;vertical-align:top;` +
      `-webkit-mask-image:linear-gradient(transparent 0,#000 20%,#000 80%,transparent 100%)` }, parent);
    const inner = el('div', { style: 'position:absolute;left:0;top:0;width:100%;will-change:transform' }, cell);
    for (let i = 0; i <= base; i++) el('div', { text: String(i % base), style: `height:${DH}px;line-height:${DH}px;text-align:center` }, inner);
    return inner;
  }

  function buildEditor(root) {
    editor = el('div', { cls: 'card', style: 'left:110px;top:92px;width:1700px;height:800px;overflow:hidden;background:rgba(16,20,31,.96)' }, root);
    const bar = el('div', { style: 'height:48px;display:flex;align-items:center;padding:0 18px;gap:9px;border-bottom:1px solid rgba(124,140,255,.14);background:rgba(255,255,255,.025)' }, editor);
    for (const c of ['#FF5F57', '#FEBC2E', '#28C840']) el('span', { style: `width:13px;height:13px;border-radius:50%;background:${c};opacity:.8` }, bar);
    el('div', { style: 'flex:1;text-align:center;font-size:19px;color:#9AA4C0;font-weight:600', text: 'Game project  ·  Main.unity  ·  Unity 6' }, bar);
    // toolbar with play controls
    const tb = el('div', { style: 'height:44px;display:flex;align-items:center;justify-content:center;gap:10px;border-bottom:1px solid rgba(124,140,255,.1)' }, editor);
    const ICO = ['<path d="M8 5l8 5-8 5z"/>', '<path d="M6 5h3v10H6zM11 5h3v10h-3z"/>', '<path d="M5 5l7 5-7 5zM13 5h2.5v10H13z"/>'];
    for (const g of ICO) el('span', { style: 'width:44px;height:28px;border-radius:6px;background:rgba(124,140,255,.12);display:flex;align-items:center;justify-content:center', html: `<svg width="16" height="16" viewBox="0 0 20 20" fill="#9AA4C0">${g}</svg>` }, tb);
    // hierarchy
    const hier = el('div', { style: 'position:absolute;left:0;top:92px;width:300px;bottom:0;border-right:1px solid rgba(124,140,255,.1);padding:18px 20px' }, editor);
    el('div', { style: 'font-size:15px;letter-spacing:1.5px;color:#5B6478;font-weight:700;margin-bottom:14px', text: 'HIERARCHY' }, hier);
    const items = ['Main Camera', 'Directional Light', 'v Level_03', '   Terrain', '   Player', '   Enemy_Spawner', '   Checkpoints', 'v UI', '   HUD', '   PauseMenu', 'AudioManager', 'PostProcess'];
    items.forEach((s, i) => el('div', { style: `font-size:17px;line-height:34px;color:${i === 4 ? '#E8ECF4' : '#8A93A8'};white-space:pre;${i === 4 ? 'background:rgba(124,140,255,.16);border-radius:6px;margin:0 -8px;padding:0 8px' : ''}`,
      html: s.startsWith('v ') ? `<svg width="10" height="10" viewBox="0 0 10 10" style="margin:0 6px 1px 2px"><path d="M1 3h8L5 8z" fill="#8A93A8"/></svg>${s.slice(2)}` : esc(s) }, hier));
    // inspector
    const insp = el('div', { style: 'position:absolute;right:0;top:92px;width:340px;bottom:0;border-left:1px solid rgba(124,140,255,.1);padding:18px 22px' }, editor);
    el('div', { style: 'font-size:15px;letter-spacing:1.5px;color:#5B6478;font-weight:700;margin-bottom:14px', text: 'INSPECTOR' }, insp);
    const rows = [['Transform', ''], ['Position', '12.4  0.0  -3.1'], ['Rotation', '0  90  0'], ['Scale', '1  1  1'], ['Rigidbody', ''], ['Mass', '1.2'], ['Drag', '0.05'], ['PlayerController', ''], ['Speed', '6.5'], ['Jump', '11']];
    rows.forEach(([a, b]) => el('div', { style: `display:flex;justify-content:space-between;font-size:16px;line-height:33px;color:${b ? '#8A93A8' : '#C9D0E0'};font-weight:${b ? 400 : 600}`, html: `<span>${a}</span><span class="mono">${b}</span>` }, insp));
    // scene view: perspective grid + a few blocks (SVG)
    const sv = el('div', { style: 'position:absolute;left:301px;right:341px;top:92px;bottom:0;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,rgba(124,140,255,.08),transparent 70%)' }, editor);
    let g = '';
    const w = 1058, hh = 708, hy = 250;
    for (let i = -14; i <= 14; i++) g += `<line x1="${w / 2 + i * 22}" y1="${hy}" x2="${w / 2 + i * 150}" y2="${hh}" stroke="rgba(124,140,255,.16)" stroke-width="1"/>`;
    for (let j = 1; j < 12; j++) { const y = hy + (hh - hy) * Math.pow(j / 11, 2.1); g += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(124,140,255,.14)" stroke-width="1"/>`; }
    const box = (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s})"><path d="M0-40 40-20 0 0-40-20z" fill="${rgba(c, .45)}"/><path d="M-40-20 0 0v46l-40-20z" fill="${rgba(c, .28)}"/><path d="M40-20 0 0v46l40-20z" fill="${rgba(c, .18)}"/></g>`;
    g += box(420, 420, 1.6, '#9DA9FF') + box(610, 370, 1.1, '#7C8CFF') + box(700, 500, 1.9, '#B49CFF') + box(300, 540, 1.2, '#8FD3FF');
    g += `<path d="M150 ${hy} Q 330 180 520 ${hy - 20} T 900 ${hy}" fill="none" stroke="rgba(157,169,255,.18)" stroke-width="2"/>`;
    sv.innerHTML = `<svg width="${w}" height="${hh}" style="position:absolute;left:0;top:0">${g}</svg>`;
    el('div', { style: 'position:absolute;left:18px;top:14px;font-size:15px;letter-spacing:1.5px;color:#5B6478;font-weight:700', text: 'SCENE' }, sv);
  }

  Scene({
    id: 'K', start: START, end: END,
    fadeIn: .6, fadeOut: .5, drift: .025,
    captions: [[128.0, END - .1, "A reminders app can't do this."]],

    build(root) {
      buildEditor(root);

      // desktop menu bar
      menu = el('div', { style: 'position:absolute;left:0;top:0;width:1920px;height:46px;display:flex;align-items:center;padding:0 26px;gap:30px;background:rgba(12,16,26,.82);border-bottom:1px solid rgba(124,140,255,.12);font-size:19px;color:#9AA4C0' }, root);
      el('span', { style: 'font-weight:700;color:#E8ECF4', text: 'Unity' }, menu);
      for (const s of ['File', 'Edit', 'Assets', 'GameObject', 'Component', 'Window']) el('span', { text: s }, menu);
      el('span', { style: 'flex:1' }, menu);
      menuMark = el('span', { style: 'position:relative;display:flex;align-items:center', html: QMARK(26) }, menu);
      ping = el('span', { style: 'position:absolute;left:13px;top:13px;width:0;height:0;border-radius:50%;border:2px solid #9DA9FF' }, menuMark);
      clockEl = el('span', { style: 'color:#E8ECF4;font-weight:600;min-width:210px;text-align:right' }, menu);

      // focus timer card (moves left when the nudge lands)
      wrap = el('div', { cls: 'abs', style: 'left:0;top:0;width:1920px;height:1080px;transform-origin:0 0' }, root);
      card = el('div', { cls: 'card', style: 'left:510px;top:262px;width:900px;height:440px;padding:38px 48px;background:rgba(18,23,36,.94);border-color:rgba(124,140,255,.34);box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.3);transform-origin:50% 50%' }, wrap);
      const top = el('div', { style: 'display:flex;align-items:center;gap:16px' }, card);
      el('span', { style: 'font-size:18px;letter-spacing:2.6px;color:#5B6478;font-weight:700', text: 'ACTIVE APP' }, top);
      liveDot = el('span', { style: 'width:10px;height:10px;border-radius:50%;background:#7C8CFF;box-shadow:0 0 10px #7C8CFF' }, top);
      el('span', { style: 'flex:1' }, top);
      el('span', { style: 'font-size:18px;color:#5B6478', text: 'context · on-device' }, top);
      chipRow = el('div', { style: 'margin-top:18px;display:inline-flex;align-items:center;gap:14px;padding:10px 22px 10px 14px;border-radius:14px;background:rgba(124,140,255,.10);border:1px solid rgba(124,140,255,.32)' }, card);
      el('span', { style: 'width:44px;height:44px;border-radius:10px;background:#1B2133;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.12)', html: CUBE }, chipRow);
      el('span', { style: 'font-size:32px;font-weight:600;color:#E8ECF4', html: 'Game project <span style="color:#5B6478;margin:0 6px">·</span> <span style="color:#9AA4C0">Unity</span>' }, chipRow);

      timerBox = el('div', { cls: 'mono', style: `position:relative;margin-top:14px;font-size:168px;font-weight:700;color:#fff;height:${DH}px;line-height:${DH}px;white-space:nowrap;letter-spacing:-2px;text-shadow:0 0 30px rgba(124,140,255,.35)` }, card);
      const spec = [[3600, 10], ':', [600, 6], [60, 10], ':', [10, 6], [1, 10]];
      for (const s of spec) {
        if (s === ':') { el('span', { style: `display:inline-block;width:.45em;text-align:center;vertical-align:top;color:#4A5268;font-size:.78em;height:${DH}px;line-height:${DH - 10}px`, text: ':' }, timerBox); continue; }
        strips.push({ inner: strip(timerBox, s[1]), d: s[0], b: s[1] });
      }
      flash = el('div', { style: 'position:absolute;inset:-10px -20px;border-radius:18px;background:radial-gradient(ellipse at 50% 55%,rgba(157,169,255,.35),transparent 70%);opacity:0;pointer-events:none' }, timerBox);

      // session bar: 2 PM ... 3h threshold
      const barWrap = el('div', { style: 'position:relative;margin-top:22px;height:8px;border-radius:4px;background:rgba(124,140,255,.12)' }, card);
      barFill = el('div', { style: 'position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,rgba(124,140,255,.35),#9DA9FF)' }, barWrap);
      barTick = el('div', { style: 'position:absolute;left:85.7%;top:-8px;width:3px;height:24px;border-radius:2px;background:#E8ECF4' }, barWrap);
      sinceEl = el('div', { style: 'margin-top:14px;display:flex;justify-content:space-between;font-size:21px;color:#5B6478' }, card);
      sinceEl.innerHTML = '<span>since 2:00 PM</span><span style="margin-left:auto;margin-right:92px;color:#9AA4C0">3h</span>';

      // ---- nudge notification ----
      notif = el('div', { cls: 'card', style: 'left:1000px;top:300px;width:780px;padding:30px 36px 32px;background:rgba(22,28,44,.97);border-color:rgba(157,169,255,.5);box-shadow:0 40px 120px rgba(0,0,0,.75),0 0 60px rgba(124,140,255,.18);overflow:hidden' }, root);
      nSheen = el('div', { style: 'position:absolute;left:0;top:0;width:260px;height:100%;background:linear-gradient(100deg,transparent,rgba(200,210,255,.14),transparent);pointer-events:none' }, notif);
      nHead = el('div', { style: 'display:flex;align-items:center;gap:14px' }, notif);
      const mk = el('span', { style: 'position:relative', html: QMARK(46) }, nHead);
      nRing = el('span', { style: 'position:absolute;left:23px;top:23px;width:0;height:0;border-radius:50%;border:2px solid #9DA9FF' }, mk);
      el('span', { style: 'font-size:26px;font-weight:700;color:#E8ECF4', text: 'Quorum' }, nHead);
      el('span', { style: 'font-size:20px;color:#5B6478', text: '·  nudge' }, nHead);
      el('span', { style: 'flex:1' }, nHead);
      el('span', { style: 'font-size:20px;color:#5B6478', text: 'now' }, nHead);
      nBody = el('div', { style: 'margin-top:22px;font-size:33px;line-height:1.42;color:#E8ECF4;font-weight:500' }, notif);
      nBody.innerHTML = "You've been on the game project since 2. ";
      nAmber = el('span', { style: 'display:block;color:#F5A524;font-weight:700', text: 'The Sharma edit is due tomorrow at 10.' }, nBody);
      nRef = el('div', { cls: 'mono', style: 'margin-top:20px;display:flex;align-items:center;gap:12px;font-size:19px;color:#9AA4C0;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.25);border:1px solid rgba(124,140,255,.14)',
        html: '<span style="width:9px;height:9px;border-radius:50%;background:#22C55E;box-shadow:0 0 8px #22C55E"></span>task_sharma_edit · due 2026-10-16 10:00 · <span style="color:#22C55E">active</span>' }, notif);
      nBtns = [];
      const br = el('div', { style: 'margin-top:24px;display:flex;gap:14px' }, notif);
      nBtns.push(el('span', { cls: 'btn', style: 'font-size:24px;padding:13px 26px;box-shadow:0 8px 30px rgba(124,140,255,.35)', text: 'Open Sharma edit' }, br));
      nBtns.push(el('span', { style: 'display:inline-block;font-size:24px;font-weight:600;padding:12px 24px;border-radius:12px;border:1px solid rgba(154,164,192,.45);color:#C9D0E0', text: 'Snooze 30m' }, br));
    },

    render(t, lt, fade) {
      // ---- ambient cloud stays alive, dim behind the desktop ----
      cloud.set({ opacity: .2, spin: .03, nebula: .8 });
      cloud.setCamera({ target: [0, 0, 0], dist: 4.8, yaw: -.3, pitch: .34, orbit: .02 });

      // ---- desktop entrance ----
      show(menu, t, START + .05, .9, { dy: -30, ease: easeOutCubic });   // eases in with the crossfade, no pop at 124.0
      const nudgeK = E(t, NUDGE - .15, 1.0, easeInOutCubic);                   // focus shifts to the notification
      const edIn = E(t, START - .2, 1.0);
      xf(editor, { y: (1 - edIn) * 30, s: lerp(.97, 1, edIn), o: edIn * lerp(.5, .36, nudgeK), blur: lerp(1.2, 2.6, nudgeK) + (1 - edIn) * 6 });

      // ---- timer card ----
      const cIn = E(t, START + .15, .8);
      const cs = lerp(.94, 1, cIn) * lerp(1, .86, nudgeK);
      xf(card, { x: -440 * nudgeK, y: (1 - cIn) * 40 + 10 * nudgeK, s: cs, o: cIn, blur: (1 - cIn) * 8 });

      const v = timerV(t);
      const F = Math.floor(v), fr = v - F;
      const roll = easeInOutCubic(clamp((fr - (1 - ROLL)) / ROLL));
      const speed = t < TICK || t > NUDGE ? 1 : 1 + (V1 - V0 - (NUDGE - TICK)) * (Math.PI / 2) * Math.sin(Math.PI * P(t, TICK, NUDGE - TICK)) / (NUDGE - TICK);
      for (const s of strips) {
        const mb = Math.min(5, speed / s.d * .07);
        s.inner.style.filter = mb > .15 ? `blur(${mb.toFixed(2)}px)` : 'none';
        const base = Math.floor(F / s.d) % s.b;
        const pos = base + ((F % s.d) === s.d - 1 ? roll : 0);
        s.inner.style.transform = `translateY(${(-pos * DH).toFixed(2)}px)`;
      }
      const hit = pulse(t, NUDGE, .22);
      flash.style.opacity = hit;
      timerBox.style.color = mixColor('#FFFFFF', '#C9D2FF', hit);
      liveDot.style.opacity = .45 + .55 * (.5 + .5 * Math.sin(t * 5));
      const frac = clamp(v / 12600);                                         // bar spans 0..3.5h, tick at 3h
      barFill.style.width = (frac * 100).toFixed(3) + '%';
      barTick.style.boxShadow = `0 0 ${6 + 26 * hit}px ${rgba('#9DA9FF', .5 + .5 * hit)}`;
      barTick.style.transform = `scaleY(${1 + .5 * hit})`;

      // clock in the menu bar: 2:00 PM + elapsed
      const mins = Math.floor((14 * 3600 + v) / 60);
      const hh = Math.floor(mins / 60) % 12 || 12, mm = mins % 60;
      setText(clockEl, `Thu 15 Oct   ${hh}:${String(mm).padStart(2, '0')} PM`);

      // ---- nudge notification (spring from the right) ----
      const sp = spring(P(t, NUDGE, 1.1), 5.6, 1.9);
      const nIn = clamp(P(t, NUDGE, .25));
      xf(notif, { x: (1 - sp) * 860, s: lerp(.96, 1, clamp(sp)), o: nIn });
      nSheen.style.transform = `translateX(${lerp(-300, 1100, easeInOutCubic(P(t, NUDGE + .35, .9)))}px)`;
      nSheen.style.opacity = win(t, NUDGE + .3, NUDGE + 1.3, .2, .3);
      const ringK = P(t, NUDGE + .05, .9);
      css(nRing, { width: `${ringK * 110}px`, height: `${ringK * 110}px`, marginLeft: `${-ringK * 55}px`, marginTop: `${-ringK * 55}px`, opacity: (1 - ringK) * (ringK > 0 ? .9 : 0) });
      const pk = P(t, NUDGE - .05, .8);
      css(ping, { width: `${pk * 70}px`, height: `${pk * 70}px`, marginLeft: `${-pk * 35}px`, marginTop: `${-pk * 35}px`, opacity: (1 - pk) * (pk > 0 ? .9 : 0) });
      menuMark.style.filter = `drop-shadow(0 0 ${2 + 14 * pulse(t, NUDGE, .3)}px rgba(157,169,255,.9))`;

      show(nHead, t, NUDGE + .1, .6, { dx: 40, dy: 0 });
      show(nBody, t, NUDGE + .22, .7, { dx: 50, dy: 0, blur: 6 });
      const ak = E(t, NUDGE + .75, .6, easeOutCubic);
      nAmber.style.textShadow = `0 0 ${18 * ak * (1 - .6 * P(t, NUDGE + 1.4, 1.2))}px rgba(245,165,36,${.75 * ak})`;
      show(nRef, t, NUDGE + .5, .6, { dy: 14 });
      staggerIn(nBtns, t, NUDGE + .65, .1, { d: .6, dy: 16, scale: .92 });
      // gentle attention on the primary action
      nBtns[0].style.boxShadow = `0 8px 30px rgba(124,140,255,${.3 + .25 * (.5 + .5 * Math.sin((t - NUDGE) * 3.2)) * P(t, NUDGE + 1.4, .6)})`;
    }
  });
})();
