import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { STORY_UI_LAYOUT } from "../web/story-ui-layout.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "story-ui-templates.html");
const browserLayoutPath = path.join(root, "web", "story-ui-layout.browser.js");
const outDir = path.join(root, "Assets", "Images", "StoryUI");
const layoutJsonPath = path.join(outDir, "story_ui_layout.json");
const layoutTsPath = path.join(root, "Assets", "Scripts", "StoryGuideLayoutGenerated.ts");

const captures = [
  ["#panel", "chapter_panel.png"],
  ["#examples_panel", "examples_panel.png"],
  ["#example_detail_gravity_panel", "example_detail_gravity_panel.png"],
  ["#example_detail_gravity_artemis_panel", "example_detail_gravity_artemis_panel.png"],
  ["#example_detail_magnetism_panel", "example_detail_magnetism_panel.png"],
  ["#example_detail_wind_panel", "example_detail_wind_panel.png"],
  ["#theory_panel", "theory_panel.png"],
  ["#theory_panel_motion", "theory_panel_motion.png"],
  ...STORY_UI_LAYOUT.steps.map((step) => step.id).flatMap((id) => (
    ["normal", "active", "pressed"].map((state) => [`#card_${id}_${state}`, `card_${id}_${state}.png`])
  )),
  ...STORY_UI_LAYOUT.examples.map((example) => example.id).flatMap((id) => (
    ["normal", "active", "pressed"].map((state) => [`#example_${id}_${state}`, `example_${id}_${state}.png`])
  )),
  ["#nav_back_normal", "nav_back_normal.png"],
  ["#nav_back_pressed", "nav_back_pressed.png"],
  ["#nav_next_normal", "nav_next_normal.png"],
  ["#nav_next_pressed", "nav_next_pressed.png"],
  ["#examples_back_normal", "examples_back_normal.png"],
  ["#examples_back_pressed", "examples_back_pressed.png"],
  ["#utility_follow_on", "utility_follow_on.png"],
  ["#utility_follow_off", "utility_follow_off.png"],
  ["#utility_follow_pressed", "utility_follow_pressed.png"],
  ["#utility_fold_open", "utility_fold_open.png"],
  ["#utility_fold_closed", "utility_fold_closed.png"],
  ["#utility_fold_pressed", "utility_fold_pressed.png"],
  ["#utility_plane_floor_on", "utility_plane_floor_on.png"],
  ["#utility_plane_floor_off", "utility_plane_floor_off.png"],
  ["#utility_plane_floor_pressed", "utility_plane_floor_pressed.png"],
  ["#utility_plane_front_on", "utility_plane_front_on.png"],
  ["#utility_plane_front_off", "utility_plane_front_off.png"],
  ["#utility_plane_front_pressed", "utility_plane_front_pressed.png"],
  ["#variant_normal", "variant_normal.png"],
  ["#variant_active", "variant_active.png"],
  ["#variant_pressed", "variant_pressed.png"],
  ["#variant_artemis_normal", "variant_artemis_normal.png"],
  ["#variant_artemis_active", "variant_artemis_active.png"],
  ["#variant_artemis_pressed", "variant_artemis_pressed.png"],
  ["#overlay_card_hover", "overlay_card_hover.png"],
  ["#overlay_card_selected", "overlay_card_selected.png"],
  ["#overlay_card_pressed", "overlay_card_pressed.png"],
  ["#overlay_example_hover", "overlay_example_hover.png"],
  ["#overlay_example_selected", "overlay_example_selected.png"],
  ["#overlay_example_pressed", "overlay_example_pressed.png"],
  ["#overlay_nav_hover", "overlay_nav_hover.png"],
  ["#overlay_nav_pressed", "overlay_nav_pressed.png"],
  ["#overlay_utility_hover", "overlay_utility_hover.png"],
  ["#overlay_utility_pressed", "overlay_utility_pressed.png"],
  ["#cursor_hover", "cursor_hover.png"],
  ["#cursor_pressed", "cursor_pressed.png"],
  ["#panel_cursor_wash", "panel_cursor_wash.png"],
];

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(browserLayoutPath, `window.STORY_UI_LAYOUT = ${JSON.stringify(STORY_UI_LAYOUT, null, 2)};\n`);

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.storyUiReady === true);
await page.evaluateHandle("document.fonts.ready");

