/* S05 · Beat 2: Tanishk loses the hub (44-52 s). Whip to Tanishk's header, the cursor flips the hub
 * switch off on the captured click (ct 16.0 = 46.0, red ripple), marker slash over the cut link,
 * "cut off from the hub", circle "0 B/s · frozen"; then he asks anyway and gets 11 ms on the device. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  let lift = null;
  const HDR = ['L.header', 'LINK.left'];

  Scene({
    id: 'S05', start: 44, end: 52, region: 'STAGE',
    camera: [
      [44.5, () => K.SF(HDR, 46, { pad: 30, zMax: 2.1, capSafe: true }, {top:118}), 'easeOutExpo'],
      [48.45, () => K.SF(HDR, 46, { pad: 30, zMax: 2.1, capSafe: true }, {zk:1.03,dx:10,top:118}), 'easeInOutSine'],
      [49.25, () => K.SF('L_ASK', 50, { capSafe: true }), 'easeInOutCubic'],
      [51.95, () => K.SF('L_ASK', 51, { capSafe: true }, {zk:1.03}), 'easeInOutSine'],
    ],
    shakes: [[46.0, 3, .3]],

    build(root) {
      const p = P_(), OUT = 51.7;
      Captions.emphasize('loses the hub', 'No signal', 'red');
      Captions.emphasize('Still remembers', '11 ms', 'blue');
      Cursor.plan([
        { t: 44.6, enter: 'left' },
        { t: 45.75, at: 'L.switch', plate: p, ax: .5 },
        { t: 46.0, click: 'L.switch', plate: p, color: 'red', dwell: .2 },
        { t: 49.5, click: 'L.suggestDue', plate: p },
        { t: 50.8, at: 'L.answer', plate: p, ax: .9, ay: .12 },
      ]);
      const lk = p.rect('LINK.left', 47, true);
      L.add(markerSlash(root, lk.x + 26, lk.y - 26, lk.x + 74, lk.y + 34, { color: 'red', width: 5, t0: 46.5, dur: .28, out: OUT }));
      const rate = p.rect('L.rate', 47, true);
      L.add(handText(root, 'cut off from the hub', rate.x + rate.w + 14, rate.y + 30, { color: 'red', size: 19, t0: 47.0, dur: .5, rot: -3, out: OUT }));
      L.add(markerCircle(root, p.rect('L.rateNum', 47.5, true), { color: 'red', width: 3, pad: 5, t0: 47.5, dur: .4, out: OUT }));
      const took = p.rect('L.answerTook', 50.5, true);
      L.add(markerUnderline(root, took.x, took.x + 33, took.y + took.h + 3, { color: 'blue', width: 3, wave: 2, t0: 50.5, dur: .3, out: OUT }));
      L.add(handText(root, 'no hub, still answers', took.x + 24, took.y + took.h + 34, { color: 'blue', size: 20, t0: 50.75, dur: .45, rot: -3, out: OUT }));
      lift = p.lift('L.answer', 50.0, { scale: 1.035, dur: .55, pad: 2 });
    },

    render(t) {
      L.render(t);
      lift.render(t);
      HUD.spot(P_().screenRect('L.header', t), win(t, 46.15, 48.4, .3, .5) * .8, { pad: 6, dim: .12, radius: 10 });
    },
  });
})();
