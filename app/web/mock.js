// ?mock=1: a scripted in-browser fake of one device's HTTP API and SSE stream (app/CONTRACT.md),
// so the UI can be built and screenshotted before the backend exists. It keeps a local "shard",
// an outbox, a fake hub and a 1 s sync loop, and scripts the other device ("peer").
// Keys 1-8 play the demo script from this device's point of view (&device=tanishk|lakshya);
// 0 reloads. A hidden control strip sits in the bottom-left corner.

const TODAY = '2026-10-03';
const START_MS = Date.parse('2026-10-03T14:00:00+05:30');
const BOOT = performance.now();
const IST_MS = 5.5 * 3600e3;
const nowMs = () => START_MS + (performance.now() - BOOT);
const isoAt = ms => new Date(ms + IST_MS).toISOString().slice(0, 19) + '+05:30';
const nowIso = () => isoAt(nowMs());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DISPLAY = { tanishk: 'Tanishk · on set', lakshya: 'Lakshya · office' };
const NAME = { tanishk: 'Tanishk', lakshya: 'Lakshya' };
const CONFLICT_ATTRS = new Set(['due_date', 'birthday', 'assignee', 'location', 'amount', 'count']);
const VECTOR_BYTES = 7800;  // ~768 floats as JSON: what a real push/pull of one point costs

export const NOTE_TEXT = 'Client just called: Sharma delivery moves to the 18th.';

/* ------------------------------------------------------------------ seed */
// Cluster centres in raw "xyz" space (the real API returns xyz of similar magnitude).
const CENTRES = { sharma: [3.2, 1.0, -2.0], mehta: [-3.4, 0.6, 1.8], kapoor: [0.6, -1.6, 3.6], pangong: [-1.8, -1.0, -3.4], studio: [2.6, -0.4, 2.8], personal: [-0.4, 2.2, 0.2] };
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const jitter = (s, k) => ((hash(s + k) % 10000) / 10000 - 0.5) * 2;
const xyzNear = (centre, key, spread = 1.1) => CENTRES[centre].map((v, i) => +(v + jitter(key, i) * spread).toFixed(3));

let idSeq = 0;
const newClaimId = () => 'clm_' + (hash(String(nowMs()) + (idSeq++)).toString(16) + '000000000000').slice(0, 12);

function mkClaim(o) {
  const at = o.at || nowIso();
  const id = o.id || newClaimId();
  return {
    claim_id: id, text: o.text, entity: o.entity, entity_kind: o.kind || 'task', attribute: o.attr || 'note',
    value: o.value ?? o.text, value_label: o.label ?? o.value ?? o.text, owner: o.owner || o.by,
    source: { kind: o.src, ref: `${o.src}:${at}`, author: o.author, excerpt: o.excerpt || o.text, at },
    stated_at: at, captured_by: o.by, device_id: `dev_${o.by}`, tier: o.tier || 'team', status: 'active',
    conflict_id: null, resolves: null, version: 1, modified_at: Date.parse(at), modified_by: o.by,
    _xyz: o.xyz || xyzNear(o.c || 'personal', id),
  };
}

