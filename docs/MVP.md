# Quorum MVP: most wow per hour

**One moment carries the demo:** a device that lost its connection to the hub reconnects, two points in the memory cloud pulse red and pull together, and the screen says *"Found 2 claims about the Sharma wedding edit, similarity 0.90. Dates disagree."* Every piece below either builds that moment or proves it's real (separate edge nodes, private data, real sync). Everything else is cut.

## Shape for the online elimination round

One presenter, one shared screen. That means **one machine, two browser windows side by side**, each a separate device process with its own Qdrant Edge shard and SQLite outbox, syncing through a local Qdrant server hub. "Offline" is a per-device *no connection to hub* switch: that device's search, extraction and memory keep working; only its sync stops. We say exactly that on screen. True airplane-mode, two-laptop and offline-model work waits until after the elimination round.

Interfaces are frozen in [`app/CONTRACT.md`](../app/CONTRACT.md).

## Verified on this machine (3 Oct 2026)

- `qdrant-edge-py 0.8.0` installs from a Windows wheel. Hybrid query (BM25 + dense, RRF) with a tier filter: 7 ms on a cold shard. UUID point ids work, and data survives close and reload.
- The package ships its own **BM25**, so only dense vectors need FastEmbed (`bge-small-en-v1.5`, in `models/`).
- **The conflict number is real:** "Sharma delivery due date" vs "Sharma edit due date" = cosine **0.899**; an unrelated deadline = 0.738. Threshold 0.82 separates them. It comes from a dedicated `key` vector (entity + attribute, not the value), so two claims about the same thing match even when their values differ.
- RRF scores are rank-based (~0.03). The on-screen similarity comes from the dense `key` query.
- Hub: Qdrant server 1.19.1 Windows binary (no Docker). LLM: Ollama `llama3.2` (already installed), JSON-schema constrained, with a regex/date fallback so the demo never stalls.

## Cuts

| Cut | Instead |
| --- | --- |
| Tauri shell | FastAPI per device + one vanilla-JS page (no build step) |
| SQLite knowledge graph | Entity/attribute/owner in the Qdrant payload; Qdrant matches entities by meaning |
| Partial-snapshot down-sync | Scroll the hub for `modified_at > cursor`; real sync, simpler |
| LLM-written answers | Templated answers over retrieved claims, always cited |
| Gmail API, live WhatsApp | Fixture inbox with a **Receive** button; a real WhatsApp-export parser |
| three.js / UMAP | The canvas cloud engine from `video/lib.js`, fixed projection (same position in both windows) |
| Voice, encryption at rest, patterns, hyperfocus nudge, offline hardening | After the elimination round |

## Build (agents, one workflow)

| Phase | Agents | Output |
| --- | --- | --- |
| Build | core memory + API · sync + hub + seed + launcher · extraction + sources + fixtures · web UI (runs on mocks first) | modules per the contract, unit tests |
| Integrate | one | everything running together; `scripts/demo_check.py` drives both devices through the demo script over HTTP and asserts each step |
| Verify | UI walk-through in two real browser tabs · adversarial review of sync, conflicts and privacy | screenshots, findings |
| Fix | one | confirmed findings fixed, `demo_check` green again |

## Demo script

1. Both windows show a populated cloud. Lakshya asks "what's due this week?" → cited answer.
2. Tanishk's device loses the hub. His counter reads 0 B; search still answers in ms.
3. Tanishk notes "Client just called: Sharma delivery moves to the 18th." → amber point, outbox 1.
4. Lakshya receives the client email (delivery on 16 October) → syncs, point goes green.
5. Tanishk reconnects → outbox drains → **red pair pulls together, similarity 0.90, dates disagree.** Lakshya's window detects it too.
6. "When is the Sharma delivery?" → *"Disputed: the client's email says 16 Oct; Tanishk's note says 18 Oct."*
7. Lakshya sees "Waiting for Tanishk" + Ask Tanishk (draft). Tanishk resolves; both windows update.
8. Team view: private points vanish. The hub dashboard holds no device-only claims.

## After the elimination round

Two laptops + real airplane mode · hyperfocus nudge (foreground window + demo clock) · partial snapshots · Gmail API · 30-message extraction accuracy test · Tauri packaging.
