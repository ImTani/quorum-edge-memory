/* The stage show, one entry per keypress. Reorder freely: the player plays a `film` step from `film[0]`
 * to `film[1]` in real time and holds; a step that doesn’t continue the previous one fades through paper.
 * `live` steps show the real demo stage (consecutive live steps keep it on screen; Next only moves
 * the presenter’s notes on). `insert` pulls a scene’s own stop list (window.SHOW_STOPS[id]).
 *   title : what the phone remote shows as the step name
 *   say   : talking points (shown large on the phone)
 *   do    : what to click (live steps)
 * Film times are the v4 film’s (cues.json / STORYBOARD.md). */
/* Live-demo camera: rects in the stage’s own 1920x1080 px (measured: header 0-132, left pane x 16-772,
 * hub column x 790-1130, right pane x 1148-1904, panes y 144-1066). The real stage stays clickable when zoomed. */
window.LIVE_FRAMES = {
  WIDE:     null,
  LEFT:     [0, 132, 1140, 940],      // Tanishk’s pane and the link to the hub
  RIGHT:    [780, 132, 1140, 940],    // the hub column and Lakshya’s pane
  L_TOP:    [0, 100, 1000, 600],      // Tanishk’s hub switch, counters and memory cloud
  L_BOTTOM: [16, 680, 756, 390],      // Tanishk’s capture box, ask box and answer
  R_TOP:    [780, 100, 1140, 600],    // hub counts and Lakshya’s Mine/Team view
};

