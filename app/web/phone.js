// The phone page (phone.html): one device's memory for a teammate's phone. State from GET /api/state, live
// over SSE (/api/events), the same calls as the laptop pages (app/CONTRACT.md). Standalone on purpose: no
// memory cloud, so nothing heavy loads on a phone.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const capFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const LAPTOPS = ['tanishk', 'lakshya'];                       // the demo's devices with an owner on them
const nameOf = id => capFirst(String(id || 'someone'));
const valueOf = c => c?.value_label || c?.value || '';
const KIND = { email: 'Email', whatsapp: 'WhatsApp', note: 'Note' };
const kindLabel = k => KIND[k] || capFirst(k || 'source');
function prettyAuthor(a) {
  const s = String(a || '').replace(/\s*<[^>]*@[^>]*>\s*$/, '').trim();
  const m = /^(client|whatsapp|email|group)\s*:\s*(.+)$/i.exec(s);
  if (m) return m[1].toLowerCase() === 'client' ? `Client ${capFirst(m[2])}` : capFirst(m[2]);
  return /^[a-z]+$/.test(s) ? nameOf(s) : s;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
  return m ? `${+m[3]} ${MON[+m[2] - 1]}${m[4] ? `, ${m[4]}:${m[5]}` : ''}` : '';
}
const stateOf = c => c.status === 'disputed' ? 'disputed' : c.status === 'superseded' ? 'superseded' : (c.sync || 'synced');
const STATE = { private: 'Private', queued: 'Queued', synced: 'Synced', disputed: 'Disputed', superseded: 'Old' };

const S = { device: '', claims: new Map(), conflicts: new Map(), sync: null, fresh: new Set(), loaded: false };
const api = async (method, path, body) => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { let d = r.statusText; try { d = (await r.json()).detail || d; } catch { /* not JSON */ } throw new Error(d); }
  return r.json();
};

/* ------------------------------------------------------------------ state */
async function load() {
  const s = await api('GET', '/api/state');
  S.device = s.device;
  S.claims = new Map((s.claims || []).map(c => [c.claim_id, c]));
  S.conflicts = new Map((s.conflicts || []).map(c => [c.conflict_id, c]));
  S.sync = s.sync;
  const [first, ...rest] = String(s.display_name || nameOf(s.device)).split(' · ');
  $('name').textContent = `${first.trim()}’s Quorum`;
  $('role').textContent = rest.length ? capFirst(rest.join(' ').trim()) : 'Quorum';
  document.title = `${first.trim()} · Quorum`;
  S.loaded = true;
  renderAll();
}
function onEvent(ev) {
  if (ev.type === 'claim') {
    if (!S.claims.has(ev.data.claim_id)) S.fresh.add(ev.data.claim_id);
    const prev = S.claims.get(ev.data.claim_id);
    if (!prev || (ev.data.version ?? 0) >= (prev.version ?? 0)) S.claims.set(ev.data.claim_id, ev.data);
    scheduleRender();
  } else if (ev.type === 'conflict') { S.conflicts.set(ev.data.conflict_id, ev.data); scheduleRender(); }
  else if (ev.type === 'sync') { S.sync = ev.data; renderStatus(); }
}
function subscribe() {
  let wasDown = false;
  const open = () => {
    const es = new EventSource('/api/events');
    es.onopen = () => { if (wasDown) { wasDown = false; load().catch(() => {}); } };
    es.onmessage = m => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.warn('bad event', e); } };
    es.onerror = () => {
      wasDown = true; renderStatus(true);
      if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(open, 1500); }
    };
  };
  open();
}
let pending = false;
function scheduleRender() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; renderAll(); }); }
function renderAll() { renderStatus(); renderConflicts(); renderClaims(); }

