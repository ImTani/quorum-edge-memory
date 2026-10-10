/* Quorum stage show player. Plays the v4 film's time segments live, one step per keypress, and holds.
 * The film engine stays a pure function of t (window.render); this file only chooses t over wall time.
 * Position lives on the show server (show/server.py) so the projector and the phone remote can't drift;
 * opened without the server (file://) it runs on local keys alone. */
(function () {
'use strict';
const q = new URLSearchParams(location.search);
const LIVE_URL = q.get('live') || 'http://127.0.0.1:8001/stage?look=studio';
const FILM_END = (window.CUES && CUES.duration) || 168;
const $ = id => document.getElementById(id);
const body = document.body, liveEl = $('live'), frame = $('live-frame'), fadeEl = $('jumpfade'), blankEl = $('blank'), armEl = $('arm');

/* ---------------------------------------------------------------- fit to any projector */
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  body.style.setProperty('--s', s.toFixed(5));
  body.style.setProperty('--ox', ((innerWidth - 1920 * s) / 2).toFixed(1) + 'px');
  body.style.setProperty('--oy', ((innerHeight - 1080 * s) / 2).toFixed(1) + 'px');
}
// Scaling starts only once the board is built: scenes measure word positions in build() (wordRect),
// and those measurements must be taken at 1:1. See boot() below.
addEventListener('resize', () => { if (window.__ready) fit(); });

/* ---------------------------------------------------------------- steps */
function expand(list) {
  const out = [];
  for (const s of list) {
    const stops = s.insert && window.SHOW_STOPS && (window.SHOW_STOPS[s.insert] || []).filter(st => st.t <= (s.upTo ?? Infinity));
    if (stops && stops.length) {
      let a = s.film[0];
      stops.forEach((st, i) => {
        out.push({ title: st.title || `${s.title} ${i + 1}`, say: st.say || (i === 0 ? s.say : ''), film: [a, st.t], sfxScene: s.insert });
        a = st.t;
      });
    } else out.push({ ...s, sfxScene: s.insert });
  }
  return out;
}
const STEPS = expand(window.SHOW_STEPS || []);

/* ---------------------------------------------------------------- audio: the film's SFX stem, sliced live */
const Audio = {
  ctx: null, buf: null, gain: null, playing: [], muted: false, shots: {},
  async init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
      // the stage stem (show/sfx_show.py: softer marker and eraser) when it's been rendered, else the film's
      let r = await fetch('audio/sfx_show.wav');
      if (!r.ok) r = await fetch('audio/sfx.wav');
      this.buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      refreshPreflight();
      this.pickShots();
    } catch (e) { console.warn('[show] audio unavailable', e); }
  },
  /** one clean example of each SFX type in the film's stem, for show-only scenes past the film's end.
   * Each type plays for its natural length; the pick prefers a cue with silence before it and room after. */
  LEN: { click_down: .12, click_up: .22, key_tick: .08, toggle_clack: .28, sticky_slap: .45, marker_squeak: .6, ui_pop: .3,
    paper_whoosh: .9, disconnect_thud: .6, sync_whoosh: .8, counter_tick: .15, conflict_hit: 1.2, alert_chime: 1.2,
    resolve_chime: 1.2, logo_hit: 1.5 },
  pickShots() {
    const cues = ((window.CUES && CUES.sfx) || []).slice().sort((a, b) => a.t - b.t);
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i], len = this.LEN[c.type] || .5;
      const before = i ? c.t - cues[i - 1].t : 9, after = i < cues.length - 1 ? cues[i + 1].t - c.t : 9;
      const score = Math.min(before, 1) + 2 * Math.min(after / len, 1);
      const cur = this.shots[c.type];
      if (!cur || score > cur.score) this.shots[c.type] = { t: c.t, dur: len, score };
    }
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  stop() { for (const s of this.playing) { try { s.stop(); } catch (e) { /* already stopped */ } } this.playing = []; },
  src(offset, dur, when = 0) {
    if (!this.buf || this.muted || dur <= 0) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf; s.connect(this.gain);
    s.start(this.ctx.currentTime + when, offset, dur); this.playing.push(s);
  },
  /** sound for the film segment a -> b: the stem itself inside the film, scene one-shots past its end */
  segment(a, b, sceneId) {
    this.stop();
    if (a < FILM_END) this.src(a, Math.min(b, FILM_END) - a);
    const list = (window.SHOW_SFX && sceneId && window.SHOW_SFX[sceneId]) || [];
    for (const [t, type] of list) {
      const shot = this.shots[type];
      if (shot && t > a - 1e-6 && t <= b) this.src(shot.t, shot.dur, t - a);
    }
  },
  mute(on) { this.muted = on; if (on) this.stop(); },
};

