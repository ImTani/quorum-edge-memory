/* S13 · The key vector and the 0.82 bar (128-138 s). Motion graphics after deck slide 9: the two stickies,
 * their subjects boxed in blue ("Sharma delivery", "Sharma wedding edit"), the values struck through
 * ("not the value"), key lines, then a marker ruler 0.70-1.00 with the 0.82 bar: an unrelated deadline at
 * 0.74, the pair at 0.85 (same thing), zone above the bar hatched; different value -> conflict. */
(function () {
  const K = KIT, L = K.list();
  let gdot = null, rdot = null;
  const RY = 790, X0 = 360, X1 = 1560, xOf = v => lerp(X0, X1, (v - .70) / .30);

  Scene({
    id: 'S13', start: 128, end: 138, region: 'KEY',
    camera: [
      [128.6, regionCam('KEY', 1.0), 'easeInOutCubic'],
      [137.45, { ...regionCam('KEY', 1.035), y: REGIONS.KEY.y + 530 }, 'easeInOutSine'],
    ],
    shakes: [[128.5, 2, .2], [129.0, 2, .2], [136.5, 3, .25]],

    build(root) {
      Captions.emphasize('The trick', 'about', 'blue');
      Captions.emphasize('Same task', '0.85', 'red');
      Captions.emphasize('different value', 'a conflict', 'red');
      const yel = L.add(sticky(root, { x: 500, y: 320, w: 420, color: 'yellow', rot: -3, t0: 128.5, size: 34, from: { dx: -40, dy: -30 },
        html: 'Client just called:<br>Sharma delivery<br>moves to the 18th.', meta: 'note · Tanishk' }));
      const blu = L.add(sticky(root, { x: 1420, y: 330, w: 420, color: 'blue', rot: 3, t0: 129.0, size: 34, from: { dx: 40, dy: -30 },
        html: 'Confirming final<br>delivery of the<br>Sharma wedding edit<br>on 16 October.', meta: 'email · Rohit Sharma' }));
      const bD = K.tight(wordRect(root, yel, 'Sharma delivery')), bW = K.tight(wordRect(root, blu, 'Sharma wedding edit'));
      L.add(markerPath(root, K.roughRectD(bD, 6, 2), { color: 'blue', width: 4.5, t0: 129.5, dur: .4 }));
      L.add(markerPath(root, K.roughRectD(bW, 6, 5), { color: 'blue', width: 4.5, t0: 130.0, dur: .4 }));
      const s18 = K.tight(wordRect(root, yel, 'the 18th')), s16 = K.tight(wordRect(root, blu, '16 October'));
      L.add(markerSlash(root, s18.x - 4, s18.y + s18.h * .62, s18.x + s18.w + 6, s18.y + s18.h * .5, { color: 'ink3', width: 4, t0: 130.5, dur: .22 }));
      L.add(markerSlash(root, s16.x - 4, s16.y + s16.h * .62, s16.x + s16.w + 6, s16.y + s16.h * .5, { color: 'ink3', width: 4, t0: 130.65, dur: .22 }));
      L.add(handText(root, 'not the value', 960, 300, { color: 'ink3', size: 34, t0: 130.75, dur: .45, rot: -3, align: 'center' }));
      L.add(markerArrow(root, [860, 312], [s18.x + s18.w + 26, s18.y + 4], { color: 'ink3', width: 3, head: 11, bend: .2, t0: 131.0 }));
      L.add(markerArrow(root, [1060, 312], [s16.x - 22, s16.y + 6], { color: 'ink3', width: 3, head: 11, bend: -.2, t0: 131.05 }));
      // key lines
      L.add(handText(root, 'key: Sharma delivery · due date', 500, 612, { color: 'blue', size: 33, t0: 131.0, dur: .45, rot: -1.5, align: 'center' }));
      L.add(handText(root, 'key: Sharma wedding edit · due date', 1420, 622, { color: 'blue', size: 33, t0: 131.5, dur: .45, rot: 1, align: 'center' }));
      // the ruler and the bar
      L.add(K.ruler(root, { x0: X0, x1: X1, y: RY, size: 24, width: 5, t0: 132.0, dur: .5 }));
      const xt = xOf(.82);
      L.add(markerPath(root, `M${xt} ${RY - 34} L ${xt + 1} ${RY + 26}`, { color: 'blue', width: 6, t0: 132.5, dur: .2, dry: false }));
      L.add(handText(root, '0.82 · the bar', xt, RY + 84, { color: 'blue', size: 28, weight: 700, t0: 132.6, dur: .3, rot: -1, align: 'center' }));
      // hatched zone above the bar (134.5)
      const hatch = [];
      for (let x = xt + 18; x < X1 - 4; x += 30) hatch.push(`M${x} ${RY - 8} L ${x + 18} ${RY - 32}`);
      L.add(strokeSeq(root, hatch, { color: 'blue', width: 3, opacity: .45, t0: 134.5, durEach: .022, gap: .004, dry: false }));
      // dots
      gdot = el('div', { style: `left:${xOf(.74) - 15}px;top:${RY - 15}px;width:30px;height:30px;border-radius:50%;background:${COL.ink3};border:3px solid #fff;box-shadow:0 3px 6px rgba(20,23,31,.3);z-index:4` }, root);
      L.add(handText(root, 'an unrelated deadline', xOf(.74), RY - 44, { color: 'ink3', size: 28, t0: 133.15, dur: .45, rot: -2, align: 'center' }));
      rdot = el('div', { style: `left:-17px;top:${RY - 17}px;width:34px;height:34px;border-radius:50%;background:${COL.red};border:3px solid #fff;box-shadow:0 3px 6px rgba(20,23,31,.3);z-index:5` }, root);
      const lbl = el('div', { cls: 'hand', text: '0.85 · same thing', style: `left:${xOf(.85)}px;top:${RY - 92}px;font-size:36px;font-weight:700;color:${COL.red};transform-origin:50% 100%` }, root);
      lbl.style.marginLeft = `${-lbl.offsetWidth / 2}px`;
      L.add(K.popper(lbl, 134.5, { d: .45, from: .4, r: -2 }));
      L.add(handText(root, 'different value → conflict', 1230, 715, { color: 'red', size: 32, t0: 135.5, dur: .5, rot: -3 }));
      L.add(sticky(root, { x: 1680, y: 830, w: 250, h: 170, color: 'yellow', rot: 4, t0: 136.5, size: 34, html: 'Ask the owner.' }));
    },

    render(t) {
      L.render(t);
      // grey dot drops in with a bounce
      const kg = P(t, 132.9, .25);
      gdot.style.display = t >= 132.9 ? '' : 'none';
      const bounce = t < 133.0 ? -60 * (1 - easeInCubic(P(t, 132.9, .1))) : -10 * Math.abs(Math.sin(P(t, 133, .35) * Math.PI)) * (1 - P(t, 133, .35));
      gdot.style.transform = `translateY(${bounce.toFixed(1)}px)`; gdot.style.opacity = Math.min(1, kg * 4);
      // red dot rolls 0.70 -> 0.85 (134.0-134.5), a tiny overshoot
      rdot.style.display = t >= 133.85 ? '' : 'none';
      const v = keyframes(t, [[134.0, .70], [134.5, .85, easeInOutCubic]]) + (t > 134.5 ? .005 * Math.sin(P(t, 134.5, .3) * Math.PI * 2) * (1 - P(t, 134.5, .3)) : 0);
      const x = xOf(v);
      rdot.style.transform = `translateX(${x.toFixed(1)}px) rotate(${((x - X0) * 1.6).toFixed(1)}deg)`;
      rdot.style.opacity = Math.min(1, P(t, 133.85, .1));
    },
  });
})();
