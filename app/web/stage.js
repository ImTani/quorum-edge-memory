// The demo stage: Tanishk's device (left), the team hub (centre), Lakshya's device (right).
// Both panes are the real device UI (device.js) against their own APIs; the hub column reads Qdrant
// directly. Captions, the beat tracker, and the tokens on the links are driven only by real events
// (each device's SSE stream and the presenter's own clicks). Nothing advances on its own.
import { createDeviceUI, esc, nameOf, valueOf, kindLabel } from './device.js';
import { COLORS } from './cloud.js';

const params = new URLSearchParams(location.search);
const BASES = {
  left: (params.get('left') || 'http://127.0.0.1:8001').replace(/\/$/, ''),
  right: (params.get('right') || 'http://127.0.0.1:8002').replace(/\/$/, ''),
};
const HUB = (params.get('hub') || 'http://127.0.0.1:6333').replace(/\/$/, '');
const COLLECTION = params.get('collection') || 'quorum_team';
const HUB_POLL_MS = 1000;
const CAPTION_HOLD_MS = 6000;     // a more important caption isn't replaced by a minor one this soon

const $ = sel => document.querySelector(sel);
const ATTR = { due_date: 'due date', birthday: 'birthday', assignee: 'assignee', location: 'location', amount: 'amount', count: 'count', status: 'status' };
const TONE = { amber: COLORS.queued, green: COLORS.synced, red: COLORS.disputed, violet: COLORS.private, indigo: COLORS.indigo };
const possessive = id => `${nameOf(id)}'s`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const quote = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 96 ? `${s.slice(0, 93).trimEnd()}…` : s; };

/* ------------------------------------------------------------------ panes */
const panes = {};
for (const side of ['left', 'right']) {
  const root = document.querySelector(`[data-pane="${side}"]`);
  const ui = createDeviceUI(root, { base: BASES[side], variant: 'stage' });
  panes[side] = { side, root, ui, known: new Set(), device: '' };
  ui.on(msg => onPaneMessage(panes[side], msg));
}
const paneOf = device => Object.values(panes).find(p => p.device === device);
const otherPane = pane => (pane.side === 'left' ? panes.right : panes.left);

/* --------------------------------------------------------------- captions */
const cap = { prio: 0, at: 0, key: null };
const capEls = { dot: $('[data-cap="dot"]'), head: $('[data-cap="head"]'), how: $('[data-cap="how"]'), src: $('[data-cap="src"]') };
const ARROW = '<svg class="cap-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Show a caption. prio: 1 background (sync traffic), 2 normal, 3 the moments (conflict, resolve).
 * force: the presenter just did this, so it always shows. key: lets a later event upgrade the same
 * caption in place (email captured -> "and synced it").
 */
function say({ tone = 'indigo', head, how = '', src = '', prio = 2, force = false, key = null, pane = null }) {
  const now = performance.now();
  if (!force && prio < cap.prio && now - cap.at < CAPTION_HOLD_MS) return false;
  Object.assign(cap, { prio, at: now, key });
  capEls.dot.style.background = TONE[tone] || tone;
  capEls.head.textContent = head;
  capEls.how.textContent = how;
  capEls.src.innerHTML = src;
  capEls.src.classList.toggle('hidden', !src);
  const bar = $('.caption-bar');
  bar.classList.remove('fresh'); void bar.offsetWidth; bar.classList.add('fresh');
  if (pane) spotlight(pane, tone);
  return true;
}

/** The pane where it happened gets a brief outline in the caption's colour. */
function spotlight(pane, tone) {
  pane.root.style.setProperty('--spot', TONE[tone] || tone);
  pane.root.classList.remove('spot'); void pane.root.offsetWidth; pane.root.classList.add('spot');
}

/** "Note said “…”  ->  Sharma wedding edit · due date · 18 Oct" */
function sourceLine(c) {
  if (!c?.source?.excerpt) return '';
  const what = `${esc(c.entity)}${ATTR[c.attribute] ? ` · ${esc(ATTR[c.attribute])}` : ''} · <b>${esc(valueOf(c))}</b>`;
  return `<span class="q-kind">${esc(kindLabel(c.source.kind))}:</span> <q>${esc(quote(c.source.excerpt))}</q>${ARROW}<span class="q-claim">${what}</span>`;
}