/* ---------------------------------------------------------------- playback */
const P = { cur: -1, t: 0, play: null, raf: 0, live: false };

function draw(t) { P.t = t; window.render(t); for (const d of [.1, .2, .35, .5]) window.prefetch && window.prefetch(t + d); }

function stopPlay(snap) {
  if (!P.play) return;
  cancelAnimationFrame(P.raf);
  const end = P.play.end ?? P.play.b; P.play = null;
  if (snap) { Audio.stop(); draw(end); }
}

function play(a, b, sceneId, done) {
  stopPlay(false);
  draw(a);
  if (b <= a) { if (done) done(); return; }
  Audio.segment(a, b, sceneId);
  const t0 = performance.now();
  P.play = { a, b };
  const tick = now => {
    if (!P.play) return;
    const t = a + (now - t0) / 1000;
    if (t >= b) { draw(b); P.play = null; if (done) done(); return; }
    draw(t);
    P.raf = requestAnimationFrame(tick);
  };
  P.raf = requestAnimationFrame(tick);
}

function setLive(on) {
  P.live = on;
  liveEl.classList.toggle('on', on);
  body.classList.toggle('live', on);
  if (on) { if (!frame.src) frame.src = LIVE_URL; }
  else if (document.activeElement === frame) frame.blur();
}

/** a step with a lead-in segment (`lead: [a, b, sceneId]`) plays it, then cuts to its own film segment */
function playStep(s) {
  const [a, b] = s.film;
  if (!s.lead) { play(a, b, s.sfxScene); return; }
  const [la, lb, lsc] = s.lead;
  play(la, lb, lsc, () => play(a, b, s.sfxScene));
  if (P.play) P.play.end = b;
}

let fadeTimer = 0;
/** fade through paper, run fn at full cover, fade back. A newer step cancels a pending one. */
function through(fn) {
  clearTimeout(fadeTimer);
  fadeEl.classList.add('on');
  fadeTimer = setTimeout(() => { fadeTimer = 0; fn(); requestAnimationFrame(() => fadeEl.classList.remove('on')); }, 290);
}
function cancelThrough() {
  if (!fadeTimer) return;
  clearTimeout(fadeTimer); fadeTimer = 0;
  fadeEl.classList.remove('on');
}

/** go to step i. Forward by one plays it; anything else lands on its held end state, silently. */
function show(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  const from = P.cur, s = STEPS[i];
  if (i === from) return;
  const forward = i === from + 1;
  cancelThrough();
  stopPlay(true);
  P.cur = i;
  report();
  if (s.live) {
    if (!P.live) setLive(true);
    return;
  }
  const [a, b] = s.film;
  const wasLive = P.live;
  if (wasLive) setLive(false);
  if (!forward) { Audio.stop(); if (Math.abs(P.t - b) < 1e-3 && !wasLive) return; through(() => draw(b)); return; }
  const start = s.lead ? s.lead[0] : a;
  const continues = Math.abs(P.t - start) < .05;   // also true under the live demo: the film is already there
  if (continues || s.cut) playStep(s);              // cut: the frames meet on the board, no fade needed
  else through(() => playStep(s));
}

