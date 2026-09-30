/* Scene X: <name> (<start>–<end> s). Copy to scenes/X.js. Only edit your own scene file.
 * Timing comes from STORYBOARD.md. Everything must be a pure function of t:
 *  - create DOM ONCE in build(); in render() only SET properties, and set them every frame
 *    (use show()/typeText()/xf(), which always write, instead of `if (t > x) el.style...`).
 *  - no Date.now(), Math.random(), CSS transitions/animations, setTimeout, rAF. Use rand(i, salt).
 */
(function () {
  const START = 0, END = 10;               // <- from the storyboard
  let title, card, lap, net;               // DOM refs created in build()

  Scene({
    id: 'X', start: START, end: END,
    // fadeIn: .5, fadeOut: .5,             // crossfade seconds centred on the boundary
    // drift: .03,                          // root zoom 1.00 -> 1.03 across the scene (0 to disable)
    captions: [[START + 6, END - .2, 'Caption text, ~3 words per second of hold.']],

    build(root) {
      title = el('div', { cls: 'abs hero', style: 'left:0;right:0;top:300px;text-align:center;font-size:140px', text: 'Hello' }, root);
      card = el('div', { cls: 'card', style: 'left:160px;top:520px;width:700px;height:240px;padding:28px' }, root);
      lap = makeLaptop({ parent: root, x: 1000, y: 460, w: 760, h: 420, title: "Tanishk's laptop · on a shoot", status: 'online' });
      net = netGraph({ parent: lap.body, x: 0, y: 0, w: 700, h: 110 });
    },

    render(t, lt, fade) {
      show(title, t, START + .5, .8, { dy: 30 });
      show(card, t, START + 1.2, .7, { dx: -60, dy: 0 });
      show(lap.el, t, START + 1.5, .7, { dy: 40 });
      lap.setStatus(t < START + 3 ? 'online' : 'offline', pulse(t, START + 3, .15));
      net.render(t, { offAt: START + 3, onAt: Infinity });

      // 3D cloud: declare what you want THIS frame (immediate mode, blended across crossfades).
      cloud.set({ opacity: .6, rect: { x: 860, y: 0, w: 1060, h: 1080 } });
      cloud.setCamera({ dist: lerp(4.6, 3.6, easeInOutCubic(P(t, START, END - START))), yaw: .3, pitch: .25 });
      cloud.addKeyPoint('note18', { pos: cloud.KEYS.note18, color: COL.amber, label: '18th · Tanishk · queued', bornAt: START + 4 });
    }
  });
})();
