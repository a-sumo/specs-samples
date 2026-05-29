import { FieldButtonBinding, VectorFieldUIStyle } from "./VectorFieldUIStyle";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { FlexSlot, SpatialFlexLite, SpatialRect } from "./SpatialFlexLite";

// NarrationPanel.ts
// Sequenced explanation of vector fields. Holds a list of chapters,
// drives a body Text component, advances via a Next button or jumps
// directly via a row of chapter shortcut toggles.

interface Chapter {
    id: string;
    body: string;
    equation?: string;
    vizIndex?: number;
    presetIndex?: number;
    tubeMode?: number;        // 0=Trails, 1=Particles, 2=Arrows
    flowSpeedNorm?: number;   // 0..1, freezes flow at 0
    domainMode?: number;      // 0=volume, 1=sphere surface
    sphereRadius?: number;
    gravityStage?: number;    // 0=bodies, 1=flat arrows, 2=well + field lines
    mediaTexture?: Texture;
    mediaCaption?: string;
}

interface Milestone {
    label: string;
    slideIndex: number;
}

const VECTOR_VIZ_INDEX = 4;
const GRAVITY_VIZ_INDEX = 13;
const MAGNETIC_VIZ_INDEX = 14;
const GUIDE_PANEL_WIDTH_CM = 28.0;
const GUIDE_PANEL_HEIGHT_CM = 29.0;
const GUIDE_FONT: Font = requireAsset("../Fonts/Source_Sans_3/static/SourceSans3-SemiBold.ttf") as Font;
const ARTICLE_IMAGE_MATERIAL: Material = requireAsset("../Image.mat") as Material;
const TEX_EXPANSION: Texture = requireAsset("../Images/expansion_preview.png") as Texture;
const TEX_CONTRACTION: Texture = requireAsset("../Images/contraction_preview.png") as Texture;
const TEX_CIRCULATION: Texture = requireAsset("../Images/circulation_preview.png") as Texture;
const TEX_WAVES: Texture = requireAsset("../Images/waves_preview.png") as Texture;
const TEX_MAGNETIC: Texture = requireAsset("../Images/magnetic_preview.png") as Texture;
const TEX_RENDER_MODES: Texture = requireAsset("../Images/Article/rendering_modes.png") as Texture;
const TEX_TUBE_MESH: Texture = requireAsset("../Images/Article/tube_mesh.png") as Texture;
const TEX_LINE_DEFORMATION: Texture = requireAsset("../Images/Article/line_deformation.png") as Texture;
const TEX_MAGNETIC_DEMO: Texture = requireAsset("../Images/Article/magnetic_demo.png") as Texture;
const TEX_DIPOLE_MATH: Texture = requireAsset("../Images/Article/dipole_math.png") as Texture;

@component
export class NarrationPanel extends BaseScriptComponent {

    @input
    @hint("Text component that displays the current chapter body")
    bodyText: Text;

    @input
    @hint("Optional: container with a ToggleGroup for chapter shortcut buttons")
    chapterToggleContainer: SceneObject;

    @input
    @hint("Optional: prefab to instantiate per chapter (single-toggle style)")
    chapterTogglePrefab: ObjectPrefab;

    @input
    @hint("Spacing between chapter shortcut buttons")
    chapterToggleSpacing: number = 4.0;

    @input
    @hint("Child name on the chapter toggle prefab that holds the label text")
    chapterLabelChildName: string = "Toggle Text";

    @input
    @hint("Optional: prefab to instantiate as the Next button")
    nextButtonPrefab: ObjectPrefab;

    @input
    @hint("Optional: container to instantiate the Next button under")
    nextButtonContainer: SceneObject;

    @input
    @hint("Label shown on the Next button")
    nextButtonLabel: string = "Next";

    @input
    @hint("Optional: prefab to instantiate as the Prev button")
    prevButtonPrefab: ObjectPrefab;

    @input
    @hint("Optional: container to instantiate the Prev button under")
    prevButtonContainer: SceneObject;

    @input
    @hint("Label shown on the Prev button")
    prevButtonLabel: string = "Prev";

    @input
    @hint("Optional: Text component showing 'N / Total' slide indicator")
    slideIndicator: Text;

    @input
    @hint("Optional: Text component showing the field equation for the current slide")
    equationText: Text;

    @input
    @hint("One root SceneObject per slide. Active slide's root is enabled, others disabled.")
    vizRoots: SceneObject[];

    @input
    @hint("Optional: VectorField ScriptComponent. Slides with presetIndex call setPreset() on this.")
    vectorFieldComponent: ScriptComponent;

    @input
    @hint("Optional: Settings frame to enable once the user reaches the final slide.")
    settingsRoot: SceneObject;

