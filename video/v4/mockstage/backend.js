// Quorum v4 film: the scripted fake backend behind the stage replica (mockstage/index.html).
//
// Both device panes are the real device UI (device.js, copied) and the real stage script (stage.js,
// copied, with its hub poll swapped for this module). Instead of two FastAPI processes and a Qdrant
// hub, this one in-page model answers each pane's HTTP calls and pushes its SSE events, with the
// shapes from app/CONTRACT.md. Data comes from app/fixtures (seed.json, inbox_lakshya.json,
// demo_inputs.json, copied into fixtures.js).
//
// Timing is mocked for the film (STORYBOARD.md, "Mocked demo numbers"): answers in 9 / 11 / 8 ms,
// extraction held for 4.5 s, the reconnect sync at fixed capture times, similarity 0.85. Every
// delay runs on the page clock (setTimeout / performance.now), which capture.js replaces with a
// virtual clock, so a take is the same every time. performance.now()/1000 is the capture time (ct).
//
// Nothing here is shown as a product feature; it only plays the part of the backend.
(function () {
  'use strict';
  const FIX = window.QFIX;
  const ct = () => performance.now() / 1000;
  const T0 = Date.parse('2026-10-03T19:02:00+05:30');   // wall clock at ct 0 (the stage reads "19:02")
  const IST = 5.5 * 3600e3;
  const isoAt = s => new Date(T0 + s * 1000 + IST).toISOString().slice(0, 19) + '+05:30';
  const msAt = s => T0 + Math.round(s * 1000);
  const TODAY = '2026-10-03';
  const DISPLAY = { tanishk: 'Tanishk · on set', lakshya: 'Lakshya · office' };
  const NAME = { tanishk: 'Tanishk', lakshya: 'Lakshya' };
  const VECTOR_BYTES = 7800;
  const clone = o => JSON.parse(JSON.stringify(o));
  const later = (sec, fn) => setTimeout(fn, Math.max(0, sec * 1000));
  /** Run fn at capture time t (or right away if t has passed). */
  const at = (t, fn) => later(Math.max(t - ct(), 0), fn);

  /* ------------------------------------------------------------ cloud xyz */
  const CENTRES = { sharma: [3.2, 1.0, -2.0], mehta: [-3.4, 0.6, 1.8], kapoor: [0.6, -1.6, 3.6], ladakh: [-1.8, -1.0, -3.4], personal: [-0.4, 2.2, 0.2] };
  function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const jitter = (s, k) => ((hash(s + k) % 10000) / 10000 - 0.5) * 2;
  const clusterOf = c => /sharma/i.test(c.entity) ? 'sharma' : /mehta/i.test(c.entity) ? 'mehta' : /kapoor/i.test(c.entity) ? 'kapoor'
    : /pangong|ladakh/i.test(c.entity) ? 'ladakh' : 'personal';
  const xyzOf = c => CENTRES[clusterOf(c)].map((v, i) => +(v + jitter(c.claim_id, i) * 1.1).toFixed(3));
  // The two claims the demo creates sit apart, so the conflict pull reads clearly.
  const SHARMA_XYZ = { 16: [1.8, 0.1, -3.5], 18: [4.7, 1.9, -0.3] };

  /* ----------------------------------------------------------------- hub */
  const hub = new Map();          // claim_id -> stored payload (no UI fields)
  const hubListeners = new Set();
  let hubSnap = null;
  function snapHub() {
    const all = [...hub.values()];
    hubSnap = {
      ok: true, total: all.length, device: all.filter(c => c.tier === 'device').length,
      recent: all.slice().sort((a, b) => b.modified_at - a.modified_at).slice(0, 6).map(c => ({
        claim_id: c.claim_id, entity: c.entity, value_label: c.value_label, attribute: c.attribute, tier: c.tier,
        modified_by: c.modified_by, captured_by: c.captured_by, modified_at: c.modified_at, text: c.text, version: c.version,
      })),
    };
    return hubSnap;
  }
  /** The stage reads the hub "every second"; here it is refreshed exactly when the film says. */
  function publishHub() { const s = snapHub(); hubListeners.forEach(fn => { try { fn(clone(s)); } catch (e) { console.error(e); } }); }
  const strip = c => { const { _xyz, sync, xyz, ...rest } = c; return clone(rest); };

  /* -------------------------------------------------------------- devices */
  function makeDevice(id) {
    return {
      id, claims: new Map(), outbox: new Set(), conflicts: new Map(), listeners: new Set(), activity: [],
      inbox: id === 'lakshya' ? clone(FIX.inbox_lakshya) : [],
      sync: { online: true, hub_ok: true, outbox: 0, bytes_up: 0, bytes_down: 0, last_push: isoAt(-40), last_pull: isoAt(-40), last_error: null },
    };
  }
  const dev = { tanishk: makeDevice('tanishk'), lakshya: makeDevice('lakshya') };
  // Byte totals as a stage that has been running for a while (the film opens mid-session).
  Object.assign(dev.tanishk.sync, { bytes_up: 26810, bytes_down: 23870 });
  Object.assign(dev.lakshya.sync, { bytes_up: 47720, bytes_down: 14090 });

  function ui(d, c) {
    const sync = c.tier === 'device' ? 'private' : d.outbox.has(c.claim_id) ? 'queued' : 'synced';
    const { _xyz, ...rest } = c;
    return { ...clone(rest), sync, xyz: _xyz };
  }
  // Events go out on a microtask: same order as a stream, and they don't need the clock to move.
  function emit(d, type, data) { const ev = { type, data: clone(data) }; queueMicrotask(() => d.listeners.forEach(fn => fn(ev))); }
  function log(d, kind, text) { const a = { at: isoAt(ct()), kind, text }; d.activity.push(a); emit(d, 'activity', a); }
  function emitSync(d) { d.sync.outbox = d.outbox.size; emit(d, 'sync', { ...d.sync }); }

  for (const s of FIX.seed.shared) {
    for (const d of Object.values(dev)) d.claims.set(s.claim_id, { ...clone(s), _xyz: xyzOf(s) });
    hub.set(s.claim_id, strip(s));
  }
  for (const id of ['tanishk', 'lakshya']) for (const s of FIX.seed[id]) {
    dev[id].claims.set(s.claim_id, { ...clone(s), _xyz: xyzOf(s) });
    if (s.tier !== 'device') hub.set(s.claim_id, strip(s));    // my_devices claims ride the hub to the owner's devices
  }
  for (const d of Object.values(dev)) d.activity.push(
    { at: isoAt(-60), kind: 'sync_pull', text: `Pulled ${FIX.seed.shared.length} team claims from the hub` },
    { at: isoAt(-59), kind: 'net', text: 'Connected to hub' });
  snapHub();

  // Idle sync rounds: the pull query itself costs a few hundred bytes, so "Hub traffic" stays alive.
  setInterval(() => {
    for (const d of Object.values(dev)) if (d.sync.online) { d.sync.bytes_up += 210; d.sync.bytes_down += 96 + (d.id === 'lakshya' ? 14 : 0); emitSync(d); }
  }, 1000);

  /* ------------------------------------------------------------ the demo's claims */
  const NOTE_TEXT = FIX.demo_inputs.tanishk_note;     // "Client just called: Sharma delivery moves to the 18th."
  const MAIL = FIX.inbox_lakshya[0];                   // eml_sharma_final_delivery
  const MAIL_EXCERPT = 'Confirming final delivery of the Sharma wedding edit on 16 October.';
  const ID = { note: 'clm_7e18c2a9d401', email: 'clm_16b5f0e3c792', res: 'clm_d3c1a0b8e617' };
  const CONFLICT_ID = 'cfl_9c4e27a1b5';                // a hash of the two claim ids: the same on both laptops

  function noteClaim(t) {
    return {
      claim_id: ID.note, text: 'Sharma delivery moves to 18 Oct', entity: 'Sharma delivery', entity_kind: 'task',
      attribute: 'due_date', value: '2026-10-18', value_label: '18 Oct', owner: 'tanishk',
      source: { kind: 'note', ref: `note:${isoAt(t).slice(0, 16)}`, author: 'tanishk', excerpt: NOTE_TEXT, at: isoAt(t) },
      stated_at: isoAt(t), captured_by: 'tanishk', device_id: 'dev_tanishk', tier: 'team', status: 'active',
      conflict_id: null, resolves: null, version: 1, modified_at: msAt(t), modified_by: 'tanishk', _xyz: SHARMA_XYZ[18],
    };
  }
  function emailClaim(t) {
    return {
      claim_id: ID.email, text: 'Final delivery of the Sharma wedding edit is on 16 Oct', entity: 'Sharma wedding edit', entity_kind: 'task',
      attribute: 'due_date', value: '2026-10-16', value_label: '16 Oct', owner: 'tanishk',
      source: { kind: 'email', ref: `email:${MAIL.id}`, author: MAIL.from, excerpt: MAIL_EXCERPT, at: MAIL.at },
      stated_at: MAIL.at, captured_by: 'lakshya', device_id: 'dev_lakshya', tier: 'team', status: 'active',
      conflict_id: null, resolves: null, version: 1, modified_at: msAt(t), modified_by: 'lakshya', _xyz: SHARMA_XYZ[16],
    };
  }

  /* ------------------------------------------------------------ sync steps */
  function push(d, t) {
    const ids = [...d.outbox];
    if (!ids.length) return;
    for (const id of ids) {
      const c = d.claims.get(id);
      hub.set(id, { ...strip(c), status: c.status === 'disputed' ? 'active' : c.status, conflict_id: c.status === 'disputed' ? null : c.conflict_id });
      d.sync.bytes_up += JSON.stringify(strip(c)).length + VECTOR_BYTES; d.sync.bytes_down += 60;
      d.outbox.delete(id);
      emit(d, 'claim', ui(d, c));
    }
    d.sync.last_push = isoAt(t);
    log(d, 'sync_push', `Pushed ${ids.length} claim${ids.length > 1 ? 's' : ''} to the hub`);
    emitSync(d);
  }
  /** Pull specific claims from the hub into d (the film decides which, and when). */
  function pull(d, ids, t, after) {
    let n = 0;
    for (const id of ids) {
      const h = hub.get(id); if (!h) continue;
      const local = d.claims.get(id);
      d.sync.bytes_down += JSON.stringify(h).length + VECTOR_BYTES;
      if (!local) d.claims.set(id, { ...clone(h), _xyz: id === ID.note ? SHARMA_XYZ[18] : id === ID.email ? SHARMA_XYZ[16] : id === ID.res ? SHARMA_XYZ[18] : xyzOf(h) });
      else if (h.version > local.version) Object.assign(local, clone(h));
      else continue;
      n++;
      emit(d, 'claim', ui(d, d.claims.get(id)));
    }
    if (after) after();
    if (n) { d.sync.last_pull = isoAt(t); log(d, 'sync_pull', `Pulled ${n} claim${n > 1 ? 's' : ''} from the hub`); }
    emitSync(d);
  }
  function openConflict(d, t) {
    const cf = {
      conflict_id: CONFLICT_ID, claim_ids: [ID.email, ID.note], entity: 'Sharma wedding edit', attribute: 'due_date',
      similarity: 0.85, owner: 'tanishk', status: 'open', detected_on: 'sync', detected_at: isoAt(t),
      winner_claim_id: null, resolution_claim_id: null, resolved_by: null,
    };
    d.conflicts.set(cf.conflict_id, cf);
    for (const id of cf.claim_ids) { const c = d.claims.get(id); c.status = 'disputed'; c.conflict_id = cf.conflict_id; emit(d, 'claim', ui(d, c)); }
    emit(d, 'conflict', cf);
    log(d, 'conflict_opened', 'Conflict: Sharma wedding edit · 16 Oct vs 18 Oct (similarity 0.85)');
  }

  /* ------------------------------------------------------------------ answers */
  const cite = c => ({ claim_id: c.claim_id, kind: c.source.kind, author: c.source.author, excerpt: c.source.excerpt, at: c.source.at });
  function ask(d, q, view) {
    const claims = [...d.claims.values()];
    if (/sharma/i.test(q)) {
      const email = d.claims.get(ID.email), note = d.claims.get(ID.note);
      if (email && note && email.status === 'disputed') {
        return {
          answer: "Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Tanishk owns this. Settle it?",
          citations: [cite(email), cite(note)], disputed: true, conflict_id: CONFLICT_ID,
          hits: [{ claim: ui(d, email), score: 0.031 }, { claim: ui(d, note), score: 0.029 }], took_ms: 8,
        };
      }
    }
    // "What's due this week?": the deadlines between today (3 Oct) and 10 Oct, from the fixtures.
    const end = '2026-10-10';
    const due = claims.filter(c => c.attribute === 'due_date' && (c.status === 'active') && c.value >= TODAY && c.value <= end
      && (view !== 'team' || c.tier === 'team')).sort((a, b) => a.value.localeCompare(b.value));
    const label = c => (c.entity === 'Mehta reel cutdowns' ? 'Mehta reel cutdowns (3 of them)' : c.entity);
    const parts = due.map(c => `${label(c)} on ${c.value_label}`);
    const answer = due.length ? `${due.length} things are due this week: ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts[parts.length - 1]}.` : 'Nothing is due this week.';
    return { answer, citations: due.map(cite), disputed: false, conflict_id: null, hits: due.map(c => ({ claim: ui(d, c), score: 0.03 })), took_ms: d.sync.online ? 9 : 11 };
  }

  /* ------------------------------------------------------------------ routes */
  function request(d, method, path, body = {}) {
    const route = `${method} ${path}`;
    let m;
    // Loading the page doesn't need the clock: state and inbox resolve on a microtask.
    if (route === 'GET /api/state') {
      return Promise.resolve(clone({
        device: d.id, display_name: DISPLAY[d.id], today: TODAY, sync: { ...d.sync, outbox: d.outbox.size },
        claims: [...d.claims.values()].map(c => ui(d, c)), conflicts: [...d.conflicts.values()], activity: d.activity.slice(-60),
        peers: { tanishk: 'http://127.0.0.1:8001', lakshya: 'http://127.0.0.1:8002' },
      }));
    }
    if (route === 'GET /api/inbox') return Promise.resolve(clone(d.inbox));
    return new Promise((resolve, reject) => {
      const reply = (sec, fn) => later(sec, () => { try { resolve(fn()); } catch (e) { reject(e); } });
      const t = ct();
      if (route === 'POST /api/net') {
        return reply(0.06, () => {
          d.sync.online = !!body.online;
          log(d, 'net', d.sync.online ? 'Connected to hub' : 'No connection to hub: sync paused, everything else keeps working');
          emitSync(d);
          if (d.sync.online && d.id === 'tanishk') reconnect();
          return { ...d.sync, outbox: d.outbox.size };
        });
      }
      if (route === 'POST /api/ask') return reply(0.4, () => { log(d, 'search', `Asked “${body.q}” (${body.view || 'mine'})`); return ask(d, body.q || '', body.view || 'mine'); });
      if (route === 'POST /api/ingest' && d.id === 'tanishk') {
        // The local model reads the note: held 4.5 s from the Save click (ct 26.5 -> 31.0).
        return at(Math.max(31.0, t + 0.3), () => {
          const tt = ct(), c = noteClaim(tt);
          d.claims.set(c.claim_id, c); d.outbox.add(c.claim_id);
          emit(d, 'claim', ui(d, c)); log(d, 'claim_added', `New claim: ${c.entity} · ${c.value_label}`); emitSync(d);
          resolve({ claims: [ui(d, c)], conflicts: [], took_ms: 4480, extractor: 'llm' });
        });
      }
      if ((m = /^POST \/api\/inbox\/([^/]+)\/receive$/.exec(route)) && d.id === 'lakshya') {
        // Held 4.5 s (ct 38.0 -> 42.5), then pushed at 43.0; the hub shows 19 at 43.5.
        return at(Math.max(42.5, t + 0.3), () => {
          const tt = ct(), c = emailClaim(tt);
          d.inbox = d.inbox.filter(x => x.id !== decodeURIComponent(m[1]));
          d.claims.set(c.claim_id, c); d.outbox.add(c.claim_id);
          emit(d, 'claim', ui(d, c)); log(d, 'claim_added', `New claim: ${c.entity} · ${c.value_label}`); emitSync(d);
          resolve({ claims: [ui(d, c)], conflicts: [], took_ms: 4510, extractor: 'llm' });
          at(tt + 0.5, () => push(d, ct()));
          at(tt + 1.0, publishHub);
        });
      }
      if ((m = /^POST \/api\/conflicts\/([^/]+)\/draft$/.exec(route))) {
        return reply(0.3, () => {
          const text = "Hi Tanishk, two sources disagree on the Sharma wedding edit: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Which one is right? - Lakshya";
          const q = encodeURIComponent;
          return { to: 'tanishk', text, mailto: `mailto:?subject=${q('Sharma wedding edit: which one is right?')}&body=${q(text)}`, wa_link: `https://wa.me/?text=${q(text)}` };
        });
      }
      if ((m = /^POST \/api\/conflicts\/([^/]+)\/resolve$/.exec(route)) && d.id === 'tanishk') {
        return reply(0.1, () => resolveOnTanishk(body.winner_claim_id));
      }
      reject(new Error(`404 mock backend has no route ${route}`));
    });
  }

  /* -------------------------------------------------------------- scripted sync */
  // Tanishk turns the hub back on (ct 52.0): his outbox goes first (52.25), then he pulls the email
  // and finds the conflict (52.5); Lakshya's next pull brings the note and the same conflict (53.0).
  function reconnect() {
    // Pinned to the film's beats (STORYBOARD S08: 75.25 push, 75.5 Tanishk, 76.0 Lakshya = ct 52.25 / 52.5 / 53.0).
    const T = dev.tanishk, L = dev.lakshya, t = ct();
    at(Math.max(52.25, t + 0.05), () => push(T, ct()));
    at(Math.max(52.5, t + 0.3), () => pull(T, [ID.email], ct(), () => openConflict(T, ct())));
    at(Math.max(53.0, t + 0.8), () => { pull(L, [ID.note], ct(), () => openConflict(L, ct())); publishHub(); });
  }

  function resolveOnTanishk(winnerId) {
    const T = dev.tanishk, L = dev.lakshya, t = ct();
    const cf = T.conflicts.get(CONFLICT_ID);
    const loserId = cf.claim_ids.find(id => id !== winnerId);
    const winner = T.claims.get(winnerId), loser = T.claims.get(loserId);
    const bump = (c, status) => Object.assign(c, { status, version: c.version + 1, modified_at: msAt(t), modified_by: 'tanishk' });
    bump(winner, 'active'); bump(loser, 'superseded');
    const res = {
      claim_id: ID.res, text: `Resolved: Sharma wedding edit ${winner.value_label} (chosen by Tanishk)`, entity: 'Sharma wedding edit', entity_kind: 'task',
      attribute: 'resolution', value: winnerId, value_label: winner.value_label, owner: 'tanishk',
      source: { kind: 'note', ref: `note:${isoAt(t).slice(0, 16)}`, author: 'tanishk', excerpt: `Kept ${winner.value_label}`, at: isoAt(t) },
      stated_at: isoAt(t), captured_by: 'tanishk', device_id: 'dev_tanishk', tier: 'team', status: 'active', conflict_id: null,
      resolves: CONFLICT_ID, version: 1, modified_at: msAt(t) + 1, modified_by: 'tanishk', _xyz: winner._xyz,
    };
    T.claims.set(res.claim_id, res);
    Object.assign(cf, { status: 'resolved', winner_claim_id: winnerId, resolution_claim_id: res.claim_id, resolved_by: 'tanishk' });
    for (const c of [winner, loser, res]) { T.outbox.add(c.claim_id); emit(T, 'claim', ui(T, c)); }
    emit(T, 'conflict', cf); emitSync(T);
    log(T, 'conflict_resolved', `You resolved Sharma wedding edit: kept ${winner.value_label}`);
    // The decision reaches the hub (81.5) and Lakshya applies it one second after Keep (82.0).
    at(81.5 > t ? 81.5 : t + 0.4, () => push(T, ct()));
    at(82.0 > t + 0.5 ? 82.0 : t + 0.9, () => {
      pull(L, [winnerId, loserId, ID.res], ct(), () => {
        const lcf = L.conflicts.get(CONFLICT_ID);
        Object.assign(lcf, { status: 'resolved', winner_claim_id: winnerId, resolution_claim_id: ID.res, resolved_by: 'tanishk' });
        emit(L, 'conflict', lcf);
        log(L, 'conflict_resolved', `Tanishk resolved Sharma wedding edit: ${winner.value_label}`);
      });
      publishHub();
    });
    return clone(cf);
  }

  /* ------------------------------------------------------------------ export */
  window.QBackend = {
    transport(id) {
      const d = dev[id];
      return {
        request: (method, path, body) => request(d, method, path, body),
        subscribe(onEvent, onStatus) { d.listeners.add(onEvent); queueMicrotask(() => onStatus('open')); },
      };
    },
    hub: {
      label: '127.0.0.1:6333',
      subscribe(fn) { hubListeners.add(fn); queueMicrotask(() => fn(clone(hubSnap))); },
    },
    devices: dev, ids: ID, conflictId: CONFLICT_ID,
  };
})();
