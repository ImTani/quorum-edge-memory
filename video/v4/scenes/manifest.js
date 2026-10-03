/* Scene files loaded by index.html, in this order (names without .js). Fixtures (shared things such as
 * the STAGE plate) come first, then the scene kit (helpers, not a scene), then S01-S15. Later files sit
 * higher on the board (z). DEMO_FILES load only with ?demo=1 (render.js --demo); empty now (the framework samples were
 * removed once the real S01/S04 existed). */
window.SCENE_FILES = ['_stage_plate', '_kit',
  'S01_cold_open', 'S02_title', 'S03_stage_setup', 'S04_beat1_ask', 'S05_beat2_offline', 'S06_beat3_note',
  'S07_beat4_email', 'S08_beat5_conflict', 'S09_beat6_disputed', 'S10_beat7_settle', 'S11_beat8_privacy',
  'S12_how_it_works', 'S13_key_vector', 'S14_vision', 'S15_close'];
window.DEMO_FILES = [];