function conflictSources(pane, cf) {
  const claims = cf.claim_ids.map(id => pane.ui.state.claims.get(id)).filter(Boolean)
    .sort((a, b) => String(a.value).localeCompare(String(b.value)));
  return claims.map(c => `<span class="q-kind">${esc(kindLabel(c.source?.kind))}:</span> <q>${esc(quote(c.source?.excerpt))}</q>`).join('<span class="q-sep">vs</span>');
}

function learnedWhat(c) {
  if (c.attribute === 'due_date') return /^client|@/i.test(c.source?.author || '') || c.source?.kind === 'email' ? "the client's date" : 'a new date';
  return ATTR[c.attribute] ? `a new ${ATTR[c.attribute]}` : 'something new';
}

/* ------------------------------------------------------------ beat tracker */
const BEATS = [
  { label: "Ask what's due", next: "Lakshya asks “What's due this week?”" },
  { label: 'Tanishk loses the hub', next: "Turn off Tanishk's hub connection" },
  { label: 'Note saved, queued', next: 'Tanishk saves the client note' },
  { label: 'Email arrives, syncs', next: 'Lakshya clicks Receive on the email' },
  { label: 'Reconnect: conflict', next: "Reconnect Tanishk's device" },
  { label: 'Ask: disputed', next: 'Tanishk asks “When is the Sharma delivery?”' },
  { label: 'Owner settles', next: 'Lakshya asks Tanishk, Tanishk keeps one date' },
  { label: 'Team view', next: 'Switch a device to Team view' },
];
const done = new Set();
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function tick(n) { if (!done.has(n)) { done.add(n); renderBeats(); } }
function renderBeats() {
  const now = BEATS.findIndex((_, i) => !done.has(i + 1)) + 1;   // 0 when all done
  $('[data-beats]').innerHTML = BEATS.map((b, i) => {
    const n = i + 1, st = done.has(n) ? 'done' : n === now ? 'now' : 'todo';
    return `<li class="${st}" title="${esc(b.label)}"><span class="num">${st === 'done' ? CHECK : n}</span></li>`;
  }).join('');
  $('[data-beat-next]').innerHTML = now
    ? `<span class="k">Next · ${now} of 8</span> ${esc(BEATS[now - 1].next)}`
    : '<span class="k">Done</span> All 8 beats shown';
}
renderBeats();

/* ---------------------------------------------------------- event wiring */
function onPaneMessage(pane, msg) {
  if (msg.type === 'hydrate') {
    pane.device = msg.state.device;
    pane.known = new Set(msg.state.claims.keys());
    pane.root.setAttribute('aria-label', `${possessive(pane.device)} device`);
    setOffline(pane, !msg.state.sync?.online);
    refreshPrivacy();
    layoutLinks();
    return;
  }
  const who = pane.device, name = nameOf(who);
  if (msg.type === 'working') {
    const what = msg.what === 'email' ? 'the email' : 'the note';
    say({ tone: 'indigo', force: true, pane, head: `${possessive(who)} device is reading ${what}…`,
      how: 'A local model (llama3.2 via Ollama) turns it into a claim on the laptop itself. No cloud call; it takes a few seconds.' });
    return;
  }
  if (msg.type === 'answer') return onAnswer(pane, msg);
  if (msg.type === 'draft') {
    const owner = nameOf(msg.conflict.owner);
    say({ tone: 'indigo', force: true, pane, head: `${name} can't settle it, so Quorum drafted a message to ${owner}.`,
      how: `Only the owner decides. The app sends nothing; ${name} chooses whether to open it in email or WhatsApp.` });
    return;
  }
  if (msg.type === 'view') return onView(pane, msg.view);
  if (msg.type !== 'event') return;

  const { ev, prev } = msg;
  if (ev.type === 'sync') {
    // Compare with the last state the server reported (the UI flips its own copy optimistically).
    const online = !!ev.data.online;
    if (online !== !pane.offline) onNet(pane, online);
    return;
  }
  if (ev.type === 'claim') {
    const c = ev.data, isNew = !pane.known.has(c.claim_id);
    pane.known.add(c.claim_id);
    if (isNew && c.captured_by === who && c.attribute !== 'resolution' && c.source?.kind) onCapture(pane, c);
    if (c.tier === 'device') refreshPrivacy();
    return;
  }
  if (ev.type === 'conflict') return onConflict(pane, ev.data, prev);
  if (ev.type === 'activity') {
    const a = ev.data, m = /^(Pushed|Pulled) (\d+) claims?/.exec(a.text || '');
    if (a.kind === 'sync_push' && m) onPush(pane, +m[2]);
    if (a.kind === 'sync_pull' && m) onPull(pane, +m[2]);
  }
}

