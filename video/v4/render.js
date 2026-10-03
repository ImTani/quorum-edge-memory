/* Quorum v4 renderer. Runs on the render server (video/v4/remote.sh run "node render.js ..."):
 * headless Chrome from $CHROME (+ $CHROME_ARGS), software only (--disable-gpu), ffmpeg libx264 on CPU.
 *
 *   node render.js                         full 0..168 s -> frames/%05d.jpg -> out/quorum-showcase-silent.mp4
 *                                          (+ out/quorum-showcase.mp4 with audio/soundtrack.wav), then deletes frames/
 *   node render.js range <t0> <t1>         render [t0, t1) -> out/range_<t0>_<t1>.mp4 (with audio if present)
 *   node render.js test <t> [t ...]        stills -> stills/test_<t>.jpg
 *   node render.js sheet <t0> <t1> [n=8]   n stills across [t0, t1] tiled -> stills/sheet_<t0>_<t1>.jpg
 *   node render.js encode                  encode existing frames/ (+ mux audio)
 *   node render.js verify <t> [t ...]      determinism: each t rendered in order, then in reverse after
 *                                          render(0); the PNGs must be identical
 *   flags: --workers=N (default $RENDER_WORKERS, else 2; max 8)  --fps=30  --quality=92  --no-encode
 *          --keep-frames  --demo (load scenes/manifest.js DEMO_FILES)  --only=a,b (scene files)  --crf=18
 * Page errors (scene exceptions) are printed; test/sheet/verify exit 2 if any occurred.
 */
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const ROOT = __dirname;
const puppeteer = require(path.resolve(ROOT, '../node_modules/puppeteer-core'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CHROME_ARGS = (process.env.CHROME_ARGS || '').split(/\s+/).filter(Boolean);

const argv = process.argv.slice(2), flags = {}, pos = [];
for (const a of argv) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v === undefined ? true : v; } else pos.push(a); }
const CUES = JSON.parse(fs.readFileSync(path.join(ROOT, 'cues.json'), 'utf8'));
const DUR = CUES.duration || 168;
const FPS = +(flags.fps || 30), QUALITY = +(flags.quality || 92), CRF = +(flags.crf || 18);
const WORKERS = Math.max(1, Math.min(8, +(flags.workers || process.env.RENDER_WORKERS || 2)));
const query = [flags.demo ? 'demo=1' : '', flags.only ? `only=${flags.only}` : ''].filter(Boolean).join('&');
const URL = 'file://' + (ROOT.startsWith('/') ? '' : '/') + path.resolve(ROOT, 'index.html').replace(/\\/g, '/') + (query ? '?' + query : '');
const dir = d => { const p = path.join(ROOT, d); fs.mkdirSync(p, { recursive: true }); return p; };
const ARGS = [...CHROME_ARGS, '--disable-gpu', '--disable-gpu-compositing', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-ipc-flooding-protection', '--font-render-hinting=none', '--mute-audio', '--no-first-run'];

/** cues + clip metadata, injected before the page's scripts run (no file fetches needed) */
function injection() {
  const clips = {}, cdir = path.join(ROOT, 'clips');
  if (fs.existsSync(cdir)) for (const name of fs.readdirSync(cdir)) {
    const m = path.join(cdir, name, 'meta.json'), a = path.join(cdir, name, 'actions.json');
    if (!fs.existsSync(m)) continue;
    clips[name] = { meta: JSON.parse(fs.readFileSync(m, 'utf8')), actions: fs.existsSync(a) ? JSON.parse(fs.readFileSync(a, 'utf8')) : null };
  }
  return `window.CUES = ${JSON.stringify(CUES)}; window.CLIPS = ${JSON.stringify(clips)};`;
}
const INJECT = injection();

async function worker(tag) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS, protocolTimeout: 180000 });
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log(`  [page ${tag}]`, m.text().slice(0, 400)); });
  p.on('pageerror', e => console.log(`  [pageerror ${tag}]`, e.message));
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(INJECT);
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 300 && !(await p.evaluate(() => window.__ready === true)); i++) await new Promise(r => setTimeout(r, 100));
  const fontsOk = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 46px "Shantell Sans"') && document.fonts.check('800 60px "Schibsted Grotesk"'); });
  if (!fontsOk) console.log(`  [warn ${tag}] fonts not confirmed loaded`);
  // warm-up: visit the film once so fonts, filters and the first plates are ready
  for (let t = 0; t < DUR; t += 6) await p.evaluate(async t => { window.render(t); await window.__settle(); }, t);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ type: 'jpeg', quality: 10 });
  const shot = async (t, file, q = QUALITY, stamp, next) => {
    await p.evaluate(async (t, stamp, next) => {
      window.render(t);
      if (stamp) { let d = document.getElementById('__stamp'); if (!d) { d = document.createElement('div'); d.id = '__stamp'; d.style.cssText = 'position:absolute;right:14px;top:10px;z-index:99;font:600 30px monospace;color:#fff;background:rgba(0,0,0,.6);padding:2px 10px;border-radius:6px'; document.body.appendChild(d); } d.textContent = stamp; }
      await window.__settle();
      if (next != null) window.prefetch(next);
    }, t, stamp || null, next ?? null);
    return p.screenshot({ path: file, type: 'jpeg', quality: q, optimizeForSpeed: true });
  };
  const errors = () => p.evaluate(() => window.__errors.slice());
  return { b, p, shot, errors };
}

