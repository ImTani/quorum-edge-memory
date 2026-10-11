# Quorum showcase v4: director's storyboard and style bible

This is the single source of truth for every agent working on v4. `cues.json` is the same plan in machine form: scenes, key events, captions, every SFX cue, music marks and the capture shot list. They were generated together and agree. **Don't move scene ranges or key-event times.** The score is composed against them in parallel. If a scene really needs different timing, say so in your report; don't change it quietly.

- Output: **1920x1080, 30 fps, 168.0 s** (5040 frames). No voiceover. Captions carry the story; music and SFX carry the feel.
- Tempo: **120 BPM**, so 1 beat = 0.5 s and 1 bar = 2 s. Key events sit on the 0.5 s grid. The one exception is the 75.25 push, an 8th-note pickup into the hit. Cursor travel and capture-driven UI steps (deck flow steps every 0.9 s) are motion, not sync points, and SFX just follow them.
- Product: **Quorum**, offline-first team memory on **Qdrant Edge**. Code Cubicle 6.0, Problem Statement 03. Repo: github.com/ImTani/quorum-edge-memory.
- People: Tanishk (left laptop, "on set" / "on a shoot"), Lakshya (right laptop, "office"). The client is Rohit Sharma (from the fixture inbox). Customer zero: **BKA, a four-person production house and developer group**.
- Framing follows the internal brief (kept out of git). No invented customers, users, numbers beyond the mocked demo timings below, logos or prices. "Per team, per month" with no figure; the call to action is early access.

## The film in one breath

Two people heard two dates. Quorum promises a team memory that works with no signal. Then the real product shows it: an answer in 9 ms, a laptop cut off from the hub that still remembers, a note queued offline, the client's email syncing on the other laptop. The hero beat: Tanishk reconnects and **both laptops catch the same conflict on their own**. Big zoom, hit, the 0.85 vs 0.82 ruler. The answer says "Disputed" with both sources, the owner settles, everyone has it a second later, and the hub holds zero private notes. Then how it works (architecture flow, key vector), where it's going (a private assistant that can know you because nothing leaves your laptop), and the close.

| # | id | scene | range (s) | surface |
|---|---|---|---|---|
| 1 | S01 | Cold open: two people, two dates | 0-16 | motion graphics |
| 2 | S02 | Title and promise | 16-26 | MG + landing hero capture |
| 3 | S03 | Two laptops, one hub | 26-34 | stage capture + MG |
| 4 | S04 | Beat 1: ask, 9 ms | 34-44 | stage capture |
| 5 | S05 | Beat 2: Tanishk loses the hub | 44-52 | stage capture |
| 6 | S06 | Beat 3: note offline, queued | 52-62 | stage capture (ramp) |
| 7 | S07 | Beat 4: client email lands, syncs | 62-72 | stage capture (ramp) |
| 8 | S08 | Beat 5 HERO: reconnect, both catch the conflict | 72-90 | stage capture + MG |
| 9 | S09 | Beat 6: ask again, "Disputed" | 90-98 | stage capture |
| 10 | S10 | Beat 7: Lakshya asks, owner settles | 98-108 | stage capture |
| 11 | S11 | Beat 8: Team view, 0 private on hub | 108-116 | stage capture |
| 12 | S12 | How it works (deck slide 5 flow) | 116-128 | deck capture |
| 13 | S13 | Key vector and the 0.82 bar | 128-138 | MG |
| 14 | S14 | Product direction (deck slides 6, 7) | 138-154 | deck stills + MG |
| 15 | S15 | Close: BKA, per team per month, repo, logo | 154-168 | MG |

Every scene boundary is a camera move across the board or an eraser wipe. There are no hard cuts and no crossfades to black.

## Style bible

### World
- **One giant whiteboard.** The whole film happens on a single board about 3x3 screens (5760x3240 world px). Each scene owns a region. Scenes hand off with a camera pan or dive across the board, plus `paper_whoosh`. At 154 s the camera pulls out to show the whole board with every region still on it, as the reveal.
- **Paper:** `#eef0f3`, a very faint whiteboard sheen (radial white at 30% from the top-left) and a few ghosted smudges of old marker (`rgba(20,23,31,.03)`). No grid, no dark backgrounds, **no glow, no neon, no additive blending.**
- **Board frame** (only for the S01 title board and the final pull-out): aluminium edge like the landing hero (`#f7f8fa -> #c9ced6`), dark corner caps `#3b4150`, and a marker tray with the blue and red markers and the eraser (copy the SVG from `site/index.html`).

