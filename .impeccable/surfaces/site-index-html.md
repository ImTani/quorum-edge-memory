---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

## Scope
Landing page for Quorum (`site/index.html`). Visitor mode: Persuade. Local only, for show; anything that isn't the judged mechanics may be mocked (early-access signup is a mocked success). Audience: Code Cubicle 6.0 judges watching a shared screen, and small field teams (production houses, developer groups). Action: request early access. Proof: the working demo's real mechanics and measured numbers; BKA as customer zero (a four-person production house and developer group).

## Direction contract
THESIS: The team's whiteboard is the product page. The first viewport is a working board on which two laptops and the team hub disagree about a deadline and Quorum circles it; it refuses the category default of a headline over a product screenshot and a feature-card grid. User-pinned: 60% category standard, 40% art; whiteboard and sticky notes.

OWN-WORLD: Cool paper-grey ground (#eef0f3), white nav, ink #14171f. A physical whiteboard: aluminium frame with bevel gradients and dark corner caps, enamel with light sheen, tray holding a blue and a red dry-erase marker and a felt eraser. Canary-yellow and sky-blue stickies with tape strips (no pins or magnets), curled corner shadow. Marker inks: blue #1f4fd8, red #c81e34, green #14895a, black. Kraft envelopes as private pockets with a padlock. Schibsted Grotesk 800 for set type; Shantell Sans for every handwritten mark. All drawing is inline SVG with a stepped line boil (~7 fps), off under reduced motion. No status dots or circles, no pills, no badges.

STORY: A visitor understands in one look that each laptop keeps its own memory, the hub only shares team work, and when two people heard different dates Quorum circles it and asks the owner. They can flip Tanishk off the hub, write a note, reconnect and watch it happen. Below, they read how a claim carries its source, how notes are matched by what they're about, the Sharma afternoon timeline, the privacy zones, the real Qdrant Edge mechanics, BKA, and request early access.

FIRST VIEWPORT: 1440x1000. Nav 72px (sticky-Q logo, four links, Watch the demo, Request early access). Left column 500px: four-line headline "Your team's memory, on every laptop. Even with no signal." with a blue double marker underline and the aside "← yes, even in Ladakh"; lede; email + Request early access (primary action); price line with BKA. Right: the whiteboard, 772x690, three lanes (Tanishk's laptop · Team wall, the hub · Lakshya's laptop) at the conflict moment: both Sharma stickies on the wall inside a red marker loop, "same job · dates disagree!", a marker similarity gauge 0.90 vs 0.82, and an owner card with Keep 18 Oct / Keep 16 Oct. Signature interaction: the board itself (hub switch, writing pad, keep buttons, eraser), invited by the objects, no instruction copy, no media-style controls.

FORM: User-pinned direction (whiteboard / sticky notes) after declining the dealt hand; composition A2 (split hero + board), chosen from three comps. Seed key 61a5f614.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions on record
- Approved comp: .impeccable/mocks/comp-a2.png (sidecar approved; revisions after approval at the user's explicit direction).
- Drawings are inline SVG, not plates, by the user's rule; the hero gate's inline-SVG veto was overridden by the user (build note on the hero phase).
- No shipping rasters.
