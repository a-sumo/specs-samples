// StoryStepDirector.ts
// Central staging map for the Vector Fields lens story.

import { StageCalibration } from "./StageCalibration";

type StoryStepConfig = {
    id: string;
    scaffoldRoot: string;
    motion: boolean;
    analytical: boolean;
    vector: boolean;
    magnetic: boolean;
    gravity: boolean;
    wind: boolean;
    storyWidgets: boolean;
};

type ExampleFieldId = "gravity" | "magnetism" | "wind";
type GravityExampleVariant = "field" | "artemis";
type WindExampleVariant = "globe" | "car_flow";
type TheoryFieldModeId = "expansion" | "contraction" | "curl" | "motion";
type GradientPaletteId = "jet" | "viridis" | "plasma";

type TheoryFieldMode = {
    id: TheoryFieldModeId;
    label: string;
    divergence: string;
    curl: string;
};

const THEORY_FIELD_MODES: TheoryFieldMode[] = [
    { id: "expansion", label: "Expansion", divergence: "+2.00", curl: "+0.00" },
    { id: "contraction", label: "Contraction", divergence: "-2.00", curl: "+0.00" },
    { id: "curl", label: "Curl", divergence: "+0.00", curl: "+2.00" },
    { id: "motion", label: "Motion", divergence: "live", curl: "live" },
];

const GRADIENT_PALETTE_DEFAULT = 17;

const DEFAULT_MAIN_EXPERIENCE_RENDER_ORDER = 520;
const MAIN_EXPERIENCE_RENDER_ORDER_SPAN = 90;

const STORY_STEP_CONFIGS: StoryStepConfig[] = [
    {
        id: "intro",
        scaffoldRoot: "C00_Intro",
        motion: false,
        analytical: false,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "theory",
        scaffoldRoot: "C02_Theory",
        motion: true,
        analytical: false,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "examples",
        scaffoldRoot: "C03_Real_World_Examples",
        motion: false,
        analytical: false,
        vector: false,
        magnetic: true,
        gravity: true,
        wind: true,
        storyWidgets: false,
    },
];