function onNet(pane, online) {
  setOffline(pane, !online);
  const who = pane.device;
  if (!online) {
    tick(2);
    say({ tone: 'amber', force: true, pane, head: `${possessive(who)} device lost the hub.`,
      how: 'It still remembers and searches. Everything stays on the device until it reconnects.' });
  } else {
    const queued = pane.ui.state.sync?.outbox || 0;
    say({ tone: 'green', force: true, prio: 1, pane, head: `${possessive(who)} device is back on the hub.`,
      how: queued ? `It sends its outbox first (${plural(queued, 'claim')}), then pulls what the team added while it was away.`
        : 'It pulls what the team added while it was away.' });
  }
}

function onCapture(pane, c) {
  const who = pane.device, online = !!pane.ui.state.sync?.online;
  const kind = c.source.kind === 'email' ? 'email' : c.source.kind === 'whatsapp' ? 'chat' : 'note';
  if (c.tier === 'device') {
    say({ tone: 'violet', force: true, pane, head: `Kept on ${possessive(who)} device only.`,
      how: `The local model read the ${kind} and marked this claim private. It never syncs; the hub can't see it.`, src: sourceLine(c) });
    return;
  }
  if (!online) {
    tick(3);
    say({ tone: 'amber', force: true, pane, head: `Saved on ${possessive(who)} device, queued.`,
      how: `The local model turned the ${kind} into a claim with its source. The hub doesn't have it yet.`, src: sourceLine(c) });
    return;
  }
  if (kind === 'email') tick(4);
  say({ tone: 'amber', force: true, pane, key: `capture:${c.claim_id}`, head: `${possessive(who)} device learned ${learnedWhat(c)}.`,
    how: `The local model read the ${kind} into a claim with its source, and queued it for the hub.`, src: sourceLine(c) });
  pane.lastCapture = { claim: c, kind, at: performance.now() };
}

function onPush(pane, n) {
  sendToken(pane, 'push', n);
  const lc = pane.lastCapture;
  if (lc && cap.key === `capture:${lc.claim.claim_id}`) {
    pane.lastCapture = null;
    say({ tone: 'green', force: true, pane, head: `${possessive(pane.device)} device learned ${learnedWhat(lc.claim)} and synced it.`,
      how: `The local model read the ${lc.kind} into a claim with its source. Now the hub has it; private claims stayed behind.`, src: sourceLine(lc.claim) });
    return;
  }
  say({ tone: 'green', prio: 1, pane, head: `${possessive(pane.device)} device sent ${plural(n, 'claim')} to the hub.`,
    how: 'Only claims marked for the team leave a device. Private ones never enter the outbox.' });
}

function onPull(pane, n) {
  sendToken(pane, 'pull', n);
  say({ tone: 'green', prio: 1, pane, head: `${possessive(pane.device)} device pulled ${plural(n, 'claim')} from the hub.`,
    how: 'Each pulled claim is checked against what this device already knows, on the device.' });
}

