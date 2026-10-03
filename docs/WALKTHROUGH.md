# Quorum: interview-prep walkthrough

For Tanishk, presenting to the Code Cubicle 6.0 judges (Problem Statement 03: AI-powered edge memory on Qdrant Edge) in the online round, driving the demo alone on one machine.

Every mechanism below was checked against the code as it stood on 3 Oct 2026 (commit `0f002d9` plus uncommitted style edits in `app/web/`). Citations are `file:line`. Python paths are under `app/edge/` unless a fuller path is given. Line numbers in `app/web/*.js` may move a little because the styles are being edited right now, so those citations name the function as well.

Numbers come from two sources:
- **Measured earlier** (PRODUCT.md:58, MVP.md:13-17, your own runs): search 7–70 ms, extraction ~4–6 s, conflict on both devices ~0.15 s after reconnect, resolution on the other device in ~1 s, key cosine 0.899 / 0.738.
- **Measured while writing this doc**, on this machine: the key cosines again (same values), a few extra pairs, regex fallback ~1–4 ms, one query embedding ~8.5 ms warm. The test suite: 156 collected, 154 passed, 2 skipped.

---

## 1. The one-minute version

**Quorum: your team's memory, on every laptop, even with no signal.** It reads everything, and nothing leaves unless it's work your team needs. When two people disagree about a deadline, it asks instead of guessing. (Brand lines, PRODUCT.md:51.)

**The problem.** Small teams (production houses, developer groups, event teams, agencies, site crews) juggle many clients across email, WhatsApp and conversations in person, often with poor or no signal. A deadline changes in one place and gets misquoted in another, and nobody notices until it's too late (PRODUCT.md:16). Cloud assistants don't fit: they need a connection, and to be useful they'd have to read everything, which shouldn't leave the device.

**What it is.** A shared, offline-first memory layer. Each person's laptop is a full edge node with its own Qdrant Edge shard. Every memory is a **claim with a source**: who said it, where, and when. Devices sync through a small team hub when they're online. When two teammates' claims disagree, Quorum never silently picks a winner. It surfaces the conflict, and the task's owner settles it.

**The moment the demo builds to.** Tanishk's device loses the hub. On it, he notes that the client moved the Sharma delivery to the 18th. Meanwhile Lakshya's device receives the client's email confirming the 16th, and that syncs. Tanishk reconnects. **Both devices find the same disagreement on their own**: two points turn red and pull together, and the card says *"Found 2 claims about the Sharma wedding edit, similarity 1.00. Dates disagree."* Asking "When is the Sharma delivery?" returns *"Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct."* Tanishk settles it, and Lakshya's device applies the decision about a second later.

Lead with the team conflict, not the assistant (PRODUCT.md:52).

---

## 2. What is running

| Process | What it is | Port | Data on disk |
| --- | --- | --- | --- |
| Hub | Qdrant server 1.19.1, a Windows binary (`app\hub\bin\qdrant.exe`), not Docker | 6333 HTTP, 6334 gRPC | `app\data\hub\` |
| Device "tanishk" | `python -m edge --device tanishk --port 8001`: FastAPI + its own Qdrant Edge shard + its own SQLite | 8001 | `app\data\tanishk\shard`, `app\data\tanishk\local.sqlite` |
| Device "lakshya" | same code, separate process | 8002 | `app\data\lakshya\...` |
| Ollama | local LLM server running `llama3.2` (client 0.3.14 on this machine) | 11434 | Ollama's own |
| Stage | a static page served by each device at `/stage` | (8001) | none |

Where the code does it:
- Launch, env and ports: `scripts/demo.ps1:111-138`. The hub's env (storage paths, telemetry off, dashboard dir) is set at `demo.ps1:112-120`.
- Each device builds its context at `api.py:56-62`: Memory (the shard), Store (SQLite), SyncWorker.
- The shard lives at `<data>/<device>/shard`, created with three named vectors (`memory.py:74-89`). SQLite with WAL is at `store.py:61-71`, holding the `outbox`, `conflicts`, `activity` and `kv` tables (`store.py:17-41`).
- **Embeddings**: `BAAI/bge-small-en-v1.5`, 384 dimensions, via FastEmbed (ONNX), loaded from the project's `models\` folder with `local_files_only=True`, so a device with no network still starts (`embed.py:7, 17-21`). Vectors are normalised (`embed.py:25-29`). One model per device process (`embed.py:42-48`).
- **BM25** comes from Qdrant Edge itself (`q.Bm25`, `embed.py:22, 31-35`), not from FastEmbed.
- **LLM**: Ollama at `http://localhost:11434`, model `llama3.2` (`config.py:36-37`). Each device warms the model in a background thread at startup (`__main__.py:22`) and asks Ollama to keep it loaded for 60 minutes (`extract.py:37`).
- The stage is served at `api.py:185-188`. It mounts the real device UI twice (`stage.js:27-32`, `createDeviceUI` in `device.js:190`) and reads the hub straight from Qdrant REST every second (`stage.js` `pollHub`, ~line 304). The device APIs allow CORS only from `127.0.0.1` and `localhost` (`api.py:31, 82-83`).
- Demo "today" is pinned to 2026-10-03, overridable with `QUORUM_TODAY` (`config.py:17-18`). Relative dates such as "the 18th" resolve against it.

### What "offline" means here, and how to say it honestly

It is **not** airplane mode. Both devices run on one machine, and so do the hub and Ollama.

"Offline" is a per-device switch: `POST /api/net {online:false}` (`api.py:138-140`) calls `SyncWorker.set_online` (`sync.py:178-192`). It is enforced in two places:

1. The sync loop does nothing while offline (`sync.py:231`).
2. **At the wire.** Every request to the hub goes through one qdrant-client REST transport, and a middleware raises `HubOffline` before any byte is sent (`sync.py:166-168`, installed at `sync.py:53-55, 144`).

The same middleware counts request and response body bytes (`sync.py:169-174`). That count is the "Hub traffic" figure on screen. While offline, the Sent/Received totals freeze. The rate label is also set to "0 B/s" by the UI (`device.js:367`); the frozen totals are the real proof. `demo_check.py` step 2 asserts the byte counters don't move over 3 s (`scripts/demo_check.py:167-179`).

Search, extraction and memory don't use the hub at all, so they keep working.

Say it like this: *"Both laptops are simulated on one machine. Each device is its own process with its own Qdrant Edge shard and its own database. 'Offline' cuts that device's link to the hub at the transport: its sync code physically can't send a byte, and you can see its traffic counter freeze. Everything else on the device keeps working. Real airplane mode on two laptops comes after this round."* The UI says "No connection to hub", never "offline machine" (CONTRACT.md:19, `device.js:363`).

---

## 3. Anatomy of a claim

