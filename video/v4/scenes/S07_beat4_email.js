/* S07 · Beat 4: the client email lands on Lakshya (62-72 s). Her inbox, the cursor clicks Receive (ct
 * 38.0 = 64.5), the film ramps through the 4.5 s read, the claim lands queued (65.5), pushes (66.0),
 * the hub goes 18 -> 19 (66.5): green tick, "synced to the team". Then back to Tanishk, still cut off:
 * a dotted arrow from the hub is crossed out, "can't see it yet". */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  const lifts = [];
  const HUBR = ['HUB.total', 'R.header', 'R.outbox'], TAN = ['L.header', 'LINK.left', 'HUB.node'];

  Scene({
    id: 'S07', start: 62, end: 72, region: 'STAGE',
    camera: [
      [62.85, () => K.SF(['R.capture'], 63, { pad: 50, zMax: 1.9, capSafe: true, dx: -70 }), 'easeInOutCubic'],
      [65.55, () => K.SF(['R.capture'], 63, { pad: 50, zMax: 1.9, capSafe: true, dx: -70 }, {zk:1.03}), 'easeInOutSine'],
      [66.35, () => K.SF(HUBR, 66.5, { pad: 40, zMax: 1.3, capSafe: true }, {top:118}), 'easeInOutCubic'],
      [68.45, () => K.SF(HUBR, 66.5, { pad: 40, zMax: 1.3, capSafe: true }, {zk:1.03,top:118}), 'easeInOutSine'],
      [69.2, () => K.SF(TAN, 69, { pad: 50, zMax: 1.75, capSafe: true, dy: 40 }, {top:118}), 'easeInOutCubic'],
      [71.6, () => K.SF(TAN, 69, { pad: 50, zMax: 1.75, capSafe: true, dy: 40 }, {zk:1.03,top:118}), 'easeInOutSine'],
    ],
    shakes: [[65.5, 2, .25], [66.5, 2, .25]],

    build(root) {
      const p = P_(), OUT = 71.7;
      Captions.emphasize('the client emails', 'the 16th', 'blue');
      Captions.emphasize('syncs it to the team', 'syncs', 'green');
      Captions.emphasize('see it yet', "can't see", 'red');
      Cursor.plan([
        { t: 63.4, enter: 'right' },
        { t: 64.5, click: 'R.receive', plate: p, dwell: .2 },
        { t: 65.6, exit: 'bottom' },
      ]);
      const inbox = p.rect('R.inbox', 63, true);
      L.add(handText(root, 'client email, just in', 1124, 972, { color: 'blue', size: 22, t0: 63.0, dur: .5, rot: -3, align: 'right', out: OUT }));
      L.add(markerArrow(root, [1090, 934], [inbox.x + 6, inbox.y + 40], { color: 'blue', width: 3.5, head: 12, bend: -.25, t0: 63.3, out: OUT }));
      L.add(K.ffStamp(root, { x: inbox.x + 6, y: inbox.y + inbox.h + 12, text: 'reading · 4.5 s', size: 15, t0: 64.6, t1: 65.45 }));
      const tot = p.rect('HUB.total', 67.5, true);
      L.add(markerTick(root, tot.x + 228, tot.y + tot.h / 2 - 2, 11, { color: 'green', width: 4.5, t0: 67.5, dur: .25, out: OUT }));
      L.add(handText(root, 'synced to the team', 1178, 400, { color: 'green', size: 26, t0: 67.55, dur: .5, rot: -3, out: OUT }));
      L.add(markerArrow(root, [1172, 378], [tot.x + 252, tot.y + 30], { color: 'green', width: 3.5, head: 12, bend: .25, t0: 67.8, out: OUT }));
      // hub -> Tanishk: dotted, crossed out
      const da = L.add(K.dashedArrow(root, [800, 512], [540, 500], { color: 'ink', width: 3.5, bend: .12, n: 9, head: 12, t0: 69.0, out: OUT }));
      L.add(markerCross(root, da.mid[0], da.mid[1], 15, { color: 'red', width: 5, t0: 69.5, durEach: .12, out: OUT }));
      L.add(handText(root, 'can’t see it yet', da.mid[0], da.mid[1] + 62, { color: 'red', size: 24, t0: 69.75, dur: .45, rot: -3, align: 'center', out: OUT }));
      lifts.push(p.lift('R.outboxNum', 65.5, { scale: 1.5, dur: .55, pad: 4 }));
      lifts.push(p.lift('HUB.totalNum', 66.5, { scale: 1.35, dur: .6, pad: 4 }));
    },

    render(t) {
      L.render(t);
      for (const l of lifts) l.render(t);
    },
  });
})();
