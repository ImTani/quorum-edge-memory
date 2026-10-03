// Quorum device UI. Loads GET /api/state, then applies SSE events (claim / conflict / sync /
// activity) by id. With ?mock=1 the same code runs against mock.js, an in-browser fake API.
import { MemoryCloud, COLORS, claimState } from './cloud.js';

const $ = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const MOCK = params.has('mock') && params.get('mock') !== '0';
const RESOLVED_CARD_MS = 15000;

const state = {
  device: '', displayName: '', today: '',
  sync: null,
  claims: new Map(),        // claim_id -> UI claim
  conflicts: new Map(),     // conflict_id -> conflict
  activity: [],             // newest first
  view: 'mine',
  inbox: [],
  drafts: new Map(),        // conflict_id -> {to, text, mailto, wa_link}
  cardConflictId: null,     // conflict shown in the card
  dismissed: new Set(),
  pinnedId: null, hover: null,
};

/* ------------------------------------------------------------- formatting */
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const capFirst = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Wall-clock parts straight from the ISO string, so times read the same on every machine.
function isoParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
  return m ? { d: +m[3], mon: MON[+m[2] - 1], hh: m[4], mm: m[5] } : null;
}
const fmtDay = iso => { const p = isoParts(iso); return p ? `${p.d} ${p.mon}` : ''; };
const fmtWhen = iso => { const p = isoParts(iso); return p ? `${p.d} ${p.mon}${p.hh ? `, ${p.hh}:${p.mm}` : ''}` : ''; };
const fmtClock = iso => { const p = isoParts(iso); return p && p.hh ? `${p.hh}:${p.mm}` : ''; };
function fmtBytes(n) {
  n = Math.max(0, n || 0);
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)} KB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}
const fmtRate = n => `${fmtBytes(n)}/s`;

const NAMES = { tanishk: 'Tanishk', lakshya: 'Lakshya' };
const nameOf = id => NAMES[id] || capFirst(String(id || 'someone'));
const isMe = id => id && id === state.device;
const hasDevice = id => Object.hasOwn(NAMES, id);   // the two people running a device in the demo

// "Rohit Sharma <rohit@x.com>" -> "Rohit Sharma": the address is noise on a card and pushes the date out.
const dropAddress = a => String(a || '').replace(/\s*<[^>]*@[^>]*>\s*$/, '').trim() || String(a || '').trim();
function prettyAuthor(a) {
  const s = dropAddress(a);
  const m = /^(client|whatsapp|email|group)\s*:\s*(.+)$/i.exec(s);
  if (m) return m[1].toLowerCase() === 'client' ? `Client ${capFirst(m[2])}` : capFirst(m[2]);
  return /^[a-z]+$/.test(s) ? nameOf(s) : s;
}
const KIND = { email: 'Email', whatsapp: 'WhatsApp', note: 'Note' };
const kindLabel = k => KIND[k] || capFirst(k || 'source');
const ICON = {
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z M3.5 7l8.5 6 8.5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10.5h-9.5l-5.5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z M13.5 7l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};
const icon = k => ICON[k] || ICON.note;
const ATTR_PLURAL = { due_date: 'Dates', birthday: 'Birthdays', assignee: 'Assignees', location: 'Locations', amount: 'Amounts', count: 'Counts', status: 'Statuses' };
const ATTR_LABEL = { due_date: 'due date', birthday: 'birthday', assignee: 'assignee', location: 'location', amount: 'amount', count: 'count', status: 'status', resolution: 'resolution', note: 'note' };
const TIER_LABEL = { device: 'This device only', my_devices: 'My devices', team: 'Team' };
const STATE_LABEL = { private: 'Private', queued: 'Queued', synced: 'Synced', disputed: 'Disputed', superseded: 'Superseded' };
const entityPhrase = c => (!c || c.entity_kind === 'person' || /^the\s/i.test(c.entity) ? (c?.entity || 'this') : `the ${c.entity}`);
const valueOf = c => c?.value_label || c?.value || '';

