/* S12 · How it works: the architecture flow, deck slide 5 (116-128 s). The deck page (DECK_ARCH capture)
 * is pinned to the board in the ARCH cell; the cursor clicks "Sync and conflict" (ct 2.5 = 118.5) and the
 * real slide lights one part every 0.9 s (118.6 ... 123.1) while the camera follows; then notes on the
 * hub box ("relays only · no logic") and Lakshya's device ("same code, own shard"). */
(function () {
  const K = KIT, L = K.list();
  let plate = null, drop = null;
  const PW = 1728, PSC = PW / 1920, BAR = 34 * PSC, PH = 1080 * PSC;
  const PX = (1920 - PW) / 2, PY = (1080 - PH - BAR) / 2 + BAR + 100;   // 100 px lower: clean board between it and the stage plate above
  const R0 = REGIONS.ARCH;
  const whole = z => ({ x: R0.x + 960, y: R0.y + PY - BAR + (PH + BAR) / 2, z, r: 0 });
  // damped follow of the lit component (and the diagram centre)
  const follow = (name, t, z = 1.35) => { const c = plate.point(name, t); const d = plate.point('diagram', t); return { x: lerp(d.x, c.x, .55), y: lerp(d.y, c.y, .55), z, r: 0 }; };
  const STEPS = [['comp.store', 118.6], ['comp.memory', 119.5], ['comp.hub', 120.4], ['comp.lakshya', 121.3], ['comp.conflicts', 122.2], ['comp.ui', 123.1]];

  Scene({
    id: 'S12', start: 116, end: 128, region: 'ARCH',
    camera: [
      [116.6, whole(1.0), 'easeInOutCubic'],
      [118.15, whole(1.025), 'easeInOutSine'],
      ...STEPS.map(([n, t]) => [t + .4, () => follow(n, t + .4), 'easeInOutSine']),
      [124.2, () => plate.frame(['info', 'comp.hub', 'comp.lakshya'], 124, { pad: 60, zMax: 1.45, capSafe: true }), 'easeInOutCubic'],
      [127.55, () => { const c = plate.frame(['info', 'comp.hub', 'comp.lakshya'], 124, { pad: 60, zMax: 1.45, capSafe: true }); return { ...c, z: c.z * 1.03 }; }, 'easeInOutSine'],
    ],
    shakes: [[116.5, 2, .2]],

    build(root, S) {
      Captions.emphasize('Under the hood', 'full edge node', 'blue');
      Captions.emphasize('Qdrant Edge on the laptop', 'Qdrant server', 'blue');
      Captions.emphasize('Sync is an outbox', 'outbox', 'blue');
      plate = screenFrame({ parent: root, scene: S, clip: 'DECK_ARCH', x: PX, y: PY, w: PW, chrome: 'browser', tape: true });
      drop = K.plateDrop(plate.el, 116.5, { from: 1.03 });
      Cursor.plan([
        { t: 117.5, enter: 'right' },
        { t: 118.5, click: 'flowSync', plate, dwell: .2 },
        { t: 119.7, exit: 'bottom' },
      ]);
      const hub = plate.rect('comp.hub', 124.5, true), lak = plate.rect('comp.lakshya', 126, true);
      L.add(handText(root, 'relays only · no logic', hub.x + 6, hub.y + hub.h + 52, { color: 'blue', size: 32, t0: 124.5, dur: .5, rot: -2.5 }));
      L.add(markerUnderline(root, hub.x + 4, hub.x + 150, hub.y + hub.h + 62, { color: 'blue', width: 4, wave: 3, t0: 125.05, dur: .25 }));
      L.add(handText(root, 'same code, own shard', lak.x + lak.w, lak.y - 22, { color: 'blue', size: 32, t0: 126.0, dur: .5, rot: -2, align: 'right' }));
    },

    render(t) {
      plate.render(t);
      drop.render(t);
      L.render(t);
    },
  });
})();
