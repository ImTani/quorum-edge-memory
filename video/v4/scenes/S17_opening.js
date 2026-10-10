/* S17 · Opening: BKA, three apps, four heads (240-262 s). LIVE-SHOW segment on the COLD cell (not in the
 * 168 s film). It is the first thing the audience sees, and the player cuts from its end straight to the
 * film's S01 cold open (t = 0), which starts on this same cell from a clean board. Five steps, each ending
 * at a hold (window.SHOW_STOPS.S17 below):
 *  1 (240-244.5) a white card "BKA / four people" and four kraft name tags slap along the lower third
 *  2 (244.5-249.5) a Discord-style card (#sharma-wedding, voice call, two team messages), "we talk on Discord"
 *  3 (249.5-254.5) a WhatsApp card from the client, "clients: WhatsApp"; an email card, "anything official: email"
 *  4 (254.5-259.5) ink lines tangle from each app to different people; "one job · three apps · four heads", red "?"
 *  5 (259.5-261.5) the eraser wipes the whole cell back to clean board (the camera settles on S01's opening framing)
 * Pure function of t. Nothing is visible before 240 or after the wipe (the content wrapper is hidden outside
 * [240, end of wipe)), so S01 (t 0-16) and S18 (t >= 280) on the same cell are untouched. */
