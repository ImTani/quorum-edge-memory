/* Virtual clock, injected before any page script (page.evaluateOnNewDocument) by capture.js.
 *
 * The page's sense of time (performance.now, Date, setTimeout/setInterval, requestAnimationFrame,
 * Math.random) is replaced by a clock that only moves when capture.js calls window.__vt.advance(ms).
 * CSS animations and transitions are paused every step and seeked to the virtual time that has passed
 * since they started (Web Animations API), so a frame at ct = k/30 always looks the same, however long
 * the screenshot took in real time. Loading happens at virtual time 0.
 *
 * Exposed: window.__vt = { now (ms), advance(ms) -> Promise, settle() -> Promise }.
 */
(function () {
  'use strict';
  if (window.__vt) return;
  const realST = window.setTimeout.bind(window);
  const realRAF = window.requestAnimationFrame.bind(window);
  const RealDate = window.Date;
  const WALL0 = RealDate.parse('2026-10-03T19:02:00+05:30');   // the demo's wall clock at ct 0

  let now = 0, seq = 0, rafSeq = 0;
  const timers = new Map();        // id -> {at, fn, args, iv, order}
  const rafs = new Map();          // id -> fn

  Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(WALL0 + now); else super(...a); }
    static now() { return WALL0 + now; }
  }
  window.Date = VDate;

  window.setTimeout = function (fn, ms, ...args) { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args, iv: 0, order: id }); return id; };
  window.setInterval = function (fn, ms, ...args) { const id = ++seq; const iv = Math.max(1, +ms || 0); timers.set(id, { at: now + iv, fn, args, iv, order: id }); return id; };
  window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };
  window.requestAnimationFrame = function (fn) { const id = ++rafSeq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = function (id) { rafs.delete(id); };

  // mulberry32: same "random" sequence every take
  let rs = 0x51A8E7;
  Math.random = function () { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const macrotask = () => new Promise(r => realST(r, 0));     // lets every pending microtask run
  const realFrame = () => new Promise(r => realRAF(() => r()));

  const started = new WeakMap();   // Animation -> virtual ms at which it started
  function syncAnimations() {
    let list = [];
    try { list = document.getAnimations(); } catch (e) { return; }
    for (const a of list) {
      let s = started.get(a);
      if (s == null) { s = now; started.set(a, s); }
      try { if (a.playState !== 'paused') a.pause(); a.currentTime = Math.max(0, now - s); } catch (e) { /* ignore */ }
    }
  }

  function call(fn, args) {
    try { if (typeof fn === 'function') fn(...args); else (0, eval)(String(fn)); }
    catch (e) { console.error('[vclock] ' + (e && e.stack || e)); }
  }

  window.__vt = {
    get now() { return now; },
    /** Move the clock forward by ms: fire due timers in time order (each followed by its microtasks),
     *  then one animation frame at the new time, then seek CSS animations. */
    async advance(ms) {
      const end = now + Math.max(0, ms);
      for (let guard = 0; guard < 100000; guard++) {
        let best = null, bestId = 0;
        for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best.at || (t.at === best.at && t.order < best.order))) { best = t; bestId = id; }
        if (!best) break;
        if (best.at > now) now = best.at;
        if (best.iv) { best.at += best.iv; best.order = ++seq; } else timers.delete(bestId);
        call(best.fn, best.args);
        await macrotask();
      }
      now = end;
      const list = [...rafs.values()]; rafs.clear();
      for (const fn of list) call(fn, [now]);
      await macrotask();
      syncAnimations();
      await realFrame();          // style, layout, ResizeObserver callbacks
      syncAnimations();
    },
    /** Seek animations again and wait one real frame (call after input events, before a screenshot). */
    async settle() { await macrotask(); syncAnimations(); await realFrame(); syncAnimations(); },
    pending() { return timers.size; },
  };
})();
