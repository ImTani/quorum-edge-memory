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
    const stops = s.insert && window.SHOW_STOPS && window.SHOW_STOPS[s.insert];
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
      const r = await fetch('audio/sfx.wav'); this.buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.pickShots();
    } catch (e) { console.warn('[show] audio unavailable', e); }
  },
  /** one isolated example of each SFX type in the film's stem, for show-only scenes past the film's end */
  pickShots() {
    const cues = (window.CUES && CUES.sfx) || [];
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i], prev = cues[i - 1], next = cues[i + 1];
      const gapBefore = prev ? c.t - prev.t : 9, gapAfter = next ? next.t - c.t : 9;
      const quality = Math.min(gapBefore, gapAfter);
      const cur = this.shots[c.type];
      if (!cur || quality > cur.q) this.shots[c.type] = { t: c.t, dur: Math.min(c.dur || .6, gapAfter, 1.2), q: quality };
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
  const end = P.play.b; P.play = null;
  if (snap) { Audio.stop(); draw(end); }
}

function play(a, b, sceneId) {
  stopPlay(false);
  draw(a);
  if (b <= a) return;
  Audio.segment(a, b, sceneId);
  const t0 = performance.now();
  P.play = { a, b };
  const tick = now => {
    if (!P.play) return;
    const t = a + (now - t0) / 1000;
    if (t >= b) { draw(b); P.play = null; return; }
    draw(t);
    P.raf = requestAnimationFrame(tick);
  };
  P.raf = requestAnimationFrame(tick);
}

/** live-demo camera: frame a rect of the real stage (its own 1920x1080 px); the stage stays clickable */
function liveFrame(name) {
  const r = (window.LIVE_FRAMES || {})[name];
  let z = 1, tx = 0, ty = 0;
  if (r) {
    const pad = 16;
    z = Math.min(1920 / (r[2] + 2 * pad), 1080 / (r[3] + 2 * pad));
    tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - (r[0] + r[2] / 2) * z));
    ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - (r[1] + r[3] / 2) * z));
  }
  frame.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${z.toFixed(4)})`;
}

function setLive(on) {
  P.live = on;
  liveEl.classList.toggle('on', on);
  body.classList.toggle('live', on);
  if (on) { if (!frame.src) frame.src = LIVE_URL; }
  else if (document.activeElement === frame) frame.blur();
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
    liveFrame(s.frame);
    if (!P.live) setLive(true);
    return;
  }
  const [a, b] = s.film;
  const wasLive = P.live;
  if (wasLive) setLive(false);
  if (!forward) { Audio.stop(); if (Math.abs(P.t - b) < 1e-3 && !wasLive) return; through(() => draw(b)); return; }
  const continues = !wasLive && Math.abs(P.t - a) < .05;
  if (continues) play(a, b, s.sfxScene);
  else if (wasLive && Math.abs(P.t - a) < .05) play(a, b, s.sfxScene);   // the film under the live demo is already there
  else through(() => play(a, b, s.sfxScene));
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
function applyToggles(st) {
  for (const k of Object.keys(toggles)) if (k in st) toggles[k] = !!st[k];
  blankEl.classList.toggle('on', toggles.blank);
  Audio.mute(toggles.mute);
  body.classList.toggle('captions', toggles.captions);
}
function local(c, extra) {
  if (c === 'next') show(P.cur + 1);
  else if (c === 'back') show(P.cur - 1);
  else if (c === 'goto') show(extra.step | 0);
  else if (c in toggles) { toggles[c] = !toggles[c]; applyToggles({}); }
}
function report() { const st = $('show-status'); if (st) st.textContent = `${P.cur + 1} / ${STEPS.length}${Net.ok ? '' : ' · local'}`; }

function connect() {
  if (!/^https?:$/.test(location.protocol)) return;
  const meta = STEPS.map(s => ({ title: s.title, say: s.say || '', do: s.do || '', live: !!s.live }));
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
fetch('/api/now').then(() => {
  const host = location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? '<laptop ip>' : location.hostname;
  $('arm-info').textContent = `phone remote: http://${host}:${location.port || 80}/remote\n${STEPS.length} steps · live demo ${LIVE_URL}`;
}).catch(() => { $('arm-info').textContent = `${STEPS.length} steps · no show server: keys only`; });
const st = document.createElement('div'); st.id = 'show-status'; body.appendChild(st);
frame.src = LIVE_URL;              // load early so the live stage is connected long before it's shown
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
