/* main.js: builds all registered scenes once, then exposes window.render(t).
 * Frame order: cloud._begin -> scenes (by start) -> static captions -> cloud draw -> caption -> black.
 * Pure function of t: nothing here depends on the previous frame. */
(function () {
'use strict';
window.DURATION = 150;
window.__errors = [];
const logErr = (where, e) => { const m = `[${where}] ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`; window.__errors.push(m); console.error(m); };
window.addEventListener('error', ev => logErr('window', ev.error || ev.message));

const stage = document.getElementById('stage');
const cv = document.getElementById('cloud'), fxc = document.getElementById('fx');
const back = cv.getContext('2d'), front = fxc.getContext('2d');
const capBox = document.getElementById('cap'), capT = document.getElementById('capt');
const black = document.getElementById('black'), bg = document.getElementById('bg');

/** Global per-frame knobs scenes may write inside render(): */
window.Q = {
  t: 0,
  fx: front,           // front canvas 2D context (above DOM, below captions). Cleared every frame.
  black: 0,            // fade-to-black amount; max() of what scenes set this frame
  setBlack(v) { Q.black = Math.max(Q.black, clamp(v)); },
  scene: null,         // the scene currently rendering
};

SCENES.sort((a, b) => a.start - b.start);
for (const s of SCENES) {
  s.root = el('div', { cls: 'scene', attrs: { id: 'scene-' + s.id } }, stage);
  s.root.style.zIndex = s.z;
  try { s.build(s.root, s); } catch (e) { logErr('build ' + s.id, e); s._broken = true; }
}

function fadeOf(s, t) {
  const fi = s.start <= 0 ? 0 : s.fadeIn, fo = s.end >= DURATION ? 0 : s.fadeOut;
  const a = fi > 0 ? easeInOutSine(P(t, s.start - fi / 2, fi)) : (t >= s.start ? 1 : 0);
  const b = fo > 0 ? 1 - easeInOutSine(P(t, s.end - fo / 2, fo)) : ((s.end >= DURATION ? t <= s.end : t < s.end) ? 1 : 0);
  return Math.min(a, b);
}

window.render = function (t) {
  t = +t; Q.t = t; Q.black = 0;
  _cap.list.length = 0;
  front.setTransform(1, 0, 0, 1, 0, 0); front.globalAlpha = 1; front.globalCompositeOperation = 'source-over'; front.clearRect(0, 0, W, H);
  cloud._begin(t);
  bg.style.transform = `translate(${(t * 4) % 60}px,${(t * 2) % 60}px)`;

  for (const s of SCENES) {
    const f = fadeOf(s, t);
    if (f <= 0.0005 || s._broken) { if (s.root.style.display !== 'none') s.root.style.display = 'none'; continue; }
    s.root.style.display = 'block';
    s.root.style.opacity = f;
    const lt = t - s.start, dur = s.end - s.start;
    s.root.style.transform = s.drift ? `scale(${1 + s.drift * clamp(lt / dur, -.1, 1.1)})` : 'none';
    Q.scene = s; cloud._enterScene(f);
    try { s.render(t, lt, f); } catch (e) { logErr('render ' + s.id + ' @' + t.toFixed(2), e); }
    cloud._leaveScene(); Q.scene = null;
    for (const [a, b, text, o] of s.captions) caption(text, t, a, b, o || {});
  }

  try { cloud._render(t, back, front); } catch (e) { logErr('cloud', e); }

  // caption: strongest of the frame wins
  let best = null; for (const c of _cap.list) if (!best || c.a >= best.a) best = c;
  if (best) {
    capBox.style.display = 'block';
    if (best.o.html) setHTML(capT, best.text); else setText(capT, best.text);
    capBox.style.opacity = best.a; capBox.style.transform = `translateY(${best.rise * 14}px)`;
  } else capBox.style.display = 'none';

  black.style.opacity = Q.black;
  return window.__errors.length;
};

window.__ready = true;
window.render(0);
})();
