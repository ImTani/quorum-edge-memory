/* S16 · The phone: one share from WhatsApp (200-226 s). LIVE-SHOW segment on the SPARE cell (not in the
 * 168 s film). Five steps, each ending at a hold (window.SHOW_STOPS.S16 below):
 *  1 (200-204) a phone slaps onto the board showing a WhatsApp chat with the client, "where clients actually talk"
 *  2 (204-209) the share flow, driven by the drawn cursor: ⋮ -> More -> Export chat -> Without media -> share sheet -> Quorum
 *  3 (209-215) the phone becomes Quorum: reading 42 messages on the device, 3 facts found, three stickies fly out
 *              onto the board, "every fact keeps its source"
 *  4 (215-220) desktop parity: a marker laptop, the same .zip dragged in, "same file, drag it in on the laptop"
 *  5 (220-226) quick capture: "Note this" mic, waveform, transcript -> a sticky, "one tap from anywhere"
 * Pure function of t; every element holds its final state after its moment (the live player holds on stops). */
(function () {
  const K = KIT, L = K.list();
  const START = 200, END = 226;
  const SX = REGIONS.SPARE.x, SY = REGIONS.SPARE.y;
  // phone: centre (PX, PY), 430 x 880, taped, rotated
  const PX = 440, PY = 545, PW = 430, PH = 880, PROT = -2;
  const Z1 = regionCam('SPARE', 1.0);
  const ZP = { x: SX + 835, y: SY + 545, z: 1.15, r: 0 };   // pushed in on the phone (left edge stays on the cell)

  // step 2 tap times (the cursor presses at these; the UI reacts 0.1 s later)
  const T_DOTS = 205.3, T_MORE = 206.1, T_EXPORT = 206.9, T_NOMEDIA = 207.7, T_QUORUM = 208.5;
  // step 3
  const T_QOPEN = 209.1, T_READ0 = 209.5, T_READ1 = 210.9, T_FOUND = 211.0, T_FACT = [212.0, 212.6, 213.2];
  // step 4
  const T_LAPTOP = 215.1, T_ZIP = 216.25, T_GRAB = 216.9, T_DROP = 218.3;
  // step 5
  const T_CAP = 220.15, T_MIC = 221.3, T_REC0 = 221.4, T_REC1 = 223.0, T_VOICE = 224.0, T_SAVED = 224.1;

  const css = `
.s16-phone{width:${PW}px;height:${PH}px;border-radius:62px;background:linear-gradient(155deg,#ffffff 0%,#f1f3f5 45%,#dadee4 100%);border:3px solid #3b4150;transform-origin:50% 40%}
.s16-phone .tape{z-index:30;width:96px;height:30px;top:-15px}
.s16-btn{position:absolute;right:-9px;width:7px;border-radius:0 4px 4px 0;background:#3b4150}
.s16-screen{position:absolute;left:13px;top:13px;width:398px;height:848px;border-radius:48px;overflow:hidden;background:#efe7dd;font-family:var(--ui);color:#111b21;line-height:1.2}
.s16-cam{position:absolute;left:50%;top:15px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:#14171f;z-index:40}
.s16-layer{position:absolute;left:0;top:0;width:398px;height:848px;overflow:hidden}
.s16-status{height:48px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 34px 4px 38px;font-size:22px;font-weight:600}
.s16-status svg{display:block}
.s16-wa{background:#075e54;color:#fff}
.s16-wa-head{height:88px;display:flex;align-items:center;gap:10px;padding:0 6px 0 8px}
.s16-av{width:54px;height:54px;border-radius:50%;background:#dfe5e7;color:#54656f;font-weight:700;font-size:22px;display:flex;align-items:center;justify-content:center;flex:none}
.s16-name{font-size:27px;font-weight:600;line-height:1.1;white-space:nowrap}
.s16-sub{font-size:22px;opacity:.85;line-height:1.2}
.s16-dots{position:relative;width:46px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:50%}
.s16-dots i{width:7px;height:7px;border-radius:50%;background:#fff}
.s16-body{position:absolute;left:0;right:0;top:136px;bottom:92px;padding:16px 14px;display:flex;flex-direction:column;gap:10px}
.s16-chip{align-self:center;background:#fff;color:#54656f;font-size:22px;padding:4px 16px;border-radius:10px;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.s16-b{max-width:322px;padding:9px 14px 7px;border-radius:16px;font-size:25px;line-height:1.26;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.s16-b.in{align-self:flex-start;background:#fff;border-top-left-radius:4px}
.s16-b.out{align-self:flex-end;background:#d9fdd3;border-top-right-radius:4px}
.s16-tm{display:block;text-align:right;font-size:22px;color:#667781;margin-top:2px}
.s16-tick{color:#53bdeb;font-weight:700;letter-spacing:-.18em;margin-left:4px}
.s16-input{position:absolute;left:10px;right:10px;bottom:20px;height:62px;display:flex;gap:10px}
.s16-pill{flex:1;background:#fff;border-radius:31px;font-size:24px;color:#8696a0;display:flex;align-items:center;padding-left:24px}
.s16-micsm{width:62px;height:62px;border-radius:50%;background:#00a884;display:flex;align-items:center;justify-content:center}
.s16-menu{position:absolute;right:8px;top:54px;width:286px;background:#fff;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.28);padding:8px 0;transform-origin:100% 0}
.s16-mi{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-size:25px;color:#111b21}
.s16-mi.hl{background:#e3e7ea}
.s16-scrim{position:absolute;left:0;top:0;width:398px;height:848px;background:rgba(11,20,26,.45)}
.s16-sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:28px 28px 0 0;padding:14px 26px 36px}
.s16-handle{width:46px;height:5px;border-radius:3px;background:#c9ced6;margin:0 auto 16px}
.s16-st{font-size:27px;font-weight:700}
.s16-sd{font-size:22px;color:#667781;margin-top:6px;line-height:1.25}
.s16-row{height:76px;display:flex;align-items:center;gap:18px;font-size:25px;border-radius:12px;padding:0 12px;margin:6px -12px 0}
.s16-row.hl{background:#e3e7ea}
.s16-file{display:flex;align-items:center;gap:14px;margin-top:14px;padding-bottom:18px;border-bottom:1px solid #e3e6eb;font-size:22px;color:#3b4150;line-height:1.2}
.s16-apps{display:flex;justify-content:space-between;margin:20px -8px 0}
.s16-app{position:relative;width:86px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:22px;color:#3b4150;letter-spacing:-.01em;white-space:nowrap}
.s16-ico{width:72px;height:72px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:#f1f3f4}
.s16-ring{position:absolute;left:3px;top:-4px;width:80px;height:80px;border-radius:24px;border:4px solid #1f4fd8}
.s16-qlogo{width:56px;height:56px;flex:none;background:linear-gradient(180deg,#ffe86a,#ffe14d 30%);box-shadow:0 4px 7px -3px rgba(20,23,31,.4);display:flex;align-items:center;justify-content:center;font:800 38px/1 var(--ui);color:#14171f;letter-spacing:-.04em;transform:rotate(-5deg)}
.s16-q{background:#f7f6f1;color:#14171f}
.s16-q .s16-status{background:#fbfaf6}
.s16-qhead{height:92px;background:#fbfaf6;display:flex;align-items:center;gap:16px;padding:0 24px;border-bottom:2px solid #e3e5ea}
.s16-qword{font:800 38px/1 var(--ui);letter-spacing:-.03em}
.s16-qb{padding:20px 24px}
.s16-k{font-size:22px;color:#656b7a}
.s16-h{font-size:30px;font-weight:700;margin-top:2px}
.s16-card{margin-top:16px;background:#fff;border:1px solid #dfe2e8;border-radius:16px;padding:16px 18px 18px}
.s16-read{font-size:25px;font-weight:600}
.s16-dev{display:inline-block;margin-top:8px;font-size:22px;font-weight:600;color:#3a2a12;background:linear-gradient(180deg,#ead0a0,#e2c08a);padding:3px 12px;border-radius:6px}
.s16-bar{margin-top:16px;height:14px;border-radius:7px;background:#e3e6eb;overflow:hidden}
.s16-fill{height:100%;width:100%;background:#1f4fd8;transform-origin:0 50%}
.s16-found{margin-top:22px;font-size:32px;font-weight:800;display:flex;align-items:center;gap:12px}
.s16-ok{width:36px;height:36px;border-radius:50%;background:#14895a;color:#fff;font-size:24px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
.s16-fact{margin-top:12px;background:#fff;border:1px solid #dfe2e8;border-left:9px solid #ffe14d;border-radius:12px;padding:10px 14px;font-size:22px;font-weight:600;line-height:1.25}
.s16-mic{position:relative;width:184px;height:184px;margin:34px auto 0;border-radius:50%;background:radial-gradient(circle at 38% 32%,#4a74f2,#1f4fd8 62%,#1a43b8);box-shadow:0 12px 22px -10px rgba(20,23,31,.55);display:flex;align-items:center;justify-content:center}
.s16-mring{position:absolute;left:-4px;top:-4px;width:192px;height:192px;border-radius:50%;border:5px solid #1f4fd8}
.s16-mlabel{margin-top:16px;text-align:center;font-size:32px;font-weight:800}
.s16-mstat{height:32px;margin-top:4px;text-align:center;font-size:22px;font-weight:600;color:#656b7a}
.s16-wave{height:84px;margin:8px 4px 0;display:flex;align-items:center;justify-content:center;gap:4px}
.s16-wave i{width:6px;border-radius:3px;background:#1f4fd8;height:6px}
.s16-tcard{margin-top:12px;background:#fff;border:1px solid #dfe2e8;border-radius:16px;padding:12px 16px 16px;transform-origin:50% 50%}
.s16-tx{font-size:27px;font-weight:600;line-height:1.25;margin-top:4px}
.s16-tx span{display:inline-block;margin-right:.26em}
.s16-zip{width:390px;white-space:nowrap;height:116px;background:#fff;border:1px solid #dfe2e8;border-radius:16px;display:flex;align-items:center;gap:16px;padding:0 20px;font-family:var(--ui);color:#14171f;transform-origin:50% 50%}
.s16-lscreen{background:rgba(255,255,255,.93);border-radius:10px;font-family:var(--ui);color:#14171f;overflow:hidden}
`;

  // ---- small SVG bits ----
  const SVG_BACK = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M18 6 L9 15 L18 24 M9 15 H27" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_CALL = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="#fff"/></svg>';
  const SVG_SIG = '<svg width="74" height="20" viewBox="0 0 74 20"><path d="M2 18 L18 2 V18 Z" fill="currentColor"/><rect x="30" y="4" width="34" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="33" y="7" width="22" height="8" rx="1.5" fill="currentColor"/><rect x="65" y="8" width="3" height="6" rx="1" fill="currentColor"/></svg>';
  const SVG_MICSM = '<svg width="24" height="30" viewBox="0 0 64 80"><rect x="20" y="4" width="24" height="44" rx="12" fill="#fff"/><path d="M10 34 v4 a22 22 0 0 0 44 0 v-4" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M32 60 v14" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>';
  const SVG_MIC = '<svg width="66" height="84" viewBox="0 0 64 80"><rect x="20" y="4" width="24" height="44" rx="12" fill="#fff"/><path d="M10 34 v4 a22 22 0 0 0 44 0 v-4" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M32 60 v14 M20 76 h24" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';
  const SVG_DOC = '<svg width="30" height="36" viewBox="0 0 30 36"><path d="M3 2 h16 l8 8 v24 h-24 z" fill="none" stroke="#54656f" stroke-width="3" stroke-linejoin="round"/><path d="M8 18 h14 M8 25 h14" stroke="#54656f" stroke-width="3" stroke-linecap="round"/></svg>';
  const SVG_IMG = '<svg width="34" height="32" viewBox="0 0 34 32"><rect x="2" y="2" width="30" height="28" rx="4" fill="none" stroke="#54656f" stroke-width="3"/><path d="M5 26 L13 16 L19 22 L23 18 L30 26" fill="none" stroke="#54656f" stroke-width="3" stroke-linejoin="round"/><circle cx="23" cy="10" r="3" fill="#54656f"/></svg>';
  const zipIcon = (w, h) => `<svg width="${w}" height="${h}" viewBox="0 0 58 72"><path d="M4 4 h34 l16 16 v48 h-50 z" fill="#e8ecf1" stroke="#3b4150" stroke-width="3" stroke-linejoin="round"/><path d="M38 4 v16 h16" fill="none" stroke="#3b4150" stroke-width="3" stroke-linejoin="round"/><path d="M20 8 h7 M27 15 h7 M20 22 h7 M27 29 h7 M20 36 h7" stroke="#3b4150" stroke-width="4"/><rect x="20" y="42" width="14" height="16" rx="2.5" fill="#fff" stroke="#3b4150" stroke-width="3"/></svg>`;
  const ICON_DRIVE = '<svg width="50" height="44" viewBox="0 0 50 44"><path d="M25 5 L6 37" stroke="#0f9d58" stroke-width="9" stroke-linecap="round"/><path d="M25 5 L44 37" stroke="#f4b400" stroke-width="9" stroke-linecap="round"/><path d="M8 38 H42" stroke="#4285f4" stroke-width="9" stroke-linecap="round"/></svg>';
  const ICON_GMAIL = '<svg width="50" height="40" viewBox="0 0 50 40"><rect x="3" y="3" width="44" height="34" rx="5" fill="#fff" stroke="#dadce0" stroke-width="2"/><path d="M7 33 V9 L25 23 L43 9 V33" fill="none" stroke="#ea4335" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const ICON_BT = '<svg width="32" height="44" viewBox="0 0 32 44"><path d="M5 12 L27 32 L16 41 V3 L27 12 L5 32" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  let rootEl = null;
  const P2 = {};          // measured tap targets and anchors (region-local)
  const R = {};           // elements

  /** centre of an element in root (region-local) coords, measured at build time */
  function centreOf(e) { const a = e.getBoundingClientRect(), b = rootEl.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; }
  const W2 = p => ({ x: SX + p.x, y: SY + p.y });   // region-local -> world

  /** a sticky that flies out of `from` (region-local centre) and slaps at its own spot at t0 */
  function flyer(api, cx, cy, from, t0, o = {}) {
    const e = api.el, a = t0 - .12, f0 = t0 - (o.fly ?? .55), s0 = o.s0 ?? .4, r0 = o.r0 ?? PROT;
    return {
      render(t) {
        if (t < f0) { e.style.display = 'none'; return; }
        if (t < a) {
          const k = easeInOutCubic(P(t, f0, a - f0));
          e.style.display = '';
          const x = lerp(from.x - cx, 0, k), y = lerp(from.y - cy, 0, k) - Math.sin(k * Math.PI) * (o.arc ?? 70);
          xf(e, { x, y, s: lerp(s0, 1.18, k), r: lerp(r0, api.rot + 8, k), o: Math.min(1, P(t, f0, .08)) });
          e.style.boxShadow = '0 36px 48px -8px rgba(20,23,31,.23), 0 2px 3px rgba(20,23,31,.10)';
          return;
        }
        api.render(t);
        if (t < a + .07) { e.style.opacity = 1; e.style.visibility = 'visible'; }
      },
    };
  }

  /** show for t in [a, b) with a short fade/rise in; instant hide at b (b = null: stays) */
  function span(e, t, a, b, o = {}) {
    const on = t >= a && (b == null || t < b);
    if (!on) { e.style.display = 'none'; return 0; }
    e.style.display = '';
    const k = easeOutCubic(P(t, a, o.d ?? .18));
    xf(e, { x: (1 - k) * (o.dx || 0), y: (1 - k) * (o.dy || 0), s: lerp(o.s ?? 1, 1, k), o: Math.min(1, k * 1.4) });
    return k;
  }

  Scene({
    id: 'S16', start: START, end: END, region: 'SPARE',
    camera: [
      [200.0, Z1],
      [204.0, Z1, 'linear'],
      [204.8, ZP, 'easeInOutCubic'],
      [209.0, ZP, 'linear'],
      [209.75, Z1, 'easeInOutCubic'],
      [226.0, Z1, 'linear'],
    ],
    shakes: [[201.0, 3, .3], [T_FACT[0], 2, .25], [T_FACT[1], 2, .25], [T_FACT[2], 2, .25], [T_VOICE, 3, .3]],

    build(root, S) {
      rootEl = root;
      if (!document.getElementById('s16-css')) { const st = document.createElement('style'); st.id = 's16-css'; st.textContent = css; document.head.appendChild(st); }

      // The film's close (S15) fades to clean paper from 167 s and keeps calling Q.setFade(1) whenever its
      // (huge-margin) region is on camera, which is always. For this live segment, past the film's end,
      // ignore it so the board stays visible. This covers every show-only scene (all of them live past the
      // film's 168 s end). Local guard: lib.js and S15 are untouched.
      if (!Q.__s16guard) {
        const orig = Q.setFade;
        Q.setFade = v => { if (Q.t > 168.5) return; orig(v); };
        Q.__s16guard = true;
      }

      /* ================= the phone ================= */
      const phone = R.phone = el('div', { cls: 's16-phone', style: `left:${PX - PW / 2}px;top:${PY - PH / 2}px` }, root);
      el('i', { cls: 'tape', style: 'left:-22px;transform:rotate(-24deg);top:10px' }, phone);
      el('i', { cls: 'tape', style: 'right:-22px;transform:rotate(22deg);top:10px' }, phone);
      el('i', { cls: 'tape', style: 'left:50%;margin-left:-48px;top:auto;bottom:-14px;transform:rotate(3deg)' }, phone);
      el('div', { cls: 's16-btn', style: 'top:190px;height:90px' }, phone);
      el('div', { cls: 's16-btn', style: 'top:300px;height:56px' }, phone);
      const screen = el('div', { cls: 's16-screen' }, phone);
      el('div', { cls: 's16-cam' }, phone);

      // --- layer 1: WhatsApp chat (+ its menus and sheets) ---
      const chat = R.chat = el('div', { cls: 's16-layer' }, screen);
      el('div', { cls: 's16-status s16-wa', html: `<span>10:42</span>${SVG_SIG}`, style: 'background:#054d44' }, chat);
      const head = el('div', { cls: 's16-wa-head s16-wa' }, chat);
      el('div', { html: SVG_BACK, style: 'flex:none;display:flex' }, head);
      el('div', { cls: 's16-av', text: 'RS' }, head);
      el('div', { html: '<div class="s16-name">Rohit Sharma</div><div class="s16-sub">client</div>', style: 'flex:1;min-width:0' }, head);
      el('div', { html: SVG_CALL, style: 'flex:none;display:flex;margin-right:4px' }, head);
      R.dots = el('div', { cls: 's16-dots', html: '<i></i><i></i><i></i>' }, head);
      const body = el('div', { cls: 's16-body' }, chat);
      R.msgs = [
        el('div', { cls: 's16-chip', text: '28 Sep' }, body),
        el('div', { cls: 's16-b in', html: 'Sangeet is at the Leela, Udaipur. Two cameras please.<span class="s16-tm">4:12 pm</span>' }, body),
        el('div', { cls: 's16-chip', text: '3 Oct' }, body),
        el('div', { cls: 's16-b in', html: 'Bhai, photos late aaye hain. Final edit 18 tak bhej do?<span class="s16-tm">10:31 am</span>' }, body),
        el('div', { cls: 's16-b out', html: 'Done, 18th it is 👍<span class="s16-tm">10:33 am<span class="s16-tick">✓✓</span></span>' }, body),
      ];
      const inp = el('div', { cls: 's16-input' }, chat);
      el('div', { cls: 's16-pill', text: 'Message' }, inp);
      el('div', { cls: 's16-micsm', html: SVG_MICSM }, inp);

      // overflow menu, then its "More" submenu
      R.menu = el('div', { cls: 's16-menu' }, chat);
      ['View contact', 'Search', 'Mute notifications'].forEach(s => el('div', { cls: 's16-mi', text: s }, R.menu));
      R.miMore = el('div', { cls: 's16-mi', html: 'More<span style="font-size:30px;color:#54656f">›</span>' }, R.menu);
      R.sub = el('div', { cls: 's16-menu' }, chat);
      ['Report', 'Block', 'Clear chat'].forEach(s => el('div', { cls: 's16-mi', text: s }, R.sub));
      R.miExport = el('div', { cls: 's16-mi', text: 'Export chat' }, R.sub);
      el('div', { cls: 's16-mi', text: 'Add shortcut' }, R.sub);
      // scrim + export sheet + share sheet
      R.scrim = el('div', { cls: 's16-scrim' }, chat);
      R.exp = el('div', { cls: 's16-sheet' }, chat);
      el('div', { cls: 's16-handle' }, R.exp);
      el('div', { cls: 's16-st', text: 'Export chat' }, R.exp);
      el('div', { cls: 's16-sd', text: 'Media makes the export larger.' }, R.exp);
      R.rowNo = el('div', { cls: 's16-row', html: `<span style="width:34px;display:flex;justify-content:center">${SVG_DOC}</span>Without media` }, R.exp);
      el('div', { cls: 's16-row', html: `<span style="width:34px;display:flex;justify-content:center">${SVG_IMG}</span>Include media` }, R.exp);
      R.share = el('div', { cls: 's16-sheet' }, chat);
      el('div', { cls: 's16-handle' }, R.share);
      el('div', { cls: 's16-st', text: 'Share' }, R.share);
      el('div', { cls: 's16-file', html: `${zipIcon(34, 42)}<span>WhatsApp Chat with<br>Rohit Sharma.zip</span>` }, R.share);
      const apps = el('div', { cls: 's16-apps' }, R.share);
      const app = (icon, label, bg) => { const a = el('div', { cls: 's16-app' }, apps); const ic = el('div', { cls: 's16-ico', html: icon, style: bg ? `background:${bg}` : '' }, a); el('span', { text: label }, a); return { a, ic }; };
      app(ICON_DRIVE, 'Drive');
      app(ICON_BT, 'Bluetooth', '#1e88e5');
      app(ICON_GMAIL, 'Gmail');
      const q = app('<div class="s16-qlogo" style="width:62px;height:62px;font-size:44px">Q</div>', 'Quorum', 'transparent');
      R.qApp = q.ic; R.qRing = el('div', { cls: 's16-ring' }, q.a);

      // --- layer 2: Quorum, reading the chat on the phone ---
      const qhead = (layer, sub) => {
        el('div', { cls: 's16-status', html: `<span>10:43</span>${SVG_SIG}` }, layer);
        const hd = el('div', { cls: 's16-qhead' }, layer);
        el('div', { cls: 's16-qlogo', text: 'Q' }, hd);
        el('div', { cls: 's16-qword', text: 'Quorum' }, hd);
        if (sub) el('div', { text: sub, style: 'margin-left:auto;font-size:22px;color:#656b7a;font-weight:600' }, hd);
      };
      const imp = R.imp = el('div', { cls: 's16-layer s16-q' }, screen);
      qhead(imp);
      const qb = el('div', { cls: 's16-qb' }, imp);
      el('div', { cls: 's16-k', text: 'Import from WhatsApp' }, qb);
      el('div', { cls: 's16-h', text: 'Chat with Rohit Sharma' }, qb);
      const card = el('div', { cls: 's16-card' }, qb);
      el('div', { cls: 's16-read', text: 'Reading 42 messages' }, card);
      el('div', { cls: 's16-dev', text: 'on this device' }, card);
      R.fill = el('div', { cls: 's16-fill' }, el('div', { cls: 's16-bar' }, card));
      R.found = el('div', { cls: 's16-found', html: '<span class="s16-ok">✓</span>3 facts found' }, qb);
      R.facts = ['Sharma wedding edit ·<br>due 18 Oct', 'Sharma sangeet ·<br>Leela Palace, Udaipur', 'Sharma sangeet · 2 cameras']
        .map(s => el('div', { cls: 's16-fact', html: s }, qb));

      // --- layer 3: Quorum quick capture ---
      const cap = R.cap = el('div', { cls: 's16-layer s16-q' }, screen);
      qhead(cap);
      const cb = el('div', { cls: 's16-qb', style: 'padding-top:22px' }, cap);
      el('div', { cls: 's16-h', text: 'Quick note', style: 'text-align:center;margin:0' }, cb);
      el('div', { cls: 's16-k', text: 'Say it. Quorum keeps it.', style: 'text-align:center;margin-top:4px' }, cb);
      R.mic = el('div', { cls: 's16-mic', html: SVG_MIC }, cb);
      R.mrings = [el('div', { cls: 's16-mring' }, R.mic), el('div', { cls: 's16-mring' }, R.mic)];
      el('div', { cls: 's16-mlabel', text: 'Note this' }, cb);
      R.mstat = el('div', { cls: 's16-mstat' }, cb);
      const wave = el('div', { cls: 's16-wave' }, cb);
      R.bars = [];
      for (let i = 0; i < 30; i++) {
        const env = Math.sin(Math.PI * (i + .5) / 30) * .7 + .3;
        R.bars.push({ e: el('i', {}, wave), h: 8 + 66 * env * (.35 + .65 * rand(i, 161)) });
      }
      R.tcard = el('div', { cls: 's16-tcard' }, cb);
      el('div', { cls: 's16-k', text: 'Transcript' }, R.tcard);
      const tx = el('div', { cls: 's16-tx' }, R.tcard);
      R.words = 'Call with Rohit: teaser cut by Friday'.split(' ').map(w => el('span', { text: w }, tx));

      // ---- measure (phone in its settled pose, every layer visible, nothing transformed) ----
      phone.style.transform = `rotate(${PROT}deg)`;
      P2.dots = centreOf(R.dots); P2.more = centreOf(R.miMore); P2.export = centreOf(R.miExport);
      P2.nomedia = centreOf(R.rowNo); P2.quorum = centreOf(R.qApp); P2.mic = centreOf(R.mic);
      P2.facts = R.facts.map(centreOf); P2.tcard = centreOf(R.tcard);
      P2.edgeTop = centreOf(R.dots);   // for the label arrow (top-right of the phone)

      /* ================= step 1: label ================= */
      L.add(handText(root, 'where clients actually talk', 712, 150, { color: 'blue', size: 42, weight: 600, t0: 202.9, dur: .8, rot: -2 }));
      L.add(markerArrow(root, [748, 176], [676, 262], { color: 'blue', width: 4.5, head: 16, bend: -.28, t0: 203.6 }));

      /* ================= step 4: the laptop (drawn before the stickies, so they sit on top) ================= */
      const LX0 = 1240, LX1 = 1700, LY0 = 655, LY1 = 935;
      L.add(strokeSeq(root, [
        `M${LX0 + 22} ${LY0} L ${LX1 - 22} ${LY0} Q ${LX1} ${LY0}, ${LX1} ${LY0 + 22} L ${LX1} ${LY1 - 6} L ${LX0} ${LY1 - 6} L ${LX0} ${LY0 + 22} Q ${LX0} ${LY0}, ${LX0 + 22} ${LY0}`,
        `M${LX0 - 30} ${LY1 + 2} L ${LX1 + 30} ${LY1 + 2} L ${LX1 + 88} ${LY1 + 50} L ${LX0 - 88} ${LY1 + 50} Z`,
        `M${(LX0 + LX1) / 2 - 60} ${LY1 + 34} L ${(LX0 + LX1) / 2 + 60} ${LY1 + 34}`,
      ], { color: 'ink', width: 5, t0: T_LAPTOP, durEach: .38, gap: .04, dry: false }));
      R.lscreen = el('div', { cls: 's16-lscreen', style: `left:${LX0 + 14}px;top:${LY0 + 14}px;width:${LX1 - LX0 - 28}px;height:${LY1 - LY0 - 34}px` }, root);
      R.lscreen.innerHTML = `<div style="height:62px;display:flex;align-items:center;gap:14px;padding:0 20px;border-bottom:2px solid #e3e5ea;background:#fbfaf6">
          <div class="s16-qlogo" style="width:44px;height:44px;font-size:30px">Q</div><div class="s16-qword" style="font-size:32px">Quorum</div></div>
        <div style="padding:16px 22px">
          <div style="font-size:23px;color:#656b7a">WhatsApp Chat with Rohit Sharma.zip</div>
          <div class="s16-bar" style="margin-top:12px"><div class="s16-fill" data-lfill></div></div>
          <div class="s16-found" data-lfound style="margin-top:16px;font-size:34px"><span class="s16-ok">✓</span>3 facts found</div>
        </div>`;
      R.lfill = R.lscreen.querySelector('[data-lfill]'); R.lfound = R.lscreen.querySelector('[data-lfound]');
      // the zip file card
      const ZC = { x: 900, y: 800 };
      R.zip = el('div', { cls: 's16-zip', style: `left:${ZC.x - 195}px;top:${ZC.y - 58}px`, html: `${zipIcon(58, 72)}<div><div style="font-size:23px;color:#656b7a">WhatsApp Chat with</div><div style="font-size:30px;font-weight:700;margin-top:2px">Rohit Sharma.zip</div></div>` }, root);
      const GRAB = { x: 46, y: 24 };                 // cursor tip relative to the card centre
      const DROPC = { x: (LX0 + LX1) / 2, y: (LY0 + LY1) / 2 - 4 };
      L.add({
        render(t) {
          const e = R.zip;
          if (t < T_ZIP || t >= T_DROP + .32) { e.style.display = 'none'; return; }
          e.style.display = '';
          let cx = ZC.x, cy = ZC.y, s = 1, r = -2, o = 1, lift = 0;
          if (t < T_GRAB) { const k = spring(P(t, T_ZIP, .45), 6.5, 1.5); s = lerp(.7, 1, k); o = Math.min(1, P(t, T_ZIP, .1)); }
          else if (t < T_DROP) {
            const st = Cursor.state(t);
            if (st) { const w = CAM.toWorld(st.x, st.y); cx = w.x - SX - GRAB.x; cy = w.y - SY - GRAB.y; }
            lift = easeOutCubic(P(t, T_GRAB, .15)); s = 1 + .05 * lift; r = -2 + 3 * lift;
          } else {
            const k = easeInCubic(P(t, T_DROP, .3)); cx = lerp(DROPC.x, DROPC.x, k); cy = DROPC.y; s = lerp(1.05, .35, k); o = 1 - k; r = 1;
          }
          xf(e, { x: cx - ZC.x, y: cy - ZC.y, s, r, o });
          e.style.boxShadow = `0 ${10 + lift * 22}px ${18 + lift * 24}px -8px rgba(20,23,31,${(.3 - lift * .06).toFixed(3)}),0 2px 3px rgba(20,23,31,.08)`;
        },
      });

      /* ================= step 3: three stickies fly out of the phone ================= */
      const meta = (src, d) => `<span style="font-size:22px"><span style="white-space:nowrap">${src}</span><br>${d}</span>`;
      const SPOTS = [
        { x: 968, y: 365, rot: -3, html: 'Sharma<br>wedding edit ·<br>due <b style="font-weight:700">18 Oct</b>', meta: meta('WhatsApp · Rohit Sharma', '3 Oct') },
        { x: 1308, y: 350, rot: 2, html: 'Sharma sangeet<br>· Leela Palace,<br>Udaipur', meta: meta('WhatsApp · Rohit Sharma', '28 Sep') },
        { x: 1648, y: 368, rot: -2, html: 'Sharma sangeet<br>· <b style="font-weight:700">2 cameras</b>', meta: meta('WhatsApp · Rohit Sharma', '28 Sep') },
      ];
      const facts = SPOTS.map((p, i) => {
        const api = sticky(root, { x: p.x, y: p.y, w: 330, color: 'yellow', rot: p.rot, size: 34, t0: T_FACT[i], html: p.html, meta: p.meta });
        L.add(flyer(api, p.x, p.y, P2.facts[i], T_FACT[i]));
        return api;
      });
      // every fact keeps its source: blue underlines under each source line, then the note
      facts.forEach((api, i) => {
        const r = K.tight(wordRect(root, api, 'WhatsApp · Rohit Sharma'));
        if (!r) return;
        // follow the sticky's tilt (the range rect is axis-aligned): baseline from the left end to the right end
        const sl = Math.tan(SPOTS[i].rot * Math.PI / 180) * r.w, cy = r.y + r.h / 2 + 15, x1 = r.x - 2, x2 = r.x + r.w + 4;
        L.add(markerPath(root, `M${x1} ${(cy - sl / 2 + 1).toFixed(1)} C ${lerp(x1, x2, .3).toFixed(1)} ${(cy - sl * .2 - 2).toFixed(1)}, ${lerp(x1, x2, .7).toFixed(1)} ${(cy + sl * .2 + 2).toFixed(1)}, ${x2} ${(cy + sl / 2 - 1).toFixed(1)}`,
          { color: 'blue', width: 4.5, t0: 213.65 + i * .17, dur: .28 }));
      });
      L.add(handText(root, 'every fact keeps its source', 1308, 592, { color: 'blue', size: 42, weight: 700, t0: 214.25, dur: .6, rot: -1.5, align: 'center' }));

      /* ================= step 4 note ================= */
      L.add(handText(root, 'same file, drag it in on the laptop', 1470, 1040, { color: 'blue', size: 38, weight: 600, t0: 218.75, dur: .9, rot: -1.5, align: 'center' }));

      /* ================= step 5: the voice note sticky ================= */
      const VS = { x: 905, y: 800 };
      const voice = sticky(root, { x: VS.x, y: VS.y, w: 300, color: 'yellow', rot: 3, size: 33, t0: T_VOICE, html: 'Call with Rohit: teaser cut by <b style="font-weight:700">Friday</b>', meta: '<span style="font-size:23px">voice note · on the phone</span>' });
      L.add(flyer(voice, VS.x, VS.y, P2.tcard, T_VOICE, { s0: .9, fly: .55, arc: 50 }));
      // beside the phone, pointing at it
      const tap = L.add(handText(root, '', 108, 704, { html: 'one tap<br>from<br>anywhere', color: 'blue', size: 40, weight: 700, t0: 224.45, dur: .8, rot: -4, align: 'center' }));
      tap.el.style.textAlign = 'center';
      L.add(markerArrow(root, [168, 636], [214, 548], { color: 'blue', width: 4.5, head: 15, bend: -.3, t0: 225.25 }));

      /* ================= cursor ================= */
      Cursor.plan([
        { t: 204.2, enter: 'right' },
        { t: T_DOTS, click: W2(P2.dots) },
        { t: T_MORE, click: W2(P2.more) },
        { t: T_EXPORT, click: W2(P2.export) },
        { t: T_NOMEDIA, click: W2({ x: P2.nomedia.x - 40, y: P2.nomedia.y }) },
        { t: T_QUORUM, click: W2({ x: P2.quorum.x + 16, y: P2.quorum.y + 20 }) },
        { t: 208.9, at: W2({ x: P2.quorum.x + 110, y: P2.quorum.y + 70 }) },   // step off the icon for the hold
        { t: 210.2, exit: 'right' },
        { t: 215.9, enter: 'right' },
        { t: T_GRAB, click: W2({ x: ZC.x + GRAB.x, y: ZC.y + GRAB.y }) },
        { t: T_DROP, click: W2({ x: DROPC.x + GRAB.x, y: DROPC.y + GRAB.y }) },
        { t: 219.7, exit: 'right' },
        { t: 220.05, enter: 'right' },
        { t: T_MIC, click: W2(P2.mic) },
        { t: 222.3, exit: 'right' },
      ]);

      // reset to the pre-entrance state (render() owns everything from here on)
      phone.style.display = 'none';
    },

    render(t) {
      /* ---- phone slap (contact 201.0) ---- */
      const ph = R.phone, a = 201.0 - .14;
      if (t < a) ph.style.display = 'none';
      else {
        ph.style.display = '';
        const kin = easeInCubic(P(t, a, .14)), ks = P(t, 201.0, .6);
        const s = t < 201.0 ? lerp(1.12, 1, kin) : 1 - .025 * Math.sin(ks * Math.PI) * (1 - ks);
        const r = PROT + (t < 201.0 ? lerp(6, 0, kin) : 0), lift = t < 201.0 ? 1 - kin : 0;
        xf(ph, { y: -40 * lift, s, r, o: Math.min(1, P(t, a, .06)) });
        ph.style.boxShadow = `0 ${(26 + lift * 34).toFixed(1)}px ${(44 + lift * 40).toFixed(1)}px -18px rgba(20,23,31,${(.42 - lift * .1).toFixed(3)}),0 3px 6px rgba(20,23,31,.12)`;
      }

      /* ---- layer 1: chat ---- */
      const chatOn = t < T_QOPEN + .4;
      vis(R.chat, chatOn);
      if (chatOn) {
        [201.35, 201.4, 201.85, 201.9, 202.4].forEach((ti, i) => show(R.msgs[i], t, ti, .35, { dy: 18 }));
        R.dots.style.background = t >= T_DOTS && t < T_DOTS + .5 ? 'rgba(255,255,255,.22)' : 'transparent';
        // menu, submenu
        const km = span(R.menu, t, T_DOTS + .1, T_MORE + .1, { s: .85 });
        R.miMore.classList.toggle('hl', t >= T_MORE - .02);
        span(R.sub, t, T_MORE + .1, T_EXPORT + .1, { s: .85 });
        R.miExport.classList.toggle('hl', t >= T_EXPORT - .02);
        // scrim from the export sheet on
        const ks = t >= T_EXPORT + .1 ? easeOutCubic(P(t, T_EXPORT + .1, .25)) : 0;
        R.scrim.style.display = ks > 0 ? '' : 'none'; R.scrim.style.opacity = ks.toFixed(3);
        // export sheet slides up, then gives way to the share sheet
        const sheet = (e, t0, t1) => {
          if (t < t0 || (t1 != null && t >= t1)) { e.style.display = 'none'; return; }
          e.style.display = '';
          const k = easeOutCubic(P(t, t0, .3));
          e.style.transform = `translateY(${((1 - k) * 420).toFixed(1)}px)`;
        };
        sheet(R.exp, T_EXPORT + .1, T_NOMEDIA + .1);
        R.rowNo.classList.toggle('hl', t >= T_NOMEDIA - .02);
        sheet(R.share, T_NOMEDIA + .1, null);
        // Quorum pressed
        const pr = t >= T_QUORUM && t < T_QUORUM + .1 ? .9 : t >= T_QUORUM + .1 ? lerp(.9, 1, easeOutBack(P(t, T_QUORUM + .1, .2))) : 1;
        R.qApp.style.transform = `scale(${pr.toFixed(4)})`;
        R.qRing.style.display = t >= T_QUORUM ? '' : 'none';
        void km;
      }

      /* ---- layer 2: Quorum import ---- */
      const impOn = t >= T_QOPEN && t < T_CAP + .4;
      vis(R.imp, impOn);
      if (impOn) {
        const k = easeOutCubic(P(t, T_QOPEN, .35));
        R.imp.style.transform = `translateX(${((1 - k) * 398).toFixed(1)}px)`;
        R.fill.style.transform = `scaleX(${easeInOutSine(P(t, T_READ0, T_READ1 - T_READ0)).toFixed(4)})`;
        pop(R.found, t, T_FOUND, .45, .7);
        R.facts.forEach((e, i) => show(e, t, T_FOUND + .12 + i * .1, .35, { dy: 14 }));
      }

      /* ---- layer 3: quick capture ---- */
      const capOn = t >= T_CAP;
      vis(R.cap, capOn);
      if (capOn) {
        const k = easeOutCubic(P(t, T_CAP, .35));
        R.cap.style.transform = `translateX(${((1 - k) * 398).toFixed(1)}px)`;
        // mic press
        const pr = t >= T_MIC && t < T_MIC + .1 ? .93 : t >= T_MIC + .1 ? lerp(.93, 1, easeOutBack(P(t, T_MIC + .1, .2))) : 1;
        R.mic.style.transform = `scale(${pr.toFixed(4)})`;
        // listening rings: only while recording, then gone (nothing loops during a hold)
        const rec = t >= T_REC0 && t < T_REC1;
        R.mrings.forEach((e, i) => {
          if (!rec) { e.style.display = 'none'; return; }
          const ph2 = ((t - T_REC0) * 1.25 + i * .5) % 1, fade = 1 - P(t, T_REC1 - .25, .25);
          e.style.display = '';
          e.style.transform = `scale(${(1 + .42 * ph2).toFixed(4)})`;
          e.style.opacity = ((1 - ph2) * .55 * fade * Math.min(1, (t - T_REC0) * 6)).toFixed(3);
        });
        const stat = t < T_REC0 ? '' : t < T_REC1 ? 'Listening…' : t < T_SAVED ? 'Got it' : 'Saved · on this phone ✓';
        setText(R.mstat, stat);
        R.mstat.style.color = t >= T_SAVED ? COL.green : COL.ink3;
        // waveform draws left to right while listening, then holds
        R.bars.forEach((b, i) => {
          const tb = T_REC0 + .05 + i * ((T_REC1 - T_REC0 - .3) / R.bars.length);
          const kb = easeOutCubic(P(t, tb, .14));
          b.e.style.height = `${(6 + (b.h - 6) * kb).toFixed(1)}px`;
          b.e.style.opacity = t < tb ? .18 : 1;
        });
        // transcript words come in while listening
        R.words.forEach((w, i) => { const tw = T_REC0 + .45 + i * .16; w.style.opacity = t >= tw ? 1 : 0; w.style.transform = t >= tw ? `translateY(${((1 - easeOutCubic(P(t, tw, .15))) * 8).toFixed(1)}px)` : 'none'; });
        // the transcript card lifts and leaves as the sticky (flight starts 0.55 s before contact)
        const lf = T_VOICE - .55;
        if (t < T_REC0 + .35) { R.tcard.style.opacity = 0; R.tcard.style.transform = 'none'; }
        else if (t < lf - .15) { R.tcard.style.opacity = Math.min(1, P(t, T_REC0 + .35, .15)).toFixed(3); R.tcard.style.transform = 'none'; }
        else { const kk = P(t, lf - .15, .15); R.tcard.style.opacity = t >= lf ? 0 : 1; R.tcard.style.transform = `scale(${(1 + .05 * kk).toFixed(4)})`; }
      }

      /* ---- laptop screen ---- */
      const lsOn = t >= T_DROP + .05;
      vis(R.lscreen, lsOn);
      if (lsOn) {
        R.lscreen.style.opacity = Math.min(1, P(t, T_DROP + .05, .15)).toFixed(3);
        R.lfill.style.transform = `scaleX(${easeInOutSine(P(t, T_DROP + .2, .5)).toFixed(4)})`;
        pop(R.lfound, t, T_DROP + .75, .45, .7);
      }

      L.render(t);
    },
  });

  /* ---- live-show player: stop points (t = where each step ends and holds) and sound cues ---- */
  window.SHOW_STOPS = window.SHOW_STOPS || {};
  window.SHOW_STOPS.S16 = [
    { t: 204.0, title: 'Client chat on WhatsApp', say: "This is the phone app we're building. Most of a small team's client info lives on phones, and our clients talk on WhatsApp: the venue, the cameras, the new deadline." },
    { t: 209.0, title: 'One share into Quorum', say: 'Getting it in is one share: Export chat, without media, and pick Quorum in the share sheet.' },
    { t: 215.0, title: 'Facts, each with its source', say: 'Quorum reads the chat on the phone itself and pulls out the facts. Every fact keeps where it came from: WhatsApp, Rohit, the date.' },
    { t: 220.0, title: 'Same file on the laptop', say: 'No phone app at hand? The same export file drags straight into Quorum on the laptop.' },
    { t: 226.0, title: 'Quick capture', say: "And for a call that never touches chat: tap Note this, say it, and it's a note with its source. One tap from anywhere." },
  ];
  window.SHOW_SFX = window.SHOW_SFX || {};
  window.SHOW_SFX.S16 = [
    // 1 · the phone and the chat
    [201.0, 'sticky_slap'], [201.4, 'ui_pop'], [201.9, 'ui_pop'], [202.4, 'ui_pop'], [202.9, 'marker_squeak'], [203.6, 'marker_squeak'],
    // 2 · the share flow
    [204.1, 'paper_whoosh'],
    [T_DOTS, 'click_down'], [T_DOTS + .1, 'click_up'], [T_DOTS + .12, 'ui_pop'],
    [T_MORE, 'click_down'], [T_MORE + .1, 'click_up'], [T_MORE + .12, 'ui_pop'],
    [T_EXPORT, 'click_down'], [T_EXPORT + .1, 'click_up'], [T_EXPORT + .12, 'ui_pop'],
    [T_NOMEDIA, 'click_down'], [T_NOMEDIA + .1, 'click_up'], [T_NOMEDIA + .12, 'paper_whoosh'],
    [T_QUORUM, 'click_down'], [T_QUORUM + .1, 'click_up'],
    // 3 · Quorum reads the chat; three facts
    [T_QOPEN, 'sync_whoosh'], [209.6, 'counter_tick'], [210.0, 'counter_tick'], [210.4, 'counter_tick'], [210.8, 'counter_tick'],
    [T_FOUND, 'resolve_chime'],
    [T_FACT[0], 'sticky_slap'], [T_FACT[1], 'sticky_slap'], [T_FACT[2], 'sticky_slap'],
    [213.65, 'marker_squeak'], [213.82, 'marker_squeak'], [213.99, 'marker_squeak'], [214.25, 'marker_squeak'],
    // 4 · the laptop
    [T_LAPTOP, 'marker_squeak'], [T_LAPTOP + .42, 'marker_squeak'], [T_ZIP, 'ui_pop'],
    [T_GRAB, 'click_down'], [T_DROP, 'click_up'], [T_DROP + .05, 'sync_whoosh'], [T_DROP + .75, 'ui_pop'], [218.75, 'marker_squeak'],
    // 5 · quick capture
    [T_CAP, 'paper_whoosh'], [T_MIC, 'click_down'], [T_MIC + .1, 'click_up'], [T_REC0, 'toggle_clack'], [T_REC1, 'toggle_clack'],
    [T_VOICE - .55, 'paper_whoosh'], [T_VOICE, 'sticky_slap'], [T_SAVED, 'ui_pop'], [224.45, 'marker_squeak'], [225.25, 'marker_squeak'],
  ].map(([t, type]) => [+t.toFixed(2), type]);
})();
