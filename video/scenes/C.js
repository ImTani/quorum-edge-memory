/* Scene C: Title (24–32 s). REFERENCE IMPLEMENTATION of the framework API.
 * 24.0 cloud particles stream out of the 3D cloud and assemble "QUORUM"
 * 26.0 wordmark locks with a light sweep · 27.0 subtitle · 28.5 tagline
 */
(function () {
  const START = 24, END = 32, LOCK = 26.0;
  const BASE_Y = 480;
  let wm, parts = [], line, sub, tagWords;

  Scene({
    id: 'C', start: START, end: END,
    drift: .03,

    build(root) {
      // Canvas wordmark (crisp text + glow) and particle targets sampled from the same pixels.
      wm = makeWordmark({ text: 'QUORUM', size: 200, weight: 800, spacing: 44, cx: 960, baseY: BASE_Y });
      const S = wm.samples(5), bb = wm.bbox;
      parts = S.map(([x, y], i) => {
        const xn = (x - bb.x) / bb.w;
        const pal = rand(i, 3);
        return {
          x, y, src: i % cloud.N,
          start: START + .55 * xn + rand(i, 1) * .28,        // left-to-right stream
          dur: .95 + rand(i, 2) * .25,                       // all arrive by ~26.0
          bend: (rand(i, 4) - .5) * 420,                     // curved flight path
          size: .8 + rand(i, 5) * .7,
          color: pal < .55 ? '#9DA9FF' : pal < .85 ? '#C9D2FF' : pal < .95 ? '#7C8CFF' : '#FFFFFF',
          ph: rand(i, 6) * 6.283,
        };
      });

      // hairline under the wordmark
      line = el('div', { cls: 'abs', style: `left:560px;width:800px;top:${BASE_Y + 42}px;height:2px;background:linear-gradient(90deg,transparent,rgba(124,140,255,.9),transparent)` }, root);
      sub = el('div', { cls: 'abs', style: `left:0;right:0;top:${BASE_Y + 70}px;text-align:center;font-size:48px;font-weight:500;color:#C9D0E0;letter-spacing:.5px`,
        html: 'Offline-first team memory on <span style="color:#9DA9FF;font-weight:600">Qdrant Edge</span>' }, root);
      const tag = el('div', { cls: 'abs', style: `left:0;right:0;top:${BASE_Y + 175}px;text-align:center;font-size:40px;font-weight:500;color:#E8ECF4`,
        html: "Your team's memory, on every laptop, <span class='amber' style='font-weight:600'>even with no signal.</span>" }, root);
      // split into words for a stagger (keep the amber span's words amber)
      tagWords = [];
      for (const node of Array.from(tag.childNodes)) {
        const isSpan = node.nodeType === 1; const words = node.textContent.trim().split(/\s+/);
        const frag = document.createDocumentFragment();
        words.forEach((w) => {
          const s = el('span', { text: w, style: 'display:inline-block;margin:0 .13em' + (isSpan ? ';color:#F5A524;font-weight:600' : '') });
          frag.appendChild(s); tagWords.push(s);
        });
        tag.replaceChild(frag, node);
      }
    },

    render(t, lt, fade) {
      // ---- the 3D cloud behind: centred, slow push-in; it dims as its particles leave ----
      const leave = easeInOutCubic(P(t, START, 2.0));
      cloud.set({ opacity: lerp(.55, .28, leave), spin: .035 });
      cloud.setCamera({ target: [0, 0, 0], dist: lerp(4.9, 4.1, easeInOutSine(P(t, START - .5, END - START + .5))), yaw: .15, pitch: .32, orbit: .02, fov: 46 });

      // ---- particles + wordmark are drawn on the cloud canvas (under the DOM) ----
      cloud.draw2D((ctx, t, f) => {
        const proj = cloud.projector();
        const s = 1 + .03 * clamp((t - START) / (END - START), -.1, 1.1);  // match the root drift zoom
        ctx.setTransform(s, 0, 0, s, 960 * (1 - s), 540 * (1 - s));
        const lock = E(t, LOCK, .35, easeOutCubic);
        const settle = P(t, LOCK, 1.2);
        for (let i = 0; i < parts.length; i++) {
          const q = parts[i];
          if (t < q.start - .05) continue;
          const k = easeInOutCubic(P(t, q.start, q.dur));
          let x, y;
          if (k < 1) {
            const sp = proj(cloud.ambientLocal(q.src, t)); const sx = sp.vis ? sp.x : 960, sy = sp.vis ? sp.y : 540;
            const mx = (sx + q.x) / 2 + q.bend * .35, my = (sy + q.y) / 2 - q.bend;  // quadratic bezier control
            const u = 1 - k; x = u * u * sx + 2 * u * k * mx + k * k * q.x; y = u * u * sy + 2 * u * k * my + k * k * q.y;
          } else {
            x = q.x + Math.sin(t * 2.1 + q.ph) * .8; y = q.y + Math.cos(t * 1.7 + q.ph) * .8;
          }
          const inA = P(t, q.start, .25);
          const flight = k > 0 && k < 1 ? 1.35 : 1;                            // brighter while flying
          const arrive = pulse(t, q.start + q.dur, .12);                       // tiny flash on arrival
          const post = lerp(1, .22 + .12 * Math.sin(t * 3 + q.ph), lock);      // dim once the crisp text locks
          const a = f * inA * post * (.55 + .45 * arrive) * flight;
          drawGlow(ctx, x, y, (6 + 5 * arrive) * q.size, q.color, a * .85, true);
        }
        // crisp wordmark + glow + light sweep
        const sweep = easeInOutSine(P(t, LOCK + .05, .6));   // ~120px diagonal specular pass, 26.05-26.65
        const bloom = pulse(t, LOCK + .06, .16);
        wm.draw(ctx, f * lock, sweep > 0 && sweep < 1 ? sweep : -1, 1 + bloom * 1.5 + .15 * Math.sin(t * 1.3));
        // soft flare at lock
        drawGlow(ctx, 960, BASE_Y - 70, 520 * (.6 + .4 * bloom), '#7C8CFF', f * bloom * .35, false);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      });

      // ---- DOM text ----
      const lk = easeOutExpo(P(t, LOCK + .25, .9));
      line.style.opacity = lk * .9; line.style.transform = `scaleX(${lk})`;
      show(sub, t, 27.0, .8, { dy: 22, blur: 8 });
      staggerIn(tagWords, t, 28.5, .07, { d: .6, dy: 18, blur: 6 });
    }
  });
})();