@component
export class StoryStepDirector extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Storyboard scaffold root. Falls back to VF Story Scaffold by name.")
    scaffoldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Planar motion field rig.")
    motionFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Analytical field-pattern library rig.")
    analyticalPatternsRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Legacy abstract vector field rig.")
    vectorFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Legacy standalone theory menu. Kept hidden when the main guide owns theory controls.")
    theoryFieldMenuRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Magnetic field example rig.")
    magneticFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Gravity field example rig.")
    gravityFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Wind globe example rig.")
    windGlobeRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Older image widget group. Usually hidden while the new scaffold is active.")
    storyWidgetsRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Older narration panel root to park while this director owns the story.")
    legacyGuideRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Older slide stage root to park while this director owns the story.")
    legacySlideStageRoot: SceneObject = null as any;

    @input
    @hint("Stage a step at startup when the director runs without the main guide.")
    applyOnStart: boolean = false;

    @input
    @widget(new SliderWidget(0, 2, 1))
    @hint("Initial step index when applyOnStart is enabled.")
    initialStep: number = 0;

    @input
    @allowUndefined
    @hint("Optional head/camera anchor for menu-selected front placement. Empty searches for Camera Object.")
    cameraRoot: SceneObject = null as any;

    @input
    @hint("Show the matching proxy/root in VF Story Scaffold.")
    showScaffold: boolean = true;

    @input
    @hint("Enable the real content roots associated with the selected story step.")
    controlContentRoots: boolean = true;

    @input
    @hint("Hide the older narration and slide systems.")
    hideLegacySystems: boolean = true;

    @input
    @widget(new SliderWidget(0, 900, 1))
    @hint("Render-order floor for active field/example visuals, keeping the main experience above the story guide when they overlap.")
    mainExperienceRenderOrder: number = DEFAULT_MAIN_EXPERIENCE_RENDER_ORDER;

    @input
    @hint("Keep applying briefly after startup so other setup scripts settle first.")
    settleSeconds: number = 1.25;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Floor plane", 0),
        new ComboBoxItem("Front plane", 1),
    ]))
    @hint("Reference frame used by gravity, magnetism, and wind examples.")
    viewPlaneMode: number = 0;

    @input
    @hint("Ask for the shared reference-frame calibration on first start.")
    calibrateReferenceOnStart: boolean = false;

    @input
    @hint("Use StageCalibration/SnapToStage for real-world examples. Usually off; front placement is the stable default.")
    useReferenceCalibrationForExamples: boolean = false;

    @input
    @hint("Use the C03 scaffold proxy slots as the default staging positions for real-world examples.")
    useExampleProxySlots: boolean = false;

    @input
    @hint("Place each active visual root once in front of the user, leveled to world +Y, ignoring calibration/proxy slots.")
    useFrontPlacementForAllVisuals: boolean = true;

    @input
    @hint("Set true in Inspector to put the active visual back into its default front-facing stance.")
    resetDefaultStanceNow: boolean = false;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Gravity", 0),
        new ComboBoxItem("Magnetism", 1),
        new ComboBoxItem("Wind", 2),
    ]))
    @hint("Initial real-world example when the examples step is opened at startup.")
    initialExampleField: number = 0;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Expansion", 0),
        new ComboBoxItem("Contraction", 1),
        new ComboBoxItem("Curl", 2),
        new ComboBoxItem("Motion", 3),
    ]))
    @hint("Initial theory field mode when the theory step is opened at startup.")
    initialTheoryFieldMode: number = 0;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("jet", 13),
        new ComboBoxItem("viridis", 17),
        new ComboBoxItem("plasma", 18),
    ]))
    @hint("Initial cube VectorField color map for theory modes.")
    initialVectorColorMap: number = 17;

    @input
    @widget(new SliderWidget(0.05, 4.0, 0.01))
    @hint("Color-gradient scale for cube VectorField theory modes.")
    vectorColorMapScale: number = 1.0;

    @input
    @widget(new SliderWidget(-1.0, 1.0, 0.01))
    @hint("Color-gradient offset for cube VectorField theory modes.")
    vectorColorMapOffset: number = 0.0;

    @input
    @hint("Camera-relative placement for the 2D motion plane.")
    motionFrontOffset: vec3 = new vec3(0.0, 0.0, -88.0);

    @input
    @hint("Camera-relative placement for analytical field-pattern examples.")
    analyticalFrontOffset: vec3 = new vec3(0.0, 0.0, -78.0);

    @input
    @hint("Camera-relative placement for the real VectorField in the theory chapter.")
    theoryVectorFrontOffset: vec3 = new vec3(0.0, 0.0, -88.0);

    @input
    @hint("Camera-relative placement for the theory mode menu.")
    theoryMenuFrontOffset: vec3 = new vec3(16.0, -12.0, -78.0);

    @input
    @widget(new SliderWidget(0.35, 2.0, 0.05))
    @hint("Local scale for the real VectorField when staged in theory.")
    theoryVectorScale: number = 0.85;

    @input
    @widget(new SliderWidget(0.55, 1.8, 0.05))
    @hint("Local scale for the theory field menu.")
    theoryMenuScale: number = 1.0;

    @input
    @hint("Camera-relative placement for gravity when reference calibration is disabled.")
    gravityFrontOffset: vec3 = new vec3(0.0, 0.0, -82.0);

    @input
    @hint("Camera-relative placement for magnetism when reference calibration is disabled.")
    magneticFrontOffset: vec3 = new vec3(0.0, 0.0, -78.0);

    @input
    @hint("Camera-relative placement for wind when reference calibration is disabled.")
    windFrontOffset: vec3 = new vec3(0.0, 0.0, -78.0);

    @input
    @hint("Gravity offset in calibrated plane-local space.")
    gravityReferenceOffset: vec3 = new vec3(0.0, 0.0, 0.0);

    @input
    @hint("Magnetism offset in calibrated plane-local space.")
    magneticReferenceOffset: vec3 = new vec3(0.0, 7.0, 0.0);

    @input
    @hint("Wind globe offset in calibrated plane-local space.")
    windReferenceOffset: vec3 = new vec3(0.0, 24.0, 0.0);

    private currentStep: StoryStepConfig = STORY_STEP_CONFIGS[0];
    private currentRootName: string = STORY_STEP_CONFIGS[0].scaffoldRoot;
    private selectedExampleField: ExampleFieldId = "gravity";
    private selectedGravityVariant: GravityExampleVariant = "field";
    private selectedWindVariant: WindExampleVariant = "globe";
    private selectedTheoryFieldMode: number = 0;
    private selectedGradientPalette: number = 17;
    private selectedGravityStage: number = 2;
    private selectedMagneticTubeMode: number = 0;
    private selectedWindTubeMode: number = 0;
    private appliedKey: string = "";
    // Master switch for moving/scaling the whole active visual root. Default OFF
    // so child controls own interaction: target, magnets, globe spin, slice scrub.
    private exampleManipulationEnabled: boolean = false;
    private elapsed: number = 0.0;
    private renderPrioritySettleRemaining: number = 0.0;
    private calibrationSubscribed: boolean = false;
    private boundReferenceUpdate: () => void = () => this.onReferenceFrameChanged();

    onAwake(): void {
        this.enableStageCalibrationObject();
        this.createEvent("OnStartEvent").bind(() => {
            this.bindStageCalibration();
            this.elapsed = 0.0;
            this.selectedExampleField = this.exampleFieldFromIndex(this.initialExampleField);
            this.selectedTheoryFieldMode = this.normalizeTheoryFieldMode(this.initialTheoryFieldMode);
            this.selectedGradientPalette = this.normalizeGradientPalette(this.initialVectorColorMap);
            if (this.applyOnStart) {
                this.showStepByIndex(this.initialStep);
            }
            if (this.calibrateReferenceOnStart) {
                this.calibrateReferenceIfNeeded();
            }
        });
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    onDestroy(): void {
        const cal = this.getStageCalibration();
        if (cal && typeof cal.unsubscribe === "function") {
            cal.unsubscribe(this.boundReferenceUpdate);
        }
    }

    public stageStep(stepId: string, rootName: string, index: number): void {
        const resolved = this.findStep(stepId, rootName, index);
        this.currentStep = resolved;
        this.currentRootName = rootName && rootName.length > 0 ? rootName : resolved.scaffoldRoot;
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    public showStep(stepId: string): void {
        this.stageStep(stepId, "", 0);
    }

    public showStepByIndex(index: number): void {
        this.stageStep("", "", index);
    }

    public showRoot(rootName: string): void {
        this.stageStep("", rootName, 0);
    }

    public selectExampleField(fieldName: string): void {
        this.selectedExampleField = this.normalizeExampleField(fieldName);
        if (this.currentStep.id === "examples") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public selectExampleVariant(variantName: string): void {
        const key = (variantName || "").toLowerCase();
        if (key === "gravity:artemis" || key === "artemis" || key === "trajectory" || key === "mission") {
            this.selectedExampleField = "gravity";
            this.selectedGravityVariant = "artemis";
        } else if (key === "gravity:field" || key === "gravity_field" || key === "field") {
            this.selectedExampleField = "gravity";
            this.selectedGravityVariant = "field";
        } else if (key === "wind:car_flow" || key === "car_flow" || key === "car" || key === "flow") {
            this.selectedExampleField = "wind";
            this.selectedWindVariant = "car_flow";
        } else if (key === "wind:globe" || key === "globe" || key === "earth") {
            this.selectedExampleField = "wind";
            this.selectedWindVariant = "globe";
        }
        if (this.currentStep.id === "examples") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public getSelectedExampleVariant(fieldName: string): string {
        const field = this.normalizeExampleField(fieldName || this.selectedExampleField);
        if (field === "gravity") return this.selectedGravityVariant;
        if (field === "wind") return this.selectedWindVariant;
        return "";
    }

    public selectGravityStage(stage: number): void {
        this.selectedGravityStage = this.normalizeStage(stage, 0, 2);
        if (this.currentStep.id === "examples") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public selectMagneticTubeMode(mode: number): void {
        this.selectedMagneticTubeMode = this.normalizeStage(mode, 0, 2);
        if (this.currentStep.id === "examples") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public selectWindTubeMode(mode: number): void {
        this.selectedWindTubeMode = this.normalizeStage(mode, 0, 2);
        if (this.currentStep.id === "examples") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public selectTheoryFieldMode(mode: number | string): void {
        this.selectedTheoryFieldMode = this.normalizeTheoryFieldMode(mode);
        if (this.currentStep.id === "theory") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public getTheoryFieldMode(): number {
        return this.normalizeTheoryFieldMode(this.selectedTheoryFieldMode);
    }

    public selectGradientPalette(palette: number | string): void {
        this.selectedGradientPalette = this.normalizeGradientPalette(palette);
        if (this.currentStep.id === "theory") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public setGradientPalette(palette: number | string): void {
        this.selectGradientPalette(palette);
    }

    public getGradientPalette(): number {
        return this.normalizeGradientPalette(this.selectedGradientPalette);
    }

    public setGradientScale(value: number): void {
        this.vectorColorMapScale = this.clampNumber(value, 0.05, 4.0);
        if (this.currentStep.id === "theory") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public setColorMapScale(value: number): void {
        this.setGradientScale(value);
    }

    public getGradientScale(): number {
        return this.vectorColorMapScale;
    }

    public setGradientOffset(value: number): void {
        this.vectorColorMapOffset = this.clampNumber(value, -1.0, 1.0);
        if (this.currentStep.id === "theory") {
            this.appliedKey = "";
            this.applyCurrent(true);
        }
    }

    public setColorMapOffset(value: number): void {
        this.setGradientOffset(value);
    }

    public getGradientOffset(): number {
        return this.vectorColorMapOffset;
    }

    public setViewPlaneMode(mode: number): void {
        this.viewPlaneMode = this.normalizeViewPlaneMode(mode);
        if (!this.useFrontPlacementForAllVisuals) {
            const cal = this.getStageCalibration();
            if (cal) {
                if (typeof cal.calibrateForMode === "function") {
                    cal.calibrateForMode(this.viewPlaneMode);
                } else {
                    if (typeof cal.setPlacementMode === "function") cal.setPlacementMode(this.viewPlaneMode);
                    if (typeof cal.recalibrate === "function") cal.recalibrate();
                }
            }
        }
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    public getViewPlaneMode(): number {
        return this.normalizeViewPlaneMode(this.viewPlaneMode);
    }

    // ---- example manipulation (move/grab) lock ---------------------------

    /** Enable/disable hand manipulation (move/grab) of the active example. */
    public setExampleManipulationEnabled(enabled: boolean): void {
        this.exampleManipulationEnabled = enabled;
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    /** Toggle hand manipulation of the active example; returns the new state. */
    public toggleExampleManipulation(): boolean {
        this.setExampleManipulationEnabled(!this.exampleManipulationEnabled);
        return this.exampleManipulationEnabled;
    }

    public getExampleManipulationEnabled(): boolean {
        return this.exampleManipulationEnabled;
    }

    // The broad root collider is only for moving the whole visual. Keep it off
    // by default so custom child controls remain targetable.
    private applyManipulationLock(roots: Array<SceneObject | null>): void {
        for (let i = 0; i < roots.length; i++) {
            this.setRootInteractionEnabled(roots[i], this.exampleManipulationEnabled);
            this.setChildManipulationEnabled(roots[i], !this.exampleManipulationEnabled);
        }
    }

    private setRootInteractionEnabled(root: SceneObject | null, enabled: boolean): void {
        if (!root) return;
        const colliders = root.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = enabled;
        }
        this.setOwnInteractableScriptsEnabled(root, enabled);
    }

    private setChildManipulationEnabled(root: SceneObject | null, enabled: boolean): void {
        if (!root) return;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.setManipulationEnabledInTree(root.getChild(i), enabled);
        }
    }

    private setManipulationEnabledInTree(root: SceneObject | null, enabled: boolean): void {
        if (!root) return;
        const shouldEnable = enabled && !this.hasScriptNamed(root, "GlobeSurfaceRotator");
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            try {
                if (this.isManipulationScript(script)) script.enabled = shouldEnable;
            } catch (e) {}
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.setManipulationEnabledInTree(root.getChild(i), enabled);
        }
    }

    private setOwnInteractableScriptsEnabled(root: SceneObject, enabled: boolean): void {
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            try {
                if (this.isManipulationScript(script) || this.isInteractableScript(script)) {
                    script.enabled = enabled;
                }
            } catch (e) {}
        }
    }

    private isInteractableScript(script: any): boolean {
        return !!script && script.name === "Interactable";
    }

    private isManipulationScript(script: any): boolean {
        return !!script &&
            (script.name === "InteractableManipulation" ||
                script._enableXTranslation !== undefined ||
                script.enableTranslation !== undefined);
    }

    private hasScriptNamed(root: SceneObject, scriptName: string): boolean {
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && script.name === scriptName) return true;
        }
        return false;
    }

    private onUpdate(): void {
        const dt = getDeltaTime();
        if (this.resetDefaultStanceNow) {
            this.resetDefaultStanceNow = false;
            this.resetToDefaultStance();
        }
        if (this.renderPrioritySettleRemaining > 0.0) {
            this.renderPrioritySettleRemaining = Math.max(0.0, this.renderPrioritySettleRemaining - dt);
            this.promoteCurrentMainExperienceVisuals();
        }
        if (!this.applyOnStart) return;
        if (this.elapsed > this.settleSeconds) return;
        this.elapsed += dt;
        this.applyCurrent(false);
    }

    private applyCurrent(force: boolean): void {
        const key = this.currentStep.id + ":" + this.currentRootName + ":" + this.selectedExampleField + ":" + this.selectedGravityVariant + ":" + this.selectedWindVariant + ":" + this.selectedGravityStage + ":" + this.selectedMagneticTubeMode + ":" + this.selectedWindTubeMode + ":" + this.selectedTheoryFieldMode + ":" + this.selectedGradientPalette + ":" + this.vectorColorMapScale + ":" + this.vectorColorMapOffset + ":" + this.getViewPlaneMode() + ":" + this.useFrontPlacementForAllVisuals + ":" + this.useReferenceCalibrationForExamples + ":" + this.useExampleProxySlots;
        if (!force && key === this.appliedKey) return;
        this.appliedKey = key;

        if (this.showScaffold) {
            this.applyScaffoldRoot(this.currentRootName);
        }
        if (this.controlContentRoots) {
            this.applyContentRoots(this.currentStep);
        }
        if (this.hideLegacySystems) {
            this.setEnabled(this.legacyGuideRoot || this.findObjectByName("Guide"), false);
            this.setEnabled(this.legacySlideStageRoot || this.findObjectByName("SlideStage"), false);
        }

        let fieldSuffix = "";
        if (this.currentStep.id === "examples") {
            const variant = this.selectedExampleField === "gravity"
                ? this.selectedGravityVariant
                : (this.selectedExampleField === "wind" ? this.selectedWindVariant : "");
            fieldSuffix = " [" + this.selectedExampleField + (variant.length > 0 ? ":" + variant : "") + "]";
        }
        print("StoryStepDirector: " + this.currentStep.id + " -> " + this.currentRootName + fieldSuffix);
    }

    private applyScaffoldRoot(rootName: string): void {
        const scaffold = this.scaffoldRoot || this.findObjectByName("VF Story Scaffold");
        if (!scaffold) return;

        const libraryRootName = this.currentStep.analytical ? "Library_Analytical_Field_Patterns" : "";
        const api = this.findScriptApi(scaffold, libraryRootName.length > 0 ? "showRootWithLibrary" : "showRoot");
        if (libraryRootName.length > 0 && api && typeof api.showRootWithLibrary === "function") {
            api.showRootWithLibrary(rootName, libraryRootName);
        } else if (api && typeof api.showRoot === "function") {
            api.showRoot(rootName);
        }
    }

    private applyContentRoots(step: StoryStepConfig): void {
        const selectingExample = step.id === "examples";
        const showMagnetic = step.magnetic && (!selectingExample || this.selectedExampleField === "magnetism");
        const showGravity = step.gravity && (!selectingExample || this.selectedExampleField === "gravity");
        const showArtemis = showGravity && (!selectingExample || this.selectedGravityVariant === "artemis");
        const showWindSelection = step.wind && (!selectingExample || this.selectedExampleField === "wind");
        const showWindGlobe = showWindSelection && (!selectingExample || this.selectedWindVariant === "globe");
        const showCarFlow = showWindSelection && selectingExample && this.selectedWindVariant === "car_flow";
        const motionRoot = this.motionFieldRoot || this.findObjectByName("Motion Field Root");
        const analyticalRoot = this.analyticalPatternsRoot || this.findObjectByName("Library_Analytical_Field_Patterns");
        const vectorRoot = this.vectorFieldRoot || this.findObjectByName("Vector Field Examples Root");
        const theoryMenuRoot = this.theoryFieldMenuRoot || this.findObjectByName("Theory Field Menu");
        const magneticRoot = this.magneticFieldRoot || this.findObjectByName("Magnetic Field Root");
        const gravityRoot = this.gravityFieldRoot || this.findObjectByName("Gravity Field Root");
        const windRoot = this.windGlobeRoot || this.findObjectByName("Globe Calibration") || this.findObjectByName("Globe Wind");
        const carFlowRoot = this.findObjectByName("Car Fluid Flow");
        const fieldControllerRoot = this.findObjectByName("Field Controller");
        const theoryMode = THEORY_FIELD_MODES[this.normalizeTheoryFieldMode(this.selectedTheoryFieldMode)];
        const showTheoryPlane = step.id === "theory" && theoryMode.id === "motion";
        const showTheoryField = step.id === "theory" && theoryMode.id !== "motion";

        this.setEnabled(motionRoot, showTheoryPlane);
        this.setEnabled(analyticalRoot, step.analytical);
        this.setEnabled(vectorRoot, showTheoryField);
        this.setEnabled(magneticRoot, showMagnetic);
        this.setEnabled(gravityRoot, showGravity);
        this.setEnabled(windRoot, showWindGlobe);
        this.setEnabled(carFlowRoot, showCarFlow);
        this.setEnabled(fieldControllerRoot, false);
        this.setEnabled(this.storyWidgetsRoot || this.findObjectByName("Story Widgets"), step.storyWidgets);
        this.setProxyVisualEnabled("Proxy_Gravity_Field_Example_Slot", !showGravity);
        this.setProxyVisualEnabled("Proxy_Magnetic_Field_Example_Slot", !showMagnetic);
        this.setProxyVisualEnabled("Proxy_Wind_Field_Example_Slot", !showWindSelection);
        this.setProxyVisualEnabled("Proxy_Metric_Cursor", !showTheoryPlane && !showTheoryField);
        this.setProxyVisualEnabled("Proxy_Local_Finite_Difference_Stencil", !showTheoryPlane && !showTheoryField);
        this.setProxyVisualEnabled("Proxy_Curl_Readout_Slot", !showTheoryPlane && !showTheoryField);
        this.setProxyVisualEnabled("Proxy_Divergence_Readout_Slot", !showTheoryPlane && !showTheoryField);

        if (showTheoryPlane) {
            this.placeMotionPlane(motionRoot);
            this.callLifecycle(motionRoot, "stage");
            this.applyTheoryMotionFieldMode(motionRoot);
        }
        if (step.analytical) {
            this.placeFrontFacing(analyticalRoot, this.analyticalFrontOffset, false);
            this.callLifecycle(analyticalRoot, "stage");
        }
        if (showTheoryField) {
            this.placeTheoryVectorField(vectorRoot);
            this.applyTheoryVectorFieldMode(vectorRoot);
        }
        this.callLifecycle(theoryMenuRoot, "hide");
        this.setEnabled(theoryMenuRoot, false);
        if (!showTheoryPlane) {
            this.callLifecycle(motionRoot, "hide");
        }
        if (!step.analytical) {
            this.callLifecycle(analyticalRoot, "hide");
        }

        if (!this.useFrontPlacementForAllVisuals && this.useReferenceCalibrationForExamples && (showGravity || showMagnetic || showWindGlobe || showCarFlow)) {
            this.calibrateReferenceIfNeeded();
        }
        if (showGravity) {
            this.placeExampleRoot(gravityRoot, this.gravityFrontOffset, this.gravityReferenceOffset, "Proxy_Gravity_Field_Example_Slot");
            this.disableScriptByName(gravityRoot, "SnapToStage");
            this.setArtemisContentEnabled(gravityRoot, showArtemis);
            this.applyGravityStage(gravityRoot);
            this.callLifecycle(gravityRoot, "refresh");
        }
        if (showMagnetic) {
            this.placeExampleRoot(magneticRoot, this.magneticFrontOffset, this.magneticReferenceOffset, "Proxy_Magnetic_Field_Example_Slot");
            this.applyTubeMode(magneticRoot, this.selectedMagneticTubeMode);
            this.callLifecycle(magneticRoot, "refresh");
        }
        if (showWindGlobe) {
            this.placeExampleRoot(windRoot, this.windFrontOffset, this.windReferenceOffset, "Proxy_Wind_Field_Example_Slot");
            this.applyTubeMode(windRoot, this.selectedWindTubeMode);
            this.callLifecycle(windRoot, "refresh");
        }
        if (showCarFlow) {
            this.placeExampleRoot(carFlowRoot, this.windFrontOffset, this.windReferenceOffset, "Proxy_Wind_Field_Example_Slot");
            this.callLifecycle(carFlowRoot, "refresh");
        }

        this.applyManipulationLock([
            motionRoot,
            vectorRoot,
            gravityRoot,
            magneticRoot,
            windRoot,
            carFlowRoot,
        ]);

        this.promoteMainExperienceVisuals([
            motionRoot,
            analyticalRoot,
            vectorRoot,
            magneticRoot,
            gravityRoot,
            windRoot,
            carFlowRoot,
        ]);
        this.renderPrioritySettleRemaining = 0.5;
    }

    private promoteCurrentMainExperienceVisuals(): void {
        this.promoteMainExperienceVisuals([
            this.motionFieldRoot || this.findObjectByName("Motion Field Root"),
            this.analyticalPatternsRoot || this.findObjectByName("Library_Analytical_Field_Patterns"),
            this.vectorFieldRoot || this.findObjectByName("Vector Field Examples Root"),
            this.magneticFieldRoot || this.findObjectByName("Magnetic Field Root"),
            this.gravityFieldRoot || this.findObjectByName("Gravity Field Root"),
            this.windGlobeRoot || this.findObjectByName("Globe Calibration") || this.findObjectByName("Globe Wind"),
            this.findObjectByName("Car Fluid Flow"),
        ]);
    }

    private promoteMainExperienceVisuals(roots: (SceneObject | null)[]): void {
        const baseOrder = this.normalizedMainExperienceRenderOrder();
        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            if (!root || !root.enabled) continue;
            this.promoteVisualTree(root, baseOrder);
        }
    }

    private promoteVisualTree(root: SceneObject, baseOrder: number): void {
        this.promoteVisualComponents(root, baseOrder);
        for (let i = 0; i < root.getChildrenCount(); i++) {
            this.promoteVisualTree(root.getChild(i), baseOrder);
        }
    }

    private promoteVisualComponents(object: SceneObject, baseOrder: number): void {
        this.promoteVisualList(object.getComponents("Component.RenderMeshVisual") as any[], baseOrder);
        this.promoteVisualList(object.getComponents("Image" as any) as any[], baseOrder);
        this.promoteVisualList(object.getComponents("Component.Text") as any[], baseOrder);
    }

    private promoteVisualList(visuals: any[], baseOrder: number): void {
        if (!visuals) return;
        for (let i = 0; i < visuals.length; i++) {
            this.promoteVisualRenderOrder(visuals[i], baseOrder);
        }
    }

    private promoteVisualRenderOrder(visual: any, baseOrder: number): void {
        if (!visual) return;
        const current = this.getVisualRenderOrder(visual);
        const next = current >= baseOrder
            ? current
            : baseOrder + Math.max(0, Math.min(MAIN_EXPERIENCE_RENDER_ORDER_SPAN - 1, Math.floor(current)));
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

    private normalizedMainExperienceRenderOrder(): number {
        if (isNaN(this.mainExperienceRenderOrder)) return DEFAULT_MAIN_EXPERIENCE_RENDER_ORDER;
        return Math.max(0, Math.min(900, Math.floor(this.mainExperienceRenderOrder)));
    }

    private placeMotionPlane(root: SceneObject | null): void {
        if (!root) return;
        this.placeFrontFacing(root, this.motionFrontOffset, true);
        this.disableScriptByName(root, "SurfacePlacer");
    }

    private applyTheoryMotionFieldMode(root: SceneObject | null): void {
        if (!root) return;
        const mode = THEORY_FIELD_MODES[this.normalizeTheoryFieldMode(this.selectedTheoryFieldMode)];
        const api = this.findAnyScriptApi(root, "setPreset") || this.findAnyScriptApi(root, "setFieldMode");
        if (!api) return;

        if (typeof api.setPreset === "function") api.setPreset(mode.id);
        else if (typeof api.setFieldMode === "function") api.setFieldMode(mode.id);
        if (typeof api.stage === "function") api.stage();

        print("StoryStepDirector: theory mode " + mode.label + " -> MotionFieldPlane (div " + mode.divergence + ", curl " + mode.curl + ")");
    }

    private placeTheoryVectorField(root: SceneObject | null): void {
        if (!root) return;
        this.placeFrontFacing(root, this.theoryVectorFrontOffset, false);
        root.getTransform().setLocalScale(new vec3(this.theoryVectorScale, this.theoryVectorScale, this.theoryVectorScale));
        this.restoreVectorFieldTarget(root);
    }

    private applyTheoryVectorFieldMode(root: SceneObject | null): void {
        if (!root) return;
        const mode = THEORY_FIELD_MODES[this.normalizeTheoryFieldMode(this.selectedTheoryFieldMode)];
        const vectorPreset = mode.id === "contraction" ? 1 : (mode.id === "curl" ? 2 : (mode.id === "motion" ? 3 : 0));
        const api = this.findAnyScriptApi(root, "setPreset");
        if (!api) return;

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
        if (typeof api.setLengthSegmentsNormalized === "function") api.setLengthSegmentsNormalized(0.22);
        if (typeof api.setRadiusNormalized === "function") api.setRadiusNormalized(0.10);
        if (typeof api.setColorMap === "function") api.setColorMap(this.selectedGradientPalette);
        else if (typeof api.setPalette === "function") api.setPalette(this.selectedGradientPalette);
        else {
            try { api.colorMap = this.selectedGradientPalette; } catch (e) {}
        }
        if (typeof api.setColorMapScale === "function") api.setColorMapScale(this.vectorColorMapScale);
        else if (typeof api.setGradientScale === "function") api.setGradientScale(this.vectorColorMapScale);
        else {
            try { api.colorMapScale = this.vectorColorMapScale; } catch (e) {}
        }
        if (typeof api.setColorMapOffset === "function") api.setColorMapOffset(this.vectorColorMapOffset);
        else if (typeof api.setGradientOffset === "function") api.setGradientOffset(this.vectorColorMapOffset);
        else {
            try { api.colorMapOffset = this.vectorColorMapOffset; } catch (e) {}
        }
        if (typeof api.setPreset === "function") api.setPreset(vectorPreset);
        else {
            try { api.preset = vectorPreset; } catch (e) {}
        }
        if (typeof api.refresh === "function") {
            api.refresh();
        } else if (typeof api.queueRefresh === "function") {
            api.queueRefresh(0.01);
        }

        print("StoryStepDirector: theory mode " + mode.label + " -> VectorField preset " + vectorPreset + " (div " + mode.divergence + ", curl " + mode.curl + ")");
    }

    private setArtemisContentEnabled(root: SceneObject | null, enabled: boolean): void {
        if (!root) return;
        this.setChildEnabledByName(root, "Artemis Trajectory Path", enabled);
        this.setChildEnabledByName(root, "Gravity ISS Model", enabled);
        this.setChildEnabledByName(root, "ISS", enabled);
        this.setChildEnabledByName(root, "Mission Info", enabled);
        this.setChildEnabledByName(root, "MissionInfoPanel", enabled);
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
        const nextMode = this.normalizeStage(mode, 0, 2);
        if (typeof api.setTubeMode === "function") api.setTubeMode(nextMode);
        else {
            try { api.tubeMode = nextMode; } catch (e) {}
        }
        if (typeof api.refresh === "function") api.refresh();
        else if (typeof api.queueRefresh === "function") api.queueRefresh(0.01);
    }

    private restoreVectorFieldTarget(root: SceneObject | null): void {
        if (!root) return;
        const target = this.findInTree(root, "Target");
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

    private setChildEnabledByName(root: SceneObject, name: string, enabled: boolean): boolean {
        if (root.name === name) {
            root.enabled = enabled;
            return true;
        }
        let found = false;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            if (this.setChildEnabledByName(root.getChild(i), name, enabled)) {
                found = true;
            }
        }
        return found;
    }

    private placeExampleRoot(root: SceneObject | null, frontOffset: vec3, referenceOffset: vec3, proxySlotName: string): void {
        if (!root) return;
        if (this.useFrontPlacementForAllVisuals) {
            this.placeFrontFacing(root, frontOffset, false);
            return;
        }
        if (this.useReferenceCalibrationForExamples) {
            this.snapToReferenceFrame(root, referenceOffset);
            return;
        }
        if (this.useExampleProxySlots && this.placeAtProxySlot(root, proxySlotName)) {
            return;
        }
        this.placeFrontFacing(root, frontOffset, false);
    }

    private callLifecycle(root: SceneObject | null, methodName: string): void {
        const api = this.findAnyScriptApi(root, methodName);
        if (api && typeof api[methodName] === "function") {
            api[methodName]();
        }
    }

    private placeAtProxySlot(root: SceneObject | null, proxySlotName: string): boolean {
        if (!root || !proxySlotName || proxySlotName.length === 0) return false;
        const slot = this.findObjectByName(proxySlotName);
        if (!slot) return false;

        const slotTransform = slot.getTransform();
        const slotRotation = slotTransform.getWorldRotation();
        const offset = slotRotation.multiplyVec3(new vec3(0.0, 0.0, 0.35));
        const transform = root.getTransform();
        transform.setWorldPosition(slotTransform.getWorldPosition().add(offset));
        transform.setWorldRotation(slotRotation);
        return true;
    }

    private setProxyVisualEnabled(proxyName: string, enabled: boolean): void {
        const proxy = this.findObjectByName(proxyName);
        if (!proxy) return;
        const visual = proxy.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (visual) visual.enabled = enabled;
    }

    private disableScriptByName(root: SceneObject | null, scriptName: string): void {
        if (!root) return;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            try {
                if (script && script.name === scriptName) {
                    script.enabled = false;
                }
            } catch (e) {}
        }
    }

    private placeFrontFacing(root: SceneObject | null, localOffset: vec3, motionPlane: boolean): void {
        if (!root) return;
        const camera = this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
        if (!camera) {
            root.getTransform().setLocalPosition(localOffset);
            return;
        }

        const cameraTransform = camera.getTransform();
        const cameraPosition = cameraTransform.getWorldPosition();
        const cameraRotation = cameraTransform.getWorldRotation();
        const worldUp = new vec3(0.0, 1.0, 0.0);
        const right = this.safeHorizontalDirection(cameraRotation.multiplyVec3(new vec3(1.0, 0.0, 0.0)), new vec3(1.0, 0.0, 0.0));
        const forward = this.safeHorizontalDirection(cameraRotation.multiplyVec3(new vec3(0.0, 0.0, -1.0)), new vec3(0.0, 0.0, -1.0));
        const target = cameraPosition
            .add(right.uniformScale(localOffset.x))
            .add(worldUp.uniformScale(localOffset.y))
            .add(forward.uniformScale(-localOffset.z));

        const toCamera = cameraPosition.sub(target);
        const faceDirection = this.safeHorizontalDirection(toCamera, new vec3(0.0, 0.0, 1.0));
        const faceCamera = faceDirection.length > 0.0001 ? quat.lookAt(faceDirection, worldUp) : quat.quatIdentity();
        const rotation = motionPlane
            ? faceCamera.multiply(quat.angleAxis(Math.PI * 0.5, new vec3(1.0, 0.0, 0.0)))
            : faceCamera;

        const transform = root.getTransform();
        transform.setWorldPosition(target);
        transform.setWorldRotation(rotation);
    }

    public resetToDefaultStance(): void {
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    public resetDefaultStance(): void {
        this.resetToDefaultStance();
    }

    private normalizeExampleField(fieldName: string): ExampleFieldId {
        const key = (fieldName || "").toLowerCase();
        if (key === "magnetic" || key === "magnetism") return "magnetism";
        if (key === "wind" || key === "globe") return "wind";
        return "gravity";
    }

    private exampleFieldFromIndex(index: number): ExampleFieldId {
        const safeIndex = Math.floor(index);
        if (safeIndex === 1) return "magnetism";
        if (safeIndex === 2) return "wind";
        return "gravity";
    }

    private onReferenceFrameChanged(): void {
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    private bindStageCalibration(): void {
        if (this.calibrationSubscribed) return;
        const cal = this.getStageCalibration();
        if (!cal || typeof cal.subscribe !== "function") return;
        cal.subscribe(this.boundReferenceUpdate);
        this.calibrationSubscribed = true;
    }

    private calibrateReferenceIfNeeded(): void {
        const cal = this.getStageCalibration();
        if (!cal) return;
        if (typeof cal.setPlacementMode === "function") {
            cal.setPlacementMode(this.getViewPlaneMode());
        }
        if (typeof cal.calibrateIfNeeded === "function") {
            cal.calibrateIfNeeded();
        }
    }

    private snapToReferenceFrame(root: SceneObject | null, offset: vec3): void {
        if (!root) return;

        const snapApi = this.findScriptApi(root, "snap");
        if (snapApi && typeof snapApi.setOffset === "function") {
            snapApi.setOffset(offset);
            return;
        }
        if (snapApi && typeof snapApi.snap === "function") {
            snapApi.snap();
            return;
        }

        const cal = this.getStageCalibration();
        if (!cal || typeof cal.isCalibrated !== "function" || !cal.isCalibrated()) return;
        const pos = cal.getAnchorPosition() as vec3;
        const rot = cal.getAnchorRotation() as quat;
        const transform = root.getTransform();
        transform.setWorldRotation(rot);
        transform.setWorldPosition(pos.add(rot.multiplyVec3(offset)));
    }

    private getStageCalibration(): any {
        this.enableStageCalibrationObject();
        const singleton = StageCalibration.getInstance();
        if (singleton) return singleton;
        return this.findScriptApi(this.findObjectByName("Stage Calibration"), "calibrateIfNeeded");
    }

    private enableStageCalibrationObject(): void {
        const object = this.findObjectByName("Stage Calibration");
        if (object) {
            object.enabled = true;
        }
    }

    private normalizeViewPlaneMode(mode: number): number {
        return Math.floor(mode) === 1 ? 1 : 0;
    }

    private normalizeStage(value: number, min: number, max: number): number {
        if (isNaN(value)) return min;
        return Math.max(min, Math.min(max, Math.floor(value)));
    }

    private clampNumber(value: number, min: number, max: number): number {
        if (isNaN(value)) return min;
        return Math.max(min, Math.min(max, value));
    }

    private normalizeTheoryFieldMode(mode: number | string): number {
        if (typeof mode === "string") {
            const key = mode.toLowerCase();
            if (key === "rotation" || key === "vortex") return 2;
            for (let i = 0; i < THEORY_FIELD_MODES.length; i++) {
                const option = THEORY_FIELD_MODES[i];
                if (option.id === key || option.label.toLowerCase() === key) return i;
            }
            return 0;
        }
        return Math.max(0, Math.min(THEORY_FIELD_MODES.length - 1, Math.floor(mode)));
    }

    private normalizeGradientPalette(palette: number | string): number {
        if (typeof palette === "string") {
            const key = palette.toLowerCase();
            if (key === "jet") return 13;
            if (key === "viridis") return 17;
            if (key === "plasma") return 18;
            return GRADIENT_PALETTE_DEFAULT;
        }
        if (isNaN(palette)) return GRADIENT_PALETTE_DEFAULT;
        const index = Math.floor(palette);
        if (index === 13 || index === 17 || index === 18) return index;
        if (index === 0) return 13;
        if (index === 1) return 17;
        if (index === 2) return 18;
        return GRADIENT_PALETTE_DEFAULT;
    }

    private findStep(stepId: string, rootName: string, index: number): StoryStepConfig {
        if (stepId && stepId.length > 0) {
            for (let i = 0; i < STORY_STEP_CONFIGS.length; i++) {
                if (STORY_STEP_CONFIGS[i].id === stepId) return STORY_STEP_CONFIGS[i];
            }
        }
        if (rootName && rootName.length > 0) {
            for (let i = 0; i < STORY_STEP_CONFIGS.length; i++) {
                if (STORY_STEP_CONFIGS[i].scaffoldRoot === rootName) return STORY_STEP_CONFIGS[i];
            }
        }
        const safeIndex = Math.max(0, Math.min(STORY_STEP_CONFIGS.length - 1, Math.floor(index)));
        return STORY_STEP_CONFIGS[safeIndex];
    }

    private setEnabled(object: SceneObject | null, enabled: boolean): void {
        if (!object) return;
        object.enabled = enabled;
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
            const api = (script && (script.motionFieldApi || script.analyticalFieldApi || script.fieldApi || script.gravityApi || script.windApi || script.theoryFieldMenuApi || script.panelApi)) || script;
            if (api && typeof api[methodName] === "function") return api;
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const childApi = this.findAnyScriptApi(root.getChild(i), methodName);
            if (childApi) return childApi;
        }
        return null;
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
}
