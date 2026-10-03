/* S11 · Beat 8: Team view, zero private notes on the hub (108-116 s). Tanishk switches his cloud to Team
 * view (ct 86.5 = 109.5): the private points leave; a kraft tag with a lock pops: only on this laptop.
 * Then the hub's privacy block: "Device-only claims on the hub: 0", circled, counted live from Qdrant. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  const HUBF = ['HUB.total', 'HUB.privacy'];

  Scene({
    id: 'S11', start: 108, end: 116, region: 'STAGE',
    camera: [
      [108.8, () => K.SF(['L.cloud'], 110, { pad: 30, zMax: 1.8, capSafe: true }), 'easeInOutCubic'],
      [110.6, () => K.SF(['L.cloud'], 110, { pad: 30, zMax: 1.8, capSafe: true }, {zk:1.03}), 'easeInOutSine'],
      [111.4, () => K.SF(HUBF, 111.5, { pad: 50, zMax: 2.0, capSafe: true }), 'easeInOutCubic'],
      [115.3, () => K.SF(HUBF, 111.5, { pad: 50, zMax: 2.0, capSafe: true }, {zk:1.05}), 'easeInOutSine'],
    ],
    shakes: [[109.5, 2, .2]],

    build(root) {
      const p = P_(), OUT = 115.4, r = (n, t) => p.rect(n, t, true);
      Captions.emphasize('Private notes', 'never leave', 'blue');
      Captions.emphasize('Counted live', '0', 'blue');
      Cursor.plan([
        { t: 108.4, enter: 'right' },
        { t: 109.5, click: 'L.viewTeam', plate: p, dwell: .2 },
        { t: 110.5, exit: 'right' },
      ]);
      // where the private points were: a kraft tag with a lock
      const tg = el('div', { cls: 'tag kraft', style: 'left:170px;top:330px;font-size:17px;padding:5px 11px 7px;--r:-4deg',
        html: `<svg width="15" height="17" viewBox="-1 -1 22 24" style="vertical-align:-2px;margin-right:6px;overflow:visible"><path d="${K.lockD(0, 2, 20)}" fill="none" stroke="${COL.kraftInk}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>only on this laptop` }, root);
      L.add(K.popper(tg, 110.0, { d: .45, from: .5, r: -4, out: OUT }));
      L.add(markerCircle(root, { x: 244, y: 641, w: 86, h: 22 }, { color: 'blue', width: 3, pad: 4, t0: 110.5, dur: .35, out: OUT }));
      // the hub: device-only claims 0
      const dv = r('HUB.device', 111.5);
      L.add(markerCircle(root, dv, { color: 'blue', width: 4, pad: 7, t0: 111.5, dur: .4, out: OUT }));
      L.add(K.note(root, { x: 1000, y: 254, text: 'counted live from Qdrant', color: 'blue', size: 18, rot: -3, t0: 112.5, out: OUT }));
      L.add(markerArrow(root, [1060, 290], [dv.x + dv.w / 2 + 2, dv.y - 4], { color: 'blue', width: 3, head: 9, bend: .25, t0: 112.85, out: OUT }));
    },

    render(t) {
      L.render(t);
      HUD.spot(P_().screenRect('HUB.privacy', t, true), win(t, 111.45, 115.2, .35, .4) * .75, { pad: 8, dim: .12, radius: 10 });
    },
  });
})();
