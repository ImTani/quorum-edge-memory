# Quorum app contract (frozen for the MVP build)

Every module codes against this file. If something here is wrong, fix it here first and say so.

## Demo shape (online round: one machine, two browser windows)

| Process | Command (cwd `app/`) | Port | Data |
| --- | --- | --- | --- |
| Hub | `hub\bin\qdrant.exe` with env below | 6333 (HTTP) / 6334 (gRPC) | `app/data/hub/` |
| Device "tanishk" | `.venv\Scripts\python -m edge --device tanishk --port 8001` | 8001 | `app/data/tanishk/` |
| Device "lakshya" | `.venv\Scripts\python -m edge --device lakshya --port 8002` | 8002 | `app/data/lakshya/` |

Hub env: `QDRANT__STORAGE__STORAGE_PATH=data\hub\storage`, `QDRANT__STORAGE__SNAPSHOTS_PATH=data\hub\snapshots`,
`QDRANT__SERVICE__HTTP_PORT=6333`, `QDRANT__SERVICE__GRPC_PORT=6334`, `QDRANT__TELEMETRY_DISABLED=true`.

Each device is a separate process with its own Qdrant Edge shard and SQLite file, so two tabs on
one machine are two real edge nodes. "Offline" is a per-device switch (`POST /api/net`) that stops
that device's sync worker from touching the hub; its shard, search and extraction keep working.
The UI never claims the machine is offline: it says "Tanishk's device: no connection to hub".

Display names: `tanishk` → "Tanishk · on set", `lakshya` → "Lakshya · office". Demo "today" is
`2026-10-03` (override with env `QUORUM_TODAY`); all relative dates resolve against it.

## Package layout (`app/edge/`)

| Module | Owns | Public surface |
| --- | --- | --- |
| `__init__.py` | Isolation in code | Before any import of fastembed/huggingface: force `HF_HOME`, `FASTEMBED_CACHE_PATH` to `<QUORUM_ROOT>\models\...` where `QUORUM_ROOT` = env or `X:\Projects_X\code_cubicle_6` |
| `__main__.py` | CLI | `--device`, `--port`, `--hub` (default `http://127.0.0.1:6333`), `--data` (default `app/data`) → `uvicorn.run(create_app(cfg))` |
| `config.py` | `Config` dataclass | `device, display_name, port, hub_url, data_dir, models_dir, today (date), conflict_threshold=0.82, ollama_url="http://localhost:11434", ollama_model="llama3.2", hub_collection="quorum_team"` |
| `embed.py` | Embeddings | `Embedder` (process singleton via `get_embedder(cfg)`): `dense(texts: list[str]) -> list[list[float]]` (BAAI/bge-small-en-v1.5, 384-d, normalized), `bm25_doc(text) -> qdrant_edge.SparseVector`, `bm25_query(text) -> SparseVector` |
| `memory.py` | EdgeShard | `Memory(cfg, embedder)`: `add_claim(claim) -> claim` (computes vectors), `upsert_raw(claim, vectors: dict)` (pulled points; vectors as received), `get(claim_id) -> claim or None`, `get_with_vectors(claim_id) -> (claim, vectors)`, `all_claims() -> list[claim]`, `search(q, view, limit=6) -> list[(claim, score)]`, `conflict_candidates(claim) -> list[(claim, cosine)]`, `update_fields(claim_id, **fields) -> claim`, `xyz(claim) -> [x,y,z]`, `close()` |
| `store.py` | SQLite `local.sqlite` | tables `outbox`, `conflicts`, `activity`, `kv`; `enqueue(claim_id)` (dedup by claim_id), `outbox_peek(n)`, `outbox_ack(claim_ids)`, `outbox_len()`, conflict CRUD, `log(kind, text) -> activity`, `recent_activity(n)`, `kv_get/kv_set` |
| `conflicts.py` | Detection + resolution | `check(ctx, claim, detected_on) -> conflict or None`, `resolve(ctx, conflict_id, winner_claim_id, resolved_by) -> conflict`, `apply_remote_resolution(ctx, resolution_claim)` |
| `extract.py` | Text → claim drafts | `extract(text, source, cfg, known_entities: list[str]) -> list[draft]` via Ollama `/api/chat`, `format` = JSON schema, `temperature 0`; deterministic regex/date fallback when Ollama is down, slow (>6 s) or returns invalid output. `resolve_date(phrase, today) -> "YYYY-MM-DD" or None` |
| `sources.py` | Source parsers | `parse_whatsapp(txt) -> list[msg]` (Android and iOS export formats), `load_emails(path) -> list[msg]`; `msg = {kind, ref, author, at, text}` |
| `answer.py` | Answers | `compose(question, hits, conflicts, cfg) -> {answer, citations, disputed}`; templated, no LLM |
| `sync.py` | Hub sync | `SyncWorker(ctx)` thread: 1 s loop; `set_online(bool)`; `status() -> sync dict`; `ensure_collection()` |
| `events.py` | Live updates | `EventBus.publish(type, data)` (thread-safe), `subscribe()` async generator for SSE |
| `api.py` | FastAPI | `create_app(cfg)`; builds a `ctx` (cfg, memory, store, bus, sync); routes below; serves `app/web/` at `/` |
| `seed.py` | Demo reset | `python -m edge.seed` (devices stopped, hub running): wipes `app/data/<device>/`, recreates hub collection, loads `app/fixtures/seed.json` into both devices and the hub, sets each device's pull cursor |

