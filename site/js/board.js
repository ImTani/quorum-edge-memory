// The hero whiteboard: a small simulation of Quorum on two laptops and the team hub.
// It mirrors the real app's story (app/CONTRACT.md demo script) in the browser; nothing here talks
// to a server.

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
// The story on load is the conflict moment: Tanishk's 18th (a call) and Lakshya's 16th (the email)
// both on the team wall. Going offline never changes what the hub already holds. A new note waits
// on Tanishk's laptop until he's back, then joins the wall beside the others; nothing is overwritten.
const EMAIL_DAY = 16;
const CALL_DAY = 18;
const el = {
  toggle: $('hub-toggle'), toggleLabel: $('hub-label'),
  tNote: $('t-note'), tNew: $('t-new'), tNewText: $('t-new-text'), tNewMeta: $('t-new-meta'),
  pad: $('pad'),
  wNote: $('w-note'), wEmail: $('w-email'), wNew: $('w-new'), wNewText: $('w-new-text'), wNewMeta: $('w-new-meta'),
  lEmail: $('l-email'), lMeta: $('l-email-meta'),
  wallCount: $('wall-count'),
  loop: $('loop'), verdict: $('verdict'),
  owner: $('owner'), ownerText: $('owner-text'), ownerRow: $('owner-row'),
  keep18: $('keep-18'), keep16: $('keep-16'), keepNew: $('keep-new'),
  eraser: $('eraser'), live: $('board-live'),
};

const fresh = () => ({ online: true, note: null, resolved: null });
let state = fresh();
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const say = (msg) => { el.live.textContent = msg; };
const show = (node, on) => node.classList.toggle('is-hidden', !on);
const gone = (node, on) => node.classList.toggle('gone', on);

// What a note is about, the way the app decides it: the Sharma edit's due date, or something else.
function readNote(text) {
  const t = text.toLowerCase();
  const m = t.match(/\b([0-3]?\d)(?:st|nd|rd|th)?\b/);
  const day = m && Number(m[1]) >= 1 && Number(m[1]) <= 31 ? Number(m[1]) : null;
  const sharmaDue = /sharma/.test(t) && /(edit|delivery|wedding|due)/.test(t) && day !== null;
  return { text, day, sharmaDue };
}

function setStrike(node, on) {
  const p = node.querySelector('.strike path');
  if (p) {
    p.style.transition = reduceMotion ? 'none' : 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)';
    p.style.strokeDashoffset = on ? '0' : '160';
  }
  node.classList.toggle('superseded', on);
}

function relation(n) {
  if (!n.sharmaDue) return 'nothing to compare';
  if (n.day === EMAIL_DAY) return 'agrees with the email';
  if (n.day === CALL_DAY) return 'agrees with the call';
  return `same job · a third date`;
}

function render() {
  const n = state.note;
  const thirdDate = n && n.onWall && n.sharmaDue && n.day !== EMAIL_DAY && n.day !== CALL_DAY;
  el.toggle.setAttribute('aria-checked', String(state.online));
  el.toggleLabel.textContent = state.online ? 'on the hub' : 'no signal';

  gone(el.tNew, !n);
  gone(el.pad, !!n);
  gone(el.wNew, !(n && n.onWall));
  if (n) {
    el.tNewText.textContent = n.text;
    el.wNewText.textContent = n.text;
    el.tNewMeta.textContent = n.onWall ? 'Note · just now · on the team wall' : 'Note · just now · waiting for the hub';
    el.wNewMeta.textContent = `Note · Tanishk · ${relation(n)}`;
  }
  el.wallCount.textContent = `${18 + (n && n.onWall ? 1 : 0)} notes · nothing private`;

  const r = state.resolved;
  el.loop.classList.toggle('erased', r !== null);
  show(el.ownerRow, r === null);
  gone(el.keepNew, !thirdDate);
  if (thirdDate) el.keepNew.textContent = `Keep ${n.day} Oct`;
  if (r === null) {
    el.verdict.textContent = thirdDate ? 'same job · three dates now!' : 'same job · dates disagree!';
    el.verdict.className = 'mark-text red';
    el.ownerText.innerHTML = '<b>Tanishk owns this.</b> Quorum won\'t pick for him.';
  } else {
    el.verdict.textContent = `settled · ${r} Oct`;
    el.verdict.className = 'mark-text green';
    el.ownerText.innerHTML = `<b>Settled by Tanishk: ${r} Oct.</b> Lakshya's laptop has it too.`;
  }
  const struck = (day) => r !== null && day !== r;
  setStrike(el.wNote, struck(CALL_DAY));
  setStrike(el.tNote, struck(CALL_DAY));
  setStrike(el.wEmail, struck(EMAIL_DAY));
  setStrike(el.lEmail, struck(EMAIL_DAY));
  if (n && n.sharmaDue) { setStrike(el.wNew, struck(n.day)); setStrike(el.tNew, struck(n.day)); }
  el.lMeta.innerHTML = r !== null && r !== EMAIL_DAY ? `Email · Rohit Sharma<br>settled: ${r} Oct` : 'Email · Rohit Sharma<br>synced to the team';
}

