/* S09 · Beat 6: ask again, "Disputed" (90-98 s). Tanishk asks "When is the Sharma delivery?" (ct 68.5 =
 * 91.5); the answer lands at 92.0 saying Disputed with both sources, 8 ms on the device. Red underline
 * under "Disputed", circles on the email and the note citations. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  let lift = null;

  Scene({
    id: 'S09', start: 90, end: 98, region: 'STAGE',
    camera: [
      [90.8, () => K.SF('L_ASK', 92, { capSafe: true }), 'easeInOutCubic'],
      [97.4, () => K.SF('L_ASK', 92, { capSafe: true }, {zk:1.04,dx:-10}), 'easeInOutSine'],
    ],
    shakes: [[92.0, 2, .25]],

    build(root) {
      const p = P_(), OUT = 97.6, r = (n, t) => p.rect(n, t, true);
      Captions.emphasize("won't guess", 'Disputed', 'red');
      Captions.emphasize('Who said what', 'where', 'blue');
      Cursor.plan([
        { t: 90.5, enter: 'bottom' },
        { t: 91.5, click: 'L.suggestSharma', plate: p, dwell: .2 },
        { t: 92.7, at: 'L.answer', plate: p, ax: .96, ay: .14 },
        { t: 94.6, exit: 'bottom' },
      ]);
      const dt = r('L.disputedTag', 92.5);
      L.add(markerUnderline(root, dt.x - 2, dt.x + dt.w + 2, dt.y + dt.h + 3, { color: 'red', width: 3.5, wave: 3, t0: 92.5, dur: .3, out: OUT }));
      L.add(markerCircle(root, r('L.cite1', 93.5), { color: 'blue', width: 3, pad: 4, t0: 93.5, dur: .4, out: OUT }));
      L.add(markerCircle(root, r('L.cite2', 94.0), { color: 'blue', width: 3, pad: 4, t0: 94.0, dur: .4, out: OUT }));
      const c2 = r('L.cite2', 94.4);
      L.add(handText(root, 'both sources, both dates', c2.x + c2.w + 30, c2.y + 22, { color: 'blue', size: 20, t0: 94.5, dur: .55, rot: -3, out: OUT }));
      lift = p.lift('L.answer', 92.0, { scale: 1.03, dur: .55, pad: 2 });
    },

    render(t) {
      L.render(t);
      lift.render(t);
      HUD.spot(P_().screenRect('L.answer', t, true), win(t, 92.05, 97.0, .35, .6) * .85, { pad: 10, dim: .13 });
    },
  });
})();