window.SHOW_STEPS = [
  { title: 'Clean board', film: [0, 0],
    say: 'Walk on. Wait for the room. "We’re BKA: four people, a production house and developer group."' },

  { title: 'Two people, two dates', film: [0, 7.0],
    say: '"We talk on Discord. Our clients talk on WhatsApp, because that’s how Indian clients work. Anything official comes by email." Tanishk hears the 18th on a call; Lakshya gets the 16th by email.' },
  { title: 'Nobody notices', film: [7.0, 12.9],
    say: '"So one job’s facts live in three apps and four heads. When a date changes in one of them, nobody else finds out, until the client does."' },
  { title: 'Quorum', film: [12.9, 18.9],
    say: '"Quorum is your team’s memory, on every laptop. It works with no signal. And when two people heard different things, it asks instead of guessing."' },
  { title: 'The promise', film: [18.9, 24.9],
    say: '"Built on Qdrant Edge, for Problem Statement 03. That’s the idea. Now the real thing."' },

  { title: 'LIVE: two laptops, one hub', live: true, frame: 'WIDE',
    do: 'Nothing yet. Point: left pane, hub column, right pane.',
    say: '"This is running live. Left, Tanishk’s laptop, on a shoot. Right, Lakshya’s, at the office. Middle, the team hub: a Qdrant server. Each laptop is its own process with its own Qdrant Edge database. On this stage they share one machine."' },
  { title: 'LIVE: Tanishk loses signal', live: true, frame: 'L_TOP',
    do: 'Tanishk "Connected to hub" switch OFF.',
    say: '"Tanishk loses signal. Here that’s a switch that cuts his link to the hub. [click] Watch his traffic counter: frozen."' },
  { title: 'LIVE: it still answers', live: true, frame: 'L_BOTTOM',
    do: 'Tanishk chip "What’s due this week?"',
    say: '"What’s due this week? [click] [read the ms] milliseconds, with no hub, and every line cites where it came from."' },
  { title: 'LIVE: a note, offline', live: true, frame: 'L_BOTTOM',
    do: 'Tanishk Capture: Ctrl+V the note, Save. Click once.',
    say: '"The client calls him: the Sharma delivery moves to the 18th. [Save] A local model reads it, on the laptop, no cloud. ..."' },
  { title: 'LIVE: queued, not shared', live: true, frame: 'LEFT',
    do: 'Point at the amber point and Outbox 1.',
    say: '"Now it’s a claim with its source: who said it, when, and what it’s about. It waits in his outbox. The hub doesn’t have it."' },
  { title: 'LIVE: the email lands', live: true, frame: 'RIGHT',
    do: 'Lakshya Inbox: Receive. Click once.',
    say: '"Meanwhile Lakshya gets the client’s email: delivery confirmed for the 16th. [Receive] It’s client work, so it goes up to the team hub. ... Two laptops, two dates, one job, and neither knows."' },
  { title: 'LIVE: reconnect (the moment)', live: true, frame: 'WIDE',
    do: 'Say the line FIRST. Then Tanishk switch ON. Point left, then right. 2 s silence.',
    say: '"Watch both laptops when Tanishk gets signal back." [click] ... "Both found the same disagreement, each on its own. Nothing was overwritten. Two different messages, from two different people, and Qdrant matched them because they’re about the same thing."' },
  { title: 'LIVE: it won’t guess', live: true, frame: 'L_BOTTOM',
    do: 'Tanishk chip "When is the Sharma delivery?"',
    say: '"Ask it now. [click] Disputed: the client’s email says the 16th, Tanishk’s note says the 18th. Tanishk owns this. It doesn’t guess."' },
  { title: 'LIVE: the owner decides', live: true, frame: 'WIDE',
    do: 'Point at Lakshya "Waiting for Tanishk". Then Tanishk "Keep 18 Oct".',
    say: '"Only the owner decides. Lakshya can ask him; it drafts the message, never sends on its own. Tanishk keeps the 18th. [click] A second later Lakshya has it. The 16th isn’t deleted; it’s kept as history."' },
  { title: 'LIVE: privacy', live: true, frame: 'R_TOP',
    do: 'Lakshya "Team view". Point at "Device-only claims on the hub: 0".',
    say: '"It reads everything, so privacy is built in. [Team view] Lakshya’s private claims drop out. And the hub counts private claims on the hub, live from Qdrant: zero. Only team work leaves a laptop."' },

  { insert: 'S16', title: 'On the phone', film: [200, 226],
    say: '"Most of this starts on a phone. Clients are on WhatsApp, so getting a chat in is one share."' },

  { title: 'How it works', film: [116, 123.9],
    say: '"How it works. On each laptop a local model turns messages into claims. Each claim is a point in Qdrant Edge with three vectors: meaning, keywords, and a key vector of only what it’s about."' },
  { title: 'The hub only relays', film: [123.9, 127.4],
    say: '"When a claim syncs in, the laptop runs one filtered nearest-neighbour search on that key. The hub relays; it has no logic. Same code on every laptop, each with its own shard."' },
  { title: 'Not the value', film: [127.4, 131.9],
    say: '"The key is the job and the kind of fact, never the value. \'Sharma delivery, due date\' and \'Sharma wedding edit, due date\'."' },
  { title: 'The 0.82 bar', film: [131.9, 137.3],
    say: '"Those two score 0.85. An unrelated deadline is 0.74. Above 0.82 with a different value, that’s a conflict, and its ID is a hash of the two claims, so both laptops agree without talking. Then it asks the owner."' },
  { title: 'Your own layer', film: [137.3, 145.0],
    say: '"And because nothing leaves your laptop unless the team needs it, it can know you: email, WhatsApp, calls and notes, what you’re working on. It can tell you when you’re on the wrong task with a deadline due."' },
  { title: 'A day with Quorum', film: [145.0, 153.8],
    say: '"A day with it: morning brief, the shoot with no signal, the afternoon, reconnect, and the evening."' },
  { title: 'The whole board', film: [153.8, 158.4],
    say: '"Everything you saw: on-device memory and search, local extraction, sync, conflicts caught on both laptops, the owner deciding, private by default."' },
  { title: 'Close', film: [158.4, 165.9],
    say: '"BKA is customer zero. Per team, per month. Quorum: your team’s memory on every laptop, even with no signal. When two people disagree, it asks instead of guessing. Thank you."' },
];
