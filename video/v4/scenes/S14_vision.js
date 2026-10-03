/* S14 · Where it is going: a private assistant (138-154 s). Deck slides 6 and 7 as stills pinned to the
 * board (DECK_ASSIST in the ASSIST cell, DECK_DAY in the DAY cell, both shown without their stickies):
 * the inputs get ticked, the camera pushes to "your laptop · Quorum", the four example stickies slap in
 * from the full still, then the day timeline: each stop circles and its sticky slaps. Captioned as the
 * direction, not the demo. */
(function () {
  const K = KIT, L = K.list();
  let pa = null, pd = null, dropA = null;
  const REG = { x: REGIONS.DAY.x, y: REGIONS.DAY.y, w: 1920, h: 2160 };
  const PW = 1728, PSC = PW / 1920, BAR = 34 * PSC, PH = 1080 * PSC;
  const PX = (1920 - PW) / 2, PY = (1080 - PH - BAR) / 2 + BAR;
  const whole = (cell, z, dx = 0) => ({ x: REGIONS[cell].x + 960 + dx, y: REGIONS[cell].y + PY - BAR + (PH + BAR) / 2, z, r: 0 });

  Scene({
    id: 'S14', start: 138, end: 154, region: REG,
    camera: [
      [138.6, whole('ASSIST', 1.0), 'easeInOutCubic'],
      [139.45, () => pa.frame(['inp.0', 'inp.4', 'laptop'], 139, { pad: 50, zMax: 1.45 }), 'easeInOutCubic'],
      [141.75, () => { const c = pa.frame(['inp.0', 'inp.4', 'laptop'], 139, { pad: 50, zMax: 1.45 }); return { ...c, z: c.z * 1.03 }; }, 'easeInOutSine'],
      [142.65, () => pa.frame(['laptop'], 142, { pad: 50, zMax: 1.6 }), 'easeInOutCubic'],
      [143.2, () => { const c = pa.frame(['laptop'], 142, { pad: 50, zMax: 1.6 }); return { ...c, x: c.x + 30 }; }, 'easeInOutSine'],
      [145.85, () => pa.frame(['stk.0', 'stk.1', 'stk.2', 'stk.3'], 145, { pad: 50, zMax: 1.45, capSafe: true }), 'easeInOutSine'],
      [146.95, () => pd.frame(['mk.0', 'stk.0', 'stk.4', 'stk.3'], 148, { pad: 50, zMax: 1.25, capSafe: true }), 'easeInOutCubic'],
      [150.6, () => { const c = pd.frame(['mk.0', 'stk.0', 'stk.4', 'stk.3'], 148, { pad: 50, zMax: 1.25, capSafe: true }); return { ...c, z: c.z * 1.025, x: c.x + 20 }; }, 'easeInOutSine'],
      [153.9, () => { const c = pd.frame(['mk.0', 'stk.0', 'stk.4', 'stk.3'], 148, { pad: 50, zMax: 1.25, capSafe: true }); return { ...c, z: c.z * 1.05, x: c.x - 10 }; }, 'easeInOutSine'],
    ],
    shakes: [[138.0, 2, .2], [143.0, 1.5, .2], [143.5, 1.5, .2], [144.0, 1.5, .2], [144.5, 1.5, .2]],

    build(root, S) {
      Captions.emphasize('Where it', 'private assistant', 'blue');
      Captions.emphasize('It knows you', 'nothing leaves', 'blue');
      Captions.emphasize('The direction', 'not the demo', 'red');
      Captions.emphasize('Only team work', 'stays yours', 'blue');
      // slide 7 (DAY cell, top half of the region) and slide 6 (ASSIST cell, bottom half)
      pd = screenFrame({ parent: root, world: REG, clip: 'DECK_DAY', x: PX, y: PY, w: PW, chrome: 'browser', tape: true });
      pa = screenFrame({ parent: root, world: REG, clip: 'DECK_ASSIST', x: PX, y: 1080 + PY, w: PW, chrome: 'browser', tape: true });
      pd.setStill('nostk'); pa.setStill('nostk');
      dropA = K.plateDrop(pa.el, 138.0, { from: 1.03 });
      const ra = pa.meta.rects || {}, rd = pd.meta.rects || {};
      // 139.5-141.5: a blue tick inside each input row
      for (let i = 0; i < 5; i++) {
        const r = ra['inp.' + i]; if (!r) continue;
        L.add(markerTick(pa.overlay, r.x + r.w - 34, r.y + r.h / 2 + 2, 11, { color: 'blue', width: 5, t0: 139.5 + i * .5, dur: .2 }));
      }
      // 143.0-144.5: the four example stickies slap in from the full still
      for (let i = 0; i < 4; i++) { const r = ra['stk.' + i]; if (r) L.add(K.slapCrop(pa.overlay, 'clips/DECK_ASSIST/still.png', r, 143.0 + i * .5)); }
      // 146.5-150.5: each timeline stop circles and its sticky slaps
      for (let i = 0; i < 5; i++) {
        const t0 = 146.5 + i, d = rd['dot.' + i], s = rd['stk.' + i];
        if (d) L.add(markerCircle(pd.overlay, d, { color: 'red', width: 4, pad: 6, t0: t0 - .05, dur: .3 }));
        if (s) L.add(K.slapCrop(pd.overlay, 'clips/DECK_DAY/still.png', s, t0));
      }
      const mk = rd['mk.0'];
      if (mk) L.add(markerUnderline(pd.overlay, mk.x, mk.x + mk.w, mk.y + mk.h + 6, { color: 'blue', width: 5, wave: 4, t0: 151.5, dur: .6 }));
    },

    render(t) {
      pa.render(t); pd.render(t);
      dropA.render(t);
      L.render(t);
    },
  });
})();
