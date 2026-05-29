// VectorFieldsChapterGuide.ts
// Texture-backed chapter guide with UIKit hit targets.

import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { STORY_GUIDE_NAV, STORY_GUIDE_PANEL, STORY_GUIDE_STEPS } from "./StoryGuideLayoutGenerated";

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

    private panelImage: ImageBinding | null = null;
    private cards: ButtonBinding[] = [];
    private progressText: Text | null = null;
    private currentIndex: number = 0;
    private scaffoldApi: any = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.build());
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
        this.scaffoldApi = this.findScaffoldApi();
        this.sceneObject.enabled = this.showOnStart;

        this.panelImage = this.createImage(this.sceneObject, "__GuidePanelImage", {
            x: this.panelOffset.x,
            y: this.panelOffset.y,
            width: STORY_GUIDE_PANEL.width,
            height: STORY_GUIDE_PANEL.height,
        }, TEX_PANEL, 220, 0.0);

        this.createProgressText();

        for (let i = 0; i < STORY_GUIDE_STEPS.length; i++) {
            const step = STORY_GUIDE_STEPS[i];
            const tex = CARD_TEXTURES[step.id];
            if (!tex) continue;
            const slot = this.offsetSlot(step.slot);
            this.cards.push(this.createTextureButton(
                "__GuideCard_" + step.id,
                step.id,
                slot,
                tex.normal,
                tex.active,
                tex.pressed,
                242,
                () => this.goTo(i)
            ));
        }

        this.createNavButton("__GuideBack", "back", this.offsetSlot(STORY_GUIDE_NAV.back), TEX_NAV_BACK_NORMAL, TEX_NAV_BACK_PRESSED, 244, () => this.prev());
        this.createNavButton("__GuideNext", "next", this.offsetSlot(STORY_GUIDE_NAV.next), TEX_NAV_NEXT_NORMAL, TEX_NAV_NEXT_PRESSED, 244, () => this.next());

        this.goTo(this.currentIndex);
        print("VectorFieldsChapterGuide: built " + STORY_GUIDE_STEPS.length + " slots at 50 px/cm");
    }

    private createNavButton(name: string, id: string, slot: StoryGuideSlot, normal: Texture, pressed: Texture, renderOrder: number, action: () => void): void {
        this.createTextureButton(name, id, slot, normal, normal, pressed, renderOrder, action);
    }

    private createTextureButton(name: string, id: string, slot: StoryGuideSlot, normal: Texture, active: Texture, pressed: Texture, renderOrder: number, action: () => void): ButtonBinding {
        const buttonObject = global.scene.createSceneObject(name);
        buttonObject.setParent(this.sceneObject);
        this.place(buttonObject, slot.x, slot.y, 0.34);

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
