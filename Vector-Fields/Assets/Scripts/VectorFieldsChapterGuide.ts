// VectorFieldsChapterGuide.ts
// Texture-backed chapter guide with UIKit hit targets.

import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { STORY_GUIDE_NAV, STORY_GUIDE_PANEL, STORY_GUIDE_STEPS, STORY_GUIDE_UTILITY } from "./StoryGuideLayoutGenerated";

type StoryGuideSlot = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type ExampleFieldId = "gravity" | "magnetism" | "wind";

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
    hovered: boolean;
    pressedState: boolean;
    selected: boolean;
    visualScale: number;
    targetScale: number;
    visualLift: number;
    targetLift: number;
    label: Text | null;
};

type ExampleFieldOption = {
    id: ExampleFieldId;
    label: string;
    slot: StoryGuideSlot;
};

const IMAGE_MATERIAL = requireAsset("../Image.mat") as Material;
const GUIDE_FONT = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;
const TEX_PANEL = requireAsset("../Images/StoryUI/chapter_panel.png") as Texture;

const CARD_TEXTURES: { [key: string]: { normal: Texture; active: Texture; pressed: Texture } } = {
    intro: {
        normal: requireAsset("../Images/StoryUI/card_intro_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_intro_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_intro_pressed.png") as Texture,
    },
    definition: {
        normal: requireAsset("../Images/StoryUI/card_definition_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_definition_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_definition_pressed.png") as Texture,
    },
    motion: {
        normal: requireAsset("../Images/StoryUI/card_motion_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_motion_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_motion_pressed.png") as Texture,
    },
    patterns: {
        normal: requireAsset("../Images/StoryUI/card_patterns_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_patterns_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_patterns_pressed.png") as Texture,
    },
    metrics: {
        normal: requireAsset("../Images/StoryUI/card_metrics_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_metrics_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_metrics_pressed.png") as Texture,
    },
    examples: {
        normal: requireAsset("../Images/StoryUI/card_examples_normal.png") as Texture,
        active: requireAsset("../Images/StoryUI/card_examples_active.png") as Texture,
        pressed: requireAsset("../Images/StoryUI/card_examples_pressed.png") as Texture,
    },
};

const TEX_NAV_BACK_NORMAL = requireAsset("../Images/StoryUI/nav_back_normal.png") as Texture;
const TEX_NAV_BACK_PRESSED = requireAsset("../Images/StoryUI/nav_back_pressed.png") as Texture;
const TEX_NAV_NEXT_NORMAL = requireAsset("../Images/StoryUI/nav_next_normal.png") as Texture;
const TEX_NAV_NEXT_PRESSED = requireAsset("../Images/StoryUI/nav_next_pressed.png") as Texture;
const TEX_UTILITY_FOLLOW_ON = requireAsset("../Images/StoryUI/utility_follow_on.png") as Texture;
const TEX_UTILITY_FOLLOW_OFF = requireAsset("../Images/StoryUI/utility_follow_off.png") as Texture;
const TEX_UTILITY_FOLLOW_PRESSED = requireAsset("../Images/StoryUI/utility_follow_pressed.png") as Texture;
const TEX_UTILITY_FOLD_OPEN = requireAsset("../Images/StoryUI/utility_fold_open.png") as Texture;
const TEX_UTILITY_FOLD_CLOSED = requireAsset("../Images/StoryUI/utility_fold_closed.png") as Texture;
const TEX_UTILITY_FOLD_PRESSED = requireAsset("../Images/StoryUI/utility_fold_pressed.png") as Texture;
const TEX_CARD_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_card_hover.png") as Texture;
const TEX_CARD_OVERLAY_SELECTED = requireAsset("../Images/StoryUI/overlay_card_selected.png") as Texture;
const TEX_CARD_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_card_pressed.png") as Texture;
const TEX_NAV_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_nav_hover.png") as Texture;
const TEX_NAV_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_nav_pressed.png") as Texture;
const TEX_UTILITY_OVERLAY_HOVER = requireAsset("../Images/StoryUI/overlay_utility_hover.png") as Texture;
const TEX_UTILITY_OVERLAY_PRESSED = requireAsset("../Images/StoryUI/overlay_utility_pressed.png") as Texture;
const TEX_CURSOR_HOVER = requireAsset("../Images/StoryUI/cursor_hover.png") as Texture;
const TEX_CURSOR_PRESSED = requireAsset("../Images/StoryUI/cursor_pressed.png") as Texture;
const TEX_PANEL_CURSOR_WASH = requireAsset("../Images/StoryUI/panel_cursor_wash.png") as Texture;