    @input
    @allowUndefined
    @hint("Flat/toon material cloned for custom button and panel meshes")
    uiMaterial: Material = null as any;

    private milestones: Milestone[] = [
        { label: "Start",   slideIndex: 0 },
        { label: "Arrows",  slideIndex: 1 },
        { label: "Patterns", slideIndex: 4 },
        { label: "Surface", slideIndex: 8 },
        { label: "Gravity", slideIndex: 9 },
        { label: "Explore", slideIndex: 12 },
    ];

    private chapters: Chapter[] = [
        { id: "welcome", body: "A vector field puts a direction and a strength at every point in space.", equation: "direction + strength everywhere", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 2, presetIndex: 0, flowSpeedNorm: 0.0, domainMode: 0, mediaTexture: TEX_RENDER_MODES, mediaCaption: "The same field can be read as arrows, particles, or paths." },
        { id: "where", body: "That one idea shows up in wind, fluids, magnetism, and gravity.", equation: "motion field or force field", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 1, presetIndex: 0, flowSpeedNorm: 0.18, domainMode: 0, mediaTexture: TEX_TUBE_MESH, mediaCaption: "In AR, the field becomes geometry you can walk around." },
        { id: "arrows", body: "Arrows sample the field. Each arrow says which way this point wants to move.", equation: "F(x, y, z) -> vector", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 2, presetIndex: 0, flowSpeedNorm: 0.0, domainMode: 0, mediaTexture: TEX_RENDER_MODES, mediaCaption: "Arrow direction shows orientation; arrow size shows strength." },
        { id: "tracers", body: "Particles show motion. They are tiny tracers carried by the field over time.", equation: "particles follow F", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 1, presetIndex: 2, flowSpeedNorm: 0.38, domainMode: 0, mediaTexture: TEX_LINE_DEFORMATION, mediaCaption: "The new point mode uses sprite-like fans instead of tube stubs." },
        { id: "paths", body: "Trails connect those steps into continuous paths through the field.", equation: "p next = p + F(p) step", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 2, flowSpeedNorm: 0.42, domainMode: 0, mediaTexture: TEX_LINE_DEFORMATION, mediaCaption: "Each step bends the line along the flow." },
        { id: "burst", body: "Some fields push outward, like a source or an expanding wave.", equation: "expansion", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 0, flowSpeedNorm: 0.55, domainMode: 0, mediaTexture: TEX_EXPANSION, mediaCaption: "Abstract patterns make the field language easy to compare." },
        { id: "sink", body: "Some fields pull inward, which is the bridge toward gravity.", equation: "contraction", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 1, flowSpeedNorm: 0.55, domainMode: 0, mediaTexture: TEX_CONTRACTION, mediaCaption: "A sink field makes every nearby point point toward a center." },
        { id: "orbit", body: "Some fields turn sideways, so motion curls instead of going straight.", equation: "circulation", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 2, flowSpeedNorm: 0.55, domainMode: 0, mediaTexture: TEX_CIRCULATION, mediaCaption: "Circulation is where field lines start to feel spatial." },
        { id: "surface", body: "Fields can live on surfaces too, like wind sliding across a planet.", equation: "surface flow", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 8, flowSpeedNorm: 0.36, domainMode: 1, sphereRadius: 4.8, mediaTexture: TEX_WAVES, mediaCaption: "This test keeps moving trails projected onto a sphere." },
        { id: "gravity-bodies", body: "Now make it physical: Earth, the Moon, and a satellite all create or feel pull.", equation: "gravity = pull toward mass", vizIndex: GRAVITY_VIZ_INDEX, gravityStage: 0, mediaTexture: TEX_DIPOLE_MATH, mediaCaption: "Gravity starts as a pull around mass." },
        { id: "gravity-arrows", body: "On a flat plane, arrows show which way a satellite would accelerate.", equation: "g(x, z) points inward", vizIndex: GRAVITY_VIZ_INDEX, gravityStage: 1, mediaTexture: TEX_DIPOLE_MATH, mediaCaption: "The stronger the pull, the stronger the arrow." },
        { id: "gravity-lines", body: "Field lines show the path. A gravity well can use height to show intensity.", equation: "field lines + gravity well", vizIndex: GRAVITY_VIZ_INDEX, gravityStage: 2, mediaTexture: TEX_LINE_DEFORMATION, mediaCaption: "The line direction and the surface height explain different parts of the same field." },
        { id: "magnetic", body: "Magnetic fields are the next concrete example: loops between poles, like iron filings around magnets.", equation: "magnetic dipole field", vizIndex: MAGNETIC_VIZ_INDEX, mediaTexture: TEX_MAGNETIC_DEMO, mediaCaption: "The existing magnetic demo becomes one chapter in the larger field story." },
        { id: "explore", body: "From here, the controls open so you can compare arrows, particles, and trails directly.", equation: "try the examples", vizIndex: VECTOR_VIZ_INDEX, tubeMode: 0, presetIndex: 2, flowSpeedNorm: 0.45, domainMode: 0, mediaTexture: TEX_MAGNETIC, mediaCaption: "This lands softly into the examples instead of ending like an article." },
    ];