/* --------------------------------------------------------------- transport */
function httpTransport() {
  return {
    async request(method, path, body) {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch { /* not JSON */ }
        throw new Error(`${res.status} ${detail}`);
      }
      return res.json();
    },
    /** EventSource reconnects by itself unless the server refuses; then we retry. */
    subscribe(onEvent, onStatus) {
      let retry = null;
      const open = () => {
        const es = new EventSource('/api/events');
        es.onopen = () => onStatus('open');
        es.onmessage = m => { try { onEvent(JSON.parse(m.data)); } catch (err) { console.warn('bad event', err, m.data); } };
        es.onerror = () => {
          onStatus('reconnecting');
          if (es.readyState === EventSource.CLOSED) { es.close(); clearTimeout(retry); retry = setTimeout(open, 1500); }
        };
      };
      open();
    },
  };
}

let transport, mock = null;
if (MOCK) {
  const { createMock } = await import('./mock.js');
  mock = createMock({ device: params.get('device') || 'tanishk' });
  transport = mock.transport;
} else {
  transport = httpTransport();
}
const api = (method, path, body) => transport.request(method, path, body);

/* ------------------------------------------------------------------ cloud */
const cloud = new MemoryCloud($('#cloud'), {
  onHover(claim, x, y) { state.hover = claim ? { id: claim.claim_id, x, y } : null; renderClaimCard(); },
  onSelect(claim) { state.pinnedId = claim?.claim_id || null; renderClaimCard(); },
  onFrame: positionClaimCard,
  labelFor(c) {
    const cf = c.conflict_id && state.conflicts.get(c.conflict_id);
    if (cf || c.status === 'disputed' || c.status === 'superseded') {
      return { label: valueOf(c), sub: `${kindLabel(c.source?.kind)} · ${prettyAuthor(c.source?.author)}` };
    }
    const st = claimState(c);
    const where = { private: 'private · stays on this device', queued: 'queued · in outbox', synced: 'synced' }[st] || st;
    return { label: valueOf(c).length > 26 ? c.entity : valueOf(c), sub: `${kindLabel(c.source?.kind)} · ${where}` };
  },
});

/* ---------------------------------------------------------- state updates */
function hydrate(s) {
  state.device = s.device; state.displayName = s.display_name || nameOf(s.device); state.today = s.today;
  state.claims = new Map((s.claims || []).map(c => [c.claim_id, c]));
  state.conflicts = new Map((s.conflicts || []).map(c => [c.conflict_id, c]));
  state.activity = sortActivity(dedupeActivity(s.activity || []));
  cloud.setClaims([...state.claims.values()]);
  cloud.setConflicts([...state.conflicts.values()]);
  if (!state.cardConflictId || !state.conflicts.has(state.cardConflictId)) state.cardConflictId = latestConflictId();
  applySync(s.sync, { quiet: true });
  document.title = `${state.displayName} · Quorum`;
  renderAll();
}

function latestConflictId() {
  const list = [...state.conflicts.values()];
  const open = list.filter(c => c.status === 'open');
  const pick = (open.length ? open : list).sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at)))[0];
  return pick ? pick.conflict_id : null;
}

/** onlyIfNew: a POST response may arrive after a newer SSE copy of the same claim. */
function applyClaim(c, { onlyIfNew = false } = {}) {
  const prev = state.claims.get(c.claim_id);
  if (prev && (onlyIfNew || (c.version ?? 0) < (prev.version ?? 0))) return;
  state.claims.set(c.claim_id, c);
  cloud.upsert(c);
  scheduleRender();
}

function applyConflict(cf) {
  const prev = state.conflicts.get(cf.conflict_id);
  state.conflicts.set(cf.conflict_id, cf);
  cloud.setConflict(cf);
  if (!prev && cf.status === 'open') {
    state.cardConflictId = cf.conflict_id;
    state.dismissed.delete(cf.conflict_id);
  }
  if (prev && prev.status !== 'resolved' && cf.status === 'resolved') {
    const winner = state.claims.get(cf.winner_claim_id);
    // The resolved card stays long enough to read on both screens, then gets out of the cloud's way.
    setTimeout(() => { state.dismissed.add(cf.conflict_id); renderConflictCard(); }, RESOLVED_CARD_MS);
    const by = cf.resolved_by ? ` by ${esc(isMe(cf.resolved_by) ? 'you' : nameOf(cf.resolved_by))}` : '';
    toast(`Resolved: <b>${esc(valueOf(winner) || 'one version')}</b> kept${by}`, 'green');
    // A disputed answer on screen is now out of date; say so instead of leaving it stale.
    const box = $('#answer');
    if (box.classList.contains('disputed') && !box.querySelector('.answer-update')) {
      box.insertAdjacentHTML('beforeend', `<div class="answer-update">Since resolved: <b>${esc(valueOf(winner))}</b> kept${by}.</div>`);
    }
  }
  scheduleRender();
}

