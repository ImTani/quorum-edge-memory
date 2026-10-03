/* S01 · Cold open: two people, two dates (0-16 s). Motion graphics on the COLD cell.
 * Two stickies slap in (the call Tanishk took on set, the email Lakshya got in the office), the two
 * dates get circled, scrawl out big, a red "?" drops, "same job", then an eraser wipes the board for
 * the title (S02 writes on the same clean patch). */
(function () {
  const K = KIT, L = K.list();
  let content = null;

  Scene({
    id: 'S01', start: 0, end: 16, region: 'COLD',
    camera: [
      [0, regionCam('COLD', 1.045)],
      [9.0, { ...regionCam('COLD', 1.02), x: REGIONS.COLD.x + 960 + 6 }, 'easeInOutSine'],
      [14.6, regionCam('COLD', 1.0), 'easeInOutSine'],
    ],
    shakes: [[1.5, 2, .25], [4.5, 2, .25], [10.0, 4, .35]],
    punches: [[10.0, .018, .35]],

    build(root, S) {
      content = el('div', { style: 'left:0;top:0;width:0;height:0' }, root);
      const C = content;
      // top-left: signal bars, crossed out, "on a shoot · no signal"
      L.add(strokeSeq(C, ['M190 196 V176', 'M215 196 V162', 'M240 196 V146', 'M265 196 V130'], { color: 'ink', width: 7, t0: .5, durEach: .09, gap: .02, dry: false }));
      L.add(markerSlash(C, 172, 120, 286, 206, { color: 'red', width: 6, t0: .9, dur: .2 }));
      L.add(handText(C, 'on a shoot · no signal', 310, 190, { color: 'ink', size: 44, t0: 1.0, dur: .5, rot: -2 }));
      // top-right: wifi doodle, "in the office · online"
      L.add(strokeSeq(C, ['M1222 168 Q 1262 132, 1302 168', 'M1234 182 Q 1262 156, 1290 182', 'M1258 196 L 1266 196'], { color: 'ink', width: 6, t0: 3.9, durEach: .08, gap: .015, dry: false }));
      L.add(handText(C, 'in the office · online', 1330, 190, { color: 'ink', size: 44, t0: 4.0, dur: .5, rot: 1.5 }));

      const yel = L.add(sticky(C, { x: 540, y: 470, w: 440, color: 'yellow', rot: -4, t0: 1.5, size: 38, from: { dx: -60, dy: -30 },
        html: 'Client just called:<br>Sharma delivery<br>moves to <b style="font-weight:700">the 18th</b>.', meta: 'call · heard by Tanishk' }));
      L.add(handText(C, 'Tanishk', 120, 292, { color: 'ink', size: 46, weight: 700, t0: 3.0, dur: .35, rot: -4 }));
      L.add(markerArrow(C, [200, 310], [300, 372], { color: 'ink', width: 4, t0: 3.3, bend: .25 }));

      const blu = L.add(sticky(C, { x: 1380, y: 470, w: 460, color: 'blue', rot: 4, t0: 4.5, size: 38, from: { dx: 60, dy: -30 },
        html: 'Confirming final<br>delivery of the<br>Sharma wedding edit<br>on <b style="font-weight:700">16 October</b>.', meta: 'email · Rohit Sharma → Lakshya' }));
      L.add(handText(C, 'Lakshya', 1650, 292, { color: 'ink', size: 46, weight: 700, t0: 6.0, dur: .35, rot: 3 }));
      L.add(markerArrow(C, [1700, 310], [1640, 368], { color: 'ink', width: 4, t0: 6.3, bend: -.25 }));

      const r18 = K.tight(wordRect(C, yel, 'the 18th')), r16 = K.tight(wordRect(C, blu, '16 October'));
      L.add(markerCircle(C, r18, { color: 'red', width: 6, t0: 8.0, pad: 11, dur: .4 }));
      L.add(markerCircle(C, r16, { color: 'red', width: 6, t0: 8.5, pad: 11, dur: .4 }));

      // the giant 18 and 16 scrawl out of the circles towards the centre
      const big = (txt, from, to, t0, rot) => {
        const wrap = el('div', { style: 'left:0;top:0;width:0;height:0' }, C);
        const ht = handText(wrap, txt, 0, 0, { color: 'red', size: 230, weight: 700, t0, rot, dur: .45, align: 'center' });
        return { render(t) { const k = easeOutExpo(P(t, t0, .55)); const s = lerp(.22, 1, k); wrap.style.transform = `translate(${lerp(from[0], to[0], k).toFixed(1)}px,${lerp(from[1], to[1], k).toFixed(1)}px) scale(${s.toFixed(3)})`; ht.render(t); } };
      };
      L.add(big('18', [r18.x + r18.w / 2, r18.y + r18.h + 60], [690, 860], 9.0, -6));
      L.add(big('16', [r16.x + r16.w / 2, r16.y + r16.h + 60], [1240, 860], 9.15, 5));
      // red "?" drops between them
      const qw = el('div', { style: 'left:0;top:0;width:0;height:0' }, C);
      const q = handText(qw, '?', 0, 0, { color: 'red', size: 190, weight: 800, t0: 9.95, rot: 4, dur: .12, align: 'center' });
      L.add({ render(t) { const k = P(t, 9.82, .18), b = t >= 10 ? Math.sin(P(t, 10, .3) * Math.PI) * 10 * (1 - P(t, 10, .3)) : 0; qw.style.transform = `translate(965px,${(lerp(580, 845, easeInCubic(k)) - b).toFixed(1)}px)`; q.render(t); } });

      // "same job": a thin line joining the stickies
      L.add(markerPath(C, 'M772 470 C 860 412, 1060 412, 1150 462', { color: 'ink', width: 3.5, t0: 12.0, dur: .45 }));
      L.add(handText(C, 'same job', 960, 418, { color: 'ink', size: 36, t0: 12.25, dur: .35, rot: -2, align: 'center' }));

      L.add(eraser(root, { x: -40, y: -20, w: 2000, h: 1120, t0: 15.0, dur: 1.0, worldX: S.region.x, worldY: S.region.y }));
      K.fixSwath(root, S.region.x, S.region.y, -40, -20);
    },

    render(t) {
      L.render(t);
      // 13.0: everything but the caption dims 15%
      content.style.opacity = (1 - .15 * easeInOutCubic(P(t, 13.0, .5))).toFixed(3);
    },
  });
})();
