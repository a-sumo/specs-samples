// VectorFieldsChapterGuide.ts
// Texture-backed chapter guide with UIKit hit targets.

import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { GFS_META } from "./GfsData";
import { STORY_GUIDE_EXAMPLE_DETAIL, STORY_GUIDE_EXAMPLES, STORY_GUIDE_GRADIENTS, STORY_GUIDE_NAV, STORY_GUIDE_PANEL, STORY_GUIDE_THEORY, STORY_GUIDE_THEORY_CARDS, STORY_GUIDE_UTILITY, STORY_GUIDE_VARIANTS } from "./StoryGuideLayoutGenerated";
import { STORMS, STORMS_DATA_MODE, STORMS_FETCHED_AT, STORMS_SOURCE, STORMS_USING_FALLBACK, Storm } from "./StormsData";

type StoryGuideSlot = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const GUIDE_STEPS: { id: string; index: string; title: string; canCalibrate: boolean; slot: StoryGuideSlot }[] = [
    {
        id: "theory",
        index: "01",
        title: "Theory",
        canCalibrate: false,
        slot: { x: -6.8, y: -1.9, width: 12.8, height: 13.0 },
    },
    {
        id: "examples",
        index: "02",
        title: "Real World",
        canCalibrate: true,
        slot: { x: 6.8, y: -1.9, width: 12.8, height: 13.0 },
    },
];

type ExampleFieldId = "gravity" | "magnetism" | "wind" | "aerodynamics";
type GravityExampleVariant = "field" | "artemis";
type WindExampleVariant = "globe" | "car_flow";
type ExampleVariantId = "gravity:field" | "gravity:artemis";
type ExampleModeId = "gravity:bodies" | "gravity:arrows" | "gravity:lines" | "magnetism:trails" | "magnetism:arrows" | "wind:trails" | "wind:points" | "wind:arrows";
type TheoryFieldModeId = "expansion" | "contraction" | "curl" | "motion";
type GradientPaletteId = "jet" | "viridis" | "plasma";

type ImageBinding = {
    object: SceneObject;
    component: Image;
    material: Material;
    width: number;
    height: number;
    z: number;
};

type ButtonBinding = {
    id: string;
    object: SceneObject;
    image: ImageBinding;
    overlay: ImageBinding;
    normal: Texture;
    active: Texture;
    pressed: Texture;
    hoverOverlay: Texture | null;
    selectedOverlay: Texture | null;
    pressedOverlay: Texture | null;
    slot: StoryGuideSlot;
    homeSlot: StoryGuideSlot;
    targetSlot: StoryGuideSlot;
    button: RectangleButton;
    hitWidth: number;
    hitHeight: number;
    hitDepth: number;
    hovered: boolean;
    pressedState: boolean;
    selected: boolean;
    visualScale: number;
    targetScale: number;
    visualLift: number;
    targetLift: number;
    label: Text | null;
    cursorEventsBound?: boolean;
    actionButtonEventBound?: boolean;
    actionInteractableEventBound?: boolean;
    lastActionTime?: number;
    moveEventsBound?: boolean;
};

type GradientSliderId = "scale" | "offset";
type MagneticSliderId = "mag_power" | "mag_pull" | "mag_length" | "mag_speed";
type ControlSliderId = GradientSliderId | MagneticSliderId;

type GradientSliderBinding = {
    id: ControlSliderId;
    object: SceneObject;
    button: RectangleButton;
    slot: StoryGuideSlot;
    backplate: ImageBinding;
    track: ImageBinding;
    fill: ImageBinding;
    knob: ImageBinding;
    label: Text;
    valueLabel: Text;
    min: number;
    max: number;
    step: number;
    value: number;
    hovered: boolean;
    pressed: boolean;
};

type WindEventCardBinding = {
    stormIndex: number;
    button: ButtonBinding;
    title: Text;
    detail: Text;
};

type ColliderBinding = {
    collider: ColliderComponent;
    enabled: boolean;
};

type ExampleFieldOption = {
    id: ExampleFieldId;
    label: string;
    slot: StoryGuideSlot;
};

type ExampleVariantOption = {
    id: ExampleVariantId;
    field: ExampleFieldId;
    label: string;
    slot: StoryGuideSlot;
};

type ExampleModeOption = {
    id: ExampleModeId;
    field: ExampleFieldId;
    label: string;
    mode: number;
    slot: StoryGuideSlot;
};

type TheoryFieldOption = {
    id: TheoryFieldModeId;
    label: string;
    index: number;
    preset: number;
    divergence: string;
    curl: string;
    slot: StoryGuideSlot;
};

type GradientPaletteOption = {
    id: GradientPaletteId;
    label: string;
    index: number;
    slot: StoryGuideSlot;
};

const IMAGE_MATERIAL = requireAsset("../Image.mat") as Material;
const GUIDE_FONT = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;
const TEX_PANEL_MAIN = requireAsset("../Images/StoryUI/chapter_panel_main_v3.png") as Texture;
const TEX_PANEL_EXAMPLES = requireAsset("../Images/StoryUI/examples_panel.png") as Texture;
const TEX_PANEL_THEORY = requireAsset("../Images/StoryUI/theory_panel.png") as Texture;
const EXAMPLE_DETAIL_PANEL_TEXTURES: { [key: string]: Texture } = {
    gravity: requireAsset("../Images/StoryUI/example_detail_gravity_panel.png") as Texture,
    magnetism: requireAsset("../Images/StoryUI/example_detail_magnetism_panel.png") as Texture,
    wind: requireAsset("../Images/StoryUI/example_detail_wind_panel.png") as Texture,
    aerodynamics: requireAsset("../Images/StoryUI/example_detail_aerodynamics_panel.png") as Texture,
};
const TEX_PANEL_GRAVITY_ARTEMIS = requireAsset("../Images/StoryUI/example_detail_gravity_artemis_panel.png") as Texture;

const CARD_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    intro: {
        normal: requireAsset("../Images/StoryUI/card_intro_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_intro_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_intro_pressed.png") as Texture,
    },
    theory: {
        normal: requireAsset("../Images/StoryUI/card_theory_main_v3_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_theory_main_v3_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_theory_main_v3_pressed.png") as Texture,
    },
    examples: {
        normal: requireAsset("../Images/StoryUI/card_examples_main_v3_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_examples_main_v3_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_examples_main_v3_pressed.png") as Texture,
    },
};

const THEORY_CARD_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    definition: {
        normal: requireAsset("../Images/StoryUI/card_definition_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_definition_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_definition_pressed.png") as Texture,
    },
    metrics: {
        normal: requireAsset("../Images/StoryUI/card_metrics_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_metrics_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_metrics_pressed.png") as Texture,
    },
    patterns: {
        normal: requireAsset("../Images/StoryUI/card_patterns_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_patterns_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_patterns_pressed.png") as Texture,
    },
};

const MATH_EXPLAINER_TEXTURES: Texture[] = [
    requireAsset("../Images/StoryUI/math_explainer_del_intro.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_operator.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_del_coordinates.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_divergence.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_divergence_example.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_curl.png") as Texture,
    requireAsset("../Images/StoryUI/math_explainer_curl_example.png") as Texture,
];

const VF_DEFINITION_TEXTURES: Texture[] = [
    requireAsset("../Images/StoryUI/vf_def_scalar_to_vector.png") as Texture,
    requireAsset("../Images/StoryUI/vf_def_vf_informal.png") as Texture,
    requireAsset("../Images/StoryUI/vf_def_vf_formal.png") as Texture,
    requireAsset("../Images/StoryUI/vf_def_vf_examples.png") as Texture,
    requireAsset("../Images/StoryUI/vf_def_vf_gradient.png") as Texture,
];

// Full-width slot covering the entire lower content area of the theory panel.
const THEORY_FULL_PANEL_SLOT: StoryGuideSlot = { x: 0, y: -2.04, width: 26.4, height: 8.56 };

const EXAMPLE_CARD_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    gravity: {
        normal: requireAsset("../Images/StoryUI/example_gravity_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/example_gravity_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/example_gravity_pressed.png") as Texture,
    },
    magnetism: {
        normal: requireAsset("../Images/StoryUI/example_magnetism_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/example_magnetism_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/example_magnetism_pressed.png") as Texture,
    },
    wind: {
        normal: requireAsset("../Images/StoryUI/example_wind_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/example_wind_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/example_wind_pressed.png") as Texture,
    },
    aerodynamics: {
        normal: requireAsset("../Images/StoryUI/example_aerodynamics_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/example_aerodynamics_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/example_aerodynamics_pressed.png") as Texture,
    },
};

const TEX_NAV_BACK_NORMAL = requireAsset("../Images/StoryUI/nav_back_normal.png") as Texture;
const TEX_NAV_BACK_PRESSED = requireAsset("../Images/StoryUI/nav_back_pressed.png") as Texture;
const TEX_NAV_NEXT_NORMAL = requireAsset("../Images/StoryUI/nav_next_normal.png") as Texture;
const TEX_NAV_NEXT_PRESSED = requireAsset("../Images/StoryUI/nav_next_pressed.png") as Texture;
const TEX_EXAMPLES_BACK_NORMAL = requireAsset("../Images/StoryUI/examples_back_normal.png") as Texture;
const TEX_EXAMPLES_BACK_PRESSED = requireAsset("../Images/StoryUI/examples_back_pressed.png") as Texture;
const TEX_UTILITY_FOLLOW_ON = requireAsset("../Images/StoryUI/utility_follow_on.png") as Texture;
const TEX_UTILITY_FOLLOW_OFF = requireAsset("../Images/StoryUI/utility_follow_off.png") as Texture;
const TEX_UTILITY_FOLLOW_PRESSED = requireAsset("../Images/StoryUI/utility_follow_pressed.png") as Texture;
const TEX_UTILITY_FOLD_OPEN = requireAsset("../Images/StoryUI/utility_fold_open.png") as Texture;
const TEX_UTILITY_FOLD_CLOSED = requireAsset("../Images/StoryUI/utility_fold_closed.png") as Texture;
const TEX_UTILITY_FOLD_PRESSED = requireAsset("../Images/StoryUI/utility_fold_pressed.png") as Texture;
const TEX_UTILITY_RESET_NORMAL = requireAsset("../Images/StoryUI/utility_plane_floor_on.png") as Texture;
const TEX_UTILITY_RESET_PRESSED = requireAsset("../Images/StoryUI/utility_plane_floor_pressed.png") as Texture;
const TEX_UTILITY_PLANE_FRONT_ON = requireAsset("../Images/StoryUI/utility_plane_front_on.png") as Texture;
const TEX_UTILITY_PLANE_FRONT_OFF = requireAsset("../Images/StoryUI/utility_plane_front_off.png") as Texture;
const TEX_UTILITY_PLANE_FRONT_PRESSED = requireAsset("../Images/StoryUI/utility_plane_front_pressed.png") as Texture;
const TEX_UTILITY_MOVE_NORMAL = requireAsset("../Images/StoryUI/utility_move_normal.png") as Texture;
const TEX_UTILITY_MOVE_ACTIVE = requireAsset("../Images/StoryUI/utility_move_active.png") as Texture;
const TEX_UTILITY_MOVE_PRESSED = requireAsset("../Images/StoryUI/utility_move_pressed.png") as Texture;
const TEX_VARIANT_NORMAL = requireAsset("../Images/StoryUI/variant_normal.png") as Texture;
const TEX_VARIANT_ACTIVE = requireAsset("../Images/StoryUI/variant_active.png") as Texture;
const TEX_VARIANT_PRESSED = requireAsset("../Images/StoryUI/variant_pressed.png") as Texture;
const VARIANT_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    "gravity:artemis": {
        normal: requireAsset("../Images/StoryUI/variant_artemis_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/variant_artemis_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/variant_artemis_pressed.png") as Texture,
    },
};
const THEORY_MODE_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    expansion: {
        normal: requireAsset("../Images/StoryUI/theory_mode_expansion_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/theory_mode_expansion_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/theory_mode_expansion_pressed.png") as Texture,
    },
    contraction: {
        normal: requireAsset("../Images/StoryUI/theory_mode_contraction_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/theory_mode_contraction_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/theory_mode_contraction_pressed.png") as Texture,
    },
    curl: {
        normal: requireAsset("../Images/StoryUI/theory_mode_curl_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/theory_mode_curl_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/theory_mode_curl_pressed.png") as Texture,
    },
    motion: {
        normal: requireAsset("../Images/StoryUI/theory_mode_motion_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/theory_mode_motion_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/theory_mode_motion_pressed.png") as Texture,
    },
};
const THEORY_INFO_TEXTURES: { [key: string]: Texture } = {
    expansion: requireAsset("../Images/StoryUI/theory_field_panel_expansion.png") as Texture,
    contraction: requireAsset("../Images/StoryUI/theory_field_panel_contraction.png") as Texture,
    curl: requireAsset("../Images/StoryUI/theory_field_panel_curl.png") as Texture,
    motion: requireAsset("../Images/StoryUI/theory_field_panel_motion.png") as Texture,
};

const PALETTE_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    jet: {
        normal: requireAsset("../Images/StoryUI/palette_jet_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/palette_jet_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/palette_jet_pressed.png") as Texture,
    },
    viridis: {
        normal: requireAsset("../Images/StoryUI/palette_viridis_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/palette_viridis_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/palette_viridis_pressed.png") as Texture,
    },
    plasma: {
        normal: requireAsset("../Images/StoryUI/palette_plasma_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/palette_plasma_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/palette_plasma_pressed.png") as Texture,
    },
};
const TEX_CARD_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_card_hover.png") as Texture;
const TEX_CARD_OVERLAY_SELECTED = requireAsset("../Images/StoryUI/overlay_card_selected.png") as Texture;
const TEX_CARD_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_card_pressed.png") as Texture;
const TEX_EXAMPLE_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_example_hover.png") as Texture;
const TEX_EXAMPLE_OVERLAY_SELECTED = requireAsset("../Images/StoryUI/overlay_example_selected.png") as Texture;
const TEX_EXAMPLE_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_example_pressed.png") as Texture;
const TEX_NAV_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_nav_hover.png") as Texture;
const TEX_NAV_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_nav_pressed.png") as Texture;
const TEX_UTILITY_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_utility_hover.png") as Texture;
const TEX_UTILITY_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_utility_pressed.png") as Texture;
const TEX_CURSOR_HOVER = requireAsset("../Images/StoryUI/cursor_hover.png") as Texture;
const TEX_CURSOR_PRESSED = requireAsset("../Images/StoryUI/cursor_pressed.png") as Texture;
const TEX_SLIDER_BACKPLATE = requireAsset("../Images/StoryUI/slider_backplate.png") as Texture;
const TEX_SLIDER_TRACK = requireAsset("../Images/StoryUI/slider_track.png") as Texture;
const TEX_SLIDER_FILL = requireAsset("../Images/StoryUI/slider_fill.png") as Texture;
const TEX_SLIDER_KNOB = requireAsset("../Images/StoryUI/slider_knob.png") as Texture;
const BUTTON_HIT_Z = 0.34;
const BUTTON_HIT_DEPTH_CM = 2.4;
const UTILITY_HIT_PAD_CM = 0.3;
const FOLDED_UTILITY_HIT_PAD_CM = 1.15;
const PANEL_HIT_Z = 0.04;
const PANEL_HIT_DEPTH_CM = 0.42;
const MAIN_EXPERIENCE_RENDER_ORDER = 520;
const MAIN_EXPERIENCE_RENDER_ORDER_SPAN = 90;
const MENU_MOVE_HANDLE_SLOT: StoryGuideSlot = { x: 17.15, y: 7.32, width: 4.0, height: 4.0 };
// When folded the panel border is hidden and the utility controls collapse into a
// single row aligned with Follow/Fold (Reset hides): Follow, Fold, Proxy, then the
// move handle. The proxy and handle tween up from the 2x2 grid into that row.
const MENU_MOVE_HANDLE_SLOT_FOLDED: StoryGuideSlot = { x: 22.75, y: 8.46, width: 4.0, height: 4.0 };
const PROXY_SLOT_FOLDED: StoryGuideSlot = { x: 17.1, y: 8.46, width: 5.2, height: 1.72 };

const INTERACTION_ISOLATION_ROOTS = [
    "Motion Field Root",
    "Vector Field Examples Root",
    "Magnetic Field Root",
    "Gravity Field Root",
    "Globe Calibration",
    "Globe Spin-Lock Button",
    "Proxy_Interactable_Handle_Test",
    "Flow Slice",
    "Car Fluid Flow",
    "TubeTest",
];

const ARTEMIS_VARIANT_SLOT: StoryGuideSlot = { x: 0, y: -3.16, width: 26.4, height: 5.36 };
const WIND_SOURCE_SLOT: StoryGuideSlot = { x: 0.0, y: 1.96, width: 25.6, height: 4.1 };
const WIND_EVENT_SLOTS: StoryGuideSlot[] = [
    { x: -9.2, y: -4.42, width: 8.0, height: 1.64 },
    { x: 0.0, y: -4.42, width: 8.0, height: 1.64 },
    { x: 9.2, y: -4.42, width: 8.0, height: 1.64 },
];
const MAGNETIC_MODE_SLOTS: StoryGuideSlot[] = STORY_GUIDE_EXAMPLE_DETAIL.magneticModes;

const EXAMPLE_FIELD_OPTIONS: ExampleFieldOption[] = [
    { id: "gravity", label: "Gravitational Fields", slot: STORY_GUIDE_EXAMPLES.cards[0].slot },
    { id: "magnetism", label: "Magnetism", slot: STORY_GUIDE_EXAMPLES.cards[1].slot },
    { id: "wind", label: "Earth Winds", slot: STORY_GUIDE_EXAMPLES.cards[2].slot },
    { id: "aerodynamics", label: "Aerodynamics", slot: STORY_GUIDE_EXAMPLES.cards[3].slot },
];

const EXAMPLE_VARIANT_OPTIONS: ExampleVariantOption[] = [
    { id: "gravity:artemis", field: "gravity", label: "Artemis II", slot: ARTEMIS_VARIANT_SLOT },
];

const EXAMPLE_MODE_OPTIONS: ExampleModeOption[] = [
    { id: "magnetism:trails", field: "magnetism", label: "Trails", mode: 0, slot: MAGNETIC_MODE_SLOTS[0] },
    { id: "magnetism:arrows", field: "magnetism", label: "Arrows", mode: 2, slot: MAGNETIC_MODE_SLOTS[1] },
    { id: "wind:trails", field: "wind", label: "Trails", mode: 0, slot: STORY_GUIDE_EXAMPLE_DETAIL.modes[0] },
    { id: "wind:points", field: "wind", label: "Points", mode: 1, slot: STORY_GUIDE_EXAMPLE_DETAIL.modes[1] },
    { id: "wind:arrows", field: "wind", label: "Arrows", mode: 2, slot: STORY_GUIDE_EXAMPLE_DETAIL.modes[2] },
];

const THEORY_FIELD_OPTIONS: TheoryFieldOption[] = [
    { id: "expansion", label: "Expansion", index: 0, preset: 0, divergence: "+2.00", curl: "+0.00", slot: STORY_GUIDE_THEORY.modes[0].slot },
    { id: "contraction", label: "Contraction", index: 1, preset: 1, divergence: "-2.00", curl: "+0.00", slot: STORY_GUIDE_THEORY.modes[1].slot },
    { id: "curl", label: "Curl", index: 2, preset: 2, divergence: "+0.00", curl: "+2.00", slot: STORY_GUIDE_THEORY.modes[2].slot },
    { id: "motion", label: "Motion", index: 3, preset: 3, divergence: "live", curl: "live", slot: STORY_GUIDE_THEORY.modes[3].slot },
];

const GRADIENT_PALETTE_OPTIONS: GradientPaletteOption[] = [
    { id: "jet", label: "Jet", index: 13, slot: STORY_GUIDE_GRADIENTS.palettes[0].slot },
    { id: "viridis", label: "Viridis", index: 17, slot: STORY_GUIDE_GRADIENTS.palettes[1].slot },
    { id: "plasma", label: "Plasma", index: 18, slot: STORY_GUIDE_GRADIENTS.palettes[2].slot },
];

