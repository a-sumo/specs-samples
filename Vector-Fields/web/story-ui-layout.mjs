export const STORY_UI_LAYOUT = (() => {
  const texture = {
    widthPx: 1500,
    heightPx: 1000,
    widthCm: 30,
    heightCm: 20,
    pixelsPerCm: 50,
  };

  const rect = (id, x, y, width, height, role = "slot") => ({
    id,
    role,
    px: { x, y, width, height },
    cm: {
      x: (x + width * 0.5 - texture.widthPx * 0.5) / texture.pixelsPerCm,
      y: (texture.heightPx * 0.5 - (y + height * 0.5)) / texture.pixelsPerCm,
      width: width / texture.pixelsPerCm,
      height: height / texture.pixelsPerCm,
    },
  });

  const steps = [
    { id: "intro", index: "01", title: "Intro", root: "C00_Intro", canCalibrate: false },
    { id: "theory", index: "02", title: "Theory", root: "C02_Theory", canCalibrate: false },
    { id: "examples", index: "03", title: "Examples", root: "C03_Real_World_Examples", canCalibrate: true },
  ];

  const examples = [
    { id: "gravity", index: "01", title: "Gravitational Fields", canCalibrate: true },
    { id: "magnetism", index: "02", title: "Magnetism", canCalibrate: true },
    { id: "wind", index: "03", title: "Wind", canCalibrate: true },
  ];

  const theoryModes = [
    { id: "expansion", index: "01", title: "Expansion" },
    { id: "contraction", index: "02", title: "Contraction" },
    { id: "curl", index: "03", title: "Curl" },
    { id: "motion", index: "04", title: "Motion" },
  ];

  const gradientPalettes = [
    { id: "jet", index: "01", title: "Jet" },
    { id: "viridis", index: "02", title: "Viridis" },
    { id: "plasma", index: "03", title: "Plasma" },
  ];

  const gradientSlots = gradientPalettes.map((palette, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return rect(`gradient_${palette.id}`, 604 + col * 344, 460 + row * 104, 314, 80, "gradient_palette");
  });

  const slots = [
    rect("title", 70, 62, 780, 116, "title"),
    rect("examples_title", 350, 54, 640, 100, "title"),
    rect("example_detail_title", 350, 54, 640, 100, "title"),
    rect("theory_title", 430, 54, 640, 100, "title"),
    rect("status", 1016, 70, 414, 96, "status"),
    rect("utility_follow", 1008, 70, 190, 76, "utility"),
    rect("utility_fold", 1228, 70, 190, 76, "utility"),
    rect("utility_plane_floor", 1008, 158, 190, 64, "utility"),
    rect("utility_plane_front", 1228, 158, 190, 64, "utility"),
    rect("variant_artemis", 90, 524, 1320, 268, "example_variant_artemis"),
    rect("variant_primary", 90, 552, 400, 82, "example_variant"),
    rect("variant_secondary", 550, 552, 400, 82, "example_variant"),
    rect("example_mode_a", 90, 680, 400, 82, "example_mode"),
    rect("example_mode_b", 550, 680, 400, 82, "example_mode"),
    rect("example_mode_c", 1010, 680, 400, 82, "example_mode"),
    rect("card_intro", 70, 300, 400, 250, "card"),
    rect("card_theory", 550, 300, 400, 250, "card"),
    rect("card_examples", 1030, 300, 400, 250, "card"),
    rect("examples_back", 70, 70, 240, 84, "examples_button"),
    rect("example_gravity", 70, 290, 1360, 140, "example_card"),
    rect("example_magnetism", 70, 474, 1360, 140, "example_card"),
    rect("example_wind", 70, 658, 1360, 140, "example_card"),
    rect("example_info", 90, 292, 1320, 210, "example_info"),
    rect("theory_mode_expansion", 170, 312, 250, 76, "theory_mode"),
    rect("theory_mode_contraction", 470, 312, 250, 76, "theory_mode"),
    rect("theory_mode_curl", 770, 312, 250, 76, "theory_mode"),
    rect("theory_mode_motion", 1070, 312, 250, 76, "theory_mode"),
    rect("theory_info", 76, 452, 444, 336, "theory_info"),
    ...gradientSlots,
    rect("progress", 390, 816, 720, 112, "progress"),
    rect("nav_back", 70, 816, 260, 112, "button"),
    rect("nav_next", 1170, 816, 260, 112, "button"),
  ];

  return {
    version: 1,
    texture,
    panel: {
      cornerRadiusPx: 0,
      cornerRadiusCm: 0,
      paddingPx: 70,
      paddingCm: 70 / texture.pixelsPerCm,
      cardGapPx: { x: 40, y: 30 },
      cardGapCm: { x: 40 / texture.pixelsPerCm, y: 30 / texture.pixelsPerCm },
    },
    steps,
    examples,
    theoryModes,
    gradientPalettes,
    slots,
  };
})();

if (typeof window !== "undefined") {
  window.STORY_UI_LAYOUT = STORY_UI_LAYOUT;
}
