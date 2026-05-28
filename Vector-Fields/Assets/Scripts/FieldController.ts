// FieldController.ts
// Controls which field visualization is active (Vector Field or Magnetic Field)
// Place on root object and assign references to both field root objects

enum FieldType {
    VectorField = 0,
    MagneticField = 1
}

enum FieldLifecycleState {
    Idle = 0,
    Loading = 1,
    Active = 2
}

@component
export class FieldController extends BaseScriptComponent {

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Vector Field", 0),
        new ComboBoxItem("Magnetic Field", 1)
    ]))
    @hint("Which field visualization to display")
    private _activeField: number = 0;

    @input
    @hint("Vector Field Examples Root object")
    vectorFieldRoot: SceneObject;

    @input
    @hint("Magnetic Field Root object")
    magneticFieldRoot: SceneObject;

    @input
    @hint("Optional: DynamicSettingsPanel to auto-rebuild when switching fields")
    settingsPanel: ScriptComponent;

    @input
    @hint("Sprite sheet material to sync preset with active field")
    spriteSheetMaterial: Material;

    @input
    @hint("Duration of crossfade transition between presets (seconds)")
    transitionDuration: number = 0.5;

    @input
    @hint("If false, narration owns first activation; settings can still switch fields later.")
    activateOnAwake: boolean = false;

    @input
    @hint("Delay before enabling a requested field, giving the UI one frame to show loading state.")
    loadingDelay: number = 0.08;

    @input
    @allowUndefined
    @hint("Optional loading object shown between field switches.")
    loadingRoot: SceneObject = null as any;

    private vectorFieldComponent: any;
    private magneticFieldComponent: any;
    private settingsPanelScript: any;
    private spriteSheetPass: Pass;
    private currentSpritePreset: number = 0;
    private prevSpritePreset: number = 0;
    private transitionProgress: number = 1.0;
    private isTransitioning: boolean = false;
    private lifecycleState: FieldLifecycleState = FieldLifecycleState.Idle;
    private switchToken: number = 0;

    onAwake(): void {
        this.cacheComponents();
        this.setLoadingVisible(false);
        if (this.activateOnAwake) {
            this.hideFieldRoots();
            this.applyActiveField();
        }
        print("FieldController: Initialized with " + (this._activeField === 0 ? "Vector Field" : "Magnetic Field"));

        this.createEvent("OnStartEvent").bind(() => {
            this.refreshSettingsPanelApi();
            if (this.activateOnAwake) {
                this.applyActiveField();
            }
        });

        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
    }

    private refreshSettingsPanelApi(): void {
        if (this.settingsPanel && !this.settingsPanelScript) {
            this.settingsPanelScript = (this.settingsPanel as any).panelApi;
        }
    }

    private cacheComponents(): void {
        if (this.vectorFieldRoot) {
            const vfChild = this.findChildByName(this.vectorFieldRoot, "VectorField");
            if (vfChild) {
                this.vectorFieldComponent = vfChild.getComponent("Component.ScriptComponent");
            }
        }

        if (this.magneticFieldRoot) {
            const mfChild = this.findChildByName(this.magneticFieldRoot, "MagneticField");
            if (mfChild) {
                this.magneticFieldComponent = mfChild.getComponent("Component.ScriptComponent");
            }
        }

        if (this.settingsPanel) {
            this.settingsPanelScript = (this.settingsPanel as any).panelApi;
        }

        if (this.spriteSheetMaterial) {
            this.spriteSheetPass = this.spriteSheetMaterial.mainPass;
        }
    }

    private findChildByName(parent: SceneObject, name: string): SceneObject | null {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) {
                return child;
            }
            const found = this.findChildByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private applyActiveField(): void {
        const token = ++this.switchToken;
        this.lifecycleState = FieldLifecycleState.Loading;
        this.setLoadingVisible(true);
        this.hideFieldRoots();

        if (this.settingsPanelScript && this.settingsPanelScript.buildForVectorField) {
            if (this._activeField === FieldType.VectorField) {
                this.settingsPanelScript.buildForVectorField();
            } else {
                this.settingsPanelScript.buildForMagneticField();
            }
        }

        var delayEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        delayEvent.bind(() => {
            if (token !== this.switchToken) return;
            if (this._activeField === FieldType.VectorField && this.vectorFieldRoot) {
                this.vectorFieldRoot.enabled = true;
                this.requestComponentRefresh(this.vectorFieldComponent);
            } else if (this._activeField === FieldType.MagneticField && this.magneticFieldRoot) {
                this.magneticFieldRoot.enabled = true;
                this.requestComponentRefresh(this.magneticFieldComponent);
            }
            this.lifecycleState = FieldLifecycleState.Active;
            this.setLoadingVisible(false);
        });
        delayEvent.reset(Math.max(0.01, this.loadingDelay));
    }

    private hideFieldRoots(): void {
        if (this.vectorFieldRoot) {
            this.vectorFieldRoot.enabled = false;
        }
        if (this.magneticFieldRoot) {
            this.magneticFieldRoot.enabled = false;
        }
    }

    private setLoadingVisible(visible: boolean): void {
        if (this.loadingRoot) {
            this.loadingRoot.enabled = visible;
        }
    }

    private requestComponentRefresh(component: any): void {
        if (!component) return;
        const api = component.fieldApi || component;
        if (api.queueRefresh) {
            api.queueRefresh(0.01);
        } else if (api.refresh) {
            api.refresh();
        }
    }

    private onUpdate(): void {
        this.syncSpriteSheetPreset();
        this.updateTransition();
    }

    private syncSpriteSheetPreset(): void {
        if (!this.spriteSheetPass) {
            return;
        }

        var targetPreset = 0;

        if (this._activeField === FieldType.VectorField) {
            var vfPreset = 0;
            const vf = this.vectorFieldComponent ? (this.vectorFieldComponent.fieldApi || this.vectorFieldComponent) : null;
            if (vf && vf.preset !== undefined) {
                vfPreset = vf.preset;
            }
            targetPreset = vfPreset;
        } else {
            targetPreset = 8;
        }

        if (targetPreset !== this.currentSpritePreset) {
            this.startTransition(targetPreset);
        }
    }

    private startTransition(newPreset: number): void {
        if (!this.spriteSheetPass) {
            return;
        }

        this.prevSpritePreset = this.currentSpritePreset;
        this.currentSpritePreset = newPreset;
        this.transitionProgress = 0.0;
        this.isTransitioning = true;

        this.spriteSheetPass.prevPreset = this.prevSpritePreset;
        this.spriteSheetPass.preset = this.currentSpritePreset;
        this.spriteSheetPass.blendAmount = 0.0;
    }

    private updateTransition(): void {
        if (!this.spriteSheetPass || !this.isTransitioning) {
            return;
        }

        var dt = getDeltaTime();
        this.transitionProgress += dt / this.transitionDuration;

        if (this.transitionProgress >= 1.0) {
            this.transitionProgress = 1.0;
            this.isTransitioning = false;
        }

        this.spriteSheetPass.blendAmount = this.transitionProgress;
    }

    public setActiveField(fieldType: number): void {
        const nextField = Math.floor(Math.min(1, Math.max(0, fieldType)));
        if (nextField === this._activeField && this.lifecycleState === FieldLifecycleState.Active) {
            return;
        }
        this._activeField = nextField;
        this.applyActiveField();
        print("FieldController: Switched to " + (this._activeField === 0 ? "Vector Field" : "Magnetic Field"));
    }

    public showVectorField(): void {
        this.setActiveField(FieldType.VectorField);
    }

    public showMagneticField(): void {
        this.setActiveField(FieldType.MagneticField);
    }

    public toggle(): void {
        this.setActiveField(this._activeField === 0 ? 1 : 0);
    }

    get activeField(): number {
        return this._activeField;
    }

    set activeField(value: number) {
        this.setActiveField(value);
    }

    get activeFieldName(): string {
        return this._activeField === 0 ? "VectorField" : "MagneticField";
    }

    public getVectorFieldComponent(): any {
        return this.vectorFieldComponent;
    }

    public getMagneticFieldComponent(): any {
        return this.magneticFieldComponent;
    }

    get state(): number {
        return this.lifecycleState;
    }
}