(function () {
  const K = KIT, L = K.list();
  const START = 240, END = 262;
  const SX = REGIONS.COLD.x, SY = REGIONS.COLD.y;
  const Z1 = regionCam('COLD', 1.0);
  const ZE = regionCam('COLD', 1.045);          // = S01's first camera key: the cut to t = 0 is seamless

  // step 1
  const T_HEAD = 240.5, T_TAGS = [241.1, 241.45, 241.8, 242.15], T_BRACE = 242.6;
  // step 2
  const T_DC = 245.0, T_PILL = 245.35, T_DM = [245.7, 246.3], T_DCL = 247.0;
  // step 3
  const T_WA = 250.0, T_WAB = 250.4, T_WAL = 250.9, T_EM = 251.8, T_EMU = 252.15, T_EML = 252.6;
  // step 4
  const T_LINES = [255.0, 255.35, 255.7, 256.05], T_STRIP = 256.9, T_UNDER = 258.15, T_Q = 258.7;
  // step 5
  const T_ERASE = 259.8, ERASE_DUR = 1.3, T_CLEAN = T_ERASE + ERASE_DUR;   // 261.1

  // layout (region-local)
  const CARD_W = 540, CARD_Y = 70;
  const CARDS = { dc: { x: 70, rot: -1.5 }, wa: { x: 690, rot: 1.2 }, em: { x: 1310, rot: 1.6 } };
  const ROW_Y = 935;                                        // name-tag row centre
  const PEOPLE = [
    { name: 'Tanishk', x: 590, rot: -3 },
    { name: 'Lakshya', x: 925, rot: 2 },
    { name: 'Tushar', x: 1260, rot: -2 },
    { name: 'Aayat', x: 1595, rot: 3 },
  ];

  const css = `
.s17-card{position:absolute;width:${CARD_W}px;border-radius:16px;font-family:var(--ui);color:#14171f;line-height:1.25;transform-origin:50% 40%;background:#fff}
.s17-card .tape{z-index:5;width:86px;height:28px;top:-14px}
.s17-in{position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px #dfe2e8}
.s17-dc-head{height:76px;background:#2b2d31;color:#fff;display:flex;align-items:center;gap:12px;padding:0 24px;font-size:29px;font-weight:700;border-top:6px solid #5865F2}
.s17-dc-hash{color:#a3a9b3;font-size:40px;font-weight:500;line-height:1}
.s17-dc-bar{padding:16px 24px 4px}
.s17-pill{display:inline-flex;align-items:center;gap:10px;background:#5865F2;color:#fff;font-size:23px;font-weight:700;padding:7px 18px 8px 14px;border-radius:999px;transform-origin:20% 50%}
.s17-pill b{width:11px;height:11px;border-radius:50%;background:#fff;display:inline-block}
.s17-dc-msg{display:flex;gap:16px;padding:12px 24px 6px}
.s17-dc-msg:last-child{padding-bottom:22px}
.s17-av{width:56px;height:56px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:24px}
.s17-who{font-size:25px;font-weight:700;white-space:nowrap}
.s17-when{font-size:22px;color:#80848e;font-weight:500;margin-left:10px}
.s17-txt{font-size:27px;margin-top:2px;color:#2e3338}
.s17-wa-head{height:88px;background:#075e54;color:#fff;display:flex;align-items:center;gap:14px;padding:0 22px}
.s17-wa-av{width:58px;height:58px;border-radius:50%;background:#dfe5e7;color:#54656f;font-weight:700;font-size:23px;display:flex;align-items:center;justify-content:center;flex:none}
.s17-wa-name{font-size:28px;font-weight:600;line-height:1.1}
.s17-wa-sub{font-size:22px;opacity:.85}
.s17-wa-body{background:#efe7dd;padding:18px 22px 28px;display:flex;flex-direction:column;gap:14px}
.s17-chip{align-self:center;background:#fff;color:#54656f;font-size:22px;padding:4px 16px;border-radius:10px;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.s17-bub{align-self:flex-start;max-width:440px;background:#fff;border-radius:16px;border-top-left-radius:4px;padding:10px 18px 8px;font-size:30px;line-height:1.25;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.s17-tm{display:block;text-align:right;font-size:22px;color:#667781;margin-top:2px}
.s17-em-top{height:60px;background:#f2f4f8;display:flex;align-items:center;gap:12px;padding:0 24px;font-size:22px;color:#5f6368;font-weight:600;border-bottom:1px solid #e3e6eb}
.s17-unread{margin-left:auto;margin-right:46px;background:#1f4fd8;color:#fff;font-size:22px;font-weight:700;padding:2px 12px;border-radius:999px;transform-origin:50% 50%}
.s17-em-b{padding:18px 26px 24px}
.s17-subj{font-size:31px;font-weight:700;letter-spacing:-.01em}
.s17-from{display:flex;align-items:center;gap:14px;margin-top:14px}
.s17-em-av{width:52px;height:52px;border-radius:50%;background:#3b4150;color:#fff;font-weight:700;font-size:21px;display:flex;align-items:center;justify-content:center;flex:none}
.s17-fname{font-size:24px;font-weight:700}
.s17-to{font-size:22px;color:#656b7a}
.s17-em-txt{margin-top:16px;font-size:27px;line-height:1.3;color:#2e3338}
`;

  const SVG_ENV = '<svg width="28" height="22" viewBox="0 0 28 22"><rect x="2" y="2" width="24" height="18" rx="3" fill="none" stroke="#5f6368" stroke-width="2.6"/><path d="M3 4 L14 12 L25 4" fill="none" stroke="#5f6368" stroke-width="2.6" stroke-linejoin="round"/></svg>';

  let wrap = null;
  const R = {};

  /** a UI card slapped onto the board at t0 (tape slap: in at 1.12 and +6deg, small settle, shadow tightens) */
  function slap(e, t0, rot) {
    return {
      render(t) {
        const a = t0 - .14;
        if (t < a) { e.style.display = 'none'; return; }
        e.style.display = '';
        const kin = easeInCubic(P(t, a, .14)), ks = P(t, t0, .6);
        const s = t < t0 ? lerp(1.12, 1, kin) : 1 - .022 * Math.sin(ks * Math.PI) * (1 - ks);
        const r = rot + (t < t0 ? lerp(6, 0, kin) : 0), lift = t < t0 ? 1 - kin : 0;
        xf(e, { y: -30 * lift, s, r, o: Math.min(1, P(t, a, .06)) });
        e.style.boxShadow = `0 ${(24 + lift * 30).toFixed(1)}px ${(40 + lift * 36).toFixed(1)}px -20px rgba(20,23,31,${(.38 - lift * .1).toFixed(3)}),0 2px 4px rgba(20,23,31,.08)`;
      },
    };
  }

  /** an ink line from a to b through two control points, then a small head along its last tangent */
  function tangle(a, c1, c2, b, t0) {
    const d = `M${a[0]} ${a[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${b[0]} ${b[1]}`;
    const m = L.add(markerPath(wrap, d, { color: 'ink', width: 4.5, t0, dur: .55, dry: false }));
    const tx = b[0] - c2[0], ty = b[1] - c2[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hs = 16;
    const h1 = [b[0] - ux * hs + uy * hs * .6, b[1] - uy * hs - ux * hs * .6], h2 = [b[0] - ux * hs - uy * hs * .6, b[1] - uy * hs + ux * hs * .6];
    L.add(markerPath(wrap, `M${h1[0].toFixed(1)} ${h1[1].toFixed(1)} L ${b[0]} ${b[1]} L ${h2[0].toFixed(1)} ${h2[1].toFixed(1)}`, { color: 'ink', width: 4.5, t0: t0 + m.dur + .02, dur: .12, dry: false }));
  }

  Scene({
    id: 'S17', start: START, end: END, region: 'COLD',
    camera: [
      [240.0, Z1],
      [259.6, Z1, 'linear'],
      [T_CLEAN, ZE, 'easeInOutSine'],
      [262.0, ZE, 'linear'],
    ],
    shakes: [[T_HEAD, 2, .25], ...T_TAGS.map(t => [t, 2, .22]), [T_DC, 3, .3], [T_WA, 3, .3], [T_EM, 3, .3], [T_Q, 4, .35]],

    build(root, S) {
      if (!document.getElementById('s17-css')) { const st = document.createElement('style'); st.id = 's17-css'; st.textContent = css; document.head.appendChild(st); }

      // Same guard as S16 (shared flag): past the film's end, ignore S15's fade to paper.
      if (!Q.__s16guard) {
        const orig = Q.setFade;
        Q.setFade = v => { if (Q.t > 168.5) return; orig(v); };
        Q.__s16guard = true;
      }

      // A clean-board patch under everything, from the first frame at 240 (as S18 does at 280). S02's title
      // lockup lives in this cell for good (it holds for the S15 pull-out), so without it the "Quorum"
      // title would show behind the opening. Time-gated, so S01/S02 at t < 240 are untouched.
      L.add(eraser(root, { x: -40, y: -20, w: 2000, h: 1120, t0: START, dur: .001, worldX: S.region.x, worldY: S.region.y }));
      K.fixSwath(root, S.region.x, S.region.y, -40, -20);
      root.querySelectorAll('.erase-swath, .erase-block').forEach(e => { e.style.zIndex = 0; });   // under the wrapper (CSS puts swaths at 50)

      // everything lives in one wrapper, shown only during [START, end of the wipe)
      wrap = el('div', { style: 'left:0;top:0;width:0;height:0' }, root);
      const W = wrap;

      /* ================= step 2/3: the three app cards ================= */
      const card = (k) => {
        const c = el('div', { cls: 's17-card', style: `left:${CARDS[k].x}px;top:${CARD_Y}px` }, W);
        const inn = el('div', { cls: 's17-in' }, c);
        el('i', { cls: 'tape', style: 'left:-20px;top:4px;transform:rotate(-26deg)' }, c);
        el('i', { cls: 'tape', style: 'right:-20px;top:4px;transform:rotate(24deg)' }, c);
        return { c, inn };
      };

      // Discord-style team channel
      const dc = card('dc'); R.dc = dc.c;
      el('div', { cls: 's17-dc-head', html: '<span class="s17-dc-hash">#</span><span>sharma-wedding</span>' }, dc.inn);
      const bar = el('div', { cls: 's17-dc-bar' }, dc.inn);
      R.pill = el('div', { cls: 's17-pill', html: '<span>🔊</span><span>voice call · 3 in call</span><b></b>' }, bar);
      const dmsg = (who, col, ini, when, txt) => el('div', { cls: 's17-dc-msg', html: `<div class="s17-av" style="background:${col}">${ini}</div><div><div class="s17-who">${who}<span class="s17-when">${when}</span></div><div class="s17-txt">${txt}</div></div>` }, dc.inn);
      R.dm = [
        dmsg('Tushar', '#3b4150', 'Tu', 'Today at 6:40 PM', 'grade’s done, cut goes out tonight'),
        dmsg('Lakshya', '#1f4fd8', 'La', 'Today at 6:42 PM', 'client wants a teaser too'),
      ];

      // WhatsApp-style client chat
      const wa = card('wa'); R.wa = wa.c;
      const wh = el('div', { cls: 's17-wa-head' }, wa.inn);
      el('div', { cls: 's17-wa-av', text: 'RS' }, wh);
      el('div', { html: '<div class="s17-wa-name">Rohit Sharma</div><div class="s17-wa-sub">client</div>' }, wh);
      const wb = el('div', { cls: 's17-wa-body' }, wa.inn);
      el('div', { cls: 's17-chip', text: 'Today' }, wb);
      R.wab = el('div', { cls: 's17-bub', html: 'Bhai, teaser bhi chahiye 🙏<span class="s17-tm">7:05 pm</span>' }, wb);

      // email
      const em = card('em'); R.em = em.c;
      R.emTop = el('div', { cls: 's17-em-top', html: `${SVG_ENV}<span>Inbox</span>` }, em.inn);
      R.unread = el('span', { cls: 's17-unread', text: 'new' }, R.emTop);
      const eb = el('div', { cls: 's17-em-b' }, em.inn);
      el('div', { cls: 's17-subj', text: 'Final delivery schedule' }, eb);
      el('div', { cls: 's17-from', html: '<div class="s17-em-av">SW</div><div><div class="s17-fname">Sharma Weddings (office)</div><div class="s17-to">to Lakshya</div></div>' }, eb);
      el('div', { cls: 's17-em-txt', html: 'Final delivery of the wedding edit: <span style="white-space:nowrap">16 October.</span>' }, eb);

      // measured card bottoms (unrotated)
      const bot = { dc: CARD_Y + R.dc.offsetHeight, wa: CARD_Y + R.wa.offsetHeight, em: CARD_Y + R.em.offsetHeight };

      L.add(slap(R.dc, T_DC, CARDS.dc.rot));
      L.add(slap(R.wa, T_WA, CARDS.wa.rot));
      L.add(slap(R.em, T_EM, CARDS.em.rot));
      L.add({ render(t) {
        pop(R.pill, t, T_PILL, .45, .7);
        R.dm.forEach((e, i) => show(e, t, T_DM[i], .4, { dy: 16 }));
        show(R.wab, t, T_WAB, .4, { dy: 16 });
        pop(R.unread, t, T_EMU, .45, .6);
      } });

      // hand labels under the cards
      L.add(handText(W, 'we talk on Discord', CARDS.dc.x + 14, bot.dc + 56, { color: 'blue', size: 40, weight: 700, t0: T_DCL, dur: .75, rot: -2 }));
      L.add(handText(W, 'clients: WhatsApp', CARDS.wa.x + CARD_W - 10, bot.wa + 60, { color: 'blue', size: 40, weight: 700, t0: T_WAL, dur: .7, rot: 1.5, align: 'right' }));
      L.add(handText(W, 'anything official: email', CARDS.em.x + CARD_W - 6, bot.em + 60, { color: 'blue', size: 38, weight: 700, t0: T_EML, dur: .85, rot: 1.5, align: 'right' }));

      /* ================= step 1: BKA and the four name tags ================= */
      L.add(sticky(W, { x: 232, y: ROW_Y - 4, w: 300, h: 176, color: 'white', rot: -3, t0: T_HEAD, size: 40, tape: 1,
        html: '<div style="font:800 80px/1 var(--ui);letter-spacing:-.03em;color:#14171f">BKA</div><div style="margin-top:10px;color:#1f4fd8;font-weight:700">four people</div>' }));
      PEOPLE.forEach((p, i) => {
        const api = L.add(sticky(W, { x: p.x, y: ROW_Y, w: 250, h: 112, color: 'kraft', rot: p.rot, t0: T_TAGS[i], size: 48, tape: 1, text: p.name }));
        api.body.style.cssText += 'text-align:center;font-weight:700;margin-top:-4px';
      });
      // a blue brace under the row: "these four"
      L.add(markerPath(W, `M452 1004 Q 456 1022, 486 1022 L 1712 1020 Q 1742 1020, 1746 1002`, { color: 'blue', width: 4.5, t0: T_BRACE, dur: .6 }));

      /* ================= step 4: the tangle ================= */
      const TOP = ROW_Y - 62;                       // just above the tags
      const lx = PEOPLE[1].x;
      tangle([CARDS.dc.x + 500, bot.dc + 4], [CARDS.dc.x + 640, bot.dc + 250], [1080, 520], [PEOPLE[2].x - 10, TOP], T_LINES[0]);           // Discord -> Tushar
      tangle([CARDS.dc.x + 445, bot.dc + 6], [CARDS.dc.x + 480, bot.dc + 220], [lx + 160, 640], [lx - 40, TOP], T_LINES[1]);                // Discord -> Lakshya
      tangle([CARDS.wa.x + 70, bot.wa + 8], [CARDS.wa.x + 260, bot.wa + 220], [320, 650], [PEOPLE[0].x + 10, TOP], T_LINES[2]);              // WhatsApp -> Tanishk
      tangle([CARDS.em.x + 40, bot.em + 4], [CARDS.em.x + 20, bot.em + 210], [lx + 420, 700], [lx + 40, TOP], T_LINES[3]);                  // Email -> Lakshya

      // the line, on a taped paper strip over the tangle
      const strip = K.note(W, { x: 960, y: 575, html: 'one job · three apps · <span data-u>four heads</span>', color: 'ink', size: 64, rot: -1.2, kind: 'paper', t0: T_STRIP, dur: 1.05, align: 'center' });
      strip.el.style.fontWeight = 700;
      strip.el.style.marginLeft = `${-strip.el.offsetWidth / 2}px`;
      el('i', { cls: 'tape', style: 'left:-26px;top:18px;transform:rotate(-80deg)' }, strip.el);
      el('i', { cls: 'tape', style: 'right:-26px;top:18px;transform:rotate(84deg)' }, strip.el);
      L.add(strip);
      const ur = wordRect(strip.el, strip.el, 'four heads');
      const uy = ur.y + ur.h * .80;
      L.add(markerUnderline(strip.el, ur.x + 2, ur.x + ur.w - 4, uy, { color: 'red', width: 6, t0: T_UNDER, dur: .4 }));

      // a small red "?" drops at the strip's right end
      const qx = 960 + strip.el.offsetWidth / 2 + 58, qy = 700;
      const qw = el('div', { style: 'left:0;top:0;width:0;height:0' }, W);
      const q = handText(qw, '?', 0, 0, { color: 'red', size: 120, weight: 800, t0: T_Q - .14, dur: .1, rot: 6, align: 'center' });
      L.add({ render(t) {
        const k = P(t, T_Q - .16, .16), b = t >= T_Q ? Math.sin(P(t, T_Q, .3) * Math.PI) * 9 * (1 - P(t, T_Q, .3)) : 0;
        qw.style.transform = `translate(${qx}px,${(lerp(qy - 150, qy, easeInCubic(k)) - b).toFixed(1)}px)`;
        q.render(t);
      } });

      /* ================= step 5: the wipe ================= */
      L.add(eraser(W, { x: -40, y: -20, w: 2000, h: 1120, t0: T_ERASE, dur: ERASE_DUR, worldX: SX, worldY: SY }));
      K.fixSwath(W, SX, SY, -40, -20);

      wrap.style.display = 'none';
    },

    render(t) {
      // visible only from the first frame of the scene to the end of the wipe; then S01's own clean swath
      // (it persists from t 16 on) is what shows, identical to the board.
      vis(wrap, t >= START && t < T_CLEAN + .02);
      L.render(t);
    },
  });

  /* ---- live-show player: stop points (t = where each step ends and holds) and sound cues ---- */
  window.SHOW_STOPS = window.SHOW_STOPS || {};
  window.SHOW_STOPS.S17 = [
    { t: 244.5, title: 'BKA: four people', say: '"We’re BKA: four people, a production house and developer group."' },
    { t: 249.5, title: 'We talk on Discord', say: '"We talk on Discord, mostly in voice calls."' },
    { t: 254.5, title: 'Clients on WhatsApp, official on email', say: '"Our clients talk on WhatsApp, because that’s how Indian clients work. Anything official comes by email."' },
    { t: 259.5, title: 'Three apps, four heads', say: '"So one job’s facts live in three apps and four heads."' },
    { t: 261.5, title: 'Clean board', say: 'Beat. Next starts the cold open on this board.' },
  ];
  window.SHOW_SFX = window.SHOW_SFX || {};
  window.SHOW_SFX.S17 = [
    // 1 · BKA and the four tags
    [T_HEAD, 'sticky_slap'], ...T_TAGS.map(t => [t, 'sticky_slap']), [T_BRACE, 'marker_squeak'],
    // 2 · Discord
    [T_DC, 'sticky_slap'], [T_PILL, 'ui_pop'], [T_DM[0], 'ui_pop'], [T_DM[1], 'ui_pop'], [T_DCL, 'marker_squeak'],
    // 3 · WhatsApp, email
    [T_WA, 'sticky_slap'], [T_WAB, 'ui_pop'], [T_WAL, 'marker_squeak'],
    [T_EM, 'sticky_slap'], [T_EMU, 'ui_pop'], [T_EML, 'marker_squeak'],
    // 4 · the tangle, the line, the "?"
    ...T_LINES.map(t => [t, 'marker_squeak']), [T_STRIP, 'paper_whoosh'], [T_STRIP + .1, 'marker_squeak'],
    [T_UNDER, 'marker_squeak'], [T_Q, 'alert_chime'],
    // 5 · the wipe
    [T_ERASE, 'paper_whoosh'],
  ].map(([t, type]) => [+t.toFixed(2), type]);
})();
