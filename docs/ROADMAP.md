# Build plan

| Day | Memory / sync / conflicts | Frontend / visuals |
| --- | --- | --- |
| 1 | Prove Qdrant Edge (Rust, Python fallback), FastEmbed on-device, one sync round-trip | Tauri shell, design system, wireframes |
| 2 | Claim contract, SQLite graph, persistent outbox, tier filters | Memory inspector + assistant panel on mock data |
| 3 | Ingest: Gmail, WhatsApp export, typed notes; constrained extraction; 30-message extraction test | Point cloud prototype (UMAP) |
| 4 | Qdrant conflict detection at ingest + sync; owner routing | Conflict centre, sync status; mid-point cut-line check |
| 5 | Hyperfocus nudge, reminders, ask-teammate drafts | Wire every surface to live data |
| 6 | End-to-end two-laptop demo, feature freeze | Polish, motion, pitch visuals |
| 7 | Filming, submission | Motion graphics for the film |

## Cut lines
- Sync-time conflicts not working → keep ingest-time conflicts; show sync ones in the log.
- Point cloud not ready → 2D view with the same colour states.
- Gmail auth fighting us → saved export of real emails.
- Behind schedule → voice stays out.
