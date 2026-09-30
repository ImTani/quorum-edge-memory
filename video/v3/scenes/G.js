/* Scene G: Meanwhile (74–82 s). Continuous with F and H via the shared engine in F.js (window.FGH).
 * 74.0 camera pulls back, Tanishk's window shrinks left (still offline, outbox 1)
 * 74.4 Lakshya's window slides in right (Online) · 75.0 home-server hub + links (A link dashed "no signal")
 * 75.5 email drops into Lakshya's inbox · 76.35 captured as a claim · 76.45–77.0 spark flies into the cloud
 * 77.0 GREEN point born "16th · client email · synced" · 78 caption
 */
(function () {
'use strict';
const X = window.FGH, K = X.K;
let S;

Scene({
  id: 'G', start: 74, end: 82,
  fadeIn: 0, fadeOut: 0, drift: 0,     // seamless joins with F and H (identical frames at the boundaries)
  captions: [[78, 81.8, 'Meanwhile, in the studio, Lakshya is online.']],

  build(root) { S = X.buildStage(root); },

  render(t) {
    const live = t < 82;                 // at t = 82 H draws the identical frame on top
    S.wrap.style.visibility = live ? 'visible' : 'hidden'; S.fxc.style.visibility = S.wrap.style.visibility;
    if (!live) return;
    X.renderStage(S, t);
    X.declareCloud(t);

    // the email becomes a claim: a spark leaves the inbox and is born as the green point (77.0)
    const ctx = S.ctx;
    if (t >= K.claim16 && t < K.born16 + .6) {
      const r = S.L.mail.getBoundingClientRect();
      const from = [r.left + 24, r.top + r.height * .55];
      const pr = cloud.project(cloud.KEYS.email16);
      const to = [pr.x, pr.y];
      const path = X.quad(from, [lerp(from[0], to[0], .45), Math.min(from[1], to[1]) - 150], to);
      X.comet(ctx, path, t, K.claim16 + .1, K.born16, COL.green, 1, { r: 13, trail: 30, colorAt: u => mixColor('#9DA9FF', COL.green, clamp(u * 1.4)) });
    }
  }
});
})();