const conflictSeen = new Map();      // conflict_id -> Set(device)
function onConflict(pane, cf, prev) {
  const who = pane.device;
  if (cf.status === 'open' && !prev) {
    tick(5);
    const seen = conflictSeen.get(cf.conflict_id) || new Set();
    seen.add(who); conflictSeen.set(cf.conflict_id, seen);
    const sim = (+cf.similarity || 0).toFixed(2);
    const how = `Qdrant compared what each claim is about (not its value) and matched them at similarity ${sim}. Nothing was overwritten.`;
    say({ tone: 'red', prio: 3, force: seen.size > 1, pane,
      head: seen.size > 1 ? 'Both devices found the same disagreement on their own.' : `${possessive(who)} device found a disagreement on its own.`,
      how, src: conflictSources(pane, cf) });
    return;
  }
  if (cf.status === 'resolved' && prev?.status !== 'resolved') {
    tick(7);
    const by = cf.resolved_by, st = pane.ui.state;
    const winner = st.claims.get(cf.winner_claim_id);
    const loser = cf.claim_ids.map(id => st.claims.get(id)).find(c => c && c.claim_id !== cf.winner_claim_id);
    const lost = loser ? valueOf(loser) : 'the other version';
    if (by === who) {
      const other = otherPane(pane);
      say({ tone: 'green', prio: 3, force: true, pane, head: `${nameOf(by)} settled it: ${valueOf(winner) || 'one version'} kept.`,
        how: `${other.device ? `${possessive(other.device)} device gets` : 'The other device gets'} the decision through the hub on its next pull. ${lost} stays as history, marked superseded.` });
    } else {
      say({ tone: 'green', prio: 3, force: true, pane, head: `${nameOf(by)} settled it. ${possessive(who)} device applied the decision.`,
        how: `The decision travelled through the hub as a claim of its own. ${lost} is kept as history, marked superseded; nothing was deleted.` });
    }
  }
}

function onAnswer(pane, { r, view, online }) {
  const who = pane.device, ms = Math.round(r.took_ms ?? 0), n = (r.citations || []).length;
  const disputed = !!(r.disputed && (Array.isArray(r.disputed) ? r.disputed.length : true));
  if (disputed) {
    tick(6);
    const cf = r.conflict_id && pane.ui.state.conflicts.get(r.conflict_id);
    const owner = cf ? nameOf(cf.owner) : 'the owner';
    say({ tone: 'red', force: true, prio: 2, pane, head: `${possessive(who)} device won't guess: it's disputed.`,
      how: `It answered in ${ms} ms with both sources side by side. ${owner} owns the task, so ${owner} decides.`,
      src: cf ? conflictSources(pane, cf) : '' });
    return;
  }
  if (n) tick(1);
  const sources = n ? `, with ${plural(n, 'source')}` : '';
  const scope = view === 'team' ? ' Team view: only claims shared with the team were searched.' : '';
  if (!online) {
    say({ tone: 'amber', force: true, pane, head: `Answered on ${possessive(who)} device in ${ms} ms, with no hub.`,
      how: `Search runs on the device's own Qdrant Edge shard, so losing the hub costs nothing.${scope}` });
  } else {
    say({ tone: 'indigo', force: true, pane, head: `Answered on the device in ${ms} ms${sources}.`,
      how: `${possessive(who)} laptop searched its own Qdrant Edge shard, keywords and meaning together. No hub, no cloud.${scope}` });
  }
}

function onView(pane, view) {
  const who = pane.device;
  const hidden = [...pane.ui.state.claims.values()].filter(c => c.tier !== 'team' && c.attribute !== 'resolution' && c.status !== 'retracted').length;
  if (view === 'team') {
    tick(8);
    say({ tone: 'violet', force: true, pane, head: 'Team view hides device-only claims. The hub holds none of them.',
      how: `${possessive(who)} device now shows only what the team shares: ${plural(hidden, 'personal claim')} drop out. Device-only claims on the hub: ${hub.device ?? 0}.` });
  } else {
    say({ tone: 'indigo', force: true, pane, head: `Back to everything on ${possessive(who)} device.`,
      how: 'Mine includes private claims. They are searchable here and nowhere else.' });
  }
}

function setOffline(pane, offline) {
  pane.root.classList.toggle('is-offline', offline);
  pane.offline = offline;
  drawLinks();
}

/* -------------------------------------------------------------------- hub */
const hub = { ok: null, total: null, device: null, recent: [], seen: new Set(), first: true };