`ctx` is a simple namespace: `ctx.cfg, ctx.memory, ctx.store, ctx.bus, ctx.sync`.

## Claim (Qdrant point payload; also the JSON the UI receives)

```json
{
  "claim_id": "clm_3f9a1c2b7d4e",
  "text": "Sharma wedding edit delivery is due 18 Oct",
  "entity": "Sharma wedding edit",
  "entity_kind": "task",
  "attribute": "due_date",
  "value": "2026-10-18",
  "value_label": "18 Oct",
  "owner": "tanishk",
  "source": {"kind": "note", "ref": "note:2026-10-03T14:02", "author": "client:sharma (call)", "excerpt": "Client just called: Sharma delivery moves to the 18th.", "at": "2026-10-03T14:02:00+05:30"},
  "stated_at": "2026-10-03T14:02:00+05:30",
  "captured_by": "tanishk",
  "device_id": "dev_tanishk",
  "tier": "team",
  "status": "active",
  "conflict_id": null,
  "resolves": null,
  "version": 1,
  "modified_at": 1791016920000,
  "modified_by": "tanishk"
}
```

- Point id = `str(uuid.uuid5(uuid.NAMESPACE_URL, claim_id))`. `claim_id = "clm_" + uuid4().hex[:12]`.
- `entity_kind` ∈ `task | person | project | event | note`. `attribute` ∈ `due_date | birthday | assignee | location | amount | count | status | resolution | note`.
- `tier` ∈ `device | my_devices | team`. Default `device`; the extractor only promotes when sure.
- `status` ∈ `active | disputed | superseded | retracted`.
- `modified_at` is epoch ms, bumped with `version` on every change. `resolves` is the conflict_id on a resolution claim.
- **UI-only fields** added by the API, never stored in the hub: `sync` ∈ `private | queued | synced` (`private` = device tier, never leaves; `queued` = in outbox; `synced` = acknowledged by hub or pulled from it) and `xyz` (from `memory.xyz`).
- `sync` is derived on the device: tier `device` → `private`; otherwise `queued` if the claim_id is in the outbox, else `synced`.

## Vectors (named, per point)

| Name | What | Use |
| --- | --- | --- |
| `text` | dense 384, Cosine, of `claim.text` | hybrid search, `xyz` projection |
| `key` | dense 384, Cosine, of `f"{entity} {attribute.replace('_', ' ')}"` | **conflict matching**: same thing, regardless of value |
| `bm25` | sparse, `Modifier.Idf`, `Bm25().embed_document(text)` | hybrid search |

Measured 3 Oct with bge-small: `"Sharma delivery due date"` vs `"Sharma edit due date"` = **0.899**;
vs `"Mehta wedding reel due date"` = 0.738; vs `"Riya birthday"` = 0.526. Hence threshold 0.82.

`xyz`: `np.random.default_rng(7).normal(size=(384, 3))` fixed matrix × `text` vector, times 6. Same
claim → same position on both devices, and points never jump when new ones arrive.

## Conflict detection (the Qdrant moment)

For a new claim `c` with `attribute` in `{due_date, birthday, assignee, location, amount, count}`:
dense query on `key` with `c`'s key vector, filter `attribute == c.attribute` AND `status ∈ {active, disputed}`
AND `claim_id != c.claim_id`, limit 5, `score_threshold = cfg.conflict_threshold`. The best hit whose
`value != c.value` opens a conflict. Use the **dense cosine score** as `similarity`: RRF scores are rank-based (~0.03), so they can't be displayed as similarity.

