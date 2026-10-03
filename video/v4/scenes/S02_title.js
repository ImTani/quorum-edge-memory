/* S02 · Quorum: title and promise (16-26 s).
 * The title writes on the patch S01 just erased (the COLD cell); then the camera pans down-right to
 * the landing page pinned in the LANDING cell (LANDING_HERO capture): its headline is the promise.
 * The drawn cursor hovers and clicks "Watch the demo" (video-only click), and the camera dives on to
 * the stage. Region spans COLD..LANDING so both halves share one root. */
(function () {
  const K = KIT, L = K.list();
  let plate = null, drop = null, mark = null, sub = null, word = null, qs = null;
  const REG = { x: REGIONS.COLD.x, y: REGIONS.COLD.y, w: 3840, h: 2160 };
  // landing plate in the LANDING cell (local coords: the cell starts at 1920,1080)
  const PW = 1728, PSC = PW / 1920, BAR = 34 * PSC, PH = 1080 * PSC;
  const PX = 1920 + (1920 - PW) / 2, PY = 1080 + (1080 - PH - BAR) / 2 + BAR;
  const W2 = (x, y) => ({ x: REG.x + x, y: REG.y + y });

  Scene({
    id: 'S02', start: 16, end: 26, region: REG,
    camera: [
      [16.0, regionCam('COLD', 1.0)],
      [18.9, regionCam('COLD', 1.025), 'easeInOutSine'],
      [19.9, () => ({ ...W2(PX + 768, PY - BAR + 320), z: 1.25, r: 0 }), 'easeInOutCubic'],
      [22.4, () => ({ ...W2(PX + 778, PY - BAR + 324), z: 1.275, r: 0 }), 'easeInOutSine'],
      [23.3, () => ({ ...frameRect({ ...W2(PX, PY - BAR), w: PW, h: PH + BAR }, { pad: 0, z: 1.0 }), y: REG.y + PY - BAR + (PH + BAR) / 2 - 70 }), 'easeInOutCubic'],
      [24.9, () => ({ ...frameRect({ ...W2(PX, PY - BAR), w: PW, h: PH + BAR }, { pad: 0, z: 1.02 }), y: REG.y + PY - BAR + (PH + BAR) / 2 - 70 }), 'easeInOutSine'],
    ],
    shakes: [[16.0, 6, .4], [19.5, 2, .2]],
    punches: [[16.0, .05, .45]],

    build(root, S) {
      // ---- title on the cleaned COLD patch ----
      const q = L.add(sticky(root, { x: 610, y: 470, w: 210, h: 210, color: 'yellow', rot: -6, t0: 16.0, size: 150, tape: 1, from: { dx: 0, dy: -80 },
        html: '<div style="font:800 150px/1 \'Schibsted Grotesk\';text-align:center;margin-top:-6px;letter-spacing:-.04em">Q</div>' }));
      qs = q;
      word = el('div', { cls: 'head', text: 'Quorum', style: 'left:760px;top:372px;font-size:170px;line-height:1.1' }, root);
      L.add({ render(t) { const k = P(t, 16.08, .55); word.style.clipPath = k >= 1 ? 'none' : `inset(-10% ${((1 - easeOutCubic(k)) * 100).toFixed(2)}% -10% 0)`; xf(word, { x: (1 - easeOutExpo(k)) * -18, o: k > 0 ? 1 : 0 }); } });
      const ww = word.offsetWidth;
      mark = L.add(markerUnderline(root, 772, 760 + ww - 6, 588, { color: 'blue', width: 9, t0: 17.0, dur: .45, wave: 7 }));
      sub = el('div', { cls: 'ui', text: 'Offline-first team memory on Qdrant Edge', style: `left:0;top:640px;width:1920px;text-align:center;font-weight:600;font-size:44px;color:${COL.ink2}` }, root);
      L.add(K.popper(sub, 17.5, { kind: 'show', d: .6, dy: 16 }));

      // ---- the landing page pinned in the LANDING cell ----
      plate = screenFrame({ parent: root, scene: S, clip: 'LANDING_HERO', x: PX, y: PY, w: PW, chrome: 'browser', tape: true });
      drop = K.plateDrop(plate.el, 19.5, { from: 1.03 });
      // the event tag beside the card
      L.add(K.note(root, { x: PX + 240, y: PY - BAR - 34, text: 'Code Cubicle 6.0 · Problem Statement 03', color: 'blue', size: 25, rot: -3, kind: 'paper', t0: 20.5 }));

      Cursor.plan([
        { t: 23.5, enter: 'right' },
        { t: 24.5, click: 'watchDemo', plate, dwell: .35 },
        { t: 25.35, exit: 'bottom' },
      ]);
    },

    render(t) {
      plate.render(t);
      drop.render(t);
      L.render(t);
    },
  });
})();
