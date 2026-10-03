/* Quorum v4: record the real-UI plates for the film (STORYBOARD.md "Capture shot list").
 *
 * Runs on the render server only (video/v4/remote.sh run "node capture/capture.js STAGE").
 * Every shot is played on a virtual clock (capture/vclock.js): frame k is the page at ct = k/30 s,
 * exactly, however slow the screenshot. Inputs are real (mouse moves, presses, key strokes), so
 * hover, focus and pressed states are the page's own.
 *
 *   node capture/capture.js <SHOT|all> [flags]     shots: STAGE LANDING_HERO DECK_ARCH DECK_ASSIST DECK_DAY
 *   node capture/capture.js sheet <SHOT> [n=24]     contact sheet -> clips/<SHOT>/sheet.jpg
 *   flags: --workers=N   (default $RENDER_WORKERS or 2; the ct range is split, each worker replays the
 *                         prefix without screenshots; max 3)
 *          --dsf=2       device scale factor (plates are 3840x2160 at 2)
 *          --from=ct --to=ct   only write frames in [from, to] (tests); --every=n  every nth frame
 *          --quality=90  JPEG quality
 *
 * Output per moving shot (clips/<SHOT>/):
 *   f%05d.jpg      frame k = ct k/30, viewport 1920x1080 CSS px at dsf (3840x2160 at dsf 2)
 *   meta.json      {shot, viewport, dsf, fps, frames, pattern, actions:[{ct,do,sel,rect}], track:[{ct,rects}]}
 *   actions.json   {shot, fps, frames, pointer:[{ct,x,y}], events:[...], markers:[...]}
 * Stills: still.png (+ still_nostk.png) and meta.json {shot, still:true, viewport, dsf, rects}.
 * clips/manifest.json lists every captured shot. All rects are CSS px of the 1920x1080 viewport.
 */
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const V4 = path.resolve(__dirname, '..');
const REPO = path.resolve(V4, '../..');
const puppeteer = require(path.resolve(V4, '../node_modules/puppeteer-core'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CHROME_ARGS = (process.env.CHROME_ARGS || '').split(/\s+/).filter(Boolean);
const VCLOCK = fs.readFileSync(path.join(__dirname, 'vclock.js'), 'utf8');
const CUES = JSON.parse(fs.readFileSync(path.join(V4, 'cues.json'), 'utf8'));

const argv = process.argv.slice(2), flags = {}, pos = [];
for (const a of argv) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v === undefined ? true : v; } else pos.push(a); }
const FPS = 30;
const DSF = +(flags.dsf || 2);
const QUALITY = +(flags.quality || 90);
const WORKERS = Math.max(1, Math.min(3, +(flags.workers || process.env.RENDER_WORKERS || 2)));
const ARGS = [...CHROME_ARGS, '--disable-gpu', '--disable-gpu-compositing', '--hide-scrollbars', '--allow-file-access-from-files',
  '--font-render-hinting=none', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-ipc-flooding-protection', '--mute-audio', '--no-first-run'];
const fileUrl = (p, hash = '') => 'file://' + (p.startsWith('/') ? '' : '/') + p.replace(/\\/g, '/') + hash;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r1 = v => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ shots */
const L = '[data-pane="left"] ', R = '[data-pane="right"] ';
const STAGE_RECTS = {
  'L.pane': '[data-pane="left"]', 'R.pane': '[data-pane="right"]', 'HUB.col': '.hub-col', CAP: '.caption-bar',
  'L.header': L + 'header.top', 'L.name': L + '[data-el="device-name"]', 'L.switch': L + '[data-el="hub-switch"]', 'L.outbox': L + '[data-el="outbox-stat"]',
  'L.outboxNum': L + '[data-el="outbox"]', 'L.rate': L + '.stat.net', 'L.rateNum': L + '[data-el="rate"]', 'L.cloud': L + '[data-el="cloud-wrap"]',
  'L.legend': L + '[data-el="legend"]', 'L.ask': L + '.panel.assistant', 'L.askInput': L + '[data-el="ask-input"]',
  'L.noteInput': L + '[data-el="note-input"]', 'L.save': L + '.note-form button[type="submit"]', 'L.capture': L + '.panel.capture',
  'L.suggestDue': L + '.suggestions [data-q="What\'s due this week?"]', 'L.suggestSharma': L + '.suggestions [data-q="When is the Sharma delivery?"]',
  'L.answer': L + '[data-el="answer"]', 'L.answerText': L + '[data-el="answer"] .answer-text', 'L.answerTook': L + '[data-el="answer"] .took',
  'L.disputedTag': L + '[data-el="answer"] .tag-red', 'L.cites': L + '[data-el="answer"] .cites',
  'L.cite1': L + '[data-el="answer"] .cite:nth-child(1)', 'L.cite2': L + '[data-el="answer"] .cite:nth-child(2)', 'L.cite3': L + '[data-el="answer"] .cite:nth-child(3)',
  'L.conflictCard': L + '[data-el="conflict-card"]:not(.hidden)', 'L.cfTitle': L + '[data-el="conflict-card"]:not(.hidden) .cf-title',
  'L.cfSim': L + '[data-el="conflict-card"]:not(.hidden) .cf-title .sim', 'L.cfOwn': L + '[data-el="conflict-card"]:not(.hidden) .cf-own',
  'L.cfVal16': { sel: L + '[data-el="conflict-card"]:not(.hidden) .cf-value', text: '16 Oct' }, 'L.cfVal18': { sel: L + '[data-el="conflict-card"]:not(.hidden) .cf-value', text: '18 Oct' },
  'L.keep16': { sel: L + '[data-keep]', text: '16 Oct' }, 'L.keep18': { sel: L + '[data-keep]', text: '18 Oct' },
  'L.verdictKept': L + '.verdict.kept', 'L.verdictLost': L + '.verdict.lost', 'L.viewTeam': L + '[data-view="team"]', 'L.viewMine': L + '[data-view="mine"]',
  'L.simTag': { fn: 'simTag', side: 'left' }, 'L.ptNote': { fn: 'point', side: 'left', id: 'note' }, 'L.ptEmail': { fn: 'point', side: 'left', id: 'email' },
  'R.header': R + 'header.top', 'R.name': R + '[data-el="device-name"]', 'R.switch': R + '[data-el="hub-switch"]', 'R.outbox': R + '[data-el="outbox-stat"]',
  'R.outboxNum': R + '[data-el="outbox"]', 'R.rate': R + '.stat.net', 'R.cloud': R + '[data-el="cloud-wrap"]', 'R.legend': R + '[data-el="legend"]',
  'R.ask': R + '.panel.assistant', 'R.capture': R + '.panel.capture', 'R.inbox': R + '[data-el="inbox"]', 'R.mail': R + '.mail', 'R.receive': R + '[data-receive]',
  'R.suggestDue': R + '.suggestions [data-q="What\'s due this week?"]', 'R.answer': R + '[data-el="answer"]', 'R.answerText': R + '[data-el="answer"] .answer-text',
  'R.answerTook': R + '[data-el="answer"] .took', 'R.cites': R + '[data-el="answer"] .cites',
  'R.cite1': R + '[data-el="answer"] .cite:nth-child(1)', 'R.cite2': R + '[data-el="answer"] .cite:nth-child(2)', 'R.cite3': R + '[data-el="answer"] .cite:nth-child(3)',
  'R.conflictCard': R + '[data-el="conflict-card"]:not(.hidden)', 'R.cfTitle': R + '[data-el="conflict-card"]:not(.hidden) .cf-title',
  'R.cfWait': R + '.cf-wait', 'R.askOwner': R + '[data-action="ask-owner"]', 'R.draft': R + '.cf-draft', 'R.draftText': R + '.cf-draft-text',
  'R.verdictKept': R + '.verdict.kept', 'R.viewTeam': R + '[data-view="team"]',
  'R.simTag': { fn: 'simTag', side: 'right' }, 'R.ptNote': { fn: 'point', side: 'right', id: 'note' }, 'R.ptEmail': { fn: 'point', side: 'right', id: 'email' },
  'HUB.node': '[data-hub="node"]', 'HUB.total': '.hub-total', 'HUB.totalNum': '[data-hub="total"]', 'HUB.privacy': '[data-hub="privacy"]',
  'HUB.device': '[data-hub="device"]', 'HUB.recent': '.hub-recent', 'HUB.recent1': '.hub-recent li:first-child',
  'LINK.left': { fn: 'link', side: 'left' }, 'LINK.right': { fn: 'link', side: 'right' },
  'CAP.head': '.cap-head', 'CAP.tag': '[data-cap="tag"]:not(.hidden)',
};
// what each click must cause (checked on the page; a take that misses one is retried)
const STAGE_EXPECT = {
  6: { within: 1.0, test: 'answer', side: 'right' },
  16: { within: 0.6, test: 'offline', side: 'left' },
  19.5: { within: 1.0, test: 'answer', side: 'left' },
  26.5: { within: 5.2, test: 'claim', side: 'left' },
  38: { within: 5.2, test: 'claim', side: 'right' },
  52: { within: 1.5, test: 'conflictBoth' },
  68.5: { within: 1.0, test: 'disputed', side: 'left' },
  76.5: { within: 1.0, test: 'draft', side: 'right' },
  81: { within: 1.5, test: 'resolvedBoth' },
  86.5: { within: 0.5, test: 'team', side: 'left' },
};

function shotDefs() {
  const C = CUES.captures, defs = {};
  defs.STAGE = {
    ...C.STAGE, url: fileUrl(path.join(V4, 'mockstage/index.html')), rectSpecs: STAGE_RECTS, expect: STAGE_EXPECT,
    ready: `!!(window.__stage && __stage.panes.left.device && __stage.panes.right.device && __stage.hub.total === 18)`,
  };
  defs.LANDING_HERO = {
    ...C.LANDING_HERO, url: fileUrl(path.join(REPO, 'site/index.html')), ready: 'document.readyState === "complete"',
    actions: [{ ct: 0, do: 'load' }, { ct: 5.5, do: 'hover', sel: '.nav a.btn.quiet' }],
    rectSpecs: { heroTitle: '#hero-title', board: '#board', watchDemo: '.nav a.btn.quiet', cta: '#early-access', nav: '.nav', lede: '.lede' },
  };
  const deckCss = '.hud{display:none!important} .slide{transition:none!important}';
  const archRects = { flowSync: '.slide.on .flows button[data-flow="sync"]', diagram: '.slide.on .diagram', info: '#arch-info', infoSteps: { sel: '#arch-info li', all: true } };
  for (const c of ['store', 'memory', 'hub', 'lakshya', 'conflicts', 'ui', 'api', 'extract', 'ollama', 'answer', 'sync']) archRects['comp.' + c] = `.slide.on .comp[data-c="${c}"]`;
  defs.DECK_ARCH = { ...C.DECK_ARCH, url: fileUrl(path.join(REPO, 'site/deck.html'), '#5'), inject_css: deckCss, ready: 'document.readyState === "complete"', rectSpecs: archRects };
  defs.DECK_ASSIST = { ...C.DECK_ASSIST, still: true, url: fileUrl(path.join(REPO, 'site/deck.html'), '#6'), inject_css: deckCss, ready: 'document.readyState === "complete"',
    rectSpecs: { stk: { sel: '.slide.on .stk', all: true }, inp: { sel: '.slide.on .inp', all: true }, laptop: '.slide.on .laptop', title: '.slide.on h2', hand: '.slide.on .hand', mk: { sel: '.slide.on .mk', all: true } } };
  defs.DECK_DAY = { ...C.DECK_DAY, still: true, url: fileUrl(path.join(REPO, 'site/deck.html'), '#7'), inject_css: deckCss, ready: 'document.readyState === "complete"',
    rectSpecs: { stk: { sel: '.slide.on .stk', all: true }, dot: { sel: '.slide.on circle.dot', all: true }, chip: { sel: '.slide.on .tchip', all: true }, mk: { sel: '.slide.on .mk', all: true }, title: '.slide.on h2' } };
  return defs;
}

/* ------------------------------------------------------------ page helpers */
// Runs inside the page: rects for a spec table (CSS px of the viewport), hidden things omitted.
function pageRects(specs) {
  const out = {};
  const vis = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null; return r; };
  const put = (name, r) => { if (r) out[name] = { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const st = window.__stage;
  for (const [name, spec] of Object.entries(specs)) {
    try {
      if (typeof spec === 'string') { put(name, vis(document.querySelector(spec))); continue; }
      if (spec.fn === 'point' || spec.fn === 'simTag') {
        const pane = st && st.panes[spec.side]; if (!pane) continue;
        const ids = window.QBackend.ids, cloud = pane.ui.cloud, cv = pane.root.querySelector('[data-el="cloud"]').getBoundingClientRect();
        if (spec.fn === 'point') { const s = cloud.screenOf(ids[spec.id]); if (s) put(name, { left: cv.left + s.x - s.r, top: cv.top + s.y - s.r, width: 2 * s.r, height: 2 * s.r }); continue; }
        const cf = pane.ui.state.conflicts.get(window.QBackend.conflictId);
        const a = cloud.screenOf(ids.email), b = cloud.screenOf(ids.note);
        if (!cf || cf.status !== 'open' || !a || !b) continue;
        const fs = cloud.fs, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const c2 = (window.__mctx = window.__mctx || document.createElement('canvas').getContext('2d'));
        c2.font = `700 ${Math.round(15 * fs)}px "Schibsted Grotesk",system-ui,sans-serif`;
        const bw = c2.measureText(`similarity ${(+cf.similarity).toFixed(2)}`).width + 22, bh = Math.round(28 * fs);
        const bx = Math.min(Math.max(mx - bw / 2, 6), cloud.w - bw - 6), by = Math.min(Math.max(my - 48, cloud.labelTop), cloud.h - bh - 6);
        put(name, { left: cv.left + bx, top: cv.top + by, width: bw, height: bh });
        continue;
      }
      if (spec.fn === 'link') {
        const Lk = st && st.links[spec.side]; if (!Lk) continue;
        const m = document.querySelector('.stage-main').getBoundingClientRect();
        const x0 = Math.min(Lk.a[0], Lk.b[0]), x1 = Math.max(Lk.a[0], Lk.b[0]), y0 = Math.min(Lk.a[1], Lk.b[1]), y1 = Math.max(Lk.a[1], Lk.b[1]);
        put(name, { left: m.left + x0, top: m.top + y0 - 2, width: x1 - x0, height: y1 - y0 + 4 });
        continue;
      }
      const els = [...document.querySelectorAll(spec.sel)].filter(e => !spec.text || e.textContent.includes(spec.text));
      if (spec.all) els.forEach((e, i) => put(`${name}.${i}`, vis(e)));
      else put(name, vis(els[0]));
    } catch (e) { /* skip */ }
  }
  return out;
}

// Runs inside the page: checks an expectation.
function pageExpect(x) {
  const st = window.__stage; if (!st) return false;
  const P = s => st.panes[s];
  const ans = s => P(s).root.querySelector('[data-el="answer"]');
  switch (x.test) {
    case 'answer': return !!ans(x.side).querySelector('.answer-meta .took');
    case 'disputed': return ans(x.side).classList.contains('disputed');
    case 'offline': return P(x.side).root.classList.contains('is-offline');
    case 'claim': return [...P(x.side).ui.state.claims.values()].some(c => c.attribute === 'due_date' && /sharma/i.test(c.entity));
    case 'conflictBoth': return ['left', 'right'].every(s => P(s).ui.state.conflicts.size > 0);
    case 'draft': return !!P(x.side).root.querySelector('.cf-draft');
    case 'resolvedBoth': return ['left', 'right'].every(s => [...P(s).ui.state.conflicts.values()].some(c => c.status === 'resolved'));
    case 'team': return P(x.side).ui.state.view === 'team';
    default: return true;
  }
}

// Runs inside the page: caret position at the end of the focused input's value.
function pageCaret() {
  const el = document.activeElement; if (!el || !('value' in el)) return null;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const c = (window.__mctx = window.__mctx || document.createElement('canvas').getContext('2d'));
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const x = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + c.measureText(el.value).width - el.scrollLeft;
  return { x: Math.round(Math.min(x, r.right - 4) * 10) / 10, y: Math.round(r.top + r.height * 0.2), h: Math.round(r.height * 0.6) };
}

/* -------------------------------------------------------------- the take */
/** Expand shot actions into per-frame input events. Click: the real pointer jumps onto the target
 *  0.25 s early (one move event, so nothing in between gets hovered), presses at ct, releases at ct+0.1. */
function plan(shot) {
  const ev = [];
  const F = t => Math.round(t * FPS);
  for (const a of shot.actions || []) {
    if (a.do === 'click') {
      ev.push({ f: F(a.ct - 0.25), kind: 'move', a });
      ev.push({ f: F(a.ct), kind: 'down', a });
      ev.push({ f: F(a.ct + 0.1), kind: 'up', a });
    } else if (a.do === 'hover') {
      ev.push({ f: F(a.ct), kind: 'move', a });
    } else if (a.do === 'type') {
      const n = a.text.length, until = a.until ?? (a.ct + n * 0.05);
      for (let i = 0; i < n; i++) ev.push({ f: F(a.ct + i * (until - a.ct) / Math.max(1, n - 1)), kind: 'key', ch: a.text[i], a });
    }
  }
  return ev.sort((x, y) => x.f - y.f);
}

async function launch(tag) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS, protocolTimeout: 120000 });
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error' || /\[vclock\]/.test(m.text())) console.log(`  [page ${tag}]`, m.text().slice(0, 300)); });
  p.on('pageerror', e => console.log(`  [pageerror ${tag}]`, e.message));
  return { b, p };
}