const EXAMPLE_FIELD_OPTIONS: ExampleFieldOption[] = [
    { id: "gravity", label: "Gravity", slot: { x: -8.7, y: -5.28, width: 7.6, height: 1.46 } },
    { id: "magnetism", label: "Magnetism", slot: { x: 0.0, y: -5.28, width: 7.6, height: 1.46 } },
    { id: "wind", label: "Wind", slot: { x: 8.7, y: -5.28, width: 7.6, height: 1.46 } },
];

@component
export class VectorFieldsChapterGuide extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("VF Story Scaffold root. If empty, the script searches for it by name.")
    scaffoldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional Story Step Director root. If empty, the script searches for it by name.")
    directorRoot: SceneObject = null as any;

    @input
    @hint("Start visible and immediately stage the first chapter.")
    showOnStart: boolean = true;

    @input
    @hint("When no Story Step Director is present, enable the real content roots for each guide step.")
    controlContentRoots: boolean = true;

    @input
    @hint("When this guide owns staging, park the older narration panel and slide stage.")
    hideLegacySystems: boolean = true;

    @input
    @hint("Offset from this root in centimeters.")
    panelOffset: vec3 = new vec3(0, 0, 0);

    @input
    @allowUndefined
    @hint("Optional head/camera anchor for Follow mode. Empty searches for Camera Object.")
    cameraRoot: SceneObject = null as any;

    @input
    @hint("Keep the menu in front of the user.")
    followUser: boolean = true;

    @input
    @hint("Start with only Fold/Open and Follow/Fixed controls visible.")
    folded: boolean = false;

    @input
    @hint("Distance from head anchor in centimeters when Follow is active.")
    menuDistanceCm: number = 68.0;

    @input
    @hint("Vertical offset from head anchor in centimeters when Follow is active.")
    menuVerticalOffsetCm: number = -7.0;

    @input
    @hint("Horizontal offset from head anchor in centimeters when Follow is active.")
    menuHorizontalOffsetCm: number = 0.0;

    @input
    @hint("Higher values make the menu catch up faster.")
    followSmoothing: number = 9.0;

    private panelImage: ImageBinding | null = null;
    private cards: ButtonBinding[] = [];
    private navButtons: ButtonBinding[] = [];
    private utilityButtons: ButtonBinding[] = [];
    private followButton: ButtonBinding | null = null;
    private foldButton: ButtonBinding | null = null;
    private panelCursorImage: ImageBinding | null = null;
    private panelCursorCurrent: vec3 = new vec3(0, 0, 0.16);
    private panelCursorTarget: vec3 = new vec3(0, 0, 0.16);
    private panelCursorAlpha: number = 0.0;
    private panelCursorTargetAlpha: number = 0.0;
    private panelCursorScale: number = 0.88;
    private panelCursorTargetScale: number = 0.88;
    private cursorImage: ImageBinding | null = null;
    private cursorOwner: ButtonBinding | null = null;
    private cursorCurrent: vec3 = new vec3(0, 0, 0.94);
    private cursorTarget: vec3 = new vec3(0, 0, 0.94);
    private cursorScale: number = 1.0;
    private cursorTargetScale: number = 1.0;
    private foldableObjects: SceneObject[] = [];
    private progressText: Text | null = null;
    private currentIndex: number = 0;
    private selectedExampleField: ExampleFieldId = "gravity";
    private fieldSelectorButtons: ButtonBinding[] = [];
    private scaffoldApi: any = null;
    private directorApi: any = null;
    private built: boolean = false;
    private startEventRef: any = null;
    private updateEventRef: any = null;

    onAwake(): void {
        this.startEventRef = this.createEvent("OnStartEvent");
        this.startEventRef.bind(() => this.build());
        this.updateEventRef = this.createEvent("UpdateEvent");
        this.updateEventRef.bind(() => {
            this.updateMenuPose();
            this.updateButtonAnimations();
            this.updatePanelCursorAnimation();
            this.updateCursorAnimation();
        });
    }

    public next(): void {
        if (STORY_GUIDE_STEPS[this.currentIndex].id === "intro") {
            this.goTo(this.stepIndexForId("motion"));
            return;
        }
        if (STORY_GUIDE_STEPS[this.currentIndex].id === "examples") {
            this.cycleExampleField(1);
            return;
        }
        this.goTo(Math.min(STORY_GUIDE_STEPS.length - 1, this.currentIndex + 1));
    }

    public prev(): void {
        this.goTo(Math.max(0, this.currentIndex - 1));
    }

    public goTo(index: number): void {
        const nextIndex = Math.max(0, Math.min(STORY_GUIDE_STEPS.length - 1, Math.floor(index)));
        this.currentIndex = nextIndex;
        this.stageCurrentRoot();
        this.syncVisualState();
    }

    private build(): void {
        if (this.built) {
            this.syncVisualState();
            return;
        }
        this.built = true;
        this.scaffoldApi = this.findScaffoldApi();
        this.directorApi = this.findDirectorApi();
        this.sceneObject.enabled = this.showOnStart;

        const panelImage = this.createImage(this.sceneObject, "__GuidePanelImage", {
            x: this.panelOffset.x,
            y: this.panelOffset.y,
            width: STORY_GUIDE_PANEL.width,
            height: STORY_GUIDE_PANEL.height,
        }, TEX_PANEL, 220, 0.0);
        this.panelImage = panelImage;
        this.registerFoldable(panelImage.object);

        this.createPanelCursor();
        this.createPanelHitTarget();
        this.createProgressText();
        this.createCursor();

        for (let i = 0; i < STORY_GUIDE_STEPS.length; i++) {
            const step = STORY_GUIDE_STEPS[i];
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

        this.createExampleFieldSelectors();
        this.createNavButton("__GuideBack", "back", this.offsetSlot(STORY_GUIDE_NAV.back), TEX_NAV_BACK_NORMAL, TEX_NAV_BACK_PRESSED, 244, () => this.prev());
        this.createNavButton("__GuideNext", "next", this.offsetSlot(STORY_GUIDE_NAV.next), TEX_NAV_NEXT_NORMAL, TEX_NAV_NEXT_PRESSED, 244, () => this.next());
        this.createUtilityButtons();

        this.goTo(this.currentIndex);
        print("VectorFieldsChapterGuide: built " + STORY_GUIDE_STEPS.length + " slots at 50 px/cm");
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
                this.folded = !this.folded;
                this.syncVisualState();
            },
            false,
            TEX_UTILITY_OVERLAY_HOVER,
            null,
            TEX_UTILITY_OVERLAY_PRESSED
        );
        this.foldButton = foldButton;
        this.utilityButtons.push(foldButton);
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
        this.place(buttonObject, slot.x, slot.y, 0.34);
        if (foldable) {
            this.registerFoldable(buttonObject);
        }

        let button = buttonObject.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (!button) {
            button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        }
        (button as any)._style = "Ghost";
        button.size = new vec3(slot.width, slot.height, 1.2);
        button.renderOrder = renderOrder - 2;
        button.initialize();
        this.hideUIKitVisual(button);

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
            slot,
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
        this.listen((button as any).onHoverEnter, () => {
            binding.hovered = true;
            this.hidePanelCursor();
            this.showCursor(binding, false);
            this.updateBindingVisual(binding);
        });
        this.listen((button as any).onTriggerDown, () => {
            binding.pressedState = true;
            this.hidePanelCursor();
            this.showCursor(binding, true);
            this.updateBindingVisual(binding);
        });
        this.listen((button as any).onTriggerUp, () => {
            action();
            binding.pressedState = false;
            if (binding.hovered) {
                this.showCursor(binding, false);
            }
            this.syncVisualState();
        });
        this.listen((button as any).onHoverExit, () => {
            binding.hovered = false;
            binding.pressedState = false;
            if (this.cursorOwner === binding) {
                this.hideCursor();
            }
            this.syncVisualState();
        });
        return binding;
    }

    private createExampleFieldSelectors(): void {
        for (let i = 0; i < EXAMPLE_FIELD_OPTIONS.length; i++) {
            const option = EXAMPLE_FIELD_OPTIONS[i];
            const binding = this.createTextureButton(
                "__GuideField_" + option.id,
                "field:" + option.id,
                this.offsetSlot(option.slot),
                TEX_CARD_OVERLAY_HOVER,
                TEX_CARD_OVERLAY_SELECTED,
                TEX_CARD_OVERLAY_PRESSED,
                246,
                () => this.selectExampleField(option.id),
                false,
                null,
                null,
                null
            );
            binding.label = this.createButtonLabel(binding.object, "__Label", option.label, option.slot.width, option.slot.height, 267);
            binding.object.enabled = false;
            this.fieldSelectorButtons.push(binding);
        }
    }

    private createButtonLabel(parent: SceneObject, name: string, text: string, width: number, height: number, renderOrder: number): Text {
        const object = this.ensureChild(parent, name);
        this.place(object, 0, 0, 0.62);

        let label = object.getComponent("Component.Text") as Text;
        if (!label) {
            label = object.createComponent("Component.Text") as Text;
        }
        label.text = text;
        label.size = 30;
        label.font = GUIDE_FONT;
        label.horizontalAlignment = HorizontalAlignment.Center;
        label.verticalAlignment = VerticalAlignment.Center;
        label.horizontalOverflow = HorizontalOverflow.Truncate;
        label.verticalOverflow = VerticalOverflow.Truncate;
        label.worldSpaceRect = Rect.create(-width * 0.5, width * 0.5, -height * 0.44, height * 0.44);
        label.depthTest = false;
        label.twoSided = true;
        label.renderOrder = renderOrder;
        try {
            label.textFill.color = new vec4(0.78, 0.80, 0.82, 1.0);
        } catch (e) {}
        return label;
    }

    private createImage(parent: SceneObject, name: string, slot: StoryGuideSlot, texture: Texture, renderOrder: number, z: number): ImageBinding {
        const object = this.ensureChild(parent, name);
        this.place(object, slot.x, slot.y, z);
        object.getTransform().setLocalScale(new vec3(slot.width, slot.height, 1.0));

        let image = object.getComponent("Image") as Image;
        if (!image) {
            image = object.createComponent("Image") as Image;
        }
        const material = IMAGE_MATERIAL.clone();
        try {
            image.clearMaterials();
            image.mainMaterial = material;
            image.renderOrder = renderOrder;
            (image as any).twoSided = true;
            (image.mainPass as any).depthTest = false;
            (image.mainPass as any).depthWrite = false;
        } catch (e) {}
        this.applyTexture(material, texture, image);
        return { object, component: image, material, width: slot.width, height: slot.height, z };
    }

    private createProgressText(): void {
        const slot = this.offsetSlot(STORY_GUIDE_NAV.progress);
        const object = this.ensureChild(this.sceneObject, "__GuideProgressText");
        this.place(object, slot.x, slot.y, 0.62);
        this.registerFoldable(object);

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
        this.progressText.depthTest = false;
        this.progressText.twoSided = true;
        this.progressText.renderOrder = 260;
        try {
            this.progressText.textFill.color = new vec4(0.95, 0.98, 1.0, 1.0);
        } catch (e) {}
    }

    private createCursor(): void {
        this.cursorImage = this.createImage(this.sceneObject, "__GuideCursor", {
            x: 0,
            y: 0,
            width: 1.18,
            height: 1.18,
        }, TEX_CURSOR_HOVER, 320, 0.94);
        this.cursorImage.object.enabled = false;
    }

    private createPanelCursor(): void {
        this.panelCursorImage = this.createImage(this.sceneObject, "__GuidePanelCursorWash", {
            x: 0,
            y: 0,
            width: 5.12,
            height: 5.12,
        }, TEX_PANEL_CURSOR_WASH, 222, 0.16);
        this.panelCursorImage.object.enabled = false;
        this.registerFoldable(this.panelCursorImage.object);
    }

    private createPanelHitTarget(): void {
        const object = this.ensureChild(this.sceneObject, "__GuidePanelHitTarget");
        this.place(object, this.panelOffset.x, this.panelOffset.y, -0.18);
        this.registerFoldable(object);

        let button = object.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (!button) {
            button = object.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        }
        (button as any)._style = "Ghost";
        button.size = new vec3(STORY_GUIDE_PANEL.width, STORY_GUIDE_PANEL.height, 0.24);
        button.renderOrder = 218;
        button.initialize();
        this.hideUIKitVisual(button);

        const interactable = (button as any).interactable;
        if (interactable) {
            this.listen(interactable.onHoverEnter, (event: any) => this.showPanelCursorFromEvent(event));
            this.listen(interactable.onHoverUpdate, (event: any) => this.showPanelCursorFromEvent(event));
            this.listen(interactable.onTriggerStart, (event: any) => this.showPanelCursorFromEvent(event));
            this.listen(interactable.onTriggerUpdate, (event: any) => this.showPanelCursorFromEvent(event));
        }
        this.listen((button as any).onHoverExit, () => this.hidePanelCursor());
    }

    private syncVisualState(): void {
        for (let i = 0; i < this.cards.length; i++) {
            const binding = this.cards[i];
            binding.selected = i === this.currentIndex;
            this.updateBindingVisual(binding);
        }
        if (this.progressText) {
            const step = STORY_GUIDE_STEPS[this.currentIndex];
            let suffix = "";
            if (step.id === "definition") {
                suffix = " · Math";
            } else if (step.id === "examples") {
                suffix = " · " + this.exampleFieldLabel(this.selectedExampleField);
            }
            this.progressText.text = step.index + " / " + this.twoDigit(STORY_GUIDE_STEPS.length) + suffix;
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
        this.updateBindings(this.navButtons);
        this.updateBindings(this.utilityButtons);
        this.syncFoldState();
        this.syncFieldSelectorState();
    }

    private stageCurrentRoot(): void {
        const step = STORY_GUIDE_STEPS[this.currentIndex];
        if (this.directorApi && typeof this.directorApi.stageStep === "function") {
            this.directorApi.stageStep(step.id, step.root, this.currentIndex);
            this.syncDirectorExampleField(step.id);
            return;
        }
        if (this.directorApi && typeof this.directorApi.showRoot === "function") {
            this.directorApi.showRoot(step.root);
            return;
        }
        if (this.scaffoldApi && typeof this.scaffoldApi.showRoot === "function") {
            this.scaffoldApi.showRoot(step.root);
        }
        this.stageFallbackContent(step.id);
    }

    private syncDirectorExampleField(stepId: string): void {
        if (stepId !== "examples") return;
        if (this.directorApi && typeof this.directorApi.selectExampleField === "function") {
            this.directorApi.selectExampleField(this.selectedExampleField);
        }
    }

    private stageFallbackContent(stepId: string): void {
        if (!this.controlContentRoots) return;

        const showMotion = stepId === "motion" || stepId === "patterns" || stepId === "metrics";
        const showVector = stepId === "patterns";
        const showGravity = stepId === "examples" && this.selectedExampleField === "gravity";
        const showMagnetic = stepId === "examples" && this.selectedExampleField === "magnetism";
        const showWind = stepId === "examples" && this.selectedExampleField === "wind";

        this.setObjectEnabledByName("Motion Field Root", showMotion);
        this.setObjectEnabledByName("Vector Field Examples Root", showVector);
        this.setObjectEnabledByName("Magnetic Field Root", showMagnetic);
        this.setObjectEnabledByName("Gravity Field Root", showGravity);
        this.setObjectEnabledByName("Globe Calibration", showWind);
        this.setObjectEnabledByName("Globe Wind", showWind);
        this.setObjectEnabledByName("Story Widgets", false);

        if (this.hideLegacySystems) {
            this.setObjectEnabledByName("Guide", false);
            this.setObjectEnabledByName("SlideStage", false);
        }
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

        let overlayTexture: Texture | null = null;
        if (binding.pressedState) {
            overlayTexture = binding.pressedOverlay;
            binding.targetScale = 0.985;
            binding.targetLift = 0.035;
        } else if (binding.hovered) {
            overlayTexture = binding.hoverOverlay;
            binding.targetScale = 1.025;
            binding.targetLift = 0.105;
        } else if (binding.selected) {
            overlayTexture = binding.selectedOverlay;
            binding.targetScale = 1.015;
            binding.targetLift = 0.07;
        } else {
            binding.targetScale = 1.0;
            binding.targetLift = 0.0;
        }

        if (overlayTexture) {
            binding.overlay.object.enabled = true;
            this.applyTexture(binding.overlay.material, overlayTexture, binding.overlay.component);
        } else {
            binding.overlay.object.enabled = false;
        }

        if (binding.label) {
            const color = binding.selected
                ? new vec4(1.0, 1.0, 1.0, 1.0)
                : (binding.hovered ? new vec4(0.96, 0.97, 0.98, 1.0) : new vec4(0.78, 0.80, 0.82, 1.0));
            try {
                binding.label.textFill.color = color;
            } catch (e) {}
        }
    }

    private applyTexture(material: Material, texture: Texture, image?: Image): void {
        if (!material || !texture) return;
        const pass = material.mainPass as any;
        try { pass.baseTex = texture; } catch (e) {}
        try { pass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
        if (image && image.mainPass) {
            const imagePass = image.mainPass as any;
            try { imagePass.baseTex = texture; } catch (e) {}
            try { imagePass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
        }
    }

    private setImageAlpha(binding: ImageBinding, alpha: number): void {
        const color = new vec4(1.0, 1.0, 1.0, this.clamp(alpha, 0.0, 1.0));
        const pass = binding.material.mainPass as any;
        try { pass.baseColor = color; } catch (e) {}
        if (binding.component && binding.component.mainPass) {
            const imagePass = binding.component.mainPass as any;
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

    private place(object: SceneObject, x: number, y: number, z: number): void {
        const t = object.getTransform();
        t.setLocalPosition(new vec3(x, y, z));
        t.setLocalRotation(quat.quatIdentity());
        t.setLocalScale(new vec3(1, 1, 1));
    }

    private hideUIKitVisual(button: RectangleButton): void {
        try {
            const visual = (button as any).visual;
            if (visual && visual.renderMeshVisual) {
                visual.renderMeshVisual.enabled = false;
            }
        } catch (e) {}
    }

    private bindCursorEvents(button: RectangleButton, binding: ButtonBinding): void {
        const interactable = (button as any).interactable;
        if (!interactable) return;

        this.listen(interactable.onHoverEnter, (event: any) => this.showCursorFromEvent(binding, false, event));
        this.listen(interactable.onHoverUpdate, (event: any) => this.showCursorFromEvent(binding, false, event));
        this.listen(interactable.onTriggerStart, (event: any) => this.showCursorFromEvent(binding, true, event));
        this.listen(interactable.onTriggerUpdate, (event: any) => this.showCursorFromEvent(binding, true, event));
    }

    private findScaffoldApi(): any {
        const root = this.scaffoldRoot || this.findObjectByName("VF Story Scaffold");
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && typeof script.showRoot === "function") return script;
        }
        return null;
    }

    private findDirectorApi(): any {
        const preferredRoot = this.directorRoot || this.findObjectByName("Story Step Director");
        const preferred = this.findScriptApi(preferredRoot, "stageStep");
        if (preferred) return preferred;
        return this.findScriptApi(this.sceneObject, "stageStep");
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

    private updateMenuPose(): void {
        if (!this.followUser) return;
        const camera = this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
        if (!camera) return;

        const cameraTransform = camera.getTransform();
        const cameraPosition = cameraTransform.getWorldPosition();
        const cameraRotation = cameraTransform.getWorldRotation();
        const right = this.safeDirection(cameraRotation.multiplyVec3(new vec3(1.0, 0.0, 0.0)), new vec3(1.0, 0.0, 0.0));
        const up = this.safeDirection(cameraRotation.multiplyVec3(new vec3(0.0, 1.0, 0.0)), new vec3(0.0, 1.0, 0.0));
        const forward = this.safeDirection(cameraRotation.multiplyVec3(new vec3(0.0, 0.0, -1.0)), new vec3(0.0, 0.0, -1.0));
        const target = cameraPosition
            .add(right.uniformScale(this.menuHorizontalOffsetCm))
            .add(up.uniformScale(this.menuVerticalOffsetCm))
            .add(forward.uniformScale(this.menuDistanceCm));

        const transform = this.sceneObject.getTransform();
        const current = transform.getWorldPosition();
        const alpha = this.clamp(getDeltaTime() * Math.max(0.0, this.followSmoothing), 0.05, 1.0);
        const next = this.mixVec3(current, target, alpha);
        transform.setWorldPosition(next);

        const toCamera = cameraPosition.sub(next);
        if (toCamera.length > 0.0001) {
            transform.setWorldRotation(quat.lookAt(this.normalizeVec(toCamera), up));
        }
    }

    private syncFoldState(): void {
        for (let i = 0; i < this.foldableObjects.length; i++) {
            this.foldableObjects[i].enabled = !this.folded;
        }
        for (let i = 0; i < this.utilityButtons.length; i++) {
            this.utilityButtons[i].object.enabled = true;
        }
        if (this.folded) {
            this.hideCursor();
            this.hidePanelCursor();
        }
    }

    private syncFieldSelectorState(): void {
        const visible = !this.folded && STORY_GUIDE_STEPS[this.currentIndex].id === "examples";
        for (let i = 0; i < this.fieldSelectorButtons.length; i++) {
            const binding = this.fieldSelectorButtons[i];
            binding.object.enabled = visible;
            binding.selected = binding.id === "field:" + this.selectedExampleField;
            this.updateBindingVisual(binding);
        }
    }

    private updateButtonAnimations(): void {
        this.updateBindingAnimations(this.cards);
        this.updateBindingAnimations(this.fieldSelectorButtons);
        this.updateBindingAnimations(this.navButtons);
        this.updateBindingAnimations(this.utilityButtons);
    }

    private updateBindingAnimations(bindings: ButtonBinding[]): void {
        const alpha = this.clamp(getDeltaTime() * 14.0, 0.0, 1.0);
        for (let i = 0; i < bindings.length; i++) {
            const binding = bindings[i];
            binding.visualScale += (binding.targetScale - binding.visualScale) * alpha;
            binding.visualLift += (binding.targetLift - binding.visualLift) * alpha;
            this.placeImageVisual(binding.image, binding.visualScale, binding.visualLift);
            this.placeImageVisual(binding.overlay, binding.visualScale, binding.visualLift + 0.02);
        }
    }

    private placeImageVisual(binding: ImageBinding, scale: number, lift: number): void {
        const transform = binding.object.getTransform();
        transform.setLocalPosition(new vec3(0, 0, binding.z + lift));
        transform.setLocalScale(new vec3(binding.width * scale, binding.height * scale, 1.0));
    }

    private showPanelCursorFromEvent(event: any): void {
        if (!this.panelCursorImage) return;
        const localPoint = this.cursorLocalPointFromEvent(event);
        const halfW = STORY_GUIDE_PANEL.width * 0.5;
        const halfH = STORY_GUIDE_PANEL.height * 0.5;
        const margin = this.panelCursorImage.width * 0.28;
        const targetX = localPoint ? this.clamp(localPoint.x, -halfW + margin, halfW - margin) : 0.0;
        const targetY = localPoint ? this.clamp(localPoint.y, -halfH + margin, halfH - margin) : 0.0;
        this.panelCursorTarget = new vec3(targetX, targetY, this.panelCursorImage.z);
        this.panelCursorTargetAlpha = 0.88;
        this.panelCursorTargetScale = 1.0;
        this.panelCursorImage.object.enabled = true;
    }

    private hidePanelCursor(): void {
        this.panelCursorTargetAlpha = 0.0;
        this.panelCursorTargetScale = 0.88;
    }

    private updatePanelCursorAnimation(): void {
        if (!this.panelCursorImage) return;
        const dt = getDeltaTime();
        const alpha = this.clamp(dt * 16.0, 0.0, 1.0);
        this.panelCursorCurrent = this.mixVec3(this.panelCursorCurrent, this.panelCursorTarget, alpha);
        this.panelCursorAlpha += (this.panelCursorTargetAlpha - this.panelCursorAlpha) * alpha;
        this.panelCursorScale += (this.panelCursorTargetScale - this.panelCursorScale) * alpha;

        if (this.panelCursorAlpha < 0.025 && this.panelCursorTargetAlpha <= 0.0) {
            this.panelCursorImage.object.enabled = false;
            return;
        }

        this.panelCursorImage.object.enabled = true;
        const transform = this.panelCursorImage.object.getTransform();
        transform.setLocalPosition(this.panelCursorCurrent);
        const scale = Math.max(0.01, this.panelCursorScale);
        transform.setLocalScale(new vec3(this.panelCursorImage.width * scale, this.panelCursorImage.height * scale, 1.0));
        this.setImageAlpha(this.panelCursorImage, this.panelCursorAlpha);
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

    private cursorLocalPointFromEvent(event: any): vec3 | null {
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

    private listen(eventApi: any, callback: (event?: any) => void): void {
        if (eventApi && typeof eventApi.add === "function") {
            eventApi.add(callback);
        }
    }

    private twoDigit(value: number): string {
        return value < 10 ? "0" + value : "" + value;
    }

    private selectExampleField(field: ExampleFieldId): void {
        this.selectedExampleField = field;
        if (STORY_GUIDE_STEPS[this.currentIndex].id !== "examples") {
            this.goTo(this.stepIndexForId("examples"));
            return;
        }
        this.stageCurrentRoot();
        this.syncVisualState();
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

    private stepIndexForId(id: string): number {
        for (let i = 0; i < STORY_GUIDE_STEPS.length; i++) {
            if (STORY_GUIDE_STEPS[i].id === id) return i;
        }
        return 0;
    }

    private exampleFieldLabel(field: ExampleFieldId): string {
        for (let i = 0; i < EXAMPLE_FIELD_OPTIONS.length; i++) {
            if (EXAMPLE_FIELD_OPTIONS[i].id === field) return EXAMPLE_FIELD_OPTIONS[i].label;
        }
        return "Gravity";
    }
}