Runs at ingest (new local claim) **and** at sync (each newly pulled claim). Same function.

```json
{
  "conflict_id": "cfl_<sha1('|'.join(sorted(claim_ids)))[:10]>",
  "claim_ids": ["clm_a", "clm_b"],
  "entity": "Sharma wedding edit", "attribute": "due_date",
  "similarity": 0.899,
  "owner": "tanishk",
  "status": "open",
  "detected_on": "sync",
  "detected_at": "2026-10-03T14:05:00+05:30",
  "winner_claim_id": null, "resolution_claim_id": null, "resolved_by": null
}
```

- Deterministic `conflict_id`: both devices detect the same conflict independently and agree on its id.
- On detection: both claims → `status=disputed`, `conflict_id` set, **locally only** (disputed status is not pushed; each device detects on its own).
- `owner` = the existing claim's `owner` (the task owner). Only the owner's UI shows Resolve buttons; the other shows "Waiting for <owner>" plus "Ask <owner>".
- **Resolve** (`conflicts.resolve`): winner → `active`, loser → `superseded`, both version-bumped; a resolution claim (`attribute=resolution`, `value=winner_claim_id`, `resolves=conflict_id`, tier team, text "Resolved: <entity> <value_label> (chosen by <name>)") is created; all three enqueued. A device that pulls a resolution claim calls `apply_remote_resolution` (creates the conflict record if it never saw it).

## Sync

