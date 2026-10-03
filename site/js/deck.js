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
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(slides.length - 1);
});
window.addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  if (e.clientX > window.innerWidth * 0.66) go(cur + 1);
  else if (e.clientX < window.innerWidth * 0.33) go(cur - 1);
});
window.addEventListener('hashchange', fromHash);
window.addEventListener('resize', fit);
fit();
fromHash();
