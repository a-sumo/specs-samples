// StoryStepDirector.ts
// Central staging map for the Vector Fields lens story.

type StoryStepConfig = {
    id: string;
    scaffoldRoot: string;
    motion: boolean;
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
        scaffoldRoot: "C00_Intro_Field_Basics",
        motion: false,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "definition",
        scaffoldRoot: "C01_Math_Definition",
        motion: false,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "motion",
        scaffoldRoot: "C02_Motion_Field_Plane",
        motion: true,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "patterns",
        scaffoldRoot: "C02_Transition_Field_Cubes",
        motion: true,
        vector: true,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "metrics",
        scaffoldRoot: "C02_Metrics_Probe",
        motion: true,
        vector: false,
        magnetic: false,
        gravity: false,
        wind: false,
        storyWidgets: false,
    },
    {
        id: "examples",
        scaffoldRoot: "C03_Three_Fields_Gravity_Magnetism_Wind",
        motion: false,
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
    @widget(new SliderWidget(0, 5, 1))
    @hint("Initial step index when applyOnStart is enabled.")
    initialStep: number = 0;

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

    private currentStep: StoryStepConfig = STORY_STEP_CONFIGS[0];
    private currentRootName: string = STORY_STEP_CONFIGS[0].scaffoldRoot;
    private selectedExampleField: ExampleFieldId = "gravity";
    private appliedKey: string = "";
    private elapsed: number = 0.0;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.elapsed = 0.0;
            if (this.applyOnStart) {
                this.showStepByIndex(this.initialStep);
            }
        });
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
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

    private onUpdate(): void {
        if (!this.applyOnStart) return;
        if (this.elapsed > this.settleSeconds) return;
        this.elapsed += getDeltaTime();
        this.applyCurrent(false);
    }

    private applyCurrent(force: boolean): void {
        const key = this.currentStep.id + ":" + this.currentRootName + ":" + this.selectedExampleField;
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

        const api = this.findScriptApi(scaffold, "showRoot");
        if (api && typeof api.showRoot === "function") {
            api.showRoot(rootName);
        }
    }

    private applyContentRoots(step: StoryStepConfig): void {
        const selectingExample = step.id === "examples";
        const showMagnetic = step.magnetic && (!selectingExample || this.selectedExampleField === "magnetism");
        const showGravity = step.gravity && (!selectingExample || this.selectedExampleField === "gravity");
        const showWind = step.wind && (!selectingExample || this.selectedExampleField === "wind");

        this.setEnabled(this.motionFieldRoot || this.findObjectByName("Motion Field Root"), step.motion);
        this.setEnabled(this.vectorFieldRoot || this.findObjectByName("Vector Field Examples Root"), step.vector);
        this.setEnabled(this.magneticFieldRoot || this.findObjectByName("Magnetic Field Root"), showMagnetic);
        this.setEnabled(this.gravityFieldRoot || this.findObjectByName("Gravity Field Root"), showGravity);
        this.setEnabled(this.windGlobeRoot || this.findObjectByName("Globe Calibration") || this.findObjectByName("Globe Wind"), showWind);
        this.setEnabled(this.storyWidgetsRoot || this.findObjectByName("Story Widgets"), step.storyWidgets);
    }

    private normalizeExampleField(fieldName: string): ExampleFieldId {
        const key = (fieldName || "").toLowerCase();
        if (key === "magnetic" || key === "magnetism") return "magnetism";
        if (key === "wind" || key === "globe") return "wind";
        return "gravity";
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

    private findScriptApi(root: SceneObject, methodName: string): any {
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && typeof script[methodName] === "function") return script;
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
}