function applySync(s, { quiet = false } = {}) {
  if (!s) return;
  const prev = state.sync;
  state.sync = s;
  if (!quiet && prev && prev.outbox > 0 && s.outbox === 0 && s.online) cloud.wave(COLORS.synced);
  renderHeader();
}

const actKey = a => `${a.at}|${a.kind}|${a.text}`;
const dedupeActivity = list => { const seen = new Set(); return list.filter(a => !seen.has(actKey(a)) && seen.add(actKey(a))); };
const sortActivity = list => list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
function addActivity(a) {
  if (state.activity.some(x => actKey(x) === actKey(a))) return;
  state.activity = sortActivity([a, ...state.activity]);
  renderActivity(actKey(a));
}

function onEvent(ev) {
  switch (ev.type) {
    case 'claim': applyClaim(ev.data); dropReceivedMail(ev.data); break;
    case 'conflict': applyConflict(ev.data); break;
    case 'sync': applySync(ev.data); break;
    case 'activity': addActivity(ev.data); break;
    default: break;
  }
}

let pending = false;
function scheduleRender() {
  if (pending) return; pending = true;
  requestAnimationFrame(() => { pending = false; renderLegend(); renderConflictCard(); renderClaimCard(); });
}
function renderAll() { renderHeader(); renderLegend(); renderConflictCard(); renderActivity(); renderInbox(); renderClaimCard(); }

/* ----------------------------------------------------------------- header */
const rate = { samples: [], history: new Array(48).fill(0), value: 0 };
function sampleRate() {
  const s = state.sync, now = performance.now() / 1000;
  const total = s ? (s.bytes_up || 0) + (s.bytes_down || 0) : 0;
  rate.samples.push([now, total]);
  while (rate.samples.length > 2 && now - rate.samples[0][0] > 3) rate.samples.shift();
  const [t0, b0] = rate.samples[0], dt = now - t0;
  rate.value = s && s.online && dt > 0.4 ? Math.max(0, (total - b0) / dt) : 0;
  rate.history.push(rate.value); rate.history.shift();
  renderHeader(); drawSpark();
}
setInterval(sampleRate, 500);