A claim is one Qdrant point. Its payload is also the JSON the UI receives (CONTRACT.md:45-77). It is built for a new capture at `api.py:241-265`:

| Field | Meaning | Set where |
| --- | --- | --- |
| `claim_id` | `clm_` + 12 hex characters | `conflicts.py:35-36` |
| point id | `uuid5(NAMESPACE_URL, claim_id)`: the same id on every device and the hub | `memory.py:20-21`, `sync.py:43-44` |
| `text` | a templated sentence ("Sharma wedding edit delivery is due 18 Oct") | `extract.py:362-376` |
| `entity`, `entity_kind`, `attribute` | what the claim is about; attribute ∈ due_date, birthday, assignee, location, amount, count, status, note, resolution | `extract.py:30-31` |
| `value`, `value_label` | normalised value (ISO date, integer rupees, lowercase teammate) and its display form | `extract.py:392-435` |
| `owner` | the task owner, inherited from an existing claim about the same entity, else this device | `api.py:243, 253`, `memory.py:214-231` |
| `source` | `{kind, ref, author, excerpt, at}`. The excerpt is the source sentence that best supports the claim, ≤280 characters | `api.py:207-213, 222, 298-306` |
| `stated_at`, `captured_by`, `device_id` | when it was said, who captured it, on which device | `api.py:254-257` |
| `tier` | `device`, `my_devices` or `team` | section 5 |
| `status` | `active`, `disputed`, `superseded` or `retracted` (no route retracts yet) | `api.py:259` |
| `conflict_id`, `resolves` | link to a conflict; `resolves` is set only on a resolution claim | `conflicts.py:152-153` |
| `version`, `modified_at`, `modified_by` | bumped together on every real change; `modified_at` is epoch ms from the device clock | `memory.py:142-145` |

UI-only fields `sync` (private / queued / synced) and `xyz` are added on the way out and never stored or pushed (`events.py:57-65`, `memory.py:43-44`, `sync.py:87-94`).

### Three named vectors per point (`memory.py:93-98`)

| Name | What is embedded | Used for |
| --- | --- | --- |
| `text` | dense 384-d, cosine, of `claim.text` | hybrid search, and the cloud's fixed 3D projection (`memory.py:239-242`) |
| `key` | dense 384-d, cosine, of `f"{entity} {attribute}"`, e.g. "Sharma wedding edit due date" (`memory.py:24-25`) | **conflict matching** |
| `bm25` | sparse, IDF modifier, from Qdrant Edge's BM25 | hybrid search |

### Why the key vector exists

A conflict means "same thing, different value". The question "are these two claims about the same thing?" has to ignore the value, because the value is exactly what differs. It should also ignore phrasing ("moves to", "confirming final delivery", "(3 of them)"). So the key vector embeds only the entity and the attribute. Values are compared separately, as normalised strings (`conflicts.py:61`).

The numbers, measured with bge-small (CONTRACT.md:87-88; I re-measured and got the same):

| Key text A | Key text B | Cosine |
| --- | --- | --- |
| Sharma delivery due date | Sharma edit due date | **0.899** |
| Sharma delivery due date | Mehta wedding reel due date | 0.738 |
| Sharma delivery due date | Riya birthday | 0.526 |

The threshold of **0.82** sits between the same-thing pair and the unrelated deadline (`config.py:35`, used at `memory.py:209`).

Extra pairs I measured while writing this, useful if pushed:
- "Sharma delivery due date" vs "Sharma wedding edit due date" = 0.853. That is what you'd get if the entity were *not* snapped (see below).
- "Sharma delivery due date" vs "Kapoor invoice due date" = **0.818**, just under 0.82. The margin is thin for some pairs, which is why there is a second gate: the two entity names must share a distinctive word (`extract.same_subject`, `extract.py:734-743`, applied at `conflicts.py:61`). "Sharma" vs "Kapoor" fails that gate even if the cosine ever crept above the threshold.
- "Sharma wedding edit due date" vs "Sharma wedding edit location" = 0.87. Above the threshold, but the query filters on `attribute == due_date`, so a location never competes with a date (`memory.py:208`).

### Why the live demo shows similarity 1.00

The card shows the real cosine (`conflicts.py:77`, rendered at `device.js` `renderConflictCard` ~line 467). It reads **1.00** because both captures end up with the *identical* entity name, "Sharma wedding edit", so both key texts are "Sharma wedding edit due date" and the vectors are identical.

Why the names are identical: before the claim is built, extraction snaps the mention to a known entity.
- **LLM path**: `_canonical_entity` (`extract.py:261-271`) calls `match_known` (`extract.py:236-258`). A match needs one shared *distinctive* word ("sharma"); generic words like "delivery" and "edit" only break ties (`extract.py:213-218, 232-233`). The model's "Sharma delivery" becomes "Sharma wedding edit". The prompt also tells the model to copy known names (`extract.py:495-496`), and the known entities are passed in from the device's own claims (`api.py:216`).
- **Fallback path**: `fallback_extract` runs `match_known(text, known)` on the whole message (`extract.py:751`).

I checked both demo inputs through the fallback. Each gives entity "Sharma wedding edit", due_date, tier team: 2026-10-18 for the note and 2026-10-16 for the email.

How to talk about it: *"1.00 is the real cosine of the two key vectors. It's 1.00 because extraction recognised both mentions as the same known task, so the 'what is this about' text is identical. When two people name the task differently, say 'Sharma delivery' and 'Sharma edit', it's about 0.85 to 0.90, still above our 0.82 threshold, while an unrelated client's deadline is about 0.74."*

If asked "couldn't you just use the text vector?": in this demo, yes, it would work too. The two template sentences score 0.974 on the text vector (I measured it). The key vector earns its place when the claim text carries the value and extra words: 0.75 between the Sharma sentence and "Kapoor invoice payment is due 8 Oct" on text, for example. Don't overclaim here.

---

## 4. The demo, beat by beat

Open `http://127.0.0.1:8001/stage`: Tanishk on the left, the hub in the centre, Lakshya on the right. The beat tracker shows "Next · n of 8". It advances only on real events (`stage.js` `BEATS` ~line 89, `tick()` calls). Captions are driven by each device's SSE stream and your clicks (`stage.js:1-4`). Nothing advances on its own.

