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

type ImageBinding = {
    object: SceneObject;
    component: Image;
    material: Material;
};

type ButtonBinding = {
    id: string;
    object: SceneObject;
    image: ImageBinding;
    normal: Texture;
    active: Texture;
    pressed: Texture;
    selected: boolean;
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

@component
export class VectorFieldsChapterGuide extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("VF Story Scaffold root. If empty, the script searches for it by name.")
    scaffoldRoot: SceneObject = null as any;

    @input
    @hint("Start visible and immediately stage the first chapter.")
    showOnStart: boolean = true;

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
    private foldableObjects: SceneObject[] = [];
    private progressText: Text | null = null;
    private currentIndex: number = 0;
    private scaffoldApi: any = null;
    private built: boolean = false;
    private startEventRef: any = null;
    private updateEventRef: any = null;

    onAwake(): void {
        this.startEventRef = this.createEvent("OnStartEvent");
        this.startEventRef.bind(() => this.build());
        this.updateEventRef = this.createEvent("UpdateEvent");
        this.updateEventRef.bind(() => this.updateMenuPose());
    }

    public next(): void {
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
        this.sceneObject.enabled = this.showOnStart;

        const panelImage = this.createImage(this.sceneObject, "__GuidePanelImage", {
            x: this.panelOffset.x,
            y: this.panelOffset.y,
            width: STORY_GUIDE_PANEL.width,
            height: STORY_GUIDE_PANEL.height,
        }, TEX_PANEL, 220, 0.0);
        this.panelImage = panelImage;
        this.registerFoldable(panelImage.object);

        this.createProgressText();

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
                () => this.goTo(i)
            );
            this.cards.push(card);
        }

        this.createNavButton("__GuideBack", "back", this.offsetSlot(STORY_GUIDE_NAV.back), TEX_NAV_BACK_NORMAL, TEX_NAV_BACK_PRESSED, 244, () => this.prev());
        this.createNavButton("__GuideNext", "next", this.offsetSlot(STORY_GUIDE_NAV.next), TEX_NAV_NEXT_NORMAL, TEX_NAV_NEXT_PRESSED, 244, () => this.next());
        this.createUtilityButtons();

        this.goTo(this.currentIndex);
        print("VectorFieldsChapterGuide: built " + STORY_GUIDE_STEPS.length + " slots at 50 px/cm");
    }

    private createNavButton(name: string, id: string, slot: StoryGuideSlot, normal: Texture, pressed: Texture, renderOrder: number, action: () => void): void {
        this.navButtons.push(this.createTextureButton(name, id, slot, normal, normal, pressed, renderOrder, action));
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
            false
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
            false
        );
        this.foldButton = foldButton;
        this.utilityButtons.push(foldButton);
    }

    private createTextureButton(name: string, id: string, slot: StoryGuideSlot, normal: Texture, active: Texture, pressed: Texture, renderOrder: number, action: () => void, foldable: boolean = true): ButtonBinding {
        const buttonObject = global.scene.createSceneObject(name);
        buttonObject.setParent(this.sceneObject);
        this.place(buttonObject, slot.x, slot.y, 0.34);
        if (foldable) {
            this.registerFoldable(buttonObject);
        }

        const button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton;
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

        const binding: ButtonBinding = {
            id,
            object: buttonObject,
            image,
            normal,
            active,
            pressed,
            selected: false,
        };

        this.listen((button as any).onTriggerDown, () => this.setBindingTexture(binding, binding.pressed));
        this.listen((button as any).onTriggerUp, () => {
            action();
            this.syncVisualState();
            this.setBindingTexture(binding, binding.selected ? binding.active : binding.normal);
        });
        this.listen((button as any).onHoverExit, () => {
            this.syncVisualState();
            this.setBindingTexture(binding, binding.selected ? binding.active : binding.normal);
        });
        return binding;
    }

    private createImage(parent: SceneObject, name: string, slot: StoryGuideSlot, texture: Texture, renderOrder: number, z: number): ImageBinding {
        const object = global.scene.createSceneObject(name);
        object.setParent(parent);
        this.place(object, slot.x, slot.y, z);
        object.getTransform().setLocalScale(new vec3(slot.width, slot.height, 1.0));

        const image = object.createComponent("Image") as Image;
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
        return { object, component: image, material };
    }

    private createProgressText(): void {
        const slot = this.offsetSlot(STORY_GUIDE_NAV.progress);
        const object = global.scene.createSceneObject("__GuideProgressText");
        object.setParent(this.sceneObject);
        this.place(object, slot.x, slot.y, 0.62);
        this.registerFoldable(object);

        this.progressText = object.createComponent("Component.Text") as Text;
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

    private syncVisualState(): void {
        for (let i = 0; i < this.cards.length; i++) {
            const binding = this.cards[i];
            binding.selected = i === this.currentIndex;
            this.setBindingTexture(binding, binding.selected ? binding.active : binding.normal);
        }
        if (this.progressText) {
            const current = STORY_GUIDE_STEPS[this.currentIndex].index;
            this.progressText.text = current + " / " + this.twoDigit(STORY_GUIDE_STEPS.length);
        }
        if (this.followButton) {
            const texture = this.followUser ? TEX_UTILITY_FOLLOW_ON : TEX_UTILITY_FOLLOW_OFF;
            this.followButton.normal = texture;
            this.followButton.active = texture;
            this.followButton.selected = false;
            this.setBindingTexture(this.followButton, texture);
        }
        if (this.foldButton) {
            const texture = this.folded ? TEX_UTILITY_FOLD_CLOSED : TEX_UTILITY_FOLD_OPEN;
            this.foldButton.normal = texture;
            this.foldButton.active = texture;
            this.foldButton.selected = false;
            this.setBindingTexture(this.foldButton, texture);
        }
        this.syncFoldState();
    }

    private stageCurrentRoot(): void {
        const step = STORY_GUIDE_STEPS[this.currentIndex];
        if (this.scaffoldApi && typeof this.scaffoldApi.showRoot === "function") {
            this.scaffoldApi.showRoot(step.root);
        }
    }

    private setBindingTexture(binding: ButtonBinding, texture: Texture): void {
        this.applyTexture(binding.image.material, texture, binding.image.component);
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

    private updateMenuPose(): void {
        if (!this.followUser) return;
        const camera = this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
        if (!camera) return;

        const cameraTransform = camera.getTransform();
        const cameraPosition = cameraTransform.getWorldPosition();
        const right = this.safeDirection(cameraTransform.right, new vec3(1.0, 0.0, 0.0));
        const up = this.safeDirection(cameraTransform.up, new vec3(0.0, 1.0, 0.0));
        const forward = this.safeDirection(cameraTransform.forward, new vec3(0.0, 0.0, -1.0));
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
    }

    private registerFoldable(object: SceneObject): void {
        if (!object) return;
        this.foldableObjects.push(object);
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

    private listen(eventApi: any, callback: () => void): void {
        if (eventApi && typeof eventApi.add === "function") {
            eventApi.add(callback);
        }
    }

    private twoDigit(value: number): string {
        return value < 10 ? "0" + value : "" + value;
    }
}