function drawSpark() {
  const cv = $('#spark'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  const online = !!state.sync?.online, color = online ? COLORS.synced : COLORS.queued;
  const max = Math.max(400, ...rate.history);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  rate.history.forEach((v, i) => { const x = i / (rate.history.length - 1) * w, y = h - 3 - (v / max) * (h - 8); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = online ? 'rgba(34,197,94,.10)' : 'rgba(245,165,36,.08)'; ctx.fill();
}

function renderHeader() {
  const s = state.sync || {};
  const [first, ...rest] = (state.displayName || 'Quorum').split('·');
  $('#device-name').innerHTML = `<b>${esc(first.trim())}</b>${rest.length ? `<span> · ${esc(rest.join('·').trim())}</span>` : ''}`;
  const online = !!s.online, known = !!state.sync;
  const sw = $('#hub-switch');
  sw.classList.toggle('on', known && online); sw.classList.toggle('off', known && !online); sw.classList.toggle('unknown', !known);
  sw.setAttribute('aria-checked', String(online));
  $('#hub-label').textContent = !known ? 'Connecting…' : online ? 'Connected to hub' : 'No connection to hub';
  $('#outbox').textContent = s.outbox ?? 0;
  $('#outbox-stat').classList.toggle('has', (s.outbox || 0) > 0);
  const r = $('#rate');
  r.textContent = online ? fmtRate(rate.value) : '0 B/s';
  r.classList.toggle('frozen', known && !online);
  $('#up-total').textContent = fmtBytes(s.bytes_up);
  $('#down-total').textContent = fmtBytes(s.bytes_down);
  // Right after reconnecting, hub_ok is still false until the first round lands; only an actual
  // error (last_error) means the hub is unreachable.
  const hub = !state.sync ? ['unknown', 'hub']
    : !online ? ['paused', 'sync paused']
    : s.hub_ok === false ? (s.last_error ? ['down', 'hub unreachable'] : ['unknown', 'reaching hub…'])
    : ['ok', 'hub ok'];
  $('#hub-dot').className = `dot ${hub[0]}`;
  $('#hub-text').textContent = hub[1];
  $('#hub-stat').title = s.last_error ? `Last error: ${s.last_error}` : 'Hub status';
}

$('#hub-switch').addEventListener('click', async () => {
  const want = !state.sync?.online;
  state.sync = { ...(state.sync || {}), online: want };  // optimistic; the server's answer wins
  renderHeader(); drawSpark();
  try { applySync(await api('POST', '/api/net', { online: want })); }
  catch (err) { toast(`Couldn't change the hub connection: ${esc(err.message)}`, 'red'); }
});

/* ------------------------------------------------------------ cloud chrome */
const visibleClaims = () => [...state.claims.values()].filter(c => c.attribute !== 'resolution' && c.status !== 'retracted' && (state.view !== 'team' || c.tier === 'team'));

function renderLegend() {
  const counts = { synced: 0, queued: 0, private: 0, disputed: 0, superseded: 0 };
  const vis = visibleClaims();
  for (const c of vis) counts[claimState(c)] = (counts[claimState(c)] || 0) + 1;
  $('#legend').innerHTML = Object.keys(counts).map(k =>
    `<span class="lg ${counts[k] ? '' : 'zero'}"><i style="--c:${COLORS[k]}"></i>${STATE_LABEL[k]} <b>${counts[k]}</b></span>`).join('');
  const team = state.view === 'team';
  $('#cloud-title').textContent = team ? 'Team view' : 'Memory';
  $('#cloud-subtitle').textContent = team
    ? `${vis.length} team claims · private and personal ones hidden`
    : `${vis.length} claims on this device · each point is one claim`;
}

document.querySelectorAll('.view-toggle button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  state.view = v;
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#ask-scope').textContent = v === 'team' ? 'team view: only claims shared with the team' : 'searching everything on this device';
  cloud.setView(v);
  // A settled conflict has had its moment; give the whole cloud to the view change. Open ones stay.
  const cf = state.conflicts.get(state.cardConflictId);
  if (cf && cf.status === 'resolved' && !state.dismissed.has(cf.conflict_id)) { state.dismissed.add(cf.conflict_id); renderConflictCard(); }
  renderLegend();
}

/* ------------------------------------------------------------- claim card */
function renderClaimCard() {
  const card = $('#claim-card');
  const id = state.pinnedId || state.hover?.id;
  const c = id && state.claims.get(id);
  if (!c) { card.classList.add('hidden'); card.dataset.id = ''; return; }
  const st = claimState(c);
  card.dataset.id = id;
  card.style.setProperty('--c', COLORS[st]);
  card.innerHTML = `
    <div class="cc-top"><span class="pill" style="--c:${COLORS[st]}">${STATE_LABEL[st]}</span><span class="tier">${esc(TIER_LABEL[c.tier] || c.tier)}</span>${state.pinnedId ? '<span class="cc-pin">pinned</span>' : ''}</div>
    <div class="cc-text">${esc(c.text)}</div>
    <div class="cc-kv"><span>${esc(ATTR_LABEL[c.attribute] || c.attribute)}</span><b>${esc(valueOf(c))}</b></div>
    <div class="cc-src">${icon(c.source?.kind)}<span>${esc(kindLabel(c.source?.kind))} · ${esc(prettyAuthor(c.source?.author))} · ${esc(fmtWhen(c.source?.at || c.stated_at))}</span></div>
    ${c.source?.excerpt ? `<div class="cc-quote">“${esc(c.source.excerpt)}”</div>` : ''}`;
  card.classList.remove('hidden');
  positionClaimCard(sid => cloud.screenOf(sid));
}

function positionClaimCard(screenOf) {
  const card = $('#claim-card'), id = card.dataset.id;
  if (!id || card.classList.contains('hidden')) return;
  const p = screenOf(id); if (!p) return;
  const wrap = $('#cloud-wrap'), W = wrap.clientWidth, H = wrap.clientHeight;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let x = p.x + 22, y = p.y - ch / 2;
  if (x + cw > W - 10) x = p.x - 22 - cw;
  y = Math.max(54, Math.min(H - ch - 44, y));
  card.style.transform = `translate(${Math.round(Math.max(10, x))}px, ${Math.round(y)}px)`;
}

/* ---------------------------------------------------------- conflict card */
function renderConflictCard() {
  const card = $('#conflict-card');
  const cf = state.cardConflictId && state.conflicts.get(state.cardConflictId);
  const hidden = !cf || state.dismissed.has(cf.conflict_id);
  renderConflictPill(cf, hidden);
  if (hidden) { card.classList.add('hidden'); syncInset(); return; }

  const claims = cf.claim_ids.map(id => state.claims.get(id)).filter(Boolean);
  claims.sort((a, b) => String(a.value).localeCompare(String(b.value)));  // earlier date on the left
  const lead = claims[0] || {};
  const resolved = cf.status === 'resolved';
  // Owners with no device in this demo (Aayat, Tushar) can't settle anything, so either device may.
  const onBehalf = !isMe(cf.owner) && !hasDevice(cf.owner);
  const owner = isMe(cf.owner) || onBehalf, ownerName = nameOf(cf.owner);
  const sim = (+cf.similarity || 0).toFixed(2);
  const winner = state.claims.get(cf.winner_claim_id);
  const subject = cf.entity ? (lead.entity === cf.entity ? entityPhrase(lead) : `the ${cf.entity}`) : entityPhrase(lead);

  const title = resolved
    ? `Resolved: <b>${esc(valueOf(winner))}</b> for ${esc(subject)}<span class="by"> · chosen by ${esc(isMe(cf.resolved_by) ? 'you' : nameOf(cf.resolved_by))}</span>`
    : `Found 2 claims about <b>${esc(subject)}</b>, similarity <span class="sim">${sim}</span>. ${esc(ATTR_PLURAL[cf.attribute] || 'Values')} disagree.`;

  const cols = claims.map(c => {
    const isWinner = resolved && c.claim_id === cf.winner_claim_id, isLoser = resolved && !isWinner;
    const action = resolved
      ? `<span class="verdict ${isWinner ? 'kept' : 'lost'}">${isWinner ? '✓ Kept' : 'Superseded · kept for history'}</span>`
      : owner ? `<button class="btn keep" data-keep="${esc(c.claim_id)}">Keep ${esc(valueOf(c))}</button>` : '';
    return `
      <div class="cf-col ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}">
        <div class="cf-row"><div class="cf-value">${esc(valueOf(c))}</div>${action}</div>
        <div class="cf-src">${icon(c.source?.kind)}<span><b>${esc(kindLabel(c.source?.kind))}</b> · ${esc(prettyAuthor(c.source?.author))} · ${esc(fmtWhen(c.source?.at || c.stated_at))}</span></div>
        ${c.source?.excerpt ? `<div class="cf-quote">“${esc(c.source.excerpt)}”</div>` : ''}
        <div class="cf-meta">captured by ${esc(isMe(c.captured_by) ? 'you' : nameOf(c.captured_by))}</div>
      </div>`;
  }).join('<div class="cf-vs">vs</div>');

  const draft = state.drafts.get(cf.conflict_id);
  let foot = '';
  if (!resolved && !owner) foot = `<span class="cf-wait"><i class="spin"></i>Waiting for ${esc(ownerName)}<span class="cf-why">${esc(ownerName)} owns this task</span></span><button class="btn ask" data-action="ask-owner">Ask ${esc(ownerName)}</button>`;
  // A conflict involving a device-only claim is settled privately (conflicts.resolve), so say so.
  const privately = state.claims.get(cf.resolution_claim_id)?.tier === 'device';
  const settledNote = privately ? 'Settled on this device only: a private claim was involved.' : 'Both devices agree now.';
  if (resolved) foot = `<span class="cf-note">${settledNote} Nothing was deleted.</span><button class="btn ghost" data-action="dismiss">Close</button>`;
  const ownNote = onBehalf ? `${esc(ownerName)} isn't on Quorum: keep the version that is true` : 'You own this: keep the version that is true';
  const kickerNote = !resolved && owner ? `<span class="cf-own">${ownNote}</span>` : '';
  const draftHtml = draft && !resolved ? `
    <div class="cf-draft">
      <div class="cf-draft-head">Draft to ${esc(nameOf(draft.to) || ownerName)} <span>nothing is sent until you choose</span>
        <em class="cf-draft-wait"><i class="spin"></i>Waiting for ${esc(ownerName)}</em></div>
      <div class="cf-draft-text">${esc(draft.text)}</div>
      <div class="cf-draft-links">
        ${draft.mailto ? `<a class="btn" href="${esc(draft.mailto)}" target="_blank" rel="noopener">Open in email</a>` : ''}
        ${draft.wa_link ? `<a class="btn wa" href="${esc(draft.wa_link)}" target="_blank" rel="noopener">Open in WhatsApp</a>` : ''}
        <button class="btn ghost" data-action="copy-draft">Copy</button>
      </div>
    </div>` : '';

  card.className = `conflict-card ${resolved ? 'resolved' : 'open'} ${draftHtml ? 'with-draft' : ''}`;
  card.innerHTML = `
    <div class="cf-kicker"><span class="kdot"></span>${resolved ? 'Conflict resolved' : `Conflict · detected on ${esc(cf.detected_on === 'sync' ? 'sync' : 'capture')}`}<span class="cf-time">${esc(fmtClock(cf.detected_at))}</span>
      ${kickerNote}${resolved ? '' : '<button class="x" data-action="dismiss" title="Hide (the conflict stays open)">×</button>'}</div>
    <div class="cf-title">${title}</div>
    <div class="cf-cols">${cols}</div>
    ${draftHtml}
    ${foot ? `<div class="cf-foot">${foot}</div>` : ''}`;
  syncInset();
}

function renderConflictPill(cf, cardHidden) {
  let pill = $('#conflict-pill');
  const openCount = [...state.conflicts.values()].filter(c => c.status === 'open').length;
  const show = cardHidden && openCount > 0;
  if (!show) { pill?.remove(); return; }
  if (!pill) {
    pill = document.createElement('button'); pill.id = 'conflict-pill'; pill.className = 'conflict-pill';
    pill.addEventListener('click', () => { state.cardConflictId = latestConflictId(); state.dismissed.delete(state.cardConflictId); renderConflictCard(); });
    $('#cloud-wrap').appendChild(pill);
  }
  pill.innerHTML = `<span class="kdot"></span>${openCount} open conflict${openCount > 1 ? 's' : ''} · show`;
}

/** While the card is up, the cloud row grows and the projection centre moves above the card. */
function syncInset() {
  const card = $('#conflict-card'), open = !card.classList.contains('hidden');
  document.querySelector('main.grid').classList.toggle('focus', open);
  $('#cloud-wrap').classList.toggle('has-card', open);
  cloud.setInsetBottom(open ? card.offsetHeight + 8 : 0);
}
new ResizeObserver(syncInset).observe($('#conflict-card'));

$('#conflict-card').addEventListener('click', async e => {
  const el = e.target.closest('[data-keep],[data-action]'); if (!el) return;
  const cf = state.conflicts.get(state.cardConflictId); if (!cf) return;
  if (el.dataset.keep) {
    el.disabled = true; el.textContent = 'Saving…';
    try { applyConflict(await api('POST', `/api/conflicts/${encodeURIComponent(cf.conflict_id)}/resolve`, { winner_claim_id: el.dataset.keep })); }
    catch (err) { toast(`Couldn't resolve: ${esc(err.message)}`, 'red'); renderConflictCard(); }
    return;
  }
  const action = el.dataset.action;
  if (action === 'dismiss') { state.dismissed.add(cf.conflict_id); renderConflictCard(); }
  if (action === 'ask-owner') {
    el.disabled = true; el.textContent = 'Drafting…';
    try { state.drafts.set(cf.conflict_id, await api('POST', `/api/conflicts/${encodeURIComponent(cf.conflict_id)}/draft`)); }
    catch (err) { toast(`Couldn't draft the message: ${esc(err.message)}`, 'red'); }
    renderConflictCard();
  }
  if (action === 'copy-draft') {
    const d = state.drafts.get(cf.conflict_id);
    try { await navigator.clipboard.writeText(d.text); toast('Draft copied'); } catch { toast('Copy is blocked here; select the text instead', 'red'); }
  }
});

/* -------------------------------------------------------------- assistant */
let askSeq = 0;
$('#ask-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#ask-input').value.trim(); if (!q) return;
  const seq = ++askSeq, view = state.view;
  const box = $('#answer');
  box.className = 'answer loading';
  box.innerHTML = `<div class="answer-q">${esc(q)}</div><div class="answer-text muted">Searching this device…</div>`;
  try {
    const r = await api('POST', '/api/ask', { q, view });
    if (seq !== askSeq) return;
    renderAnswer(q, r, view);
    const cited = (r.citations || []).map(c => c.claim_id);
    cloud.highlight(cited.length ? cited : (r.hits || []).map(h => h.claim?.claim_id).filter(Boolean), 5);
  } catch (err) {
    if (seq !== askSeq) return;
    box.className = 'answer error';
    box.innerHTML = `<div class="answer-q">${esc(q)}</div><div class="answer-text">Couldn't answer: ${esc(err.message)}</div>`;
  }
});
$('#suggestions').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  $('#ask-input').value = b.dataset.q; $('#ask-form').requestSubmit();
});