    private currentIndex: number = 0;
    private chapterToggles: SceneObject[] = [];
    private chapterButtonStyles: FieldButtonBinding[] = [];
    private advanceButtonStyles: FieldButtonBinding[] = [];
    private suppressToggleCallback: boolean = false;
    private toggleGroupRef: any = null;
    private settingsUnlocked: boolean = false;
    private panelStyled: boolean = false;
    private tutorialVisible: boolean = true;
    private nextButtonStyle: FieldButtonBinding | null = null;
    private skipButtonStyle: FieldButtonBinding | null = null;
    private guideButtonStyle: FieldButtonBinding | null = null;
    private mediaRoot: SceneObject | null = null;
    private mediaImageObject: SceneObject | null = null;
    private mediaImage: Image | null = null;
    private mediaImageMaterial: Material | null = null;
    private mediaCaptionText: Text | null = null;
    private generatedNavRoot: SceneObject | null = null;
    private visualTransitionEvent: DelayedCallbackEvent | null = null;
    private pendingChapter: Chapter | null = null;
    private lastVizIndex: number = -999;
    private lastTubeMode: number = -999;
    private lastDomainMode: number = -999;
    private lastGravityStage: number = -999;

    onAwake() {
        if (!this.isConfigured()) return;
        if (this.settingsRoot) {
            this.settingsRoot.enabled = false;
        }
        this.visualTransitionEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        this.visualTransitionEvent.bind(() => this.flushPendingVisualTransition());
        this.layoutGuideShell();
        this.stylePanelShell();
        this.buildArticleMediaCard();
        this.styleNarrationText();
        this.layoutFieldRoots();
        this.buildChapterButtons();
        this.wireNextButton();
        this.wirePrevButton();
        this.wireSkipButton();
        this.wireGuideButton();
        this.applyGuideLayout();
        this.applyChapter();
        this.syncWindowVisibility();

        // Re-apply once after startup so instantiated buttons and staged roots
        // settle before the first visual chapter owns the scene.
        const delay = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        delay.bind(() => this.applyChapter());
        delay.reset(0.15);

        this.createEvent("UpdateEvent").bind(() => this.updateButtonStyles());
    }

    private isConfigured(): boolean {
        return !!(this.bodyText || this.chapterToggleContainer || this.nextButtonContainer || this.prevButtonContainer || this.settingsRoot);
    }

    next(): void {
        if (this.currentIndex < this.chapters.length - 1) {
            this.goTo(this.currentIndex + 1);
        } else {
            this.finishTutorial();
        }
    }

    prev(): void {
        if (this.currentIndex > 0) {
            this.goTo(this.currentIndex - 1);
        }
    }

    goTo(index: number): void {
        if (index < 0 || index >= this.chapters.length) return;
        this.currentIndex = index;
        this.applyChapter();
        this.syncChapterButtons();
    }

    openTutorial(): void {
        this.tutorialVisible = true;
        this.syncWindowVisibility();
        this.applyChapter();
        this.syncChapterButtons();
    }

    closeTutorial(): void {
        this.tutorialVisible = false;
        this.syncWindowVisibility();
    }

    skipTutorial(): void {
        this.currentIndex = this.chapters.length - 1;
        this.applyChapter();
        this.finishTutorial();
    }

    finishTutorial(): void {
        this.settingsUnlocked = true;
        this.tutorialVisible = false;
        this.applyChapter();
        this.syncWindowVisibility();
    }

    getChapterCount(): number {
        return this.chapters.length;
    }

    getCurrentIndex(): number {
        return this.currentIndex;
    }

    private applyChapter(): void {
        const ch = this.chapters[this.currentIndex];
        if (!ch) return;
        if (this.bodyText) {
            this.bodyText.text = ch.body;
        }
        if (this.slideIndicator) {
            this.slideIndicator.text = (this.currentIndex + 1) + " / " + this.chapters.length;
            this.slideIndicator.enabled = false;
        }
        if (this.equationText) {
            this.equationText.text = ch.equation || "";
        }
        this.applyArticleMedia(ch);
        this.applyGuideLayout();
        this.requestVisualTransition(ch);
        this.applySettingsUnlock();
        this.syncAdvanceButtonLabels();
    }

