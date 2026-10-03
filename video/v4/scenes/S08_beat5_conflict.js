/* S08 · Beat 5 (HERO): reconnect, both laptops catch the conflict (72-90 s).
 * Re-establish wide, push onto Tanishk's switch, hold a beat; click on (ct 52.0 = 75.0) and snap wide.
 * 75.25 his outbox drains, 75.5 his conflict card opens (left border flash), 76.0 HIT: Lakshya's card
 * opens too (shake, punch, red loops around both cards), stopwatch doodles +0.5 s / +1.0 s above the
 * plate. 78.0 big zoom into his cloud: a marker ruler, the 0.82 bar, the needle rolls to 0.85. Then the
 * card text (16 Oct / 18 Oct underlined), both cards: who owns it, who waits, same conflict id. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  const lifts = [];
  let needle = null, needleLbl = null, readout = null, thrTick = null, rul = null, strip = null, stripPop = null;
  const SW = ['L.header', 'LINK.left'];
  const STRIP = { x: 36, y: 468, w: 360, h: 86 };
  const zoomRects = () => ['L.ptNote', 'L.ptEmail', 'L.simTag', { x: REGIONS.STAGE.x + STRIP.x, y: REGIONS.STAGE.y + STRIP.y, w: STRIP.w, h: STRIP.h }];
  const wideUp = (t, z) => ({ ...P_().frame('all', t, { z }), y: REGIONS.STAGE.y + 540 - 58 });

  Scene({
    id: 'S08', start: 72, end: 90, region: 'STAGE',
    camera: [
      [72.45, () => K.SF('all', 72.4, { z: .9 }), 'easeInOutCubic'],
      [73.3, () => K.SF(SW, 74, { pad: 30, zMax: 2.0, capSafe: true }, {top:118}), 'easeInOutCubic'],
      [74.95, () => K.SF(SW, 74, { pad: 30, zMax: 2.0, capSafe: true }, {zk:1.05,dx:14,top:118}), 'easeInOutSine'],
      [75.6, () => K.SF('all', 75.6, { z: .95 }), 'easeOutExpo'],
      [76.3, () => K.SF('all', 76.3, { z: .955 }), 'linear'],
      [77.05, () => wideUp(77, .845), 'easeInOutCubic'],
      [77.95, () => wideUp(78, .85), 'easeInOutSine'],
      [79.5, () => K.SF(zoomRects(), 79.5, { pad: 20, zMax: 2.6, capSafe: true }), 'easeInOutCubic'],
      [82.45, () => K.SF(zoomRects(), 79.5, { pad: 20, zMax: 2.6, capSafe: true }, {zk:1.025}), 'easeInOutSine'],
      [83.15, () => K.SF('L_CARD', 83, { capSafe: true }), 'easeInOutCubic'],
      [84.95, () => K.SF('L_CARD', 83, { capSafe: true }, {zk:1.03}), 'easeInOutSine'],
      [85.8, () => K.SF('BOTH_CARDS', 86, { capSafe: true, pad: 60 }, {top:118}), 'easeInOutCubic'],
      [89.6, () => K.SF('BOTH_CARDS', 86, { capSafe: true, pad: 60 }, {zk:1.03,top:118}), 'easeInOutSine'],
    ],
    shakes: [[75.0, 3, .25], [75.5, 3, .25], [76.0, 10, .4]],
    punches: [[75.5, .018, .3], [76.0, .075, .45]],

    build(root) {
      const p = P_(), OUT = 89.6;
      const r = (n, t) => p.rect(n, t, true);
      Captions.emphasize('catch the same conflict', 'same conflict', 'red');
      Captions.emphasize('Qdrant says', '0.85', 'red');
      Captions.emphasize('Nothing is overwritten', 'overwritten', 'blue');
      Cursor.plan([
        { t: 73.5, enter: 'left' },
        { t: 74.4, at: 'L.switch', plate: p, ax: .42 },
        { t: 74.62, at: 'L.switch', plate: p, ax: .5, ay: .5 },
        { t: 75.0, click: 'L.switch', plate: p, color: 'green', dwell: .2 },
        { t: 76.7, exit: 'left' },
      ]);

      // 75.25 outbox drains; 75.5 / 76.0 the panes flash red; 76.0 hub 19 -> 20
      lifts.push(p.lift('L.outboxNum', 75.25, { scale: 1.5, dur: .5, pad: 4 }));
      lifts.push(p.lift('HUB.totalNum', 76.0, { scale: 1.35, dur: .6, pad: 4 }));
      L.add(K.flashRect(root, r('L.pane', 75.5), { color: 'red', t0: 75.5, hold: .15, dur: .6, width: 5 }));
      L.add(K.flashRect(root, r('R.pane', 76.0), { color: 'red', t0: 76.0, hold: .15, dur: .6, width: 5 }));
      // 76.0 HIT: red loops around both cards at once
      L.add(markerScribble(root, r('L.conflictCard', 76.3), { color: 'red', width: 6, loops: 1.4, pad: 16, dur: .6, t0: 76.0, seed: 3, out: 77.85 }));
      L.add(markerScribble(root, r('R.conflictCard', 76.3), { color: 'red', width: 6, loops: 1.4, pad: 16, dur: .6, t0: 76.0, seed: 9, out: 77.85 }));
      // 76.5-77.5 above the plate: after reconnect, +0.5 s over Tanishk, +1.0 s over Lakshya
      L.add(handText(root, 'after reconnect:', 960, -46, { color: 'ink', size: 46, t0: 76.5, dur: .45, rot: -1.5, align: 'center', out: OUT }));
      L.add(K.stopwatch(root, 300, -74, 22, { t0: 76.95, out: OUT }));
      L.add(handText(root, '+0.5 s', 340, -46, { color: 'red', size: 50, weight: 700, t0: 77.0, dur: .3, rot: -3, out: OUT }));
      L.add(K.stopwatch(root, 1440, -74, 22, { t0: 77.45, out: OUT }));
      L.add(handText(root, '+1.0 s', 1480, -46, { color: 'red', size: 50, weight: 700, t0: 77.5, dur: .3, rot: 2, out: OUT }));

      // 79.5-81.5 the marker ruler on a taped paper strip under the two red points
      strip = el('div', { cls: 'tag paper', style: `left:${STRIP.x}px;top:${STRIP.y}px;width:${STRIP.w}px;height:${STRIP.h}px;padding:0;border-radius:3px;--r:-1deg;box-shadow:0 6px 12px -6px rgba(20,23,31,.4)` }, root);
      el('i', { cls: 'tape', style: 'top:-8px;left:12px;width:44px;height:14px;transform:rotate(-8deg)' }, strip);
      stripPop = K.popper(strip, 79.3, { d: .4, from: .85, r: -1, out: 82.5 });
      const RG = { x0: STRIP.x + 30, x1: STRIP.x + STRIP.w - 30, y: STRIP.y + 46 };
      rul = K.ruler(root, { ...RG, size: 10, width: 2.4, t0: 79.5, dur: .45, ticks: [.7, .8, .9, 1], out: 82.45 });
      const xT = rul.xOf(.82);
      thrTick = markerPath(root, `M${xT} ${RG.y - 15} L ${xT + .5} ${RG.y + 12}`, { color: 'blue', width: 2.6, t0: 80.0, dur: .2, dry: false, out: 82.45 });
      L.add(thrTick);
      L.add(handText(root, '0.82 bar', xT + 4, RG.y + 15.5, { color: 'blue', size: 9.5, weight: 700, rot: -2, t0: 80.1, dur: .25, out: 82.45 }));
      // needle: a red marker stroke that rolls along
      needle = el('div', { style: `left:0;top:${RG.y - 17}px;width:3px;height:30px;border-radius:2px;background:${COL.red};z-index:6` }, root);
      readout = el('div', { cls: 'hand', style: `left:0;top:${RG.y - 34}px;font-size:9px;font-weight:600;color:${COL.red};z-index:6` }, root);
      needleLbl = el('div', { cls: 'hand', text: '0.85', style: `left:0;top:${RG.y - 44}px;font-size:16px;font-weight:800;color:${COL.red};z-index:7;transform-origin:50% 100%` }, root);
      L.add({
        render(t) {
          const on = t >= 80.45 && t < 82.75;
          needle.style.display = readout.style.display = on ? '' : 'none';
          const fo = 1 - easeInOutCubic(P(t, 82.45, .3));
          const v = keyframes(t, [[80.5, .70], [81.25, .85, easeInOutCubic]]) + (t > 81.25 ? .006 * Math.sin(P(t, 81.25, .35) * Math.PI * 2) * (1 - P(t, 81.25, .35)) : 0);
          const x = rul.xOf(v);
          needle.style.transform = `translateX(${(x - 1.5).toFixed(2)}px) rotate(${(Math.sin(t * 40) * (t < 81.25 ? 3 : 0)).toFixed(2)}deg)`;
          needle.style.opacity = (P(t, 80.45, .08) * fo).toFixed(3);
          setText(readout, v.toFixed(2));
          readout.style.transform = `translateX(${(x + 4).toFixed(2)}px)`;
          readout.style.opacity = ((t < 81.25 ? 1 : 1 - P(t, 81.25, .12)) * P(t, 80.45, .08) * fo).toFixed(3);
          // the 0.82 tick flashes red as the needle crosses it
          const cross = pulse(t, 81.0, .12);
          thrTick.el.setAttribute('stroke', cross > .4 ? COL.red : COL.blue);
          const lo = t >= 81.38 && t < 82.75;
          needleLbl.style.display = lo ? '' : 'none';
          if (lo) { const k = spring(P(t, 81.5, .45), 6, 1.6); needleLbl.style.transform = `translate(${(rul.xOf(.85) - 14).toFixed(2)}px,0) scale(${lerp(.4, 1, k).toFixed(3)}) rotate(-3deg)`; needleLbl.style.opacity = (P(t, 81.38, .1) * fo).toFixed(3); }
        },
      });

      // 83.0-84.0 the card text
      const v16 = r('L.cfVal16', 83), v18 = r('L.cfVal18', 83.5), sim = r('L.cfSim', 84);
      L.add(markerUnderline(root, v16.x, v16.x + v16.w, v16.y + v16.h + 3, { color: 'red', width: 3.5, wave: 3, t0: 83.0, dur: .3, out: OUT }));
      L.add(markerUnderline(root, v18.x, v18.x + v18.w, v18.y + v18.h + 3, { color: 'red', width: 3.5, wave: 3, t0: 83.5, dur: .3, out: OUT }));
      L.add(markerCircle(root, sim, { color: 'red', width: 3, pad: 4, t0: 84.0, dur: .35, out: OUT }));

      // 86.0-88.0 both cards: who owns it, who waits, same id
      const own = r('L.cfOwn', 86), wait = r('R.cfWait', 87);
      L.add(K.note(root, { x: own.x + 120, y: own.y - 92, text: 'Tanishk owns this', color: 'blue', size: 27, rot: -3, t0: 86.0, out: OUT }));
      L.add(markerArrow(root, [own.x + 190, own.y - 46], [own.x + 150, own.y - 4], { color: 'blue', width: 3.5, head: 11, bend: .2, t0: 86.35, out: OUT }));
      L.add(K.note(root, { x: 812, y: 700, text: 'Lakshya waits for him', color: 'blue', size: 27, rot: 2, t0: 87.0, out: OUT }));
      L.add(markerArrow(root, [1100, 745], [wait.x - 4, wait.y + 14], { color: 'blue', width: 3.5, head: 11, bend: .2, t0: 87.35, out: OUT }));
      L.add(K.note(root, { x: 960, y: 540, w: 330, align: 'center', text: 'same conflict id on both · worked out apart', color: 'red', size: 24, rot: -2, t0: 88.0, out: OUT }));
      L.add(markerArrow(root, [812, 600], [760, 612], { color: 'red', width: 3.5, head: 11, bend: -.1, t0: 88.45, out: OUT }));
      L.add(markerArrow(root, [1108, 600], [1162, 590], { color: 'red', width: 3.5, head: 11, bend: .1, t0: 88.55, out: OUT }));
    },

    render(t) {
      stripPop.render(t);
      L.render(t);
      rul.render(t);
      for (const l of lifts) l.render(t);
    },
  });
})();
