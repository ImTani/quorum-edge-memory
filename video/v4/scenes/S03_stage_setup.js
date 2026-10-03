/* S03 · Two laptops, one hub (26-34 s). The STAGE plate lands on the board (tape slap), marker labels
 * name the three columns from above the plate, blue relay doodles over the two links, and the small
 * honesty tag (screen space, bottom-right, 32-41 s): two device processes on one machine, offline is
 * a per-device hub switch. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  let drop = null, honest = null;

  Scene({
    id: 'S03', start: 26, end: 34, region: 'STAGE', always: true,
    camera: [
      [26.0, () => ({ ...P_().frame('all', 26, { z: .8 }), y: REGIONS.STAGE.y + 540 - 72 })],
      [33.9, () => ({ ...P_().frame('all', 34, { z: .83 }), y: REGIONS.STAGE.y + 540 - 64 }), 'easeInOutSine'],
    ],
    shakes: [[26.0, 3, .3]],

    build(root) {
      const p = P_(), r = n => p.rect(n, 26, true);
      drop = K.plateDrop(p.el, 26.0, { from: 1.03 });
      const OUT = 33.6;
      // labels above the plate, arrows down to each column's header
      const lN = r('L.name'), hub = r('HUB.node'), rN = r('R.name');
      L.add(handText(root, 'Tanishk’s laptop · on a shoot', 30, -40, { color: 'blue', size: 36, t0: 27.0, dur: .5, rot: -1.5, out: OUT }));
      L.add(markerArrow(root, [130, -28], [lN.x + 40, lN.y - 6], { color: 'blue', width: 5, t0: 27.35, bend: .2, head: 16, out: OUT }));
      L.add(handText(root, 'the team hub · a Qdrant server', 960, -96, { color: 'blue', size: 36, t0: 28.0, dur: .5, rot: 1, align: 'center', out: OUT }));
      L.add(markerArrow(root, [968, -80], [hub.x + hub.w / 2 + 4, hub.y - 4], { color: 'blue', width: 5, t0: 28.35, bend: -.15, head: 16, out: OUT }));
      L.add(handText(root, 'Lakshya’s laptop · in the office', 1890, -40, { color: 'blue', size: 36, t0: 29.0, dur: .5, rot: 1.5, align: 'right', out: OUT }));
      L.add(markerArrow(root, [1790, -28], [rN.x + rN.w - 50, rN.y - 6], { color: 'blue', width: 5, t0: 29.35, bend: -.2, head: 16, out: OUT }));
      // 30.5: the hub only relays: little two-way doodles over each link
      const ll = r('LINK.left'), lr = r('LINK.right');
      for (const [lk, t0] of [[ll, 31.0], [lr, 31.25]]) {
        const y = lk.y - 22, x0 = lk.x + 10, x1 = lk.x + lk.w - 10;
        L.add(markerArrow(root, [x0, y], [x1, y], { color: 'blue', width: 3.5, head: 9, bend: -.12, t0, out: OUT }));
        L.add(markerArrow(root, [x1, y + 44], [x0, y + 44], { color: 'blue', width: 3.5, head: 9, bend: -.12, t0: t0 + .15, out: OUT }));
      }
      // the honesty tag, screen space (bottom-right corner)
      honest = el('div', { cls: 'tag kraft', style: 'left:0;top:0;width:560px;white-space:normal;font-size:26px;line-height:1.25;padding:12px 18px 14px;transform-origin:100% 100%',
        html: 'Two laptops shown as two device processes on one machine. Offline = a per-device hub switch.' }, document.getElementById('hud'));
    },

    render(t) {
      drop.render(t);
      L.render(t);
      // honesty tag: slaps at 32.0, shrinks to 70% in the corner at 34.0, stays until 41.0
      const on = t >= 31.88 && t < 41.3;
      honest.style.display = on ? '' : 'none';
      if (on) {
        const kin = easeInCubic(P(t, 31.88, .12)), ks = P(t, 32, .45);
        let s = t < 32 ? lerp(1.15, 1, kin) : 1 - .03 * Math.sin(ks * Math.PI) * (1 - ks);
        s *= lerp(1, .7, easeInOutCubic(P(t, 34.0, .6)));
        const ox = 1920 - 40 - 560, oy = 1080 - 40 - honest.offsetHeight;
        honest.style.transform = `translate(${ox}px,${oy}px) scale(${s.toFixed(4)}) rotate(${(t < 32 ? lerp(-6, -1.5, kin) : -1.5).toFixed(2)}deg)`;
        honest.style.opacity = (Math.min(1, P(t, 31.88, .06)) * (1 - easeInOutCubic(P(t, 41.0, .3)))).toFixed(3);
      }
    },
  });
})();