async function qdrant(path, body) {
  const res = await fetch(`${HUB}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()).result;
}

async function pollHub() {
  const base = `/collections/${encodeURIComponent(COLLECTION)}/points`;
  try {
    const [total, device, page] = await Promise.all([
      qdrant(`${base}/count`, { exact: true }),
      qdrant(`${base}/count`, { exact: true, filter: { must: [{ key: 'tier', match: { value: 'device' } }] } }),
      qdrant(`${base}/scroll`, {
        limit: 6, with_vector: false, order_by: { key: 'modified_at', direction: 'desc' },
        with_payload: ['claim_id', 'entity', 'value_label', 'attribute', 'tier', 'modified_by', 'captured_by', 'modified_at', 'text', 'version'],
      }),
    ]);
    hub.ok = true; hub.total = total.count; hub.device = device.count;
    hub.recent = (page.points || []).map(p => p.payload);
  } catch (err) {
    hub.ok = false; hub.error = err.message;
  }
  renderHub();
  setTimeout(pollHub, HUB_POLL_MS);
}

const TIER_BADGE = { team: 'Team', my_devices: 'My devices', device: 'Device only' };
function renderHub() {
  const node = $('[data-hub="node"]');
  node.classList.toggle('down', hub.ok === false);
  $('[data-hub="state"]').textContent = hub.ok === false ? 'unreachable' : hub.ok ? HUB.replace(/^https?:\/\//, '') : 'connecting…';
  $('[data-hub="total"]').textContent = hub.total ?? '–';
  const dev = $('[data-hub="device"]');
  dev.textContent = hub.device ?? '–';
  $('[data-hub="privacy"]').classList.toggle('breach', (hub.device || 0) > 0);
  refreshPrivacy();

  const list = $('[data-hub="recent"]');
  if (hub.ok === false) { list.innerHTML = `<li class="empty">Can't reach the hub at ${esc(HUB)}.</li>`; return; }
  if (!hub.recent.length) { list.innerHTML = '<li class="empty">Nothing on the hub yet.</li>'; return; }
  list.innerHTML = hub.recent.map(c => {
    const key = `${c.claim_id}:${c.version}`;
    const fresh = !hub.first && !hub.seen.has(key);
    hub.seen.add(key);
    const decision = c.attribute === 'resolution';
    const title = decision ? `Decision: ${c.entity}` : c.entity;
    const value = decision ? (/(\d{1,2} \w{3})/.exec(c.text || '')?.[1] || '') : c.value_label;
    const long = String(value || '').length > 12;     // a note's text, not a date or count
    return `<li class="${fresh ? 'fresh' : ''}">
      <div class="r-top"><span class="r-entity">${esc(title)}</span>${long ? '' : `<span class="r-value">${esc(value || '')}</span>`}</div>
      ${long ? `<div class="r-long">${esc(value)}</div>` : ''}
      <div class="r-meta"><span>from ${esc(nameOf(c.modified_by || c.captured_by))}</span><span class="badge ${esc(c.tier)}">${esc(TIER_BADGE[c.tier] || c.tier)}</span></div>
    </li>`;
  }).join('');
  hub.first = false;
  drawLinks();
}

/** The contrast that makes the privacy line mean something: devices hold private claims, the hub none. */
function refreshPrivacy() {
  const parts = Object.values(panes).filter(p => p.device).map(p => {
    const n = [...p.ui.state.claims.values()].filter(c => c.tier === 'device').length;
    return `${nameOf(p.device)}'s ${n}`;
  });
  $('[data-hub="privsub"]').textContent = parts.length
    ? `Counted live from Qdrant (filter tier = device). The devices hold their own: ${parts.join(', ')}.`
    : 'Counted live from Qdrant with a filter on tier = device.';
}

/* ------------------------------------------------------------------ links */
// Each device's link to the hub, from its hub switch to the hub node. Solid when connected, cut
// when not. A token travels along a link only when that device really pushed or pulled claims.
const svg = $('[data-links]');
const NS = 'http://www.w3.org/2000/svg';
const links = {};              // side -> {a:[x,y], b:[x,y]} in svg coordinates
const tokens = [];             // {side, dir, n, t0}
const TOKEN_MS = 900, MAX_TOKENS = 4;

function layoutLinks() {
  const main = $('.stage-main').getBoundingClientRect();
  const node = $('[data-hub="node"]');
  // Line the hub node up with the switches, so each link runs straight across.
  const sw = Object.values(panes).map(p => p.root.querySelector('.hub-switch')?.getBoundingClientRect()).filter(Boolean);
  if (sw.length) {
    const col = $('.hub-col').getBoundingClientRect();
    const mid = sw.reduce((s, r) => s + r.top + r.height / 2, 0) / sw.length;
    node.style.marginTop = `${Math.max(0, Math.round(mid - col.top - node.offsetHeight / 2))}px`;
  }
  const nr = node.getBoundingClientRect();
  for (const side of ['left', 'right']) {
    const r = panes[side].root.querySelector('.hub-switch')?.getBoundingClientRect();
    if (!r) continue;
    const y = r.top + r.height / 2 - main.top;
    links[side] = side === 'left'
      ? { a: [r.right - main.left + 6, y], b: [nr.left - main.left, nr.top + nr.height / 2 - main.top] }
      : { a: [r.left - main.left - 6, y], b: [nr.right - main.left, nr.top + nr.height / 2 - main.top] };
  }
  svg.setAttribute('viewBox', `0 0 ${main.width} ${main.height}`);
  drawLinks();
}

function drawLinks() {
  if (!svg) return;
  let out = '';
  for (const side of ['left', 'right']) {
    const L = links[side]; if (!L) continue;
    const p = panes[side], cut = p.offline || hub.ok === false;
    const [ax, ay] = L.a, [bx, by] = L.b, mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (!cut) {
      out += `<line class="link on" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`;
      out += `<circle class="end on" cx="${ax}" cy="${ay}" r="4"/><circle class="end on" cx="${bx}" cy="${by}" r="4"/>`;
    } else {
      const gap = 14, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      out += `<line class="link cut" x1="${ax}" y1="${ay}" x2="${mx - ux * gap}" y2="${my - uy * gap}"/>`;
      out += `<line class="link cut" x1="${mx + ux * gap}" y1="${my + uy * gap}" x2="${bx}" y2="${by}"/>`;
      out += `<line class="slash" x1="${mx - 6}" y1="${my + 10}" x2="${mx + 6}" y2="${my - 10}"/>`;
      out += `<text class="cut-label" x="${mx}" y="${my + 30}" text-anchor="middle">no connection</text>`;
    }
  }
  svg.innerHTML = out + '<g data-tokens></g>';
  drawTokens();
}

function sendToken(pane, dir, n) {
  if (!links[pane.side]) return;
  if (tokens.length >= MAX_TOKENS) tokens.shift();
  tokens.push({ side: pane.side, dir, n, t0: performance.now() });
  if (tokens.length === 1) requestAnimationFrame(animateTokens);
}

function animateTokens() {
  const now = performance.now();
  for (let i = tokens.length - 1; i >= 0; i--) if (now - tokens[i].t0 > TOKEN_MS + 1600) tokens.splice(i, 1);
  drawTokens();
  if (tokens.length) requestAnimationFrame(animateTokens);
}

function drawTokens() {
  const g = svg.querySelector('[data-tokens]'); if (!g) return;
  const now = performance.now();
  g.innerHTML = tokens.map(t => {
    const L = links[t.side]; if (!L) return '';
    const k = Math.min(1, (now - t.t0) / TOKEN_MS), e = 1 - Math.pow(1 - k, 3);   // ease out
    const [from, to] = t.dir === 'push' ? [L.a, L.b] : [L.b, L.a];
    const x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e;
    const fade = k < 1 ? 1 : Math.max(0, 1 - (now - t.t0 - TOKEN_MS) / 1600);
    // Two short lines under the link: the gap between a pane and the hub is narrow.
    const mx = (L.a[0] + L.b[0]) / 2, my = Math.max(L.a[1], L.b[1]) + 26;
    return `<g opacity="${fade.toFixed(3)}"><circle class="token" cx="${x}" cy="${y}" r="7"/>
      <text class="token-label" x="${mx}" y="${my}" text-anchor="middle">${t.dir === 'push' ? 'sent' : 'pulled'}<tspan x="${mx}" dy="17">${esc(plural(t.n, 'claim'))}</tspan></text></g>`;
  }).join('');
}

new ResizeObserver(layoutLinks).observe($('.stage-main'));
for (const p of Object.values(panes)) new ResizeObserver(layoutLinks).observe(p.root.querySelector('header.top'));
window.addEventListener('resize', layoutLinks);

pollHub();
window.__stage = { panes, hub, done, say };
