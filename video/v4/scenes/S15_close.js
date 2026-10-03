/* S15 · Close (154-168 s). Pull out to the whole scene grid, every region of the film still on it, numbered
 * in order; dive back to the centre, the BKA customer-zero card slaps, an eraser clears the centre (the
 * card slides to bottom-left), LOGO HIT at 160.0, pricing model (no figure) + early access, the repo URL
 * in blue marker, the event line; slow push, fade to clean paper by 168. */
(function () {
  const K = KIT, L = K.list();
  let bka = null, bkaWrap = null;
  const RO = REGIONS.LANDING;
  const CELLS = [['COLD', 'two dates'], ['LANDING', 'the promise'], ['STAGE', 'the demo'], ['ARCH', 'how it works'], ['KEY', 'the key vector'], ['ASSIST', 'the assistant'], ['DAY', 'a day with it']];

  Scene({
    id: 'S15', start: 154, end: 168, region: 'LANDING', margin: 4000,
    camera: [
      [155.3, { x: REGIONS.ALL.x + REGIONS.ALL.w / 2, y: 2300, z: .333, r: 0 }, 'easeInOutCubic'],
      [157.2, { x: REGIONS.ALL.x + REGIONS.ALL.w / 2, y: 2290, z: .343, r: 0 }, 'easeInOutSine'],
      [158.3, regionCam('LANDING', 1.0), 'easeInOutCubic'],
      [165.95, regionCam('LANDING', 1.0), 'linear'],
      [168.0, regionCam('LANDING', 1.03), 'easeInOutSine'],
    ],
    shakes: [[158.5, 3, .25], [160.0, 8, .4]],
    punches: [[160.0, .055, .45]],

    build(root, S) {
      Captions.emphasize('Shared memory', 'signal', 'blue');
      // 155.35-156.55: the film's regions numbered in order, on the whole board
      CELLS.forEach(([c, label], i) => {
        const r = REGIONS[c];
        const off = c === 'COLD' ? [80, 760] : [34, 54];
        L.add(K.note(root, { x: r.x - RO.x + off[0], y: r.y - RO.y + off[1], text: `${i + 1} · ${label}`, color: 'blue', size: 96, rot: -3 + (i % 3), kind: 'paper', t0: 155.35 + i * .2, dur: .3, out: 157.5 + i * .03, outD: .4 }));
      });
      // 159.5 eraser clears the centre
      L.add(eraser(root, { x: -40, y: -40, w: 2000, h: 1160, t0: 159.5, dur: .5, worldX: S.region.x, worldY: S.region.y }));
      K.fixSwath(root, S.region.x, S.region.y, -40, -40);
      // 158.5 BKA card (slides to bottom-left at 159.5)
      bkaWrap = el('div', { style: 'left:0;top:0;width:0;height:0;z-index:60' }, root);
      bka = sticky(bkaWrap, { x: 0, y: 0, w: 660, h: 300, color: 'kraft', rot: -3, t0: 158.5, size: 44, tape: 2,
        html: '<div style="font:700 26px/1.2 \'Schibsted Grotesk\';letter-spacing:.02em;text-transform:uppercase;opacity:.75;margin-bottom:12px">Customer zero</div>BKA, a four-person production house and developer group.' });
      // 160.0 logo
      const logo = el('div', { style: 'left:0;top:0;width:0;height:0;z-index:61' }, root);
      L.add(sticky(logo, { x: 640, y: 420, w: 220, h: 220, color: 'yellow', rot: -6, t0: 160.0, size: 150, tape: 1, from: { dx: 0, dy: -90 },
        html: '<div style="font:800 158px/1 \'Schibsted Grotesk\';text-align:center;margin-top:-8px;letter-spacing:-.04em">Q</div>' }));
      const word = el('div', { cls: 'head', text: 'Quorum', style: 'position:absolute;left:790px;top:318px;font-size:180px;line-height:1.1' }, logo);
      const ww = word.offsetWidth;
      L.add({ render(t) { const k = P(t, 160.0, .4); word.style.clipPath = k >= 1 ? 'none' : `inset(-10% ${((1 - easeOutCubic(k)) * 100).toFixed(2)}% -10% 0)`; xf(word, { s: t < 160 ? 1 : 1 + .05 * (1 - spring(P(t, 160, .5), 6, 1.5)), o: t >= 160 ? 1 : 0 }); } });
      L.add(markerUnderline(logo, 800, 790 + ww - 6, 544, { color: 'blue', width: 9, wave: 7, t0: 160.35, dur: .4 }));
      const price = el('div', { cls: 'ui', html: 'Priced per team, per month <span style="color:#1f4fd8">·</span> early access', style: `position:absolute;left:0;top:600px;width:1920px;text-align:center;font-weight:600;font-size:46px;color:${COL.ink2}` }, logo);
      L.add(K.popper(price, 161.0, { d: .5, from: .8 }));
      L.add(handText(logo, 'github.com/ImTani/quorum-edge-memory', 960, 760, { color: 'blue', size: 56, weight: 600, t0: 162.0, dur: .8, rot: -1.5, align: 'center' }));
      const ev = el('div', { cls: 'ui', text: 'Code Cubicle 6.0 · Problem Statement 03 · built on Qdrant Edge', style: `position:absolute;left:0;top:810px;width:1920px;text-align:center;font-weight:500;font-size:30px;color:${COL.ink3}` }, logo);
      L.add(K.popper(ev, 163.0, { kind: 'show', d: .6, dy: 10 }));
    },

    render(t) {
      L.render(t);
      // BKA card: centre, then slides to the bottom-left corner as the eraser passes
      const k = easeInOutCubic(P(t, 159.5, .55));
      bkaWrap.style.transform = `translate(${lerp(960, 300, k).toFixed(1)}px,${lerp(540, 935, k).toFixed(1)}px) scale(${lerp(1, .5, k).toFixed(4)})`;
      bka.render(t);
      Q.setFade(easeInOutSine(P(t, 167.0, 1.0)));
    },
  });
})();