    private applySettingsUnlock(): void {
        if (!this.settingsRoot) return;
        this.settingsRoot.enabled = this.settingsUnlocked && !this.tutorialVisible;
    }

    private syncWindowVisibility(): void {
        this.setTutorialPresentation(this.tutorialVisible);
        if (this.settingsRoot) {
            this.settingsRoot.enabled = this.settingsUnlocked && !this.tutorialVisible;
        }
    }

    private setTutorialPresentation(visible: boolean): void {
        this.sceneObject.enabled = true;
        this.setRootVisualComponentsEnabled(this.sceneObject, visible);
        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            child.enabled = visible && child.name.indexOf("__FieldPanelAccent") !== 0 && !this.isLegacyGuideContainer(child);
        }
        if (this.slideIndicator) this.slideIndicator.enabled = false;
    }

    private setRootVisualComponentsEnabled(obj: SceneObject, enabled: boolean): void {
        const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) rmv.enabled = enabled;
        const text = obj.getComponent("Component.Text") as Text;
        if (text) text.enabled = enabled;
    }

    private isLegacyGuideContainer(obj: SceneObject): boolean {
        return obj.name === "NarrationUI" || obj === this.chapterToggleContainer || obj === this.nextButtonContainer || obj === this.prevButtonContainer;
    }

    private applyPresetForChapter(ch: Chapter): void {
        if (!this.vectorFieldComponent) return;
        const scriptComponent = this.vectorFieldComponent as any;
        const vf = scriptComponent.fieldApi || scriptComponent;
        const domainMode = typeof ch.domainMode === "number" ? ch.domainMode : 0;
        if (vf.setDomainMode) {
            vf.setDomainMode(domainMode);
        } else if (vf.domainMode !== undefined) {
            vf.domainMode = domainMode;
        }
        if (typeof ch.sphereRadius === "number" && vf.setSphereRadius) {
            vf.setSphereRadius(ch.sphereRadius);
        } else if (typeof ch.sphereRadius === "number" && vf.sphereRadius !== undefined) {
            vf.sphereRadius = ch.sphereRadius;
        }
        if (typeof ch.tubeMode === "number" && vf.setTubeMode) {
            vf.setTubeMode(ch.tubeMode);
        } else if (typeof ch.tubeMode === "number" && vf.tubeMode !== undefined) {
            vf.tubeMode = ch.tubeMode;
        }
        if (typeof ch.presetIndex === "number") {
            if (vf.setPreset) vf.setPreset(ch.presetIndex);
            else if (vf.preset !== undefined) vf.preset = ch.presetIndex;
        }
        if (typeof ch.flowSpeedNorm === "number" && vf.setFlowSpeedNormalized) {
            vf.setFlowSpeedNormalized(ch.flowSpeedNorm);
        } else if (typeof ch.flowSpeedNorm === "number" && vf.flowSpeed !== undefined) {
            vf.flowSpeed = ch.flowSpeedNorm * 100.0;
        }
    }

    private requestVisualTransition(ch: Chapter): void {
        if (this.shouldShowLoadingForChapter(ch) && this.visualTransitionEvent) {
            this.pendingChapter = ch;
            if (this.equationText) {
                this.equationText.text = "Loading field...";
            }
            this.hideVizRoots();
            this.visualTransitionEvent.reset(0.06);
            return;
        }
        this.applyVisualsNow(ch);
    }

    private flushPendingVisualTransition(): void {
        const ch = this.pendingChapter;
        this.pendingChapter = null;
        if (!ch) return;
        this.applyVisualsNow(ch);
    }

    private applyVisualsNow(ch: Chapter): void {
        if (this.equationText) {
            this.equationText.text = ch.equation || "";
        }
        this.applyVizForChapter(ch);
        this.applyPresetForChapter(ch);
        this.applyGravityStageForChapter(ch);
        this.lastVizIndex = typeof ch.vizIndex === "number" ? ch.vizIndex : -999;
        this.lastTubeMode = typeof ch.tubeMode === "number" ? ch.tubeMode : this.lastTubeMode;
        this.lastDomainMode = typeof ch.domainMode === "number" ? ch.domainMode : 0;
        this.lastGravityStage = typeof ch.gravityStage === "number" ? ch.gravityStage : this.lastGravityStage;
    }

    private shouldShowLoadingForChapter(ch: Chapter): boolean {
        const vizIndex = typeof ch.vizIndex === "number" ? ch.vizIndex : -999;
        if (this.lastVizIndex !== -999 && vizIndex !== this.lastVizIndex) return true;
        if (typeof ch.tubeMode === "number" && ch.tubeMode !== this.lastTubeMode) return true;
        const domainMode = typeof ch.domainMode === "number" ? ch.domainMode : 0;
        if (domainMode !== this.lastDomainMode && this.lastDomainMode !== -999) return true;
        if (typeof ch.gravityStage === "number" && ch.gravityStage !== this.lastGravityStage) return true;
        return false;
    }

    private hideVizRoots(): void {
        if (!this.vizRoots || this.vizRoots.length === 0) return;
        const seen: SceneObject[] = [];
        for (let i = 0; i < this.vizRoots.length; i++) {
            const root = this.vizRoots[i];
            if (!root) continue;
            if (seen.indexOf(root) !== -1) continue;
            seen.push(root);
            root.enabled = false;
        }
    }

    private applyVizForChapter(ch: Chapter): void {
        if (!this.vizRoots || this.vizRoots.length === 0) return;
        const target = (typeof ch.vizIndex === "number") ? ch.vizIndex : -1;
        const targetRoot = (target >= 0 && target < this.vizRoots.length) ? this.vizRoots[target] : null;

        const seen: SceneObject[] = [];
        for (let i = 0; i < this.vizRoots.length; i++) {
            const root = this.vizRoots[i];
            if (!root) continue;
            if (seen.indexOf(root) !== -1) continue;
            seen.push(root);
            root.enabled = (root === targetRoot);
        }
    }

    private applyGravityStageForChapter(ch: Chapter): void {
        if (typeof ch.gravityStage !== "number") return;
        const root = this.vizRoots && this.vizRoots.length > GRAVITY_VIZ_INDEX ? this.vizRoots[GRAVITY_VIZ_INDEX] : null;
        if (!root) return;
        const gravityScript = this.findScriptWithMethod(root, "setStage");
        if (gravityScript) {
            gravityScript.setStage(ch.gravityStage);
        }
    }

    private findScriptWithMethod(obj: SceneObject, methodName: string): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            if (s && typeof s[methodName] === "function") {
                return s;
            }
        }
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findScriptWithMethod(obj.getChild(i), methodName);
            if (found) return found;
        }
        return null;
    }

    private styleNarrationText(): void {
        const titleText = this.sceneObject.getComponent("Component.Text") as Text;
        const brightText = new vec4(1.0, 0.98, 0.94, 1.0);
        const quietText = new vec4(0.92, 0.92, 0.88, 1.0);
        const outline = new vec4(0.08, 0.08, 0.09, 1.0);
        if (titleText) {
            titleText.text = "Vector Fields";
        }
        VectorFieldUIStyle.configureText(titleText, brightText, outline, 95);
        VectorFieldUIStyle.configureText(this.bodyText, brightText, outline, 92);
        VectorFieldUIStyle.configureText(this.equationText, quietText, outline, 93);
        VectorFieldUIStyle.configureText(this.slideIndicator, quietText, outline, 94);
        VectorFieldUIStyle.configureText(this.mediaCaptionText, quietText, outline, 91);
        this.applyGuideLayout();
    }

    private configureTextRect(text: Text | null, fontSize: number, widthCm: number, heightCm: number, yOffsetCm: number): void {
        if (!text) return;
        SpatialFlexLite.applyTextRect(text, new SpatialRect(0, yOffsetCm, widthCm, heightCm), fontSize, GUIDE_FONT);
    }

    private getGuideLayout(): { title: SpatialRect, body: SpatialRect, media: SpatialRect, equation: SpatialRect, next: SpatialRect, skip: SpatialRect } {
        const panel = SpatialRect.centered(GUIDE_PANEL_WIDTH_CM, GUIDE_PANEL_HEIGHT_CM);
        const content = panel.inset(2.0, 2.0, 4.8, 1.3);
        const slots = SpatialFlexLite.column(content, [
            new FlexSlot(2.6),
            new FlexSlot(4.3, 0, 3.8, 4.8),
            new FlexSlot(7.7),
            new FlexSlot(1.5),
            new FlexSlot(2.8),
        ], 1.0);
        return {
            title: slots[0],
            body: slots[1],
            media: slots[2],
            equation: slots[3],
            next: slots[4].withWidth(9.0, 0.0),
            skip: new SpatialRect(8.75, 11.55, 5.6, 2.1),
        };
    }

    private applyGuideLayout(): void {
        const layout = this.getGuideLayout();
        const titleText = this.sceneObject.getComponent("Component.Text") as Text;
        this.configureTextRect(titleText, 72, layout.title.width, layout.title.height, layout.title.y);
        const bodySize = SpatialFlexLite.fitTextSize(this.bodyText ? this.bodyText.text : "", 44, 34, layout.body);
        SpatialFlexLite.applyTextRect(this.bodyText, layout.body, bodySize, GUIDE_FONT);
        const equationSize = SpatialFlexLite.fitTextSize(this.equationText ? this.equationText.text : "", 32, 26, layout.equation);
        SpatialFlexLite.applyTextRect(this.equationText, layout.equation, equationSize, GUIDE_FONT);
        SpatialFlexLite.applyTextRect(this.slideIndicator, new SpatialRect(0, -13.6, 8.0, 1.2), 26, GUIDE_FONT);
        this.layoutArticleMediaCard(layout.media);
        if (this.nextButtonStyle) {
            this.placeInstancedObject(this.nextButtonStyle.button, new vec3(layout.next.x, layout.next.y, 0.0));
        }
        if (this.skipButtonStyle) {
            this.placeInstancedObject(this.skipButtonStyle.button, new vec3(layout.skip.x, layout.skip.y, 0.0));
        }
    }

    private buildArticleMediaCard(): void {
        this.mediaRoot = this.ensureGeneratedContainer(this.sceneObject, "__GuideMediaRoot", new vec3(0.0, -2.5, 0.52));
        VectorFieldUIStyle.preparePanel(this.mediaRoot, {
            widthCm: 20.8,
            heightCm: 5.8,
            depthCm: 0.18,
            cornerRadiusCm: 0.38,
            frameThicknessCm: 0.12,
            renderOrder: 42,
            panelMaterial: this.uiMaterial,
            backplateColor: new vec4(0.28, 0.28, 0.29, 0.96),
            frameColor: new vec4(0.82, 0.82, 0.78, 1.0),
        });

        this.mediaImageObject = this.ensureGeneratedContainer(this.mediaRoot, "__ArticlePreviewImage", new vec3(0.0, 0.55, 0.48));
        this.mediaImage = this.mediaImageObject.getComponent("Image") as Image;
        if (!this.mediaImage) {
            this.mediaImage = this.mediaImageObject.createComponent("Image") as Image;
        }
        this.mediaImageMaterial = ARTICLE_IMAGE_MATERIAL.clone();
        try {
            this.mediaImage.clearMaterials();
            this.mediaImage.mainMaterial = this.mediaImageMaterial;
            this.mediaImage.renderOrder = 86;
            this.mediaImage.mainPass.depthTest = false;
            this.mediaImage.mainPass.depthWrite = false;
        } catch (e) {}

        const captionObj = this.ensureGeneratedContainer(this.mediaRoot, "__ArticlePreviewCaption", new vec3(0.0, -2.22, 0.58));
        this.mediaCaptionText = captionObj.getComponent("Component.Text") as Text;
        if (!this.mediaCaptionText) {
            this.mediaCaptionText = captionObj.createComponent("Component.Text") as Text;
        }
        this.mediaCaptionText.text = "";
        SpatialFlexLite.applyTextRect(this.mediaCaptionText, new SpatialRect(0.0, -2.22, 18.8, 1.0), 24, GUIDE_FONT);
    }

    private layoutArticleMediaCard(rect: SpatialRect): void {
        if (!this.mediaRoot) return;
        this.mediaRoot.getTransform().setLocalPosition(new vec3(rect.x, rect.y, 0.52));
        VectorFieldUIStyle.preparePanel(this.mediaRoot, {
            widthCm: rect.width,
            heightCm: rect.height,
            depthCm: 0.18,
            cornerRadiusCm: 0.38,
            frameThicknessCm: 0.12,
            renderOrder: 42,
            panelMaterial: this.uiMaterial,
            backplateColor: new vec4(0.28, 0.28, 0.29, 0.96),
            frameColor: new vec4(0.82, 0.82, 0.78, 1.0),
        });
        if (this.mediaCaptionText) {
            SpatialFlexLite.applyTextRect(this.mediaCaptionText, new SpatialRect(0.0, -rect.height * 0.38, rect.width - 1.8, 1.0), 24, GUIDE_FONT);
        }
    }

    private applyArticleMedia(ch: Chapter): void {
        if (!this.mediaRoot || !this.mediaImage || !this.mediaImageObject) return;
        const texture = ch.mediaTexture || TEX_EXPANSION;
        this.mediaRoot.enabled = true;
        this.setMediaTexture(texture);
        if (this.mediaCaptionText) {
            this.mediaCaptionText.text = ch.mediaCaption || "";
        }
    }

    private setMediaTexture(texture: Texture): void {
        if (!this.mediaImage || !this.mediaImageObject || !this.mediaImageMaterial || !texture) return;
        const layout = this.getGuideLayout();
        const mediaRect = layout.media;
        const maxW = Math.max(1.0, mediaRect.width - 2.0);
        const maxH = Math.max(1.0, mediaRect.height - 1.8);
        let texW = 1;
        let texH = 1;
        try {
            texW = Math.max(1, texture.getWidth());
            texH = Math.max(1, texture.getHeight());
        } catch (e) {}
        const aspect = texW / texH;
        let w = maxW;
        let h = w / aspect;
        if (h > maxH) {
            h = maxH;
            w = h * aspect;
        }
        this.mediaImageObject.getTransform().setLocalScale(new vec3(w, h, 1.0));
        this.mediaImageObject.getTransform().setLocalPosition(new vec3(0.0, 0.55, 0.48));
        const pass = this.mediaImageMaterial.mainPass as any;
        try { pass.baseTex = texture; } catch (e) {}
        try { pass.baseColor = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
    }

    private layoutFieldRoots(): void {
        this.layoutFieldRoot(this.vizRoots && this.vizRoots.length > VECTOR_VIZ_INDEX ? this.vizRoots[VECTOR_VIZ_INDEX] : null);
        this.layoutFieldRoot(this.vizRoots && this.vizRoots.length > GRAVITY_VIZ_INDEX ? this.vizRoots[GRAVITY_VIZ_INDEX] : null);
        this.layoutFieldRoot(this.vizRoots && this.vizRoots.length > MAGNETIC_VIZ_INDEX ? this.vizRoots[MAGNETIC_VIZ_INDEX] : null);
    }

    private layoutFieldRoot(root: SceneObject | null): void {
        if (!root) return;
        const tr = root.getTransform();
        tr.setLocalPosition(new vec3(18.0, 1.5, -55.0));
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1.0, 1.0, 1.0));
    }

    private layoutGuideShell(): void {
        const tr = this.sceneObject.getTransform();
        tr.setLocalPosition(new vec3(-19.0, -5.5, -64.0));
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1.0, 1.0, 1.0));

        if (this.chapterToggleContainer) this.chapterToggleContainer.enabled = false;
        if (this.nextButtonContainer) this.nextButtonContainer.enabled = false;
        if (this.prevButtonContainer) this.prevButtonContainer.enabled = false;
    }

    private buildChapterButtons(): void {
        this.generatedNavRoot = this.ensureGeneratedContainer(this.sceneObject, "__GuideNavRoot", new vec3(0.0, 0.0, 0.45));
    }

    private getActiveMilestoneIndex(): number {
        let active = 0;
        for (let i = 0; i < this.milestones.length; i++) {
            if (this.currentIndex >= this.milestones[i].slideIndex) {
                active = i;
            }
        }
        return active;
    }

    private wireNextButton(): void {
        const root = this.generatedNavRoot || this.ensureGeneratedContainer(this.sceneObject, "__GuideNavRoot", new vec3(0.0, 0.0, 0.45));
        this.nextButtonStyle = this.createAdvanceButton(root, "NextButton", this.nextButtonLabel, new vec3(0.0, -13.05, 0.0), () => this.next());
    }

    private wirePrevButton(): void {
    }

    private wireSkipButton(): void {
        const root = this.generatedNavRoot || this.ensureGeneratedContainer(this.sceneObject, "__GuideNavRoot", new vec3(0.0, 0.0, 0.45));
        this.skipButtonStyle = this.createProgrammaticButton(root, "SkipButton", "Skip", new vec3(9.0, 12.35, 0.0), 5.8, 2.25, 32, 7, () => this.skipTutorial());
    }

    private wireGuideButton(): void {
        if (!this.settingsRoot) return;
        const container = this.ensureGeneratedContainer(this.settingsRoot, "__GuideButtonContainer", new vec3(0.0, -15.4, 1.1));
        this.guideButtonStyle = this.createProgrammaticButton(container, "GuideButton", "Guide", new vec3(0.0, 0.0, 0.0), 9.2, 2.8, 40, 6, () => this.openTutorial());
        if (this.guideButtonStyle) {
            this.advanceButtonStyles.push(this.guideButtonStyle);
        }
    }

    private ensureGeneratedContainer(parent: SceneObject, name: string, position: vec3): SceneObject {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) {
                child.getTransform().setLocalPosition(position);
                return child;
            }
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(parent);
        child.getTransform().setLocalPosition(position);
        child.getTransform().setLocalRotation(quat.quatIdentity());
        child.getTransform().setLocalScale(new vec3(1, 1, 1));
        return child;
    }

    private createAdvanceButton(parent: SceneObject, name: string, label: string, position: vec3, action: () => void): FieldButtonBinding | null {
        const style = this.createProgrammaticButton(parent, name, label, position, 9.2, 3.0, label.length <= 4 ? 46 : 40, name === "NextButton" ? 5 : 1, action);
        if (style) {
            this.advanceButtonStyles.push(style);
        }
        return style;
    }

    private createProgrammaticButton(parent: SceneObject, name: string, label: string, position: vec3, widthCm: number, heightCm: number, labelFontSize: number, paletteIndex: number, action: () => void): FieldButtonBinding | null {
        if (!parent) return null;
        const buttonObj = global.scene.createSceneObject(name);
        buttonObj.setParent(parent);
        this.placeInstancedObject(buttonObj, position);

        const button = buttonObj.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        button.size = new vec3(widthCm, heightCm, 1.4);
        button.initialize();

        const labelObj = global.scene.createSceneObject(this.chapterLabelChildName);
        labelObj.setParent(buttonObj);
        this.placeInstancedObject(labelObj, new vec3(0.0, 0.0, 0.9));
        const text = labelObj.createComponent("Component.Text") as Text;
        text.text = label;
        text.size = labelFontSize;
        (text as any).font = GUIDE_FONT;
        text.horizontalAlignment = HorizontalAlignment.Center;
        text.verticalAlignment = VerticalAlignment.Center;
        text.horizontalOverflow = HorizontalOverflow.Truncate;
        text.verticalOverflow = VerticalOverflow.Truncate;
        text.worldSpaceRect = Rect.create(-widthCm * 0.42, widthCm * 0.42, -heightCm * 0.42, heightCm * 0.42);

        const style = VectorFieldUIStyle.prepareButton(buttonObj, label, {
            widthCm: widthCm,
            heightCm: heightCm,
            labelFontSize: labelFontSize,
            renderOrder: 88,
            paletteIndex: paletteIndex,
            buttonMaterial: this.uiMaterial,
        });
        if (style && style.labelObject) {
            const styledLabel = this.findTextComponent(style.labelObject);
            if (styledLabel) {
                (styledLabel as any).font = GUIDE_FONT;
            }
        }
        button.onTriggerUp.add(action);
        return style;
    }

    private placeInstancedObject(obj: SceneObject, position: vec3): void {
        const tr = obj.getTransform();
        tr.setLocalPosition(position);
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1.0, 1.0, 1.0));
    }

    private syncAdvanceButtonLabels(): void {
        if (!this.nextButtonStyle) return;
        this.setButtonLabel(this.nextButtonStyle, this.currentIndex >= this.chapters.length - 1 ? "Explore" : this.nextButtonLabel);
    }

    private setButtonLabel(style: FieldButtonBinding | null, label: string): void {
        if (!style || !style.labelObject) return;
        const text = this.findTextComponent(style.labelObject);
        if (text) {
            text.text = label;
        }
    }

    private syncChapterButtons(): void {
        this.syncChapterButtonStyles();
    }

    private syncChapterButtonStyles(): void {
        const milestoneIdx = this.getActiveMilestoneIndex();
        for (let i = 0; i < this.chapterButtonStyles.length; i++) {
            VectorFieldUIStyle.setSelected(this.chapterButtonStyles[i], i === milestoneIdx);
        }
    }

    private updateButtonStyles(): void {
        for (let i = 0; i < this.chapterButtonStyles.length; i++) {
            VectorFieldUIStyle.update(this.chapterButtonStyles[i]);
        }
        for (let i = 0; i < this.advanceButtonStyles.length; i++) {
            VectorFieldUIStyle.update(this.advanceButtonStyles[i]);
        }
    }

    private findToggleGroupComponent(container: SceneObject): any {
        if (!container) return null;
        const scripts = container.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            if (s.onToggleSelected !== undefined && s.registerToggleable !== undefined) {
                return s;
            }
        }
        return null;
    }

    private findToggleComponent(obj: SceneObject): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            if (s.isOn !== undefined && s.onFinished !== undefined) {
                return s;
            }
        }
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findToggleComponent(obj.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private findChildByName(obj: SceneObject, name: string): SceneObject | null {
        if (obj.name === name) return obj;
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findChildByName(obj.getChild(i), name);
            if (found) return found;
        }
        return null;
    }

    private findTextComponent(obj: SceneObject): Text | null {
        const t = obj.getComponent("Component.Text") as Text;
        if (t) return t;
        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findTextComponent(obj.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private stylePanelShell(): void {
        if (this.panelStyled) return;
        this.panelStyled = true;
        VectorFieldUIStyle.preparePanel(this.sceneObject, {
            widthCm: GUIDE_PANEL_WIDTH_CM,
            heightCm: GUIDE_PANEL_HEIGHT_CM,
            depthCm: 0.34,
            offsetYCm: 0.0,
            cornerRadiusCm: 0.9,
            frameThicknessCm: 0.24,
            renderOrder: 2,
            panelMaterial: this.uiMaterial,
            backplateColor: new vec4(0.38, 0.38, 0.39, 0.97),
            frameColor: new vec4(0.92, 0.92, 0.88, 1.0),
        });
    }
}
