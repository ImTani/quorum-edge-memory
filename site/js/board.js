// The hero whiteboard: a small simulation of Quorum on two laptops and the team hub.
// It mirrors the real app's story (app/CONTRACT.md demo script) in the browser; nothing here talks
// to a server. The page states that it's a simulation in the section below the board.

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- line boil: crisp, vector, subtle ----------
// Hand-drawn animation redraws a line a few times and cycles the drawings. Each marker path gets
// three slightly jittered variants of its own coordinates, swapped ~7 times a second; handwriting
// and notes get a sub-pixel wobble through the translate/rotate properties (which compose with
// their existing tilt). Nothing is rasterised, so it stays sharp at any zoom.
const BOIL_MS = 140;
const PATH_AMP = 0.45;   // in each drawing's own viewBox units
const TEXT_AMP = 0.3;    // px
const ROT_AMP = 0.25;    // deg

function jitterPath(d, amp, seed) {
  let i = 0;
  const rand = () => { const x = Math.sin(seed * 9301 + (i++) * 49297) * 233280; return x - Math.floor(x); };
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (n) => (parseFloat(n) + (rand() * 2 - 1) * amp).toFixed(2));
}

function setupBoil() {
  if (reduceMotion) return;
  const paths = [...document.querySelectorAll('svg.boil path, g.boil path, .sticky .strike path')]
    .filter((p) => !p.closest('.lock') && !/[aA]/.test(p.getAttribute('d') || ''));
  const frames = paths.map((p, k) => {
    const d = p.getAttribute('d');
    return [d, jitterPath(d, PATH_AMP, k + 1), jitterPath(d, PATH_AMP, k + 101)];
  });
  const texts = [...document.querySelectorAll('svg text')].filter((t) => t.closest('.boil'));
  const blocks = () => document.querySelectorAll('.boil:not(svg):not(g)');
  let frame = 0;
  let last = 0;
  const tick = (t) => {
    if (t - last >= BOIL_MS && !document.hidden) {
      last = t;
      frame = (frame + 1) % 3;
      paths.forEach((p, k) => p.setAttribute('d', frames[k][frame]));
      texts.forEach((el, k) => {
        const s = Math.sin((k + 1) * 12.9898 + frame * 78.233) * 43758.5453;
        el.style.translate = `${((s - Math.floor(s)) * 2 - 1) * TEXT_AMP}px 0`;
      });
      blocks().forEach((el, k) => {
        const a = Math.sin((k + 1) * 12.9898 + frame * 78.233) * 43758.5453;
        const b = Math.sin((k + 7) * 4.1414 + frame * 39.425) * 24634.6345;
        const c = Math.sin((k + 3) * 7.7777 + frame * 11.11) * 12345.678;
        const r = (v) => (v - Math.floor(v)) * 2 - 1;
        el.style.translate = `${(r(a) * TEXT_AMP).toFixed(2)}px ${(r(b) * TEXT_AMP).toFixed(2)}px`;
        el.style.rotate = `${(r(c) * ROT_AMP).toFixed(3)}deg`;
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- board state ----------
const ORIGINAL_NOTE = 'Client just called: Sharma delivery moves to the 18th.';
const EMAIL_DAY = 16;
const el = {
  toggle: $('hub-toggle'), toggleLabel: $('hub-label'),
  tNote: $('t-note'), tText: $('t-note-text'), tMeta: $('t-note-meta'),
  pad: $('pad'),
  wNote: $('w-note'), wText: $('w-note-text'), wEmail: $('w-email'),
  lEmail: $('l-email'), lMeta: $('l-email-meta'),
  wallCount: $('wall-count'),
  loop: $('loop'), verdict: $('verdict'), gauge: $('gauge'), needle: $('needle'), sim: $('sim-text'),
  owner: $('owner'), ownerText: $('owner-text'), ownerRow: $('owner-row'),
  keep18: $('keep-18'), keep16: $('keep-16'), eraser: $('eraser'), live: $('board-live'),
};

const state = { online: true, noteText: ORIGINAL_NOTE, noteDay: 18, noteOnWall: true, conflict: true, resolved: null };
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const say = (msg) => { el.live.textContent = msg; };
const show = (node, on) => node.classList.toggle('is-hidden', !on);

// Where the needle sits on the hand-drawn gauge: the dashed tick is 0.82 at x=246.
function setSimilarity(sim) {
  const x = (sim - 0.90) * 275;
  el.needle.style.transform = `translateX(${x}px)`;
  el.sim.textContent = sim.toFixed(2);
}

// A note about the Sharma job with a date. Mirrors the app: same job (matched by meaning) plus a
// different value = a conflict; same job and the same date = nothing to settle.
function readNote(text) {
  const t = text.toLowerCase();
  const sameJob = /sharma|wedding edit|delivery/.test(t);
  const m = t.match(/\b([0-3]?\d)(?:st|nd|rd|th)?\b(?:\s*(?:of\s*)?(?:oct|october))?/);
  const day = m ? Number(m[1]) : null;
  const sim = /sharma/.test(t) ? 0.90 : (sameJob ? 0.86 : 0.41);
  return { sameJob: sameJob && sim >= 0.82, day: day && day >= 1 && day <= 31 ? day : null, sim };
}

function setStrike(node, on) {
  const p = node.querySelector('.strike path');
  if (p) p.style.transition = reduceMotion ? 'none' : 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)';
  if (p) p.style.strokeDashoffset = on ? '0' : '160';
  node.classList.toggle('superseded', on);
}

function render() {
  el.toggle.setAttribute('aria-checked', String(state.online));
  el.toggleLabel.textContent = state.online ? 'on the hub' : 'no signal';
  el.tText.textContent = state.noteText;
  el.wText.textContent = state.noteText;
  el.tMeta.innerHTML = state.online
    ? (state.noteOnWall ? 'Note · 14:02, no signal<br>synced on reconnect' : 'Note · just now<br>synced to the team')
    : 'Note · just now, no signal<br>waiting for the hub';
  el.wNote.classList.toggle('gone', !state.noteOnWall);
  el.wallCount.textContent = `${state.noteOnWall ? 18 : 17} notes · nothing private`;
  el.loop.classList.toggle('erased', !(state.conflict && state.noteOnWall && !state.resolved));
  show(el.verdict, state.noteOnWall);
  show(el.gauge, state.noteOnWall);
  show(el.owner, state.conflict && state.noteOnWall);
  show(el.ownerRow, !state.resolved);
  const keptNote = state.resolved !== null && state.resolved !== EMAIL_DAY;
  setStrike(el.wNote, state.resolved === EMAIL_DAY);
  setStrike(el.wEmail, keptNote);
  setStrike(el.lEmail, keptNote);
  el.keep18.textContent = `Keep ${state.noteDay} Oct`;
  el.lMeta.innerHTML = keptNote ? `Email · Rohit Sharma<br>settled: ${state.resolved} Oct, by Tanishk` : 'Email · Rohit Sharma<br>synced to the team';
}

function setVerdict(text, tone) {
  el.verdict.textContent = text;
  el.verdict.className = `mark-text ${tone} boil` + (el.verdict.classList.contains('is-hidden') ? ' is-hidden' : '');
}

async function goOffline() {
  state.online = false;
  state.noteOnWall = false;
  state.conflict = false;
  state.resolved = null;
  render();
  say("Tanishk's laptop lost the hub. It still remembers and searches; new notes wait on the laptop.");
}

async function goOnline() {
  state.online = true;
  render();
  if (state.noteOnWall) return;
  // the note travels from his laptop to the team wall
  await wait(250);
  state.noteOnWall = true;
  const r = readNote(state.noteText);
  setSimilarity(r.sameJob ? r.sim : r.sim);
  if (r.sameJob && r.day && r.day !== EMAIL_DAY) {
    state.conflict = true;
    state.noteDay = r.day;
    setVerdict('same job · dates disagree!', 'red');
    el.ownerText.innerHTML = '<b>Tanishk owns this.</b> Quorum won\'t pick for him.';
    say(`Back on the hub. Quorum found the same job in Lakshya's email, similarity ${r.sim.toFixed(2)}, with a different date. It asks Tanishk instead of guessing.`);
  } else if (r.sameJob && r.day === EMAIL_DAY) {
    state.conflict = false;
    setVerdict('same job · same date, all good', 'green');
    say('Back on the hub. The note agrees with the email, so there is nothing to settle.');
  } else {
    state.conflict = false;
    setVerdict(r.sameJob ? 'same job · no date to compare' : 'new note · nothing to compare', 'blue');
    say('Back on the hub. The note reached the team wall; it does not disagree with anything.');
  }
  render();
}

el.toggle.addEventListener('click', () => (state.online ? goOffline() : goOnline()));

function resolve(day) {
  state.resolved = day;
  el.ownerText.innerHTML = `<b>Settled by Tanishk: ${day} Oct.</b> Lakshya's laptop has it too.`;
  setVerdict(day === EMAIL_DAY ? 'kept the email · 16 Oct' : `kept the call · ${day} Oct`, 'green');
  render();
  say(`Tanishk kept ${day} October. The other version is kept as history, struck through, on both laptops.`);
}
el.keep18.addEventListener('click', () => resolve(state.noteDay));
el.keep16.addEventListener('click', () => resolve(16));

// ---------- writing a note on the pad ----------
el.pad.addEventListener('click', () => {
  if (document.querySelector('.writer')) return;
  const w = document.createElement('div');
  w.className = 'writer boil';
  w.style.left = '14px';
  w.style.top = '250px';
  w.innerHTML = `<label class="sr-only" for="note-input">Write Tanishk's note</label>
    <textarea id="note-input" maxlength="120" placeholder="e.g. Client says the Sharma edit is due the 20th"></textarea>
    <div class="row"><span>on Tanishk's laptop</span><span><button type="button" data-act="cancel">Cancel</button> <button type="button" data-act="save">Stick it</button></span></div>`;
  $('lane-t').appendChild(w);
  const ta = w.querySelector('textarea');
  ta.focus();
  const close = () => { w.remove(); el.pad.focus(); };
  const save = async () => {
    const text = ta.value.trim();
    if (!text) return close();
    w.remove();
    state.noteText = text;
    state.resolved = null;
    if (state.online) {
      state.noteOnWall = false;
      render();
      await goOnline();
    } else {
      render();
      say("Saved on Tanishk's laptop. It waits there until he's back on the hub.");
    }
  };
  w.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act === 'cancel') close();
    if (act === 'save') save();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
  });
});

// ---------- the eraser wipes the board back to the start ----------
el.eraser.addEventListener('click', () => {
  document.querySelector('.writer')?.remove();
  Object.assign(state, { online: true, noteText: ORIGINAL_NOTE, noteDay: 18, noteOnWall: true, conflict: true, resolved: null });
  setSimilarity(0.90);
  setVerdict('same job · dates disagree!', 'red');
  el.ownerText.innerHTML = '<b>Tanishk owns this.</b> Quorum won\'t pick for him.';
  render();
  say('Board wiped back to the start.');
});

// ---------- early access forms ----------
document.querySelectorAll('form.cta').forEach((form) => {
  const sib = form.nextElementSibling;
  const note = sib && sib.classList.contains('cta-note') ? sib : null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (note) { note.textContent = 'That email looks off. Try name@yourteam.com.'; note.className = 'cta-note err'; }
      form.email.focus();
      return;
    }
    if (note) note.textContent = '';
    const slip = document.createElement('div');
    slip.className = 'signed boil';
    slip.setAttribute('role', 'status');
    slip.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 21 L17 30 L33 10" fill="none" stroke="#14895a" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<p><b>You\'re on the list.</b><br>We\'ll write to <span class="addr"></span> when your team\'s invite is ready.</p>';
    slip.querySelector('.addr').textContent = email;
    form.replaceWith(slip);
  });
});

// ---------- fixed compositions scale as one object on narrower screens ----------
// The board and the matching diagram are drawn at a design size; below it they scale down whole
// (never reflow), so every sticky and marker stroke stays where it was drawn.
function fitAll() {
  document.querySelectorAll('[data-fit]').forEach((box) => {
    const inner = box.firstElementChild;
    const [w, h] = box.dataset.fit.split('x').map(Number);
    const s = Math.min(1, box.clientWidth / w);
    inner.style.width = w + 'px';
    inner.style.height = h + 'px';
    inner.style.transform = s < 1 ? `scale(${s})` : '';
    box.style.height = (h * s) + 'px';
  });
}
window.addEventListener('resize', fitAll);
fitAll();

setSimilarity(0.90);
render();
setupBoil();
