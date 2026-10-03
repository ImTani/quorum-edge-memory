/* Scene Sxx: <title> (<start>-<end> s). Copy to scenes/Sxx_slug.js and add it to scenes/manifest.js.
 * Timing, captions and camera framings come from STORYBOARD.md / cues.json (captions are drawn by the
 * framework from cues.json: don't add them here). Everything must be a pure function of t:
 *  - create DOM ONCE in build(); in render() call each component's render(t) every frame
 *  - no Date.now(), Math.random(), CSS transitions/animations, setTimeout, rAF (use rand(i, salt))
 */
(function () {
  const START = 0, END = 10;
  let parts = [];                                    // components with render(t)

  Scene({
    id: 'Sxx', start: START, end: END, region: 'COLD',   // REGIONS name or {x,y,w,h} in world px
    // camera keys in WORLD coords: [t, {x, y, z, r?}, ease?]; a function (t) -> cam is evaluated once
    // after every build (e.g. () => STAGE_PLATE.frame('R_ASK', 36)). Keys from all scenes form one track.
    camera: [
      [START, regionCam('COLD', 1.04)],
      [END - 1, regionCam('COLD', 1.0), 'easeInOutSine'],
    ],
    shakes: [[START + 4, 4, .3]],                    // [t0, amp px, dur]
    punches: [],                                     // [t0, zoom amount (.05), dur]

    build(root, S) {
      // root is at the region's top-left (world px). Positions below are region-local.
      parts.push(sticky(root, { x: 560, y: 470, w: 300, color: 'yellow', rot: -4, t0: START + 1.5,
        text: 'Client just called: Sharma delivery moves to the 18th.', meta: 'call · heard by Tanishk' }));
      parts.push(handText(root, 'Tanishk', 380, 250, { color: 'ink', size: 40, t0: START + 3 }));
      parts.push(markerArrow(root, [470, 260], [520, 330], { color: 'ink', t0: START + 3.4 }));
      parts.push(markerCircle(root, { x: 480, y: 440, w: 140, h: 50 }, { color: 'red', t0: START + 8 }));
      // cursor waypoints (screen-space cursor, world/plate targets):
      // world-point targets need the region offset; plate targets use rect names (see FRAMEWORK.md):
      // Cursor.plan([{ t: START + 2, enter: 'right' }, { t: START + 3, click: { x: S.region.x + 560, y: S.region.y + 470 } }, { t: START + 4, exit: 'right' }]);
    },

    render(t, lt, S) {
      for (const p of parts) p.render(t);
    },
  });
})();