async function openShot(p, shot) {
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: DSF });
  await p.evaluateOnNewDocument(VCLOCK);
  await p.goto(shot.url, { waitUntil: 'load', timeout: 60000 });
  if (shot.inject_css) await p.addStyleTag({ content: shot.inject_css });
  // wait on DOM state (real time; the virtual clock is still at 0)
  const t0 = Date.now();
  for (;;) {
    const ok = await p.evaluate(`(async () => { await document.fonts.ready; return ${shot.ready || 'true'}; })()`).catch(() => false);
    if (ok) break;
    if (Date.now() - t0 > 30000) throw new Error(`${shot.name}: page never became ready (${shot.ready})`);
    await sleep(100);
  }
  await p.evaluate(() => window.__vt.settle());
  await p.evaluate(() => { window.scrollTo(0, 0); });
  if (shot.name === 'STAGE') {
    // observed UI events become markers in actions.json
    await p.evaluate(() => {
      window.__marks = [];
      const ct = () => Math.round(performance.now() / 100) / 10;
      for (const side of ['left', 'right']) __stage.panes[side].ui.on(m => {
        if (m.ev && m.ev.type === 'sync') return;   // the 1 s byte ticks are noise
        const ev = m.ev ? { type: m.ev.type, id: m.ev.data && (m.ev.data.claim_id || m.ev.data.conflict_id), status: m.ev.data && m.ev.data.status, text: m.ev.data && m.ev.data.text } : null;
        __marks.push({ ct: ct(), side, type: m.type, ev, took: m.r && m.r.took_ms, view: m.view });
      });
      QBackend.hub.subscribe(s => __marks.push({ ct: ct(), type: 'hub', total: s.total, device: s.device }));
    });
  } else {
    await p.evaluate(() => {
      window.__marks = [];
      new MutationObserver(list => { for (const m of list) if (m.type === 'attributes' && m.target.classList) __marks.push({ ct: Math.round(performance.now() / 100) / 10, type: 'class', el: (m.target.dataset && (m.target.dataset.c || m.target.dataset.flow)) || m.target.tagName.toLowerCase(), cls: m.target.className.baseVal ?? m.target.className }); })
        .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  }
}

async function targetOf(p, a) {
  return p.evaluate(({ sel, text }) => {
    const els = [...document.querySelectorAll(sel)].filter(e => !text || e.textContent.includes(text));
    const e = els[0]; if (!e) return null;
    const r = e.getBoundingClientRect(); if (r.width < 1) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, { sel: a.sel, text: a.text_match || null });
}

/** One worker: replay the shot from ct 0, write frames in [f0, f1). */
async function take(shot, w, f0, f1, opts) {
  const { b, p } = await launch(`${shot.name}#${w}`);
  const outDir = path.join(V4, 'clips', shot.name);
  const rec = { events: [], pointer: [], track: [], actions: [], marks: [], fails: [] };
  try {
    await openShot(p, shot);
    const events = plan(shot);
    let ei = 0, mouse = { x: 1910, y: 1070 };
    const expects = Object.entries(shot.expect || {}).map(([ct, x]) => ({ ct: +ct, ...x, checked: false }));
    const last = f1 - 1;
    const tStart = Date.now();
    for (let f = 0; f <= last; f++) {
      await p.evaluate(ms => window.__vt.advance(ms), f === 0 ? 0 : 1000 / FPS);
      const ct = f / FPS, mine = f >= f0;
      // inputs due this frame
      let acted = false;
      while (ei < events.length && events[ei].f <= f) {
        const e = events[ei++]; acted = true;
        if (e.kind === 'key') {
          await p.keyboard.type(e.ch);
          const caret = await p.evaluate(pageCaret);
          if (mine) rec.events.push({ ct: r1(ct), type: 'key', key: e.ch, caret });
          continue;
        }
        const r = await targetOf(p, e.a);
        if (!r) throw new Error(`${shot.name} ct ${e.a.ct}: target not found: ${e.a.sel}${e.a.text_match ? ' ~' + e.a.text_match : ''}`);
        const x = Math.round(r.x + r.w / 2), y = Math.round(r.y + r.h / 2);
        if (e.kind === 'move') { await p.mouse.move(x, y); mouse = { x, y }; if (mine) rec.events.push({ ct: r1(ct), type: 'move', x, y, sel: e.a.sel }); }
        if (e.kind === 'down') {
          if (mouse.x !== x || mouse.y !== y) { await p.mouse.move(x, y); mouse = { x, y }; }
          await p.mouse.down();
          if (mine) { rec.events.push({ ct: r1(ct), type: 'mousedown', x, y, sel: e.a.sel }); rec.actions.push({ ct: e.a.ct, do: e.a.do, sel: e.a.sel, text_match: e.a.text_match, rect: r }); }
        }
        if (e.kind === 'up') { await p.mouse.up(); if (mine) rec.events.push({ ct: r1(ct), type: 'mouseup', x, y, sel: e.a.sel }); }
        if (e.a.do === 'hover' && mine) rec.actions.push({ ct: e.a.ct, do: 'hover', sel: e.a.sel, rect: r });
      }
      if (acted) await p.evaluate(() => window.__vt.settle());
      for (const x of expects) if (!x.checked && ct >= x.ct + x.within) {
        x.checked = true;
        if (!(await p.evaluate(pageExpect, x))) throw new Error(`${shot.name}: after ct ${x.ct} expected "${x.test}${x.side ? ' ' + x.side : ''}" by ct ${x.ct + x.within}`);
      }
      if (!mine) continue;
      if (f % 3 === 0 || acted) rec.track.push({ ct: r1(ct), rects: await p.evaluate(pageRects, shot.rectSpecs || {}) });
      if (f % 3 === 0) rec.pointer.push({ ct: r1(ct), x: mouse.x, y: mouse.y });
      const inRange = (opts.from == null || ct >= opts.from - 1e-6) && (opts.to == null || ct <= opts.to + 1e-6) && (f - f0) % opts.every === 0;
      if (inRange) await p.screenshot({ path: path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: QUALITY, optimizeForSpeed: true });
      if ((f - f0) % 150 === 0) console.log(`  [${shot.name}#${w}] frame ${f}/${last}  ${((Date.now() - tStart) / 1000).toFixed(0)}s`);
    }
    rec.marks = (await p.evaluate(() => window.__marks || [])).filter(m => m.ct >= f0 / FPS - 1e-6 && m.ct < f1 / FPS);
  } finally {
    await b.close().catch(() => {});
  }
  return rec;
}

async function captureMoving(shot) {
  const N = Math.round(shot.ct_end * FPS) + 1;      // frames 0..ct_end*30 inclusive
  const outDir = path.join(V4, 'clips', shot.name);
  fs.mkdirSync(outDir, { recursive: true });
  const opts = { from: flags.from != null ? +flags.from : null, to: flags.to != null ? +flags.to : null, every: +(flags.every || 1) };
  if (opts.from == null && opts.to == null && opts.every === 1) for (const f of fs.readdirSync(outDir)) if (/^f\d{5}\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  // split the range so that only frames that will be written count
  const lo = opts.from != null ? Math.round(opts.from * FPS) : 0, hi = opts.to != null ? Math.round(opts.to * FPS) + 1 : N;
  const W = Math.min(WORKERS, Math.max(1, Math.ceil((hi - lo) / 60)));
  console.log(`${shot.name}: frames ${lo}..${hi - 1} of ${N}, ${W} worker(s), dsf ${DSF}`);
  const t0 = Date.now();
  const recs = await Promise.all([...Array(W)].map(async (_, w) => {
    const f0 = lo + Math.floor(w * (hi - lo) / W), f1 = lo + Math.floor((w + 1) * (hi - lo) / W);
    for (let attempt = 1; ; attempt++) {
      try { return await take(shot, w, f0, f1, opts); }
      catch (e) { console.log(`  [${shot.name}#${w}] take failed (attempt ${attempt}): ${e.message}`); if (attempt >= 3) throw e; }
    }
  }));
  const merged = { events: [], pointer: [], track: [], actions: [], marks: [] };
  // a partial re-take (--from/--to) keeps the earlier take's records outside its range
  const partial = lo > 0 || hi < N;
  if (partial && fs.existsSync(path.join(outDir, 'meta.json')) && opts.every === 1) {
    const om = JSON.parse(fs.readFileSync(path.join(outDir, 'meta.json'), 'utf8'));
    const oa = fs.existsSync(path.join(outDir, 'actions.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'actions.json'), 'utf8')) : {};
    const out = x => x.ct < lo / FPS - 1e-6 || x.ct >= hi / FPS - 1e-6;
    merged.track.push(...(om.track || []).filter(out)); merged.actions.push(...(om.actions || []).filter(out));
    merged.events.push(...(oa.events || []).filter(out)); merged.pointer.push(...(oa.pointer || []).filter(out)); merged.marks.push(...(oa.markers || []).filter(out));
  }
  for (const r of recs) for (const k of Object.keys(merged)) merged[k].push(...r[k]);
  for (const k of Object.keys(merged)) merged[k].sort((a, b) => a.ct - b.ct);
  const viewport = { width: 1920, height: 1080, deviceScaleFactor: DSF };
  const meta = { shot: shot.name, viewport, dsf: DSF, fps: FPS, frames: N, pattern: 'f%05d.jpg', size: { w: 1920 * DSF, h: 1080 * DSF },
    captured_at_ct: partial ? [0, (N - 1) / FPS] : [lo / FPS, (hi - 1) / FPS], actions: merged.actions, track: merged.track };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(outDir, 'actions.json'), JSON.stringify({ shot: shot.name, fps: FPS, frames: N, viewport,
    pointer: merged.pointer, events: merged.events, markers: merged.marks }, null, 0));
  console.log(`${shot.name}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> clips/${shot.name}/ (${merged.track.length} rect samples, ${merged.marks.length} markers)`);
  return meta;
}

async function captureStill(shot) {
  const outDir = path.join(V4, 'clips', shot.name);
  fs.mkdirSync(outDir, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const { b, p } = await launch(shot.name);
    try {
      await openShot(p, shot);
      await p.evaluate(() => window.__vt.advance(1500));       // past any entrance
      const rects = await p.evaluate(pageRects, shot.rectSpecs || {});
      await p.screenshot({ path: path.join(outDir, 'still.png'), type: 'png' });
      await p.addStyleTag({ content: '.slide.on .stk{visibility:hidden!important}' });
      await p.evaluate(() => window.__vt.settle());
      await p.screenshot({ path: path.join(outDir, 'still_nostk.png'), type: 'png' });
      const meta = { shot: shot.name, still: true, viewport: { width: 1920, height: 1080, deviceScaleFactor: DSF }, dsf: DSF, size: { w: 1920 * DSF, h: 1080 * DSF },
        files: { still: 'still.png', nostk: 'still_nostk.png' }, rects };
      fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
      console.log(`${shot.name}: still.png + still_nostk.png, ${Object.keys(rects).length} rects`);
      return meta;
    } catch (e) {
      console.log(`  [${shot.name}] still failed (attempt ${attempt}): ${e.message}`); if (attempt >= 3) throw e;
    } finally { await b.close().catch(() => {}); }
  }
}

function writeManifest() {
  const dir = path.join(V4, 'clips'); fs.mkdirSync(dir, { recursive: true });
  const shots = {};
  for (const name of fs.readdirSync(dir)) {
    const mf = path.join(dir, name, 'meta.json'); if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const frames = m.still ? 0 : fs.readdirSync(path.join(dir, name)).filter(f => /^f\d{5}\.jpg$/.test(f)).length;
    shots[name] = m.still ? { still: true, files: m.files, dsf: m.dsf, size: m.size }
      : { frames: m.frames, frames_on_disk: frames, fps: m.fps, pattern: m.pattern, dsf: m.dsf, size: m.size, ct_end: (m.frames - 1) / m.fps };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ generated_by: 'capture/capture.js', shots }, null, 1));
  console.log('wrote clips/manifest.json:', Object.keys(shots).join(', '));
}

function sheet(name, n = 24) {
  const dir = path.join(V4, 'clips', name);
  const files = fs.readdirSync(dir).filter(f => /^f\d{5}\.jpg$/.test(f)).sort();
  const pick = [...Array(Math.min(n, files.length))].map((_, i) => files[Math.floor((i + .5) * files.length / Math.min(n, files.length))]);
  const list = path.join(dir, '_sheet.txt');
  fs.writeFileSync(list, pick.map(f => `file '${path.join(dir, f).replace(/\\/g, '/')}'`).join('\n'));
  const cols = 6, rows = Math.ceil(pick.length / cols);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=480:270,tile=${cols}x${rows}:padding=4:color=0x222222`, '-frames:v', '1', '-q:v', '3', path.join(dir, 'sheet.jpg')], { stdio: 'inherit' });
  fs.unlinkSync(list);
  if (r.status !== 0) throw new Error('ffmpeg sheet failed');
  console.log(`wrote clips/${name}/sheet.jpg (${pick.map(f => (parseInt(f.slice(1), 10) / FPS).toFixed(1)).join(', ')})`);
}

(async () => {
  const defs = shotDefs();
  for (const [k, v] of Object.entries(defs)) v.name = k;
  if (pos[0] === 'sheet') { sheet(pos[1], +(pos[2] || 24)); return; }
  if (pos[0] === 'manifest') { writeManifest(); return; }
  const names = !pos.length || pos[0] === 'all' ? Object.keys(defs) : pos;
  for (const n of names) {
    const shot = defs[n]; if (!shot) throw new Error(`unknown shot ${n} (have ${Object.keys(defs).join(', ')})`);
    if (shot.still) await captureStill(shot); else await captureMoving(shot);
  }
  writeManifest();
})().catch(e => { console.error(e); process.exit(1); });
