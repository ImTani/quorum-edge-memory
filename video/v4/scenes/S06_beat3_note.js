/* S06 · Beat 3: Tanishk notes the call, offline (52-62 s). Close on his Capture box: click, the capture
 * types the note (ct 23.5-26.0), Save (ct 26.5 = 56.5); the film ramps through the 4.5 s local read in
 * 1.0 s under a fast-forward stamp; the claim lands queued (Outbox 1) at 57.5; arrow input -> amber
 * point, circle Outbox; pan to the hub: still 18, nothing left the laptop. */
(function () {
  const K = KIT, L = K.list();
  const P_ = () => window.STAGE_PLATE;
  let lifts = [];
  const CAPF = ['L.noteInput', 'L.save'];

  Scene({
    id: 'S06', start: 52, end: 62, region: 'STAGE',
    camera: [
      [52.85, () => K.SF(CAPF, 53, { pad: 120, zMax: 2.0, capSafe: true, dx: 40 }), 'easeInOutCubic'],
      [56.95, () => K.SF(CAPF, 56, { pad: 120, zMax: 2.0, capSafe: true, dx: 40 }, {zk:1.04}), 'easeInOutSine'],
      [57.75, () => K.SF(['L.outbox', 'L.noteInput', 'L.ptNote'], 58, { pad: 70, zMax: 1.6, capSafe: true }), 'easeInOutCubic'],
      [58.95, () => K.SF(['L.outbox', 'L.noteInput', 'L.ptNote'], 58, { pad: 70, zMax: 1.6, capSafe: true }, {zk:1.02}), 'easeInOutSine'],
      [59.75, () => K.SF(['HUB.total', 'HUB.privacy', 'HUB.recent1'], 59.5, { pad: 60, zMax: 1.8, capSafe: true, dx: 60 }), 'easeInOutCubic'],
      [61.5, () => K.SF(['HUB.total', 'HUB.privacy', 'HUB.recent1'], 59.5, { pad: 60, zMax: 1.8, capSafe: true, dx: 60 }, {zk:1.03}), 'easeInOutSine'],
    ],
    shakes: [[57.5, 2, .25]],

    build(root) {
      const p = P_(), OUT = 61.7;
      Captions.emphasize('notes the client', 'Offline', 'red');
      Captions.emphasize('Queued, not sent', 'Queued', 'blue');
      Cursor.plan([
        { t: 53.0, click: 'L.noteInput', plate: p, dwell: .1, ax: .3 },
        { t: 56.5, click: 'L.save', plate: p, dwell: .1 },
        { t: 57.7, exit: 'bottom' },
      ]);
      const inp = p.rect('L.noteInput', 56, true);
      L.add(K.ffStamp(root, { x: inp.x + 4, y: inp.y + inp.h + 92, text: 'local model reading · 4.5 s', size: 15, t0: 56.6, t1: 57.45 }));
      const pt = p.rect('L.ptNote', 58, true);
      L.add(markerArrow(root, [inp.x + 120, inp.y - 34], [pt.x - 6, pt.y + pt.h + 10], { color: 'blue', width: 3.5, head: 12, bend: -.18, t0: 58.0, out: OUT }));
      L.add(markerCircle(root, p.rect('L.outbox', 58.5, true), { color: 'blue', width: 3.5, pad: 6, t0: 58.5, dur: .4, out: OUT }));
      const tn = p.rect('HUB.totalNum', 59.5, true);
      L.add(markerUnderline(root, tn.x + 2, tn.x + tn.w, tn.y + tn.h + 2, { color: 'blue', width: 3.5, wave: 2, t0: 59.4, dur: .25, out: OUT }));
      L.add(K.note(root, { x: tn.x + 212, y: tn.y + 2, w: 210, text: 'still 18 · nothing left the laptop', color: 'blue', size: 17, rot: -3, t0: 59.5, out: OUT }));
      lifts.push(p.lift('L.outboxNum', 57.5, { scale: 1.5, dur: .6, pad: 4 }));
    },

    render(t) {
      L.render(t);
      for (const l of lifts) l.render(t);
    },
  });
})();
