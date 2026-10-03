// Q&A deck navigation: arrows / space / PageUp-Down / Home-End, click left or right third, #n deep links.
const slides = [...document.querySelectorAll('.slide')];
const deck = document.getElementById('deck');
const counter = document.getElementById('counter');
let cur = 0;

function fit() {
  const s = Math.min(window.innerWidth / 1660, window.innerHeight / 960);
  deck.style.setProperty('--s', String(s));
}

function go(i, push = true) {
  cur = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((el, k) => el.classList.toggle('on', k === cur));
  counter.textContent = `${cur + 1} / ${slides.length}`;
  document.title = `${slides[cur].dataset.title || 'Quorum'} · Quorum Q&A`;
  if (push && location.hash !== `#${cur + 1}`) history.replaceState(null, '', `#${cur + 1}`);
}

function fromHash() {
  const n = parseInt(location.hash.slice(1), 10);
  go(Number.isFinite(n) ? n - 1 : 0, false);
}

window.addEventListener('keydown', (e) => {
  // Space / Enter on a focused button (flow buttons, component boxes, play) belongs to the button.
  if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')) return;
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(slides.length - 1);
});
window.addEventListener('click', (e) => {
  // The interactive architecture slide never turns on click; use the keys or the HUD there.
  if (e.target.closest('a, button, .diagram, .info, .arch-slide')) return;
  if (e.clientX > window.innerWidth * 0.66) go(cur + 1);
  else if (e.clientX < window.innerWidth * 0.33) go(cur - 1);
});
window.addEventListener('hashchange', fromHash);
window.addEventListener('resize', fit);
fit();
fromHash();

// ---------- interactive architecture diagram ----------
const ARCH = {
  ui: { t: 'Browser UI', file: 'app/web/device.js · stage.js · cloud.js',
    what: 'One device UI component, mounted twice on the stage against each device\'s API. Loads /api/state once, then applies claim, conflict, sync and activity events from SSE. The cloud is a canvas with a fixed 3D projection of each claim\'s text vector.',
    why: 'No build step, nothing to install; SSE is one-way and simpler than websockets for a live feed.' },
  api: { t: 'FastAPI device app', file: 'app/edge/api.py',
    what: 'Routes: ingest, ask, net (offline switch), resolve (owner only), draft, inbox, events. Runs the capture pipeline and owns the event bus.',
    why: 'Async SSE plus a thread pool for blocking shard calls; one small process per device keeps devices truly separate.' },
  extract: { t: 'Extractor', file: 'app/edge/extract.py',
    what: 'Sends the message and the device\'s known entity names to the local model, gets JSON back, snaps names to known entities, resolves date phrases in code, validates values against the text. Regex fallback if the model is slow, down or wrong.',
    why: 'A small local model is private but imprecise, so code owns dates and checks; the demo never stalls.' },
  ollama: { t: 'Ollama · llama3.2', file: 'localhost:11434',
    what: '3B model kept resident (keep_alive 60m), JSON output, 6 s budget per message. After a connection error it is skipped for 20 s.',
    why: 'Nothing private leaves the laptop: no cloud calls in the capture path.' },
  answer: { t: 'Answers', file: 'app/edge/answer.py',
    what: 'Builds the reply from retrieved claims: disputed claims lead with both sources, "due this week" lists dated claims in the next 7 days, every sentence cites a claim.',
    why: 'Milliseconds, no hallucinated facts, always traceable to a source.' },
  memory: { t: 'Memory · Qdrant Edge shard', file: 'app/edge/memory.py',
    what: 'One EdgeShard per device. Each claim is a point with three named vectors: text (meaning), key (entity + attribute), bm25 (keywords). Hybrid search with RRF; filtered kNN on key for conflicts; flush after every write.',
    why: 'Vectors, keywords and payload filters in one on-device query, offline, with the same data model as the hub.' },
  conflicts: { t: 'Conflict engine', file: 'app/edge/conflicts.py',
    what: 'check(): key-vector query, same attribute, live claims, ≥ 0.82, different value. resolve(): winner active, loser superseded, resolution claim. apply_remote_resolution() for decisions made elsewhere.',
    why: 'A deterministic rule and a hashed id let every laptop reach the same conflict without talking.' },
  store: { t: 'Store · SQLite', file: 'app/edge/store.py',
    what: 'Outbox (deduped by claim id, gen counter), conflicts, activity log, key-value (pull cursor). WAL mode, one connection behind a lock.',
    why: 'Durable across restarts and crashes; nothing to run or configure.' },
  sync: { t: 'Sync worker', file: 'app/edge/sync.py',
    what: '1 s loop: push the outbox (oldest change first, batches of 64), then pull changes since the cursor. A middleware on the transport blocks traffic while offline and counts bytes. Backoff to 5 s on hub errors.',
    why: 'Sync is a background concern; the device never waits on the network to remember or answer.' },
  hub: { t: 'Team hub · Qdrant server', file: 'app/hub/bin/qdrant.exe · collection quorum_team',
    what: 'Stores team and my-devices claims with their vectors; payload indexes for the pull filter. It runs no logic of its own.',
    why: 'A relay that can be any Qdrant server; all intelligence stays on the devices.' },
  lakshya: { t: 'Lakshya\'s device', file: 'same code, own data dir',
    what: 'A second process with its own shard and SQLite. It detects the same conflicts on its own and applies resolutions it pulls.',
    why: 'Two real edge nodes, so sync and agreement are real, not simulated.' },
};
const FLOWS = {
  capture: { t: 'Capture a note', steps: [
    ['ui', 'ui-api', 'POST /api/ingest with the note.'],
    ['extract', 'api-extract', 'Extractor builds the prompt with known entities.'],
    ['ollama', 'extract-ollama', 'llama3.2 returns JSON; code resolves the date.'],
    ['memory', 'api-memory', 'Claim stored with text, key and bm25 vectors.'],
    ['store', 'api-store', 'Team claim queued in the outbox.'],
    ['conflicts', 'memory-conflicts', 'Key-vector query checks for a disagreement.'],
    ['ui', 'ui-api', 'Claim (and conflict) events stream to the UI.'] ] },
  ask: { t: 'Ask a question', steps: [
    ['ui', 'ui-api', 'POST /api/ask.'],
    ['memory', 'api-memory', 'Hybrid query: BM25 + dense, RRF, status filter.'],
    ['answer', 'api-answer', 'Templated answer with citations, disputed first.'],
    ['ui', 'ui-api', 'Answer returned in 7–70 ms.'] ] },
  sync: { t: 'Sync and conflict', steps: [
    ['store', 'sync-store', 'Worker peeks the outbox.'],
    ['memory', 'sync-memory', 'Reads each claim\'s current payload and vectors.'],
    ['hub', 'sync-hub', 'Upserts to the hub (idempotent ids).'],
    ['lakshya', 'lakshya-hub', 'Lakshya pulls changes since her cursor.'],
    ['conflicts', 'memory-conflicts', 'Each new claim runs conflict detection.'],
    ['ui', 'ui-api', 'Both laptops show the same conflict id.'] ] },
  resolve: { t: 'Resolve', steps: [
    ['ui', 'ui-api', 'Owner clicks Keep; others get 403.'],
    ['conflicts', 'api-conflicts', 'Winner active, loser superseded, resolution claim.'],
    ['store', 'conflicts-store', 'All three queued in the outbox.'],
    ['hub', 'sync-hub', 'Pushed to the hub.'],
    ['lakshya', 'lakshya-hub', 'Lakshya pulls and applies the decision.'] ] },
};

