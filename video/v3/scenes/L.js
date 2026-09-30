/* Scene L: Honesty, real vs mocked (131–138 s).
 * 131.0 kicker + title · 131.5 both cards whoosh in · 131.8 six "Real" rows stagger (70 ms, green checks draw) ·
 * 132.3 four "Mocked" rows stagger (hollow circles draw), all in by ~132.6 · 133.6 soft green sweep down the checks
 */
(function () {
  const START = 131, END = 138, IN = 131.5, REAL = 131.8, MOCK = 132.3, GAP = .07;
  // Headlines only (no sub-lines): the list has to read in ~4 s.
  const REAL_ITEMS = [
    'Qdrant Edge hybrid search, on-device',
    'Conflict detection + owner resolution',
    'Offline sync + persistent outbox',
    'Tier filters on every search',
    'Gmail + WhatsApp-export ingest',
    'Active-app tracking + hyperfocus nudge',
  ];
  const MOCK_ITEMS = ['Phone app', 'Live WhatsApp stream <span style="color:#6E778C;font-weight:500">(replayed)</span>', 'Screen understanding', 'Voice'];
  const NS = 'http://www.w3.org/2000/svg';
  let eyebrow, title, rule, cards = [], heads = [], rows = [], icons = [], counts = [];

  function svgEl(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  function makeIcon(parent, real) {
    const box = el('div', { style: 'position:relative;flex:none;width:52px;height:52px' }, parent);
    const svg = svgEl('svg', { width: 52, height: 52, viewBox: '0 0 52 52', style: 'position:absolute;left:0;top:0;overflow:visible' }, box);
    const C = 2 * Math.PI * 22;
    if (real) {
      const disc = svgEl('circle', { cx: 26, cy: 26, r: 22, fill: 'rgba(34,197,94,.16)', stroke: '#22C55E', 'stroke-width': 2.5 }, svg);
      const chk = svgEl('path', { d: 'M15.5 26.5 L23 34 L37 19', fill: 'none', stroke: '#22C55E', 'stroke-width': 4.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': 34, 'stroke-dashoffset': 34 }, svg);
      return { box, disc, chk, C, real };
    }
    const disc = svgEl('circle', { cx: 26, cy: 26, r: 22, fill: 'none', stroke: '#8A93A8', 'stroke-width': 2.5, 'stroke-dasharray': C, 'stroke-dashoffset': C, transform: 'rotate(-90 26 26)' }, svg);
    return { box, disc, chk: null, C, real };
  }

  function makeCard(root, x, w, real) {
    const card = el('div', { cls: 'card', style: `left:${x}px;top:262px;width:${w}px;height:650px;padding:30px 40px 26px;display:flex;flex-direction:column;` +
      (real ? 'border-color:rgba(34,197,94,.34);background:rgba(18,26,32,.93)'
        : 'border:2px dashed rgba(138,147,168,.55);background:rgba(18,22,34,.80);box-shadow:0 30px 80px rgba(0,0,0,.45)') }, root);
    const head = el('div', { style: 'display:flex;align-items:center;gap:16px;padding-bottom:22px;border-bottom:1px solid ' + (real ? 'rgba(34,197,94,.22)' : 'rgba(138,147,168,.25)') }, card);
    el('span', { style: `width:14px;height:14px;border-radius:50%;${real ? 'background:#22C55E;box-shadow:0 0 12px #22C55E' : 'border:2.5px solid #8A93A8'}` }, head);
    el('span', { style: `white-space:nowrap;font-size:40px;font-weight:700;color:${real ? '#E8ECF4' : '#C9D0E0'}`, text: real ? 'Real' : 'Mocked for the demo' }, head);
    el('span', { style: 'flex:1' }, head);
    const cnt = el('span', { style: `white-space:nowrap;font-size:22px;font-weight:600;padding:5px 16px;border-radius:999px;${real ? 'color:#22C55E;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.45)' : 'color:#9AA4C0;background:rgba(138,147,168,.08);border:1px dashed rgba(138,147,168,.55)'}`,
      text: real ? 'real in the live demo' : 'shown, not built' }, head);
    const list = el('div', { style: 'flex:1;display:flex;flex-direction:column;justify-content:space-evenly;padding-top:8px' }, card);
    const items = real ? REAL_ITEMS : MOCK_ITEMS;
    const myRows = [], myIcons = [];
    items.forEach(a => {
      const r = el('div', { style: 'display:flex;align-items:center;gap:24px' }, list);
      myIcons.push(makeIcon(r, real));
      el('div', { style: `font-size:37px;font-weight:600;line-height:1.15;white-space:nowrap;color:${real ? '#E8ECF4' : '#B8C0D4'}`, html: a }, r);
      myRows.push(r);
    });
    return { card, head, rows: myRows, icons: myIcons, cnt };
  }

  Scene({
    id: 'L', start: START, end: END,
    fadeIn: .5, fadeOut: .5, drift: .025,

    build(root) {
      eyebrow = el('div', { cls: 'abs', style: 'left:0;right:0;top:92px;text-align:center;font-size:22px;letter-spacing:5px;font-weight:700;color:#7C8CFF', text: 'HONEST DEMO' }, root);
      title = el('div', { cls: 'abs', style: 'left:0;right:0;top:124px;text-align:center;font-size:74px;font-weight:800;letter-spacing:.5px;color:#fff',
        html: 'What\'s <span style="color:#22C55E">real</span>, what\'s <span style="color:#9AA4C0">mocked</span>' }, root);
      rule = el('div', { cls: 'abs', style: 'left:660px;width:600px;top:230px;height:2px;background:linear-gradient(90deg,transparent,rgba(124,140,255,.8),transparent)' }, root);
      const A = makeCard(root, 110, 870, true), B = makeCard(root, 1010, 800, false);
      cards = [A.card, B.card]; heads = [A.head, B.head]; counts = [A.cnt, B.cnt];
      rows = [A.rows, B.rows]; icons = [A.icons, B.icons];
    },

    render(t, lt, fade) {
      cloud.set({ opacity: .17, spin: .03, nebula: .7 });
      cloud.setCamera({ target: [0, 0, 0], dist: 4.6, yaw: .5, pitch: .3, orbit: .02 });

      show(eyebrow, t, START - .1, .7, { dy: 16 });
      show(title, t, START + .05, .8, { dy: 26, blur: 8 });   // headline up by ~131.2, no dim dip
      const rk = E(t, START + .3, 1.0);
      rule.style.opacity = rk * .8; rule.style.transform = `scaleX(${rk})`;

      show(cards[0], t, IN, .8, { dx: -70, dy: 0, blur: 6 });
      show(cards[1], t, IN + .12, .8, { dx: 70, dy: 0, blur: 6 });
      show(heads[0], t, IN + .15, .6, { dy: 12 });
      show(heads[1], t, IN + .27, .6, { dy: 12 });
      pop(counts[0], t, REAL + .45, .7, .7);
      pop(counts[1], t, MOCK + .35, .7, .7);

      // rows + icons
      const starts = [REAL, MOCK];
      const sweepT = 133.6;                                   // verify sweep through the green checks
      for (let c = 0; c < 2; c++) {
        rows[c].forEach((r, i) => {
          const a = starts[c] + i * GAP;
          show(r, t, a, .6, { dx: c ? 34 : -34, dy: 0, blur: 5 });
          const ic = icons[c][i];
          if (ic.real) {
            const k = spring(P(t, a + .05, .7));
            const glow = pulse(t, sweepT + i * .09, .14);
            ic.box.style.transform = `scale(${lerp(.4, 1, k) * (1 + .12 * glow)})`;
            ic.box.style.opacity = clamp(P(t, a, .2));
            ic.chk.setAttribute('stroke-dashoffset', (34 * (1 - easeOutCubic(P(t, a + .18, .35)))).toFixed(2));
            ic.disc.setAttribute('fill', `rgba(34,197,94,${(.16 + .3 * glow).toFixed(3)})`);
            ic.box.style.filter = `drop-shadow(0 0 ${(4 + 16 * glow).toFixed(1)}px rgba(34,197,94,${(.35 + .5 * glow).toFixed(2)}))`;
          } else {
            ic.box.style.opacity = clamp(P(t, a, .2));
            ic.box.style.transform = 'none';
            ic.disc.setAttribute('stroke-dashoffset', (ic.C * (1 - easeInOutCubic(P(t, a + .03, .38)))).toFixed(2));
          }
        });
      }
      // dashed card border "breathes" a touch so the mock side reads as provisional
      cards[1].style.borderColor = `rgba(138,147,168,${(.5 + .08 * Math.sin(t * 2.4)).toFixed(3)})`;
    }
  });
})();
