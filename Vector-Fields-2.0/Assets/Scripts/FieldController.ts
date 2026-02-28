// FieldController.ts
// Controls which field visualization is active (Vector Field or Magnetic Field)
// Place on root object and assign references to both field root objects

enum FieldType {
    VectorField = 0,
    MagneticField = 1
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

    private vectorFieldComponent: any;
    private magneticFieldComponent: any;
    private settingsPanelScript: any;
    private spriteSheetPass: Pass;
    private currentSpritePreset: number = 0;
    private prevSpritePreset: number = 0;
    private transitionProgress: number = 1.0;
    private isTransitioning: boolean = false;

    onAwake(): void {
        this.cacheComponents();
        this.applyActiveField();
        print("FieldController: Initialized with " + (this._activeField === 0 ? "Vector Field" : "Magnetic Field"));

        this.createEvent("OnStartEvent").bind(() => {
            this.refreshSettingsPanelApi();
            this.applyActiveField();
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
        if (this.vectorFieldRoot) {
            this.vectorFieldRoot.enabled = false;
        }
        if (this.magneticFieldRoot) {
            this.magneticFieldRoot.enabled = false;
        }

        if (this.settingsPanelScript) {
            if (this._activeField === FieldType.VectorField && this.settingsPanelScript.buildForVectorField) {
                this.settingsPanelScript.buildForVectorField();
            } else if (this._activeField === FieldType.MagneticField && this.settingsPanelScript.buildForMagneticField) {
                this.settingsPanelScript.buildForMagneticField();
            }
        }

        var delayEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        delayEvent.bind(() => {
            if (this._activeField === FieldType.VectorField && this.vectorFieldRoot) {
                this.vectorFieldRoot.enabled = true;
            } else if (this._activeField === FieldType.MagneticField && this.magneticFieldRoot) {
                this.magneticFieldRoot.enabled = true;
            }
        });
        delayEvent.reset(0.05);
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
            if (this.vectorFieldComponent && this.vectorFieldComponent.preset !== undefined) {
                vfPreset = this.vectorFieldComponent.preset;
            }
            targetPreset = vfPreset;
        } else if (this._activeField === FieldType.MagneticField) {
            targetPreset = 5;
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
        this._activeField = Math.floor(Math.min(1, Math.max(0, fieldType)));
        this.applyActiveField();
        const names = ["Vector Field", "Magnetic Field"];
        print("FieldController: Switched to " + names[this._activeField]);
    }

    public showVectorField(): void {
        this.setActiveField(FieldType.VectorField);
    }

    public showMagneticField(): void {
        this.setActiveField(FieldType.MagneticField);
    }

    public toggle(): void {
        this.setActiveField((this._activeField + 1) % 2);
    }

    get activeField(): number {
        return this._activeField;
    }

    set activeField(value: number) {
        this.setActiveField(value);
    }

    get activeFieldName(): string {
        const names = ["VectorField", "MagneticField"];
        return names[this._activeField];
    }

    public getVectorFieldComponent(): any {
        return this.vectorFieldComponent;
    }

    public getMagneticFieldComponent(): any {
        return this.magneticFieldComponent;
    }
}
