# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Device app (the demo): FastAPI per device, vanilla JS UI in `app/web/` with no build step, Qdrant Edge on-device, Qdrant server as the team hub (`app/CONTRACT.md`).
- Landing page: delegated. The user asked for "a proper page, reactive, interactive" and left the stack to Impeccable's process; chosen and recorded in its surface brief.

## Users

- **Primary:** small teams who juggle many clients across email, WhatsApp and conversations in person, often somewhere with poor or no signal: production houses, developer groups, event teams, agencies, site crews. A deadline changes in one place and gets misquoted in another, and nobody notices until it's too late.
- **Customer zero:** BKA, a four-person production house and developer group. Named publicly (user-confirmed). Not a film crew.
- **Evaluators (current):** Code Cubicle 6.0 judges, Problem Statement 03 (AI-powered edge memory on Qdrant Edge), watching an online elimination round over one presenter's shared screen. They must understand what is happening without narration doing all the work.

## Product Purpose

Quorum is a shared, offline-first memory layer for small teams. Each member's device is a full edge node: it remembers what that person was told, answers with no signal, and syncs with the team when it reconnects. When two teammates' facts disagree, it never silently picks a winner; it surfaces the conflict and asks the task's owner. Success: no client deadline is ever misquoted because two people heard different things.

The memory layer is the product; a personal assistant on each device is how members use it.

## Positioning

- **Claims, not facts.** Every memory is a claim with a source (who said it, where, when), so the system can say who said what when sources disagree.
- **Qdrant finds the conflict.** A dedicated vector of "what this claim is about" (entity and attribute, not value) makes two claims about the same thing land together even when worded differently; a filtered nearest-neighbour search on-device opens the conflict with a measured similarity.
- **It asks instead of guessing.** Nothing wins by default; the owner resolves, and the resolution syncs to everyone.
- **Private by construction.** Everything starts device-only; only work the team needs is shared, enforced by tier filters on every search and at the sync boundary.

## Operating Context

- Inputs: email, WhatsApp chat exports, typed notes after calls. Live WhatsApp and phone capture are product scope but mocked in demos.
- Shoots and site work with no network; devices sync through a team hub (home server) when back online.
- Online demo (now): one machine, two browser windows as two separate device processes, each with its own Qdrant Edge shard, syncing through a local Qdrant server hub. "Offline" is a per-device "no connection to hub" switch enforced at the transport, and the UI says exactly that.
- After the elimination round: two physical laptops, real airplane mode.

## Capabilities and Constraints

- Real today: on-device hybrid search (BM25 + dense, RRF), claim extraction by a local model (Ollama llama3.2, schema-constrained, regex fallback), conflict detection at ingest and at sync, owner-only resolution that syncs, persistent outbox, tier privacy (team / my devices / device), cited templated answers, live UI over SSE.
- Mocked or not built: phone app, live WhatsApp stream, Gmail API (fixture inbox instead), screen understanding, voice, hyperfocus nudge, long-term pattern learning, encryption at rest (relies on OS disk encryption).
- Extraction takes ~4–6 s per message on the local model; search answers in milliseconds.
- Pricing model is per team per month; **no price is set**. The call to action is **early access**.
- Terminology: claim, conflict, owner, tier (device only / my devices / team), hub, outbox, edge node.

## Brand Commitments

- Name: **Quorum**.
- Lines from the brief: "Your team's memory, on every laptop, even with no signal." · "It reads everything, and nothing leaves unless it's work your team needs." · "When two people disagree about a deadline, it asks instead of guessing."
- Lead with the team conflict, not the assistant; follow the framing rules in the internal brief.
- Honesty is part of the brand: state plainly what is mocked.

## Evidence on Hand

- A working MVP in `app/` with an end-to-end check (`scripts/demo_check.py`, 47 checks) and 147 tests.
- Measured numbers (this machine, 3 Oct 2026): hybrid search 7–70 ms on-device; conflict detected on both devices ~0.15 s after reconnect; key-vector cosine "Sharma delivery due date" vs "Sharma edit due date" = 0.899, vs an unrelated deadline 0.738 (threshold 0.82).
- Showcase film generated from code in `video/` (150 s; rendered copy on Drive, not in git); pitch deck `deck/Quorum-Pitch.pptx`.
- Customer zero: BKA (named, user-confirmed).
- Absent, never to be fabricated: testimonials, other customers, logos, pricing figures, user counts, third-party benchmarks, press, a public deployment.

## Product Principles

1. Never guess between people: surface disagreement with its sources and let the owner decide.
2. Private by default: nothing leaves a device unless it's work the team needs.
3. Work where the signal doesn't: every core action completes on the device.
4. Show the mechanism: memory, sync and conflicts are made visible, not hidden behind a chat box.
5. Honest about what's real.