const THEORY_INFO_SLOT: StoryGuideSlot = STORY_GUIDE_THEORY.info;
const MOTION_INSTRUCTION_SLOT: StoryGuideSlot = { x: 0.0, y: -0.08, width: 19.6, height: 4.8 };
const GRADIENT_SCALE_SLOT: StoryGuideSlot = { x: 3.28, y: -5.18, width: 12.4, height: 1.42 };
const GRADIENT_OFFSET_SLOT: StoryGuideSlot = { x: 3.28, y: -7.08, width: 12.4, height: 1.42 };
const MAGNETIC_ADVANCED_SLOT: StoryGuideSlot = { x: 0.0, y: -7.84, width: 8.0, height: 1.64 };
const MAGNETIC_POWER_SLOT: StoryGuideSlot = { x: -6.8, y: -4.48, width: 12.4, height: 1.36 };
const MAGNETIC_PULL_SLOT: StoryGuideSlot = { x: 6.8, y: -4.48, width: 12.4, height: 1.36 };
const MAGNETIC_LENGTH_SLOT: StoryGuideSlot = { x: -6.8, y: -6.28, width: 12.4, height: 1.36 };
const MAGNETIC_SPEED_SLOT: StoryGuideSlot = { x: 6.8, y: -6.28, width: 12.4, height: 1.36 };
const GRADIENT_SLIDER_TRACK_Y = -0.28;
const GRADIENT_SLIDER_TRACK_HEIGHT = 0.36;
const GRADIENT_SLIDER_KNOB_WIDTH = 0.68;
const GRADIENT_SLIDER_KNOB_HEIGHT = 0.68;
const GRADIENT_SLIDER_LABEL_Y = 0.30;
const GRADIENT_SLIDER_SIDE_MARGIN = 0.66;
const GRADIENT_SLIDER_LABEL_WIDTH = 2.18;
const GRADIENT_SLIDER_VALUE_WIDTH = 2.0;
const GRADIENT_SLIDER_TEXT_TRACK_GAP = 0.40;
const GRADIENT_SLIDER_BACKPLATE_Z = 0.12;
const GRADIENT_SLIDER_TRACK_Z = 0.24;
const GRADIENT_SLIDER_FILL_Z = 0.34;
const GRADIENT_SLIDER_KNOB_Z = 0.54;
const GRADIENT_SLIDER_KNOB_HOVER_Z = 0.0;