/* ---------------------------------------------------------------- server sync */
const Net = { ok: false, es: null };
function post(path, data) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
function cmd(c, extra = {}) {
  if (Net.ok) post('/api/cmd', { cmd: c, ...extra }).catch(() => local(c, extra));
  else local(c, extra);
}
const toggles = { blank: false, mute: false, captions: false };
const Deck = { slide: null, el: $('qa'), frame: $('qa-frame') };
/** Q&A: the deck (site/deck.html) over the show, at a slide; null hides it and the show is where it was */
function setDeck(slide) {
  Deck.slide = slide;
  Deck.el.classList.toggle('on', slide != null);
  body.classList.toggle('qa', slide != null);
  if (slide == null) { if (document.activeElement === Deck.frame) Deck.frame.blur(); return; }
  try { Deck.frame.contentWindow.location.hash = '#' + slide; } catch (e) { Deck.frame.src = '/site/deck.html#' + slide; }
}
function applyToggles(st) {
  for (const k of Object.keys(toggles)) if (k in st) toggles[k] = !!st[k];
  blankEl.classList.toggle('on', toggles.blank);
  Audio.mute(toggles.mute);
  body.classList.toggle('captions', toggles.captions);
  if ('deck' in st && st.deck !== Deck.slide) setDeck(st.deck);
}
/** Next/Back skip backup steps (skip: true), as the server does */
function stepFrom(i, d) {
  let j = i + d;
  while (j >= 0 && j < STEPS.length && STEPS[j].skip) j += d;
  return j >= 0 && j < STEPS.length ? j : i;
}
function local(c, extra) {
  if (c === 'next') show(stepFrom(P.cur, 1));
  else if (c === 'back') show(stepFrom(P.cur, -1));
  else if (c === 'goto') show(extra.step | 0);
  else if (c in toggles) { toggles[c] = !toggles[c]; applyToggles({}); }
  else if (c === 'deck') setDeck(extra.slide ?? null);
  else if (c === 'deck_step' && Deck.slide != null) setDeck(Math.max(1, Deck.slide + (extra.delta || 1)));
}
function report() { const st = $('show-status'); if (st) st.textContent = `${P.cur + 1} / ${STEPS.length}${Net.ok ? '' : ' · local'}`; }

function connect() {
  if (!/^https?:$/.test(location.protocol)) return;
  const meta = STEPS.map(s => ({ title: s.title, say: s.say || '', do: s.do || '', live: !!s.live, skip: !!s.skip }));
  post('/api/steps', { steps: meta }).then(() => {
    const es = new EventSource('/api/events'); Net.es = es;
    es.onopen = () => { Net.ok = true; report(); };
    es.onerror = () => { Net.ok = false; report(); };
    es.onmessage = ev => {
      const st = JSON.parse(ev.data);
      applyToggles(st);
      if (st.step !== P.cur) { arm(); show(st.step); }
    };
  }).catch(() => { Net.ok = false; report(); });
}

/* ---------------------------------------------------------------- keys (keyboard and clickers) */
let armed = false;
function arm() { if (armed) return; armed = true; armEl.classList.add('off'); Audio.resume(); }

function onKey(key, e) {
  if (!armed) { arm(); e && e.preventDefault(); return; }
  if (key === 'u' || key === 'U') { peekConnect(!armEl.classList.contains('peek')); return; }
  if (key === 'q' || key === 'Q') { cmd('deck', { slide: Deck.slide == null ? 2 : null }); return; }
  if (Deck.slide != null) {          // Q&A: the keys page the deck; Q or Escape goes back to the show
    if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(key)) { e && e.preventDefault(); cmd('deck_step', { delta: 1 }); }
    else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(key)) { e && e.preventDefault(); cmd('deck_step', { delta: -1 }); }
    else if (key === 'Escape') cmd('deck', { slide: null });
    else if (key === 'b' || key === 'B' || key === '.') cmd('blank');
    return;
  }
  if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(key)) { e && e.preventDefault(); cmd('next'); }
  else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(key)) { e && e.preventDefault(); cmd('back'); }
  else if (key === 'b' || key === 'B' || key === '.') cmd('blank');
  else if (key === 'c' || key === 'C') cmd('captions');
  else if (key === 'm' || key === 'M') cmd('mute');
  else if (key === 'Home') cmd('goto', { step: 0 });
  else if (key === 'p' || key === 'P') body.classList.toggle('pointer');
  else if (key === 'f' || key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
  else if (key === 'r' || key === 'R') { if (frame.src) frame.src = frame.src; }
  else if (key === 'F5') { e && e.preventDefault(); cmd('next'); }   // many clickers send F5 for "start show"
}
addEventListener('keydown', e => onKey(e.key, e));
addEventListener('click', e => { if (!armed) arm(); });
// the embedded stage forwards clicker keys (app/web/stage.html), so a clicker keeps working after a click in the demo
addEventListener('message', e => { if (e.data && e.data.quorumKey) onKey(e.data.quorumKey, null); });

