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
    { id: "intro", index: "01", title: "Intro", root: "C00_Intro_Field_Basics" },
    { id: "definition", index: "02", title: "Definition", root: "C01_Math_Definition" },
    { id: "motion", index: "03", title: "Motion", root: "C02_Motion_Field_Plane" },
    { id: "patterns", index: "04", title: "Patterns", root: "C02_Transition_Field_Cubes" },
    { id: "metrics", index: "05", title: "Metrics", root: "C02_Metrics_Probe" },
    { id: "examples", index: "06", title: "Three fields", root: "C03_Three_Fields_Gravity_Magnetism_Wind" },
  ];

  const slots = [
    rect("title", 70, 62, 780, 116, "title"),
    rect("status", 1016, 70, 414, 96, "status"),
    rect("utility_follow", 1008, 70, 190, 76, "utility"),
    rect("utility_fold", 1228, 70, 190, 76, "utility"),
    rect("card_intro", 70, 230, 660, 136, "card"),
    rect("card_definition", 770, 230, 660, 136, "card"),
    rect("card_motion", 70, 396, 660, 136, "card"),
    rect("card_patterns", 770, 396, 660, 136, "card"),
    rect("card_metrics", 70, 562, 660, 136, "card"),
    rect("card_examples", 770, 562, 660, 136, "card"),
    rect("progress", 390, 816, 720, 112, "progress"),
    rect("nav_back", 70, 816, 260, 112, "button"),
    rect("nav_next", 1170, 816, 260, 112, "button"),
  ];

  return {
    version: 1,
    texture,
    panel: {
      cornerRadiusPx: 64,
      cornerRadiusCm: 64 / texture.pixelsPerCm,
      paddingPx: 70,
      paddingCm: 70 / texture.pixelsPerCm,
      cardGapPx: { x: 40, y: 30 },
      cardGapCm: { x: 40 / texture.pixelsPerCm, y: 30 / texture.pixelsPerCm },
    },
    steps,
    slots,
  };
})();

if (typeof window !== "undefined") {
  window.STORY_UI_LAYOUT = STORY_UI_LAYOUT;
}
