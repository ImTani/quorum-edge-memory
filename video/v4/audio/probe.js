/* Quorum v4 audio probe: reads the finished picture's event times straight out of the scene code.
 *
 *   node audio/probe.js            -> audio/picture_events.json
 *
 * Loads index.html in headless Chrome exactly like render.js, but before lib.js runs it traps the
 * lib/kit component factories (markerPath, strokeSeq, handText, sticky, eraser, KIT.note, KIT.popper,
 * KIT.slapCrop, KIT.plateDrop, plate.lift, Cursor.plan ...). After every scene's build() it reads the
 * final t0/dur of every component (scenes sometimes move t0 after construction), the cursor plan, the
 * camera key times, shakes and punches. compose.py turns that into the SFX track, so marker squeaks
 * last exactly as long as the strokes, slaps land on the contact frame and clicks on the press frame.
 *
 * Clip metadata: if clips/<SHOT>/meta.json exists it is injected like render.js does. If not (clips not
 * on this machine), a stand-in is synthesised: every rect name resolves to a dummy box and the click
 * actions come from cues.json captures (capture.js presses at exactly those ct). Times do not depend on
 * rect positions, only on the scene code, so the probe is valid either way.
 */
'use strict';
const path = require('path'), fs = require('fs');
const V4 = path.resolve(__dirname, '..');
const puppeteer = require(path.resolve(V4, '../node_modules/puppeteer-core'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CHROME_ARGS = (process.env.CHROME_ARGS || '').split(/\s+/).filter(Boolean);
const CUES = JSON.parse(fs.readFileSync(path.join(V4, 'cues.json'), 'utf8'));

function clipsInjection() {
  const real = {}, cdir = path.join(V4, 'clips');
  if (fs.existsSync(cdir)) for (const name of fs.readdirSync(cdir)) {
    const m = path.join(cdir, name, 'meta.json'), a = path.join(cdir, name, 'actions.json');
    if (!fs.existsSync(m)) continue;
    real[name] = { meta: JSON.parse(fs.readFileSync(m, 'utf8')), actions: fs.existsSync(a) ? JSON.parse(fs.readFileSync(a, 'utf8')) : null };
  }
  const caps = CUES.captures || {};
  const synth = {};
  for (const [name, c] of Object.entries(caps)) {
    if (real[name]) continue;
    synth[name] = {
      still: !!c.still,
      frames: Math.round((c.ct_end || 1) * 30) + 1,
      actions: (c.actions || []).filter(a => a.do === 'click' || a.do === 'hover').map(a => ({ ct: a.ct, do: a.do, sel: a.sel, text_match: a.text_match })),
    };
  }
  return { real, synth, used: { real: Object.keys(real), synth: Object.keys(synth) } };
}

const HOOK = (CL) => `
(function(){
  const CLIPS_REAL = ${JSON.stringify(CL.real)}, SYN = ${JSON.stringify(CL.synth)};
  window.__BOX = { x: 800, y: 420, w: 160, h: 44 };
  const BOX = window.__BOX;
  const anyRects = () => new Proxy({}, { get: (o, k) => (typeof k === 'string' ? { ...window.__BOX } : undefined), has: () => true });
  window.CLIPS = Object.assign({}, CLIPS_REAL);
  for (const [n, s] of Object.entries(SYN)) {
    window.CLIPS[n] = s.still
      ? { meta: { still: true, dsf: 2, rects: anyRects(), files: [] }, actions: null }
      : { meta: { frames: s.frames, fps: 30, dsf: 2, track: [{ ct: 0, rects: anyRects() }, { ct: 1e6, rects: anyRects() }],
                  actions: s.actions.map(a => ({ ...a, rect: { ...BOX } })) }, actions: { events: [], markers: [] } };
  }
  const LOG = window.__probe = { items: [], cursor: [], lifts: [] };
  const rec = (kind, api, o, extra) => { LOG.items.push({ kind, api, o: o || {}, extra: extra || {}, scene: window.__curScene || null }); return api; };
  const wrapMap = {
    markerPath: f => function (parent, d, o) { return rec('markerPath', f.apply(this, arguments), o); },
    strokeSeq: f => function (parent, ds, o) { return rec('strokeSeq', f.apply(this, arguments), o); },
    markerCircle: f => function (parent, r, o) { return rec('markerCircle', f.apply(this, arguments), o); },
    markerUnderline: f => function (parent, a, b, y, o) { return rec('markerUnderline', f.apply(this, arguments), o); },
    markerArrow: f => function (parent, a, b, o) { return rec('markerArrow', f.apply(this, arguments), o); },
    markerCross: f => function (parent, x, y, s, o) { return rec('markerCross', f.apply(this, arguments), o); },
    markerTick: f => function (parent, x, y, s, o) { return rec('markerTick', f.apply(this, arguments), o); },
    markerSlash: f => function (parent, a, b, c, d, o) { return rec('markerSlash', f.apply(this, arguments), o); },
    markerScribble: f => function (parent, r, o) { return rec('markerScribble', f.apply(this, arguments), o); },
    handText: f => function (parent, text, x, y, o) { return rec('handText', f.apply(this, arguments), o, { text: String(text || (o && o.html) || '') }); },
    sticky: f => function (parent, o) { return rec('sticky', f.apply(this, arguments), o); },
    eraser: f => function (parent, o) { return rec('eraser', f.apply(this, arguments), o); },
    screenFrame: f => function (o) {
      const api = f.apply(this, arguments), lift = api.lift;
      api.lift = function (name, t0, opt) { LOG.lifts.push({ clip: o.clip, name, t0, opt: opt || {}, scene: window.__curScene || null }); return lift.apply(this, arguments); };
      return api;
    },
  };
  const store = {};
  for (const [name, wrap] of Object.entries(wrapMap)) {
    Object.defineProperty(window, name, { configurable: true, get: () => store[name], set: v => { store[name] = typeof v === 'function' ? wrap(v) : v; } });
  }
  // Cursor: wrap plan()
  let cursorObj;
  Object.defineProperty(window, 'Cursor', { configurable: true, get: () => cursorObj, set: v => {
    cursorObj = v; const plan = v.plan.bind(v);
    v.plan = list => { for (const p of list) LOG.cursor.push({ t: p.t, kind: p.click != null ? 'click' : p.at != null ? 'at' : p.enter ? 'enter' : p.exit ? 'exit' : '?',
      target: typeof (p.click ?? p.at) === 'string' ? (p.click ?? p.at) : (p.click ?? p.at) ? 'point' : (p.enter || p.exit), color: p.color || null, dwell: p.dwell ?? .3, scene: window.__curScene || null }); return plan(list); };
  } });
  // Scene: remember which scene is building (build runs later in main.js; wrap build)
  let sceneFn;
  Object.defineProperty(window, 'Scene', { configurable: true, get: () => sceneFn, set: v => {
    sceneFn = function (def) { const b = def.build; if (b) def.build = function () { window.__curScene = def.id; try { return b.apply(this, arguments); } finally { window.__curScene = null; } }; return v(def); };
  } });
  // KIT: wrap the timed helpers when the kit assigns window.KIT
  let kit;
  Object.defineProperty(window, 'KIT', { configurable: true, get: () => kit, set: v => {
    kit = v;
    for (const n of ['note', 'popper', 'ffStamp', 'flashRect', 'plateDrop', 'slapCrop']) {
      const f = v[n]; if (typeof f !== 'function') continue;
      v[n] = function () {
        const api = f.apply(this, arguments), a = [...arguments];
        let o = {}, t0 = null, text = '';
        if (n === 'note' || n === 'ffStamp' || n === 'flashRect') { o = a[a.length - 1] || {}; t0 = o.t0; text = o.text || ''; }
        if (n === 'popper' || n === 'plateDrop') { t0 = a[1]; o = a[2] || {}; }
        if (n === 'slapCrop') { t0 = a[3]; o = a[4] || {}; }
        LOG.items.push({ kind: 'KIT.' + n, api, o, extra: { t0, text, t1: o.t1 }, scene: window.__curScene || null });
        return api;
      };
    }
  } });
})();
`;

(async () => {
  const CL = clipsInjection();
  console.log('clips: real =', CL.used.real.join(',') || '-', '| synthesised =', CL.used.synth.join(',') || '-');
  const ARGS = [...CHROME_ARGS, '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', '--mute-audio', '--no-first-run'];
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS, protocolTimeout: 120000 });
  try {
    const p = await b.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
    await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await p.evaluateOnNewDocument(`window.CUES = ${JSON.stringify(CUES)};` + HOOK(CL));
    const url = 'file:///' + path.join(V4, 'index.html').replace(/\\/g, '/');
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    for (let i = 0; i < 300 && !(await p.evaluate(() => window.__ready === true)); i++) await new Promise(r => setTimeout(r, 100));
    const out = await p.evaluate(() => {
      const L = window.__probe, R = x => (x == null ? null : Math.round(x * 1000) / 1000);
      const atoms = [];   // single drawn strokes
      const items = [];
      const colorOf = o => (o && o.color) || null;
      for (const it of L.items) {
        const a = it.api || {}, o = it.o || {};
        const base = { kind: it.kind, scene: it.scene, color: colorOf(o), width: o.width ?? null, out: o.out ?? null };
        if (it.kind === 'strokeSeq' || it.kind === 'markerArrow' || it.kind === 'markerCross' || it.kind === 'KIT.stopwatch' || it.kind === 'KIT.dashedArrow') {
          const parts = (a.parts || []).map(m => ({ t0: R(m.t0), dur: R(m.dur), len: R(m.len) }));
          items.push({ ...base, parts, t0: parts.length ? parts[0].t0 : null, end: parts.length ? R(parts[parts.length - 1].t0 + parts[parts.length - 1].dur) : null });
        } else if (it.kind.startsWith('marker')) {
          items.push({ ...base, t0: R(a.t0), dur: R(a.dur), len: R(a.len) });
        } else if (it.kind === 'handText') {
          items.push({ ...base, t0: R(a.t0), dur: R(a.dur), size: o.size ?? 34, text: it.extra.text.replace(/<[^>]+>/g, '').slice(0, 80) });
        } else if (it.kind === 'sticky') {
          items.push({ ...base, t0: R(a.t0), w: o.w ?? 280, h: o.h ?? null, stickyColor: o.color || 'yellow' });
        } else if (it.kind === 'eraser') {
          items.push({ ...base, t0: R(a.t0), dur: R(a.dur), w: o.w ?? 1920 });
        } else if (it.kind === 'KIT.note') {
          const txt = it.extra.text || '';
          const wdur = o.dur ?? Math.min(1.2, Math.max(.3, txt.length / 26));
          items.push({ ...base, t0: R(a.t0 ?? it.extra.t0), dur: R(wdur), size: o.size ?? 24, text: txt.slice(0, 80), noteKind: o.kind || 'paper' });
        } else if (it.kind === 'KIT.ruler') {
          items.push({ ...base, t0: R(o.t0 ?? 0), end: R(a.end) });   // its strokes are logged as markerPath/handText too
        } else {
          items.push({ ...base, t0: R(it.extra.t0), t1: R(it.extra.t1 ?? null), text: (it.extra.text || '').slice(0, 80), popKind: o.kind || null });
        }
      }
      // camera keys (times only are meaningful), shakes, punches per scene
      // camera key values: evaluated with two different stand-in rects; if they agree the key does
      // not depend on clip rects and its position is exact, else it is marked 'plate' (unknown here)
      const evalKey = k => { try { const v = typeof k[1] === 'function' ? k[1](k[0]) : k[1]; return v ? { x: v.x, y: v.y, z: v.z } : null; } catch (e) { return null; } };
      const keyVals = SCENES.map(s => (s.camera || []).map(k => evalKey(k)));
      Object.assign(window.__BOX, { x: 1133, y: 597, w: 208, h: 61 });
      const keyVals2 = SCENES.map(s => (s.camera || []).map(k => evalKey(k)));
      Object.assign(window.__BOX, { x: 800, y: 420, w: 160, h: 44 });
      const same = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-6;
      const scenes = SCENES.map((s, si) => ({ id: s.id, start: s.start, end: s.end, fixture: !!s.fixture,
        keys: (s.camera || []).map((k, ki) => [k[0], typeof k[2] === 'string' ? k[2] : k[2] ? 'fn' : null,
          same(keyVals[si][ki], keyVals2[si][ki]) ? keyVals[si][ki] : 'plate']),
        shakes: s.shakes, punches: s.punches, broken: !!s._broken })).filter(s => !s.fixture || s.keys.length);
      const caps = Captions.els.map(e => ({ start: e.c.start, end: e.c.end, text: e.c.text, wdur: Math.min(1.4, Math.max(.4, e.c.text.length / 45)) }));
      return { items, cursor: L.cursor, lifts: L.lifts.map(l => ({ ...l, opt: { dur: l.opt.dur, scale: l.opt.scale } })), scenes, captions: caps, errors: window.__errors.slice() };
    });
    out.page_errors = errs;
    out.clips = CL.used;
    out.generated_by = 'audio/probe.js';
    // markerPath atoms created inside strokeSeq/markerArrow etc. are not double-logged (lib calls its own
    // closure binding), but KIT.ruler/stopwatch/dashedArrow call the global ones: drop those duplicates.
    fs.writeFileSync(path.join(__dirname, 'picture_events.json'), JSON.stringify(out, null, 1));
    const n = {}; for (const it of out.items) n[it.kind] = (n[it.kind] || 0) + 1;
    console.log('items:', JSON.stringify(n));
    console.log('cursor waypoints:', out.cursor.length, '| lifts:', out.lifts.length, '| scenes:', out.scenes.length);
    if (out.errors.length || errs.length) console.log('page errors:\n  ' + [...out.errors, ...errs].slice(0, 20).join('\n  '));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