function renderAnswer(q, r, view) {
  const box = $('#answer');
  const disputed = !!(r.disputed && (Array.isArray(r.disputed) ? r.disputed.length : true));
  let text = esc(r.answer || 'Nothing on this device matches that yet.');
  text = text.replace(/^(Disputed:)/, '<b class="tag-red">$1</b>');
  const cites = (r.citations || []).map(c => `
    <button class="cite" data-claim="${esc(c.claim_id)}" title="${esc(c.excerpt || '')}">
      ${icon(c.kind)}<span><b>${esc(kindLabel(c.kind))}</b> · ${esc(prettyAuthor(c.author))}${c.at ? ` · ${esc(fmtDay(c.at))}` : ''}</span>
    </button>`).join('');
  const offline = state.sync && !state.sync.online;
  box.className = `answer ${disputed ? 'disputed' : ''}`;
  box.innerHTML = `
    <div class="answer-q">${esc(q)}</div>
    <div class="answer-text">${text}</div>
    ${cites ? `<div class="cites">${cites}</div>` : ''}
    <div class="answer-meta"><span class="took">${esc(Math.round(r.took_ms ?? 0))} ms, on this device</span>${offline ? '<span>no hub needed</span>' : ''}<span>${view === 'team' ? 'team view' : 'mine'}</span></div>`;
}

