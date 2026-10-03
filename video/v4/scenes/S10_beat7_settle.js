/* S10 · Beat 7: Lakshya asks, the owner settles (98-108 s). Lakshya clicks "Ask Tanishk" (ct 76.5 = 99.5):
 * a draft appears, nothing is sent. Tanishk keeps 18 Oct (ct 81.0 = 104.0, green ripple), 16 Oct stays as
 * superseded history, the decision reaches Lakshya one second later (105.0); green checks on both. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  const lifts = [];

  Scene({
    id: 'S10', start: 98, end: 108, region: 'STAGE',
    camera: [
      [98.8, () => K.SF(['R.conflictCard'], 100, { pad: 40, zMax: 1.3, capSafe: true, dx: -90 }), 'easeInOutCubic'],
      [101.95, () => K.SF(['R.conflictCard'], 100, { pad: 40, zMax: 1.3, capSafe: true, dx: -90 }, {zk:1.03}), 'easeInOutSine'],
      [102.75, () => K.SF('L_CARD', 103, { capSafe: true }), 'easeInOutCubic'],
      [104.95, () => K.SF('L_CARD', 103, { capSafe: true }, {zk:1.03}), 'easeInOutSine'],
      [105.75, () => K.SF('all', 105.7, { z: .95 }), 'easeInOutCubic'],
      [107.6, () => K.SF('all', 107.6, { z: .975 }), 'easeInOutSine'],
    ],
    shakes: [[104.0, 3, .3], [105.0, 2, .25]],

    build(root) {
      const p = P_(), OUT = 107.7, r = (n, t) => p.rect(n, t, true);
      Captions.emphasize('Only the owner decides', 'owner', 'blue');
      Captions.emphasize('keeps the 18th', 'the 18th', 'green');
      Cursor.plan([
        { t: 98.5, enter: 'right' },
        { t: 99.5, click: 'R.askOwner', plate: p, dwell: .2 },
        { t: 104.0, click: 'L.keep18', plate: p, color: 'green', dwell: .7 },
        { t: 105.4, exit: 'bottom' },
      ]);
      const dr = r('R.draft', 100.5);
      L.add(K.note(root, { x: 880, y: dr.y + 6, text: 'drafted · nothing sent', color: 'blue', size: 24, rot: -3, t0: 100.5, out: 102.2 }));
      L.add(markerArrow(root, [1124, dr.y + 44], [dr.x - 6, dr.y + 54], { color: 'blue', width: 3.5, head: 11, bend: -.25, t0: 100.85, out: OUT }));
      // 104.0-104.5: resolved; strike over 16 Oct, "kept for history"
      L.add(K.flashRect(root, r('L.conflictCard', 104.3), { color: 'green', t0: 104.2, hold: .15, dur: .6, width: 4 }));
      const v16 = r('L.cfVal16', 104.5);
      L.add(markerSlash(root, v16.x - 6, v16.y + v16.h * .62, v16.x + v16.w + 8, v16.y + v16.h * .4, { color: 'red', width: 3, opacity: .85, t0: 104.5, dur: .22, out: OUT }));
      L.add(handText(root, 'kept for history', v16.x - 8, v16.y - 82, { color: 'red', size: 22, t0: 104.6, dur: .45, rot: -3, out: OUT }));
      L.add(markerArrow(root, [v16.x + 40, v16.y - 74], [v16.x + 30, v16.y - 8], { color: 'red', width: 3, head: 9, bend: .2, t0: 104.85, out: OUT }));
      // 105.0 Lakshya applies the decision; 105.5 / 106.0 green checks on both panes
      L.add(K.flashRect(root, r('R.conflictCard', 105.3), { color: 'green', t0: 105.0, hold: .15, dur: .6, width: 4 }));
      lifts.push(p.lift('HUB.totalNum', 105.0, { scale: 1.35, dur: .6, pad: 4 }));
      const lc = r('L.conflictCard', 105.5), rc = r('R.conflictCard', 106);
      L.add(markerTick(root, lc.x + lc.w - 34, lc.y + 26, 16, { color: 'green', width: 6, t0: 105.5, dur: .25, out: OUT }));
      L.add(markerTick(root, rc.x + rc.w - 34, rc.y + 26, 16, { color: 'green', width: 6, t0: 106.0, dur: .25, out: OUT }));
    },

    render(t) {
      L.render(t);
      for (const l of lifts) l.render(t);
    },
  });
})();