### Palette (from `site/css/site.css`)
| token | hex | meaning in v4 |
|---|---|---|
| paper | `#eef0f3` | background |
| ink | `#14171f` (ink-2 `#3b4150`, ink-3 `#656b7a`) | text, black marker, cursor outline |
| marker blue | `#1f4fd8` | Quorum / system annotations, underlines, the repo URL |
| marker red | `#c81e34` | conflict, disputed, cut links |
| marker green | `#14895a` | synced, resolved, checks |
| sticky yellow | `#ffe14d` (top `#ffe86a`) | notes and calls (Tanishk's side) |
| sky | `#9fd6ff` (top `#b3dfff`) | emails (Lakshya / client side) |
| kraft | `#e2c08a` / `#c9a165`, ink `#3a2a12` | private, device-only, "only on this laptop", the honest note, BKA card |
| tape | `rgba(239,227,184,.88)` | tape strips |

The UI captures keep their own colours: the studio look's amber for queued, violet for private, and its red and green. Annotations drawn over them use only the marker colours above.

### Type (self-host from `site/fonts`; from `video/v4/` the path is `../../site/fonts/`)
- **Schibsted Grotesk** (400-800): wordmark (800, 170px, tracking -0.03em), on-board headings (700, 56-72px), UI-like labels (600).
- **Shantell Sans** (variable): every caption and annotation. It's the handwriting.
- **Captions:** Shantell Sans 600, 46px, ink, on a white paper strip (`#fff` at 94%, rotated -0.6deg, 1px `#dfe2e8` edge, a tape tab at the left end, soft shadow `0 10px 18px -12px rgba(20,23,31,.35)`). Placed bottom-left (x = 120, baseline ~ y 990, max width 1400). Key words can take a boiled marker underline in blue or red. Entry: a left-to-right writing wipe at ~45 chars/s (no sound) plus a 6px rise. Exit: 0.3 s fade. Keep the bottom 170px free of important UI while a caption is up. Every caption holds at least 3 words/s; `cues.json` was checked for this.
- **Annotations:** Shantell 500-700, 30-40px, in marker blue, red or green, written on with the stroke-reveal below. Short words only.

### Marker strokes and boil
- Strokes are SVG paths drawn with `stroke-dashoffset`, length/1400 px/s, clamped to 0.25-0.8 s, easeInOutSine. Round caps. 5-7px for big strokes, 3-4px for annotations. Use a light dry-marker texture (the `dry` filter from `site/index.html`). Every stroke starts with a `marker_squeak` (its `dur` in cues.json = stroke time).
- **Boil:** shape-only redraw at **~7 fps** (`step = floor(t*7)`). Each path's control points jitter by about +-1.2px, seeded by (path id, step). Do the same as `jitterPath` in `site/js/board.js`. Positions, opacity and fills never flicker. It applies to marker strokes, the drawn cursor outline and the handwritten labels drawn as paths. It's subtle and always on.

### Stickies
Square-ish, 240-320px, rotated +-2-5deg, with a 1-2 tape strips, the slightly lighter top band from the landing page, and shadow `0 10px 18px -8px rgba(20,23,31,.35)`. **Slap:** the sticky comes in at scale 1.18 with +8deg extra rotation and settles with a spring (overshoot about 4%). The shadow tightens on contact, the board shakes 1-2px, and `sticky_slap` sounds at contact (the cue time is contact time, so start the motion about 0.12 s before).

### Drawn cursor and micro-interactions
- **Cursor:** a hand-drawn arrow pointer, 44px tall, white fill with a 3px ink outline (boiled), soft shadow. It's drawn in screen space at the camera-transformed position of the capture target (rects come from the capture's `meta.json`, mapped through the scene's ct map and the camera).
- **Movement:** curved arcs, easeInOutCubic, ~1200 screen px/s, a 4px overshoot then settle. It never teleports. It enters from the frame edge nearest its first target and leaves the same way after its last click in the scene.
- **Hover:** cursor scale 0.96 and the real hover state in the capture where the capture fired a real mouse move.
- **Click:** press = scale 0.88 for 0.08 s (`click_down`), then release (`click_up`, +0.1 s). The ripple is a marker-blue ring 3px wide growing 0 -> 46px radius over 0.35 s while fading, plus three short emphasis ticks around it, boiled. A red ring for the hub switch going off, green for Keep.
- **Typing** is in the capture. One `key_tick` per character (listed in cues.json), varied.
- **Counters:** whenever a number changes in a capture (Outbox, hub total), add an overlay pop on the number (scale 1.12 -> 1 spring) and a `counter_tick`.
- **Fast-forward stamp** over extraction waits: small hand tag "▸▸ local model reading · 4.5 s" in ink-3 at the input, popping in at the ramp start and fading at the ramp end.

### Camera
- A 2D camera over the world: position, zoom z, roll (+-1.5deg max). Moves are easeInOutCubic over 0.6-1.0 s; snaps and whips use easeOutExpo over 0.5-0.6 s. Every shot carries a constant micro-drift (+-6px, 0.1 Hz) and a 0.3% scale breathe.
- **Hits:** shake 10px decaying over 0.4 s (S08 at 76.0). Smaller events shake 2-4px.
- **Capture zoom:** captures are 2x device-scale (3840x2160 for a 1920x1080 viewport), so plates stay crisp up to **z 2.6** in plate pixels. In the scene tables, "z" is screen px per plate px with the stage plate at 1920x1080. At z 0.86 the plate sits taped on the board with margins.
- Named framings for the stage plate. Fit the named rect(s) from `meta.json` with padding; the z values are guides.
  - `WIDE` the whole plate with board margin (z ~0.86-0.95). `FULL` the plate fills the frame (z 1.0).
  - `L_SWITCH` L.header + L.outbox + L.rate (z ~2.0-2.1). `L_ASK` L.suggestDue + L.answer (z ~1.9). `L_CAPTURE` L.noteInput + L.save + the lower L.cloud (z ~2.0). `L_CLOUD` L.cloud + L.viewTeam (z ~1.8-2.2). `L_CARD` L.conflictCard (z ~1.9).
  - `R_ASK` R.suggestDue + R.answer (z ~1.9). `R_INBOX` R.inbox + R.receive (z ~1.9). `R_HUB` the right pane + HUB.total (z ~1.3).
  - `HUB` HUB.total + HUB.privacy (z ~2.0). `BOTH_CARDS` L.conflictCard + R.conflictCard (z ~1.15).

### UI captures inside the whiteboard world
Real UI is always framed as something pinned to the board: a white card (1px `#dfe2e8`, radius 14, shadow `0 24px 40px -20px rgba(20,23,31,.35)`) with two tape strips at the top corners. The landing page and the deck get a thin browser-chrome strip on top (three grey dots, no URL text). When the camera zooms past z 1.3 into a plate, the frame simply goes out of shot. Annotations are drawn over the plate in world space so they move with the camera.

### Honesty, on screen
- From 32.0 to 41.0 a small kraft tag in the bottom-right corner reads: **"Two laptops shown as two device processes on one machine. Offline = a per-device hub switch."**
- The S14 caption says the assistant behaviours are **the direction, not the demo** ("phone, voice and nudges come next").
- The demo footage is reconstructed: a replica of the real stage UI against a scripted backend. Its numbers are mocked for drama but match the product (below). Nothing in the demo shows a feature that isn't built.

### Mocked demo numbers (use exactly these everywhere)
- Ask answers: **9 ms** (beat 1, Lakshya), **11 ms** (beat 2, Tanishk offline), **8 ms** (beat 6, disputed).
- Extraction: the capture holds "Reading…" for 4.5 s and the film ramps through it in 1.0 s.
- Conflict after reconnect: Tanishk **+0.5 s**, Lakshya **+1.0 s** ("within about a second"). The decision reaches Lakshya **1.0 s** after Keep.
- Similarity **0.85**, threshold **0.82**, unrelated deadline **0.74**. The note claim's entity stays "Sharma delivery" and the email's is "Sharma wedding edit". 0.853 is the measured cosine for exactly that pair, so 0.85 is honest.
- Hub total 18 -> 19 (email) -> 20 (note, at reconnect) -> 21 (decision). **Device-only claims on the hub: 0** throughout.

## Scenes

Times are video seconds. "ct" is capture time in the named capture. Scene ranges are half-open [start, end).

### S01 · Cold open: two people, two dates · 0.0-16.0 s

Surface: motion graphics only.

| t | key event |
|---|---|
| 0.0 | Clean whiteboard (paper #eef0f3, faint ghost smudges). Camera z 1.04 -> 1.00 slow push over the scene. |
| 0.5 | Black marker draws crossed-out signal bars top-left, then hand label "on a shoot · no signal". |
| 1.5 | Yellow sticky slaps in left (centre ~560,470, rot -4deg): "Client just called: Sharma delivery moves to the 18th." meta "call · heard by Tanishk". |
| 3.0 | Hand label "Tanishk" + short arrow to the yellow sticky. |
| 4.0 | Hand label top-right "in the office · online". |
| 4.5 | Sky-blue sticky slaps in right (centre ~1360,470, rot +4deg): "Confirming final delivery of the Sharma wedding edit on 16 October." meta "email · Rohit Sharma -> Lakshya". |
| 6.0 | Hand label "Lakshya" + arrow to the blue sticky. |
| 8.0 | Red marker circles "the 18th" on the yellow sticky. |
| 8.5 | Red marker circles "16 October" on the blue sticky. |
| 9.0 | Giant red handwritten "18" and "16" (Shantell 260px) scrawl out of the circles towards centre. |
| 10.0 | Red "?" drops between them with a 4px board shake. |
| 12.0 | Thin black marker line joins the two stickies, hand label "same job". |
| 13.0 | Everything but the caption dims 15%. |
| 15.0 | Eraser swipe wipes the board left -> right (15.0-16.0). |

Captions:
- 2.0-5.5: "Tanishk takes the client's call on set."
- 5.5-9.0: "Lakshya gets the client's email in the office."
- 10.0-13.0: "Same job. Two dates. Nobody notices…"
- 13.0-15.5: "…until the client does."

### S02 · Quorum: title and promise · 16.0-26.0 s

Surface: motion graphics + LANDING_HERO capture.

| t | key event |
|---|---|
| 16.0 | IMPACT. Yellow "Q" sticky slaps centre; wordmark "Quorum" (Schibsted 800, 170px) writes in beside it. |
| 17.0 | Blue marker underline boils in under the wordmark. |
| 17.5 | Subtitle pops (Schibsted 600 40px, ink-2): "Offline-first team memory on Qdrant Edge". |
| 19.0 | Camera pans down the board to the LANDING_HERO capture, taped to the board in a browser card. |
| 19.5 | Tape strips slap. The hero headline is the promise on screen: no caption over it. |
| 20.5 | Blue hand tag beside the card: "Code Cubicle 6.0 · Problem Statement 03". |
| 22.5 | Camera eases from the headline (z 1.25) to show the hero whiteboard (z 1.0). |
| 23.5 | Drawn cursor enters and travels to "Watch the demo" (real hover state in the capture from ct 5.5). |
| 24.5 | Click ripple on "Watch the demo" (video-only click: the page is not navigated). |
| 25.0 | Camera dives down-right across the board to the stage region (transition into S03). |

Captions:
- 22.5-25.8: "When two people disagree, it asks instead of guessing."

Capture map (video t -> capture ct, piecewise linear):
- LANDING_HERO: 19->0, 26->7

### S03 · Two laptops, one hub (the stage) · 26.0-34.0 s

Surface: STAGE capture (ct 0-4) + motion graphics.

| t | key event |
|---|---|
| 26.0 | Camera lands WIDE (z 0.86) on the STAGE plate taped to the board. Groove starts. Plate holds frame ct 0 until 30.0. |
| 27.0 | Marker label + arrow "Tanishk's laptop · on a shoot" -> left pane header. |
| 28.0 | Marker label + arrow "the team hub · a Qdrant server" -> hub column. |
| 29.0 | Marker label + arrow "Lakshya's laptop · in the office" -> right pane header. |
| 30.0 | Capture plays 1:1 (ct 0 -> 4). |
| 32.0 | HONEST NOTE: small kraft tag slaps bottom-right: "Two laptops shown as two device processes on one machine. Offline = a per-device hub switch." Shrinks to 70% in the corner at 34.0 and stays until 41.0. |

Captions:
- 27.5-30.5: "Two laptops. Each keeps its own memory."
- 30.5-33.8: "The hub only relays what the team shares."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 26->0, 30->0, 34->4

### S04 · Beat 1: Lakshya asks, answered in 9 ms · 34.0-44.0 s

Surface: STAGE capture.

| t | key event |
|---|---|
| 34.0 | Camera WIDE -> R_ASK (Lakshya's Ask panel, z ~1.9), 0.9 s easeInOutCubic. |
| 35.0 | Cursor enters from the right edge, heads for Lakshya's suggestion "What's due this week?". |
| 36.0 | CLICK (ct 6.0). The real UI fills the input and submits. |
| 36.5 | Answer renders: "3 things are due this week: …" + 3 citation chips + "9 ms, on this device". |
| 37.0 | Blue marker circles "9 ms, on this device". |
| 37.5 | Blue hand note beside it: "on the laptop · no cloud". |
| 38.5 | Citation chips get tiny blue ticks, one each at 38.5 / 39.0 / 39.5. |
| 40.0 | Camera drifts up to Lakshya's memory cloud (cited points glow in the capture). |
| 43.5 | Camera starts the whip to the left pane. |

Captions:
- 37.5-41.0: "Ask anything. Answered on the laptop in 9 ms."
- 41.0-43.8: "Every line cites its source."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 34->4, 44->14

### S05 · Beat 2: Tanishk loses the hub · 44.0-52.0 s

Surface: STAGE capture.

| t | key event |
|---|---|
| 44.0 | Whip-pan to L_SWITCH (Tanishk header: hub switch, Outbox, Hub traffic; z ~2.1), 0.6 s easeOutExpo. |
| 44.5 | Cursor travels to Tanishk's hub switch, arrives 45.75, hovers. |
| 46.0 | CLICK (ct 16.0). Switch -> "No connection to hub", pane tints amber, link dashed "no connection", "0 B/s · frozen". 3px shake. MUSIC: offline. |
| 46.5 | Red marker slash across the dashed link. |
| 47.0 | Hand note "cut off from the hub". |
| 47.5 | Marker circle around "0 B/s · frozen". |
| 48.5 | Camera eases to L_ASK (Tanishk Ask panel, z ~1.9); cursor heads for "What's due this week?". |
| 49.5 | CLICK (ct 19.5). |
| 50.0 | Answer renders with "11 ms, on this device". |
| 50.5 | Marker underline under "11 ms". |

Captions:
- 46.5-49.5: "Tanishk loses the hub. No signal on set."
- 49.5-51.8: "Still remembers. Still answers. 11 ms."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 44->14, 52->22

### S06 · Beat 3: Tanishk notes the call, offline · 52.0-62.0 s

Surface: STAGE capture (speed ramp 4.5x over extraction).

| t | key event |
|---|---|
| 52.0 | Camera -> L_CAPTURE (Tanishk Capture + cloud bottom, z ~2.0). |
| 52.5 | Cursor -> note input, arrives 52.9. |
| 53.0 | CLICK note input (ct 23.0). |
| 53.5 | Typing in the capture (ct 23.5-26.0, 54 chars, ~21.6 cps): "Client just called: Sharma delivery moves to the 18th." |
| 56.0 | Cursor -> Save, arrives 56.4. |
| 56.5 | CLICK Save (ct 26.5). SPEED RAMP: capture ct 26.5 -> 31.0 ("Reading…", 4.5 s) plays in 1.0 s. Hand stamp at the input: "▸▸ local model reading · 4.5 s". |
| 57.5 | Claim lands (ct 31.0): amber point "18 Oct · Note · queued · in outbox", Outbox 0 -> 1. |
| 58.0 | Marker arrow from the input to the amber point. |
| 58.5 | Marker circle around "Outbox 1". |
| 59.0 | Camera pans right to the hub column (z ~1.8): "18 claims on the hub" unchanged. |
| 59.5 | Hand note "still 18 · nothing left the laptop". |
| 61.5 | Camera starts across to Lakshya. |

Captions:
- 53.0-56.0: "He notes the client's call. Offline."
- 57.5-61.8: "Turned into a claim, with its source. Queued, not sent."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 52->22, 56.5->26.5, 57.5->31, 62->35.5

### S07 · Beat 4: the client email lands on Lakshya · 62.0-72.0 s

Surface: STAGE capture (speed ramp 4.5x over extraction).

| t | key event |
|---|---|
| 62.0 | Camera -> R_INBOX (Lakshya Capture/Inbox, z ~1.9). |
| 63.0 | Marker arrow to the inbox item + hand note "client email, just in". |
| 63.5 | Cursor -> Receive, arrives 64.3. |
| 64.5 | CLICK Receive (ct 38.0). SPEED RAMP ct 38.0 -> 42.5 in 1.0 s; stamp "▸▸ reading · 4.5 s". |
| 65.5 | Claim lands queued (ct 42.5), Lakshya Outbox 1. |
| 66.0 | Push (ct 43.0): token on the right link "sent 1 claim", point turns green, Outbox 0. Camera pulls to R_HUB (right pane + hub, z ~1.3). |
| 66.5 | Hub total 18 -> 19 (ct 43.5); "Latest to reach the hub": Sharma wedding edit · 16 Oct · from Lakshya. |
| 67.5 | Green marker tick by "19" + hand note "synced to the team". |
| 68.5 | Camera glides left to Tanishk's header (still "No connection to hub"). |
| 69.0 | Dotted black marker arrow hub -> Tanishk, red "×" at 69.5, hand note "can't see it yet". |

Captions:
- 62.5-65.5: "Meanwhile, the client emails Lakshya: the 16th."
- 66.5-70.0: "Her laptop reads it and syncs it to the team."
- 70.0-71.8: "Tanishk can't see it yet."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 62->35.5, 64.5->38, 65.5->42.5, 72->49

### S08 · Beat 5 (HERO): reconnect, both laptops catch the conflict · 72.0-90.0 s

Surface: STAGE capture + motion graphics.

| t | key event |
|---|---|
| 72.0 | Camera WIDE, then 72.5-73.3 push to L_SWITCH (z ~2.0). Music riser 72 -> 76. |
| 73.5 | Cursor -> Tanishk's hub switch, arrives 74.4, small hover wobble. |
| 75.0 | CLICK switch on (ct 52.0). MUSIC: reconnect. Camera snaps back to WIDE (z ~0.95, easeOutExpo 0.6 s). |
| 75.25 | Push: token "sent 1 claim" on the left link, Tanishk Outbox 1 -> 0. |
| 75.5 | Tanishk detects (ct 52.5): two Sharma points turn red and pull together; conflict card opens on the left. Thin red flash on the left pane border. |
| 76.0 | HIT. Lakshya detects (ct 53.0): same conflict card on the right. 10px shake decaying 0.4 s; red marker loops scribble around BOTH cards at once. Hub 19 -> 20. |
| 76.5 | Hand label "after reconnect:" with stopwatch doodles "+0.5 s" over Tanishk (77.0) and "+1.0 s" over Lakshya (77.5). |
| 78.0 | BIG ZOOM: camera dives into Tanishk's cloud on the two red points + "similarity 0.85" tag (z 1.0 -> 2.6, 78.0-79.5). |
| 79.5 | Marker ruler draws under the points (screen space): 0.70 ... 1.00; threshold tick "0.82" at 80.0. |
| 80.5 | Red needle rolls 0.70 -> 0.85 (80.5-81.25); "0.85" label pops at 81.5. |
| 82.5 | Camera eases to L_CARD text: "Found 2 claims about the Sharma wedding edit, similarity 0.85. Dates disagree." |
| 83.0 | Red marker underlines "16 Oct" (83.0) and "18 Oct" (83.5). |
| 85.0 | Camera pulls to BOTH_CARDS (z ~1.15). |
| 86.0 | Hand note on the left card: "Tanishk owns this" -> "You own this". |
| 87.0 | Hand note on the right card: "Lakshya waits for him" -> "Waiting for Tanishk". |
| 88.0 | Hand note centre: "same conflict id on both · worked out apart". |

Captions:
- 76.5-80.0: "Both laptops catch the same conflict. On their own."
- 80.0-84.5: "Qdrant matched what each claim is about: 0.85, over the 0.82 bar."
- 84.5-89.5: "Nothing is overwritten. Nothing wins by default."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 72->49, 90->67

### S09 · Beat 6: ask again, "Disputed" · 90.0-98.0 s

Surface: STAGE capture.

| t | key event |
|---|---|
| 90.0 | Camera -> L_ASK (Tanishk Ask panel, z ~1.9). |
| 90.5 | Cursor -> "When is the Sharma delivery?" (Tanishk), arrives 91.3. |
| 91.5 | CLICK (ct 68.5). |
| 92.0 | Answer: "Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Tanishk owns this. Settle it?" + both citations + "8 ms, on this device". |
| 92.5 | Red marker underline under "Disputed". |
| 93.5 | Marker circles the email citation (93.5) and the note citation (94.0). |
| 97.5 | Camera pulls out. |

Captions:
- 92.0-95.5: "Ask again: it won't guess. Disputed, with both sources."
- 95.5-97.8: "Who said what, and where."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 90->67, 98->75

### S10 · Beat 7: Lakshya asks, the owner settles · 98.0-108.0 s

Surface: STAGE capture.

| t | key event |
|---|---|
| 98.0 | Camera -> Lakshya's conflict card (z ~1.3). |
| 98.5 | Cursor -> "Ask Tanishk" (Lakshya), arrives 99.3. |
| 99.5 | CLICK (ct 76.5). |
| 100.0 | Draft appears: "Hi Tanishk, two sources disagree on the Sharma wedding edit … Which one is right? - Lakshya" with Open in email / Open in WhatsApp / Copy. |
| 100.5 | Hand note "drafted · nothing sent". |
| 102.0 | Camera -> L_CARD (z ~1.9); cursor -> "Keep 18 Oct", arrives 103.3, hovers. |
| 104.0 | CLICK Keep 18 Oct (ct 81.0). MUSIC: resolve. Card -> "Resolved: 18 Oct · chosen by you"; 16 Oct "Superseded · kept for history". |
| 104.5 | Push "sent 3 claims" on the left link. Light marker strike over "16 Oct" + hand note "kept for history". |
| 105.0 | Lakshya applies the decision (ct 82.0, one second later). Camera pulls WIDE (z ~0.95). |
| 105.5 | Green marker checks on both panes (105.5, 106.0). |

Captions:
- 99.5-102.5: "Lakshya can ask. Only the owner decides."
- 104.0-107.8: "Tanishk keeps the 18th. Everyone has it a second later."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 98->75, 108->85

### S11 · Beat 8: Team view, zero private notes on the hub · 108.0-116.0 s

Surface: STAGE capture.

| t | key event |
|---|---|
| 108.0 | Camera -> L_CLOUD with the Mine / Team view toggle (z ~1.8). |
| 108.5 | Cursor -> "Team view", arrives 109.3. |
| 109.5 | CLICK Team view (ct 86.5). Private (violet) points leave the cloud. |
| 110.0 | Kraft tag with a lock doodle pops where they were: "only on this laptop". |
| 111.0 | Camera -> HUB privacy block (z ~2.0): "Device-only claims on the hub: 0". |
| 111.5 | Marker circle around the 0. |
| 112.5 | Hand note "counted live from Qdrant". |
| 115.5 | Camera pulls far out and travels across the board (transition). |

Captions:
- 109.5-112.5: "Private notes never leave the laptop."
- 112.5-115.8: "Device-only claims on the hub: 0. Counted live."

Capture map (video t -> capture ct, piecewise linear):
- STAGE: 108->85, 116->93

### S12 · How it works: the architecture flow (deck slide 5) · 116.0-128.0 s

Surface: DECK_ARCH capture.

| t | key event |
|---|---|
| 116.0 | Camera lands on the deck page (slide 5) taped to the board. MUSIC: explain section. |
| 116.5 | Tape slap. |
| 117.5 | Cursor -> flow button "Sync and conflict", arrives 118.3. |
| 118.5 | CLICK (ct 2.5). The real slide lights one step every 0.9 s: 118.5 Store, 119.4 Memory, 120.3 Team hub, 121.2 Lakshya's device, 122.1 Conflict engine, 123.0 Browser UI. Camera follows the lit part (z ~1.35). |
| 123.5 | Camera settles on the info panel step list. |
| 124.5 | Hand note on the hub box: "relays only · no logic". |
| 126.0 | Hand note on Lakshya's device: "same code, own shard". |

Captions:
- 116.5-120.0: "Under the hood: every laptop is a full edge node."
- 120.0-124.0: "Qdrant Edge on the laptop. A Qdrant server as the hub."
- 124.0-127.8: "Sync is an outbox. Laptops pull what changed."

Capture map (video t -> capture ct, piecewise linear):
- DECK_ARCH: 116->0, 128->12

### S13 · The key vector and the 0.82 bar · 128.0-138.0 s

Surface: motion graphics (layout and copy from deck slide 9).

| t | key event |
|---|---|
| 128.0 | Camera arrives on a clean board area. |
| 128.5 | Yellow sticky slaps (the call note); blue sticky at 129.0 (the email). |
| 129.5 | Blue marker box around "Sharma delivery" (129.5) and "Sharma wedding edit" (130.0). |
| 130.5 | Grey strike through "the 18th" and "16 October" + hand note "not the value". |
| 131.0 | Key lines write under each sticky: "key: Sharma delivery · due date" (131.0), "key: Sharma wedding edit · due date" (131.5). |
| 132.0 | Ruler draws 0.70 -> 1.00; threshold tick "0.82" at 132.5. |
| 133.0 | Grey dot drops at 0.74, labelled "an unrelated deadline". |
| 134.0 | Red dot rolls to 0.85 (134.0-134.5); label "0.85 · same thing" pops at 134.5; zone above 0.82 hatched in marker blue. |
| 135.5 | Red hand note "different value -> conflict". |
| 136.5 | Sticky slaps: "Ask the owner." |
| 137.5 | Camera starts the move to the next page. |

Captions:
- 128.5-132.0: "The trick: a vector of what a claim is about."
- 132.0-135.5: "Same task, worded differently: 0.85. The bar is 0.82."
- 135.5-137.8: "Same thing, different value: a conflict."

### S14 · Where it is going: a private assistant (deck slides 6 and 7) · 138.0-154.0 s

Surface: DECK_ASSIST + DECK_DAY captures (stills) + motion graphics.

| t | key event |
|---|---|
| 138.0 | Camera lands on DECK_ASSIST (slide 6, stickies hidden variant). MUSIC: vision section. |
| 139.5 | Blue marker ticks beside each input: email 139.5, WhatsApp 140.0, calls and notes 140.5, what you're working on 141.0, the phone in your pocket 141.5. |
| 142.0 | Camera pushes to the "your laptop · Quorum" box (z ~1.5). |
| 143.0 | The four stickies slap in from the full still: hyperfocus nudge 143.0, deadline reminder 143.5, a person 144.0, a pattern 144.5. |
| 145.0 | Slow pan across the stickies. |
| 146.0 | Camera pans right on the board to DECK_DAY (slide 7). |
| 146.5 | Timeline stops reveal with their stickies: morning 146.5, the shoot 147.5, afternoon 148.5, reconnect 149.5, evening 150.5. |
| 151.5 | Marker underline under "Tanishk at BKA, a four-person production house and developer group". |

Captions:
- 138.5-142.0: "Where it's going: a private assistant on every laptop."
- 142.0-146.0: "It knows what you're up to, because nothing leaves your laptop."
- 146.5-150.5: "The direction, not the demo: phone, voice and nudges come next."
- 150.5-153.8: "Only team work is shared. Everything else stays yours."

Capture map (video t -> capture ct, piecewise linear):
- DECK_ASSIST: 138->0, 146.5->0
- DECK_DAY: 146->0, 154->0

### S15 · Close: BKA, per team per month, repo, logo · 154.0-168.0 s

Surface: motion graphics.

| t | key event |
|---|---|
| 154.0 | Camera pulls far out: the whole board with every scene region of the film visible as miniatures. MUSIC: close build. |
| 158.5 | Kraft card slaps: "Customer zero: BKA, a four-person production house and developer group." |
| 159.5 | Eraser swipe clears the centre of the board (the BKA card slides to bottom-left and stays). |
| 160.0 | LOGO HIT: "Q" sticky + "Quorum" wordmark slam in centre. MUSIC: close. |
| 161.0 | "Priced per team, per month · early access" pops under the wordmark. |
| 162.0 | "github.com/ImTani/quorum-edge-memory" writes in blue marker. |
| 163.0 | "Code Cubicle 6.0 · Problem Statement 03 · built on Qdrant Edge" (small, ink-3). |
| 166.0 | Slow push z 1.00 -> 1.03; boil continues. |
| 167.0 | Fade to clean paper by 168.0 (not black). |

Captions:
- 154.5-158.5: "Shared memory for small teams that work where the signal doesn't."

## Capture shot list

Every real-UI scene plays frames from a capture. Captures run **on the server only** (`remote.sh run "node capture.js <SHOT>"`), never locally. Headless Chrome comes from `$CHROME` with `$CHROME_ARGS` plus `--disable-gpu --hide-scrollbars --force-device-scale-factor=2 --allow-file-access-from-files --font-render-hinting=none`. Pages load via `file://`. If ES modules refuse to load from file:// even with `--allow-file-access-from-files`, serve `video/v4` and its siblings from a tiny Node `http` static server bound to 127.0.0.1 **inside the container**, and stop it before exiting. Never start the app, the hub or Ollama.

### Format (all shots; mirrored in `cues.json` -> `captures`)
```
<SHOT>: {
  surface:  stage-replica | landing | deck
  page:     path (file://) [+ #hash]
  viewport: {width:1920, height:1080, deviceScaleFactor:2}
  fps:      30                      # capture frames per capture-second (moving shots)
  ct_end:   seconds to capture      # moving shots; or still:true
  inject_css: optional              # e.g. hide the deck HUD
  actions:  [{ct, do: load|click|type|hover, sel, text?, until?, text_match?, note?}]
  backend:  [{ct, what}]            # stage only: what the fake backend emits, and when
  rects:    [names]                 # element rects to log into meta.json
  output:   clips/<SHOT>/f%05d.jpg  # frame k is ct = k/30; or still.png (+ still_nostk.png)
}
Scene mapping (in each scene, cues.json -> scenes[i].capture_maps):
  <SHOT>: [[vt0, ct0], [vt1, ct1], ...]   piecewise-linear video time -> capture time.
  A flat segment (equal ct) holds a frame; a steep segment is a speed ramp; frame = round(ct*30).
```
`clips/<SHOT>/meta.json`:
```
{ shot, viewport, dsf, fps, frames,
  actions: [{ct, do, sel, rect:{x,y,w,h}}],               # rect in CSS px of the 1920x1080 viewport, at action time
  track:   [{ct, rects:{ "L.switch":{x,y,w,h}, ... }}] }   # every 0.5 s of ct, plus at each action
```
The compositor puts the cursor, ripples and annotations from these rects, so they always land on the real controls.

### Determinism
Capture runs once, in order, on a **virtual clock**. Preferred: CDP `Emulation.setVirtualTimePolicy` advancing 1000/30 ms per frame, then screenshot. That drives timers, rAF and CSS animations. Fallback: inject a time shim before page scripts (`Date`, `performance.now`, `setTimeout`/`setInterval`, `requestAnimationFrame` on a virtual clock) and add `*{transition:none!important;animation:none!important}`, letting the motion-graphics layer supply the micro-motion. Actions fire at their ct with real input events (`page.mouse.move` to the target centre over ~0.3 s ct, then `page.mouse.down/up`; `page.keyboard.type` one character at its ct) so hover, focus and pressed states are real. Encode or keep JPEG q90 frames under `clips/`. Frames are inputs to the final render and are deleted after the final encode.

### STAGE (stage replica, ct 0-93) → S03-S11
- **Build** `video/v4/capture/stage/`: copy `app/web/stage.html`, `stage.js`, `device.js`, `cloud.js`, `styles.css`, `stage.css`, `looks/studio.css` and `looks/fonts/` (copies, never edits to `app/web`). Set `data-look="studio"` on `<html>` (the light look in `.cache/shots/look/beat*.png`). Wire `stage.js` so both panes use `createDeviceUI(root, {variant:'stage', transport})` with transports from **one in-page fake backend** (adapt `app/web/mock.js`: its seed, `mkClaim`, the SSE event shapes from `app/CONTRACT.md`). Replace the hub poll with the fake hub's numbers. Data comes from `app/fixtures/seed.json`, `inbox_lakshya.json` and `demo_inputs.json`. The real stage's captions, beat tracker and link tokens must come out of the same event handlers. Don't fake them separately.
- Viewport 1920x1080 at DSF 2, 30 fps, ct 0 -> 93.0 (2790 frames).
- **Actions** (selectors are real `device.js` / `stage.html` ones):

| ct | action | selector |
|---|---|---|
| 0.0 | load, fonts ready, start clock | |
| 6.0 | click | `[data-pane="right"] .suggestions [data-q="What's due this week?"]` |
| 16.0 | click (hub off) | `[data-pane="left"] [data-el="hub-switch"]` |
| 19.5 | click | `[data-pane="left"] .suggestions [data-q="What's due this week?"]` |
| 23.0 | click | `[data-pane="left"] [data-el="note-input"]` |
| 23.5-26.0 | type, one char per ~46 ms | `Client just called: Sharma delivery moves to the 18th.` |
| 26.5 | click Save | `[data-pane="left"] .note-form button[type="submit"]` |
| 38.0 | click Receive | `[data-pane="right"] [data-receive]` |
| 52.0 | click (hub on) | `[data-pane="left"] [data-el="hub-switch"]` |
| 68.5 | click | `[data-pane="left"] .suggestions [data-q="When is the Sharma delivery?"]` |
| 76.5 | click Ask Tanishk | `[data-pane="right"] [data-action="ask-owner"]` |
| 81.0 | click Keep 18 Oct | `[data-pane="left"] [data-keep]` whose text contains "18 Oct" |
| 86.5 | click Team view | `[data-pane="left"] [data-view="team"]` |

- **Fake backend timeline (ct):**

| ct | emits |
|---|---|
| 0.0 | both online; Tanishk 20 claims (17 team, 2 device, 1 my_devices), Lakshya 20 (17 team, 3 device); Lakshya's inbox holds `eml_sharma_final_delivery`; hub 18, device-only 0; no Sharma due date anywhere |
| 6.0 | Lakshya `/api/ask` -> took_ms **9**, "3 things are due this week: Mehta reel cutdowns (3 of them) on 6 Oct, Ladakh drone permit on 7 Oct and Kapoor invoice on 8 Oct.", 3 citations |
| 16.0 | Tanishk `/api/net {online:false}`: offline status, byte totals freeze, 0 B/s |
| 19.5 | Tanishk `/api/ask` -> took_ms **11** |
| 26.5 -> 31.0 | Tanishk `/api/ingest` note: "Reading…" for 4.5 s, then claim {entity "Sharma delivery", due_date 2026-10-18, "18 Oct", tier team, sync queued, owner tanishk}; Outbox 1; no conflict |
| 38.0 -> 42.5 | Lakshya receive: 4.5 s, then claim {entity "Sharma wedding edit", due_date 2026-10-16, "16 Oct", team, queued, owner tanishk}; Outbox 1 |
| 43.0 | Lakshya push: synced (green), Outbox 0, right-link token "sent 1 claim" |
| 43.5 | hub 19; latest "Sharma wedding edit · 16 Oct · from Lakshya · Team" |
| 52.0 | Tanishk `/api/net {online:true}` |
| 52.25 | Tanishk push: note synced, Outbox 0, left token "sent 1 claim" |
| 52.5 | Tanishk pulls the email; conflict opens (similarity **0.85**, owner tanishk, both disputed); token "pulled 1 claim" |
| 53.0 | Lakshya pulls the note; the **same conflict_id** opens; hub 20 |
| 68.5 | Tanishk `/api/ask` "When is the Sharma delivery?" -> took_ms **8**; "Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. Tanishk owns this. Settle it?"; both citations |
| 76.5 | Lakshya `/api/conflicts/{id}/draft` -> draft text, mailto, wa.me |
| 81.0 | Tanishk resolve, winner = note (18 Oct): winner active, loser superseded, resolution claim |
| 81.5 | Tanishk push: token "sent 3 claims" |
| 82.0 | Lakshya applies it (resolved card, 16 Oct superseded); hub 21, latest "Decision: Sharma wedding edit · 18 Oct" |
| 86.5 | (Team view is client-side) |

- **Rects to log:** L.header, L.switch, L.outbox, L.rate, L.cloud, L.noteInput, L.save, L.suggestDue, L.suggestSharma, L.answer, L.answerTook, L.cites, L.conflictCard, L.keep16, L.keep18, L.viewTeam, L.simTag; R.header, R.cloud, R.inbox, R.receive, R.suggestDue, R.answer, R.answerTook, R.cites, R.conflictCard, R.askOwner, R.draft; HUB.node, HUB.total, HUB.privacy, HUB.device, HUB.recent; LINK.left, LINK.right. Also log the screen positions of the two Sharma points while they're visible, if `cloud.js` exposes a projection. If it doesn't, use the similarity tag rect.
- **Maps** (video -> ct): S03 `26->0, 30->0, 34->4` · S04 `34->4, 44->14` · S05 `44->14, 52->22` · S06 `52->22, 56.5->26.5, 57.5->31, 62->35.5` (4.5x ramp) · S07 `62->35.5, 64.5->38, 65.5->42.5, 72->49` (4.5x ramp) · S08 `72->49, 90->67` · S09 `90->67, 98->75` · S10 `98->75, 108->85` · S11 `108->85, 116->93`.

### LANDING_HERO (site/index.html, ct 0-7) → S02
- Viewport 1920x1080 at DSF 2, scrollY 0, 30 fps. Boil runs on the virtual clock.
- Actions: ct 0 load; ct 5.5 `page.mouse.move` onto "Watch the demo" in the nav (hover only; **never click**, it navigates). The film's click at 24.5 is drawn only.
- Rects: `#hero-title`, `#board`, the "Watch the demo" button, `#early-access`.
- Map: S02 `19->0, 26->7`.

### DECK_ARCH (site/deck.html#5, ct 0-12) → S12
- Viewport 1920x1080 at DSF 2 (the deck scales itself, s = 1.125). Inject `.hud{display:none!important}`.
- Actions: ct 0 load; ct 2.5 click `.flows button[data-flow="sync"]`. The real slide lights a step every 900 ms (Store, Memory, Team hub, Lakshya's device, Conflict engine, Browser UI) and fills the info panel's step list.
- Rects: the flow button, `.comp[data-c="store|memory|hub|lakshya|conflicts|ui"]`, `#arch-info`.
- Map: S12 `116->0, 128->12`.

### DECK_ASSIST (site/deck.html#6, stills) → S14 138-146.5
- Two stills at DSF 2: `still.png` (as is) and `still_nostk.png` (inject `.slide.on .stk{visibility:hidden}`), with the HUD hidden. `meta.json` holds the rect of every `.stk` and `.inp`. The compositor shows `still_nostk`, ticks the `.inp` rows, then slaps each sticky in from its crop of `still.png`.

### DECK_DAY (site/deck.html#7, stills) → S14 146-154
- Same two stills plus rects of every `.stk`, timeline stop dot and lane label. Stops reveal left to right at 146.5 / 147.5 / 148.5 / 149.5 / 150.5.

Reference plates for the replica look: `.cache/shots/look/beat0_start.png` … `beat8_team.png`, `wb_conflict.png`, `wb_conflict2.png`, and `.cache/shots/stage/beat*.png`. The old film `video/out/quorum-v3.mp4` and `video/STORYBOARD.md` are there for ideas (v3's pull-together beam and the "many clouds" pull-out turn into the S08 zoom and the S15 whole-board reveal).

## Sound

- **Music:** 120 BPM, light and tactile. Felt piano or marimba plucks, brushed or light kit, claps, warm pads in the vision section. No EDM drops and no trailer booms except the two hits (76.0 conflict, 160.0 logo). Marks are in `cues.json -> music`; sections are in `music_sections`. The offline stretch (46-72) is low-passed with drums down to a muffled kick. 72-76 is a riser with a one-beat breath at 75.5. 76.0 is the stop-time hit. 104.0 lifts to major.
- **SFX:** every cue is in `cues.json -> sfx` as `{t, type, scene, label, gain?, dur?, variant?}`, 243 cues covering click_down/up, key_tick (one per typed character), toggle_clack, sticky_slap, marker_squeak (one per stroke, with `dur`), paper_whoosh (transitions), disconnect_thud, sync_whoosh, conflict_hit plus alert_chime, resolve_chime, ui_pop, counter_tick and logo_hit. Type descriptions are in `sfx_types`. Mix SFX forward (they're the feel), but let the two music hits (76.0, 160.0) dominate. Duck the music about 3 dB under SFX clusters such as typing.
- Synthesis runs on the server (`python3` with numpy and scipy in the container), adapted from `video/audio/compose.py`, never locally.

## Handoff contract (who reads what)
- **Compositor (index.html / main.js / scenes):** scene ranges, key events, captions and camera framings from this file and `cues.json`. Frames of capture `<SHOT>` at video time vt = `round(map(vt) * 30)`. Cursor, ripples and annotations come from `meta.json` rects.
- **Capture:** the `captures` block. Outputs go under `video/v4/clips/` (gitignored).
- **Audio:** `sfx`, `sfx_types`, `music`, `music_sections`. The output wav goes in `video/v4/audio/` (wav is gitignored).
- **Render:** `render.js` reads CHROME / CHROME_ARGS / RENDER_WORKERS (at most 3), adds `--disable-gpu`, encodes libx264, runs on the server, deletes frames after encoding. Only the final Render-phase agent commits.
