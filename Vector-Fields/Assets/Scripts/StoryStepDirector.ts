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
        id: "motion_fields",
        scaffoldRoot: "C01_Motion_Fields",
        motion: true,
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
        motion: false,
        analytical: true,
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
    @hint("Stage a step at startup.")
    applyOnStart: boolean = true;

    @input
    @widget(new SliderWidget(0, 3, 1))
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
    calibrateReferenceOnStart: boolean = true;

    @input
    @hint("Use StageCalibration/SnapToStage for real-world examples. Off keeps menu selections immediate and camera-relative.")
    useReferenceCalibrationForExamples: boolean = true;

    @input
    @hint("Camera-relative placement for the 2D motion plane.")
    motionFrontOffset: vec3 = new vec3(0.0, -3.0, -82.0);

    @input
    @hint("Camera-relative placement for analytical field-pattern examples.")
    analyticalFrontOffset: vec3 = new vec3(0.0, 8.0, -78.0);

    @input
    @hint("Camera-relative placement for gravity when reference calibration is disabled.")
    gravityFrontOffset: vec3 = new vec3(0.0, -6.0, -82.0);

    @input
    @hint("Camera-relative placement for magnetism when reference calibration is disabled.")
    magneticFrontOffset: vec3 = new vec3(0.0, -4.0, -78.0);

    @input
    @hint("Camera-relative placement for wind when reference calibration is disabled.")
    windFrontOffset: vec3 = new vec3(0.0, -5.0, -78.0);

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
    private appliedKey: string = "";
    private elapsed: number = 0.0;
    private calibrationSubscribed: boolean = false;
    private boundReferenceUpdate: () => void = () => this.onReferenceFrameChanged();

    onAwake(): void {
        this.enableStageCalibrationObject();
        this.createEvent("OnStartEvent").bind(() => {
            this.bindStageCalibration();
            this.elapsed = 0.0;
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

    public setViewPlaneMode(mode: number): void {
        this.viewPlaneMode = this.normalizeViewPlaneMode(mode);
        const cal = this.getStageCalibration();
        if (cal) {
            if (typeof cal.calibrateForMode === "function") {
                cal.calibrateForMode(this.viewPlaneMode);
            } else {
                if (typeof cal.setPlacementMode === "function") cal.setPlacementMode(this.viewPlaneMode);
                if (typeof cal.recalibrate === "function") cal.recalibrate();
            }
        }
        this.appliedKey = "";
        this.applyCurrent(true);
    }

    public getViewPlaneMode(): number {
        return this.normalizeViewPlaneMode(this.viewPlaneMode);
    }

    private onUpdate(): void {
        if (!this.applyOnStart) return;
        if (this.elapsed > this.settleSeconds) return;
        this.elapsed += getDeltaTime();
        this.applyCurrent(false);
    }

    private applyCurrent(force: boolean): void {
        const key = this.currentStep.id + ":" + this.currentRootName + ":" + this.selectedExampleField + ":" + this.getViewPlaneMode();
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

        const fieldSuffix = this.currentStep.id === "examples" ? " [" + this.selectedExampleField + "]" : "";
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
        const showWind = step.wind && (!selectingExample || this.selectedExampleField === "wind");
        const motionRoot = this.motionFieldRoot || this.findObjectByName("Motion Field Root");
        const analyticalRoot = this.analyticalPatternsRoot || this.findObjectByName("Library_Analytical_Field_Patterns");
        const vectorRoot = this.vectorFieldRoot || this.findObjectByName("Vector Field Examples Root");
        const magneticRoot = this.magneticFieldRoot || this.findObjectByName("Magnetic Field Root");
        const gravityRoot = this.gravityFieldRoot || this.findObjectByName("Gravity Field Root");
        const windRoot = this.windGlobeRoot || this.findObjectByName("Globe Calibration") || this.findObjectByName("Globe Wind");
        const carFlowRoot = this.findObjectByName("Car Fluid Flow");

        this.setEnabled(motionRoot, step.motion);
        this.setEnabled(analyticalRoot, step.analytical);
        this.setEnabled(vectorRoot, step.vector);
        this.setEnabled(magneticRoot, showMagnetic);
        this.setEnabled(gravityRoot, showGravity);
        this.setEnabled(windRoot, showWind);
        this.setEnabled(carFlowRoot, false);
        this.setEnabled(this.storyWidgetsRoot || this.findObjectByName("Story Widgets"), step.storyWidgets);

        if (step.motion) {
            this.placeMotionPlane(motionRoot);
            this.callLifecycle(motionRoot, "stage");
        }
        if (step.analytical) {
            this.placeFrontFacing(analyticalRoot, this.analyticalFrontOffset, false);
            this.callLifecycle(analyticalRoot, "stage");
        }
        if (!step.motion) {
            this.callLifecycle(motionRoot, "hide");
        }
        if (!step.analytical) {
            this.callLifecycle(analyticalRoot, "hide");
        }

        if (this.useReferenceCalibrationForExamples && (showGravity || showMagnetic || showWind)) {
            this.calibrateReferenceIfNeeded();
        }
        if (showGravity) {
            this.placeExampleRoot(gravityRoot, this.gravityFrontOffset, this.gravityReferenceOffset);
        }
        if (showMagnetic) {
            this.placeExampleRoot(magneticRoot, this.magneticFrontOffset, this.magneticReferenceOffset);
        }
        if (showWind) {
            this.placeExampleRoot(windRoot, this.windFrontOffset, this.windReferenceOffset);
        }
    }

    private placeMotionPlane(root: SceneObject | null): void {
        if (!root) return;
        this.placeFrontFacing(root, this.motionFrontOffset, true);
        this.disableScriptByName(root, "SurfacePlacer");
    }

    private placeExampleRoot(root: SceneObject | null, frontOffset: vec3, referenceOffset: vec3): void {
        if (!root) return;
        if (this.useReferenceCalibrationForExamples) {
            this.snapToReferenceFrame(root, referenceOffset);
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
        const right = this.safeDirection(cameraRotation.multiplyVec3(new vec3(1.0, 0.0, 0.0)), new vec3(1.0, 0.0, 0.0));
        const up = this.safeDirection(cameraRotation.multiplyVec3(new vec3(0.0, 1.0, 0.0)), new vec3(0.0, 1.0, 0.0));
        const forward = this.safeDirection(cameraRotation.multiplyVec3(new vec3(0.0, 0.0, -1.0)), new vec3(0.0, 0.0, -1.0));
        const target = cameraPosition
            .add(right.uniformScale(localOffset.x))
            .add(up.uniformScale(localOffset.y))
            .add(forward.uniformScale(-localOffset.z));

        const toCamera = cameraPosition.sub(target);
        const faceCamera = toCamera.length > 0.0001 ? quat.lookAt(this.normalizeVec(toCamera), up) : quat.quatIdentity();
        const rotation = motionPlane
            ? faceCamera.multiply(quat.angleAxis(Math.PI * 0.5, new vec3(1.0, 0.0, 0.0)))
            : faceCamera;

        const transform = root.getTransform();
        transform.setWorldPosition(target);
        transform.setWorldRotation(rotation);
    }

    private normalizeExampleField(fieldName: string): ExampleFieldId {
        const key = (fieldName || "").toLowerCase();
        if (key === "magnetic" || key === "magnetism") return "magnetism";
        if (key === "wind" || key === "globe") return "wind";
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
            const api = (script && (script.motionFieldApi || script.analyticalFieldApi || script.fieldApi || script.panelApi)) || script;
            if (api && typeof api[methodName] === "function") return api;
        }
        return null;
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