function ffmpeg(args) {
  console.log('ffmpeg', args.join(' '));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
}

function encode(f0, f1, outName) {
  const out = dir('out'), wav = path.join(ROOT, 'audio', 'soundtrack.wav');
  const silent = path.join(out, outName ? outName.replace(/\.mp4$/, '-silent.mp4') : 'quorum-showcase-silent.mp4');
  ffmpeg(['-framerate', String(FPS), '-start_number', String(f0), '-i', path.join(ROOT, 'frames', '%05d.jpg'), '-frames:v', String(f1 - f0),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', silent]);
  console.log('wrote', silent);
  if (fs.existsSync(wav)) {
    const final = path.join(out, outName || 'quorum-showcase.mp4');
    ffmpeg(['-i', silent, '-ss', (f0 / FPS).toFixed(3), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
    console.log('wrote', final);
  } else console.log('(no audio/soundtrack.wav: silent only)');
}

async function renderFrames(f0, f1) {
  const out = dir('frames'), t0 = Date.now(); let done = 0, errs = 0;
  const CH = 30, chunks = []; for (let a = f0; a < f1; a += CH) chunks.push([a, Math.min(f1, a + CH)]);
  const W = Math.min(WORKERS, chunks.length);
  await Promise.all([...Array(W)].map(async (_, w) => {
    let k = await worker(w);
    while (chunks.length) {
      const [a, b] = chunks.shift();
      // pre-roll: Chrome keeps raster scales of transformed layers from earlier frames, so a chunk that
      // starts cold can differ by a few levels at edges. Rendering the two previous frames first makes
      // every chunk's first frame identical to a sequential render (checked by diffing).
      for (let f = Math.max(0, a - 2); f < a; f++) await k.p.evaluate(async t => { window.render(t); await window.__settle(); }, f / FPS);
      for (let f = a; f < b; f++) {
        const file = path.join(out, String(f).padStart(5, '0') + '.jpg');
        for (let attempt = 0; ; attempt++) {   // watchdog: a stalled Chrome gets relaunched
          let timer; const to = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 60000); });
          try { await Promise.race([k.shot(f / FPS, file, QUALITY, null, f + 1 < b ? (f + 1) / FPS : null), to]); clearTimeout(timer); break; }
          catch (e) { clearTimeout(timer); console.log(`  worker ${w} frame ${f}: ${e.message}, relaunching`); try { k.b.process() && k.b.process().kill(); } catch (_) { } if (attempt >= 2) throw e; k = await worker(w); }
        }
        if (++done % 150 === 0) console.log(`${done}/${f1 - f0} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${(done / ((Date.now() - t0) / 1000)).toFixed(2)} fps`);
      }
    }
    errs += (await k.errors()).length; await k.b.close();
  }));
  const s = (Date.now() - t0) / 1000;
  console.log(`rendered ${done} frames in ${s.toFixed(0)} s (${(done / s).toFixed(2)} fps, ${W} workers)`);
  if (errs) console.log(`WARNING: ${errs} page errors during render`);
}

async function stills(times, name, stamp) {
  const out = dir('stills'); const W = Math.max(1, Math.min(WORKERS, times.length)); const files = []; let errs = [];
  await Promise.all([...Array(W)].map(async (_, w) => {
    const k = await worker(w);
    for (let i = w; i < times.length; i += W) { const t = times[i], f = path.join(out, name(t, i)); files[i] = f; await k.shot(t, f, 90, stamp ? `t=${t.toFixed(2)}` : null); }
    errs = errs.concat(await k.errors()); await k.b.close();
  }));
  if (errs.length) { console.log('PAGE ERRORS:\n  ' + [...new Set(errs)].join('\n  ')); process.exitCode = 2; }
  return files;
}

const clearFrames = () => { const d = path.join(ROOT, 'frames'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/^\d{5}\.jpg$/.test(f)) fs.unlinkSync(path.join(d, f)); };

(async () => {
  const mode = pos[0];
  if (mode === 'test') {
    const files = await stills(pos.slice(1).map(Number), t => `test_${t}.jpg`, false);
    files.forEach(f => console.log('wrote', f));
  } else if (mode === 'sheet') {
    const a = +pos[1], b = +pos[2], n = +(pos[3] || 8);
    const times = [...Array(n)].map((_, i) => +(a + (i + .5) * (b - a) / n).toFixed(2));
    const files = await stills(times, (t, i) => `_sheet_${process.pid}_${String(i).padStart(2, '0')}.jpg`, true);
    const cols = n <= 4 ? n : Math.ceil(n / 2) <= 5 ? Math.ceil(n / 2) : 5, rows = Math.ceil(n / cols);
    const outf = path.join(ROOT, 'stills', `sheet_${a}_${b}.jpg`);
    ffmpeg(['-start_number', '0', '-i', path.join(ROOT, 'stills', `_sheet_${process.pid}_%02d.jpg`), '-frames:v', '1', '-vf', `scale=768:432,tile=${cols}x${rows}:padding=6:color=0x222222`, '-q:v', '3', outf]);
    files.forEach(f => fs.unlinkSync(f));
    console.log('wrote', outf, 'times:', times.join(', '));
  } else if (mode === 'verify') {
    const times = pos.slice(1).map(Number), k = await worker(0), A = {}; let bad = 0;
    const snap = async t => { await k.p.evaluate(async t => { window.render(t); await window.__settle(); }, t); return k.p.screenshot({ type: 'png' }); };
    for (const t of times) A[t] = await snap(t);
    for (const t of times.slice().reverse()) { await snap(0); const B = await snap(t); const same = Buffer.compare(A[t], B) === 0; if (!same) bad++; console.log(`t=${t}: ${same ? 'identical' : 'DIFFERENT (state leaks between frames!)'}`); }
    const errs = await k.errors(); await k.b.close();
    if (errs.length) console.log('PAGE ERRORS:\n  ' + [...new Set(errs)].join('\n  '));
    process.exitCode = bad ? 3 : errs.length ? 2 : 0;
  } else if (mode === 'encode') {
    encode(0, Math.round(DUR * FPS));
  } else if (mode === 'range') {
    const a = +pos[1], b = +pos[2], f0 = Math.round(a * FPS), f1 = Math.round(b * FPS);
    await renderFrames(f0, f1);
    if (!flags['no-encode']) { encode(f0, f1, `range_${a}_${b}.mp4`); if (!flags['keep-frames']) clearFrames(); }
  } else {
    const total = Math.round(DUR * FPS);
    await renderFrames(0, total);
    if (!flags['no-encode']) { encode(0, total); if (!flags['keep-frames']) { clearFrames(); console.log('deleted frames/ (use --keep-frames to keep)'); } }
  }
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