Starting state after `demo.ps1`: each device holds 20 seeded claims (17 shared team claims, plus Tanishk's 2 device and 1 my_devices, or Lakshya's 3 device). The hub holds 18 (17 team + Riya's birthday, which is my_devices). "Device-only claims on the hub: 0". Nothing in the seed is a Sharma due date (seed.json, CONTRACT.md:155).

**Background loop on both devices**: every 1 s, push then pull (`sync.py:220-225, 229-247`). When online, the pull costs a small scroll request every second, so the traffic counter ticks a little even when nothing changes.

### Beat 1: Lakshya asks "What's due this week?"

| | |
| --- | --- |
| **Click** | On Lakshya's pane, the suggestion "What's due this week?" (`device.js:154`) |
| **Stage shows** | Answer: "3 things are due this week: Mehta reel cutdowns (3 of them) on 6 Oct, Ladakh drone permit on 7 Oct and Kapoor invoice on 8 Oct.", 3 citation chips, "N ms, on this device". The cited points glow. Caption tag "Answered": "Answered on the device in N ms, with 3 sources." |
| **Under the hood** | 1. `POST /api/ask {q, view:"mine"}` → `api.py:121-134`. 2. `memory.search` (`memory.py:179-193`): the query is embedded dense (bge) and as BM25. One Qdrant Edge `QueryRequest` with two prefetches (BM25 top 20 and dense `text` top 20), fused with **RRF (k=60)**, filter `status ∈ {active, disputed}` (no tier filter in "mine"), limit 6. 3. `_with_dispute_partners` (none yet) (`api.py:313-326`). 4. `answer.compose` (`answer.py:14-49`): the question matches `due|this week|deadline` (`answer.py:7`), so it takes due_date claims dated today to today+7 from the hits **plus a scan of all live claims visible to Lakshya** (`api.py:126`, `answer.py:32-36, 99-109`). The count claim adds "(3 of them)" (`answer.py:115-120`). 5. Activity "search" is logged and an SSE `activity` event published (`api.py:129`). No SQLite writes besides the activity log. No hub traffic. |
| **Timing** | search 7–70 ms on-device (measured earlier) |
| **Say** | "That answer came from Lakshya's own laptop, its own Qdrant shard, keywords and meaning in one query, every line cited to its source." |

Nuance: the caption says "keywords and meaning together". For "due this week" questions the list also comes from a date filter over all claims on the device. True enough, but know it.

### Beat 2: Tanishk loses the hub

| | |
| --- | --- |
| **Click** | Tanishk's "Connected to hub" switch. Then, optionally, ask "What's due this week?" on Tanishk. |
| **Stage shows** | The left link to the hub is cut, with a "no connection" label (`stage.js` `drawLinks`). The switch reads "No connection to hub", the rate shows 0 B/s, the Sent/Received totals freeze. Caption "Offline: Tanishk's device lost the hub. It still remembers and searches…". An ask gives "Answered on Tanishk's device in N ms, with no hub." |
| **Under the hood** | `POST /api/net {online:false}` → `set_online(False)` (`sync.py:178-192`): `_online=False`, `hub_ok=False`, activity "No connection to hub" (`net`), a forced SSE `sync` status. From now on `sync_once` returns immediately (`sync.py:231`), and any request that slipped through raises `HubOffline` in the middleware (`sync.py:167-168`). The ask runs exactly as in beat 1, against Tanishk's shard. |
| **Say** | "Tanishk is on set with no signal. His laptop can't reach the hub, but it hasn't lost a thing: search is still milliseconds, because the memory is on the device." |

### Beat 3: Tanishk notes the client's call

| | |
| --- | --- |
| **Click** | Type in Tanishk's Capture box exactly: `Client just called: Sharma delivery moves to the 18th.` (from `app/fixtures/demo_inputs.json`), then Save. |
| **Stage shows** | Caption "Reading: Tanishk's device is reading the note…" while extraction runs. Then "Queued: Saved on Tanishk's device, queued." with the source line `Note: "Client just called…" → Sharma wedding edit · due date · 18 Oct`. A new **amber** point appears and the Outbox reads 1. The hub count stays at 18. |
| **Under the hood** | `POST /api/ingest {kind:"note", text}` → `ingest()` (`api.py:201-238`): 1. Build `source` (`api.py:207-213`). 2. Read all local claims for the known-entity list and each entity's widest tier (`api.py:214-216`). 3. `extract_with_meta` (`extract.py:795-809`): Ollama `/api/chat`, streaming, temperature 0, `num_predict` 200, few-shot prompt (`extract.py:594-622`). Ollama 0.3.14 rejects a JSON-schema `format`, so after one 400 it uses `format:"json"`, with the schema in the prompt (`extract.py:527-528, 633-641`). The model returns entity / attribute / **date words as written** ("the 18th"). Python grounds the date in the message (`extract.py:379-389`) and resolves it against today: a bare day still ahead this month means 2026-10-18 (`extract.py:163-168`). The entity snaps to "Sharma wedding edit" (`extract.py:261-271`). The tier comes from rules (`extract.py:317-326`): "client" / "deliver" make it work, and the entity is known, so it's `team`. 4. Cap the tier by the entity's widest tier on this device (team, so it stays team) (`api.py:221, 288-295`). 5. Build the claim and inherit owner `tanishk` from the seeded Sharma claims (`api.py:241-265`). 6. `memory.add_claim`: compute text, key and bm25, upsert, flush (`memory.py:93-114`). 7. Tier ≠ device, so `store.enqueue` → outbox row (`api.py:224-225`, `store.py:94-100`). 8. SSE `claim` with `sync:"queued"` and activity "Captured: …" (`api.py:226-227`). 9. `conflicts.check(…, "ingest")` runs the key query, finds no other Sharma due date, so no conflict (`api.py:228`). The worker is offline, so nothing is pushed. |
| **Timing** | ~4–6 s on the local model. If Ollama is down, slow (6 s budget, `extract.py:35`) or returns nothing valid, the regex fallback takes ~1–4 ms and gives the same claim for this sentence. |
| **Say** | "The local model turned his note into a claim with its source: who said it, where, when. Nothing left the laptop. It's waiting in a persistent outbox." |

### Beat 4: Lakshya receives the client's email

| | |
| --- | --- |
| **Click** | Lakshya's Inbox → **Receive** on Rohit Sharma's "Re: Sharma wedding edit – second cut". |
| **Stage shows** | "Reading…", then "Queued: Lakshya's device learned the client's date." Within about a second a token travels the right-hand link ("sent 1 claim") and the caption upgrades to "Synced: …learned the client's date and synced it." The point turns **green**. The hub goes 18 → 19, and "Latest to reach the hub" shows *Sharma wedding edit · 16 Oct · from Lakshya · Team*. Tanishk's pane doesn't change (he's offline). |
| **Under the hood** | `POST /api/inbox/{id}/receive` (`api.py:164-181`): the email is marked taken under a lock *before* extraction, so a double click gets 404 (`api.py:168-172`). The "Re:" prefix is stripped (`api.py:174`), then the same `ingest()` pipeline runs. The date words are "16 October" → 2026-10-16. The entity snaps to "Sharma wedding edit" and the owner is `tanishk` (inherited, not Lakshya). Outbox +1. Then on Lakshya's next 1 s tick, `push()` (`sync.py:249-291`) reads the *current* point and its vectors, checks the tier (`sync.py:262`), sorts by `modified_at`, and calls `client.upsert(..., wait=True)`. On success it runs `outbox_ack` with generation numbers (`store.py:111-119`), logs activity "Pushed 1 claim to hub (N KB)", and republishes the claim (now `synced`). |
| **Say** | "Lakshya, in the office, gets the client's email confirming the 16th. Her device reads it the same way and shares it with the team hub, because it's client work. Tanishk can't see it yet." |

### Beat 5: Tanishk reconnects, and both devices find the conflict

| | |
| --- | --- |
| **Click** | Tanishk's switch back on. |
| **Stage shows** | The left link is restored. Tokens: "sent 1 claim" (left), "pulled 1 claim" (left), then "pulled 1 claim" (right). On each device the two Sharma points pulse **red** and ease together with a beam between them (`cloud.js` `setConflict`). The conflict card: *"Found 2 claims about the Sharma wedding edit, similarity 1.00. Dates disagree."*, both sources side by side, "Conflict · detected on sync". Captions: "Conflict: Tanishk's device found a disagreement on its own", then "Both devices found the same disagreement on their own. Qdrant compared what each claim is about (not its value)…". Tanishk's card: "You own this" + **Keep 16 Oct** / **Keep 18 Oct**. Lakshya's card: "Waiting for Tanishk" + **Ask Tanishk**. Hub: 20. |
| **Under the hood (Tanishk)** | `set_online(True)` resets the backoff, logs "Reconnected to hub" and **wakes the worker immediately** (`sync.py:183-186`). `sync_once` pushes first: the note goes to the hub (as `active`; disputed is never pushed, `sync.py:87-94`). Then `pull()` (`sync.py:293-318`): it reads `pull_cursor` from SQLite kv and scrolls the hub with filter `modified_at > cursor AND modified_by != tanishk AND (tier == team OR (tier == my_devices AND captured_by == tanishk))` (`sync.py:107-119`), with vectors, 128 per page. That returns Lakshya's email claim. Records are sorted by (modified_at, version) and applied inside one shard flush (`sync.py:312-314`). The claim is new locally, so `memory.upsert_raw` stores the hub's vectors as received (no re-embedding, `memory.py:100-108`), then `conflicts.check(claim, "sync")` (`sync.py:333-338`). **The check**: `memory.conflict_candidates` (`memory.py:201-212`), a dense Qdrant Edge query on `key` with the email claim's own key vector; filter `status ∈ {active, disputed}` AND `attribute == "due_date"`, must_not `claim_id == itself`; limit 5; `score_threshold 0.82`. It hits Tanishk's note at 1.0. The values differ ("2026-10-16" vs "2026-10-18") and `same_subject` is true, so `_open` runs (`conflicts.py:66-93`): conflict id `cfl_` + sha1 of the sorted pair (`conflicts.py:27-28`), owner via `_owner` (`conflicts.py:45-51`; both say tanishk). The record goes to SQLite (`store.py:140-149`), both claims are marked `disputed` **without a version bump** (`conflicts.py:89`), and SSE publishes `claim` ×2, `conflict`, and activity `conflict_opened`. The cursor is saved after the batch lands (`sync.py:315`). |
| **Under the hood (Lakshya)** | On her next 1 s tick, her pull returns Tanishk's note (modified_by tanishk). Same `upsert_raw` → `check` → same pair → **same conflict_id**, computed independently. No conflict record is ever exchanged. |
| **Timing** | Measured earlier: the conflict was on both devices ~0.15 s after reconnect. Tanishk is immediate because the worker is woken. Lakshya depends on where her 1 s tick falls, so expect anywhere from about 0.15 s up to about 1 s. |
| **Say** | "Tanishk's outbox drains, his device pulls the email, and Qdrant, on his laptop, finds a claim about the same thing with a different value. Lakshya's laptop finds the same conflict on its own a moment later, and both agree on its id without talking to each other. Nothing was overwritten." |

### Beat 6: Tanishk asks "When is the Sharma delivery?"

| | |
| --- | --- |
| **Click** | Tanishk's suggestion "When is the Sharma delivery?" (`device.js:155`) |
| **Stage shows** | *"Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Tanishk owns this. Settle it?"* with both citations. Caption "Disputed: Tanishk's device won't guess: it's disputed. It answered in N ms with both sources side by side." |
| **Under the hood** | Same hybrid search as beat 1. A disputed hit pulls in its partner even if search ranked only one (`api.py:313-326`). `compose` leads with the dispute (`answer.py:21-30`). The sides are ordered outside sources first (`side_order`, `answer.py:65-70`). The phrasing: "the client's email" for an email from a non-teammate; "Tanishk's note from the call" because the note's excerpt contains "called" (`answer.py:73-88`). "Settle it?" appears because the asker is the owner (`answer.py:55-62`). The response carries `disputed:true` and `conflict_id`. |
| **Say** | "It doesn't guess. It tells you who said what, where, and that Tanishk owns the decision. In milliseconds, on the device." |

### Beat 7: Lakshya asks Tanishk, Tanishk settles

| | |
| --- | --- |
| **Click** | Lakshya's card → **Ask Tanishk**. Then Tanishk's card → **Keep 18 Oct**. |
| **Stage shows** | Lakshya gets a draft: "Hi Tanishk, two sources disagree on the Sharma wedding edit: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Which one is right? - Lakshya", with Open in email / Open in WhatsApp / Copy. Caption "Draft: Lakshya can't settle it, so Quorum drafted a message to Tanishk. The app sends nothing…". After Keep, Tanishk's card reads "Resolved: 18 Oct … chosen by you" with 16 Oct marked "Superseded · kept for history". Caption "Resolved: Tanishk settled it: 18 Oct kept." Token "sent 3 claims". About a second later Lakshya's card shows the same, and the caption reads "Tanishk settled it. Lakshya's device applied the decision." Hub: 21, the latest entry "Decision: Sharma wedding edit · 18 Oct". |
| **Under the hood: draft** | `POST /api/conflicts/{id}/draft` → `draft_message` (`api.py:336-351`) builds text plus `mailto:` and `wa.me` links. Nothing is sent by the app. |
| **Under the hood: resolve** | `POST /api/conflicts/{id}/resolve` (`api.py:142-150`): `can_settle` lets only the owner through (403 for Lakshya, `api.py:145-146, 271-274`; `demo_check` asserts the 403). `conflicts.resolve` runs under a lock, so a double click can't settle twice (`conflicts.py:100-103`). It works out the **narrowest tier** in the conflict (both team, so team) (`conflicts.py:115-120`). The winner becomes `active` and the loser `superseded`, both **version-bumped** (version 2, new `modified_at`, `modified_by tanishk`) and enqueued (`conflicts.py:122-131`). A **resolution claim** is created: attribute `resolution`, value = winner claim id, `resolves` = conflict id, tier team, text "Resolved: Sharma wedding edit 18 Oct (chosen by Tanishk)". It is added and enqueued (`conflicts.py:133-160`). The conflict record is updated to resolved, and SSE publishes the claims, the conflict and the activity (`conflicts.py:162-166, 231-238`). Tanishk's next tick pushes the 3 claims. |
| **Under the hood: Lakshya** | Her pull returns the winner and loser (version 2 > her local 1, so the payload is updated, `sync.py:339-340`) and the resolution claim (new, sorted last by `modified_at`). Then `apply_remote_resolution` (`conflicts.py:170-198`): it finds her conflict record (or rebuilds it if she never saw it, `conflicts.py:201-228`), sets statuses locally without bumping, marks the conflict resolved and publishes. |
| **Timing** | Resolution reached the other device in ~1 s (measured earlier): Tanishk's next 1 s tick pushes, Lakshya's next tick pulls. |
| **Say** | "Only the owner decides. Lakshya can ask, and the message is drafted, but nothing sends unless she chooses. Tanishk keeps the 18th, because the call came after the email. The decision travels as a claim of its own, and the 16th stays as history. Nothing is deleted." |

### Beat 8: Team view

| | |
| --- | --- |
| **Click** | "Team view" on either pane. For the strongest proof, then ask something private, e.g. type "salary credited", in Team view and in Mine. |
| **Stage shows** | The cloud drops the personal points (Tanishk: Salary, Kabir, Riya's birthday; Lakshya: Salary, Meher, Dentist). Caption "Team view: Team view hides device-only claims. The hub holds none of them. …Device-only claims on the hub: 0." The hub column has shown "Device-only claims on the hub: 0" all along, counted live, and the line under it gives each device's own private count. |
| **Under the hood** | The **cloud toggle is client-side**: `visibleClaims` filters `tier === 'team'` (`device.js:391, 408-419`). The **server-side** Qdrant filter applies when you *ask* in Team view: `view:"team"` adds `tier == team` to the search filter (`memory.py:181`) and to the "due this week" pool (`api.py:126, 309-310`). The hub number is a live exact count on the hub with filter `tier == device` (`stage.js` `pollHub` ~line 304-314). `demo_check` step 8 asserts the same, plus "no disputed status on the hub" (`scripts/demo_check.py:291-313`). |
| **Say** | "Everything starts on the device. Only work the team needs is shared. That's enforced by a filter on every team search and at the sync boundary, and the hub itself holds zero device-only claims, counted live from Qdrant." |

---

## 5. How privacy is enforced (every layer)

| # | Layer | What it does | Where |
| --- | --- | --- | --- |
| 1 | Tier default | Anything without a valid tier becomes `device`. The rules return `device` unless sure. | `api.py:244`, `extract.py:317-326` |
| 2 | Extraction tier rule | **Rules, not the model**, decide the tier. Money, health and private-news words anywhere in the message make it `device`. Birthday and personal words make it `my_devices`. Client work words or a known entity make it `team`. Otherwise `device`. The model's schema has no tier field. | `extract.py:297-326, 434, 473-491` |
| 3 | Entity tier capping | A new claim never gets a wider tier than the widest tier its entity already has on this device. A follow-up about a friend's private news stays `device` even though a known entity would otherwise promote it. | `api.py:221, 277-295` |
| 4 | Outbox refusal | Only non-`device` claims are enqueued at capture. Resolution only enqueues shared tiers, and takes the narrowest tier in the conflict: settling against a device-only claim pushes nothing and marks the team claims locally. | `api.py:224-225`, `conflicts.py:115-127, 150, 159-160` |
| 5 | Push-time refusal | The worker re-reads the **current** tier at push time and drops device claims with activity "Kept private: …". `hub_point` raises if asked to build a device point. | `sync.py:258-264, 97-99` (test: `tests/test_sync.py:379-405`) |
| 6 | Hub payload hygiene | UI-only fields are stripped. Local `disputed` is pushed as `active` with no conflict_id. | `sync.py:87-94` |
| 7 | Pull filter | A device pulls only `team`, plus `my_devices` claims it captured itself. A defensive skip drops any device-tier record anyway. | `sync.py:107-119, 329-330` |
| 8 | Team-view search filter | `tier == team` in the Qdrant filter. Dispute partners and the due-this-week pool respect the view. | `memory.py:181`, `api.py:126, 309-310, 323` |
| 9 | Seeding | The seed pushes only pushable tiers to the hub. | `seed.py:78-81, 89-91` |
| 10 | Hub count | The stage counts `tier == device` on the hub every second. `demo_check` asserts zero and that every hub tier is team or my_devices. | `stage.js` `pollHub`, `scripts/demo_check.py:305-312` |

What does go to the hub for a team claim: the claim text, entity, value, the **source excerpt** (the single best-matching sentence, ≤280 characters, `api.py:298-306`), and the three vectors. Not the whole email.

Honest limits:
- The pull filter is a client-side rule, not access control. The hub has no authentication in the demo, so anyone on the network who can reach :6333 can read the team collection. Next step: an API key or TLS on the hub, and a collection per team.
- The private-word regex is a rule list. A private fact phrased without any of those words, in a message that also mentions client work, would be classed `team`. The design choice is to stay `device` when unsure, but "unsure" is defined by the rule list.
- No encryption at rest; it relies on OS disk encryption (PRODUCT.md:43).

---

## 6. How conflicts are detected and resolved

**Where it runs.** On every new local claim (`api.py:228`) and on every newly pulled non-resolution claim (`sync.py:337-338`). It is one function, `conflicts.check` (`conflicts.py:54-63`).

**The exact query** (`memory.py:201-212`), on the device's own Qdrant Edge shard:
- only for attributes due_date, birthday, assignee, location, amount, count (`memory.py:12`); note and status never conflict
- `Query.Nearest(key_vector, using="key")`. The key vector is read from the stored point, or computed if absent (`memory.py:195-199`)
- filter: must `status ∈ {active, disputed}` AND `attribute == claim.attribute`; must_not `claim_id == claim.claim_id`
- `limit=5`, `score_threshold=0.82`
- the score is the **dense cosine**, which is why it can be shown as a similarity. RRF scores are rank-based (~0.03) and can't be (CONTRACT.md:98).

**Opening.** The first candidate whose `value` differs and whose entity name shares a distinctive word (`same_subject`) opens a conflict (`conflicts.py:58-62`).

**Deterministic id.** `cfl_` + the first 10 hex characters of sha1 of the two claim ids, sorted and joined with "|" (`conflicts.py:27-28`). Both devices hold the same two claims (same ids and vectors, since pulled points keep their vectors) and run the same deterministic query and rule, so they compute the same id with no coordination. `_open` never reopens a known id, even a resolved one (`conflicts.py:69-71`).

**Owner rule.** If both claims have the same owner, that owner. Otherwise the owner of the earlier `stated_at` claim, with claim_id as the tie-breaker, so both devices pick the same owner (`conflicts.py:45-51`). Owners come from the entity: a new claim inherits the owner of an existing claim about the same entity (`api.py:243, 253`). The resolve route allows the owner only, or any device when the owner has no device in the demo (Aayat, Tushar) (`api.py:271-274`).

**Why "disputed" never syncs.**
1. Each device detects on its own, so there is nothing to tell the other.
2. Disputed is marked with `bump_version=False` (`conflicts.py:89`, `memory.py:134-148`), so it can never outrank the next real version from the hub.
3. If it were pushed, a device would receive "disputed" for a conflict it hasn't computed, and two devices racing to mark the same pair would create version churn.

`hub_payload` also rewrites any disputed status to active before push (`sync.py:91-93`).

**Resolution** (`conflicts.py:100-167`), under a lock:
- 404 / 400 / no-op guards: unknown id, a winner not in the pair, already resolved (`conflicts.py:107-113`; route codes at `api.py:142-150`).
- Winner → active, loser → superseded. Both are version-bumped and enqueued if shared.
- A resolution claim (attribute `resolution`, value = winner id, `resolves` = conflict id) is created at the narrowest tier and enqueued.
- The conflict record is marked resolved in SQLite.

**Remote side.** `apply_remote_resolution` (`conflicts.py:170-198`) runs when a pulled claim is a resolution (`sync.py:335-336, 341-342`). It sets statuses locally (no bump, because the resolver's bumped versions arrive through sync anyway) and writes the resolved record. If this device never detected the conflict, `_reconstruct` rebuilds the pair from claims tagged with that conflict_id, or by recomputing the pair id among the winner's candidates (`conflicts.py:201-228`). Pull order is oldest first, so the resolution lands after the claims it settles (`sync.py:311-312`).

---

## 7. How sync works

**Outbox (SQLite, `store.py:94-136`).**
- `enqueue` is an upsert keyed by claim_id that increments `gen` on re-enqueue. A claim changed twice is pushed once, in its current form.
- `outbox_ack(ids, gens)` deletes a row only if its `gen` still matches what was peeked. A change made mid-push survives and goes next round.
- Failures increment `attempts` and record `last_error`.
- The outbox survives restarts (`tests/test_sync.py:419`). The shard is flushed after every write, so a hard kill loses nothing (`memory.py:110-132`; demo.ps1 stops with `taskkill /F`).

**Push** (`sync.py:249-291`):
- Peek up to 2000 entries and read each point **as it is now** (payload + vectors). Drop missing or device ones.
- Sort by `(modified_at, claim_id)` and take 64 (`PUSH_BATCH`).
- One `upsert(wait=True)` to the hub. Point ids are uuid5 of claim_id, so a retried upsert is idempotent.
- Ack on success, then publish the claims (they turn green).

Sending oldest stamps first means a peer that pulls between two batches can't move its cursor past a claim still waiting here (`sync.py:267-269`; `tests/test_sync.py:318`).

**Pull** (`sync.py:293-347`):
- Cursor = kv `pull_cursor`. Scroll the filter from section 6 / `sync.py:107-119` with vectors, pages of 128.
- Sort by (modified_at, version) and apply under one shard flush.
- A new claim → `upsert_raw` + conflict check (or `apply_remote_resolution`).
- A known claim with a **higher version** → overwrite (+ resolution hook). Otherwise skip.
- The new cursor is the max `modified_at` seen, saved **after** the batch lands (`sync.py:313-315`).
- A bug in conflict handling is logged and doesn't stall sync (`sync.py:362-370`).
- The seed sets each device's cursor to the newest seeded stamp, 2026-10-02 19:44 IST (`seed.py:101-108`).

**Byte counting** (`sync.py:166-174`). A middleware on qdrant-client's REST transport (reached through a private attribute, because 1.15.1 exposes no hook, `sync.py:53-55`) adds `len(request.content)` and `len(response.content)`: bodies only, not headers. Status goes out on SSE immediately when online, hub_ok, outbox or last_error change; byte counters at most 2/s (`sync.py:387-401`).

**Hub errors** (`sync.py:239-243, 372-379`).
- An exception in a round leads to exponential backoff of 0.5, 1, 2, 4, then 5 s cap, with `hub_ok=False` and `last_error` set. The UI shows "Hub down".
- `_collection_ready=False`, so the next round re-creates the collection and indexes if the hub restarted empty.
- Going offline mid-round (`HubOffline`) is not treated as a hub fault.
- Unacked claims stay in the outbox.

**Hub schema** (`sync.py:23-29, 58-73`): `text` and `key` 384-d cosine, sparse `bm25` with IDF, payload indexes on modified_at (integer), tier, modified_by, captured_by and attribute (keyword).

**Known limits, stated plainly:**
1. **One clock assumption.** `modified_at` is the capturing device's wall clock (`memory.py:28-29`, `api.py:263`, `conflicts.py:155`), and the cursor compares stamps. With two devices this is safe: a device's cursor only ever advances on the *other* device's stamps, and that device pushes in stamp order. With three or more, a claim captured offline with an old stamp can be skipped by a peer whose cursor already moved past it via a third device. The same goes for clock skew between machines, or a clock that jumps backwards (CONTRACT.md:187-190). Practical corollary for the demo: the machine's clock must be later than the seed cursor (2 Oct 2026 19:44 IST), or new claims will never be pulled.
2. **Equal timestamps.** The pull filter is strict `>` (`sync.py:110`). Two claims stamped in the same millisecond and split across push batches (or across devices) could leave the second at `modified_at == cursor`, skipped forever. Rare, but real.
3. **Versions are per-claim counters, not vector clocks.** Two devices bumping the same claim to version 2 would diverge. In practice only one writer bumps a given claim: claims are effectively immutable, new information is a new claim, and only the owner's resolve bumps.
4. **Conflicts are pairwise.** A third disagreeing claim opens a conflict with whichever disagreeing candidate scores highest (`conflicts.py:58-62`). With identical scores, two devices could pick different pairs. N-way disputes would need a conflict keyed on (entity, attribute).
5. **A wiped hub isn't refilled.** Acked claims are not re-pushed.

**What I'd do next:** a hub-assigned push stamp (`synced_at`, set server-side or by a sequence) and pull on that instead of device time, which fixes 1 and 2. Then partial snapshots for down-sync (the original design; README.md:90), which Qdrant Edge supports via `snapshot_manifest` (CONTRACT.md:229). Then a per-(entity, attribute) conflict set, TLS + API key on the hub, and a backfill/re-push command.

---

## 8. Real vs mocked, plainly

| Real (in the code, running in the demo) | Mocked, simplified or not built |
| --- | --- |
| Two separate device processes, each with its own Qdrant Edge shard and SQLite | One machine. "Offline" is a transport switch, not airplane mode. Hub and Ollama are on the same machine, and both devices share one Ollama. |
| Hybrid on-device search (BM25 + dense, RRF) with status and tier filters | Gmail API: a fixture inbox with a Receive button (`app/fixtures/inbox_lakshya.json`, `api.py:360-366`) |
| Key-vector conflict detection at ingest and at sync, deterministic ids, both devices independently | WhatsApp: a real export parser (Android + iOS) exists in `sources.py:56` with tests, but **no route or button uses it** in the app |
| Owner-only resolution (403 otherwise) that syncs as a claim | Seed claims are pre-extracted (no LLM at seed time) |
| Persistent outbox, real HTTP sync to a real Qdrant server, byte counting at the wire | Answers are templated, not LLM-written (a deliberate cut, MVP.md:27) |
| Local LLM extraction (Ollama llama3.2), with date grounding, entity snapping and a regex fallback | Ollama 0.3.14 doesn't enforce the JSON schema; the schema is in the prompt and validated in Python |
| Tier privacy at capture, push, pull and search | Demo "today" pinned to 3 Oct 2026 |
| Live UI over SSE; the stage reads the hub directly | Phone app, voice, screen understanding, proactive nudges, pattern learning: not built |
| 156 tests (154 pass, 2 live-LLM tests skipped unless `QUORUM_LIVE_LLM=1`); `demo_check.py` drives all 8 beats with 47 checks | Encryption at rest, partial snapshots, SQLite knowledge graph, Tauri shell, hub auth/TLS: not built |

What a judge might poke at, and the honest answer:
- *"Is 'offline' fake?"* It is a switch, but it is enforced at the HTTP transport, and the counter is a measurement (section 2).
- *"Is the 1.00 cooked?"* It is the real cosine; see section 3.
- *"Is the LLM really doing anything?"* Yes: entity, attribute and the date words. But the parts the demo depends on are deterministic on purpose: dates, entity snapping, tier, conflict rule. The fallback gives the same claim for both demo inputs.
- *"Do the answers come from an LLM?"* No, they are templates over retrieved claims, always cited (`answer.py:1`).

---

## 9. Likely judge questions

**1. Why Qdrant Edge, not SQLite FTS or a cloud vector DB?**
Three needs in one on-device query: keyword match on names ("Sharma", "Kapoor"), semantic match on paraphrase, and payload filters (status, tier, attribute). Qdrant Edge does BM25 + dense + RRF + filters in one `QueryRequest` (`memory.py:183-192`). SQLite FTS has no vectors; adding a vector extension means hand-rolling the fusion and filters. A cloud vector DB fails with no signal and would put private claims off the device. Also, the hub is Qdrant server with the same collection shape, so a point syncs as-is, vectors included, with no re-embedding on pull (`memory.py:100-108`, `sync.py:97-104`).

**2. Why a separate key vector?**
A conflict is "same thing, different value", so the matching must ignore the value and the wording. The key is just entity + attribute (`memory.py:24-25`). 0.899 for the same task named differently, 0.738 for an unrelated deadline, threshold 0.82. Values are compared separately as normalised strings.

**3. Why not let the LLM decide conflicts?**
Two devices must reach the *same* conflict independently, without talking. That needs a deterministic rule: same vectors, same query, same threshold, same id hash (`conflicts.py:27-28`). An LLM call is slower (seconds on this CPU), can differ between runs and devices, and can't show a measured similarity. The LLM only extracts. Python validates, and Qdrant decides "same thing".

**4. What if the model misreads a date?**
The model never computes dates. It copies the date words, and Python resolves them against today (`extract.py:3-7, 499-500`). `_ground_date` rejects a date that isn't in the message, or falls back to the message's own single date phrase (`extract.py:379-389`). Values for amounts, counts and assignees must appear in the text (`extract.py:438-454`). If nothing valid comes back, the regex fallback runs (`extract.py:804-809`). And the system's whole design is that a wrong claim doesn't overwrite anything: if it disagrees with another source, it becomes a visible conflict with both excerpts.

**5. What does similarity 1.00 mean?**
The cosine between the two claims' key vectors. Both mentions were snapped to the known entity "Sharma wedding edit" (`extract.py:261-271, 751`), so the key text is identical. Differently named, it's 0.85–0.90.

**6. Why hybrid search, why RRF?**
BM25 catches exact names and rare tokens; dense catches meaning ("when is it due" vs "delivery"). Their scores are on different scales, so RRF fuses by rank (k=60) without calibration (`memory.py:189`). The cost is that RRF scores aren't similarities, which is why the displayed similarity comes from the dense key query.

**7. What is actually on the device?**
Per device: the Qdrant Edge shard, SQLite (outbox, conflicts, activity, cursor), the bge-small ONNX model, BM25 (inside Qdrant Edge), the extraction rules, the templated answers and conflict detection. The LLM is Ollama on localhost (the same machine in this demo). The hub only stores and serves team / my-devices claims; it computes nothing.

**8. How do you stop private data leaking?**
Ten layers (section 5): rules default to device, entity tier capping, the outbox only takes shared tiers, push re-checks the current tier, the pull filter, the team-view filter, and a live hub count of zero. Be honest that the hub has no auth yet.

**9. Three devices? Clock skew?**
Detection scales: each device detects independently and the ids agree. Sync has a stated limit: the cursor uses device wall-clock stamps. With two devices it's safe; with three or more, or with skew, an old-stamped offline claim can be skipped. The fix is a hub-assigned `synced_at` stamp (CONTRACT.md:187-190). Also, conflicts are pairwise today.

**10. What happens if the hub goes down mid-demo?**
Devices keep working. The worker backs off up to 5 s, shows "Hub down", keeps everything in the outbox, and re-creates the collection if the hub came back empty (`sync.py:372-379`).

**11. What if the same claim is pushed twice?**
Upserts are keyed by a deterministic point id (uuid5 of claim_id), so it's idempotent. The outbox dedups by claim_id.

**12. Why is "disputed" not synced?**
Each device detects it itself, and the mark is local with no version bump, so it can't outrank real updates (`conflicts.py:89`, `sync.py:87-94`). Only the resolution travels, as a claim.

**13. Who can resolve, and how do you stop two people settling?**
The owner only: 403 otherwise (`api.py:142-150, 271-274`). Resolve is serialised by a lock and no-ops if already resolved (`conflicts.py:100-113`). Only the owner bumps the versions.

**14. How does it scale?**
Honestly: the demo holds about 23 claims per device, and I haven't benchmarked large memories. The per-query work is one hybrid query or one filtered kNN with limit 5, which is what Qdrant is built for. Two places scan every claim and would need replacing for large memories:
- the "due this week" pool (`api.py:126`): a filtered Qdrant query on attribute plus a date payload index instead
- `find_entity`'s exact-name loop (`memory.py:218-220`)

The hub is a standard Qdrant server with payload indexes on the fields we filter.

**15. Why a hub at all, why not peer-to-peer?**
Laptops sleep and roam; a home server is always on. It's the same Qdrant data model as the edge. It's simple to reason about: one cursor per device. P2P is possible later.

**16. How fast is it?**
Search 7–70 ms on-device. Extraction ~4–6 s on the local CPU model (6 s budget, `extract.py:35`), with the regex fallback in milliseconds. Conflict on both devices ~0.15 s after reconnect in our measurement; the peer side depends on its 1 s sync tick. A resolution reaches the other device in ~1 s.

**17. Why templated answers, not an LLM?**
Speed (milliseconds, versus seconds of generation at 15–20 tokens/s on this CPU, `extract.py:471-472`), no hallucinated facts, and every sentence is citable to a claim. The memory layer is the product; prose generation is a later layer.

**18. What does the LLM see? Does anything go to a cloud?**
The message, the list of known entity names on that device, and few-shot examples with made-up entities (`extract.py:504-516, 540-547`). It's sent to Ollama on localhost; there are no cloud calls in the code path.

**19. What if Ollama isn't running?**
The first connection error marks it down for 20 s, and every ingest in between goes straight to the regex fallback (`extract.py:530-533, 642-644`). The demo inputs produce identical claims either way.

**20. How are dates like "next Friday" handled?**
Documented rules in `resolve_date` (`extract.py:180-196`). Numeric dates are day-first (India). "Friday" means the nearest one, today included. "Next Friday" means next week's Friday. A bare "the 18th" means this month if not past, else next month.

**21. Can a private follow-up leak because the model recognises a known entity?**
No: the tier is capped at the widest tier that entity already has on the device (`api.py:221, 288-295`).

**22. What's the business model?**
Per team per month, **no price set**; the call to action is early access (PRODUCT.md:45). Customer zero is **BKA, a four-person production house and developer group** (PRODUCT.md:17). Don't call them a film crew. No other customers, testimonials or user numbers exist: don't imply any (PRODUCT.md:61).

**23. What would you build next?**
Two laptops with real airplane mode. A hub-assigned sync stamp. Partial snapshots for down-sync. Gmail API and the WhatsApp import wired into the UI. TLS and an API key on the hub. N-way conflicts. A 30-message extraction accuracy test (MVP.md:53). Packaging (Tauri).

**24. Why both devices' points sit in the same place in the cloud?**
A fixed random projection (seed 7) of the `text` vector (`memory.py:16-17, 239-242`). The same claim lands at the same spot on every device, and points never jump. It's a visual aid, not UMAP.

---

## 10. Pre-demo checklist

**Before you share your screen**
1. **Start Ollama first** (it was not running when I checked; `ollama --version` said "could not connect"). Then `ollama list` should show `llama3.2`. The devices warm the model only at startup (`__main__.py:22`), so start Ollama *before* `demo.ps1`. The model stays loaded for 60 minutes (`extract.py:37`). If you started the stack more than an hour ago, re-warm it, or just restart with `.\scripts\demo.ps1`.
2. Check that the system clock is correct (later than 2 Oct 2026 19:44 IST; section 7).
3. From the repo root: `.\scripts\demo.ps1`. This resets the seed and starts the hub plus both devices. It waits up to 30 s for the hub and 90 s per device (`demo.ps1:121, 138`). If a port is held by something it didn't start, it stops with a message; `-Force` kills foreign holders. Be careful: other agents may be using those ports.
4. Open `http://127.0.0.1:8001/stage` and **hard-refresh (Ctrl+Shift+R)**; the styles were being edited today. Verify:
   - both panes show **Live**
   - both switches read "Connected to hub"
   - the hub column shows **18** claims, "Device-only claims on the hub: **0**", and "The devices hold their own: Tanishk's 2, Lakshya's 3"
   - Lakshya's inbox has 1 email
   - the tracker reads "Next · 1 of 8"
5. Optional full rehearsal: `app\.venv\Scripts\python scripts\demo_check.py` (47 checks; it *consumes* the demo). Then run `.\scripts\demo.ps1` again to reset. `--until 5` stops with the conflict open, so you can practise beats 6–8 by hand.
6. Optional: `app\.venv\Scripts\python -m pytest app\tests -q` (156 tests, about a minute).
7. Have the note text ready to paste: `Client just called: Sharma delivery moves to the 18th.`

**Order matters**
- Beat 3 (the note) must happen while Tanishk is disconnected.
- Beat 4 (the email) must happen while Tanishk is still disconnected. Otherwise Tanishk pulls the email first and the conflict is detected at capture on his device: it still works, but it's not the moment.
- Ask the beat 6 question **on Tanishk** to get "Settle it?". On Lakshya it says "Waiting for Tanishk."
- Keep 18 Oct (the call came after the email).

**If something misbehaves live**

| Symptom | What to do / say |
| --- | --- |
| Extraction is slow | It gives up on the model after the 6 s budget and the regex fallback produces the same claim. Say "if the local model is slow, a deterministic parser takes over". On the stage, success toasts are hidden, so you won't see "rules" vs "local model". |
| A pane is stuck on "Connecting…" or looks stale | Hard-refresh. SSE reconnects by itself and reloads state (`device.js:736-740`). |
| Lakshya hasn't shown the conflict yet | Wait a second: it arrives on her next sync tick. Check that her switch is on. |
| Clicked Receive twice | Harmless: the second gets 404 (`api.py:168-172`). |
| Hub shows "unreachable" / device shows "Hub down" | The hub process died. Devices keep working and queue. `.\scripts\demo.ps1 -NoSeed` restarts without wiping data. |
| Wrong order or wrong click; need a clean slate | `.\scripts\demo.ps1` (full reset to the seed). Allow up to a couple of minutes. Then hard-refresh the stage. |
| Stop everything | `.\scripts\demo.ps1 -Stop` (it only stops what this checkout started, `demo.ps1:7-9, 44-62`). |
| Hub dashboard 404 | Run `.\scripts\fetch_hub.ps1` (it fetches the web UI, `demo.ps1:107`). It's not needed for the stage, which reads Qdrant REST directly. |

Logs are in `app\data\logs\` (hub.log, tanishk.log, lakshya.log and their `.err.log` files).
