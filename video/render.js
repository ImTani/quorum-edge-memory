// usage: node render.js [fps] [workers] [start] [end]   or  node render.js test t1 t2 ...
const puppeteer = require('puppeteer-core');
const path = require('path'); const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.resolve(__dirname, 'src/index.html').replace(/\\/g, '/');
const DUR = 120;
(async () => {
  const args = process.argv.slice(2); const extra = [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-device-scale-factor=1'] });
  const mk = async () => { const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-device-scale-factor=1'] }); extra.push(b); const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 }); await p.goto(URL); await p.evaluate(() => document.fonts.ready); return p; };
  if (args[0] === 'test') {
    const p = await mk(); fs.mkdirSync(path.join(__dirname, 'stills'), { recursive: true });
    for (const t of args.slice(1)) { await p.evaluate(t => window.render(t), +t); await p.screenshot({ path: path.join(__dirname, 'stills', `test_${t}.jpg`), type: 'jpeg', quality: 85 }); }
    process.exit(0);
  }
  const fps = +(args[0] || 30), W = +(args[1] || 6);
  const total = Math.round(DUR * fps);
  const s0 = +(args[2] || 0), s1 = +(args[3] || total);
  const out = path.join(__dirname, 'frames'); fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now(); let done = 0;
  await Promise.all([...Array(W)].map(async (_, w) => {
    const p = await mk();
    for (let f = s0 + w; f < s1; f += W) {
      await p.evaluate(t => window.render(t), f / fps);
      await p.screenshot({ path: path.join(out, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 });
      if (++done % 200 === 0) console.log(done, 'frames', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }));
  console.log('done', done, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  process.exit(0);
})();
