/* v3 renderer. Run from video/v3 (uses ../node_modules/puppeteer-core + system Chrome + ffmpeg on PATH).
 *
 *   node render.js                         full render 0..150 s -> frames/%05d.jpg, then encode (+ mux audio)
 *   node render.js range <t0> <t1>         render seconds [t0, t1) and encode out/range_<t0>_<t1>.mp4
 *   node render.js test <t> [t ...]        stills at times -> stills/test_<t>.jpg
 *   node render.js sheet <t0> <t1> [n=8]   n stills across [t0,t1] tiled -> stills/sheet_<t0>_<t1>.jpg
 *   node render.js encode                  encode existing frames/ -> out/quorum-v3-silent.mp4 (+ out/quorum-v3.mp4)
 *   node render.js verify <t> [t ...]      determinism check: renders each t, then all again in reverse order, compares
 *   flags: --workers=8 --fps=30 --quality=92 --no-encode
 * Page errors (scene exceptions) are printed; test/sheet exit code 2 if any occurred.
 */
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const puppeteer = require(path.resolve(__dirname, '../node_modules/puppeteer-core'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const URL = 'file:///' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');
const DUR = 150;

const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const [k, v] = a.slice(2).split('=');
  if (v !== undefined) flags[k] = v;
  else if (['workers', 'fps', 'quality'].includes(k) && argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
  else flags[k] = true;
}
const FPS = +(flags.fps || 30), WORKERS = +(flags.workers || 8), QUALITY = +(flags.quality || 92);
const dir = d => { const p = path.join(ROOT, d); fs.mkdirSync(p, { recursive: true }); return p; };
const ARGS = ['--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-ipc-flooding-protection', '--font-render-hinting=none'];

async function worker(tag) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS });
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log(`  [page ${tag}]`, m.text()); });
  p.on('pageerror', e => console.log(`  [pageerror ${tag}]`, e.message));
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction('window.__ready === true', { timeout: 20000 });
  const fontsOk = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 42px "Segoe UI"') && document.fonts.check('16px Consolas'); });
  if (!fontsOk) console.log(`  [warn ${tag}] fonts not confirmed loaded`);
  // warm-up: visit every scene once so fallback fonts / canvas sprites are loaded before real frames
  await p.evaluate(() => { for (let t = 0; t < (window.DURATION || 150); t += 1.5) { window.render(t); document.body.getBoundingClientRect(); } });
  await p.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ type: 'jpeg', quality: 10 });
  const shot = async (t, file, q = QUALITY, extra) => {
    await p.evaluate((t, extra) => { window.render(t); if (extra) { let d = document.getElementById('__stamp'); if (!d) { d = document.createElement('div'); d.id = '__stamp'; d.style.cssText = 'position:absolute;right:14px;top:10px;z-index:99;font:600 30px Consolas;color:#fff;background:rgba(0,0,0,.6);padding:2px 10px;border-radius:6px'; document.body.appendChild(d); } d.textContent = extra; } }, t, extra || null);
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
  const out = dir('out');
  const silent = path.join(out, outName || 'quorum-v3-silent.mp4');
  ffmpeg(['-framerate', String(FPS), '-start_number', String(f0), '-i', path.join(ROOT, 'frames', '%05d.jpg'), '-frames:v', String(f1 - f0),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent]);
  console.log('wrote', silent);
  const wav = path.join(ROOT, 'audio', 'soundtrack.wav');
  if (!outName && fs.existsSync(wav)) {
    const final = path.join(out, 'quorum-v3.mp4');
    ffmpeg(['-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
    console.log('wrote', final);
  }
}

async function renderFrames(f0, f1) {
  const out = dir('frames'); const t0 = Date.now(); let done = 0; const W = Math.min(WORKERS, f1 - f0);
  let errs = 0, tReady = 0;
  await Promise.all([...Array(W)].map(async (_, w) => {
    let k = await worker(w);
    tReady = Math.max(tReady, Date.now());
    for (let f = f0 + w; f < f1; f += W) {
      const file = path.join(out, String(f).padStart(5, '0') + '.jpg');
      for (let attempt = 0; ; attempt++) {   // watchdog: a stalled Chrome gets relaunched
        let timer; const to = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 20000); });
        try { await Promise.race([k.shot(f / FPS, file), to]); clearTimeout(timer); break; }
        catch (e) { clearTimeout(timer); console.log(`  worker ${w} frame ${f}: ${e.message}, relaunching`); try { k.b.process() && k.b.process().kill(); } catch (_) { } if (attempt >= 2) throw e; k = await worker(w); }
      }
      if (++done % 150 === 0) console.log(`${done}/${f1 - f0} frames  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${(done / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
    }
    errs += (await k.errors()).length; await k.b.close();
    if (flags.verbose) console.log(`  worker ${w} done at ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }));
  const s = (Date.now() - t0) / 1000;
  console.log(`rendered ${done} frames in ${s.toFixed(1)}s = ${(done / s).toFixed(2)} fps with ${W} workers incl. startup; steady-state ~${(done / ((Date.now() - tReady) / 1000)).toFixed(2)} fps`);
  if (errs) console.log(`WARNING: ${errs} page errors during render`);
}

async function stills(times, name, stamp) {
  const out = dir('stills'); const W = Math.max(1, Math.min(4, times.length)); const files = []; let errs = [];
  await Promise.all([...Array(W)].map(async (_, w) => {
    const k = await worker(w);
    for (let i = w; i < times.length; i += W) {
      const t = times[i]; const f = path.join(out, name(t, i)); files[i] = f;
      await k.shot(t, f, 90, stamp ? `t=${t.toFixed(2)}` : null);
    }
    errs = errs.concat(await k.errors()); await k.b.close();
  }));
  if (errs.length) { console.log('PAGE ERRORS:\n  ' + [...new Set(errs)].join('\n  ')); process.exitCode = 2; }
  return files;
}

(async () => {
  const mode = pos[0];
  if (mode === 'test') {
    const times = pos.slice(1).map(Number);
    const files = await stills(times, t => `test_${t}.jpg`, false);
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
    const times = pos.slice(1).map(Number); const k = await worker(0); const A = {}; let bad = 0;
    for (const t of times) { await k.p.evaluate(t => window.render(t), t); A[t] = await k.p.screenshot({ type: 'png' }); }
    for (const t of times.slice().reverse()) { await k.p.evaluate(t => window.render(t), 0); await k.p.evaluate(t => window.render(t), t); const B = await k.p.screenshot({ type: 'png' }); const same = Buffer.compare(A[t], B) === 0; if (!same) bad++; console.log(`t=${t}: ${same ? 'identical' : 'DIFFERENT (state leaks between frames!)'}`); }
    await k.b.close(); process.exitCode = bad ? 3 : 0;
  } else if (mode === 'encode') {
    encode(0, Math.round(DUR * FPS));
  } else if (mode === 'range') {
    const a = +pos[1], b = +pos[2]; const f0 = Math.round(a * FPS), f1 = Math.round(b * FPS);
    await renderFrames(f0, f1);
    if (!flags['no-encode']) encode(f0, f1, `range_${a}_${b}.mp4`);
  } else {
    const total = Math.round(DUR * FPS);
    await renderFrames(0, total);
    if (!flags['no-encode']) encode(0, total);
  }
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