for (const [selector, filename] of captures) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Missing capture target ${selector}`);
  await element.screenshot({
    path: path.join(outDir, filename),
    omitBackground: true,
  });
}

await browser.close();

await fs.writeFile(layoutJsonPath, JSON.stringify(STORY_UI_LAYOUT, null, 2) + "\n");
await fs.writeFile(layoutTsPath, buildLayoutTs(STORY_UI_LAYOUT));

console.log(`Rendered ${captures.length} story UI textures to ${path.relative(root, outDir)}`);
console.log(`Wrote ${path.relative(root, layoutJsonPath)}`);
console.log(`Wrote ${path.relative(root, layoutTsPath)}`);

function buildLayoutTs(spec) {
  const steps = spec.steps.map((step) => {
    const slot = spec.slots.find((s) => s.id === `card_${step.id}`);
    return {
      id: step.id,
      index: step.index,
      title: step.title,
      root: step.root,
      canCalibrate: step.canCalibrate === true,
      slot: slot.cm,
    };
  });
  const examples = spec.examples.map((example) => {
    const slot = spec.slots.find((s) => s.id === `example_${example.id}`);
    return {
      id: example.id,
      index: example.index,
      title: example.title,
      canCalibrate: example.canCalibrate === true,
      slot: slot.cm,
    };
  });
  const theoryModes = spec.theoryModes.map((mode) => {
    const slot = spec.slots.find((s) => s.id === `theory_mode_${mode.id}`);
    return {
      id: mode.id,
      index: mode.index,
      title: mode.title,
      slot: slot.cm,
    };
  });
  const gradientPalettes = spec.gradientPalettes.map((palette) => {
    const slot = spec.slots.find((s) => s.id === `gradient_${palette.id}`);
    return {
      id: palette.id,
      index: palette.index,
      title: palette.title,
      slot: slot.cm,
    };
  });
  const navBack = spec.slots.find((s) => s.id === "nav_back").cm;
  const navNext = spec.slots.find((s) => s.id === "nav_next").cm;
  const progress = spec.slots.find((s) => s.id === "progress").cm;
  const utilityFollow = spec.slots.find((s) => s.id === "utility_follow").cm;
  const utilityFold = spec.slots.find((s) => s.id === "utility_fold").cm;
  const utilityPlaneFloor = spec.slots.find((s) => s.id === "utility_plane_floor").cm;
  const utilityPlaneFront = spec.slots.find((s) => s.id === "utility_plane_front").cm;
  const examplesBack = spec.slots.find((s) => s.id === "examples_back").cm;
  const exampleInfo = spec.slots.find((s) => s.id === "example_info").cm;
  const exampleModes = ["example_mode_a", "example_mode_b", "example_mode_c"].map((id) => spec.slots.find((s) => s.id === id).cm);
  const theoryInfo = spec.slots.find((s) => s.id === "theory_info").cm;
  const variantPrimary = spec.slots.find((s) => s.id === "variant_primary").cm;
  const variantSecondary = spec.slots.find((s) => s.id === "variant_secondary").cm;
  const variantArtemis = spec.slots.find((s) => s.id === "variant_artemis").cm;

  return `// StoryGuideLayoutGenerated.ts\n// Generated by test/render_story_ui.mjs. Edit web/story-ui-layout.mjs instead.\n\nexport type StoryGuideSlot = {\n    x: number;\n    y: number;\n    width: number;\n    height: number;\n};\n\nexport type StoryGuideStep = {\n    id: string;\n    index: string;\n    title: string;\n    root: string;\n    canCalibrate: boolean;\n    slot: StoryGuideSlot;\n};\n\nexport type StoryGuideExample = {\n    id: string;\n    index: string;\n    title: string;\n    canCalibrate: boolean;\n    slot: StoryGuideSlot;\n};\n\nexport type StoryGuideTheoryMode = {\n    id: string;\n    index: string;\n    title: string;\n    slot: StoryGuideSlot;\n};\n\nexport type StoryGuideGradientPalette = {\n    id: string;\n    index: string;\n    title: string;\n    slot: StoryGuideSlot;\n};\n\nexport const STORY_GUIDE_TEXTURE = {\n    widthPx: ${spec.texture.widthPx},\n    heightPx: ${spec.texture.heightPx},\n    widthCm: ${spec.texture.widthCm},\n    heightCm: ${spec.texture.heightCm},\n    pixelsPerCm: ${spec.texture.pixelsPerCm},\n};\n\nexport const STORY_GUIDE_PANEL = {\n    width: ${spec.texture.widthCm},\n    height: ${spec.texture.heightCm},\n};\n\nexport const STORY_GUIDE_STEPS: StoryGuideStep[] = ${JSON.stringify(steps, null, 4)};\n\nexport const STORY_GUIDE_EXAMPLES = {\n    back: ${JSON.stringify(examplesBack)},\n    cards: ${JSON.stringify(examples, null, 4)} as StoryGuideExample[],\n};\n\nexport const STORY_GUIDE_EXAMPLE_DETAIL = {\n    info: ${JSON.stringify(exampleInfo)},\n    modes: ${JSON.stringify(exampleModes, null, 4)} as StoryGuideSlot[],\n};\n\nexport const STORY_GUIDE_THEORY = {\n    info: ${JSON.stringify(theoryInfo)},\n    modes: ${JSON.stringify(theoryModes, null, 4)} as StoryGuideTheoryMode[],\n};\n\nexport const STORY_GUIDE_GRADIENTS = {\n    palettes: ${JSON.stringify(gradientPalettes, null, 4)} as StoryGuideGradientPalette[],\n};\n\nexport const STORY_GUIDE_NAV = {\n    back: ${JSON.stringify(navBack)},\n    next: ${JSON.stringify(navNext)},\n    progress: ${JSON.stringify(progress)},\n};\n\nexport const STORY_GUIDE_UTILITY = {\n    follow: ${JSON.stringify(utilityFollow)},\n    fold: ${JSON.stringify(utilityFold)},\n    planeFloor: ${JSON.stringify(utilityPlaneFloor)},\n    planeFront: ${JSON.stringify(utilityPlaneFront)},\n};\n\nexport const STORY_GUIDE_VARIANTS = {\n    primary: ${JSON.stringify(variantPrimary)},\n    secondary: ${JSON.stringify(variantSecondary)},\n    artemis: ${JSON.stringify(variantArtemis)},\n};\n`;
}
