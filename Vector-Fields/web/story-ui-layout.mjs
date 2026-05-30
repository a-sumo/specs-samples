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
    { id: "motion_fields", index: "02", title: "Motion Fields", root: "C01_Motion_Fields", canCalibrate: false },
    { id: "theory", index: "03", title: "Theory", root: "C02_Theory", canCalibrate: false },
    { id: "examples", index: "04", title: "Real World Examples", root: "C03_Real_World_Examples", canCalibrate: true },
  ];

  const examples = [
    { id: "gravity", index: "01", title: "Gravity", canCalibrate: true },
    { id: "magnetism", index: "02", title: "Magnetism", canCalibrate: true },
    { id: "wind", index: "03", title: "Wind", canCalibrate: true },
  ];

  const slots = [
    rect("title", 70, 62, 780, 116, "title"),
    rect("examples_title", 350, 62, 640, 116, "title"),
    rect("status", 1016, 70, 414, 96, "status"),
    rect("utility_follow", 1008, 70, 190, 76, "utility"),
    rect("utility_fold", 1228, 70, 190, 76, "utility"),
    rect("utility_plane_floor", 1008, 158, 190, 64, "utility"),
    rect("utility_plane_front", 1228, 158, 190, 64, "utility"),
    rect("card_intro", 70, 266, 660, 170, "card"),
    rect("card_motion_fields", 770, 266, 660, 170, "card"),
    rect("card_theory", 70, 474, 660, 170, "card"),
    rect("card_examples", 770, 474, 660, 170, "card"),
    rect("examples_back", 70, 70, 240, 84, "examples_button"),
    rect("example_gravity", 70, 266, 1360, 154, "example_card"),
    rect("example_magnetism", 70, 458, 1360, 154, "example_card"),
    rect("example_wind", 70, 650, 1360, 154, "example_card"),
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
    examples,
    slots,
  };
})();

if (typeof window !== "undefined") {
  window.STORY_UI_LAYOUT = STORY_UI_LAYOUT;
}