- **Push:** only tiers `team` and `my_devices` are ever enqueued. A `device` claim reaching the hub is a privacy bug; tests must assert it can't. Worker reads the *current* point (payload + vectors) at push time and upserts it to the hub with `qdrant-client`; acks on success, retries with backoff on failure, outbox persists across restarts.
- **Pull:** scroll hub with filter `modified_at > cursor` AND `modified_by != me` AND (`tier == team` OR (`tier == my_devices` AND `captured_by == me`)), `with_vectors=True`. New claim → `memory.upsert_raw`, then `conflicts.check(detected_on="sync")` (skip for `resolution`). Known claim with higher `version` → update payload (and `apply_remote_resolution` if it's a resolution). Cursor = max `modified_at` seen (kv `pull_cursor`).
- Hub collection `quorum_team`: vectors `text`/`key` (384, Cosine), sparse `bm25` (modifier IDF); payload indexes `modified_at` (integer), `tier`, `modified_by`, `captured_by`, `attribute` (keyword).
- `status()` → `{online, hub_ok, outbox, bytes_up, bytes_down, last_push, last_pull, last_error}`. Bytes = JSON size of request + response bodies to the hub, counted by the worker (the per-device "network monitor"; it must read 0 while offline).

## HTTP API (each device; UI calls relative `/api/...`)

| Method + path | Body | Returns |
| --- | --- | --- |
| `GET /api/state` | - | `{device, display_name, today, sync, claims:[claim+sync+xyz], conflicts:[...], activity:[...last 60], peers:{tanishk:"http://127.0.0.1:8001", lakshya:"http://127.0.0.1:8002"}}` |
| `GET /api/events` | - | SSE stream; each message `data: {"type": ..., "data": ...}` |
| `POST /api/ingest` | `{kind: "note"\|"email"\|"whatsapp", text, author?, ref?, at?}` | `{claims:[...], conflicts:[...], took_ms, extractor:"llm"\|"fallback"}` |
| `POST /api/ask` | `{q, view: "mine"\|"team"}` | `{answer, citations:[{claim_id, kind, author, excerpt, at}], disputed, hits:[{claim, score}], took_ms}` |
| `POST /api/net` | `{online: bool}` | sync status |
| `POST /api/conflicts/{id}/resolve` | `{winner_claim_id}` | conflict |
| `POST /api/conflicts/{id}/draft` | - | `{to, text, mailto, wa_link}` (opens only if the user clicks; nothing is sent by the app) |
| `GET /api/inbox` | - | pending demo emails for this device from `fixtures/inbox_<device>.json` (`[{id, from, subject, text, at}]`) |
| `POST /api/inbox/{id}/receive` | - | same as ingest of that email; removes it from pending |

`view: "team"` adds filter `tier == team`; `"mine"` sees everything on the device. Both filter `status ∈ {active, disputed}`.

SSE event types: `claim` (full UI claim, on add or change), `conflict` (full record), `sync` (status dict, at most 2/s and on change), `activity` (`{at, kind, text}`).
Activity kinds: `claim_added, search, sync_push, sync_pull, conflict_opened, conflict_resolved, net`.

## Answers (templated, `answer.py`)

- Any hit `disputed` → lead with it: *"Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Tanishk owns this. Settle it?"*
- "due / this week / deadline" questions → due_date claims with value in `[today, today+7]`, sorted by date, plus hybrid hits: *"3 things are due this week: Mehta reel cutdowns (3 of them) on 6 Oct, ..."*
- Otherwise: top hits as sentences. Every answer cites sources (kind, author, date).

## Fixtures (`app/fixtures/`)

- `seed.json`: `{"shared": [claims on both devices + hub], "tanishk": [...private], "lakshya": [...private]}`, pre-extracted (no LLM at seed time) with real-looking sources. About 16 team claims across 4 clients (Sharma wedding, Mehta reels, Kapoor invoice, Pangong shoot), a `my_devices` birthday, and 2–3 `device` claims per person (salary credited, a friend's private news) that must never sync. **No Sharma due date in the seed**: the demo creates it twice.
- `inbox_lakshya.json`: the client email "confirming final delivery of the Sharma wedding edit on 16 October".
- `demo_inputs.json`: `{"tanishk_note": "Client just called: Sharma delivery moves to the 18th."}`.
- `whatsapp_mehta.txt`: a short real-format export (the parser's test input).

## Demo script (what must work end to end)

1. Both windows show a populated cloud. Lakshya asks "what's due this week?" → cited answer.
2. Tanishk toggles **no connection to hub**. His network counter freezes at 0 B/s; asking still answers in ms.
3. Tanishk types the note → amber point, outbox 1, nothing reaches the hub.
4. Lakshya clicks **Receive** on the client email → claim (16 Oct) syncs to the hub, point goes green.
5. Tanishk reconnects → outbox drains, pull brings the 16 Oct claim → **conflict**: the two points pulse red, pull together, card says *"Found 2 claims about the Sharma wedding edit, similarity 0.90. Dates disagree."* Lakshya's window detects it too on its next pull.
6. Tanishk asks "when is the Sharma delivery?" → "Disputed: ..." with both sources.
7. Lakshya's card: "Waiting for Tanishk" + **Ask Tanishk** (draft). Tanishk resolves → both windows show it resolved, loser dimmed.
8. Team view toggle: device-only points vanish; the hub dashboard (`:6333/dashboard`) has no device-tier points.

## Verified API (qdrant-edge-py 0.8.0, 3 Oct 2026)

```python
import qdrant_edge as q
cfg = q.EdgeConfig(vectors={"text": q.EdgeVectorParams(size=384, distance=q.Distance.Cosine),
                            "key":  q.EdgeVectorParams(size=384, distance=q.Distance.Cosine)},
                   sparse_vectors={"bm25": q.EdgeSparseVectorParams(modifier=q.Modifier.Idf)})
s = q.EdgeShard.create(path, cfg)          # path dir must exist; q.EdgeShard.load(path) to reopen
bm = q.Bm25(q.Bm25Config()); sv = bm.embed_document(text); qv = bm.embed_query(text)
s.update(q.UpdateOperation.upsert_points([q.Point(id=uuid_str, vector={"text": [...], "key": [...], "bm25": sv}, payload={...})]))
f = q.Filter(must=[q.FieldCondition(key="tier", match=q.MatchValue(value="team"))])   # also MatchAny, RangeFloat, must_not
hits = s.query(q.QueryRequest(limit=6, prefetches=[q.Prefetch(limit=20, query=q.Query.Nearest(qv, using="bm25")),
                                                   q.Prefetch(limit=20, query=q.Query.Nearest(dense, using="text"))],
                              query=q.Fusion.Rrf(k=60), filter=f, with_payload=True))   # hits: ScoredPoint(.id .score .payload)
dense_hits = s.query(q.QueryRequest(limit=5, query=q.Query.Nearest(keyvec, using="key"), filter=f, score_threshold=0.82, with_payload=True))
s.retrieve([uuid_str], True, True)         # (point_ids, with_payload, with_vector) -> [Record(.id .payload .vector)]
s.count(q.CountRequest()); s.scroll(...); s.flush(); s.close()
# also: UpdateOperation.set_payload / overwrite_payload / delete_points; s.snapshot_manifest() -> dict
```
Hybrid query took 7 ms on a cold shard. Check exact signatures of `scroll`, `set_payload` and `Query.Nearest` for
sparse input with `__text_signature__` before relying on them.
