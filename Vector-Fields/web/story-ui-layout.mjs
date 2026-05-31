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
    { id: "theory", index: "01", title: "Theory", root: "C02_Theory", canCalibrate: false },
    { id: "examples", index: "02", title: "Real World", root: "C03_Real_World_Examples", canCalibrate: true },
  ];

  const theoryCards = [
    { id: "definition", index: "01", title: "Definition" },
    { id: "metrics",    index: "02", title: "Field Metrics" },
    { id: "patterns",   index: "03", title: "Analytical Examples" },
  ];

  const examples = [
    { id: "gravity", index: "01", title: "Gravitational Fields", canCalibrate: true },
    { id: "magnetism", index: "02", title: "Magnetism", canCalibrate: true },
    { id: "wind", index: "03", title: "Earth Winds", canCalibrate: true },
    { id: "aerodynamics", index: "04", title: "Aerodynamics", canCalibrate: true },
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
    rect("utility_follow", 900, 34, 260, 86, "utility"),
    rect("utility_fold", 1200, 34, 260, 86, "utility"),
    rect("utility_plane_floor", 900, 138, 260, 86, "utility"),
    rect("utility_plane_front", 1200, 138, 260, 86, "utility"),
    rect("variant_artemis", 90, 524, 1320, 268, "example_variant_artemis"),
    rect("variant_primary", 90, 552, 400, 82, "example_variant"),
    rect("variant_secondary", 550, 552, 400, 82, "example_variant"),
    rect("example_mode_a", 90, 680, 400, 82, "example_mode"),
    rect("example_mode_b", 550, 680, 400, 82, "example_mode"),
    rect("example_mode_c", 1010, 680, 400, 82, "example_mode"),
    rect("example_mode_magnetic_a", 320, 680, 400, 82, "example_mode"),
    rect("example_mode_magnetic_b", 780, 680, 400, 82, "example_mode"),
    rect("card_theory", 90, 270, 640, 650, "card"),
    rect("card_examples", 770, 270, 640, 650, "card"),
    rect("card_definition", 70, 282, 400, 600, "card"),
    rect("card_metrics", 550, 282, 400, 600, "card"),
    rect("card_patterns", 1030, 282, 400, 600, "card"),
    rect("examples_back", 70, 70, 240, 84, "examples_button"),
    rect("example_gravity", 70, 274, 1360, 140, "example_card"),
    rect("example_magnetism", 70, 434, 1360, 140, "example_card"),
    rect("example_wind", 70, 594, 1360, 140, "example_card"),
    rect("example_aerodynamics", 70, 754, 1360, 140, "example_card"),
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
    theoryCards,
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
