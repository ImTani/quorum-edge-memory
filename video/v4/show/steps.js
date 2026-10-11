/* The stage show, one entry per keypress. Reorder freely: the player plays a `film` step from `film[0]`
 * to `film[1]` in real time and holds; a step that doesn’t continue the previous one fades through paper.
 * `live` steps show the real demo stage (consecutive live steps keep it on screen; Next only moves
 * the presenter’s notes on). `insert` pulls a scene’s own stop list (window.SHOW_STOPS[id]).
 *   title : what the phone remote shows as the step name
 *   say   : talking points (shown large on the phone)
 *   do    : the operator's cue (live steps): a teammate drives the real app on the laptop by hand
 * Film times are the v4 film’s (cues.json / STORYBOARD.md). */
window.SHOW_STEPS = [
  { title: 'Clean board', film: [240, 240],
    say: 'Walk on. Wait for the room. Then Next.' },

  { insert: 'S17', title: 'BKA', film: [240, 262], upTo: 259.5,     // its last stop (the eraser) leads into S01 below
    say: '"We’re BKA: four people, a production house and developer group."' },

  { title: 'Two people, two dates', film: [0, 7.0], lead: [259.5, 261.5, 'S17'],
    say: '"Here’s what that costs. Tanishk is on a shoot with no signal. The client calls him: the delivery moves to the 18th. Lakshya, at the office, has the client’s email: the 16th."' },
  { title: 'Nobody notices', film: [7.0, 12.9],
    say: '"Two people, two dates, for the same job. Neither knows about the other. Nobody notices, until the client does."' },
  { title: 'Quorum', film: [12.9, 18.9],
    say: '"Quorum is your team’s memory, on every laptop. It works with no signal. And when two people heard different things, it asks instead of guessing."' },
  { title: 'The promise', film: [18.9, 24.9],
    say: '"Built on Qdrant Edge, for Problem Statement 03. That’s the idea. Now the real thing."' },

  { title: 'LIVE: two laptops, one hub', live: true,
    do: 'Operator: hands off while Tanishk orients. Then slowly drag Tanishk’s memory cloud, so it’s clearly live.',
    say: '"This is running live. Left, Tanishk’s laptop, on a shoot. Right, Lakshya’s, at the office. Middle, the team hub: a Qdrant server. Each laptop is its own process with its own Qdrant Edge database. On this stage they share one machine."' },
  { title: 'LIVE: Tanishk loses signal', live: true,
    do: 'Operator: on “Here that’s a switch…”, flip Tanishk’s “Connected to hub” OFF.',
    say: '"Tanishk loses signal. Here that’s a switch that cuts his link to the hub. [click] Watch his traffic counter: frozen."' },
  { title: 'LIVE: it still answers', live: true,
    do: 'Operator: on “What’s due this week?”, click Tanishk’s chip “What’s due this week?”.',
    say: '"What’s due this week? [click] [read the ms] milliseconds, with no hub, and every line cites where it came from."' },
  { title: 'LIVE: a note, offline', live: true,
    do: 'Operator: on “…moves to the 18th”, click Tanishk’s note box, Ctrl+V, Save. Once; it reads for a few seconds.',
    say: '"The client calls him: the Sharma delivery moves to the 18th. [Save] A local model reads it, on the laptop, no cloud. ... Now it’s a claim with its source, waiting in his outbox. The hub doesn’t have it."' },
  { title: 'LIVE: the email lands', live: true,
    do: 'Operator: on “…confirmed for the 16th”, click Receive in Lakshya’s inbox. Once.',
    say: '"Meanwhile Lakshya gets the client’s email: delivery confirmed for the 16th. [Receive] It’s client work, so it goes up to the team hub. ... Two laptops, two dates, one job, and neither knows."' },
  { title: 'LIVE: reconnect (the moment)', live: true,
    do: 'Operator: wait for “Watch both laptops…”, then flip Tanishk’s switch ON. Hands off for 2 s.',
    say: '"Watch both laptops when Tanishk gets signal back." [click] ... "Both found the same disagreement, each on its own. Nothing was overwritten. Two different messages, from two different people, and Qdrant matched them because they’re about the same thing."' },
  { title: 'LIVE: it won’t guess', live: true,
    do: 'Operator: on “Ask it now”, click Tanishk’s chip “When is the Sharma delivery?”.',
    say: '"Ask it now. [click] Disputed: the client’s email says the 16th, Tanishk’s note says the 18th. Tanishk owns this. It doesn’t guess."' },
  { title: 'LIVE: the owner decides', live: true,
    do: 'Operator: hover Lakshya’s “Waiting for Tanishk”. On “Tanishk keeps the 18th”, click “Keep 18 Oct” on Tanishk’s card.',
    say: '"Only the owner decides. Lakshya can ask him; it drafts the message, never sends on its own. Tanishk keeps the 18th. [click] A second later Lakshya has it. The 16th isn’t deleted; it’s kept as history."' },
  { title: 'LIVE: privacy', live: true,
    do: 'Operator: on “Team view”, click Lakshya’s “Team view”. Then hover the hub’s “Device-only claims on the hub: 0”.',
    say: '"It reads everything, so privacy is built in. [Team view] Lakshya’s private claims drop out. And the hub counts private claims on the hub, live from Qdrant: zero. Only team work leaves a laptop."' },

  { title: 'BACKUP: the recorded conflict', film: [72, 98], skip: true,
    do: 'Only if the live conflict failed. Jump here from Steps; Next continues with the phone.',
    say: '"Live demos. Here’s the same moment, recorded on this laptop: both found the same disagreement on their own, and it asks instead of guessing."' },

  { insert: 'S16', title: 'On the phone', film: [200, 226],
    say: '"Most of this starts on a phone. Clients are on WhatsApp, so getting a chat in is one share."' },

  { title: 'How it works', film: [116, 127.4],
    say: '"How it works. On each laptop a local model turns messages into claims. Each claim is a point in Qdrant Edge with three vectors: meaning, keywords, and a key vector of only what it’s about. When a claim syncs in, the laptop runs one filtered search on that key. The hub only relays."' },
  { title: 'Not the value', film: [127.4, 132.0],
    say: '"The key is the job and the kind of fact, never the value. \'Sharma delivery, due date\' and \'Sharma wedding edit, due date\'."' },
  { title: 'The 0.82 bar', film: [132.0, 137.3],
    say: '"Those two score 0.85. An unrelated deadline is 0.74. Above 0.82 with a different value, that’s a conflict, and its ID is a hash of the two claims, so both laptops agree without talking. Then it asks the owner."' },
  { title: 'Your own layer', film: [137.3, 145.9],
    say: '"And because nothing leaves your laptop unless the team needs it, it can know you: email, WhatsApp, calls and notes, what you’re working on. It can tell you when you’re on the wrong task with a deadline due."' },
  { insert: 'S18', title: 'Where it goes next', film: [280, 304],
    say: '"Where it goes next."' },

  { title: 'Close', film: [153.8, 165.9],
    say: '"Everything you saw runs on the laptops: memory, search, extraction, sync, and conflicts caught on both. BKA is customer zero, priced per team, per month. Quorum: your team’s memory on every laptop, even with no signal. When two people disagree, it asks instead of guessing. Thank you."' },
];
