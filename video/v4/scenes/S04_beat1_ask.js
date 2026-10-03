/* S04 · Beat 1: Lakshya asks, answered in 9 ms (34-44 s). Push into Lakshya's Ask panel, the cursor
 * clicks the suggestion on the captured click (ct 6.0 = 36.0), the answer lands at 36.5 with a lift,
 * blue marker circles "9 ms, on this device", ticks each citation, then the camera drifts up to her
 * memory cloud and whips to Tanishk at 44. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  let lift = null;

  Scene({
    id: 'S04', start: 34, end: 44, region: 'STAGE',
    camera: [
      [34.9, () => K.SF('R_ASK', 37, { capSafe: true }), 'easeInOutCubic'],
      [39.6, () => K.SF('R_ASK', 39.6, { capSafe: true, dx: -8, dy: -4 }), 'easeInOutSine'],
      [40.9, () => K.SF(['R.answer'], 41.5, { pad: 60, zMax: 1.9, capSafe: true }), 'easeInOutCubic'],
      [43.55, () => K.SF(['R.answer'], 41.5, { pad: 60, zMax: 1.9, capSafe: true }, {zk:1.04,dx:-12}), 'easeInOutSine'],
    ],
    shakes: [[36.0, 2, .25]],

    build(root) {
      const p = P_(), OUT = 43.7;
      Captions.emphasize('Ask anything', '9 ms', 'blue');
      Cursor.plan([
        { t: 35.0, enter: 'right' },
        { t: 36.0, click: 'R.suggestDue', plate: p },
        { t: 37.4, at: 'R.answer', plate: p, ax: .93, ay: .12 },
        { t: 40.4, exit: 'right' },
      ]);
      const took = p.rect('R.answerTook', 37.0, true);
      L.add(markerCircle(root, took, { color: 'blue', width: 3, t0: 37.0, pad: 5, dur: .4, out: OUT }));
      L.add(handText(root, 'on the laptop · no cloud', took.x + 24, took.y + took.h + 34, { color: 'blue', size: 22, t0: 37.5, dur: .5, rot: -3, out: OUT }));
      ['R.cite1', 'R.cite2', 'R.cite3'].forEach((n, i) => {
        const r = p.rect(n, 41.3, true); if (!r) return;
        L.add(markerTick(root, r.x + r.w - 8, r.y - 3, 7, { color: 'blue', width: 3, t0: 41.3 + i * .35, dur: .2, out: OUT }));
      });
      lift = p.lift('R.answer', 36.5, { scale: 1.035, dur: .55, pad: 2 });
    },

    render(t) {
      L.render(t);
      lift.render(t);
      HUD.spot(P_().screenRect('R.answer', t), win(t, 36.55, 43.2, .35, .4) * .9, { pad: 12, dim: .14 });
    },
  });
})();