$('#answer').addEventListener('mouseover', e => { const b = e.target.closest('.cite'); if (b) cloud.highlight([b.dataset.claim], 2.5); });
$('#answer').addEventListener('click', e => {
  const b = e.target.closest('.cite'); if (!b || !state.claims.has(b.dataset.claim)) return;
  state.pinnedId = b.dataset.claim; cloud.select(state.pinnedId); renderClaimCard();
});

/* ---------------------------------------------------------------- capture */
$('#note-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#note-input'), text = input.value.trim(); if (!text) return;
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Saving…';
  const done = working('Reading the note on this device…');
  try {
    const r = await api('POST', '/api/ingest', { kind: 'note', text });
    input.value = '';
    done();
    afterIngest(r, 'note');
  } catch (err) { done(); toast(`Couldn't save the note: ${esc(err.message)}`, 'red'); }
  btn.disabled = false; btn.textContent = 'Save';
});

function afterIngest(r, what) {
  (r.claims || []).forEach(c => applyClaim(c, { onlyIfNew: true }));
  (r.conflicts || []).forEach(applyConflict);
  const n = (r.claims || []).length;
  if (!n) { toast(`Saved the ${what}; no claims found in it`); return; }
  const c = r.claims[0], st = claimState(c);
  const where = st === 'private' ? 'stays on this device' : st === 'queued' ? (state.sync?.online ? 'syncing to hub' : 'queued for the hub') : 'synced';
  toast(`${n} claim${n > 1 ? 's' : ''} from the ${what}: <b>${esc(valueOf(c))}</b> · ${where}<span class="t-meta">${esc(Math.round(r.took_ms ?? 0))} ms${r.extractor ? ` · ${esc(r.extractor === 'llm' ? 'local model' : 'rules')}` : ''}</span>`, st === 'private' ? 'violet' : st === 'queued' ? 'amber' : 'green');
}