const diagram = document.getElementById('diagram');
if (diagram) {
  const info = document.getElementById('arch-info');
  const comps = [...diagram.querySelectorAll('.comp')];
  const edges = [...diagram.querySelectorAll('.edge')];
  let timer = null;
  const clear = () => { comps.forEach(c => c.classList.remove('on', 'lit')); edges.forEach(e => e.classList.remove('lit')); };
  const showComp = (id) => {
    const a = ARCH[id];
    info.innerHTML = `<p class="info-k">component</p><h3>${a.t}</h3><p class="info-file">${a.file}</p><p><b>What it does.</b> ${a.what}</p><p><b>Why.</b> ${a.why}</p>`;
  };
  comps.forEach(c => c.addEventListener('click', (e) => {
    e.stopPropagation();
    clearInterval(timer); clear();
    c.classList.add('on');
    document.querySelectorAll('.flows button').forEach(b => b.classList.remove('on'));
    showComp(c.dataset.c);
  }));
  document.querySelectorAll('.flows button').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearInterval(timer); clear();
    document.querySelectorAll('.flows button').forEach(b => b.classList.toggle('on', b === btn));
    const f = FLOWS[btn.dataset.flow];
    info.innerHTML = `<p class="info-k">flow</p><h3>${f.t}</h3><ol class="info-steps">${f.steps.map(s => `<li>${s[2]}</li>`).join('')}</ol>`;
    const lis = [...info.querySelectorAll('li')];
    let i = 0;
    const step = () => {
      if (i >= f.steps.length) { clearInterval(timer); return; }
      const [c, e2] = f.steps[i];
      diagram.querySelector(`.comp[data-c="${c}"]`)?.classList.add('lit');
      diagram.querySelector(`.edge[data-e="${e2}"]`)?.classList.add('lit');
      lis.forEach((li, k) => li.classList.toggle('cur', k === i));
      i++;
    };
    step();
    timer = setInterval(step, 900);
  }));
  info.innerHTML = '<p class="info-k">how to use</p><h3>Click any part</h3><p>Each part shows what it does, why we chose it, and where it lives in the code.</p><p>Or play a flow above to watch a request move through the system.</p>';
}

// ---------- optional play-through on the capture slide: lights each [data-step] in turn ----------
document.querySelectorAll('[data-play]').forEach((btn) => {
  const board = btn.closest('.slide');
  const parts = [...board.querySelectorAll('[data-step]')];
  const last = Math.max(...parts.map((p) => Number(p.dataset.step)));
  let timer = null;
  const reset = () => { board.classList.remove('playing'); parts.forEach((p) => p.classList.remove('cur', 'done')); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    reset();
    board.classList.add('playing');
    let i = 1;
    const tick = () => {
      if (i > last) { timer = setTimeout(reset, 1400); return; }
      parts.forEach((p) => { const s = Number(p.dataset.step); p.classList.toggle('cur', s === i); p.classList.toggle('done', s < i); });
      i += 1;
      timer = setTimeout(tick, 1100);
    };
    tick();
  });
});