const SHARED = [
  { c: 'sharma', text: 'Sharma sangeet shoot is at the Leela Palace, Udaipur', entity: 'Sharma sangeet shoot', kind: 'event', attr: 'location', value: 'Leela Palace, Udaipur', label: 'Leela Palace', owner: 'tanishk', by: 'tanishk', src: 'whatsapp', author: 'client:sharma', excerpt: 'Sangeet is at the Leela, Udaipur. Two cameras please.', at: '2026-09-28T19:12:00+05:30' },
  { c: 'sharma', text: 'Lakshya is editing the Sharma wedding film', entity: 'Sharma wedding edit', attr: 'assignee', value: 'lakshya', label: 'Lakshya', owner: 'tanishk', by: 'tanishk', src: 'note', author: 'tanishk', excerpt: 'Lakshya takes the Sharma edit, I stay on shoots.', at: '2026-09-30T11:05:00+05:30' },
  { c: 'sharma', text: 'Sharma highlight reel must stay under 5 minutes', entity: 'Sharma highlight reel', attr: 'note', owner: 'tanishk', by: 'lakshya', src: 'email', author: 'client:sharma', excerpt: 'Please keep the highlight reel under 5 minutes.', at: '2026-09-29T10:20:00+05:30' },
  { c: 'mehta', text: 'Mehta reel cutdowns (3 of them) are due 6 Oct', entity: 'Mehta reel cutdowns', attr: 'due_date', value: '2026-10-06', label: '6 Oct', owner: 'lakshya', by: 'lakshya', src: 'whatsapp', author: 'whatsapp:Mehta Reels group', excerpt: 'Need all 3 cutdowns by Monday the 6th please.', at: '2026-10-01T09:42:00+05:30' },
  { c: 'mehta', text: 'Mehta reels use the new logo pack v2', entity: 'Mehta reels', kind: 'project', attr: 'note', owner: 'lakshya', by: 'lakshya', src: 'email', author: 'client:mehta', excerpt: 'Use logo pack v2 from now on.', at: '2026-09-30T16:10:00+05:30' },
  { c: 'mehta', text: 'Tanishk is shooting the Mehta product reels', entity: 'Mehta reels', kind: 'project', attr: 'assignee', value: 'tanishk', label: 'Tanishk', owner: 'lakshya', by: 'lakshya', src: 'note', author: 'lakshya', at: '2026-09-27T12:00:00+05:30' },
  { c: 'kapoor', text: 'Kapoor invoice is ₹84,000', entity: 'Kapoor invoice', attr: 'amount', value: '84000', label: '₹84,000', owner: 'lakshya', by: 'lakshya', src: 'email', author: 'accounts@kapoorevents.in', excerpt: 'Invoice total ₹84,000 incl. GST.', at: '2026-09-26T15:30:00+05:30' },
  { c: 'kapoor', text: 'Kapoor invoice payment is due 8 Oct', entity: 'Kapoor invoice', attr: 'due_date', value: '2026-10-08', label: '8 Oct', owner: 'lakshya', by: 'lakshya', src: 'email', author: 'client:kapoor', excerpt: 'We will clear the payment by the 8th.', at: '2026-10-02T11:15:00+05:30' },
  { c: 'kapoor', text: 'Send the GST copy of the Kapoor invoice to accounts', entity: 'Kapoor GST copy', attr: 'note', owner: 'lakshya', by: 'lakshya', src: 'note', author: 'lakshya', at: '2026-10-02T11:30:00+05:30' },
  { c: 'pangong', text: 'Pangong shoot permits must be ready by 9 Oct', entity: 'Pangong shoot permits', attr: 'due_date', value: '2026-10-09', label: '9 Oct', owner: 'tanishk', by: 'tanishk', src: 'whatsapp', author: 'whatsapp:Stanzin (fixer)', excerpt: 'Inner line permits by the 9th or we lose the slot.', at: '2026-10-01T18:05:00+05:30' },
  { c: 'pangong', text: 'Pangong shoot base camp is at Spangmik', entity: 'Pangong shoot', kind: 'event', attr: 'location', value: 'Spangmik', label: 'Spangmik', owner: 'tanishk', by: 'tanishk', src: 'whatsapp', author: 'whatsapp:Stanzin (fixer)', at: '2026-10-01T18:07:00+05:30' },
  { c: 'pangong', text: 'Pangong shoot crew is 4 people', entity: 'Pangong shoot crew', kind: 'event', attr: 'count', value: '4', label: '4 people', owner: 'tanishk', by: 'tanishk', src: 'note', author: 'tanishk', at: '2026-09-29T21:40:00+05:30' },
  { c: 'pangong', text: 'Pack 6 drone battery sets for Pangong', entity: 'Pangong drone batteries', attr: 'count', value: '6', label: '6 sets', owner: 'tanishk', by: 'tanishk', src: 'note', author: 'tanishk', at: '2026-09-30T08:15:00+05:30' },
  { c: 'studio', text: 'Studio rent is due 5 Oct', entity: 'Studio rent', attr: 'due_date', value: '2026-10-05', label: '5 Oct', owner: 'lakshya', by: 'lakshya', src: 'email', author: 'landlord (Mr. Bedi)', excerpt: 'Reminder: October rent by the 5th.', at: '2026-10-01T08:00:00+05:30' },
  { c: 'studio', text: 'Grading suite is booked for 11 Oct', entity: 'Grading suite booking', kind: 'event', attr: 'status', value: 'booked', label: 'Booked 11 Oct', owner: 'lakshya', by: 'lakshya', src: 'email', author: 'colorlab.in', at: '2026-09-30T13:00:00+05:30' },
  { c: 'studio', text: 'Order 2 more 4 TB backup drives', entity: 'Backup drives', attr: 'count', value: '2', label: '2 drives', owner: 'lakshya', by: 'tanishk', src: 'note', author: 'tanishk', at: '2026-10-02T19:20:00+05:30' },
];
const PERSONAL = {
  tanishk: [
    { text: "Riya's birthday is 12 Oct", entity: 'Riya', kind: 'person', attr: 'birthday', value: '2026-10-12', label: '12 Oct', by: 'tanishk', src: 'note', author: 'tanishk', tier: 'my_devices', at: '2026-09-20T22:10:00+05:30' },
    { text: 'Salary credited on 1 Oct', entity: 'Salary', kind: 'note', attr: 'amount', value: 'credited', label: 'Credited', by: 'tanishk', src: 'note', author: 'tanishk', tier: 'device', at: '2026-10-01T10:00:00+05:30' },
    { text: 'Aarav got the Bangalore offer (keep it quiet)', entity: 'Aarav', kind: 'person', attr: 'note', by: 'tanishk', src: 'whatsapp', author: 'whatsapp:Aarav', tier: 'device', at: '2026-10-02T23:05:00+05:30' },
    { text: 'Dentist appointment on 7 Oct', entity: 'Dentist appointment', kind: 'event', attr: 'note', by: 'tanishk', src: 'note', author: 'tanishk', tier: 'device', at: '2026-09-25T09:00:00+05:30' },
  ],
  lakshya: [
    { text: "Mom's birthday is 20 Oct", entity: 'Mom', kind: 'person', attr: 'birthday', value: '2026-10-20', label: '20 Oct', by: 'lakshya', src: 'note', author: 'lakshya', tier: 'my_devices', at: '2026-09-18T21:00:00+05:30' },
    { text: 'Freelance payment from Zoya received', entity: 'Zoya payment', kind: 'note', attr: 'amount', value: 'received', label: 'Received', by: 'lakshya', src: 'note', author: 'lakshya', tier: 'device', at: '2026-10-02T17:45:00+05:30' },
    { text: "Neha is moving to Pune (don't tell anyone yet)", entity: 'Neha', kind: 'person', attr: 'note', by: 'lakshya', src: 'whatsapp', author: 'whatsapp:Neha', tier: 'device', at: '2026-10-01T22:30:00+05:30' },
  ],
};
const INBOX = {
  lakshya: [{ id: 'mail_sharma_delivery', from: 'Rohan Sharma', subject: 'Re: Wedding edit delivery', at: '2026-10-03T13:40:00+05:30', text: 'Hi Lakshya, confirming final delivery of the Sharma wedding edit on 16 October. Please share the private link once it is up. Thanks, Rohan' }],
  tanishk: [{ id: 'mail_pangong_camp', from: 'Stanzin (Ladakh fixer)', subject: 'Pangong: camp confirmed', at: '2026-10-03T12:10:00+05:30', text: 'Camp at Spangmik is confirmed for your crew of 4. Permits are on track.' }],
};
// The two claims the demo creates. Their raw xyz sit apart so the conflict pull reads clearly.
const SHARMA_XYZ = { 18: [4.7, 1.9, -0.3], 16: [1.8, 0.1, -3.5] };
const sharmaDueClaim = (day, o) => mkClaim({
  text: `Sharma wedding edit delivery is due ${day} Oct`, entity: 'Sharma wedding edit', attr: 'due_date',
  value: `2026-10-${day}`, label: `${day} Oct`, owner: 'tanishk', tier: 'team', xyz: SHARMA_XYZ[day], ...o,
});