async function loadInbox() {
  try { state.inbox = await api('GET', '/api/inbox'); } catch (err) { console.warn('inbox', err); state.inbox = []; }
  renderInbox();
}
// A claim citing "email:<id>" means that email was received (maybe from another tab or a retry).
function dropReceivedMail(c) {
  const m = /^email:(.+)$/.exec(c?.source?.ref || '');
  if (!m || !(state.inbox || []).some(x => x.id === m[1])) return;
  state.inbox = state.inbox.filter(x => x.id !== m[1]);
  renderInbox();
}
function renderInbox() {
  const list = state.inbox || [];
  $('#inbox-count').textContent = list.length ? `${list.length} new` : '';
  $('#inbox').innerHTML = list.length ? list.map(m => `
    <div class="mail" data-id="${esc(m.id)}">
      <div class="mail-body">
        <div class="mail-top"><b title="${esc(m.from)}">${esc(dropAddress(m.from))}</b><span>${esc(fmtWhen(m.at))}</span></div>
        <div class="mail-subject">${esc(m.subject)}</div>
        <div class="mail-text">${esc(m.text)}</div>
      </div>
      <button class="btn receive" data-receive="${esc(m.id)}">Receive</button>
    </div>`).join('') : '<div class="inbox-empty">Inbox clear.</div>';
}
$('#inbox').addEventListener('click', async e => {
  const b = e.target.closest('[data-receive]'); if (!b) return;
  b.disabled = true; b.textContent = 'Reading…';
  const done = working('Reading the email on this device…');
  try {
    const r = await api('POST', `/api/inbox/${encodeURIComponent(b.dataset.receive)}/receive`);
    state.inbox = state.inbox.filter(m => m.id !== b.dataset.receive);
    renderInbox();
    done();
    afterIngest(r, 'email');
  } catch (err) { done(); toast(`Couldn't receive it: ${esc(err.message)}`, 'red'); b.disabled = false; b.textContent = 'Receive'; }
});

