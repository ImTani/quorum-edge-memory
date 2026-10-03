/* Fixture: the STAGE plate (the stage replica capture) pinned to the board in region STAGE.
 * Shared by S03-S11: those scenes use region 'STAGE' too, so plate rects are already in their
 * root's coordinates (window.STAGE_PLATE.rect(name, t)). Its frame follows the joined STAGE capture
 * maps of every scene in cues.json (globalMap('STAGE')): ct 0 is held before 26 s, ct 93 after 116 s. */
(function () {
  Fixture({
    id: 'STAGE_PLATE', region: 'STAGE', z: 2,
    build(root) {
      window.STAGE_PLATE = screenFrame({ parent: root, world: REGIONS.STAGE, clip: 'STAGE', x: 0, y: 0, w: 1920, chrome: 'card', tape: true });
    },
    render(t) { STAGE_PLATE.render(t); },
  });
})();