async function sync() {
  const n = state.note;
  if (!state.online || !n || n.onWall) return;
  await wait(380);
  n.onWall = true;
  if (n.sharmaDue && n.day !== EMAIL_DAY && n.day !== CALL_DAY) state.resolved = null;
  render();
  say(n.sharmaDue
    ? (n.day === EMAIL_DAY || n.day === CALL_DAY
      ? `Tanishk's note reached the team wall. It agrees with the ${n.day === EMAIL_DAY ? 'email' : 'call'}, so it adds support, not a new conflict.`
      : `Tanishk's note reached the team wall: a third date for the Sharma edit. Quorum adds it to the disagreement and still asks Tanishk.`)
    : "Tanishk's note reached the team wall. It isn't about the Sharma edit, so there's nothing to compare.");
}

el.toggle.addEventListener('click', async () => {
  state.online = !state.online;
  render();
  if (!state.online) {
    say("Tanishk's laptop lost the hub. Everything already on the team wall stays; new notes wait on his laptop.");
  } else {
    say(state.note && !state.note.onWall ? 'Back on the hub. His waiting note goes up now.' : 'Back on the hub. Nothing was waiting.');
    await sync();
  }
});

function resolve(day) {
  state.resolved = day;
  render();
  say(`Tanishk kept ${day} October. The other versions stay as history, struck through, on both laptops.`);
}
el.keep18.addEventListener('click', () => resolve(CALL_DAY));
el.keep16.addEventListener('click', () => resolve(EMAIL_DAY));
el.keepNew.addEventListener('click', () => state.note && resolve(state.note.day));

// ---------- writing a note on the pad ----------
el.pad.addEventListener('click', () => {
  if (document.querySelector('.writer')) return;
  const w = document.createElement('div');
  w.className = 'writer boil';
  w.style.left = '14px';
  w.style.top = '250px';
  w.innerHTML = '<label class="sr-only" for="note-input">Write Tanishk\'s note</label>'
    + '<textarea id="note-input" maxlength="110" placeholder="e.g. Client says the Sharma edit is due the 20th"></textarea>'
    + '<div class="row"><span>on Tanishk\'s laptop</span><span><button type="button" data-act="cancel">Cancel</button> <button type="button" data-act="save">Stick it</button></span></div>';
  $('lane-t').appendChild(w);
  const ta = w.querySelector('textarea');
  ta.focus();
  const close = () => { w.remove(); el.pad.focus(); };
  const save = async () => {
    const text = ta.value.trim();
    if (!text) return close();
    w.remove();
    state.note = { ...readNote(text), onWall: false };
    render();
    if (state.online) await sync();
    else say("Saved on Tanishk's laptop. It waits there until he's back on the hub.");
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
  state = fresh();
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
// The board is drawn at a design size and zooms down whole (never reflows), so every sticky and
// stroke stays where it was drawn. Below 680px it never drops under 0.8, so type stays readable,
// and the lanes swipe sideways instead. The matching figure reflows in CSS below 680px.
function fitAll() {
  const narrow = window.matchMedia('(max-width: 680px)').matches;
  document.querySelectorAll('[data-fit]').forEach((box) => {
    const inner = box.firstElementChild;
    const [w, h] = box.dataset.fit.split('x').map(Number);
    if (narrow && box.dataset.reflow === 'narrow') {
      inner.style.zoom = ''; inner.style.width = ''; inner.style.height = '';
      return;
    }
    let s = Math.min(1, box.clientWidth / w);
    if (narrow) s = Math.max(0.8, s);
    inner.style.width = w + 'px';
    inner.style.height = h + 'px';
    inner.style.zoom = s < 1 ? String(s) : '';
  });
}
window.addEventListener('resize', fitAll);
fitAll();

render();
setupBoil();