/* ----------------------------------------------------------------- render */
function renderStatus(down = false) {
  const pill = $('pill'), s = S.sync || {};
  let cls = 'ok', text = 'Synced with the team hub';
  if (down) { cls = 'off'; text = 'Reconnecting…'; }
  else if (!s.online) { cls = 'off'; text = 'No connection to hub'; }
  else if (!s.hub_ok) { cls = 'off'; text = 'Hub not reachable'; }
  else if (s.outbox > 0) { cls = 'busy'; text = `Syncing · ${s.outbox} queued`; }
  pill.className = `pill ${cls}`; $('pill-text').textContent = text;
  const all = [...S.claims.values()], fromHub = all.filter(c => c.captured_by && c.captured_by !== S.device).length;
  $('count').textContent = S.loaded ? `${all.length} claims · ${fromHub} came from the team hub` : '';
}
function canSettle(cf) { return cf.owner === S.device || !LAPTOPS.includes(cf.owner); }
function renderConflicts() {
  const list = [...S.conflicts.values()].sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at)));
  const open = list.filter(c => c.status === 'open');
  const shown = open.length ? open : list.slice(0, 1);       // nothing open: the last one, resolved
  $('conflicts').innerHTML = shown.map(cf => {
    const cs = (cf.claim_ids || []).map(id => S.claims.get(id)).filter(Boolean);
    const done = cf.status !== 'open';
    const attr = String(cf.attribute || '').replace('_', ' ');
    const sides = cs.map(c => {
      const lost = done && cf.winner_claim_id && c.claim_id !== cf.winner_claim_id;
      const btn = !done && canSettle(cf) ? `<button data-keep="${esc(c.claim_id)}" data-cf="${esc(cf.conflict_id)}">Keep</button>` : '';
      return `<div class="side ${lost ? 'lost' : ''}"><div><b>${esc(valueOf(c))}</b><small>${esc(kindLabel(c.source?.kind))} · ${esc(prettyAuthor(c.source?.author))} · ${esc(when(c.source?.at || c.stated_at))}</small></div>${btn}</div>`;
    }).join('');
    const foot = done ? `<div class="wait">Kept ${esc(valueOf(S.claims.get(cf.winner_claim_id)))}${cf.resolved_by ? `, chosen by ${esc(cf.resolved_by === S.device ? 'you' : nameOf(cf.resolved_by))}` : ''}.</div>`
      : canSettle(cf) ? '' : `<div class="wait">Waiting for ${esc(nameOf(cf.owner))}: it’s their call.</div>`;
    return `<div class="cf ${done ? 'done' : ''}"><div class="kick">${done ? 'Resolved' : 'Disputed'}</div><div class="ttl">${esc(cf.entity)} · ${esc(attr)}</div>${sides}${foot}</div>`;
  }).join('');
}
function renderClaims() {
  const list = [...S.claims.values()].filter(c => c.attribute !== 'resolution')
    .sort((a, b) => (b.modified_at || 0) - (a.modified_at || 0)).slice(0, 14);
  $('claims').innerHTML = list.length ? list.map(c => {
    const st = stateOf(c);
    return `<li class="${S.fresh.has(c.claim_id) ? 'new' : ''}"><span class="t">${esc(c.text)}</span><span class="s">${esc(kindLabel(c.source?.kind))} · ${esc(prettyAuthor(c.source?.author))} · ${esc(when(c.source?.at || c.stated_at))}</span><span class="st ${st}">${STATE[st] || st}</span></li>`;
  }).join('') : '<li class="empty">Nothing yet. It fills from the team hub when it connects.</li>';
  S.fresh.clear();
}

/* ---------------------------------------------------------------- actions */
async function ask(q) {
  q = q.trim(); if (!q) return;
  const box = $('answer');
  box.className = 'answer'; box.innerHTML = `<div class="q">${esc(q)}</div><div class="txt">Searching…</div>`;
  try {
    const r = await api('POST', '/api/ask', { q, view: 'mine' });
    box.className = `answer ${r.disputed ? 'disputed' : ''}`;
    const cites = (r.citations || []).slice(0, 4).map(c => `<li><b>${esc(kindLabel(c.kind))} · ${esc(prettyAuthor(c.author))}</b> · ${esc(when(c.at))}<br>${esc(c.excerpt)}</li>`).join('');
    box.innerHTML = `<div class="q">${esc(q)}</div><div class="txt">${esc(r.answer)}</div>${cites ? `<ul class="cites">${cites}</ul>` : ''}<div class="meta">${Math.round(r.took_ms ?? 0)} ms · with sources</div>`;
  } catch (e) { box.innerHTML = `<div class="q">${esc(q)}</div><div class="txt">Couldn’t answer: ${esc(e.message)}</div>`; }
}
$('ask-form').addEventListener('submit', e => { e.preventDefault(); const q = $('ask').value; $('ask').blur(); ask(q); });
document.querySelector('.chips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { $('ask').value = b.dataset.q; ask(b.dataset.q); } });

$('note-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('note').value.trim(); if (!text) return;
  const btn = e.target.querySelector('button'), msg = $('note-msg');
  btn.disabled = true; btn.textContent = 'Reading…'; msg.className = 'msg'; msg.textContent = 'Reading the note…';
  try {
    const r = await api('POST', '/api/ingest', { kind: 'note', text });
    $('note').value = ''; $('note').blur();
    (r.claims || []).forEach(c => { if (!S.claims.has(c.claim_id)) S.fresh.add(c.claim_id); S.claims.set(c.claim_id, c); });
    (r.conflicts || []).forEach(cf => S.conflicts.set(cf.conflict_id, cf));
    const n = (r.claims || []).length, c = (r.claims || [])[0];
    const where = !c ? '' : stateOf(c) === 'private' ? 'stays private' : 'going to the team hub';
    msg.className = 'msg ok';
    msg.textContent = n ? `${n} claim${n > 1 ? 's' : ''}: ${valueOf(c)} · ${where}${(r.conflicts || []).length ? ' · conflict found' : ''}` : 'Saved; no facts found in it.';
    renderAll();
    if ((r.conflicts || []).length) window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { msg.className = 'msg err'; msg.textContent = `Couldn’t save: ${err.message}`; }
  btn.disabled = false; btn.textContent = 'Save';
});

$('conflicts').addEventListener('click', async e => {
  const b = e.target.closest('[data-keep]'); if (!b) return;
  b.disabled = true;
  try { const cf = await api('POST', `/api/conflicts/${encodeURIComponent(b.dataset.cf)}/resolve`, { winner_claim_id: b.dataset.keep }); S.conflicts.set(cf.conflict_id, cf); renderAll(); }
  catch (err) { b.disabled = false; alert(`Couldn’t settle it: ${err.message}`); }
});

load().catch(e => { $('role').textContent = `Can’t reach Quorum: ${e.message}`; }).finally(subscribe);
