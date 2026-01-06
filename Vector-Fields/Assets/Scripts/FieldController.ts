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

    private vectorFieldComponent: any;
    private magneticFieldComponent: any;
    private settingsPanelScript: any;

    onAwake(): void {
        this.cacheComponents();
        this.applyActiveField();
        print("FieldController: Initialized with " + (this._activeField === 0 ? "Vector Field" : "Magnetic Field"));

        this.createEvent("OnStartEvent").bind(() => {
            this.refreshSettingsPanelApi();
            this.applyActiveField();
        });
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
            this.vectorFieldRoot.enabled = (this._activeField === FieldType.VectorField);
        }
        if (this.magneticFieldRoot) {
            this.magneticFieldRoot.enabled = (this._activeField === FieldType.MagneticField);
        }

        if (this.settingsPanelScript && this.settingsPanelScript.buildForVectorField) {
            if (this._activeField === FieldType.VectorField) {
                this.settingsPanelScript.buildForVectorField();
            } else {
                this.settingsPanelScript.buildForMagneticField();
            }
        }
    }

    public setActiveField(fieldType: number): void {
        this._activeField = Math.floor(Math.min(1, Math.max(0, fieldType)));
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
}