@component
export class VectorFieldsChapterGuide extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Optional Story Step Director root. If empty, the script searches for it by name.")
    directorRoot: SceneObject = null as any;

    @input
    @hint("Start visible and immediately stage the first chapter.")
    showOnStart: boolean = true;

    @input
    @widget(new SliderWidget(0, 2, 1))
    @hint("Initial chapter index for the main menu.")
    initialIndex: number = 0;

    @input
    @hint("When no Story Step Director is present, enable the real content roots for each guide step.")
    controlContentRoots: boolean = true;

    @input
    @hint("While open, pause nearby scene colliders so content cannot steal menu touches.")
    isolateSceneInteractors: boolean = true;

    @input
    @hint("Offset from this root in centimeters.")
    panelOffset: vec3 = new vec3(0, 0, 0);

    @input
    @allowUndefined
    @hint("Optional head/camera anchor for Follow mode. Empty searches for Camera Object.")
    cameraRoot: SceneObject = null as any;

    @input
    @hint("Keep the menu in front of the user.")
    followUser: boolean = false;

    @input
    @hint("Start with only Fold/Open and Follow/Fixed controls visible.")
    folded: boolean = false;

    @input
    @hint("Distance from head anchor in centimeters when Follow is active.")
    menuDistanceCm: number = 52.0;

    @input
    @widget(new SliderWidget(0.75, 2.5, 0.05))
    @hint("Uniform visual scale for the entire menu plane and its hit targets.")
    menuVisualScale: number = 1.55;

    @input
    @hint("Vertical offset from head anchor in centimeters when Follow is active.")
    menuVerticalOffsetCm: number = -7.0;

    @input
    @hint("Extra vertical drop so staged visuals can sit above the menu without calibration.")
    menuLowerOffsetCm: number = -14.0;

    @input
    @hint("Horizontal offset from head anchor in centimeters when Follow is active.")
    menuHorizontalOffsetCm: number = 0.0;

    @input
    @widget(new SliderWidget(0, 1, 0.05))
    @hint("How much Follow mode pitches the menu toward the user's head instead of yaw-only billboarding.")
    menuBillboardPitchBlend: number = 0.35;

    @input
    @hint("Higher values make the menu catch up faster.")
    followSmoothing: number = 9.0;

    private panelImage: ImageBinding | null = null;
    private cards: ButtonBinding[] = [];
    private navButtons: ButtonBinding[] = [];
    private utilityButtons: ButtonBinding[] = [];
    private viewPlaneButtons: ButtonBinding[] = [];
    private followButton: ButtonBinding | null = null;
    private foldButton: ButtonBinding | null = null;
    private resetButton: ButtonBinding | null = null;
    private proxyButton: ButtonBinding | null = null;
    private moveHandleButton: ButtonBinding | null = null;
    private examplesBackButton: ButtonBinding | null = null;
    private theoryInfoImage: ImageBinding | null = null;
    private panelCursorImage: ImageBinding | null = null;
    private panelHitObject: SceneObject | null = null;
    private panelHoverUvCurrent: vec2 = new vec2(0.5, 0.5);
    private panelHoverUvTarget: vec2 = new vec2(0.5, 0.5);
    private panelHoverAlpha: number = 0.0;
    private panelHoverTargetAlpha: number = 0.0;
    private panelHoverPress: number = 0.0;
    private panelHoverTargetPress: number = 0.0;
    private cursorImage: ImageBinding | null = null;
    private cursorOwner: ButtonBinding | null = null;
    private cursorCurrent: vec3 = new vec3(0, 0, 0.94);
    private cursorTarget: vec3 = new vec3(0, 0, 0.94);
    private cursorScale: number = 1.0;
    private cursorTargetScale: number = 1.0;
    private foldableObjects: SceneObject[] = [];
    private progressText: Text | null = null;
    private progressObject: SceneObject | null = null;
    private currentIndex: number = 0;
    private selectedExampleField: ExampleFieldId = "gravity";
    private hasSelectedExampleField: boolean = false;
    private viewPlaneMode: number = 0;
    private keepPlaneControlsWhileFolded: boolean = false;
    private examplesMenuOpen: boolean = false;
    private examplesDetailOpen: boolean = false;
    private theoryMenuOpen: boolean = false;
    private fieldSelectorButtons: ButtonBinding[] = [];
    private variantButtons: ButtonBinding[] = [];
    private exampleModeButtons: ButtonBinding[] = [];
    private theoryModeButtons: ButtonBinding[] = [];
    private theoryCardButtons: ButtonBinding[] = [];
    private theoryPanelImage: ImageBinding | null = null;
    private motionInstructionObject: SceneObject | null = null;
    private motionInstructionKicker: Text | null = null;
    private motionInstructionCopy: Text | null = null;
    private selectedTheoryCard: string = "";
    private metricsPage: number = 0;
    private definitionPage: number = 0;
    private paletteButtons: ButtonBinding[] = [];
    private gradientSliders: GradientSliderBinding[] = [];
    private magneticAdvancedButton: ButtonBinding | null = null;
    private magneticSliders: GradientSliderBinding[] = [];
    private magneticAdvancedOpen: boolean = false;
    private selectedGravityVariant: GravityExampleVariant = "field";
    private selectedWindVariant: WindExampleVariant = "globe";
    private selectedGravityStage: number = 2;
    private selectedMagnetismTubeMode: number = 0;
    private selectedWindTubeMode: number = 0;
    private selectedWindEventIndex: number = -1;
    private windSourceObject: SceneObject | null = null;
    private windSourceText: Text | null = null;
    private windEventCards: WindEventCardBinding[] = [];
    private selectedTheoryMode: TheoryFieldModeId = "expansion";
    private selectedGradientPalette: GradientPaletteId = "viridis";
    private gradientScaleValue: number = 1.0;
    private gradientOffsetValue: number = 0.0;
    private magneticPowerValue: number = 0.09;
    private magneticPullValue: number = 0.47;
    private magneticLengthValue: number = 0.58;
    private magneticSpeedValue: number = 0.71;
    private magneticControlsDirty: boolean = false;
    private directorApi: any = null;
    private proxyApi: any = null;
    private menuDragActive: boolean = false;
    private menuDragStartCursorWorld: vec3 | null = null;
    private menuDragStartMenuWorld: vec3 | null = null;
    private isolatedColliders: ColliderBinding[] = [];
    private hiddenUIKitButtons: RectangleButton[] = [];
    private built: boolean = false;
    private startEventRef: any = null;
    private updateEventRef: any = null;
    private renderPrioritySettleRemaining: number = 0.0;
    private theoryPatternUiSettleRemaining: number = 0.0;
    private theoryPatternControlsPrewarmed: boolean = false;

    onAwake(): void {
        this.startEventRef = this.createEvent("OnStartEvent");
        this.startEventRef.bind(() => this.build());
        this.updateEventRef = this.createEvent("UpdateEvent");
        this.updateEventRef.bind(() => {
            this.ensureRuntimeAdditions();
            this.syncContextualPanelState();
            this.updateMenuPose();
            this.updateMainExperiencePriority();
            this.updateTheoryPatternUiSettle();
            this.hideRegisteredUIKitVisuals();
            this.syncProxyButtonState();
            this.updateButtonAnimations();
            this.updatePanelCursorAnimation();
            this.updateCursorAnimation();
        });
    }

    public next(): void {
        if (this.examplesMenuOpen) {
            this.cycleExampleField(1);
            return;
        }
        if (this.theoryMenuOpen) {
            if (this.selectedTheoryCard === "metrics") {
                if (this.metricsPage < MATH_EXPLAINER_TEXTURES.length - 1) {
                    this.metricsPage++;
                    this.updateTheoryPanelTexture();
                }
                return;
            }
            if (this.selectedTheoryCard === "definition") {
                if (this.definitionPage < VF_DEFINITION_TEXTURES.length - 1) {
                    this.definitionPage++;
                    this.updateTheoryPanelTexture();
                }
                return;
            }
            if (this.selectedTheoryCard === "patterns") {
                this.cycleTheoryFieldMode(1);
                return;
            }
            return;
        }
        if (GUIDE_STEPS[this.currentIndex].id === "examples") {
            this.cycleExampleField(1);
            return;
        }
        this.goTo(Math.min(GUIDE_STEPS.length - 1, this.currentIndex + 1));
    }

    public prev(): void {
        if (this.theoryMenuOpen) {
            if (this.selectedTheoryCard === "metrics" && this.metricsPage > 0) {
                this.metricsPage--;
                this.updateTheoryPanelTexture();
                this.syncVisualState();
                return;
            }
            if (this.selectedTheoryCard === "definition" && this.definitionPage > 0) {
                this.definitionPage--;
                this.updateTheoryPanelTexture();
                this.syncVisualState();
                return;
            }
        }
        if (this.examplesMenuOpen || this.theoryMenuOpen) {
            this.returnToChapterList();
            return;
        }
        this.goTo(Math.max(0, this.currentIndex - 1));
    }

    public goTo(index: number): void {
        const nextIndex = Math.max(0, Math.min(GUIDE_STEPS.length - 1, Math.floor(index)));
        this.currentIndex = nextIndex;
        const stepId = GUIDE_STEPS[this.currentIndex].id;
        this.examplesMenuOpen = stepId === "examples";
        this.examplesDetailOpen = false;
        this.magneticAdvancedOpen = false;
        if (stepId !== "theory") {
            this.selectedTheoryCard = "";
            this.metricsPage = 0;
            this.definitionPage = 0;
        }
        this.theoryMenuOpen = stepId === "theory";
        if (!this.currentStateCanCalibrate()) {
            this.keepPlaneControlsWhileFolded = false;
        }
        this.stageCurrentRoot();
        this.syncVisualState();
    }

    private showChapterList(): void {
        this.examplesMenuOpen = false;
        this.examplesDetailOpen = false;
        this.magneticAdvancedOpen = false;
        this.theoryMenuOpen = false;
        this.selectedTheoryCard = "";
        this.metricsPage = 0;
        this.definitionPage = 0;
        this.keepPlaneControlsWhileFolded = false;
        this.hideStaleChapterCards();
        this.syncVisualState();
    }

    public isFolded(): boolean {
        return this.folded;
    }

    public isMenuFolded(): boolean {
        return this.folded;
    }

    private build(): void {
        if (this.built) {
            this.syncVisualState();
            return;
        }
        this.built = true;
        this.directorApi = this.findDirectorApi();
        this.proxyApi = this.findProxyApi();
        this.syncGradientValuesFromDirector();
        this.sceneObject.enabled = this.showOnStart;

        const panelImage = this.createImage(this.sceneObject, "__GuidePanelImage", {
            x: this.panelOffset.x,
            y: this.panelOffset.y,
            width: STORY_GUIDE_PANEL.width,
            height: STORY_GUIDE_PANEL.height,
        }, TEX_PANEL_MAIN, 220, 0.0);
        this.panelImage = panelImage;
        this.registerFoldable(panelImage.object);
        this.setPanelHoverUniform();

        this.createPanelCursor();
        this.disablePanelHitTarget();
        this.createProgressText();

        for (let i = 0; i < GUIDE_STEPS.length; i++) {
            const step = GUIDE_STEPS[i];
            const tex = CARD_TEXTURES[step.id];
            if (!tex) continue;
            const slot = this.offsetSlot(step.slot);
            const card = this.createTextureButton(
                "__GuideCard_" + step.id,
                step.id,
                slot,
                tex.normal,
                tex.active,
                tex.pressed,
                242,
                () => this.goTo(i),
                true,
                TEX_CARD_OVERLAY_HOVER,
                TEX_CARD_OVERLAY_SELECTED,
                TEX_CARD_OVERLAY_PRESSED
            );
            this.cards.push(card);
        }

        this.createTheoryCardButtons();
        this.createExampleFieldSelectors();
        this.createVariantSelectors();
        this.createExampleModeSelectors();
        this.createMagneticAdvancedControls();
        this.createWindWeatherPanel();
        this.createTheoryFieldSelectors();
        this.createGradientPaletteSelectors();
        this.createGradientSliders();
        this.createTheoryInfoCard();
        this.createMotionInstructionText();
        this.prewarmTheoryPatternControls();
        this.createExamplesBackButton();
        this.createNavButton("__GuideBack", "back", this.offsetSlot(STORY_GUIDE_NAV.back), TEX_NAV_BACK_NORMAL, TEX_NAV_BACK_PRESSED, 244, () => this.prev());
        this.createNavButton("__GuideNext", "next", this.offsetSlot(STORY_GUIDE_NAV.next), TEX_NAV_NEXT_NORMAL, TEX_NAV_NEXT_PRESSED, 244, () => this.next());
        this.createUtilityButtons();

        this.currentIndex = Math.max(0, Math.min(GUIDE_STEPS.length - 1, Math.floor(this.initialIndex)));
        this.showChapterList();
        print("VectorFieldsChapterGuide: built " + GUIDE_STEPS.length + " slots at 50 px/cm");
    }

    private createNavButton(name: string, id: string, slot: StoryGuideSlot, normal: Texture, pressed: Texture, renderOrder: number, action: () => void): void {
        this.navButtons.push(this.createTextureButton(
            name,
            id,
            slot,
            normal,
            normal,
            pressed,
            renderOrder,
            action,
            true,
            TEX_NAV_OVERLAY_HOVER,
            null,
            TEX_NAV_OVERLAY_PRESSED
        ));
    }

    private createUtilityButtons(): void {
        const moveHandleButton = this.createTextureButton(
            "__GuideMoveHandle",
            "move",
            this.offsetSlot(MENU_MOVE_HANDLE_SLOT),
            TEX_UTILITY_MOVE_NORMAL,
            TEX_UTILITY_MOVE_ACTIVE,
            TEX_UTILITY_MOVE_PRESSED,
            252,
            () => {},
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            null,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.moveHandleButton = moveHandleButton;
        this.utilityButtons.push(moveHandleButton);
        this.bindMenuMoveHandle(moveHandleButton);

        const followButton = this.createTextureButton(
            "__GuideFollow",
            "follow",
            this.offsetSlot(STORY_GUIDE_UTILITY.follow),
            this.followUser ? TEX_UTILITY_FOLLOW_ON : TEX_UTILITY_FOLLOW_OFF,
            TEX_UTILITY_FOLLOW_ON,
            TEX_UTILITY_FOLLOW_PRESSED,
            248,
            () => {
                this.followUser = !this.followUser;
                this.syncVisualState();
            },
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            null,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.followButton = followButton;
        this.utilityButtons.push(followButton);

        const foldButton = this.createTextureButton(
            "__GuideFold",
            "fold",
            this.offsetSlot(STORY_GUIDE_UTILITY.fold),
            this.folded ? TEX_UTILITY_FOLD_CLOSED : TEX_UTILITY_FOLD_OPEN,
            TEX_UTILITY_FOLD_OPEN,
            TEX_UTILITY_FOLD_PRESSED,
            248,
            () => {
                this.setFolded(!this.folded);
            },
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            null,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.foldButton = foldButton;
        this.utilityButtons.push(foldButton);

        const resetButton = this.createTextureButton(
            "__GuideResetActive",
            "reset",
            this.offsetSlot(STORY_GUIDE_UTILITY.planeFloor),
            TEX_UTILITY_RESET_NORMAL,
            TEX_UTILITY_RESET_NORMAL,
            TEX_UTILITY_RESET_PRESSED,
            248,
            () => {
                this.resetActiveVisual();
            },
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            null,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.resetButton = resetButton;
        this.utilityButtons.push(resetButton);

        const proxyButton = this.createTextureButton(
            "__GuideProxyTransform",
            "proxy",
            this.offsetSlot(STORY_GUIDE_UTILITY.planeFront),
            TEX_UTILITY_PLANE_FRONT_OFF,
            TEX_UTILITY_PLANE_FRONT_ON,
            TEX_UTILITY_PLANE_FRONT_PRESSED,
            248,
            () => {
                this.toggleProxyPlane();
            },
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            TEX_UTILITY_OVERLAY_HOVER,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.proxyButton = proxyButton;
        this.utilityButtons.push(proxyButton);
    }

    private createTextureButton(
        name: string,
        id: string,
        slot: StoryGuideSlot,
        normal: Texture,
        active: Texture,
        pressed: Texture,
        renderOrder: number,
        action: () => void,
        foldable: boolean = true,
        hoverOverlay: Texture | null = null,
        selectedOverlay: Texture | null = null,
        pressedOverlay: Texture | null = null
    ): ButtonBinding {
        const buttonObject = this.ensureChild(this.sceneObject, name);
        this.place(buttonObject, slot.x, slot.y, BUTTON_HIT_Z);
        if (foldable) {
            this.registerFoldable(buttonObject);
        }

        let button = buttonObject.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (!button) {
            button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        }
        (button as any)._style = "Ghost";
        this.configureUIKitButton(button, slot.width, slot.height, BUTTON_HIT_DEPTH_CM, renderOrder - 2);
        this.registerHiddenUIKitButton(button);

        const image = this.createImage(buttonObject, "__Image", {
            x: 0,
            y: 0,
            width: slot.width,
            height: slot.height,
        }, normal, renderOrder, 0.18);
        const overlay = this.createImage(buttonObject, "__StateOverlay", {
            x: 0,
            y: 0,
            width: slot.width,
            height: slot.height,
        }, hoverOverlay || selectedOverlay || pressedOverlay || normal, renderOrder + 1, 0.32);
        overlay.object.enabled = false;

        const binding: ButtonBinding = {
            id,
            object: buttonObject,
            image,
            overlay,
            normal,
            active,
            pressed,
            hoverOverlay,
            selectedOverlay,
            pressedOverlay,
            slot: this.cloneSlot(slot),
            homeSlot: this.cloneSlot(slot),
            targetSlot: this.cloneSlot(slot),
            button,
            hitWidth: slot.width,
            hitHeight: slot.height,
            hitDepth: BUTTON_HIT_DEPTH_CM,
            hovered: false,
            pressedState: false,
            selected: false,
            visualScale: 1.0,
            targetScale: 1.0,
            visualLift: 0.0,
            targetLift: 0.0,
            label: null,
        };

        this.bindCursorEvents(button, binding);
        this.bindButtonActionEvents(button, binding, action);
        this.listen((button as any).onHoverEnter, () => {
            this.setTextureButtonHover(binding, true);
        });
        this.listen((button as any).onTriggerDown, () => {
            binding.pressedState = true;
            this.hidePanelCursor();
            this.showCursor(binding, true);
            this.updateBindingVisual(binding);
        });
        this.listen((button as any).onHoverExit, () => {
            this.setTextureButtonHover(binding, false);
        });
        return binding;
    }

    private createExampleFieldSelectors(): void {
        for (let i = 0; i < EXAMPLE_FIELD_OPTIONS.length; i++) {
            const option = EXAMPLE_FIELD_OPTIONS[i];
            const tex = EXAMPLE_CARD_TEXTURES[option.id];
            const binding = this.createTextureButton(
                "__GuideExample_" + option.id,
                "field:" + option.id,
                this.offsetSlot(option.slot),
                tex.normal,
                tex.active,
                tex.pressed,
                246,
                () => this.selectExampleField(option.id),
                true,
                TEX_EXAMPLE_OVERLAY_HOVER,
                TEX_EXAMPLE_OVERLAY_SELECTED,
                TEX_EXAMPLE_OVERLAY_PRESSED
            );
            binding.object.enabled = false;
            this.fieldSelectorButtons.push(binding);
        }
    }

    private createVariantSelectors(): void {
        for (let i = 0; i < EXAMPLE_VARIANT_OPTIONS.length; i++) {
            const option = EXAMPLE_VARIANT_OPTIONS[i];
            const textures = VARIANT_TEXTURES[option.id] || {
                normal: TEX_VARIANT_NORMAL,
                active: TEX_VARIANT_ACTIVE,
                pressed: TEX_VARIANT_PRESSED,
            };
            const binding = this.createTextureButton(
                "__GuideVariant_" + option.id.replace(":", "_"),
                "variant:" + option.id,
                this.offsetSlot(option.slot),
                textures.normal,
                textures.active,
                textures.pressed,
                249,
                () => this.selectExampleVariant(option.id),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            if (option.id !== "gravity:artemis") {
                binding.label = this.createButtonLabel(binding.object, "__Label", option.label, option.slot.width, option.slot.height, 254);
            }
            binding.object.enabled = false;
            this.variantButtons.push(binding);
        }
    }

    private createExampleModeSelectors(): void {
        for (let i = 0; i < EXAMPLE_MODE_OPTIONS.length; i++) {
            const option = EXAMPLE_MODE_OPTIONS[i];
            const binding = this.createTextureButton(
                "__GuideExampleMode_" + option.id.replace(":", "_"),
                "example_mode:" + option.id,
                this.offsetSlot(option.slot),
                TEX_VARIANT_NORMAL,
                TEX_VARIANT_ACTIVE,
                TEX_VARIANT_PRESSED,
                249,
                () => this.selectExampleMode(option.id),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            binding.label = this.createButtonLabel(binding.object, "__Label", option.label, option.slot.width, option.slot.height, 254);
            binding.object.enabled = false;
            this.exampleModeButtons.push(binding);
        }
    }

    private createWindWeatherPanel(): void {
        if (!this.windSourceText) {
            const sourceSlot = this.offsetSlot(WIND_SOURCE_SLOT);
            this.windSourceObject = this.ensureChild(this.sceneObject, "__GuideWindSourceInfo");
            this.place(this.windSourceObject, sourceSlot.x, sourceSlot.y, 0.64);
            this.registerFoldable(this.windSourceObject);
            this.windSourceText = this.configureGuideText(
                this.windSourceObject,
                this.windSourceText,
                this.windSourceTextValue(),
                sourceSlot.width,
                sourceSlot.height,
                24,
                HorizontalAlignment.Left,
                VerticalAlignment.Center,
                256,
                new vec4(0.94, 0.94, 0.94, 1.0)
            );
            this.windSourceObject.enabled = false;
        }

        const maxCards = Math.min(STORMS.length, WIND_EVENT_SLOTS.length);
        for (let i = this.windEventCards.length; i < maxCards; i++) {
            const storm = STORMS[i];
            const slot = this.offsetSlot(WIND_EVENT_SLOTS[i]);
            const binding = this.createTextureButton(
                "__GuideWindEvent_" + i,
                "wind_event:" + i,
                slot,
                TEX_VARIANT_NORMAL,
                TEX_VARIANT_ACTIVE,
                TEX_VARIANT_PRESSED,
                252,
                () => this.selectWindEvent(i),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            const title = this.createWindEventText(binding.object, "__Title", this.windEventTitle(storm), -0.08, 0.34, slot.width - 0.8, 0.62, 25, HorizontalAlignment.Left, 258);
            const detail = this.createWindEventText(binding.object, "__Detail", this.windEventDetail(storm), -0.08, -0.32, slot.width - 0.8, 0.58, 19, HorizontalAlignment.Left, 258);
            binding.object.enabled = false;
            this.windEventCards.push({ stormIndex: i, button: binding, title, detail });
        }
    }

    private createWindEventText(parent: SceneObject, name: string, value: string, x: number, y: number, width: number, height: number, size: number, alignment: HorizontalAlignment, renderOrder: number): Text {
        const object = this.ensureChild(parent, name);
        this.place(object, x, y, 0.64);
        return this.configureGuideText(
            object,
            object.getComponent("Component.Text") as Text,
            value,
            width,
            height,
            size,
            alignment,
            VerticalAlignment.Center,
            renderOrder,
            new vec4(0.88, 0.88, 0.88, 1.0)
        );
    }

    private createTheoryFieldSelectors(): void {
        for (let i = 0; i < THEORY_FIELD_OPTIONS.length; i++) {
            const option = THEORY_FIELD_OPTIONS[i];
            const newId = "theory_mode:" + option.id;
            const existing = this.findCardBinding(this.theoryModeButtons, newId) ||
                this.findCardBinding(this.theoryModeButtons, "theory:" + option.id);
            if (existing) {
                existing.id = newId;
                continue;
            }
            const tex = THEORY_MODE_TEXTURES[option.id];
            const binding = this.createTextureButton(
                "__GuideTheoryMode_" + option.id,
                newId,
                this.offsetSlot(option.slot),
                tex.normal,
                tex.active,
                tex.pressed,
                249,
                () => this.selectTheoryFieldMode(option.id),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            binding.object.enabled = false;
            this.theoryModeButtons.push(binding);
        }
    }

    private createGradientPaletteSelectors(): void {
        for (let i = 0; i < GRADIENT_PALETTE_OPTIONS.length; i++) {
            const option = GRADIENT_PALETTE_OPTIONS[i];
            const tex = PALETTE_TEXTURES[option.id];
            if (!tex) continue;
            const binding = this.createTextureButton(
                "__GuidePalette_" + option.id,
                "palette:" + option.id,
                this.offsetSlot(option.slot),
                tex.normal,
                tex.active,
                tex.pressed,
                250,
                () => this.selectGradientPalette(option.id),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            binding.object.enabled = false;
            this.paletteButtons.push(binding);
        }
    }

    private createTheoryInfoCard(): void {
        const option = this.currentTheoryFieldOption();
        const texture = THEORY_INFO_TEXTURES[option.id] || THEORY_INFO_TEXTURES.expansion;
        this.theoryInfoImage = this.createImage(
            this.sceneObject,
            "__GuideTheoryInfoCard",
            this.offsetSlot(THEORY_INFO_SLOT),
            texture,
            246,
            0.2
        );
        this.theoryInfoImage.object.enabled = false;
    }

    private createMotionInstructionText(): void {
        const slot = this.offsetSlot(MOTION_INSTRUCTION_SLOT);
        const root = this.ensureChild(this.sceneObject, "__GuideMotionInstructions");
        this.place(root, slot.x, slot.y, 0.72);

        const kickerObject = this.ensureChild(root, "__Kicker");
        this.place(kickerObject, 0.0, 1.22, 0.0);
        this.motionInstructionKicker = this.configureGuideText(
            kickerObject,
            this.motionInstructionKicker,
            "M O T I O N   F I E L D",
            slot.width,
            0.62,
            30,
            HorizontalAlignment.Center,
            VerticalAlignment.Center,
            262,
            new vec4(0.72, 0.84, 1.0, 0.92)
        );

        const copyObject = this.ensureChild(root, "__Copy");
        this.place(copyObject, 0.0, -0.12, 0.0);
        this.motionInstructionCopy = this.configureGuideText(
            copyObject,
            this.motionInstructionCopy,
            "Move the handle through the plane.\nFaster motion lengthens the arrows and bends the local field.",
            slot.width,
            2.7,
            42,
            HorizontalAlignment.Center,
            VerticalAlignment.Center,
            262,
            new vec4(0.96, 0.98, 1.0, 0.98)
        );

        root.enabled = false;
        this.motionInstructionObject = root;
    }

    private ensureRuntimeAdditions(): void {
        if (!this.built) return;
        let added = false;
        if (this.theoryModeButtons.length < THEORY_FIELD_OPTIONS.length) {
            this.createTheoryFieldSelectors();
            added = true;
        }
        if (this.exampleModeButtons.length < EXAMPLE_MODE_OPTIONS.length) {
            this.createExampleModeSelectors();
            added = true;
        }
        if (!this.windSourceText || this.windEventCards.length < Math.min(STORMS.length, WIND_EVENT_SLOTS.length)) {
            this.createWindWeatherPanel();
            added = true;
        }
        if (!this.theoryInfoImage) {
            this.createTheoryInfoCard();
            added = true;
        }
        if (this.paletteButtons.length < GRADIENT_PALETTE_OPTIONS.length) {
            this.createGradientPaletteSelectors();
            added = true;
        }
        if (this.gradientSliders.length < 2) {
            this.createGradientSliders();
            added = true;
        }
        if (!this.magneticAdvancedButton || this.magneticSliders.length < 4) {
            this.createMagneticAdvancedControls();
            added = true;
        }
        if (added) {
            this.syncVisualState();
        }
    }

    private createGradientSliders(): void {
        if (this.gradientSliders.length > 0) return;
        this.gradientSliders.push(this.createGradientSlider(
            "__GuideGradientScale",
            "scale",
            this.offsetSlot(GRADIENT_SCALE_SLOT),
            "Scale",
            0.05,
            4.0,
            0.01,
            this.gradientScaleValue
        ));
        this.gradientSliders.push(this.createGradientSlider(
            "__GuideGradientOffset",
            "offset",
            this.offsetSlot(GRADIENT_OFFSET_SLOT),
            "Offset",
            -1.0,
            1.0,
            0.01,
            this.gradientOffsetValue
        ));
        for (let i = 0; i < this.gradientSliders.length; i++) {
            this.gradientSliders[i].object.enabled = false;
            this.updateGradientSliderVisual(this.gradientSliders[i]);
        }
    }

    private createMagneticAdvancedControls(): void {
        if (!this.magneticAdvancedButton) {
            const slot = this.offsetSlot(MAGNETIC_ADVANCED_SLOT);
            const binding = this.createTextureButton(
                "__GuideMagneticAdvanced",
                "magnetic_advanced",
                slot,
                TEX_VARIANT_NORMAL,
                TEX_VARIANT_ACTIVE,
                TEX_VARIANT_PRESSED,
                249,
                () => this.toggleMagneticAdvanced(),
                true,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_HOVER,
                TEX_UTILITY_OVERLAY_PRESSED
            );
            binding.label = this.createButtonLabel(binding.object, "__Label", "Advanced", slot.width, slot.height, 254);
            binding.object.enabled = false;
            this.magneticAdvancedButton = binding;
        }
        if (this.magneticSliders.length > 0) return;
        this.magneticSliders.push(this.createGradientSlider(
            "__GuideMagneticPower",
            "mag_power",
            this.offsetSlot(MAGNETIC_POWER_SLOT),
            "Power",
            0.0,
            1.0,
            0.01,
            this.magneticPowerValue
        ));
        this.magneticSliders.push(this.createGradientSlider(
            "__GuideMagneticPull",
            "mag_pull",
            this.offsetSlot(MAGNETIC_PULL_SLOT),
            "Pull",
            0.0,
            1.0,
            0.01,
            this.magneticPullValue
        ));
        this.magneticSliders.push(this.createGradientSlider(
            "__GuideMagneticLength",
            "mag_length",
            this.offsetSlot(MAGNETIC_LENGTH_SLOT),
            "Length",
            0.0,
            1.0,
            0.01,
            this.magneticLengthValue
        ));
        this.magneticSliders.push(this.createGradientSlider(
            "__GuideMagneticSpeed",
            "mag_speed",
            this.offsetSlot(MAGNETIC_SPEED_SLOT),
            "Speed",
            0.0,
            1.0,
            0.01,
            this.magneticSpeedValue
        ));
        for (let i = 0; i < this.magneticSliders.length; i++) {
            this.magneticSliders[i].object.enabled = false;
            this.updateGradientSliderVisual(this.magneticSliders[i]);
        }
    }

    private createGradientSlider(name: string, id: ControlSliderId, slot: StoryGuideSlot, labelText: string, min: number, max: number, step: number, value: number): GradientSliderBinding {
        const object = this.ensureChild(this.sceneObject, name);
        this.place(object, slot.x, slot.y, BUTTON_HIT_Z);
        this.registerFoldable(object);

        let button = object.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (!button) {
            button = object.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        }
        (button as any)._style = "Ghost";
        this.configureUIKitButton(button, slot.width, slot.height, BUTTON_HIT_DEPTH_CM, 248);
        this.registerHiddenUIKitButton(button);

        const trackCenterX = this.gradientSliderTrackCenterX(slot);
        const trackWidth = this.gradientSliderTrackWidth(slot);
        const backplate = this.createImage(object, "__Backplate", {
            x: 0.0,
            y: 0.0,
            width: slot.width,
            height: slot.height,
        }, TEX_SLIDER_BACKPLATE, 249, GRADIENT_SLIDER_BACKPLATE_Z);
        const track = this.createImage(object, "__Track", {
            x: trackCenterX,
            y: GRADIENT_SLIDER_TRACK_Y,
            width: trackWidth,
            height: GRADIENT_SLIDER_TRACK_HEIGHT,
        }, TEX_SLIDER_TRACK, 251, GRADIENT_SLIDER_TRACK_Z);
        const fill = this.createImage(object, "__Fill", {
            x: trackCenterX,
            y: GRADIENT_SLIDER_TRACK_Y,
            width: GRADIENT_SLIDER_TRACK_HEIGHT,
            height: GRADIENT_SLIDER_TRACK_HEIGHT,
        }, TEX_SLIDER_FILL, 252, GRADIENT_SLIDER_FILL_Z);
        const knob = this.createImage(object, "__Knob", {
            x: 0.0,
            y: GRADIENT_SLIDER_TRACK_Y,
            width: GRADIENT_SLIDER_KNOB_WIDTH,
            height: GRADIENT_SLIDER_KNOB_HEIGHT,
        }, TEX_SLIDER_KNOB, 253, GRADIENT_SLIDER_KNOB_Z);
        const labelX = -slot.width * 0.5 + GRADIENT_SLIDER_SIDE_MARGIN + GRADIENT_SLIDER_LABEL_WIDTH * 0.5;
        const valueX = slot.width * 0.5 - GRADIENT_SLIDER_SIDE_MARGIN - GRADIENT_SLIDER_VALUE_WIDTH * 0.5;
        const label = this.createSliderText(object, "__Label", labelText, labelX, GRADIENT_SLIDER_LABEL_Y, GRADIENT_SLIDER_LABEL_WIDTH, 0.44, 30, HorizontalAlignment.Left, 254);
        const valueLabel = this.createSliderText(object, "__Value", "", valueX, GRADIENT_SLIDER_LABEL_Y, GRADIENT_SLIDER_VALUE_WIDTH, 0.44, 30, HorizontalAlignment.Left, 254);

        const binding: GradientSliderBinding = {
            id,
            object,
            button,
            slot: this.cloneSlot(slot),
            backplate,
            track,
            fill,
            knob,
            label,
            valueLabel,
            min,
            max,
            step,
            value: this.snapSliderValue(value, min, max, step),
            hovered: false,
            pressed: false,
        };

        const interactable = (button as any).interactable;
        if (interactable) {
            this.listen(interactable.onHoverEnter, (event: any) => {
                binding.hovered = true;
                this.hideCursor();
                this.showGradientSliderCursor(binding, event);
                this.updateGradientSliderVisual(binding);
            });
            this.listen(interactable.onHoverUpdate, (event: any) => this.showGradientSliderCursor(binding, event));
            this.listen(interactable.onHoverExit, () => {
                binding.hovered = false;
                binding.pressed = false;
                this.hidePanelCursor();
                this.updateGradientSliderVisual(binding);
            });
            this.listen(interactable.onTriggerStart, (event: any) => {
                binding.pressed = true;
                this.updateGradientSliderFromEvent(binding, event);
            });
            this.listen(interactable.onTriggerUpdate, (event: any) => this.updateGradientSliderFromEvent(binding, event));
        }
        this.listen((button as any).onTriggerUp, () => {
            binding.pressed = false;
            this.updateGradientSliderVisual(binding);
            this.syncVisualState();
        });
        this.listen((button as any).onHoverExit, () => {
            binding.hovered = false;
            binding.pressed = false;
            this.hidePanelCursor();
            this.updateGradientSliderVisual(binding);
        });

        return binding;
    }

    private createSliderText(parent: SceneObject, name: string, text: string, x: number, y: number, width: number, height: number, size: number, alignment: HorizontalAlignment, renderOrder: number): Text {
        const object = this.ensureChild(parent, name);
        this.place(object, x, y, 0.58);

        let label = object.getComponent("Component.Text") as Text;
        if (!label) {
            label = object.createComponent("Component.Text") as Text;
        }
        label.text = text;
        label.size = size;
        label.font = GUIDE_FONT;
        label.horizontalAlignment = alignment;
        label.verticalAlignment = VerticalAlignment.Center;
        label.horizontalOverflow = HorizontalOverflow.Truncate;
        label.verticalOverflow = VerticalOverflow.Truncate;
        label.worldSpaceRect = Rect.create(-width * 0.5, width * 0.5, -height * 0.5, height * 0.5);
        label.depthTest = true;
        try { label.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        label.twoSided = true;
        label.renderOrder = renderOrder;
        try {
            label.textFill.color = new vec4(0.98, 0.99, 1.0, 1.0);
        } catch (e) {}
        return label;
    }

    private createExamplesBackButton(): void {
        const binding = this.createTextureButton(
            "__GuideExamplesBack",
            "examples_back",
            this.offsetSlot(STORY_GUIDE_EXAMPLES.back),
            TEX_EXAMPLES_BACK_NORMAL,
            TEX_EXAMPLES_BACK_NORMAL,
            TEX_EXAMPLES_BACK_PRESSED,
            246,
            () => this.returnToChapterList(),
            true,
            TEX_NAV_OVERLAY_HOVER,
            null,
            TEX_NAV_OVERLAY_PRESSED
        );
        binding.object.enabled = false;
        this.examplesBackButton = binding;
    }

    private createButtonLabel(parent: SceneObject, name: string, text: string, width: number, height: number, renderOrder: number): Text {
        const object = this.ensureChild(parent, name);
        this.place(object, 0, 0, 0.62);

        let label = object.getComponent("Component.Text") as Text;
        if (!label) {
            label = object.createComponent("Component.Text") as Text;
        }
        label.text = text;
        label.size = 36;
        label.font = GUIDE_FONT;
        label.horizontalAlignment = HorizontalAlignment.Center;
        label.verticalAlignment = VerticalAlignment.Center;
        label.horizontalOverflow = HorizontalOverflow.Truncate;
        label.verticalOverflow = VerticalOverflow.Truncate;
        label.worldSpaceRect = Rect.create(-width * 0.5, width * 0.5, -height * 0.44, height * 0.44);
        label.depthTest = true;
        try { label.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        label.twoSided = true;
        label.renderOrder = renderOrder;
        try {
            label.textFill.color = new vec4(0.78, 0.80, 0.82, 1.0);
        } catch (e) {}
        return label;
    }

    private configureGuideText(
        object: SceneObject,
        existing: Text | null,
        value: string,
        width: number,
        height: number,
        size: number,
        horizontalAlignment: HorizontalAlignment,
        verticalAlignment: VerticalAlignment,
        renderOrder: number,
        color: vec4
    ): Text {
        let text = existing || object.getComponent("Component.Text") as Text;
        if (!text) {
            text = object.createComponent("Component.Text") as Text;
        }
        text.text = value;
        text.size = size;
        text.font = GUIDE_FONT;
        text.horizontalAlignment = horizontalAlignment;
        text.verticalAlignment = verticalAlignment;
        text.horizontalOverflow = HorizontalOverflow.Wrap;
        text.verticalOverflow = VerticalOverflow.Truncate;
        text.worldSpaceRect = Rect.create(-width * 0.5, width * 0.5, -height * 0.5, height * 0.5);
        text.depthTest = true;
        try { text.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        text.twoSided = true;
        text.renderOrder = renderOrder;
        try {
            text.textFill.color = color;
        } catch (e) {}
        return text;
    }

    private createImage(
        parent: SceneObject,
        name: string,
        slot: StoryGuideSlot,
        texture: Texture,
        renderOrder: number,
        z: number,
        materialAsset: Material = IMAGE_MATERIAL
    ): ImageBinding {
        const object = this.ensureChild(parent, name);
        this.place(object, slot.x, slot.y, z);
        object.getTransform().setLocalScale(new vec3(slot.width, slot.height, 1.0));

        let image = object.getComponent("Image") as Image;
        if (!image) {
            image = object.createComponent("Image") as Image;
        }
        const material = materialAsset.clone();
        try {
            image.clearMaterials();
            image.mainMaterial = material;
            image.renderOrder = renderOrder;
            (image as any).twoSided = true;
            this.configureTransparentDepthPass(this.tryMainPass(material));
            this.configureTransparentDepthPass(this.tryMainPass(image));
        } catch (e) {}
        this.applyTexture(material, texture, image);
        return { object, component: image, material, width: slot.width, height: slot.height, z };
    }

    private createProgressText(): void {
        const slot = this.offsetSlot(STORY_GUIDE_NAV.progress);
        const object = this.ensureChild(this.sceneObject, "__GuideProgressText");
        this.place(object, slot.x, slot.y, 0.62);
        this.registerFoldable(object);
        this.progressObject = object;

        this.progressText = object.getComponent("Component.Text") as Text;
        if (!this.progressText) {
            this.progressText = object.createComponent("Component.Text") as Text;
        }
        this.progressText.text = "";
        this.progressText.size = 44;
        this.progressText.font = GUIDE_FONT;
        this.progressText.horizontalAlignment = HorizontalAlignment.Center;
        this.progressText.verticalAlignment = VerticalAlignment.Center;
        this.progressText.horizontalOverflow = HorizontalOverflow.Truncate;
        this.progressText.verticalOverflow = VerticalOverflow.Truncate;
        this.progressText.worldSpaceRect = Rect.create(-slot.width * 0.5, slot.width * 0.5, -slot.height * 0.42, slot.height * 0.42);
        this.progressText.depthTest = true;
        try { this.progressText.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        this.progressText.twoSided = true;
        this.progressText.renderOrder = 260;
        try {
            this.progressText.textFill.color = new vec4(0.95, 0.98, 1.0, 1.0);
        } catch (e) {}
    }

    private createPanelCursor(): void {
        const legacy = this.ensureChild(this.sceneObject, "__GuidePanelCursorWash");
        legacy.enabled = false;
        this.panelCursorImage = null;
    }

    private disablePanelHitTarget(): void {
        const object = this.ensureChild(this.sceneObject, "__GuidePanelHitTarget");
        object.enabled = false;
        this.panelHitObject = null;
    }

    private createPanelHitTarget(): void {
        const object = this.ensureChild(this.sceneObject, "__GuidePanelHitTarget");
        this.place(object, this.panelOffset.x, this.panelOffset.y, PANEL_HIT_Z);
        this.panelHitObject = object;
        this.registerFoldable(object);

        let button = object.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (!button) {
            button = object.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        }
        (button as any)._style = "Ghost";
        this.configureUIKitButton(button, STORY_GUIDE_PANEL.width, STORY_GUIDE_PANEL.height, PANEL_HIT_DEPTH_CM, 218);
        this.registerHiddenUIKitButton(button);

        const interactable = (button as any).interactable;
        if (interactable) {
            this.listen(interactable.onHoverEnter, (event: any) => this.showPanelCursorFromEvent(event, false));
            this.listen(interactable.onHoverUpdate, (event: any) => this.showPanelCursorFromEvent(event, false));
            this.listen(interactable.onTriggerStart, (event: any) => this.showPanelCursorFromEvent(event, true));
            this.listen(interactable.onTriggerUpdate, (event: any) => this.showPanelCursorFromEvent(event, true));
        }
        this.listen((button as any).onHoverExit, () => this.hidePanelCursor());
    }

    private currentPanelTexture(): Texture {
        if (this.theoryMenuOpen) {
            return TEX_PANEL_THEORY;
        }
        if (this.examplesMenuOpen) {
            if (this.examplesDetailOpen && this.selectedExampleField === "gravity" && this.selectedGravityVariant === "artemis") {
                return TEX_PANEL_GRAVITY_ARTEMIS;
            }
            return this.examplesDetailOpen
                ? (EXAMPLE_DETAIL_PANEL_TEXTURES[this.selectedExampleField] || TEX_PANEL_EXAMPLES)
                : TEX_PANEL_EXAMPLES;
        }
        return TEX_PANEL_MAIN;
    }

    private syncVisualState(): void {
        this.syncViewPlaneModeFromDirector();
        if (this.panelImage) {
            const panelTexture = this.currentPanelTexture();
            this.applyTexture(
                this.panelImage.material,
                panelTexture,
                this.panelImage.component
            );
            this.setPanelHoverUniform();
        }
        this.syncMainMenuCardGeometry();
        for (let i = 0; i < this.cards.length; i++) {
            const binding = this.cards[i];
            binding.selected = false;
            this.updateBindingVisual(binding);
        }
        if (this.progressText) {
            const step = GUIDE_STEPS[this.currentIndex];
            this.progressText.text = step.index + " / " + this.twoDigit(GUIDE_STEPS.length);
        }
        if (this.followButton) {
            const texture = this.followUser ? TEX_UTILITY_FOLLOW_ON : TEX_UTILITY_FOLLOW_OFF;
            this.followButton.normal = texture;
            this.followButton.active = texture;
            this.followButton.selected = false;
            this.updateBindingVisual(this.followButton);
        }
        if (this.foldButton) {
            const texture = this.folded ? TEX_UTILITY_FOLD_CLOSED : TEX_UTILITY_FOLD_OPEN;
            this.foldButton.normal = texture;
            this.foldButton.active = texture;
            this.foldButton.selected = false;
            this.updateBindingVisual(this.foldButton);
        }
        if (this.resetButton) {
            this.resetButton.normal = TEX_UTILITY_RESET_NORMAL;
            this.resetButton.active = TEX_UTILITY_RESET_NORMAL;
            this.resetButton.selected = false;
            this.updateBindingVisual(this.resetButton);
        }
        this.updateBindings(this.navButtons);
        this.updateBindings(this.utilityButtons);
        this.syncProxyButtonState();
        this.updateBindings(this.viewPlaneButtons);
        if (this.examplesBackButton) {
            this.updateBindingVisual(this.examplesBackButton);
        }
        this.syncFoldState();
        this.hideStaleChapterCards();
        this.syncMenuModeVisibility();
        this.syncTheoryCardState();
        this.syncFieldSelectorState();
        this.syncVariantState();
        this.syncExampleModeState();
        this.syncMagneticAdvancedState();
        this.syncTheoryFieldModeState();
        this.syncMotionInstructionState();
        this.syncGradientPaletteState();
        this.syncGradientSliderState();
        this.syncUtilityDockTargets();
        this.syncContextualPanelState();
        this.refreshSceneInteractionIsolation();
    }

    private syncMainMenuCardGeometry(): void {
        const existingCards = this.cards;
        const syncedCards: ButtonBinding[] = [];
        for (let i = 0; i < GUIDE_STEPS.length; i++) {
            const step = GUIDE_STEPS[i];
            const textures = CARD_TEXTURES[step.id];
            if (!textures) continue;

            const binding = this.findCardBinding(existingCards, step.id);
            if (!binding) continue;
            const slot = this.offsetSlot(step.slot);
            binding.normal = textures.normal;
            binding.active = textures.active;
            binding.pressed = textures.pressed;
            binding.homeSlot = this.cloneSlot(slot);
            binding.targetSlot = this.cloneSlot(slot);
            binding.slot = this.cloneSlot(slot);
            this.place(binding.object, slot.x, slot.y, BUTTON_HIT_Z);
            this.placeImage(binding.image, 0.0, 0.0, binding.image.z, slot.width, slot.height);
            this.placeImage(binding.overlay, 0.0, 0.0, binding.overlay.z, slot.width, slot.height);
            this.updateButtonHitSize(binding, slot);
            syncedCards.push(binding);
        }
        for (let i = 0; i < existingCards.length; i++) {
            const binding = existingCards[i];
            if (syncedCards.indexOf(binding) >= 0) continue;
            binding.object.enabled = false;
            binding.hovered = false;
            binding.pressedState = false;
        }
        if (syncedCards.length > 0) {
            this.cards = syncedCards;
        }
    }

    private findCardBinding(cards: ButtonBinding[], id: string): ButtonBinding | null {
        for (let i = 0; i < cards.length; i++) {
            if (cards[i].id === id) return cards[i];
        }
        return null;
    }

    private syncContextualPanelState(): void {
        this.updateTheoryPanelTexture();
        this.syncWindWeatherState();
    }

    private syncWindWeatherState(): void {
        const show = !this.folded && this.examplesMenuOpen && this.examplesDetailOpen && this.selectedExampleField === "wind";
        if (this.windSourceObject) {
            this.windSourceObject.enabled = show;
        }
        if (this.windSourceText) {
            this.windSourceText.text = this.windSourceTextValue();
        }
        for (let i = 0; i < this.windEventCards.length; i++) {
            const card = this.windEventCards[i];
            const visible = show && card.stormIndex < STORMS.length;
            card.button.object.enabled = visible;
            if (!visible) {
                card.button.hovered = false;
                card.button.pressedState = false;
            }
            card.button.selected = visible && card.stormIndex === this.selectedWindEventIndex;
            this.updateBindingVisual(card.button);
            const storm = STORMS[card.stormIndex];
            if (storm) {
                card.title.text = this.windEventTitle(storm);
                card.detail.text = this.windEventDetail(storm);
                const color = card.button.selected
                    ? new vec4(1.0, 1.0, 1.0, 1.0)
                    : (card.button.hovered ? new vec4(0.96, 0.96, 0.96, 1.0) : new vec4(0.84, 0.84, 0.84, 1.0));
                try { card.title.textFill.color = color; } catch (e) {}
                try { card.detail.textFill.color = color; } catch (e) {}
            }
        }
        if (this.cursorOwner && this.cursorOwner.id.indexOf("wind_event:") === 0 && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private windSourceTextValue(): string {
        const gfs: any = GFS_META as any;
        const timestep = this.shortUtc(gfs.refTime || (gfs.times && gfs.times.length > 0 ? gfs.times[0] : ""));
        const cadence = gfs.stepHours ? gfs.stepHours + " h" : "3 h";
        const grid = gfs.lonRes && gfs.latRes ? gfs.lonRes + "° x " + gfs.latRes + "°" : "2° x 2°";
        const gfsMode = gfs.usingFallback ? "cached fallback" : (gfs.dataMode || "live");
        const gfsFetchedAt = gfs.fetchedAt ? this.shortUtc(gfs.fetchedAt) : this.shortUtc(gfs.lastAttemptAt || "");
        const eventState = STORMS.length > 0
            ? STORMS.length + " active tracked event" + (STORMS.length === 1 ? "" : "s")
            : "no active tracked tropical cyclones";
        const mode = STORMS_USING_FALLBACK ? "cached fallback" : STORMS_DATA_MODE;
        return "Source: " + gfs.source + " · " + gfsMode + "\n" +
            "Layer: 10 m wind · " + grid + " grid · " + cadence + " forecast cadence\n" +
            "Baked timestep: " + timestep + " · fetched " + gfsFetchedAt + "\n" +
            "Events: " + STORMS_SOURCE + " · " + mode + " · fetched " + this.shortUtc(STORMS_FETCHED_AT) + "\n" +
            "Current cards: " + eventState;
    }

    private windEventTitle(storm: Storm): string {
        return (storm.name || "Tracked weather") + " · " + (storm.alert || "tracked");
    }

    private windEventDetail(storm: Storm): string {
        const speed = this.windSpeedDetail(storm);
        const location = storm.coordinateLabel || this.coordinateLabel(storm.lat, storm.lon);
        const update = storm.updatedLabel || this.shortUtc(storm.toDate || storm.fromDate);
        return speed + " · " + location + " · " + update;
    }

    private selectWindEvent(index: number): void {
        if (index < 0 || index >= STORMS.length) return;
        this.setProxyPlaneActive(false);
        this.selectedWindEventIndex = index;
        const storm = STORMS[index];
        const root = this.findObjectByName("Globe Calibration");
        const api = this.findAnyScriptApi(root, "focusWeatherEvent");
        if (api && typeof api.focusWeatherEvent === "function" && storm.lat !== null && storm.lon !== null) {
            api.focusWeatherEvent(
                storm.lat,
                storm.lon,
                storm.name || "Weather event",
                this.windEventCalloutDetail(storm)
            );
        }
        this.syncVisualState();
    }

    private windEventCalloutDetail(storm: Storm): string {
        const speed = this.windSpeedDetail(storm);
        const loc = storm.coordinateLabel || this.coordinateLabel(storm.lat, storm.lon);
        return speed + " · " + loc;
    }

    private windSpeedDetail(storm: Storm): string {
        if (storm.windKmh === null || storm.windKmh === undefined || isNaN(storm.windKmh)) {
            return storm.windBand || "wind pending";
        }
        const kmh = Math.round(storm.windKmh);
        const mps = storm.windMps !== null && storm.windMps !== undefined && !isNaN(storm.windMps)
            ? storm.windMps
            : storm.windKmh / 3.6;
        const mph = storm.windKmh * 0.621371;
        return kmh + " km/h · " + mps.toFixed(1) + " m/s · " + Math.round(mph) + " mph";
    }

    private coordinateLabel(lat: number | null, lon: number | null): string {
        if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) return "location pending";
        return Math.abs(lat).toFixed(1) + "°" + (lat >= 0 ? "N" : "S") + ", " +
            Math.abs(lon).toFixed(1) + "°" + (lon >= 0 ? "E" : "W");
    }

    private shortUtc(iso: string): string {
        const t = Date.parse(iso || "");
        if (isNaN(t)) return "pending";
        const d = new Date(t);
        const yy = d.getUTCFullYear();
        const mo = this.twoDigit(d.getUTCMonth() + 1);
        const da = this.twoDigit(d.getUTCDate());
        const hh = this.twoDigit(d.getUTCHours());
        const mi = this.twoDigit(d.getUTCMinutes());
        return yy + "-" + mo + "-" + da + " " + hh + ":" + mi + " UTC";
    }

    private updateTheoryPanelTexture(): void {
        // patterns mode: show theory field info panel in the small theory_info slot
        if (this.theoryInfoImage) {
            const showInfo = !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "patterns";
            if (showInfo) {
                const mode = this.currentTheoryFieldOption();
                const tex = THEORY_INFO_TEXTURES[mode.id] || THEORY_INFO_TEXTURES.expansion;
                this.applyTexture(this.theoryInfoImage.material, tex, this.theoryInfoImage.component);
            }
            this.theoryInfoImage.object.enabled = showInfo;
        }
        // definition/metrics: show full-panel image
        if (this.theoryPanelImage) {
            const showPanel = !this.folded && this.theoryMenuOpen && (this.selectedTheoryCard === "metrics" || this.selectedTheoryCard === "definition");
            if (showPanel) {
                let tex: Texture | null = null;
                if (this.selectedTheoryCard === "metrics") {
                    const idx = Math.max(0, Math.min(this.metricsPage, MATH_EXPLAINER_TEXTURES.length - 1));
                    tex = MATH_EXPLAINER_TEXTURES[idx];
                } else {
                    const idx = Math.max(0, Math.min(this.definitionPage, VF_DEFINITION_TEXTURES.length - 1));
                    tex = VF_DEFINITION_TEXTURES[idx];
                }
                if (tex) this.applyTexture(this.theoryPanelImage.material, tex, this.theoryPanelImage.component);
            }
            this.theoryPanelImage.object.enabled = showPanel;
        }
    }

    private stageCurrentRoot(): void {
        const step = GUIDE_STEPS[this.currentIndex];
        if (this.directorApi && typeof this.directorApi.stageStep === "function") {
            this.syncDirectorExampleField(step.id);
            this.syncDirectorExampleVariant(step.id);
            this.syncDirectorExampleMode(step.id);
            this.syncDirectorTheoryFieldMode(step.id);
            this.syncDirectorGradientPalette(step.id);
            this.syncDirectorGradientControls(step.id);
            this.directorApi.stageStep(step.id, "", this.currentIndex);
            if (this.isMagneticDetailActive()) {
                this.applyMagneticAdvancedControls();
            }
            this.beginMainExperiencePrioritySettle();
            return;
        }
        this.stageFallbackContent(step.id);
        if (this.isMagneticDetailActive()) {
            this.applyMagneticAdvancedControls();
        }
        this.beginMainExperiencePrioritySettle();
    }

    private beginMainExperiencePrioritySettle(): void {
        this.promoteCurrentMainExperienceVisuals();
        this.renderPrioritySettleRemaining = 0.5;
    }

    private updateMainExperiencePriority(): void {
        if (this.renderPrioritySettleRemaining <= 0.0) return;
        this.renderPrioritySettleRemaining = Math.max(0.0, this.renderPrioritySettleRemaining - getDeltaTime());
        this.promoteCurrentMainExperienceVisuals();
    }

    private promoteCurrentMainExperienceVisuals(): void {
        this.promoteMainExperienceVisuals([
            this.findObjectByName("Motion Field Root"),
            this.findObjectByName("Vector Field Examples Root"),
            this.findObjectByName("Magnetic Field Root"),
            this.findObjectByName("Gravity Field Root"),
            this.findObjectByName("Globe Calibration"),
            this.findObjectByName("Car Fluid Flow"),
        ]);
    }

    private promoteMainExperienceVisuals(roots: (SceneObject | null)[]): void {
        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            if (!root || !root.enabled) continue;
            this.promoteVisualTree(root);
        }
    }

    private promoteVisualTree(root: SceneObject): void {
        this.promoteVisualComponents(root);
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.promoteVisualTree(root.getChild(i));
        }
    }

    private promoteVisualComponents(object: SceneObject): void {
        this.promoteVisualList(object.getComponents("Component.RenderMeshVisual") as any[]);
        this.promoteVisualList(object.getComponents("Image" as any) as any[]);
        this.promoteVisualList(object.getComponents("Component.Text") as any[]);
    }

    private promoteVisualList(visuals: any[]): void {
        if (!visuals) return;
        for (let i = 0; i < visuals.length; i++) {
            this.promoteVisualRenderOrder(visuals[i]);
        }
    }

    private promoteVisualRenderOrder(visual: any): void {
        if (!visual) return;
        const current = this.getVisualRenderOrder(visual);
        const next = current >= MAIN_EXPERIENCE_RENDER_ORDER
            ? current
            : MAIN_EXPERIENCE_RENDER_ORDER + Math.max(0, Math.min(MAIN_EXPERIENCE_RENDER_ORDER_SPAN - 1, Math.floor(current)));
        this.setVisualRenderOrder(visual, next);
    }

    private getVisualRenderOrder(visual: any): number {
        let order = 0;
        try {
            if (visual && typeof visual.getRenderOrder === "function") {
                order = visual.getRenderOrder();
            } else if (visual && visual.renderOrder !== undefined) {
                order = visual.renderOrder;
            } else if (visual && visual.RenderOrder !== undefined) {
                order = visual.RenderOrder;
            }
        } catch (e) {
            order = 0;
        }
        return isNaN(order) ? 0 : order;
    }

    private setVisualRenderOrder(visual: any, renderOrder: number): void {
        try { if (typeof visual.setRenderOrder === "function") visual.setRenderOrder(renderOrder); } catch (e) {}
        try { visual.renderOrder = renderOrder; } catch (e) {}
        try { visual.RenderOrder = renderOrder; } catch (e) {}
    }

    private syncDirectorExampleField(stepId: string): void {
        if (stepId !== "examples" || !this.directorApi) return;
        // Browsing back to the selector is menu navigation, not a visual unload.
        // The director still starts with no selection, so first entry does not
        // stage the default gravity field.
        if (this.examplesDetailOpen) {
            if (typeof this.directorApi.selectExampleField === "function") {
                this.directorApi.selectExampleField(this.selectedExampleField);
            }
        }
    }

    private syncDirectorExampleVariant(stepId: string): void {
        if (stepId !== "examples" || !this.examplesDetailOpen) return;
        const variant = this.selectedExampleField === "gravity"
            ? (this.selectedGravityVariant === "artemis" ? "gravity:artemis" : "gravity:field")
            : null;
        if (!variant) return;
        if (this.directorApi && typeof this.directorApi.selectExampleVariant === "function") {
            this.directorApi.selectExampleVariant(variant);
        }
    }

    private syncDirectorExampleMode(stepId: string): void {
        if (stepId !== "examples" || !this.directorApi || !this.examplesDetailOpen) return;
        if (this.selectedExampleField === "gravity" && typeof this.directorApi.selectGravityStage === "function") {
            this.directorApi.selectGravityStage(this.selectedGravityStage);
        } else if (this.selectedExampleField === "magnetism" && typeof this.directorApi.selectMagneticTubeMode === "function") {
            this.selectedMagnetismTubeMode = this.selectedMagnetismTubeMode === 2 ? 2 : 0;
            this.directorApi.selectMagneticTubeMode(this.selectedMagnetismTubeMode);
        } else if (this.selectedExampleField === "wind" && typeof this.directorApi.selectWindTubeMode === "function") {
            this.directorApi.selectWindTubeMode(this.selectedWindTubeMode);
        }
    }

    private syncDirectorTheoryFieldMode(stepId: string): void {
        if (stepId !== "theory") return;
        if (this.selectedTheoryCard !== "patterns") {
            return;
        }
        const option = this.currentTheoryFieldOption();
        if (this.directorApi && typeof this.directorApi.selectTheoryFieldMode === "function") {
            this.directorApi.selectTheoryFieldMode(option.id);
        }
    }

    private syncDirectorGradientPalette(stepId: string): void {
        if (stepId !== "theory" || !this.directorApi) return;
        const option = this.currentGradientPaletteOption();
        if (typeof this.directorApi.selectGradientPalette === "function") {
            if (typeof this.directorApi.getGradientPalette === "function") {
                const currentPalette = Math.floor(this.directorApi.getGradientPalette());
                if (currentPalette === option.index) return;
            }
            this.directorApi.selectGradientPalette(option.id);
        }
    }

    private syncDirectorGradientControls(stepId: string): void {
        if (stepId !== "theory" || !this.directorApi) return;
        if (typeof this.directorApi.setGradientScale === "function") {
            this.directorApi.setGradientScale(this.gradientScaleValue);
        } else if (typeof this.directorApi.setColorMapScale === "function") {
            this.directorApi.setColorMapScale(this.gradientScaleValue);
        } else {
            try { this.directorApi.vectorColorMapScale = this.gradientScaleValue; } catch (e) {}
        }

        if (typeof this.directorApi.setGradientOffset === "function") {
            this.directorApi.setGradientOffset(this.gradientOffsetValue);
        } else if (typeof this.directorApi.setColorMapOffset === "function") {
            this.directorApi.setColorMapOffset(this.gradientOffsetValue);
        } else {
            try { this.directorApi.vectorColorMapOffset = this.gradientOffsetValue; } catch (e) {}
        }
    }

    private applyGradientControlsToActiveVectorField(): void {
        const stepId = GUIDE_STEPS[this.currentIndex].id;
        if (stepId !== "theory" || this.selectedTheoryMode === "motion") return;

        const root = this.findObjectByName("Vector Field Examples Root");
        const api = this.findAnyScriptApi(root, "setColorMapScale") || this.findAnyScriptApi(root, "setGradientScale");
        if (!api) return;

        const palette = this.currentGradientPaletteOption();
        if (typeof api.setColorMap === "function") api.setColorMap(palette.id);
        else if (typeof api.setPalette === "function") api.setPalette(palette.id);
        else {
            try { api.colorMap = palette.index; } catch (e) {}
        }

        if (typeof api.setColorMapScale === "function") api.setColorMapScale(this.gradientScaleValue);
        else if (typeof api.setGradientScale === "function") api.setGradientScale(this.gradientScaleValue);
        else {
            try { api.colorMapScale = this.gradientScaleValue; } catch (e) {}
        }

        if (typeof api.setColorMapOffset === "function") api.setColorMapOffset(this.gradientOffsetValue);
        else if (typeof api.setGradientOffset === "function") api.setGradientOffset(this.gradientOffsetValue);
        else {
            try { api.colorMapOffset = this.gradientOffsetValue; } catch (e) {}
        }

        if (typeof api.updateMaterialParams === "function") {
            api.updateMaterialParams();
        }
    }

    private syncGradientValuesFromDirector(): void {
        if (!this.directorApi) return;
        try {
            if (typeof this.directorApi.getGradientScale === "function") {
                this.gradientScaleValue = this.snapSliderValue(this.directorApi.getGradientScale(), 0.05, 4.0, 0.01);
            } else if (this.directorApi.vectorColorMapScale !== undefined) {
                this.gradientScaleValue = this.snapSliderValue(this.directorApi.vectorColorMapScale, 0.05, 4.0, 0.01);
            }
        } catch (e) {}
        try {
            if (typeof this.directorApi.getGradientOffset === "function") {
                this.gradientOffsetValue = this.snapSliderValue(this.directorApi.getGradientOffset(), -1.0, 1.0, 0.01);
            } else if (this.directorApi.vectorColorMapOffset !== undefined) {
                this.gradientOffsetValue = this.snapSliderValue(this.directorApi.vectorColorMapOffset, -1.0, 1.0, 0.01);
            }
        } catch (e) {}
    }

    private setViewPlaneMode(mode: number): void {
        if (!this.currentStateCanCalibrate()) return;

        const nextMode = this.normalizeViewPlaneMode(mode);
        this.viewPlaneMode = nextMode;
        this.keepPlaneControlsWhileFolded = true;
        this.setFolded(true);

        if (this.directorApi && typeof this.directorApi.setViewPlaneMode === "function") {
            this.directorApi.setViewPlaneMode(nextMode);
        } else {
            const calibrationApi = this.findStageCalibrationApi();
            if (calibrationApi) {
                if (typeof calibrationApi.calibrateForMode === "function") {
                    calibrationApi.calibrateForMode(nextMode);
                } else {
                    if (typeof calibrationApi.setViewPlaneMode === "function") calibrationApi.setViewPlaneMode(nextMode);
                    if (typeof calibrationApi.setPlacementMode === "function") calibrationApi.setPlacementMode(nextMode);
                    if (typeof calibrationApi.recalibrate === "function") calibrationApi.recalibrate();
                }
            }
        }

        this.syncVisualState();
    }

    private resetActiveVisual(): void {
        this.setProxyPlaneActive(false);
        const director = this.directorApi as any;
        if (director) {
            if (typeof director.resetActiveVisual === "function") {
                director.resetActiveVisual();
            } else if (typeof director.resetToDefaultStance === "function") {
                director.resetToDefaultStance();
            } else if (typeof director.resetDefaultStance === "function") {
                director.resetDefaultStance();
            }
        }
        this.keepPlaneControlsWhileFolded = false;
        this.syncVisualState();
    }

    private bindMenuMoveHandle(binding: ButtonBinding, retries: number = 2): void {
        if (binding.moveEventsBound) return;

        const interactable = (binding.button as any).interactable;
        if (!interactable) {
            if (retries > 0) {
                try {
                    const delayed = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                    delayed.bind(() => this.bindMenuMoveHandle(binding, retries - 1));
                    delayed.reset(0.0);
                } catch (e) {}
            }
            return;
        }

        binding.moveEventsBound = true;
        this.listen(interactable.onTriggerStart, (event: any) => this.beginMenuDrag(event));
        this.listen(interactable.onTriggerUpdate, (event: any) => this.updateMenuDrag(event));
        this.listen(interactable.onTriggerEnd, () => this.endMenuDrag());
        this.listen(interactable.onTriggerCancel, () => this.endMenuDrag());
        this.listen(interactable.onTriggerCanceled, () => this.endMenuDrag());
        this.listen(interactable.onHoverExit, () => this.endMenuDrag());
        this.listen((binding.button as any).onTriggerUp, () => this.endMenuDrag());
    }

    private beginMenuDrag(event: any): void {
        const worldPoint = this.cursorWorldPointFromEvent(event);
        if (!worldPoint) return;

        this.menuDragActive = true;
        this.menuDragStartCursorWorld = worldPoint;
        this.menuDragStartMenuWorld = this.sceneObject.getTransform().getWorldPosition();
        if (this.followUser) {
            this.followUser = false;
            this.syncVisualState();
        }
    }

    private updateMenuDrag(event: any): void {
        if (!this.menuDragActive || !this.menuDragStartCursorWorld || !this.menuDragStartMenuWorld) return;
        const worldPoint = this.cursorWorldPointFromEvent(event);
        if (!worldPoint) return;

        const delta = worldPoint.sub(this.menuDragStartCursorWorld);
        this.sceneObject.getTransform().setWorldPosition(this.menuDragStartMenuWorld.add(delta));
        this.dockProxyPlaneSoftly();
    }

    private endMenuDrag(): void {
        if (!this.menuDragActive) return;
        this.menuDragActive = false;
        this.menuDragStartCursorWorld = null;
        this.menuDragStartMenuWorld = null;
        this.dockProxyPlaneSoftly();
    }

    private toggleProxyPlane(): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (!api || !this.proxyCanActivate(api)) {
            this.setProxyPlaneActive(false);
            this.syncProxyButtonState();
            return;
        }

        if (typeof api.toggleActive === "function") {
            api.toggleActive();
        } else {
            this.setProxyPlaneActive(!this.proxyIsActive(api));
        }
        this.syncProxyButtonState();
    }

    private setProxyPlaneActive(active: boolean): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (!api) return;
        if (typeof api.setActive === "function") {
            api.setActive(active);
        } else if (active && typeof api.activate === "function") {
            api.activate();
        } else if (!active && typeof api.deactivate === "function") {
            api.deactivate();
        } else if (!active && typeof api.cancelAndDock === "function") {
            api.cancelAndDock();
        }
    }

    private dockProxyPlaneSoftly(): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (api && typeof api.dockSoftly === "function") {
            api.dockSoftly();
        }
    }

    private syncProxyButtonState(): void {
        if (!this.proxyButton) return;
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        const available = !!api && this.proxyCanActivate(api);
        const active = !!api && this.proxyIsActive(api);

        this.proxyButton.normal = available ? TEX_UTILITY_PLANE_FRONT_OFF : TEX_UTILITY_PLANE_FRONT_OFF;
        this.proxyButton.active = TEX_UTILITY_PLANE_FRONT_ON;
        this.proxyButton.pressed = TEX_UTILITY_PLANE_FRONT_PRESSED;
        this.proxyButton.selected = active;
        if (!available) {
            this.proxyButton.hovered = false;
            this.proxyButton.pressedState = false;
        }
        this.updateBindingVisual(this.proxyButton);
        this.setButtonInteractionEnabled(this.proxyButton, available);
        this.setButtonImageAlpha(this.proxyButton, available ? 1.0 : 0.72);
    }

    private proxyCanActivate(api: any): boolean {
        if (!api) return false;
        try {
            if (typeof api.canActivate === "function") return api.canActivate();
            if (typeof api.hasActiveVisual === "function") return api.hasActiveVisual();
        } catch (e) {}
        return true;
    }

    private proxyIsActive(api: any): boolean {
        if (!api) return false;
        try {
            if (typeof api.isActive === "function") return api.isActive();
        } catch (e) {}
        return false;
    }

    private syncViewPlaneModeFromDirector(): void {
        if (this.directorApi && typeof this.directorApi.getViewPlaneMode === "function") {
            this.viewPlaneMode = this.normalizeViewPlaneMode(this.directorApi.getViewPlaneMode());
            return;
        }

        const calibrationApi = this.findStageCalibrationApi();
        if (calibrationApi && typeof calibrationApi.getViewPlaneMode === "function") {
            this.viewPlaneMode = this.normalizeViewPlaneMode(calibrationApi.getViewPlaneMode());
        } else if (calibrationApi && typeof calibrationApi.getPlacementMode === "function") {
            this.viewPlaneMode = this.normalizeViewPlaneMode(calibrationApi.getPlacementMode());
        }
    }

    private normalizeViewPlaneMode(mode: number): number {
        return Math.floor(mode) === 1 ? 1 : 0;
    }

    private currentStateCanCalibrate(): boolean {
        return false;
    }

    private currentExampleConfig(): any {
        for (let i = 0; i < STORY_GUIDE_EXAMPLES.cards.length; i++) {
            const example = STORY_GUIDE_EXAMPLES.cards[i] as any;
            if (example.id === this.selectedExampleField) return example;
        }
        return null;
    }

    private stageFallbackContent(stepId: string): void {
        if (!this.controlContentRoots) return;

        const showTheoryContent = stepId === "theory" && this.selectedTheoryCard === "patterns";
        const showMotion = showTheoryContent && this.selectedTheoryMode === "motion";
        const showVector = showTheoryContent && this.selectedTheoryMode !== "motion";
        const showExampleContent = stepId === "examples" && this.examplesDetailOpen;
        const showGravity = showExampleContent && this.selectedExampleField === "gravity";
        const showMagnetic = showExampleContent && this.selectedExampleField === "magnetism";
        const showWind = showExampleContent && this.selectedExampleField === "wind";
        const showAerodynamics = showExampleContent && this.selectedExampleField === "aerodynamics";
        const showWindGlobe = showWind;
        const showCarFlow = showAerodynamics;
        const showArtemis = showGravity && this.selectedGravityVariant === "artemis";

        this.setObjectEnabledByName("Motion Field Root", showMotion);
        this.setObjectEnabledByName("Vector Field Examples Root", showVector);
        this.setVectorFieldTargetEnabled(showVector);
        this.setObjectEnabledByName("Magnetic Field Root", showMagnetic);
        this.setObjectEnabledByName("Gravity Field Root", showGravity);
        this.setObjectEnabledByName("Artemis Trajectory Path", showArtemis);
        this.setObjectEnabledByName("Mission Info", showArtemis);
        this.setObjectEnabledByName("MissionInfoPanel", showArtemis);
        this.setObjectEnabledByName("Globe Calibration", showWindGlobe);
        this.setObjectEnabledByName("Car Fluid Flow", showCarFlow);
        if (showMotion || showVector) {
            this.stageFallbackTheoryFieldMode();
            if (showVector) this.restoreVectorFieldTarget();
        }
        if (showGravity) {
            this.applyGravityStage(this.findObjectByName("Gravity Field Root"));
        }
        if (showMagnetic) {
            this.applyTubeMode(this.findObjectByName("Magnetic Field Root"), this.selectedMagnetismTubeMode);
        }
        if (showWindGlobe) {
            this.applyTubeMode(this.findObjectByName("Globe Calibration"), this.selectedWindTubeMode);
        }
    }

    private restoreVectorFieldTarget(): void {
        const root = this.findObjectByName("Vector Field Examples Root");
        const target = root ? this.findInTree(root, "Target") : this.findObjectByName("Target");
        if (!target) return;
        target.enabled = true;

        const visual = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (visual) visual.enabled = true;

        const colliders = target.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = true;
        }

        const scripts = target.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script) script.enabled = true;
        }
    }

    private setVectorFieldTargetEnabled(enabled: boolean): void {
        if (enabled) {
            this.restoreVectorFieldTarget();
            return;
        }
        const root = this.findObjectByName("Vector Field Examples Root");
        const target = root ? this.findInTree(root, "Target") : this.findObjectByName("Target");
        if (target) target.enabled = false;
    }

    private applyGravityStage(root: SceneObject | null): void {
        const api = this.findAnyScriptApi(root, "setStage");
        if (!api) return;
        if (typeof api.setStage === "function") api.setStage(this.selectedGravityStage);
        if (typeof api.setCelestialMotionEnabled === "function") {
            api.setCelestialMotionEnabled(this.selectedGravityVariant === "artemis");
        }
    }

    private applyTubeMode(root: SceneObject | null, mode: number): void {
        const api = this.findAnyScriptApi(root, "setTubeMode");
        if (!api) return;
        if (typeof api.setTubeMode === "function") api.setTubeMode(mode);
        else {
            try { api.tubeMode = mode; } catch (e) {}
        }
        if (typeof api.refresh === "function") api.refresh();
        else if (typeof api.queueRefresh === "function") api.queueRefresh(0.01);
    }

    private stageFallbackTheoryFieldMode(): void {
        const usePlane = this.selectedTheoryMode === "motion";
        const root = this.findObjectByName(usePlane ? "Motion Field Root" : "Vector Field Examples Root");
        const api = this.findAnyScriptApi(root, "setPreset");
        if (!api) return;

        const option = this.currentTheoryFieldOption();
        if (usePlane) {
            if (typeof api.setPreset === "function") api.setPreset(option.id);
            else if (typeof api.setFieldMode === "function") api.setFieldMode(option.id);
            if (typeof api.stage === "function") api.stage();
            return;
        }

        if (typeof api.setTubeMode === "function") api.setTubeMode(2);
        else {
            try { api.tubeMode = 2; } catch (e) {}
        }
        if (typeof api.setDomainMode === "function") api.setDomainMode(0);
        else {
            try { api.domainMode = 0; } catch (e) {}
        }
        if (typeof api.setFieldScaleNormalized === "function") api.setFieldScaleNormalized(0.36);
        if (typeof api.setFlowSpeedNormalized === "function") api.setFlowSpeedNormalized(0.52);
        if (typeof api.setRadiusNormalized === "function") api.setRadiusNormalized(0.10);
        const palette = this.currentGradientPaletteOption();
        if (typeof api.setColorMap === "function") api.setColorMap(palette.id);
        else if (typeof api.setPalette === "function") api.setPalette(palette.id);
        else {
            try { api.colorMap = palette.index; } catch (e) {}
        }
        if (typeof api.setColorMapScale === "function") api.setColorMapScale(this.gradientScaleValue);
        else if (typeof api.setGradientScale === "function") api.setGradientScale(this.gradientScaleValue);
        else {
            try { api.colorMapScale = this.gradientScaleValue; } catch (e) {}
        }
        if (typeof api.setColorMapOffset === "function") api.setColorMapOffset(this.gradientOffsetValue);
        else if (typeof api.setGradientOffset === "function") api.setGradientOffset(this.gradientOffsetValue);
        else {
            try { api.colorMapOffset = this.gradientOffsetValue; } catch (e) {}
        }
        if (typeof api.setPreset === "function") api.setPreset(option.preset);
        else {
            try { api.preset = option.preset; } catch (e) {}
        }
        if (typeof api.refresh === "function") api.refresh();
    }

    private setBindingTexture(binding: ButtonBinding, texture: Texture): void {
        this.applyTexture(binding.image.material, texture, binding.image.component);
    }

    private updateBindings(bindings: ButtonBinding[]): void {
        for (let i = 0; i < bindings.length; i++) {
            this.updateBindingVisual(bindings[i]);
        }
    }

    private updateBindingVisual(binding: ButtonBinding): void {
        const baseTexture = binding.pressedState ? binding.pressed : (binding.selected ? binding.active : binding.normal);
        this.setBindingTexture(binding, baseTexture);

        if (binding.pressedState) {
            binding.targetScale = 0.985;
            binding.targetLift = 0.0;
        } else if (binding.hovered) {
            binding.targetScale = 1.025;
            binding.targetLift = 0.0;
        } else if (binding.selected) {
            binding.targetScale = 1.015;
            binding.targetLift = 0.0;
        } else {
            binding.targetScale = 1.0;
            binding.targetLift = 0.0;
        }
        binding.overlay.object.enabled = false;

        if (binding.label) {
            const color = binding.selected
                ? new vec4(1.0, 1.0, 1.0, 1.0)
                : (binding.hovered ? new vec4(0.96, 0.97, 0.98, 1.0) : new vec4(0.78, 0.80, 0.82, 1.0));
            try {
                binding.label.textFill.color = color;
            } catch (e) {}
        }
    }

    private setButtonImageAlpha(binding: ButtonBinding, alpha: number): void {
        const clamped = this.clamp(alpha, 0.0, 1.0);
        const pass = this.tryMainPass(binding.image.material);
        if (pass) {
            try { pass.baseColor = new vec4(1.0, 1.0, 1.0, clamped); } catch (e) {}
        }
    }

    private setButtonInteractionEnabled(binding: ButtonBinding, enabled: boolean): void {
        const interactable = (binding.button as any).interactable;
        if (interactable) {
            try { interactable.enabled = enabled; } catch (e) {}
        }
        const colliders = binding.object.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = enabled;
        }
    }

    private setSliderInteractionEnabled(binding: GradientSliderBinding, enabled: boolean): void {
        const interactable = (binding.button as any).interactable;
        if (interactable) {
            try { interactable.enabled = enabled; } catch (e) {}
        }
        const colliders = binding.object.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = enabled;
        }
    }

    private applyTexture(material: Material, texture: Texture, image?: Image): void {
        if (!material || !texture) return;
        const pass = this.tryMainPass(material);
        if (pass) {
            this.configureTransparentDepthPass(pass);
            try { pass.baseTex = texture; } catch (e) {}
            try { pass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
        }
        const imagePass = image ? this.tryMainPass(image) : null;
        if (imagePass) {
            this.configureTransparentDepthPass(imagePass);
            try { imagePass.baseTex = texture; } catch (e) {}
            try { imagePass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
        }
    }

    private tryMainPass(owner: any): any {
        if (!owner) return null;
        try {
            return owner.mainPass as any;
        } catch (e) {
            return null;
        }
    }

    private configureTransparentDepthPass(pass: any): void {
        if (!pass) return;
        try { pass.depthTest = true; } catch (e) {}
        try { pass.DepthTest = true; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
        try { pass.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        try { pass.BlendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        try { pass.twoSided = true; } catch (e) {}
        try { pass.TwoSided = true; } catch (e) {}
    }

    private setImageAlpha(binding: ImageBinding, alpha: number): void {
        const color = new vec4(1.0, 1.0, 1.0, this.clamp(alpha, 0.0, 1.0));
        const pass = this.tryMainPass(binding.material);
        if (pass) {
            try { pass.baseColor = color; } catch (e) {}
        }
        const imagePass = this.tryMainPass(binding.component);
        if (imagePass) {
            try { imagePass.baseColor = color; } catch (e) {}
        }
    }

    private offsetSlot(slot: StoryGuideSlot): StoryGuideSlot {
        return {
            x: slot.x + this.panelOffset.x,
            y: slot.y + this.panelOffset.y,
            width: slot.width,
            height: slot.height,
        };
    }

    private cloneSlot(slot: StoryGuideSlot): StoryGuideSlot {
        return {
            x: slot.x,
            y: slot.y,
            width: slot.width,
            height: slot.height,
        };
    }

    private place(object: SceneObject, x: number, y: number, z: number): void {
        const t = object.getTransform();
        t.setLocalPosition(new vec3(x, y, z));
        t.setLocalRotation(quat.quatIdentity());
        t.setLocalScale(new vec3(1, 1, 1));
    }

    private placeImage(binding: ImageBinding, x: number, y: number, z: number, width: number, height: number): void {
        const transform = binding.object.getTransform();
        transform.setLocalPosition(new vec3(x, y, z));
        transform.setLocalRotation(quat.quatIdentity());
        transform.setLocalScale(new vec3(width, height, 1.0));
        binding.width = width;
        binding.height = height;
        binding.z = z;
    }

    private registerHiddenUIKitButton(button: RectangleButton): void {
        for (let i = 0; i < this.hiddenUIKitButtons.length; i++) {
            if (this.hiddenUIKitButtons[i] === button) {
                this.hideUIKitVisual(button);
                return;
            }
        }
        this.hiddenUIKitButtons.push(button);
        this.hideUIKitVisual(button);
    }

    private configureUIKitButton(button: RectangleButton, width: number, height: number, depth: number, renderOrder: number): void {
        try { button.size = new vec3(width, height, depth); } catch (e) {}
        try { button.renderOrder = renderOrder; } catch (e) {}
        this.initializeUIKitButton(button);
        this.configureDefaultCursorTarget(button);
    }

    private initializeUIKitButton(button: RectangleButton): void {
        try {
            button.initialize();
        } catch (e) {
            try {
                const delayed = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                delayed.bind(() => {
                    try { button.initialize(); } catch (inner) {}
                    this.hideUIKitVisual(button);
                });
                delayed.reset(0.0);
            } catch (inner) {}
        }
    }

    private configureDefaultCursorTarget(button: RectangleButton): void {
        const apply = (): boolean => {
            const interactable = (button as any).interactable;
            if (!interactable) return false;

            try { interactable.targetingMode = TargetingMode.All; } catch (e) {}
            try { interactable.targetingVisual = 1; } catch (e) {}
            try { interactable.ignoreInteractionPlane = true; } catch (e) {}
            return true;
        };

        if (apply()) return;
        try {
            const delayed = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
            delayed.bind(() => apply());
            delayed.reset(0.0);
        } catch (e) {}
    }

    private hideRegisteredUIKitVisuals(): void {
        for (let i = 0; i < this.hiddenUIKitButtons.length; i++) {
            this.hideUIKitVisual(this.hiddenUIKitButtons[i]);
        }
    }

    private hideUIKitVisual(button: RectangleButton): void {
        try {
            const visual = (button as any).visual;
            if (visual) {
                try { visual.hasBorder = false; } catch (e) {}
                try { visual.borderSize = 0.0; } catch (e) {}
            }
            if (visual && visual.renderMeshVisual) {
                visual.renderMeshVisual.enabled = false;
            }
        } catch (e) {}
    }

    private bindCursorEvents(button: RectangleButton, binding: ButtonBinding, retries: number = 2): void {
        if (binding.cursorEventsBound) return;

        const interactable = (button as any).interactable;
        if (!interactable) {
            if (retries > 0) {
                try {
                    const delayed = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                    delayed.bind(() => this.bindCursorEvents(button, binding, retries - 1));
                    delayed.reset(0.0);
                } catch (e) {}
            }
            return;
        }

        binding.cursorEventsBound = true;
        this.listen(interactable.onHoverEnter, (event: any) => {
            this.setTextureButtonHover(binding, true);
            this.showCursorFromEvent(binding, false, event);
        });
        this.listen(interactable.onHoverUpdate, (event: any) => this.showCursorFromEvent(binding, false, event));
        this.listen(interactable.onHoverExit, () => this.setTextureButtonHover(binding, false));
        this.listen(interactable.onTriggerStart, (event: any) => this.showCursorFromEvent(binding, true, event));
        this.listen(interactable.onTriggerUpdate, (event: any) => this.showCursorFromEvent(binding, true, event));
    }

    private bindButtonActionEvents(button: RectangleButton, binding: ButtonBinding, action: () => void, retries: number = 2): void {
        if (!binding.actionButtonEventBound) {
            binding.actionButtonEventBound = true;
            this.listen((button as any).onTriggerUp, () => this.runTextureButtonAction(binding, action));
        }

        if (binding.actionInteractableEventBound) return;
        const interactable = (button as any).interactable;
        if (!interactable) {
            if (retries > 0) {
                try {
                    const delayed = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                    delayed.bind(() => this.bindButtonActionEvents(button, binding, action, retries - 1));
                    delayed.reset(0.0);
                } catch (e) {}
            }
            return;
        }

        binding.actionInteractableEventBound = true;
        this.listen(interactable.onTriggerEnd, () => this.runTextureButtonAction(binding, action));
    }

    private runTextureButtonAction(binding: ButtonBinding, action: () => void): void {
        const now = getTime();
        if (binding.lastActionTime !== undefined && now - binding.lastActionTime < 0.12) return;
        binding.lastActionTime = now;
        action();
        binding.pressedState = false;
        if (binding.hovered) {
            this.showCursor(binding, false);
        }
        this.syncVisualState();
    }

    private setTextureButtonHover(binding: ButtonBinding, hovered: boolean): void {
        binding.hovered = hovered;
        this.hidePanelCursor();

        if (hovered) {
            this.showCursor(binding, binding.pressedState);
            this.updateBindingVisual(binding);
            return;
        }

        binding.pressedState = false;
        if (this.cursorOwner === binding) {
            this.hideCursor();
        }
        this.updateBindingVisual(binding);
    }

    private findDirectorApi(): any {
        const preferredRoot = this.directorRoot || this.findObjectByName("Story Step Director");
        const preferred = this.findScriptApi(preferredRoot, "stageStep");
        if (preferred) return preferred;
        return this.findScriptApi(this.sceneObject, "stageStep");
    }

    private findProxyApi(): any {
        const root = this.findObjectByName("ProxyInteractionPlane");
        return this.findScriptApi(root, "toggleActive") || this.findScriptApi(root, "activate");
    }

    private findStageCalibrationApi(): any {
        const root = this.findObjectByName("Stage Calibration");
        return this.findScriptApi(root, "calibrateIfNeeded") || this.findScriptApi(root, "setPlacementMode");
    }

    private findScriptApi(root: SceneObject | null, methodName: string): any {
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && typeof script[methodName] === "function") return script;
        }
        return null;
    }

    private findAnyScriptApi(root: SceneObject | null, methodName: string): any {
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            const api = (script && (script.motionFieldApi || script.fieldApi || script.gravityApi || script.windApi || script.panelApi)) || script;
            if (api && typeof api[methodName] === "function") return api;
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const childApi = this.findAnyScriptApi(root.getChild(i), methodName);
            if (childApi) return childApi;
        }
        return null;
    }

    private updateMenuPose(): void {
        this.applyMenuVisualScale();
        if (!this.followUser) return;
        const camera = this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
        if (!camera) return;

        const cameraTransform = camera.getTransform();
        const cameraPosition = cameraTransform.getWorldPosition();
        const cameraRotation = cameraTransform.getWorldRotation();
        const worldUp = new vec3(0.0, 1.0, 0.0);
        const cameraForward = cameraRotation.multiplyVec3(new vec3(0.0, 0.0, -1.0));
        const forward = this.safeHorizontalDirection(cameraForward, new vec3(0.0, 0.0, -1.0));
        const right = this.safeDirection(new vec3(forward.z, 0.0, -forward.x), new vec3(1.0, 0.0, 0.0));
        const target = cameraPosition
            .add(right.uniformScale(this.menuHorizontalOffsetCm))
            .add(worldUp.uniformScale(this.menuVerticalOffsetCm + this.menuLowerOffsetCm))
            .add(forward.uniformScale(this.menuDistanceCm));

        const transform = this.sceneObject.getTransform();
        const current = transform.getWorldPosition();
        const alpha = this.clamp(getDeltaTime() * Math.max(0.0, this.followSmoothing), 0.05, 1.0);
        const next = this.mixVec3(current, target, alpha);
        transform.setWorldPosition(next);

        const toCamera = cameraPosition.sub(next);
        const horizontalFace = this.safeHorizontalDirection(toCamera, new vec3(0.0, 0.0, 1.0));
        const directFace = this.safeDirection(toCamera, horizontalFace);
        const faceDirection = this.safeDirection(
            this.mixVec3(horizontalFace, directFace, this.clamp(this.menuBillboardPitchBlend, 0.0, 1.0)),
            horizontalFace
        );
        if (faceDirection.length > 0.0001) {
            transform.setWorldRotation(quat.lookAt(faceDirection, worldUp));
        }
    }

    private applyMenuVisualScale(): void {
        const s = Math.max(0.1, this.menuVisualScale);
        this.sceneObject.getTransform().setLocalScale(new vec3(s, s, s));
    }

    private syncFoldState(): void {
        for (let i = 0; i < this.foldableObjects.length; i++) {
            this.foldableObjects[i].enabled = !this.folded;
        }
        for (let i = 0; i < this.utilityButtons.length; i++) {
            const utility = this.utilityButtons[i];
            // Reset is not part of the folded toolbar, so it hides when collapsed.
            utility.object.enabled = !(this.folded && utility.id === "reset");
        }
        if (this.folded) {
            this.hideCursor();
            this.hidePanelCursor();
        }
    }

    private syncMenuModeVisibility(): void {
        const showMainMenu = !this.folded && !this.examplesMenuOpen && !this.theoryMenuOpen;
        const showPageNav = !this.folded && this.theoryMenuOpen &&
            (this.selectedTheoryCard === "metrics" || this.selectedTheoryCard === "definition");
        const showNav = showPageNav;
        for (let i = 0; i < this.cards.length; i++) {
            this.cards[i].object.enabled = showMainMenu;
        }
        for (let i = 0; i < this.navButtons.length; i++) {
            const binding = this.navButtons[i];
            const enabled = showNav && this.canUseNavButton(binding.id);
            binding.object.enabled = enabled;
            if (!enabled) {
                binding.hovered = false;
                binding.pressedState = false;
                this.updateBindingVisual(binding);
            }
        }
        if (this.progressObject) {
            this.progressObject.enabled = false;
        }
        if (this.examplesBackButton) {
            this.examplesBackButton.object.enabled = !this.folded && (this.examplesMenuOpen || this.theoryMenuOpen);
        }
        if (this.panelHitObject) {
            this.panelHitObject.enabled = !this.folded;
        }
        if (this.cursorOwner && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
        const canCalibrate = this.currentStateCanCalibrate();
        if (!canCalibrate) {
            this.keepPlaneControlsWhileFolded = false;
        }
        const showPlaneControls = canCalibrate && (!this.folded || this.keepPlaneControlsWhileFolded);
        for (let i = 0; i < this.viewPlaneButtons.length; i++) {
            this.viewPlaneButtons[i].object.enabled = showPlaneControls;
            if (!showPlaneControls) {
                this.viewPlaneButtons[i].hovered = false;
                this.viewPlaneButtons[i].pressedState = false;
            }
        }
        if (!showPlaneControls && this.cursorOwner && this.isViewPlaneBinding(this.cursorOwner)) {
            this.hideCursor();
        }
    }

    private canUseNavButton(id: string): boolean {
        if (id === "back") {
            return this.canScrollBack();
        }
        if (id === "next") {
            return this.canScrollNext();
        }
        return true;
    }

    private canScrollBack(): boolean {
        if (this.theoryMenuOpen) {
            if (this.selectedTheoryCard === "metrics") {
                return this.metricsPage > 0;
            }
            if (this.selectedTheoryCard === "definition") {
                return this.definitionPage > 0;
            }
            return false;
        }
        return this.currentIndex > 0;
    }

    private canScrollNext(): boolean {
        if (this.theoryMenuOpen) {
            if (this.selectedTheoryCard === "metrics") {
                return this.metricsPage < MATH_EXPLAINER_TEXTURES.length - 1;
            }
            if (this.selectedTheoryCard === "definition") {
                return this.definitionPage < VF_DEFINITION_TEXTURES.length - 1;
            }
            return false;
        }
        return this.currentIndex < GUIDE_STEPS.length - 1;
    }

    private syncUtilityDockTargets(): void {
        if (this.moveHandleButton) {
            this.setButtonTargetSlot(
                this.moveHandleButton,
                this.offsetSlot(this.folded ? MENU_MOVE_HANDLE_SLOT_FOLDED : MENU_MOVE_HANDLE_SLOT)
            );
        }
        if (this.followButton) {
            this.setButtonTargetSlot(
                this.followButton,
                this.offsetSlot(STORY_GUIDE_UTILITY.follow)
            );
        }
        if (this.foldButton) {
            this.setButtonTargetSlot(
                this.foldButton,
                this.offsetSlot(STORY_GUIDE_UTILITY.fold)
            );
        }
        if (this.resetButton) {
            this.setButtonTargetSlot(
                this.resetButton,
                this.offsetSlot(STORY_GUIDE_UTILITY.planeFloor)
            );
        }
        if (this.proxyButton) {
            this.setButtonTargetSlot(
                this.proxyButton,
                this.offsetSlot(this.folded ? PROXY_SLOT_FOLDED : STORY_GUIDE_UTILITY.planeFront)
            );
        }
    }

    private setButtonTargetSlot(binding: ButtonBinding, slot: StoryGuideSlot): void {
        binding.targetSlot = this.cloneSlot(slot);
    }

    private isViewPlaneBinding(binding: ButtonBinding): boolean {
        return binding.id === "plane:floor" || binding.id === "plane:front";
    }

    private isVariantBinding(binding: ButtonBinding): boolean {
        return binding.id.indexOf("variant:") === 0;
    }

    private isExampleModeBinding(binding: ButtonBinding): boolean {
        return binding.id.indexOf("example_mode:") === 0;
    }

    private isTheoryBinding(binding: ButtonBinding): boolean {
        return binding.id.indexOf("theory_mode:") === 0;
    }

    private isPaletteBinding(binding: ButtonBinding): boolean {
        return binding.id.indexOf("palette:") === 0;
    }

    private variantOptionForBinding(binding: ButtonBinding): ExampleVariantOption | null {
        const id = binding.id.indexOf("variant:") === 0 ? binding.id.substr(8) : binding.id;
        return this.variantOptionForId(id as ExampleVariantId);
    }

    private exampleModeOptionForBinding(binding: ButtonBinding): ExampleModeOption | null {
        const id = binding.id.indexOf("example_mode:") === 0 ? binding.id.substr(13) : binding.id;
        return this.exampleModeOptionForId(id as ExampleModeId);
    }

    private paletteOptionForBinding(binding: ButtonBinding): GradientPaletteOption | null {
        const id = binding.id.indexOf("palette:") === 0 ? binding.id.substr(8) : binding.id;
        return this.paletteOptionForId(id as GradientPaletteId);
    }

    private syncFieldSelectorState(): void {
        const visible = !this.folded && this.examplesMenuOpen && !this.examplesDetailOpen;
        for (let i = 0; i < this.fieldSelectorButtons.length; i++) {
            const binding = this.fieldSelectorButtons[i];
            binding.object.enabled = visible;
            binding.selected = this.hasSelectedExampleField && binding.id === "field:" + this.selectedExampleField;
            this.updateBindingVisual(binding);
        }
    }

    private syncVariantState(): void {
        const visibleField = !this.folded && this.examplesMenuOpen && this.examplesDetailOpen ? this.selectedExampleField : "";
        for (let i = 0; i < this.variantButtons.length; i++) {
            const binding = this.variantButtons[i];
            const option = this.variantOptionForBinding(binding);
            let visible = !!option && option.field === visibleField;
            if (visible && option && option.id === "gravity:artemis" && this.selectedGravityVariant === "artemis") {
                visible = false;
            }
            binding.object.enabled = visible;
            if (!visible) {
                binding.hovered = false;
                binding.pressedState = false;
            }
            binding.selected = visible && binding.id === "variant:" + this.currentVariantId();
            this.updateBindingVisual(binding);
        }
        if (this.cursorOwner && this.isVariantBinding(this.cursorOwner) && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private syncExampleModeState(): void {
        const visibleField = !this.folded && this.examplesMenuOpen && this.examplesDetailOpen ? this.selectedExampleField : "";
        const selectedMode = this.currentExampleModeId();
        const magneticAdvancedActive = visibleField === "magnetism" && this.magneticAdvancedOpen;
        for (let i = 0; i < this.exampleModeButtons.length; i++) {
            const binding = this.exampleModeButtons[i];
            const option = this.exampleModeOptionForBinding(binding);
            const visible = !!option && option.field === visibleField && visibleField !== "gravity" && visibleField !== "wind" && !magneticAdvancedActive;
            binding.object.enabled = visible;
            if (!visible) {
                binding.hovered = false;
                binding.pressedState = false;
            }
            binding.selected = visible && binding.id === "example_mode:" + selectedMode;
            this.updateBindingVisual(binding);
        }
        if (this.cursorOwner && this.isExampleModeBinding(this.cursorOwner) && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private syncMagneticAdvancedState(): void {
        const visible = this.isMagneticDetailActive();
        if (this.magneticAdvancedButton) {
            this.magneticAdvancedButton.object.enabled = visible;
            if (!visible) {
                this.magneticAdvancedButton.hovered = false;
                this.magneticAdvancedButton.pressedState = false;
            }
            if (this.magneticAdvancedButton.label) {
                this.magneticAdvancedButton.label.text = this.magneticAdvancedOpen ? "Done" : "Advanced";
            }
            this.magneticAdvancedButton.selected = visible && this.magneticAdvancedOpen;
            this.updateBindingVisual(this.magneticAdvancedButton);
        }

        const slidersVisible = visible && this.magneticAdvancedOpen;
        for (let i = 0; i < this.magneticSliders.length; i++) {
            const binding = this.magneticSliders[i];
            binding.object.enabled = slidersVisible;
            if (!slidersVisible) {
                binding.hovered = false;
                binding.pressed = false;
            }
            this.updateGradientSliderVisual(binding);
        }

        if (this.cursorOwner && this.cursorOwner.id === "magnetic_advanced" && (!this.magneticAdvancedButton || !this.magneticAdvancedButton.object.enabled)) {
            this.hideCursor();
        }
        if (!slidersVisible) {
            this.hidePanelCursor();
        }
    }

    private syncTheoryFieldModeState(): void {
        const visible = !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "patterns";
        for (let i = 0; i < this.theoryModeButtons.length; i++) {
            const binding = this.theoryModeButtons[i];
            const option = this.theoryOptionForBinding(binding);
            binding.object.enabled = visible;
            this.setButtonInteractionEnabled(binding, visible);
            if (!visible) {
                binding.hovered = false;
                binding.pressedState = false;
            }
            binding.selected = visible && !!option && option.id === this.selectedTheoryMode;
            this.updateBindingVisual(binding);
        }
        if (this.cursorOwner && this.isTheoryBinding(this.cursorOwner) && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private syncMotionInstructionState(): void {
        const visible = !this.folded &&
            this.theoryMenuOpen &&
            this.selectedTheoryCard === "patterns" &&
            this.selectedTheoryMode === "motion";
        if (!this.motionInstructionObject) {
            if (visible) this.createMotionInstructionText();
            else return;
        }
        if (this.motionInstructionObject) {
            this.motionInstructionObject.enabled = visible;
        }
    }

    private syncGradientPaletteState(): void {
        const visible = !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "patterns" && this.selectedTheoryMode !== "motion";
        for (let i = 0; i < this.paletteButtons.length; i++) {
            const binding = this.paletteButtons[i];
            const option = this.paletteOptionForBinding(binding);
            binding.object.enabled = visible;
            this.setButtonInteractionEnabled(binding, visible);
            if (!visible) {
                binding.hovered = false;
                binding.pressedState = false;
            }
            binding.selected = visible && !!option && option.id === this.selectedGradientPalette;
            this.updateBindingVisual(binding);
        }
        if (this.cursorOwner && this.isPaletteBinding(this.cursorOwner) && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private syncGradientSliderState(): void {
        const visible = !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "patterns" && this.selectedTheoryMode !== "motion";
        for (let i = 0; i < this.gradientSliders.length; i++) {
            const binding = this.gradientSliders[i];
            binding.object.enabled = visible;
            this.setSliderInteractionEnabled(binding, visible);
            if (!visible) {
                binding.hovered = false;
                binding.pressed = false;
            }
            this.updateGradientSliderVisual(binding);
        }
    }

    private updateTheoryPatternUiSettle(): void {
        if (this.theoryPatternUiSettleRemaining <= 0.0) return;
        this.theoryPatternUiSettleRemaining = Math.max(0.0, this.theoryPatternUiSettleRemaining - getDeltaTime());
        if (this.isTheoryPatternInterfaceActive()) {
            this.forceTheoryPatternInterfaceNow();
        }
    }

    private isTheoryPatternInterfaceActive(): boolean {
        return !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "patterns";
    }

    private forceTheoryPatternInterfaceNow(): void {
        if (this.theoryModeButtons.length < THEORY_FIELD_OPTIONS.length) {
            this.createTheoryFieldSelectors();
        }
        if (this.paletteButtons.length < GRADIENT_PALETTE_OPTIONS.length) {
            this.createGradientPaletteSelectors();
        }
        if (this.gradientSliders.length < 2) {
            this.createGradientSliders();
        }
        if (!this.theoryInfoImage) {
            this.createTheoryInfoCard();
        }
        this.forceTheoryPatternExperienceEnabled();
        this.hideTheoryCardButtonsNow();
        this.updateTheoryPatternControlSlots();
        this.updateTheoryPanelTexture();
        this.syncMenuModeVisibility();
        this.syncTheoryCardState();
        this.syncTheoryFieldModeState();
        this.syncGradientPaletteState();
        this.syncGradientSliderState();
    }

    private updateTheoryPatternControlSlots(): void {
        for (let i = 0; i < THEORY_FIELD_OPTIONS.length; i++) {
            const option = THEORY_FIELD_OPTIONS[i];
            const newId = "theory_mode:" + option.id;
            const binding = this.findCardBinding(this.theoryModeButtons, newId) ||
                this.findCardBinding(this.theoryModeButtons, "theory:" + option.id);
            if (!binding) continue;
            binding.id = newId;
            this.placeButtonBindingNow(binding, this.offsetSlot(option.slot));
        }

        for (let i = 0; i < GRADIENT_PALETTE_OPTIONS.length; i++) {
            const option = GRADIENT_PALETTE_OPTIONS[i];
            const binding = this.findCardBinding(this.paletteButtons, "palette:" + option.id);
            if (!binding) continue;
            this.placeButtonBindingNow(binding, this.offsetSlot(option.slot));
        }

        this.placeGradientSliderNow("scale", this.offsetSlot(GRADIENT_SCALE_SLOT));
        this.placeGradientSliderNow("offset", this.offsetSlot(GRADIENT_OFFSET_SLOT));
    }

    private placeButtonBindingNow(binding: ButtonBinding, slot: StoryGuideSlot): void {
        binding.homeSlot = this.cloneSlot(slot);
        binding.targetSlot = this.cloneSlot(slot);
        binding.slot = this.cloneSlot(slot);
        this.place(binding.object, slot.x, slot.y, BUTTON_HIT_Z);
        this.placeImage(binding.image, 0.0, 0.0, binding.image.z, slot.width, slot.height);
        this.placeImage(binding.overlay, 0.0, 0.0, binding.overlay.z, slot.width, slot.height);
        this.updateButtonHitSize(binding, slot);
    }

    private placeGradientSliderNow(id: GradientSliderId, slot: StoryGuideSlot): void {
        for (let i = 0; i < this.gradientSliders.length; i++) {
            const binding = this.gradientSliders[i];
            if (binding.id !== id) continue;
            binding.slot = this.cloneSlot(slot);
            this.place(binding.object, slot.x, slot.y, BUTTON_HIT_Z);
            this.configureUIKitButton(binding.button, slot.width, slot.height, BUTTON_HIT_DEPTH_CM, 248);
            this.updateGradientSliderVisual(binding);
            return;
        }
    }

    private prewarmTheoryPatternControls(): void {
        if (this.theoryPatternControlsPrewarmed) return;
        this.theoryPatternControlsPrewarmed = true;

        const offscreenSlot: StoryGuideSlot = { x: 0.0, y: -1000.0, width: 1.0, height: 1.0 };
        for (let i = 0; i < this.theoryModeButtons.length; i++) {
            const binding = this.theoryModeButtons[i];
            this.placeButtonBindingNow(binding, offscreenSlot);
            binding.object.enabled = true;
            this.setButtonInteractionEnabled(binding, false);
        }
        for (let i = 0; i < this.paletteButtons.length; i++) {
            const binding = this.paletteButtons[i];
            this.placeButtonBindingNow(binding, offscreenSlot);
            binding.object.enabled = true;
            this.setButtonInteractionEnabled(binding, false);
        }
        for (let i = 0; i < this.gradientSliders.length; i++) {
            const binding = this.gradientSliders[i];
            binding.slot = this.cloneSlot(offscreenSlot);
            this.place(binding.object, offscreenSlot.x, offscreenSlot.y, BUTTON_HIT_Z);
            binding.object.enabled = true;
            this.setSliderInteractionEnabled(binding, false);
            this.updateGradientSliderVisual(binding);
        }

        const hideAfterWarm = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        hideAfterWarm.bind(() => this.hidePrewarmedTheoryPatternControls());
        hideAfterWarm.reset(0.0);
    }

    private hidePrewarmedTheoryPatternControls(): void {
        if (this.isTheoryPatternInterfaceActive()) {
            this.forceTheoryPatternInterfaceNow();
            return;
        }
        for (let i = 0; i < this.theoryModeButtons.length; i++) {
            this.theoryModeButtons[i].object.enabled = false;
            this.setButtonInteractionEnabled(this.theoryModeButtons[i], false);
        }
        for (let i = 0; i < this.paletteButtons.length; i++) {
            this.paletteButtons[i].object.enabled = false;
            this.setButtonInteractionEnabled(this.paletteButtons[i], false);
        }
        for (let i = 0; i < this.gradientSliders.length; i++) {
            this.gradientSliders[i].object.enabled = false;
            this.setSliderInteractionEnabled(this.gradientSliders[i], false);
        }
    }

    private forceTheoryPatternExperienceEnabled(): void {
        if (this.directorApi && typeof this.directorApi.stageStep === "function") {
            if (this.selectedTheoryMode !== "motion") this.restoreVectorFieldTarget();
            this.beginMainExperiencePrioritySettle();
            return;
        }
        this.stageFallbackContent("theory");
        this.beginMainExperiencePrioritySettle();
    }

    private isMagneticDetailActive(): boolean {
        return !this.folded && this.examplesMenuOpen && this.examplesDetailOpen && this.selectedExampleField === "magnetism";
    }

    private toggleMagneticAdvanced(): void {
        if (!this.isMagneticDetailActive()) return;
        this.magneticAdvancedOpen = !this.magneticAdvancedOpen;
    }

    private isMagneticSliderId(id: ControlSliderId): id is MagneticSliderId {
        return id === "mag_power" || id === "mag_pull" || id === "mag_length" || id === "mag_speed";
    }

    private setMagneticSliderValue(id: MagneticSliderId, value: number): void {
        const normalized = this.clamp(value, 0.0, 1.0);
        if (id === "mag_power") {
            this.magneticPowerValue = normalized;
        } else if (id === "mag_pull") {
            this.magneticPullValue = normalized;
        } else if (id === "mag_length") {
            this.magneticLengthValue = normalized;
        } else if (id === "mag_speed") {
            this.magneticSpeedValue = normalized;
        }
        this.magneticControlsDirty = true;
    }

    private applyMagneticAdvancedControls(): void {
        if (!this.magneticControlsDirty) return;
        const root = this.findObjectByName("Magnetic Field Root");
        if (!root) return;

        const fieldApi = this.findAnyScriptApi(root, "setFieldStrengthNormalized");
        if (fieldApi) {
            if (typeof fieldApi.setFieldStrengthNormalized === "function") fieldApi.setFieldStrengthNormalized(this.magneticPowerValue);
            if (typeof fieldApi.setLengthSegmentsNormalized === "function") fieldApi.setLengthSegmentsNormalized(this.magneticLengthValue);
            if (typeof fieldApi.setFlowSpeedNormalized === "function") fieldApi.setFlowSpeedNormalized(this.magneticSpeedValue);
            if (typeof fieldApi.refresh === "function") fieldApi.refresh();
            else if (typeof fieldApi.queueRefresh === "function") fieldApi.queueRefresh(0.01);
        }

        const physicsApi = this.findAnyScriptApi(root, "setForceStrengthNormalized");
        if (physicsApi && typeof physicsApi.setForceStrengthNormalized === "function") {
            physicsApi.setForceStrengthNormalized(this.magneticPullValue);
        }
    }

    private updateGradientSliderFromEvent(binding: GradientSliderBinding, event: any): void {
        const localPoint = this.cursorLocalPointFromEvent(event);
        if (!localPoint) return;

        const trackCenterX = this.gradientSliderTrackCenterX(binding.slot);
        const trackWidth = this.gradientSliderTrackWidth(binding.slot);
        const minX = binding.slot.x + trackCenterX - trackWidth * 0.5;
        const ratio = this.clamp((localPoint.x - minX) / Math.max(0.001, trackWidth), 0.0, 1.0);
        const value = binding.min + (binding.max - binding.min) * ratio;
        this.setGradientSliderValue(binding, value);
        this.showGradientSliderCursor(binding, event);
    }

    private setGradientSliderValue(binding: GradientSliderBinding, rawValue: number): void {
        const value = this.snapSliderValue(rawValue, binding.min, binding.max, binding.step);
        if (Math.abs(binding.value - value) < 0.0001) {
            if (this.isMagneticSliderId(binding.id)) {
                this.magneticControlsDirty = true;
                this.applyMagneticAdvancedControls();
            } else {
                this.applyGradientControlsToActiveVectorField();
            }
            return;
        }
        binding.value = value;
        if (binding.id === "scale") {
            this.gradientScaleValue = value;
        } else if (binding.id === "offset") {
            this.gradientOffsetValue = value;
        } else {
            this.setMagneticSliderValue(binding.id, value);
            this.updateGradientSliderVisual(binding);
            this.applyMagneticAdvancedControls();
            return;
        }
        this.updateGradientSliderVisual(binding);
        this.syncDirectorGradientControls(GUIDE_STEPS[this.currentIndex].id);
        this.applyGradientControlsToActiveVectorField();
    }

    private updateGradientSliderVisual(binding: GradientSliderBinding): void {
        const normalized = this.sliderNormalized(binding.value, binding.min, binding.max);
        const trackCenterX = this.gradientSliderTrackCenterX(binding.slot);
        const trackWidth = this.gradientSliderTrackWidth(binding.slot);
        const fillWidth = Math.max(GRADIENT_SLIDER_TRACK_HEIGHT, trackWidth * normalized);
        const trackMinX = trackCenterX - trackWidth * 0.5;
        const knobX = trackMinX + trackWidth * normalized;

        binding.valueLabel.text = this.gradientSliderValueText(binding);
        try {
            const color = binding.pressed
                ? new vec4(1.0, 1.0, 1.0, 1.0)
                : (binding.hovered ? new vec4(0.98, 0.99, 1.0, 1.0) : new vec4(0.94, 0.96, 0.98, 1.0));
            binding.label.textFill.color = color;
            binding.valueLabel.textFill.color = color;
        } catch (e) {}

        const knobScale = binding.pressed ? 1.12 : (binding.hovered ? 1.06 : 1.0);
        const knobZ = GRADIENT_SLIDER_KNOB_Z + (binding.hovered || binding.pressed ? GRADIENT_SLIDER_KNOB_HOVER_Z : 0.0);
        this.placeImage(binding.backplate, 0.0, 0.0, GRADIENT_SLIDER_BACKPLATE_Z, binding.slot.width, binding.slot.height);
        this.placeImage(binding.track, trackCenterX, GRADIENT_SLIDER_TRACK_Y, GRADIENT_SLIDER_TRACK_Z, trackWidth, GRADIENT_SLIDER_TRACK_HEIGHT);
        this.placeImage(binding.fill, trackMinX + fillWidth * 0.5, GRADIENT_SLIDER_TRACK_Y, GRADIENT_SLIDER_FILL_Z, fillWidth, GRADIENT_SLIDER_TRACK_HEIGHT);
        this.placeImage(binding.knob, knobX, GRADIENT_SLIDER_TRACK_Y, knobZ, GRADIENT_SLIDER_KNOB_WIDTH * knobScale, GRADIENT_SLIDER_KNOB_HEIGHT * knobScale);
    }

    private showGradientSliderCursor(binding: GradientSliderBinding, event: any): void {
        this.hidePanelCursor();
    }

    private gradientSliderTrackWidth(slot: StoryGuideSlot): number {
        const left = this.gradientSliderTrackLeftX(slot);
        const right = this.gradientSliderTrackRightX(slot);
        return Math.max(0.8, right - left);
    }

    private gradientSliderTrackCenterX(slot: StoryGuideSlot): number {
        const left = this.gradientSliderTrackLeftX(slot);
        const right = this.gradientSliderTrackRightX(slot);
        return (left + right) * 0.5;
    }

    private gradientSliderTrackLeftX(slot: StoryGuideSlot): number {
        return -slot.width * 0.5 + GRADIENT_SLIDER_SIDE_MARGIN + GRADIENT_SLIDER_LABEL_WIDTH + GRADIENT_SLIDER_TEXT_TRACK_GAP;
    }

    private gradientSliderTrackRightX(slot: StoryGuideSlot): number {
        return slot.width * 0.5 - GRADIENT_SLIDER_SIDE_MARGIN - GRADIENT_SLIDER_VALUE_WIDTH - GRADIENT_SLIDER_TEXT_TRACK_GAP;
    }

    private sliderNormalized(value: number, min: number, max: number): number {
        return this.clamp((value - min) / Math.max(0.0001, max - min), 0.0, 1.0);
    }

    private snapSliderValue(value: number, min: number, max: number, step: number): number {
        const safeStep = Math.max(0.0001, step);
        const snapped = Math.round(value / safeStep) * safeStep;
        return this.clamp(snapped, min, max);
    }

    private gradientSliderValueText(binding: GradientSliderBinding): string {
        if (binding.id === "scale") return "x" + binding.value.toFixed(2);
        if (this.isMagneticSliderId(binding.id)) return Math.round(binding.value * 100) + "%";
        const sign = binding.value >= 0.0 ? "+" : "";
        return sign + binding.value.toFixed(2);
    }

    private updateButtonAnimations(): void {
        this.updateBindingAnimations(this.cards);
        this.updateBindingAnimations(this.fieldSelectorButtons);
        this.updateBindingAnimations(this.variantButtons);
        this.updateBindingAnimations(this.exampleModeButtons);
        this.updateBindingAnimations(this.theoryModeButtons);
        this.updateBindingAnimations(this.paletteButtons);
        this.updateBindingAnimations(this.navButtons);
        this.updateBindingAnimations(this.utilityButtons);
        this.updateBindingAnimations(this.viewPlaneButtons);
        if (this.magneticAdvancedButton) {
            this.updateBindingAnimations([this.magneticAdvancedButton]);
        }
        if (this.examplesBackButton) {
            this.updateBindingAnimations([this.examplesBackButton]);
        }
    }

    private updateBindingAnimations(bindings: ButtonBinding[]): void {
        const dt = getDeltaTime();
        const alpha = this.clamp(dt * 14.0, 0.0, 1.0);
        const positionAlpha = this.clamp(dt * 10.5, 0.0, 1.0);
        for (let i = 0; i < bindings.length; i++) {
            const binding = bindings[i];
            this.updateBindingPosition(binding, positionAlpha);
            binding.visualScale += (binding.targetScale - binding.visualScale) * alpha;
            binding.visualLift = 0.0;
            this.placeImageVisual(binding.image, binding.visualScale, 0.0);
            this.placeImageVisual(binding.overlay, binding.visualScale, 0.02);
        }
    }

    private updateBindingPosition(binding: ButtonBinding, alpha: number): void {
        const target = binding.targetSlot || binding.homeSlot;
        const transform = binding.object.getTransform();
        const current = transform.getLocalPosition();
        const next = this.mixVec3(current, new vec3(target.x, target.y, BUTTON_HIT_Z), alpha);
        transform.setLocalPosition(next);
        transform.setLocalRotation(quat.quatIdentity());
        transform.setLocalScale(new vec3(1, 1, 1));
        binding.slot = {
            x: next.x,
            y: next.y,
            width: target.width,
            height: target.height,
        };
        this.updateButtonHitSize(binding, target);
    }

    private updateButtonHitSize(binding: ButtonBinding, target: StoryGuideSlot): void {
        const foldedUtility = this.folded && (binding.id === "follow" || binding.id === "fold" || binding.id === "proxy" || binding.id === "move");
        const utility = binding.id === "follow" || binding.id === "fold" || binding.id === "reset" || binding.id === "proxy";
        const moveHandlePad = binding.id === "move" ? 0.44 : 0.0;
        const hitPad = foldedUtility ? FOLDED_UTILITY_HIT_PAD_CM : (utility ? UTILITY_HIT_PAD_CM : moveHandlePad);
        const hitWidth = target.width + hitPad;
        const hitHeight = target.height + hitPad;
        const hitDepth = BUTTON_HIT_DEPTH_CM;
        if (
            Math.abs(binding.hitWidth - hitWidth) < 0.001 &&
            Math.abs(binding.hitHeight - hitHeight) < 0.001 &&
            Math.abs(binding.hitDepth - hitDepth) < 0.001
        ) {
            return;
        }
        binding.hitWidth = hitWidth;
        binding.hitHeight = hitHeight;
        binding.hitDepth = hitDepth;
        try { binding.button.size = new vec3(hitWidth, hitHeight, hitDepth); } catch (e) {}
    }

    private placeImageVisual(binding: ImageBinding, scale: number, lift: number): void {
        const transform = binding.object.getTransform();
        transform.setLocalPosition(new vec3(0, 0, binding.z + lift));
        transform.setLocalScale(new vec3(binding.width * scale, binding.height * scale, 1.0));
    }

    private showPanelCursorFromEvent(event: any, pressed: boolean = false): void {
        const localPoint = this.cursorLocalPointFromEvent(event);
        const halfW = STORY_GUIDE_PANEL.width * 0.5;
        const halfH = STORY_GUIDE_PANEL.height * 0.5;
        const targetX = localPoint ? this.clamp(localPoint.x, this.panelOffset.x - halfW, this.panelOffset.x + halfW) : this.panelOffset.x;
        const targetY = localPoint ? this.clamp(localPoint.y, this.panelOffset.y - halfH, this.panelOffset.y + halfH) : this.panelOffset.y;
        this.setPanelHoverFromLocal(targetX, targetY, pressed ? 0.98 : 0.74, pressed ? 1.0 : 0.0);
    }

    private hidePanelCursor(): void {
        this.panelHoverTargetAlpha = 0.0;
        this.panelHoverTargetPress = 0.0;
    }

    private updatePanelCursorAnimation(): void {
        const dt = getDeltaTime();
        const alpha = this.clamp(dt * 16.0, 0.0, 1.0);
        this.panelHoverUvCurrent = new vec2(
            this.panelHoverUvCurrent.x + (this.panelHoverUvTarget.x - this.panelHoverUvCurrent.x) * alpha,
            this.panelHoverUvCurrent.y + (this.panelHoverUvTarget.y - this.panelHoverUvCurrent.y) * alpha
        );
        this.panelHoverAlpha += (this.panelHoverTargetAlpha - this.panelHoverAlpha) * alpha;
        this.panelHoverPress += (this.panelHoverTargetPress - this.panelHoverPress) * alpha;
        this.setPanelHoverUniform();
    }

    private setPanelHoverFromLocal(localX: number, localY: number, alpha: number, press: number): void {
        const panelX = localX - this.panelOffset.x;
        const panelY = localY - this.panelOffset.y;
        this.panelHoverUvTarget = new vec2(
            this.clamp(panelX / Math.max(0.001, STORY_GUIDE_PANEL.width) + 0.5, 0.0, 1.0),
            this.clamp(panelY / Math.max(0.001, STORY_GUIDE_PANEL.height) + 0.5, 0.0, 1.0)
        );
        this.panelHoverTargetAlpha = this.clamp(alpha, 0.0, 1.0);
        this.panelHoverTargetPress = this.clamp(press, 0.0, 1.0);
    }

    private setPanelHoverUniform(): void {
        if (!this.panelImage) return;
        const data = new vec4(this.panelHoverUvCurrent.x, this.panelHoverUvCurrent.y, this.panelHoverAlpha, this.panelHoverPress);
        const pass = this.tryMainPass(this.panelImage.material);
        if (pass) {
            try { pass.HoverData = data; } catch (e) {}
            try { pass.Port_HoverData_N000 = data; } catch (e) {}
            try { pass.baseTex = this.currentPanelTexture(); } catch (e) {}
        }
        const imagePass = this.tryMainPass(this.panelImage.component);
        if (imagePass) {
            try { imagePass.HoverData = data; } catch (e) {}
            try { imagePass.Port_HoverData_N000 = data; } catch (e) {}
            try { imagePass.baseTex = this.currentPanelTexture(); } catch (e) {}
        }
    }

    private showCursor(binding: ButtonBinding, pressed: boolean): void {
        this.showCursorAt(binding, pressed, null);
    }

    private showCursorFromEvent(binding: ButtonBinding, pressed: boolean, event: any): void {
        this.showCursorAt(binding, pressed, this.cursorLocalPointFromEvent(event));
    }

    private showCursorAt(binding: ButtonBinding, pressed: boolean, localPoint: vec3 | null): void {
        if (!this.cursorImage) return;
        this.cursorOwner = binding;
        this.cursorImage.object.enabled = true;
        this.applyTexture(this.cursorImage.material, pressed ? TEX_CURSOR_PRESSED : TEX_CURSOR_HOVER, this.cursorImage.component);

        const margin = Math.max(0.34, this.cursorImage.width * 0.42);
        const minX = binding.slot.x - binding.slot.width * 0.5 + margin;
        const maxX = binding.slot.x + binding.slot.width * 0.5 - margin;
        const minY = binding.slot.y - binding.slot.height * 0.5 + margin;
        const maxY = binding.slot.y + binding.slot.height * 0.5 - margin;
        const fallbackX = this.cursorOwner === binding ? this.cursorTarget.x : binding.slot.x;
        const fallbackY = this.cursorOwner === binding ? this.cursorTarget.y : binding.slot.y;
        const targetX = localPoint ? this.clamp(localPoint.x, minX, maxX) : fallbackX;
        const targetY = localPoint ? this.clamp(localPoint.y, minY, maxY) : fallbackY;
        this.cursorTarget = new vec3(targetX, targetY, this.cursorImage.z);
        this.cursorTargetScale = pressed ? 0.84 : 1.0;
    }

    private cursorWorldPointFromEvent(event: any): vec3 | null {
        const interactor = event && event.interactor ? event.interactor : null;
        if (!interactor) return null;

        let worldPoint: vec3 | null = null;
        try {
            if (typeof interactor.raycastPlaneIntersection === "function") {
                worldPoint = interactor.raycastPlaneIntersection(event.target || event.interactable);
            }
        } catch (e) {}
        try {
            if (!worldPoint && interactor.planecastPoint) {
                worldPoint = interactor.planecastPoint;
            }
        } catch (e) {}
        try {
            if (!worldPoint && interactor.targetHitInfo && interactor.targetHitInfo.hit && interactor.targetHitInfo.hit.position) {
                worldPoint = interactor.targetHitInfo.hit.position;
            }
        } catch (e) {}
        return worldPoint;
    }

    private cursorLocalPointFromEvent(event: any): vec3 | null {
        const worldPoint = this.cursorWorldPointFromEvent(event);
        if (!worldPoint) return null;

        try {
            return this.sceneObject.getTransform().getInvertedWorldTransform().multiplyPoint(worldPoint);
        } catch (e) {
            return null;
        }
    }

    private hideCursor(): void {
        this.cursorOwner = null;
        this.cursorTargetScale = 0.0;
    }

    private updateCursorAnimation(): void {
        if (!this.cursorImage) return;
        const alpha = this.clamp(getDeltaTime() * 18.0, 0.0, 1.0);
        this.cursorCurrent = this.mixVec3(this.cursorCurrent, this.cursorTarget, alpha);
        this.cursorScale += (this.cursorTargetScale - this.cursorScale) * alpha;

        const object = this.cursorImage.object;
        if (this.cursorScale < 0.035 && !this.cursorOwner) {
            object.enabled = false;
            return;
        }

        object.enabled = true;
        const transform = object.getTransform();
        transform.setLocalPosition(this.cursorCurrent);
        const scale = Math.max(0.001, this.cursorScale);
        transform.setLocalScale(new vec3(this.cursorImage.width * scale, this.cursorImage.height * scale, 1.0));
    }

    private registerFoldable(object: SceneObject): void {
        if (!object) return;
        this.foldableObjects.push(object);
    }

    private ensureChild(parent: SceneObject, name: string): SceneObject {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(parent);
        return child;
    }

    private mixVec3(a: vec3, b: vec3, t: number): vec3 {
        return new vec3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    private safeDirection(value: vec3, fallback: vec3): vec3 {
        if (!value || value.length < 0.0001) return fallback;
        return this.normalizeVec(value);
    }

    private safeHorizontalDirection(value: vec3, fallback: vec3): vec3 {
        if (!value) return fallback;
        const flat = new vec3(value.x, 0.0, value.z);
        if (flat.length < 0.0001) return this.safeDirection(fallback, new vec3(0.0, 0.0, -1.0));
        return this.normalizeVec(flat);
    }

    private normalizeVec(value: vec3): vec3 {
        const len = Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
        if (len < 0.0001) return new vec3(0.0, 0.0, -1.0);
        return new vec3(value.x / len, value.y / len, value.z / len);
    }

    private clamp(value: number, lo: number, hi: number): number {
        return Math.max(lo, Math.min(hi, value));
    }

    private findObjectByName(name: string): SceneObject | null {
        for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
            const found = this.findInTree(global.scene.getRootObject(i), name);
            if (found) return found;
        }
        return null;
    }

    private findInTree(root: SceneObject, name: string): SceneObject | null {
        if (root.name === name) return root;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const found = this.findInTree(root.getChild(i), name);
            if (found) return found;
        }
        return null;
    }

    private setObjectEnabledByName(name: string, enabled: boolean): void {
        const object = this.findObjectByName(name);
        if (object) {
            object.enabled = enabled;
        }
    }

    private hideStaleChapterCards(): void {
        this.setObjectEnabledByName("__GuideCard_intro", false);
    }

    private callObjectLifecycleByName(name: string, methodName: string): void {
        const object = this.findObjectByName(name);
        const api = this.findScriptApi(object, methodName);
        if (api && typeof api[methodName] === "function") {
            api[methodName]();
        }
    }

    private refreshSceneInteractionIsolation(): void {
        this.restoreSceneInteractionIsolation();
        if (!this.isolateSceneInteractors || !this.sceneObject.isEnabledInHierarchy) return;

        const rootMoveEnabled = this.rootMoveInteractionEnabled();
        for (let i = 0; i < INTERACTION_ISOLATION_ROOTS.length; i++) {
            const rootName = INTERACTION_ISOLATION_ROOTS[i];
            const root = this.findObjectByName(rootName);
            if (this.shouldPreserveInteractionRoot(rootName)) {
                if (root && root.isEnabledInHierarchy) {
                    this.restoreCollidersInTree(root, !rootMoveEnabled);
                    if (!rootMoveEnabled) {
                        this.setOwnCollidersEnabled(root, false);
                    }
                }
                continue;
            }
            if (root && root !== this.sceneObject && root.isEnabledInHierarchy) {
                this.captureCollidersInTree(root);
            }
        }
    }

    private rootMoveInteractionEnabled(): boolean {
        return this.directorApi && typeof this.directorApi.getExampleManipulationEnabled === "function"
            ? this.directorApi.getExampleManipulationEnabled()
            : false;
    }

    private shouldPreserveInteractionRoot(rootName: string): boolean {
        if (this.theoryMenuOpen) {
            if (this.selectedTheoryCard !== "patterns") {
                return false;
            }
            if (this.selectedTheoryMode === "motion") {
                return rootName === "Motion Field Root";
            }
            return rootName === "Vector Field Examples Root";
        }
        if (!this.examplesMenuOpen) return false;

        if (this.selectedExampleField === "gravity") {
            return rootName === "Gravity Field Root";
        }
        if (this.selectedExampleField === "magnetism") {
            return rootName === "Magnetic Field Root";
        }
        if (this.selectedExampleField === "wind") {
            return rootName === "Globe Calibration" || rootName === "Globe Spin-Lock Button";
        }
        if (this.selectedExampleField === "aerodynamics") {
            return rootName === "Car Fluid Flow" || rootName === "Flow Slice";
        }
        return false;
    }

    private restoreCollidersInTree(root: SceneObject, skipRoot: boolean = false): void {
        if (!skipRoot) {
            const colliders = root.getComponents("Physics.ColliderComponent");
            for (let i = 0; i < colliders.length; i++) {
                const collider = colliders[i] as ColliderComponent;
                if (collider) collider.enabled = true;
            }
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.restoreCollidersInTree(root.getChild(i));
        }
    }

    private setOwnCollidersEnabled(root: SceneObject, enabled: boolean): void {
        const colliders = root.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = enabled;
        }
    }

    private captureCollidersInTree(root: SceneObject): void {
        const colliders = root.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            this.captureCollider(colliders[i] as ColliderComponent);
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.captureCollidersInTree(root.getChild(i));
        }
    }

    private captureCollider(collider: ColliderComponent): void {
        if (!collider || !collider.enabled || this.hasCapturedCollider(collider)) return;
        this.isolatedColliders.push({ collider, enabled: collider.enabled });
        collider.enabled = false;
    }

    private hasCapturedCollider(collider: ColliderComponent): boolean {
        for (let i = 0; i < this.isolatedColliders.length; i++) {
            if (this.isolatedColliders[i].collider === collider) return true;
        }
        return false;
    }

    private restoreSceneInteractionIsolation(): void {
        for (let i = 0; i < this.isolatedColliders.length; i++) {
            const binding = this.isolatedColliders[i];
            if (binding.collider) {
                binding.collider.enabled = binding.enabled;
            }
        }
        this.isolatedColliders = [];
    }

    private listen(eventApi: any, callback: (event?: any) => void): void {
        if (eventApi && typeof eventApi.add === "function") {
            eventApi.add(callback);
        }
    }

    private twoDigit(value: number): string {
        return value < 10 ? "0" + value : "" + value;
    }

    private selectExampleField(field: ExampleFieldId): void {
        this.setProxyPlaneActive(false);
        this.selectedExampleField = field;
        this.hasSelectedExampleField = true;
        if (field !== "magnetism") {
            this.magneticAdvancedOpen = false;
        }
        if (field === "gravity") {
            this.selectedGravityVariant = "field";
        }
        if (field === "wind") {
            this.selectedWindVariant = "globe";
            this.selectedWindTubeMode = 0;
            this.selectedWindEventIndex = -1;
        }
        if (field === "aerodynamics") {
            this.selectedWindVariant = "car_flow";
            this.selectedWindTubeMode = 0;
        }
        if (GUIDE_STEPS[this.currentIndex].id !== "examples") {
            this.currentIndex = this.stepIndexForId("examples");
        }
        this.examplesMenuOpen = true;
        this.examplesDetailOpen = true;
        this.theoryMenuOpen = false;
        this.stageCurrentRoot();
        this.syncVisualState();
    }

    private selectExampleVariant(id: ExampleVariantId): void {
        const option = this.variantOptionForId(id);
        if (!option) return;

        this.setProxyPlaneActive(false);
        this.selectedExampleField = option.field;
        this.hasSelectedExampleField = true;
        this.magneticAdvancedOpen = false;
        if (option.field === "gravity") {
            this.selectedGravityVariant = this.selectedGravityVariant === "artemis" ? "field" : "artemis";
        }

        if (GUIDE_STEPS[this.currentIndex].id !== "examples") {
            this.currentIndex = this.stepIndexForId("examples");
        }
        this.examplesMenuOpen = true;
        this.examplesDetailOpen = true;
        this.theoryMenuOpen = false;
        this.stageCurrentRoot();
        this.syncVisualState();
    }

    private selectExampleMode(id: ExampleModeId): void {
        const option = this.exampleModeOptionForId(id);
        if (!option) return;

        this.setProxyPlaneActive(false);
        this.selectedExampleField = option.field;
        this.hasSelectedExampleField = true;
        if (option.field !== "magnetism") {
            this.magneticAdvancedOpen = false;
        }
        if (option.field === "gravity") {
            this.selectedGravityStage = option.mode;
        } else if (option.field === "magnetism") {
            this.selectedMagnetismTubeMode = option.mode === 2 ? 2 : 0;
        } else if (option.field === "wind") {
            this.selectedWindTubeMode = option.mode;
        }

        if (GUIDE_STEPS[this.currentIndex].id !== "examples") {
            this.currentIndex = this.stepIndexForId("examples");
        }
        this.examplesMenuOpen = true;
        this.examplesDetailOpen = true;
        this.theoryMenuOpen = false;
        this.stageCurrentRoot();
        this.syncVisualState();
    }

    private createTheoryCardButtons(): void {
        for (let i = 0; i < STORY_GUIDE_THEORY_CARDS.length; i++) {
            const card = STORY_GUIDE_THEORY_CARDS[i];
            const tex = THEORY_CARD_TEXTURES[card.id];
            if (!tex) continue;
            const slot = this.offsetSlot(card.slot);
            const binding = this.createTextureButton(
                "__GuideTheoryCard_" + card.id,
                "theory:" + card.id,
                slot,
                tex.normal,
                tex.active,
                tex.pressed,
                242,
                () => this.selectTheoryCard(card.id),
                true,
                TEX_CARD_OVERLAY_HOVER,
                TEX_CARD_OVERLAY_SELECTED,
                TEX_CARD_OVERLAY_PRESSED
            );
            binding.object.enabled = false;
            this.theoryCardButtons.push(binding);
        }
        // Full-panel image for definition and metrics pages
        this.theoryPanelImage = this.createImage(
            this.sceneObject,
            "__GuideTheoryPanelImage",
            this.offsetSlot(THEORY_FULL_PANEL_SLOT),
            MATH_EXPLAINER_TEXTURES[0],
            246,
            0.2
        );
        this.theoryPanelImage.object.enabled = false;
    }

    private syncTheoryCardState(): void {
        const showCards = !this.folded && this.theoryMenuOpen && this.selectedTheoryCard === "";
        for (let i = 0; i < this.theoryCardButtons.length; i++) {
            const b = this.theoryCardButtons[i];
            b.object.enabled = showCards;
            if (!showCards) {
                b.hovered = false;
                b.pressedState = false;
            }
            b.selected = false;
            this.updateBindingVisual(b);
        }
        if (this.cursorOwner && this.isTheoryCardBinding(this.cursorOwner) && !this.cursorOwner.object.enabled) {
            this.hideCursor();
        }
    }

    private isTheoryCardBinding(b: ButtonBinding): boolean {
        return typeof b.id === "string" && b.id.startsWith("theory:");
    }

    private selectTheoryCard(id: string): void {
        this.selectedTheoryCard = id;
        this.metricsPage = 0;
        this.definitionPage = 0;
        if (GUIDE_STEPS[this.currentIndex].id !== "theory") {
            this.currentIndex = this.stepIndexForId("theory");
        }
        this.examplesMenuOpen = false;
        this.examplesDetailOpen = false;
        this.theoryMenuOpen = true;
        this.hideTheoryCardButtonsNow();

        if (id === "patterns") {
            this.stageCurrentRoot();
            this.syncDirectorTheoryFieldMode("theory");
            this.syncDirectorGradientPalette("theory");
            this.syncDirectorGradientControls("theory");
        } else {
            this.clearDirectorTheorySelection();
            this.stageFallbackContent("theory");
        }
        this.updateTheoryPanelTexture();
        this.syncVisualState();
        if (id === "patterns") {
            this.theoryPatternUiSettleRemaining = 0.35;
            this.forceTheoryPatternInterfaceNow();
        } else {
            this.theoryPatternUiSettleRemaining = 0.0;
        }
    }

    private hideTheoryCardButtonsNow(): void {
        for (let i = 0; i < this.theoryCardButtons.length; i++) {
            const binding = this.theoryCardButtons[i];
            binding.object.enabled = false;
            binding.hovered = false;
            binding.pressedState = false;
            binding.selected = false;
            this.updateBindingVisual(binding);
        }
        if (this.cursorOwner && this.isTheoryCardBinding(this.cursorOwner)) {
            this.hideCursor();
        }
    }

    private clearDirectorTheorySelection(): void {
        if (this.directorApi && typeof this.directorApi.clearTheorySelection === "function") {
            this.directorApi.clearTheorySelection();
        }
    }

    private selectTheoryFieldMode(id: TheoryFieldModeId): void {
        this.selectedTheoryMode = id;
        if (GUIDE_STEPS[this.currentIndex].id !== "theory") {
            this.goTo(this.stepIndexForId("theory"));
            return;
        }
        this.theoryMenuOpen = true;
        this.syncDirectorTheoryFieldMode("theory");
        this.syncDirectorGradientPalette("theory");
        this.syncDirectorGradientControls("theory");
        if (!this.directorApi || typeof this.directorApi.selectTheoryFieldMode !== "function") {
            this.stageFallbackContent("theory");
        }
        this.syncVisualState();
    }

    private selectGradientPalette(id: GradientPaletteId): void {
        this.selectedGradientPalette = id;
        if (GUIDE_STEPS[this.currentIndex].id !== "theory") {
            this.goTo(this.stepIndexForId("theory"));
            return;
        }
        this.theoryMenuOpen = true;
        this.syncDirectorGradientPalette("theory");
        this.syncDirectorGradientControls("theory");
        if (!this.directorApi || typeof this.directorApi.selectGradientPalette !== "function") {
            this.stageFallbackContent("theory");
        }
        this.syncVisualState();
    }

    private returnToChapterList(): void {
        if (this.theoryMenuOpen && this.selectedTheoryCard !== "") {
            this.selectedTheoryCard = "";
            this.metricsPage = 0;
            this.definitionPage = 0;
            this.syncVisualState();
            return;
        }
        if (this.examplesMenuOpen && this.examplesDetailOpen) {
            this.examplesDetailOpen = false;
            this.magneticAdvancedOpen = false;
            this.syncVisualState();
            return;
        }
        this.showChapterList();
    }

    private cycleExampleField(direction: number): void {
        let current = 0;
        for (let i = 0; i < EXAMPLE_FIELD_OPTIONS.length; i++) {
            if (EXAMPLE_FIELD_OPTIONS[i].id === this.selectedExampleField) {
                current = i;
                break;
            }
        }
        const nextIndex = (current + direction + EXAMPLE_FIELD_OPTIONS.length) % EXAMPLE_FIELD_OPTIONS.length;
        this.selectExampleField(EXAMPLE_FIELD_OPTIONS[nextIndex].id);
    }

    private cycleTheoryFieldMode(direction: number): void {
        let current = 0;
        for (let i = 0; i < THEORY_FIELD_OPTIONS.length; i++) {
            if (THEORY_FIELD_OPTIONS[i].id === this.selectedTheoryMode) {
                current = i;
                break;
            }
        }
        const nextIndex = (current + direction + THEORY_FIELD_OPTIONS.length) % THEORY_FIELD_OPTIONS.length;
        this.selectTheoryFieldMode(THEORY_FIELD_OPTIONS[nextIndex].id);
    }

    private stepIndexForId(id: string): number {
        for (let i = 0; i < GUIDE_STEPS.length; i++) {
            if (GUIDE_STEPS[i].id === id) return i;
        }
        return 0;
    }

    private setFolded(folded: boolean): void {
        const nextFolded = folded ? true : false;
        if (this.folded === nextFolded) {
            this.syncVisualState();
            return;
        }
        this.folded = nextFolded;
        if (!this.folded) {
            this.keepPlaneControlsWhileFolded = false;
        }
        this.dockProxyPlaneSoftly();
        this.syncVisualState();
    }

    private exampleFieldLabel(field: ExampleFieldId): string {
        for (let i = 0; i < EXAMPLE_FIELD_OPTIONS.length; i++) {
            if (EXAMPLE_FIELD_OPTIONS[i].id === field) return EXAMPLE_FIELD_OPTIONS[i].label;
        }
        return "Gravitational Fields";
    }

    private currentVariantId(): ExampleVariantId | null {
        if (this.selectedExampleField === "gravity") {
            return this.selectedGravityVariant === "artemis" ? "gravity:artemis" : null;
        }
        return null;
    }

    private currentVariantLabel(): string {
        const id = this.currentVariantId();
        if (!id) return "";
        const option = this.variantOptionForId(id);
        return option ? option.label : "";
    }

    private currentExampleModeId(): ExampleModeId {
        if (this.selectedExampleField === "gravity") {
            if (this.selectedGravityStage === 0) return "gravity:bodies";
            if (this.selectedGravityStage === 1) return "gravity:arrows";
            return "gravity:lines";
        }
        if (this.selectedExampleField === "magnetism") {
            if (this.selectedMagnetismTubeMode === 2) return "magnetism:arrows";
            return "magnetism:trails";
        }
        if (this.selectedWindTubeMode === 1) return "wind:points";
        if (this.selectedWindTubeMode === 2) return "wind:arrows";
        return "wind:trails";
    }

    private currentTheoryFieldOption(): TheoryFieldOption {
        const option = this.theoryOptionForId(this.selectedTheoryMode);
        return option ? option : THEORY_FIELD_OPTIONS[0];
    }

    private currentGradientPaletteOption(): GradientPaletteOption {
        const option = this.paletteOptionForId(this.selectedGradientPalette);
        return option ? option : GRADIENT_PALETTE_OPTIONS[1];
    }

    private theoryOptionForBinding(binding: ButtonBinding): TheoryFieldOption | null {
        const id = binding.id.indexOf("theory_mode:") === 0
            ? binding.id.substr(12)
            : (binding.id.indexOf("theory:") === 0 ? binding.id.substr(7) : binding.id);
        return this.theoryOptionForId(id as TheoryFieldModeId);
    }

    private theoryOptionForId(id: TheoryFieldModeId): TheoryFieldOption | null {
        for (let i = 0; i < THEORY_FIELD_OPTIONS.length; i++) {
            if (THEORY_FIELD_OPTIONS[i].id === id) return THEORY_FIELD_OPTIONS[i];
        }
        return null;
    }

    private paletteOptionForId(id: GradientPaletteId): GradientPaletteOption | null {
        for (let i = 0; i < GRADIENT_PALETTE_OPTIONS.length; i++) {
            if (GRADIENT_PALETTE_OPTIONS[i].id === id) return GRADIENT_PALETTE_OPTIONS[i];
        }
        return null;
    }

    private variantOptionForId(id: ExampleVariantId): ExampleVariantOption | null {
        for (let i = 0; i < EXAMPLE_VARIANT_OPTIONS.length; i++) {
            if (EXAMPLE_VARIANT_OPTIONS[i].id === id) return EXAMPLE_VARIANT_OPTIONS[i];
        }
        return null;
    }

    private exampleModeOptionForId(id: ExampleModeId): ExampleModeOption | null {
        for (let i = 0; i < EXAMPLE_MODE_OPTIONS.length; i++) {
            if (EXAMPLE_MODE_OPTIONS[i].id === id) return EXAMPLE_MODE_OPTIONS[i];
        }
        return null;
    }
}
