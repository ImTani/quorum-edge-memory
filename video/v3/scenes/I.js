/* Scene I: No guessing / resolution (100–114 s).
 * 100.5 assistant panel: "Disputed..." + two source chips (client email · 16th / Tanishk on set · 18th)
 * 103.5 suggestion "Should I ask the client?" (hover 104.0, press 104.3)
 * 105.0 draft types into a compose card addressed to client:sharma
 * 107.5 "Send?" -> Yes pressed (scale-down + ripple)
 * 108.5 "Resolved on both laptops", both laptop pills tick green; the red pair separates in the cloud
 * 109.5 claim rows: 2026-10-16 active, 2026-10-18 struck through "superseded · kept for history"
 * 110.0 caption
 */
(function () {
  const START = 100, END = 114;
  const T = {
    panel: 100.0, msg: 100.5, chips: 101.3, neq: 101.75, links: 101.7,
    sugg: 103.5, cursorIn: 103.7, hover: 104.0, pick: 104.3,
    compose: 104.6, type: 105.0, send: 107.0, yes: 107.5,
    resolved: 108.5, sep: 108.5, rows: 109.5, strike: 109.75, superseded: 110.05,
  };
  const PX = 96, PY = 60, PW = 968, PH = 846, HEAD = 88, VH = PH - HEAD;
  const DRAFT = 'Hi! Quick check on the Sharma delivery: is it the 16th or the 18th?';

  // ---- glyphs (inline SVG, stroke = currentColor) ----
  const svg = (w, body, sw = 1.8) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${body}</svg>`;
  const G_MAIL = w => svg(w, '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M4 7.2l8 5.8 8-5.8"/>');
  const G_NOTE = w => svg(w, '<path d="M6.2 3.5h8.6l4 4v12.3a.7.7 0 0 1-.7.7H6.2a.7.7 0 0 1-.7-.7V4.2a.7.7 0 0 1 .7-.7z"/><path d="M14.6 3.6v4.1h4.1"/><path d="M8.6 12h6.8M8.6 15.2h6.8M8.6 18.2h3.8"/>');
  const G_LAP = w => svg(w, '<rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2.5 18.8h19"/>');
  const G_SPARK = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" style="flex:none;display:block"><path fill="currentColor" d="M12 2.5l2 6.1 6.1 2-6.1 2-2 6.1-2-6.1-6.1-2 6.1-2z"/><path fill="currentColor" opacity=".7" d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>`;
  const G_SEND = w => svg(w, '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>');
  const AVATAR = (sz) => `<div style="width:${sz}px;height:${sz}px;border-radius:${sz * .3}px;flex:none;background:linear-gradient(140deg,#9AA6FF 0%,#6B78F2 55%,#4F5BD6 100%);box-shadow:0 0 22px rgba(124,140,255,.45),inset 0 1px 0 rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center">
    <svg width="${sz * .66}" height="${sz * .66}" viewBox="0 0 24 24" fill="none"><circle cx="11.3" cy="11.3" r="7.6" stroke="#fff" stroke-width="2.3"/><path d="M16.4 16.4l4.3 4.3" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="11.3" cy="8.4" r="1.55" fill="#fff"/><circle cx="8.8" cy="12.7" r="1.55" fill="#fff"/><circle cx="13.8" cy="12.7" r="1.55" fill="#fff"/></svg></div>`;

  const CSS = `
  .qi-card{position:absolute;background:rgba(18,23,36,.94);border:1px solid rgba(124,140,255,.28);border-radius:22px;box-shadow:0 40px 110px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.25);overflow:hidden}
  .qi-head{position:absolute;left:0;right:0;top:0;height:${HEAD}px;display:flex;align-items:center;gap:16px;padding:0 28px;border-bottom:1px solid rgba(124,140,255,.14);background:linear-gradient(180deg,rgba(124,140,255,.07),rgba(124,140,255,0))}
  .qi-vp{position:absolute;left:0;right:0;top:${HEAD}px;height:${VH}px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent 0,rgba(0,0,0,.35) 26px,#000 60px,#000 calc(100% - 20px),transparent 100%)}
  .qi-content{position:absolute;left:0;right:0;top:0;padding:26px 30px 30px}
  .qi-row{display:flex;gap:14px;align-items:flex-start;margin-bottom:22px}
  .qi-bub{background:rgba(124,140,255,.075);border:1px solid rgba(124,140,255,.2);border-radius:6px 20px 20px 20px;padding:18px 22px 20px}
  .qi-txt{font-size:28px;line-height:1.38;color:#E8ECF4;font-weight:450}
  .qi-src{display:flex;align-items:center;gap:12px;padding:10px 18px 10px 12px;border-radius:14px;border:1px solid;font-size:23px;font-weight:600;white-space:nowrap}
  .qi-gl{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none}
  .qi-sug{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:10px;padding:13px 22px;border-radius:999px;font-size:24px;font-weight:600;border:1.5px solid;white-space:nowrap}
  .qi-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:9px;padding:11px 30px;border-radius:12px;font-size:24px;font-weight:700;white-space:nowrap}
  .qi-rip{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(255,255,255,.75);pointer-events:none}
  .qi-mono{font-family:Consolas,"Cascadia Mono",monospace}
  .qi-pill{display:inline-flex;align-items:center;gap:9px;padding:7px 14px 7px 12px;border-radius:999px;border:1px solid;font-size:21px;font-weight:600;white-space:nowrap}
  .qi-tick{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}
  .qi-claim{display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);margin-top:10px}
  `;

  // ---- refs ----
  let wrap, card, vp, content, headBadge, msg16, gl16;
  let msgRow, msgTag, msgWords = [], chipMail, chipNote, neq;
  let sugRow, sug1, sug2, sugRip;
  let comp, compHead, draft, sendRow, sendLbl, yesBtn, yesTxt, yesRip, editBtn, sentTag;
  let res, resCheck, resCheckPath, resTitle, resReply, pillA, pillB, tickA, tickB, claims, claimHead, rowA, rowB, dateB, strikeB, chipA, chipB, srcB, dotB;
  let cursor;
  const M = {}; // measured layout (layout never depends on t, so caching is deterministic)

  const relPos = (e, anc) => { let x = 0, y = 0; while (e && e !== anc) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return { x, y }; };

  // ---- cloud geometry ----
  const K18 = cloud.KEYS.note18, K16 = cloud.KEYS.email16;
  const MID = lerp3(K18, K16, .5);
  const DIR = [K16[0] - K18[0], K16[1] - K18[1], K16[2] - K18[2]]; const DL = Math.hypot(...DIR);
  const GAP = .3;
  const PULL18 = MID.map((m, i) => m - DIR[i] / DL * GAP / 2), PULL16 = MID.map((m, i) => m + DIR[i] / DL * GAP / 2);
  const SEP18 = lerp3(PULL18, K18, .56), SEP16 = lerp3(PULL16, K16, .56);
  const SPIN = .035;
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };

  function measure() {
    if (M.ok || !content.offsetHeight) return;
    const b = e => relPos(e, content).y + e.offsetHeight;
    M.msg = b(msgRow); M.sug = b(sugRow); M.comp = b(comp); M.resTop = b(pillA.parentElement.parentElement); M.res = b(res);
    M.ok = true;
  }
  // scroll offset of the chat content (pure function of t)
  // eased content bottom: the card grows to fit its content, then the content scrolls
  function bottomAt(t) {
    const stops = [[T.sugg, M.sug], [T.compose, M.comp], [T.resolved, M.resTop], [T.rows - .05, M.res]];
    let b = M.msg;
    let prev = M.msg;
    for (const [ts, bottom] of stops) { b += (bottom - prev) * E(t, ts - .1, .75, easeInOutCubic); prev = bottom; }
    return b + 26;
  }
  function scrollAt(t) { return Math.max(0, bottomAt(t) - VH); }
  function cardH(t) { return HEAD + Math.min(VH, bottomAt(t)); }
  // centre of element `e` in wrap coordinates at time t
  function centreIn(e, t) {
    const p = relPos(e, content);
    return { x: p.x + e.offsetWidth / 2, y: HEAD + p.y - scrollAt(t) + e.offsetHeight / 2 };
  }
  // press curve: 0 -> 1 (down) at tp, springs back with a small overshoot
  const press = (t, tp) => t < tp ? easeOutCubic(P(t, tp - .1, .1)) : 1 - easeOutBack(P(t, tp, .42), 2.2);

  Scene({
    id: 'I', start: START, end: END,
    drift: .03,
    captions: [[110.0, 113.8, 'It asks instead of guessing, and sends only on yes.']],

    build(root) {
      el('style', { text: CSS }, root);
      wrap = el('div', { cls: 'abs', style: `left:${PX}px;top:${PY}px;width:${PW}px;height:${PH}px` }, root);
      card = el('div', { cls: 'qi-card', style: `left:0;top:0;width:${PW}px;height:${PH}px` }, wrap);

      // header
      const head = el('div', { cls: 'qi-head' }, card);
      h(AVATAR(50), head);
      h(`<div style="flex:1;min-width:0"><div style="font-size:27px;font-weight:700;color:#fff;letter-spacing:.2px">Quorum</div>
         <div style="font-size:19px;color:#9AA4C0;margin-top:1px">assistant · running on this laptop</div></div>`, head);
      headBadge = h(`<div class="qi-pill" style="color:#EF4444;border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.12)"><span style="width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor"></span><span>1 disputed</span></div>`, head);

      vp = el('div', { cls: 'qi-vp' }, card);
      content = el('div', { cls: 'qi-content' }, vp);

      // 1) assistant message
      msgRow = el('div', { cls: 'qi-row' }, content);
      h(`<div style="margin-top:2px">${AVATAR(40)}</div>`, msgRow);
      const bub = el('div', { cls: 'qi-bub', style: 'flex:1' }, msgRow);
      msgTag = h(`<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <span class="qi-pill" style="color:#EF4444;border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.12);font-size:19px;padding:4px 13px;letter-spacing:.6px">DISPUTED</span>
          <span class="qi-mono" style="font-size:20px;color:#9AA4C0">task_sharma_edit · due_date</span></div>`, bub);
      const txt = el('div', { cls: 'qi-txt', html: "The client's email says the <b class='qi16' style='color:#C9D2FF'>16th</b>; you said the <b style='color:#F5A524'>18th</b> on set.<br>Want to settle it?" }, bub);
      // split into word spans, keeping the coloured <b> words intact
      msgWords = [];
      for (const node of Array.from(txt.childNodes)) {
        const frag = document.createDocumentFragment();
        if (node.nodeName === 'BR') { frag.appendChild(document.createElement('br')); }
        else if (node.nodeType === 1) { const s = el('span', { html: node.outerHTML, style: 'display:inline-block' }); frag.appendChild(s); msgWords.push(s); }
        else node.textContent.split(/(\s+)/).forEach(w => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
          const s = el('span', { text: w, style: 'display:inline-block' }); frag.appendChild(s); msgWords.push(s);
        });
        txt.replaceChild(frag, node);
      }
      const chips = el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:16px' }, bub);
      chipMail = h(`<div class="qi-src" style="color:#22C55E;border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.09)">
          <div class="qi-gl" style="background:rgba(34,197,94,.16)">${G_MAIL(26)}</div><div>client email · 16th</div></div>`, chips);
      msg16 = txt.querySelector('.qi16'); gl16 = chipMail.querySelector('.qi-gl');
      neq = h(`<div style="width:28px;height:28px;filter:drop-shadow(0 0 6px rgba(239,68,68,.8))"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.6" stroke-linecap="round"><path d="M4.5 9.2h15M4.5 14.8h15M15.5 4L8.5 20"/></svg></div>`, chips);
      chipNote = h(`<div class="qi-src" style="color:#F5A524;border-color:rgba(245,165,36,.45);background:rgba(245,165,36,.09)">
          <div class="qi-gl" style="background:rgba(245,165,36,.16)">${G_NOTE(26)}</div><div>Tanishk on set · 18th</div></div>`, chips);

      // 2) suggestions
      sugRow = el('div', { style: 'display:flex;gap:14px;margin:0 0 24px 54px' }, content);
      sug1 = h(`<div class="qi-sug" style="color:#C9D0FF">${G_SPARK(22)}<span>Should I ask the client?</span></div>`, sugRow);
      sugRip = el('div', { cls: 'qi-rip' }, sug1);
      sug2 = h(`<div class="qi-sug" style="color:#9AA4C0;border-color:rgba(154,164,192,.3);background:rgba(255,255,255,.02)"><span>Keep both for now</span></div>`, sugRow);

      // 3) compose card
      comp = el('div', { style: 'margin:0 0 24px 54px;border-radius:18px;border:1px solid rgba(124,140,255,.34);background:rgba(10,14,24,.7);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);overflow:hidden' }, content);
      compHead = h(`<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(124,140,255,.14);background:rgba(124,140,255,.05)">
          <span style="font-size:19px;font-weight:700;color:#9AA4C0;letter-spacing:1.2px">DRAFT</span>
          <span style="font-size:21px;color:#5B6478;margin-left:6px">To</span>
          <span class="qi-pill qi-mono" style="color:#C9D0FF;border-color:rgba(124,140,255,.45);background:rgba(124,140,255,.12);font-size:20px;padding:4px 14px 4px 10px">${G_MAIL(20)}<span>client:sharma</span></span>
          <span style="flex:1"></span></div>`, comp);
      sentTag = h(`<span class="qi-pill" style="color:#22C55E;border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.12);font-size:19px;padding:4px 13px">${svg(16, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3)}<span>Sent</span></span>`, compHead);
      draft = el('div', { style: 'padding:16px 22px 6px;font-size:27px;line-height:1.4;color:#E8ECF4;min-height:98px' }, comp);
      sendRow = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:6px 20px 16px' }, comp);
      sendLbl = el('div', { style: 'flex:1;font-size:25px;font-weight:600;color:#C9D0FF', text: 'Send?' }, sendRow);
      editBtn = h(`<div class="qi-btn" style="color:#9AA4C0;border:1px solid rgba(154,164,192,.3);background:rgba(255,255,255,.03);padding:11px 24px">Edit</div>`, sendRow);
      yesBtn = el('div', { cls: 'qi-btn', style: 'color:#0A0E16;background:#7C8CFF;box-shadow:0 8px 26px rgba(124,140,255,.35)' }, sendRow);
      yesTxt = el('div', { style: 'display:flex;align-items:center;gap:9px', html: `${G_SEND(20)}<span>Yes, send</span>` }, yesBtn);
      yesRip = el('div', { cls: 'qi-rip' }, yesBtn);

      // 4) resolution card with claim rows
      res = el('div', { style: 'margin:0 0 0 54px;border-radius:18px;border:1px solid rgba(34,197,94,.38);background:linear-gradient(180deg,rgba(34,197,94,.09),rgba(34,197,94,.03));padding:18px 22px 20px' }, content);
      resReply = h(`<div style="display:flex;align-items:center;gap:10px;font-size:21px;color:#9AA4C0;margin-bottom:12px">
          <span style="color:#22C55E">${G_MAIL(20)}</span><span><span class="qi-mono" style="color:#C9D0E0">client:sharma</span> replied: <span style="color:#E8ECF4">“The 16th. Confirmed.”</span></span><span style="flex:1"></span>
          <span class="qi-pill" style="color:#9AA4C0;border-color:rgba(154,164,192,.3);background:rgba(154,164,192,.08);font-size:18px;padding:3px 12px 3px 9px">${svg(16, '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 2.2)}<span>12 min later</span></span></div>`, res);
      const rhead = el('div', { style: 'display:flex;align-items:center;gap:14px' }, res);
      resCheck = h(`<div style="width:40px;height:40px;border-radius:50%;background:#22C55E;display:flex;align-items:center;justify-content:center;box-shadow:0 0 22px rgba(34,197,94,.55);flex:none">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0A0E16" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" stroke-dasharray="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`, rhead);
      resCheckPath = resCheck.querySelector('path');
      resTitle = el('div', { style: 'flex:1;font-size:29px;font-weight:700;color:#E8ECF4;white-space:nowrap', text: 'Resolved on both laptops' }, rhead);
      const pills = el('div', { style: 'display:flex;gap:10px' }, rhead);
      const mkPill = (name) => {
        const p = h(`<div class="qi-pill" style="padding:6px 8px 6px 12px">${G_LAP(22)}<span>${name}</span><div class="qi-tick">${svg(15, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3.4)}</div></div>`, pills);
        return [p, p.querySelector('.qi-tick')];
      };
      [pillA, tickA] = mkPill('Tanishk'); [pillB, tickB] = mkPill('Lakshya');

      claims = el('div', { style: 'margin-top:16px;padding-top:14px;border-top:1px solid rgba(34,197,94,.18)' }, res);
      claimHead = el('div', { cls: 'qi-mono', style: 'font-size:19px;color:#5B6478;letter-spacing:.4px', text: 'claims · task_sharma_edit.due_date' }, claims);
      rowA = h(`<div class="qi-claim"><span style="width:12px;height:12px;border-radius:50%;background:#22C55E;box-shadow:0 0 10px #22C55E;flex:none"></span>
          <span class="qi-mono" style="font-size:27px;color:#E8ECF4;font-weight:600">2026-10-16</span></div>`, claims);
      chipA = h(`<span class="qi-pill" style="color:#22C55E;border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.13);font-size:20px;padding:3px 14px">active</span>`, rowA);
      el('span', { style: 'flex:1' }, rowA);
      h(`<span style="display:flex;align-items:center;gap:8px;font-size:20px;color:#9AA4C0">${G_MAIL(18)}client email</span>`, rowA);
      rowB = el('div', { cls: 'qi-claim' }, claims);
      dotB = el('span', { style: 'width:12px;height:12px;border-radius:50%;flex:none' }, rowB);
      dateB = el('span', { cls: 'qi-mono', style: 'position:relative;font-size:27px;font-weight:600', text: '2026-10-18' }, rowB);
      strikeB = el('span', { style: 'position:absolute;left:-4px;right:-4px;top:52%;height:2.5px;background:#9AA4C0;transform-origin:0 50%;border-radius:2px' }, dateB);
      chipB = h(`<span class="qi-pill" style="color:#9AA4C0;border-color:rgba(154,164,192,.4);background:rgba(154,164,192,.1);font-size:20px;padding:3px 14px">superseded · kept for history</span>`, rowB);
      el('span', { style: 'flex:1' }, rowB);
      srcB = h(`<span style="display:flex;align-items:center;gap:8px;font-size:20px;color:#5B6478">${G_NOTE(18)}Tanishk on set</span>`, rowB);

      // cursor (outside the card so it can overhang)
      cursor = h(`<div class="abs" style="left:0;top:0;width:34px;height:40px;z-index:5;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))">
        <svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2.5L3 31l7.6-6.9 5.2 11.7 5.3-2.3-5.1-11.4 10.3-.4z" fill="#fff" stroke="#0A0E16" stroke-width="2" stroke-linejoin="round"/></svg></div>`, wrap);
    },

    render(t, lt, fade) {
      measure();

      // ---- panel entrance ----
      const pk = E(t, T.panel, .9);
      xf(wrap, { x: -70 * (1 - pk), y: 0, o: Math.min(1, pk * 1.3), persp: 2200, ry: 7 * (1 - pk) });
      badge(t);

      // scroll
      const sc = M.ok ? scrollAt(t) : 0, ch = M.ok ? cardH(t) : PH;
      content.style.transform = `translateY(${-sc}px)`;
      card.style.height = ch + 'px'; vp.style.height = (ch - HEAD) + 'px';

      // ---- 1) assistant message ----
      show(msgRow, t, T.msg, .7, { dy: 26, blur: 6 });
      if (M.ok) msgRow.style.opacity = +msgRow.style.opacity * clamp(invLerp(60, 175, M.msg - sc));
      show(msgTag, t, T.msg + .15, .5, { dx: -14, dy: 0 });
      staggerIn(msgWords, t, T.msg + .25, .045, { d: .45, dy: 10, blur: 4 });
      show(chipMail, t, T.chips, .6, { dy: 16, scale: .9 });
      show(chipNote, t, T.chips + .12, .6, { dy: 16, scale: .9 });
      const nq = pop(neq, t, T.neq, .6, .3);
      neq.style.opacity = clamp(nq) * (.85 + .15 * Math.sin(t * 7));
      // chip glow while the links to the cloud are up
      const linkA = win(t, T.links, 103.4, .4, .6);
      const win16 = E(t, T.resolved, .6, easeOutCubic);
      const c16 = mixColor('#C9D2FF', COL.green, win16), c16b = mixColor(COL.indigo, COL.green, win16);
      chipMail.style.color = c16; chipMail.style.borderColor = rgba(c16b, .45); chipMail.style.background = rgba(c16b, .1);
      gl16.style.background = rgba(c16b, .18); msg16.style.color = c16;
      chipMail.style.boxShadow = `0 0 ${26 * linkA + 30 * pulse(t, T.resolved + .2, .3)}px ${rgba(c16b, .45 * Math.max(linkA, pulse(t, T.resolved + .2, .3)))}`;
      chipNote.style.boxShadow = `0 0 ${26 * linkA}px ${rgba(COL.amber, .45 * linkA)}`;

      // ---- 2) suggestion button: pop, hover, press, selected ----
      pop(sug1, t, T.sugg, .7, .7);
      const s2 = pop(sug2, t, T.sugg + .1, .7, .7);
      const hov = E(t, T.hover, .25, easeOutCubic);
      const sel = E(t, T.pick + .05, .3, easeOutCubic);
      const pr1 = press(t, T.pick);
      const base1 = spring(P(t, T.sugg, .7));
      sug1.style.transform = `scale(${lerp(.7, 1, base1) * (1 + .03 * hov * (1 - sel)) * (1 - .07 * pr1)})`;
      sug1.style.borderColor = rgba(COL.indigo, lerp(.55, 1, Math.max(hov, sel)));
      sug1.style.background = `linear-gradient(180deg,${rgba(COL.indigo, lerp(.1, .22, hov) + .28 * sel)},${rgba(COL.indigo, lerp(.06, .14, hov) + .22 * sel)})`;
      sug1.style.color = mixColor('#C9D0FF', '#FFFFFF', Math.max(hov, sel));
      sug1.style.boxShadow = `0 0 ${30 * Math.max(hov, sel * .7)}px ${rgba(COL.indigo, .45 * Math.max(hov, sel * .7))}`;
      ripple(sugRip, t, T.pick, sug1.offsetWidth * .5 - 20, sug1.offsetHeight * .5 + 4, 22);
      sug2.style.opacity = clamp(s2) * lerp(1, .32, sel);

      // ---- 3) compose card ----
      show(comp, t, T.compose, .7, { dy: 30, blur: 6 });
      comp.style.borderColor = rgba(COL.indigo, .34 + .3 * win(t, T.type, 107.2, .3, .5));
      typeText(draft, DRAFT, t, T.type, 33, { hold: .2 });
      show(sendLbl, t, T.send, .5, { dx: -12, dy: 0 });
      pop(editBtn, t, T.send + .08, .6, .75);
      const yb = spring(P(t, T.send + .14, .6));
      const pry = press(t, T.yes);
      const sent = E(t, T.yes + .2, .35, easeOutCubic);
      yesBtn.style.opacity = clamp(P(t, T.send + .14, .2));
      yesBtn.style.transform = `scale(${lerp(.75, 1, yb) * (1 - .1 * pry) * (1 + .04 * E(t, T.yes - .35, .2) * (1 - sent))})`;
      yesBtn.style.background = mixColor(COL.indigo, COL.green, sent);
      yesBtn.style.boxShadow = `0 8px 26px ${rgba(mixColor(COL.indigo, COL.green, sent), .35 + .4 * pulse(t, T.yes + .05, .25))}`;
      setHTML(yesTxt, t < T.yes + .2 ? `${G_SEND(20)}<span>Yes, send</span>` : `${svg(20, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3)}<span>Sent</span>`);
      ripple(yesRip, t, T.yes, yesBtn.offsetWidth * .45, yesBtn.offsetHeight * .55, 16);
      editBtn.style.opacity = clamp(+editBtn.style.opacity * lerp(1, .3, sent));
      sendLbl.style.opacity = clamp(+sendLbl.style.opacity * lerp(1, .35, sent));
      pop(sentTag, t, T.yes + .25, .6, .5);

      // ---- 4) resolution ----
      show(res, t, T.resolved, .7, { dy: 30, blur: 6 });
      const ck = pop(resCheck, t, T.resolved + .05, .7, .3);
      resCheckPath.style.strokeDashoffset = 1 - E(t, T.resolved + .15, .4, easeOutCubic);
      resCheck.style.boxShadow = `0 0 ${22 + 30 * pulse(t, T.resolved + .3, .3)}px rgba(34,197,94,${.55 * clamp(ck)})`;
      show(resTitle, t, T.resolved + .1, .6, { dx: -16, dy: 0 });
      show(resReply, t, T.resolved + .05, .5, { dy: 10 });
      tickPill(pillA, tickA, t, T.resolved + .3);
      tickPill(pillB, tickB, t, T.resolved + .48);

      // claim rows
      show(claimHead, t, T.rows, .5, { dy: 10 });
      show(rowA, t, T.rows + .05, .6, { dx: -24, dy: 0 });
      show(rowB, t, T.rows + .15, .6, { dx: -24, dy: 0 });
      pop(chipA, t, T.rows + .3, .6, .6);
      rowA.style.background = rgba(COL.green, .04 + .1 * pulse(t, T.rows + .4, .35));
      const g = E(t, T.strike, .5, easeInOutCubic);
      const colB = mixColor(COL.amber, COL.grey, g);
      dateB.style.color = mixColor(colB, '#6B7488', g);
      dotB.style.background = colB; dotB.style.boxShadow = `0 0 ${10 * (1 - g)}px ${colB}`;
      strikeB.style.transform = `scaleX(${E(t, T.strike, .45, easeInOutCubic)})`;
      strikeB.style.opacity = P(t, T.strike, .05);
      pop(chipB, t, T.superseded, .65, .6);
      srcB.style.opacity = lerp(1, .7, g);
      rowB.style.opacity = clamp(+rowB.style.opacity * lerp(1, .8, g));

      // ---- cursor ----
      if (M.ok) {
        const a = centreIn(sug1, t), b = centreIn(yesBtn, t);
        const p0 = { x: PW + 60, y: cardH(T.cursorIn) - 40 }, rest = { x: PW - 150, y: cardH(t) - 150 };
        let p;
        if (t < T.pick + .3) { const k = E(t, T.cursorIn, .5, easeInOutCubic); p = { x: lerp(p0.x, a.x + 40, k), y: lerp(p0.y, a.y + 6, k) }; }
        else if (t < 106.8) { const k = E(t, T.pick + .3, .9, easeInOutCubic); p = { x: lerp(a.x + 40, rest.x, k), y: lerp(a.y + 6, rest.y, k) }; }
        else { const k = E(t, 106.8, .55, easeInOutCubic); p = { x: lerp(rest.x, b.x - 8, k), y: lerp(rest.y, b.y + 4, k) }; }
        const cp = Math.max(press(t, T.pick), press(t, T.yes));
        xf(cursor, { x: p.x - 4, y: p.y - 3, s: 1 - .16 * cp, o: win(t, T.cursorIn, T.yes + .75, .25, .35) });
      }

      // ---- cloud: the disputed pair separates on resolution ----
      cloudPart(t, fade);
    }
  });

  function badge(t) {
    // header badge: "1 disputed" (red) -> "0 disputed · resolved" (green)
    const r = t >= T.resolved + .2;
    const key = r ? 'r' : 'd';
    if (headBadge.__k !== key) {
      headBadge.__k = key;
      const c = r ? COL.green : COL.red;
      headBadge.style.color = c; headBadge.style.borderColor = rgba(c, .5); headBadge.style.background = rgba(c, .12);
      headBadge.lastElementChild.textContent = r ? 'all settled' : '1 disputed';
    }
    const k = pulse(t, T.resolved + .2, .18);
    headBadge.style.transform = `scale(${1 + .15 * k})`;
    headBadge.style.opacity = E(t, T.panel + .4, .5);
  }

  function ripple(rip, t, tp, x, y, scaleTo) {
    const k = P(t, tp, .55);
    rip.style.left = x + 'px'; rip.style.top = y + 'px';
    rip.style.transform = `scale(${lerp(.2, scaleTo, easeOutCubic(k))})`;
    rip.style.opacity = t < tp ? 0 : .55 * (1 - k);
  }

  function tickPill(pill, tick, t, tp) {
    const k = E(t, tp, .35, easeOutCubic);
    const c = mixColor('#9AA4C0', COL.green, k);
    pill.style.color = c; pill.style.borderColor = rgba(c, .3 + .25 * k); pill.style.background = rgba(c, .06 + .06 * k);
    const pk = spring(P(t, tp, .6));
    tick.style.background = rgba(COL.green, k); tick.style.color = '#0A0E16';
    tick.style.transform = `scale(${lerp(.2, 1, pk)})`; tick.style.opacity = P(t, tp, .12);
    pill.style.transform = `scale(${1 + .12 * pulse(t, tp + .1, .14)})`;
    pill.style.boxShadow = `0 0 ${20 * pulse(t, tp + .12, .25)}px ${rgba(COL.green, .6)}`;
  }

  function cloudPart(t, fade) {
    const sepK = E(t, T.sep, 1.1, easeInOutCubic);
    const colK = E(t, T.sep + .1, .5, easeOutCubic);
    const pos16 = lerp3(PULL16, SEP16, sepK), pos18 = lerp3(PULL18, SEP18, sepK);

    // camera co-rotates with the cloud spin so the pair keeps its screen orientation; slow extra drift for parallax
    const ang = t * SPIN;
    const d = rotY(DIR, ang);
    const yaw = Math.atan2(d[2], -d[0]) + .32 + Math.PI + (t - START) * .012;
    const tgt = rotY(lerp3(MID, [MID[0], MID[1] - .02, MID[2]], 1), ang);
    const dist = keyframes(t, [[START - .3, 2.7], [T.sep, 3.0], [T.sep + 1.6, 3.45], [END + .3, 3.6]], easeInOutCubic);
    cloud.set({ opacity: .78, spin: SPIN, rect: { x: 1060, y: 20, w: 860, h: 1000 }, dof: .7, keyAlpha: 1 - E(t, END - .5, .5, easeInOutCubic) });
    cloud.setCamera({ target: tgt, dist, yaw, pitch: .3, orbit: 0, fov: 46 });

    const k16 = cloud.addKeyPoint('email16', {
      pos: pos16, color: mixColor(COL.red, COL.green, colK), size: 2.8 + .6 * colK,
      label: colK < .5 ? '16th · client email' : '16th · active', sub: colK < .5 ? 'disputed' : 'client email · kept',
      labelSide: 'right', labelDx: 10, labelDy: lerp(-10, -40, sepK),
      pulse: .22 * (1 - colK) + .08 * colK, pulseRate: colK < .5 ? 2.4 : 1.1,
    });
    const k18 = cloud.addKeyPoint('note18', {
      pos: pos18, color: mixColor(COL.red, COL.grey, colK), size: 2.8 - .5 * colK, alpha: lerp(1, .55, colK),
      label: colK < .5 ? '18th · Tanishk on set' : '18th · superseded', sub: colK < .5 ? 'disputed' : 'kept for history',
      labelSide: colK < .5 ? 'left' : 'right', labelDx: 10, labelDy: colK < .5 ? 100 : -70,
      pulse: .22 * (1 - colK), pulseRate: 2.4,
    });
    k18.labelAlpha = lerp(1, 1.5, colK);
    // the "resolved" confirmation ripples out from the winning claim
    cloud.pulseWave(T.sep + .25, COL.green, { origin: SEP16, speed: 1.5, width: .28, boost: 1.3 });
    if (t >= T.sep + .1) cloud.tint(cloud.nearest(K16, 16), COL.green, .55 * colK, .4 * colK);

    // custom overlay: the tether between the disputed pair, links to the chips/rows, resolve burst
    const chipYs = M.ok ? [centreIn(chipMail, t).y, centreIn(chipNote, t).y] : [0, 0];
    const rowYs = M.ok ? [centreIn(rowA, t).y, centreIn(rowB, t).y] : [0, 0];
    cloud.draw2D((ctx, t2, f) => {
      const A = cloud.screenOf('email16'), B = cloud.screenOf('note18');
      if (!A || !B || !A.vis || !B.vis) return;
      const s = 1 + .03 * clamp((t2 - START) / (END - START), -.1, 1.1); // root drift zoom
      const toScreen = (x, y) => [960 + (x - 960) * s, 540 + (y - 540) * s];
      ctx.globalCompositeOperation = 'lighter';
      // tether: red beam while disputed, snaps at separation
      const tether = f * (1 - E(t2, T.sep, .25, easeOutCubic));
      if (tether > .01) {
        glowLine(ctx, A.x, A.y, B.x, B.y, COL.red, tether * (.55 + .2 * Math.sin(t2 * 9)), 2.2);
        for (let j = 0; j < 3; j++) { const u = ((t2 - START) * .8 + j / 3) % 1; drawGlow(ctx, lerp(A.x, B.x, u), lerp(A.y, B.y, u), 8, '#ffffff', tether * .45 * Math.sin(u * Math.PI)); }
      }
      // snap sparks at separation
      const sp = P(t2, T.sep, .7);
      if (sp > 0 && sp < 1) {
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        for (let j = 0; j < 14; j++) {
          const an = rand(j, 71) * 6.283, v = 60 + 140 * rand(j, 72);
          drawGlow(ctx, mx + Math.cos(an) * v * easeOutCubic(sp), my + Math.sin(an) * v * easeOutCubic(sp), 7, j % 2 ? COL.red : '#ffffff', f * (1 - sp) * .8);
        }
      }
      // resolve burst ring around the green point
      const rb = P(t2, T.sep + .35, 1.1);
      if (rb > 0 && rb < 1) {
        ctx.globalAlpha = clamp(f * (1 - rb) * .9); ctx.strokeStyle = COL.green; ctx.lineWidth = 1 + 3 * (1 - rb);
        const rr = 10 + 120 * easeOutExpo(rb);
        ctx.beginPath(); ctx.ellipse(A.x, A.y, rr, rr * .9, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      }
      // links: chips -> points (dispute), claim rows -> points (resolution)
      const edgeX = PX + PW + 2;
      const link = (y, P2, col, a) => {
        if (a <= .01) return;
        const [x0, y0] = toScreen(edgeX, PY + y);
        const cx = lerp(x0, P2.x, .5), cy = lerp(y0, P2.y, .5) - 40;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const [wm, am] of [[5, .08], [2.4, .2], [1, .6]]) {
          ctx.globalAlpha = clamp(a * am); ctx.strokeStyle = col; ctx.lineWidth = 1.6 * wm;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P2.x, P2.y); ctx.stroke();
        }
        ctx.restore();
        drawGlow(ctx, x0, y0, 11, col, a);
        // travelling spark
        const u = ((t2 * .9) % 1), iu = 1 - u;
        drawGlow(ctx, iu * iu * x0 + 2 * iu * u * cx + u * u * P2.x, iu * iu * y0 + 2 * iu * u * cy + u * u * P2.y, 9, '#ffffff', a * .6 * Math.sin(u * Math.PI));
      };
      const l1 = f * win(t2, T.links, 103.4, .5, .6), l1b = f * win(t2, T.links + .12, 103.4, .5, .6);
      const clip = y => clamp(invLerp(HEAD + 20, HEAD + 60, y)) * clamp(invLerp(PH + 10, PH - 30, y)); // only while visible in the viewport
      link(chipYs[0], A, COL.indigoLt, l1 * clip(chipYs[0]) * .9);
      link(chipYs[1], B, COL.amber, l1b * clip(chipYs[1]) * .9);
      const l2 = f * win(t2, T.rows + .35, END - .1, .6, .6);
      link(rowYs[0], A, COL.green, l2 * clip(rowYs[0]) * .85);
    });
  }
})();
