// Render the Q&A deck (site/deck.html) to a PDF, one slide per 16:9 page.
// usage (from the repo root): node scripts/render_deck_pdf.js [out.pdf]
// Uses puppeteer-core from video/node_modules and the installed Chrome; installs nothing.
const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../video/node_modules/puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../deck/Quorum-Deck.pdf'));

// Print layout: every slide visible, unscaled, on its own 1600x900 page; navigation chrome hidden.
const PRINT_CSS = `
  @page { size: 1600px 900px; margin: 0; }
  html, body { overflow: visible !important; height: auto !important; background: #e6e9ee !important; }
  .deck { position: static !important; transform: none !important; width: 1600px !important; height: auto !important; }
  .slide { position: relative !important; inset: auto !important; width: 1600px; height: 900px; visibility: visible !important;
           opacity: 1 !important; transition: none !important; break-after: page; page-break-after: always;
           border-radius: 0 !important; box-shadow: inset 0 0 0 14px #b9bfc8, inset 0 0 0 15px #9ea5b0 !important; }
  .slide:last-child { break-after: auto; page-break-after: auto; }
  .hud, .flows, [data-play], .play-btn { display: none !important; }
  * { animation: none !important; }
`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    userDataDir: path.resolve(__dirname, '../.cache/chrome-pdf-profile') });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto('file:///' + path.resolve(__dirname, '../site/deck.html').split(path.sep).join('/') + '#5', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Slide 5 is interactive: play the sync flow to the end so the page shows the lit path and steps.
  const flow = await page.$('.flows button[data-flow="sync"]');
  if (flow) { await flow.click(); await new Promise((r) => setTimeout(r, 6500)); }
  await page.addStyleTag({ content: PRINT_CSS });
  await page.emulateMediaType('print');
  await new Promise((r) => setTimeout(r, 300));
  await page.pdf({ path: OUT, width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true });
  const slides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`wrote ${OUT} (${slides} slides)`, errors.length ? errors : '');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