/* ---------------------------------------------------------------- start */
/** the phone remote's address (the server knows the laptop's real IP) and its QR code; refreshed while
 * the card is up, so switching the laptop to a phone hotspot shows the new address */
function refreshConnect() {
  fetch('/api/remote').then(r => r.json()).then(j => {
    const urls = j.urls || [];
    const bare = u => u.replace(/^http:\/\//, '');
    $('arm-url').textContent = urls[0] ? bare(urls[0]) : 'no network';
    $('arm-more').textContent = urls.slice(1).map(u => 'or ' + bare(u)).join('\n');
    $('arm-qr').src = '/api/qr.svg?v=' + encodeURIComponent(urls[0] || '');
    $('arm-info').textContent = `${STEPS.length} steps · live demo ${LIVE_URL}`;
  }).catch(() => {
    $('arm-url').textContent = 'no show server'; $('arm-qr').removeAttribute('src');
    $('arm-info').textContent = `${STEPS.length} steps · keys only`;
  });
}
/** pre-flight: the server's checks (demo up, connected, freshly reset; model; phone) plus this page's own */
function refreshPreflight() {
  const local = [
    { name: 'Sound', ok: Audio.buf ? true : 'warn', detail: Audio.buf ? `loaded (${Audio.muted ? 'muted' : 'on'})` : 'not loaded: the show runs silent' },
    { name: 'Show scenes', ok: ['S16', 'S17', 'S18'].every(k => window.SHOW_STOPS && window.SHOW_STOPS[k]), detail: `${STEPS.length} steps` },
  ];
  const draw = checks => {
    $('preflight').innerHTML = checks.map(c => {
      const cls = c.ok === true ? 'ok' : c.ok === 'warn' ? 'warn' : 'fail', mark = c.ok === true ? '✓' : c.ok === 'warn' ? '!' : '✕';
      return `<li class="${cls}"><i>${mark}</i><span>${c.name}<small>${c.detail}</small></span></li>`;
    }).join('');
  };
  fetch('/api/preflight').then(r => r.json()).then(j => draw([...(j.checks || []), ...local])).catch(() => draw(local));
}
refreshConnect(); refreshPreflight();
setInterval(() => { if (!armEl.classList.contains('off')) { refreshConnect(); refreshPreflight(); } }, 3000);
/** U: bring the connect card back over the show (any time the phone needs to reconnect) */
function peekConnect(on) {
  armEl.classList.toggle('off', !on);
  armEl.classList.toggle('peek', on);
  $('arm-msg').textContent = on ? 'Scan to connect the phone · U to close' : 'Press any key or click to start';
  if (on) { refreshConnect(); refreshPreflight(); }
}
const st = document.createElement('div'); st.id = 'show-status'; body.appendChild(st);
frame.src = LIVE_URL;              // load early so the live stage is connected long before it's shown
Deck.frame.src = '/site/deck.html#2';
Audio.init();
// main.js builds the board after the fonts load; start once window.render exists
(function boot() {
  if (!window.__ready) { setTimeout(boot, 50); return; }
  fit();
  show(0);
  connect();
  window.SHOW = { STEPS, P, show, Audio };
})();
})();