/* --------------------------------------------------------------- activity */
const ACT = { claim_added: 'indigo', search: 'sub', sync_push: 'green', sync_pull: 'green', conflict_opened: 'red', conflict_resolved: 'green', net: 'amber' };
function renderActivity(freshKey) {
  $('#activity-note').textContent = state.activity.length ? 'latest first' : '';
  $('#feed').innerHTML = state.activity.map(a => `
    <li class="${actKey(a) === freshKey ? 'fresh' : ''}" style="--c:var(--${ACT[a.kind] || 'sub'})">
      <time>${esc(fmtClock(a.at) || '')}</time><span>${esc(a.text)}</span>
    </li>`).join('') || '<li class="empty"><span>Nothing yet.</span></li>';
}

/* ------------------------------------------------------------------ toasts */
/** Returns a close function; ms = 0 keeps the toast up until it is closed (progress messages). */
function toast(html, tone = 'indigo', ms = 3800) {
  const t = document.createElement('div');
  t.className = `toast ${tone}`; t.innerHTML = html;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  const close = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); };
  if (ms) setTimeout(close, ms);
  return close;
}
const working = text => toast(`<i class="spin"></i>${esc(text)}`, 'indigo working', 0);

/* -------------------------------------------------------------------- boot */
function setLive(s) {
  const el = $('#live');
  el.textContent = s === 'open' ? 'live' : s === 'reconnecting' ? 'reconnecting…' : s;
  el.className = `live ${s}`;
}

async function loadState() {
  for (let attempt = 0; ; attempt++) {
    try { hydrate(await api('GET', '/api/state')); return; }
    catch (err) {
      setLive('offline');
      if (attempt === 0) toast(`Can't reach this device's server yet; retrying. ${esc(err.message)}`, 'red');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

await loadState();
loadInbox();
let wasDown = false;
transport.subscribe(onEvent, s => {
  setLive(s);
  if (s === 'reconnecting') wasDown = true;
  if (s === 'open' && wasDown) { wasDown = false; loadState(); loadInbox(); }  // catch up on missed events
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { state.pinnedId = null; cloud.select(null); renderClaimCard(); }
});

/** Drives the UI the way a person would (typing, clicking). Used by mock.js to play the demo. */
const driver = {
  state,
  async type(sel, text) {
    const el = $(sel); el.focus(); el.value = '';
    for (const ch of text) { el.value += ch; await new Promise(r => setTimeout(r, 24)); }
  },
  async ask(q) { await driver.type('#ask-input', q); $('#ask-input').blur(); $('#ask-form').requestSubmit(); },
  async note(text) { await driver.type('#note-input', text); $('#note-input').blur(); $('#note-form').requestSubmit(); },
  setNet(online) { if (!!state.sync?.online !== online) $('#hub-switch').click(); },
  receive(id) { (document.querySelector(`[data-receive="${CSS.escape(id)}"]`) || document.querySelector('[data-receive]'))?.click(); },
  keep(label) {
    const btns = [...document.querySelectorAll('[data-keep]')];
    (btns.find(b => b.textContent.includes(label)) || btns[0])?.click();
  },
  askOwner() { document.querySelector('[data-action="ask-owner"]')?.click(); },
  closeCard() { document.querySelector('#conflict-card [data-action="dismiss"]')?.click(); },
  setView,
};
if (mock) mock.attach(driver);
window.__quorum = { state, cloud, ready: true };