/* ------------------------------------------------------------------ mock */
export function createMock({ device = 'tanishk' } = {}) {
  const me = NAME[device] ? device : 'tanishk';
  const peer = me === 'tanishk' ? 'lakshya' : 'tanishk';
  const listeners = new Set();
  const claims = new Map();          // this device's shard
  const outbox = new Set();
  const conflicts = new Map();
  const activity = [];
  const hub = new Map();             // claim_id -> payload
  const inbox = (INBOX[me] || []).map(m => ({ ...m }));
  const sync = { online: true, hub_ok: true, outbox: 0, bytes_up: 0, bytes_down: 0, last_push: null, last_pull: null, last_error: null };
  let cursor = 0;
  const peerState = { online: true, outbox: [] };
  let driver = null;

  // seed: shared claims on both devices and the hub, personal ones on this device only
  for (const s of SHARED) { const c = mkClaim(s); claims.set(c.claim_id, c); hub.set(c.claim_id, strip(c)); cursor = Math.max(cursor, c.modified_at); }
  for (const s of PERSONAL[me]) { const c = mkClaim({ c: 'personal', ...s }); claims.set(c.claim_id, c); if (c.tier !== 'device') hub.set(c.claim_id, strip(c)); }
  activity.push(
    { at: '2026-10-03T09:12:04+05:30', kind: 'sync_pull', text: `Pulled ${SHARED.length} team claims from the hub` },
    { at: '2026-10-03T09:12:05+05:30', kind: 'net', text: 'Connected to hub' },
  );

  function strip(c) { const { _xyz, ...rest } = c; return { ...rest, status: c.status === 'disputed' ? 'active' : c.status, conflict_id: c.status === 'disputed' ? null : c.conflict_id }; }
  function ui(c) {
    const syncState = c.tier === 'device' ? 'private' : outbox.has(c.claim_id) ? 'queued' : 'synced';
    const { _xyz, ...rest } = c;
    return { ...structuredClone(rest), sync: syncState, xyz: _xyz };
  }
  function emit(type, data) { setTimeout(() => listeners.forEach(fn => fn({ type, data: structuredClone(data) })), 0); }
  function log(kind, text) { const a = { at: nowIso(), kind, text }; activity.push(a); emit('activity', a); return a; }
  function emitSync() { sync.outbox = outbox.size; emit('sync', { ...sync }); }
  const name = id => (id === me ? 'You' : NAME[id] || id);

  function addLocal(c, { enqueue = c.tier !== 'device' } = {}) {
    claims.set(c.claim_id, c);
    if (enqueue && c.tier !== 'device') outbox.add(c.claim_id);
    emit('claim', ui(c));
    log('claim_added', `New claim: ${c.entity} · ${c.value_label}${c.tier === 'device' ? ' (private)' : ''}`);
    return c;
  }
  function bump(c, fields, by = me) {
    Object.assign(c, fields, { version: c.version + 1, modified_at: nowMs(), modified_by: by });
    return c;
  }

  /* -------- conflicts (same rules as conflicts.check, with a fixed similarity) */
  function check(c, detectedOn) {
    if (!CONFLICT_ATTRS.has(c.attribute)) return null;
    const head = c.entity.split(' ')[0].toLowerCase();
    const other = [...claims.values()].find(o => o.claim_id !== c.claim_id && o.attribute === c.attribute
      && (o.status === 'active' || o.status === 'disputed') && o.value !== c.value && o.entity.split(' ')[0].toLowerCase() === head);
    if (!other) return null;
    const ids = [other.claim_id, c.claim_id];
    const cf = {
      conflict_id: 'cfl_' + hash(ids.slice().sort().join('|')).toString(16).padStart(10, '0').slice(0, 10),
      claim_ids: ids, entity: other.entity, attribute: c.attribute, similarity: 0.899, owner: other.owner,
      status: 'open', detected_on: detectedOn, detected_at: nowIso(), winner_claim_id: null, resolution_claim_id: null, resolved_by: null,
    };
    if (conflicts.has(cf.conflict_id)) return conflicts.get(cf.conflict_id);
    conflicts.set(cf.conflict_id, cf);
    for (const x of [other, c]) { x.status = 'disputed'; x.conflict_id = cf.conflict_id; emit('claim', ui(x)); }
    emit('conflict', cf);
    log('conflict_opened', `Conflict: ${cf.entity} · ${other.value_label} vs ${c.value_label} (similarity ${cf.similarity.toFixed(2)})`);
    return cf;
  }

  function resolveLocal(cf, winnerId, by) {
    const loserId = cf.claim_ids.find(id => id !== winnerId);
    const winner = claims.get(winnerId), loser = claims.get(loserId);
    bump(winner, { status: 'active' }, by); bump(loser, { status: 'superseded' }, by);
    const res = mkClaim({ c: 'sharma', text: `Resolved: ${cf.entity} ${winner.value_label} (chosen by ${NAME[by]})`, entity: cf.entity, attr: 'resolution', value: winnerId, label: winner.value_label, owner: cf.owner, by, src: 'note', author: by, tier: 'team', xyz: winner._xyz });
    res.resolves = cf.conflict_id;
    Object.assign(cf, { status: 'resolved', winner_claim_id: winnerId, resolution_claim_id: res.claim_id, resolved_by: by });
    return { winner, loser, res };
  }

  /* -------- the sync worker: push the outbox, then pull what others pushed */
  setInterval(() => {
    if (!sync.online) return;
    if (outbox.size) {
      const ids = [...outbox];
      for (const id of ids) {
        const c = claims.get(id); if (!c) { outbox.delete(id); continue; }
        hub.set(id, strip(c));
        sync.bytes_up += JSON.stringify(strip(c)).length + VECTOR_BYTES; sync.bytes_down += 60;
        outbox.delete(id);
        emit('claim', ui(c));
      }
      sync.last_push = nowIso();
      log('sync_push', `Pushed ${ids.length} claim${ids.length > 1 ? 's' : ''} to the hub`);
    }
    sync.bytes_up += 210; sync.bytes_down += 96;   // the pull query itself
    const fresh = [...hub.values()].filter(h => h.modified_at > cursor && h.modified_by !== me
      && (h.tier === 'team' || (h.tier === 'my_devices' && h.captured_by === me)));
    fresh.sort((a, b) => a.modified_at - b.modified_at);
    let pulled = 0;
    for (const h of fresh) {
      cursor = Math.max(cursor, h.modified_at);
      sync.bytes_down += JSON.stringify(h).length + VECTOR_BYTES;
      const local = claims.get(h.claim_id);
      if (!local) {
        const c = { ...structuredClone(h), _xyz: h._xyzHint || xyzNear('studio', h.claim_id) };
        delete c._xyzHint;
        claims.set(c.claim_id, c); pulled++;
        emit('claim', ui(c));
        if (c.attribute === 'resolution') applyRemoteResolution(c); else check(c, 'sync');
      } else if (h.version > local.version) {
        Object.assign(local, structuredClone(h)); delete local._xyzHint; pulled++;
        emit('claim', ui(local));
      }
    }
    if (pulled) { sync.last_pull = nowIso(); log('sync_pull', `Pulled ${pulled} claim${pulled > 1 ? 's' : ''} from the hub`); }
    emitSync();
  }, 1000);

  function applyRemoteResolution(res) {
    const cf = conflicts.get(res.resolves); if (!cf || cf.status === 'resolved') return;
    Object.assign(cf, { status: 'resolved', winner_claim_id: res.value, resolution_claim_id: res.claim_id, resolved_by: res.captured_by });
    emit('conflict', cf);
    log('conflict_resolved', `${NAME[res.captured_by]} resolved ${cf.entity}: ${res.value_label}`);
  }

  /* -------- the scripted peer device */
  const peerApi = {
    setOnline(on) {
      peerState.online = on;
      if (on) { for (const c of peerState.outbox) hub.set(c.claim_id, c); peerState.outbox = []; }
    },
    capture(c) { const h = { ...strip(c), _xyzHint: c._xyz }; if (peerState.online) hub.set(c.claim_id, h); else peerState.outbox.push(h); },
    captureNote() { peerApi.capture(sharmaDueClaim(18, { by: 'tanishk', src: 'note', author: 'client:sharma (call)', excerpt: NOTE_TEXT })); },
    receiveEmail() { peerApi.capture(sharmaDueClaim(16, { by: 'lakshya', src: 'email', author: 'client:sharma', excerpt: 'Confirming final delivery of the Sharma wedding edit on 16 October.' })); },
    resolve(day) {
      const cf = [...conflicts.values()].find(x => x.status === 'open'); if (!cf) return;
      const winnerId = cf.claim_ids.find(id => claims.get(id)?.value === `2026-10-${day}`) || cf.claim_ids[0];
      // The peer resolves on its own copy; we only see the result through the hub.
      for (const id of cf.claim_ids) {
        const c = structuredClone(claims.get(id));
        bump(c, { status: id === winnerId ? 'active' : 'superseded', conflict_id: cf.conflict_id }, peer);
        hub.set(id, { ...strip(c), status: c.status, _xyzHint: c._xyz });
      }
      const w = claims.get(winnerId);
      const res = mkClaim({ c: 'sharma', text: `Resolved: ${cf.entity} ${w.value_label} (chosen by ${NAME[peer]})`, entity: cf.entity, attr: 'resolution', value: winnerId, label: w.value_label, owner: cf.owner, by: peer, src: 'note', author: peer, tier: 'team', xyz: w._xyz });
      res.resolves = cf.conflict_id; res.modified_at = nowMs() + 1;
      hub.set(res.claim_id, { ...strip(res), _xyzHint: res._xyz });
    },
  };

  /* -------- answers (templated like answer.py) */
  const STOP = new Set('what whats is are the a an of on in to for this week when due do we i my our it s about and or by with deadline'.split(' '));
  function whoSays(c) {
    const a = c.source?.author || '';
    if (/^client:/i.test(a) && c.source.kind === 'email') return "the client's email";
    if (c.source?.kind === 'note') return `${c.captured_by === me ? 'your' : `${NAME[c.captured_by]}'s`} note${/\(call\)/.test(a) ? ' from the call' : ''}`;
    if (c.source?.kind === 'whatsapp') return 'the WhatsApp message';
    return `${NAME[c.captured_by] || 'someone'}'s ${c.source?.kind || 'note'}`;
  }
  const cite = c => ({ claim_id: c.claim_id, kind: c.source.kind, author: c.source.author, excerpt: c.source.excerpt, at: c.source.at });
  function ask(q, view) {
    const pool = [...claims.values()].filter(c => (c.status === 'active' || c.status === 'disputed') && c.attribute !== 'resolution' && (view !== 'team' || c.tier === 'team'));
    const words = (q.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w));
    const scored = pool.map(c => {
      const hay = `${c.text} ${c.entity}`.toLowerCase();
      return [c, words.length ? words.filter(w => hay.includes(w)).length / words.length : 0];
    }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const hits = scored.map(([c, s]) => ({ claim: ui(c), score: +(s * 0.05).toFixed(4) }));
    let answer, used, disputed = [];
    const dis = scored.map(([c]) => c).find(c => c.status === 'disputed');
    if (dis) {
      const cf = conflicts.get(dis.conflict_id);
      const pair = cf.claim_ids.map(id => claims.get(id)).sort((a, b) => a.value.localeCompare(b.value));
      const owner = cf.owner === me ? 'You own this' : `${NAME[cf.owner]} owns this`;
      answer = `Disputed: ${pair.map(c => `${whoSays(c)} says ${c.value_label}`).join('; ')}. ${owner}. Settle it?`;
      used = pair; disputed = [cf.conflict_id];
    } else if (/\b(due|this week|deadline)\b/i.test(q)) {
      const end = new Date(Date.parse(TODAY) + 7 * 864e5).toISOString().slice(0, 10);
      used = pool.filter(c => c.attribute === 'due_date' && c.value >= TODAY && c.value <= end).sort((a, b) => a.value.localeCompare(b.value));
      const parts = used.map(c => `${c.entity} on ${c.value_label}`);
      answer = used.length
        ? `${used.length} things are due this week: ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts[parts.length - 1]}.`
        : 'Nothing is due this week.';
    } else {
      used = scored.slice(0, 3).map(([c]) => c);
      answer = used.length ? used.map(c => c.text).join('. ') + '.' : 'Nothing on this device matches that yet.';
    }
    log('search', `Asked “${q}” (${view})`);
    return { answer, citations: used.map(cite), disputed, hits, took_ms: 7 + Math.round(Math.random() * 9) };
  }

  /* -------- extraction (the real one runs llama3.2 with a rules fallback) */
  function extract(text, kind, author, at) {
    const sharma = /sharma/i.test(text) && /\b(1\d|2\d|3[01]|[1-9])(st|nd|rd|th)?\b/.exec(text);
    if (sharma) {
      const day = sharma[1];
      return [sharmaDueClaim(day, { by: me, src: kind, at, author: author || (kind === 'note' ? 'client:sharma (call)' : 'client:sharma'), excerpt: text, xyz: SHARMA_XYZ[day] || xyzNear('sharma', text) })];
    }
    const words = text.replace(/[^\w\s']/g, '').split(/\s+/).filter(Boolean);
    return [mkClaim({ c: kind === 'note' ? 'personal' : 'pangong', text, at, entity: words.slice(0, 3).join(' '), kind: 'note', attr: 'note', label: words.slice(0, 4).join(' '), by: me, src: kind, author: author || me, tier: kind === 'note' ? 'device' : 'team' })];
  }
  function ingest(kind, text, author, at) {
    const out = extract(text, kind, author, at).map(c => {
      // stated at the source's time, but modified now (that is what sync cursors see)
      c.modified_at = nowMs();
      return addLocal(c);
    });
    const found = out.map(c => check(c, 'ingest')).filter(Boolean);
    return { claims: out.map(ui), conflicts: found, took_ms: 300 + Math.round(Math.random() * 120), extractor: 'fallback' };
  }

  /* -------- HTTP routes */
  async function request(method, path, body = {}) {
    await sleep(40 + Math.random() * 60);
    const route = `${method} ${path}`;
    let m;
    if (route === 'GET /api/state') {
      return structuredClone({
        device: me, display_name: DISPLAY[me], today: TODAY, sync: { ...sync, outbox: outbox.size },
        claims: [...claims.values()].map(ui), conflicts: [...conflicts.values()], activity: activity.slice(-60),
        peers: { tanishk: 'http://127.0.0.1:8001', lakshya: 'http://127.0.0.1:8002' },
      });
    }
    if (route === 'POST /api/net') {
      sync.online = !!body.online;
      log('net', sync.online ? 'Connected to hub' : 'No connection to hub: sync paused, everything else keeps working');
      emitSync(); return { ...sync };
    }
    if (route === 'POST /api/ask') { await sleep(20); return ask(body.q || '', body.view || 'mine'); }
    if (route === 'POST /api/ingest') { await sleep(300); return ingest(body.kind || 'note', body.text || '', body.author); }
    if (route === 'GET /api/inbox') return structuredClone(inbox);
    if ((m = /^POST \/api\/inbox\/([^/]+)\/receive$/.exec(route))) {
      const i = inbox.findIndex(x => x.id === decodeURIComponent(m[1]));
      if (i < 0) throw new Error('404 not in inbox');
      const [mail] = inbox.splice(i, 1);
      await sleep(350);
      return ingest('email', mail.text, mail.id === 'mail_sharma_delivery' ? 'client:sharma' : 'whatsapp:Stanzin (fixer)', mail.at);
    }
    if ((m = /^POST \/api\/conflicts\/([^/]+)\/resolve$/.exec(route))) {
      const cf = conflicts.get(decodeURIComponent(m[1])); if (!cf) throw new Error('404 conflict');
      const { winner, loser, res } = resolveLocal(cf, body.winner_claim_id, me);
      claims.set(res.claim_id, res);
      for (const c of [winner, loser, res]) { outbox.add(c.claim_id); emit('claim', ui(c)); }
      emit('conflict', cf); emitSync();
      log('conflict_resolved', `You resolved ${cf.entity}: kept ${winner.value_label}`);
      return structuredClone(cf);
    }
    if ((m = /^POST \/api\/conflicts\/([^/]+)\/draft$/.exec(route))) {
      const cf = conflicts.get(decodeURIComponent(m[1])); if (!cf) throw new Error('404 conflict');
      const [a, b] = cf.claim_ids.map(id => claims.get(id)).sort((x, y) => x.value.localeCompare(y.value));
      // Addressed to the owner, so their own note reads "your note".
      const text = `Hi ${NAME[cf.owner]}, quick check on the ${cf.entity}: ${whoSays(a)} says ${a.value_label}, ${whoSays(b)} says ${b.value_label}. Which one is right?`
        .replace(`${NAME[cf.owner]}'s note`, 'your note');
      const enc = encodeURIComponent;
      return { to: cf.owner, text, mailto: `mailto:?subject=${enc(`${cf.entity}: ${a.value_label} or ${b.value_label}?`)}&body=${enc(text)}`, wa_link: `https://wa.me/?text=${enc(text)}` };
    }
    throw new Error(`404 mock has no route ${route}`);
  }

  /* -------- the demo script, from this device's point of view */
  const STEPS = [
    ['Ask what is due', () => driver.ask("What's due this week?")],
    ['Lose the hub', () => (me === 'tanishk' ? driver.setNet(false) : peerApi.setOnline(false))],
    ['Note: 18th', () => (me === 'tanishk' ? driver.note(NOTE_TEXT) : peerApi.captureNote())],
    ['Email: 16th', () => (me === 'lakshya' ? driver.receive('mail_sharma_delivery') : peerApi.receiveEmail())],
    ['Reconnect', () => (me === 'tanishk' ? driver.setNet(true) : peerApi.setOnline(true))],
    ['Ask Sharma', () => driver.ask('When is the Sharma delivery?')],
    ['Resolve', async () => {
      if (me === 'tanishk') { driver.keep('16 Oct'); return; }
      driver.askOwner(); await sleep(3500); peerApi.resolve('16');
    }],
    ['Team view', () => { driver.closeCard(); driver.setView('team'); }],
  ];
  async function play(n) {
    const step = STEPS[n - 1]; if (!step || !driver) return;
    strip_?.querySelectorAll('button[data-step]').forEach(b => b.classList.toggle('done', +b.dataset.step <= n));
    await step[1]();
  }

  let strip_ = null;
  function installStrip() {
    strip_ = document.createElement('div');
    strip_.id = 'mock-strip';
    strip_.innerHTML = `<span class="mock-tag">mock · ${NAME[me]}</span>` +
      STEPS.map(([label], i) => `<button data-step="${i + 1}" title="${label}">${i + 1}</button>`).join('') +
      `<button data-step="0" title="Reset">↺</button>`;
    strip_.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; +b.dataset.step ? play(+b.dataset.step) : location.reload(); });
    document.body.appendChild(strip_);
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      // preventDefault: the step may focus an input, which would otherwise receive this keystroke
      if (/^[1-8]$/.test(e.key)) { e.preventDefault(); play(+e.key); }
      if (e.key === '0') { e.preventDefault(); location.reload(); }
    });
  }

  return {
    transport: {
      request,
      subscribe(onEvent, onStatus) { listeners.add(onEvent); setTimeout(() => onStatus('open'), 50); },
    },
    attach(d) { driver = d; installStrip(); },
    play,
    peer: peerApi,
  };
}
