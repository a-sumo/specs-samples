// DynamicSettingsPanel.ts
// Dynamically creates sliders and toggles from prefabs and binds them to field components
// Field Mode: Toggle group with "Vector" and "Magnetic" buttons
// Presets: Toggle group for VectorField presets (shown only for Vector Field)
// Tube Modes: Toggle group for Trails/Particles/Arrows (shown for both fields)

interface SliderConfig {
    label: string;
    propertyName: string;
    min: number;
    max: number;
    defaultValue: number;
}

@component
export class DynamicSettingsPanel extends BaseScriptComponent {

    @input
    @hint("Prefab containing a Slider component to instantiate")
    sliderPrefab: ObjectPrefab;

    @input
    @hint("Parent object to place instantiated sliders under")
    sliderContainer: SceneObject;

    @input
    @hint("Vertical spacing between slider rows")
    sliderVerticalSpacing: number = 4.0;

    @input
    @hint("Horizontal spacing between slider columns")
    sliderHorizontalSpacing: number = 12.0;

    @input
    @hint("VectorFieldTubes component to control")
    vectorFieldComponent: ScriptComponent;

    @input
    @hint("MagneticFieldTubes component to control")
    magneticFieldComponent: ScriptComponent;

    @input
    @hint("Text component on slider prefab for label (child name)")
    labelChildName: string = "Text";

    @input
    @hint("Toggle prefab for field mode buttons")
    fieldModeTogglePrefab: ObjectPrefab;

    @input
    @hint("Container with ToggleGroup for field mode")
    fieldModeToggleContainer: SceneObject;

    @input
    @hint("Spacing between field mode toggles")
    fieldModeToggleSpacing: number = 8.0;

    @input
    @hint("Text child name in field mode toggle prefab")
    fieldModeTextChildName: string = "ToggleText";

    @input
    @hint("Toggle prefab for presets and tube mode options")
    optionTogglePrefab: ObjectPrefab;

    @input
    @hint("Container with ToggleGroup for VectorField presets")
    presetToggleContainer: SceneObject;

    @input
    @hint("Container with ToggleGroup for tube modes (Trails/Particles/Arrows)")
    tubeModeToggleContainer: SceneObject;

    @input
    @hint("Container with ToggleGroup for LOD levels")
    lodToggleContainer: SceneObject;

    @input
    @hint("Text child name in toggle prefab")
    toggleTextChildName: string = "Toggle Text";

    @input
    @hint("Horizontal spacing between option toggles")
    optionToggleSpacing: number = 4.0;

    @input
    @hint("FieldController to notify when field mode changes")
    fieldController: ScriptComponent;

    private sliders: Map<string, SceneObject> = new Map();
    private fieldModeToggles: SceneObject[] = [];
    private presetToggles: SceneObject[] = [];
    private tubeModeToggles: SceneObject[] = [];
    private lodToggles: SceneObject[] = [];
    private activeComponent: any = null;
    private fieldModesBuilt: boolean = false;
    private presetsBuilt: boolean = false;
    private tubeModesBuilt: boolean = false;
    private lodBuilt: boolean = false;

    private vectorFieldValues: Map<string, number> = new Map();
    private magneticFieldValues: Map<string, number> = new Map();
    private currentFieldType: string = "";

    private fieldModes: string[] = [
        "Vector",
        "Magnetic"
    ];

    private vectorFieldPresets: string[] = [
        "Expansion",
        "Contraction",
        "Circulation",
        "Waves",
        "Vortex"
    ];

    private tubeModes: string[] = [
        "Trails",
        "Particles",
        "Arrows"
    ];

    private lodModes: string[] = [
        "Low",
        "Med",
        "High",
        "Ultra"
    ];

    private vectorFieldConfigs: SliderConfig[] = [
        { label: "Field Scale", propertyName: "fieldScale", min: 0.1, max: 3.0, defaultValue: 1.0 },
        { label: "Radius", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Flow Speed", propertyName: "flowSpeed", min: 0, max: 100, defaultValue: 50.0 },
        { label: "Step Size", propertyName: "stepSize", min: 0.01, max: 0.5, defaultValue: 0.1 },
    ];

    private magneticFieldConfigs: SliderConfig[] = [
        { label: "Field Strength", propertyName: "fieldStrength", min: 0.1, max: 10, defaultValue: 1.0 },
        { label: "Radius", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Flow Speed", propertyName: "flowSpeed", min: 0, max: 50, defaultValue: 2.0 },
        { label: "Step Size", propertyName: "stepSize", min: 0.01, max: 0.5, defaultValue: 0.1 },
        { label: "Arrow Scale", propertyName: "arrowScale", min: 0.05, max: 1.0, defaultValue: 0.15 },
    ];

    private fieldModeCallbackAdded: boolean = false;
    private presetCallbackAdded: boolean = false;
    private tubeModeCallbackAdded: boolean = false;
    private lodCallbackAdded: boolean = false;

    onAwake(): void {
        this.createScriptApi();

        this.createEvent("OnStartEvent").bind(() => {
            this.buildFieldModeToggles();
            this.buildForVectorField();
        });
    }

    private createScriptApi(): void {
        const self = this;
        (this as any).panelApi = {
            buildForVectorField: () => self.buildForVectorField(),
            buildForMagneticField: () => self.buildForMagneticField(),
            updateSliderValue: (prop: string, val: number) => self.updateSliderValue(prop, val),
        };
    }

    private buildFieldModeToggles(): void {
        if (!this.fieldModeTogglePrefab || !this.fieldModeToggleContainer) {
            print("DynamicSettingsPanel: No field mode toggle prefab or container - skipping");
            return;
        }

        if (this.fieldModesBuilt) return;

        const toggleGroupScript = this.findToggleGroupComponent(this.fieldModeToggleContainer);

        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = 0;

            if (!this.fieldModeCallbackAdded) {
                toggleGroupScript.onToggleSelected.add((args: any) => {
                    const index = args.value;
                    if (index !== undefined) {
                        this.onFieldModeSelected(index);
                    }
                });
                this.fieldModeCallbackAdded = true;
            }
        }

        const toggleCount = this.fieldModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const toggleObj = this.fieldModeTogglePrefab.instantiate(this.fieldModeToggleContainer);
            toggleObj.name = "FieldMode_" + i;

            const totalWidth = (toggleCount - 1) * this.fieldModeToggleSpacing;
            const startOffset = -totalWidth / 2;
            const xPos = startOffset + (i * this.fieldModeToggleSpacing);

            const localPos = toggleObj.getTransform().getLocalPosition();
            toggleObj.getTransform().setLocalPosition(new vec3(
                xPos,
                localPos.y,
                localPos.z
            ));

            const textChild = this.findChildByName(toggleObj, this.fieldModeTextChildName);
            if (textChild) {
                const textComp = textChild.getComponent("Component.Text") as Text;
                if (textComp) {
                    textComp.text = this.fieldModes[i];
                }
            }

            const toggleScript = this.findToggleComponent(toggleObj);
            if (toggleScript && toggleGroupScript) {
                toggleGroupScript.registerToggleable(toggleScript, i);
            }

            this.fieldModeToggles.push(toggleObj);
        }

        if (toggleGroupScript && toggleGroupScript.resetToggleGroup) {
            toggleGroupScript.resetToggleGroup();
        }

        this.fieldModesBuilt = true;
        print("DynamicSettingsPanel: Built " + toggleCount + " field mode toggles");
    }

    private onFieldModeSelected(index: number): void {
        if (index === 0) {
            this.buildForVectorField();
        } else {
            this.buildForMagneticField();
        }

        if (this.fieldController) {
            const controller = this.fieldController as any;
            if (controller.setActiveField) {
                controller.setActiveField(index);
            }
        }

        print("DynamicSettingsPanel: Field mode changed to " + this.fieldModes[index]);
    }

    public buildForVectorField(): void {
        this.saveCurrentValues();
        this.clearSliders();
        this.currentFieldType = "vector";
        this.activeComponent = this.vectorFieldComponent;
        this.buildSliders(this.vectorFieldConfigs, this.vectorFieldValues);

        if (!this.presetsBuilt) {
            this.buildPresetToggles();
            this.presetsBuilt = true;
        }
        if (!this.tubeModesBuilt) {
            this.buildTubeModeToggles();
            this.tubeModesBuilt = true;
        }
        if (!this.lodBuilt) {
            this.buildLODToggles();
            this.lodBuilt = true;
        }

        this.showPresetContainer(true);
        this.showLODContainer(true);
        this.syncTubeModeSelection();
        this.syncLODSelection();
        print("DynamicSettingsPanel: Switched to Vector Field");
    }

    public buildForMagneticField(): void {
        this.saveCurrentValues();
        this.clearSliders();
        this.currentFieldType = "magnetic";
        this.activeComponent = this.magneticFieldComponent;
        this.buildSliders(this.magneticFieldConfigs, this.magneticFieldValues);

        if (!this.tubeModesBuilt) {
            this.buildTubeModeToggles();
            this.tubeModesBuilt = true;
        }
        if (!this.lodBuilt) {
            this.buildLODToggles();
            this.lodBuilt = true;
        }

        this.showPresetContainer(false);
        this.showLODContainer(true);
        this.syncTubeModeSelection();
        this.syncLODSelection();
        print("DynamicSettingsPanel: Switched to Magnetic Field");
    }

    private syncTubeModeSelection(): void {
        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedMode = valueMap.get("tubeMode");
        const currentMode = savedMode !== undefined ? savedMode : 0;

        const toggleGroupScript = this.findToggleGroupComponent(this.tubeModeToggleContainer);
        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = currentMode;
            if (toggleGroupScript.resetToggleGroup) {
                toggleGroupScript.resetToggleGroup();
            }
        }
    }

    private showPresetContainer(show: boolean): void {
        if (this.presetToggleContainer) {
            this.presetToggleContainer.enabled = show;
        }
    }

    private showLODContainer(show: boolean): void {
        if (this.lodToggleContainer) {
            this.lodToggleContainer.enabled = show;
        }
    }

    private syncLODSelection(): void {
        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedLOD = valueMap.get("lod");
        const currentLOD = savedLOD !== undefined ? savedLOD : 1;  // Default to Medium

        const toggleGroupScript = this.findToggleGroupComponent(this.lodToggleContainer);
        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = currentLOD;
            if (toggleGroupScript.resetToggleGroup) {
                toggleGroupScript.resetToggleGroup();
            }
        }
    }

    private buildLODToggles(): void {
        if (!this.optionTogglePrefab || !this.lodToggleContainer) {
            print("DynamicSettingsPanel: No LOD toggle prefab or container - skipping");
            return;
        }

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedLOD = valueMap.get("lod");
        const currentLOD = savedLOD !== undefined ? savedLOD : 1;  // Default to Medium

        const toggleGroupScript = this.findToggleGroupComponent(this.lodToggleContainer);

        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = currentLOD;

            if (!this.lodCallbackAdded) {
                toggleGroupScript.onToggleSelected.add((args: any) => {
                    const index = args.value;
                    if (index !== undefined) {
                        this.onLODSelected(index);
                    }
                });
                this.lodCallbackAdded = true;
            }
        }

        const toggleCount = this.lodModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const toggleScript = this.createToggleInContainer(
                this.optionTogglePrefab,
                this.lodToggleContainer,
                this.lodModes[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentLOD
            );
            if (toggleScript) {
                this.lodToggles.push(toggleScript.getSceneObject());
                if (toggleGroupScript) {
                    toggleGroupScript.registerToggleable(toggleScript, i);
                }
            }
        }

        if (toggleGroupScript && toggleGroupScript.resetToggleGroup) {
            toggleGroupScript.resetToggleGroup();
        }
    }

    private onLODSelected(index: number): void {
        if (!this.activeComponent) return;

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        valueMap.set("lod", index);

        const component = this.activeComponent as any;
        if (component && component.lod !== undefined) {
            component.lod = index;
        }
        print("DynamicSettingsPanel: LOD changed to " + this.lodModes[index]);
    }

    private buildPresetToggles(): void {
        if (!this.optionTogglePrefab || !this.presetToggleContainer) {
            print("DynamicSettingsPanel: No preset toggle prefab or container - skipping");
            return;
        }

        const savedPreset = this.vectorFieldValues.get("preset");
        const currentPreset = savedPreset !== undefined ? savedPreset : 0;

        const toggleGroupScript = this.findToggleGroupComponent(this.presetToggleContainer);

        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = currentPreset;

            if (!this.presetCallbackAdded) {
                toggleGroupScript.onToggleSelected.add((args: any) => {
                    const index = args.value;
                    if (index !== undefined) {
                        this.onPresetSelected(index);
                    }
                });
                this.presetCallbackAdded = true;
            }
        }

        const toggleCount = this.vectorFieldPresets.length;
        for (let i = 0; i < toggleCount; i++) {
            const toggleScript = this.createToggleInContainer(
                this.optionTogglePrefab,
                this.presetToggleContainer,
                this.vectorFieldPresets[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentPreset
            );
            if (toggleScript) {
                this.presetToggles.push(toggleScript.getSceneObject());
                if (toggleGroupScript) {
                    toggleGroupScript.registerToggleable(toggleScript, i);
                }
            }
        }

        if (toggleGroupScript && toggleGroupScript.resetToggleGroup) {
            toggleGroupScript.resetToggleGroup();
        }
    }

    private buildTubeModeToggles(): void {
        if (!this.optionTogglePrefab || !this.tubeModeToggleContainer) {
            print("DynamicSettingsPanel: No tube mode toggle prefab or container - skipping");
            return;
        }

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedMode = valueMap.get("tubeMode");
        const currentMode = savedMode !== undefined ? savedMode : 0;

        const toggleGroupScript = this.findToggleGroupComponent(this.tubeModeToggleContainer);

        if (toggleGroupScript) {
            toggleGroupScript.firstOnToggle = currentMode;

            if (!this.tubeModeCallbackAdded) {
                toggleGroupScript.onToggleSelected.add((args: any) => {
                    const index = args.value;
                    if (index !== undefined) {
                        this.onTubeModeSelected(index);
                    }
                });
                this.tubeModeCallbackAdded = true;
            }
        }

        const toggleCount = this.tubeModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const toggleScript = this.createToggleInContainer(
                this.optionTogglePrefab,
                this.tubeModeToggleContainer,
                this.tubeModes[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentMode
            );
            if (toggleScript) {
                this.tubeModeToggles.push(toggleScript.getSceneObject());
                if (toggleGroupScript) {
                    toggleGroupScript.registerToggleable(toggleScript, i);
                }
            }
        }

        if (toggleGroupScript && toggleGroupScript.resetToggleGroup) {
            toggleGroupScript.resetToggleGroup();
        }
    }

    private onPresetSelected(index: number): void {
        if (!this.activeComponent) return;

        const component = this.activeComponent as any;
        if (component.preset !== undefined) {
            component.preset = index;
        }

        this.vectorFieldValues.set("preset", index);
        print("DynamicSettingsPanel: Preset changed to " + this.vectorFieldPresets[index]);
    }

    private onTubeModeSelected(index: number): void {
        if (!this.activeComponent) return;

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        valueMap.set("tubeMode", index);

        const component = this.activeComponent as any;
        if (component && component.tubeMode !== undefined) {
            component.tubeMode = index;
        }
        print("DynamicSettingsPanel: Tube mode changed to " + this.tubeModes[index]);
    }

    private findToggleGroupComponent(obj: SceneObject): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script.registerToggleable !== undefined) {
                return script;
            }
        }
        return null;
    }

    private createToggleInContainer(
        prefab: ObjectPrefab,
        container: SceneObject,
        label: string,
        index: number,
        totalCount: number,
        spacing: number,
        isSelected: boolean
    ): any {
        const toggleObj = prefab.instantiate(container);
        toggleObj.name = "Toggle_" + index;

        const totalWidth = (totalCount - 1) * spacing;
        const startOffset = -totalWidth / 2;

        const localPos = toggleObj.getTransform().getLocalPosition();
        toggleObj.getTransform().setLocalPosition(new vec3(
            localPos.x + startOffset + (index * spacing),
            localPos.y,
            localPos.z
        ));

        const labelObj = this.findChildByName(toggleObj, this.toggleTextChildName);
        if (labelObj) {
            const textComp = this.findTextComponent(labelObj);
            if (textComp) {
                textComp.text = label;
            }
        }

        const toggleScript = this.findToggleComponent(toggleObj);
        return toggleScript;
    }

    private findToggleComponent(obj: SceneObject): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script.isOn !== undefined && script.onFinished !== undefined) {
                return script;
            }
        }

        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findToggleComponent(obj.getChild(i));
            if (found) return found;
        }

        return null;
    }

    private clearPresetToggles(): void {
        for (const toggleObj of this.presetToggles) {
            if (toggleObj) {
                toggleObj.destroy();
            }
        }
        this.presetToggles = [];
    }

    private clearTubeModeToggles(): void {
        for (const toggleObj of this.tubeModeToggles) {
            if (toggleObj) {
                toggleObj.destroy();
            }
        }
        this.tubeModeToggles = [];
    }

    private saveCurrentValues(): void {
        if (this.currentFieldType === "") return;

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;

        this.sliders.forEach((sliderObj, propertyName) => {
            const slider = this.findSliderComponent(sliderObj);
            if (slider && slider.currentValue !== undefined) {
                const config = this.getConfigForProperty(propertyName);
                if (config) {
                    let actualValue: number;
                    if (slider.minValue !== undefined) {
                        actualValue = slider.currentValue;
                    } else {
                        actualValue = config.min + slider.currentValue * (config.max - config.min);
                    }
                    valueMap.set(propertyName, actualValue);
                }
            }
        });
    }

    private clearSliders(): void {
        this.sliders.forEach((sliderObj, key) => {
            if (sliderObj) {
                sliderObj.destroy();
            }
        });
        this.sliders.clear();
    }

    private buildSliders(configs: SliderConfig[], savedValues: Map<string, number>): void {
        const numRows = Math.ceil(configs.length / 2);
        const totalHeight = (numRows - 1) * this.sliderVerticalSpacing;
        const startY = totalHeight / 2;

        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            const savedValue = savedValues.get(config.propertyName);
            const value = savedValue !== undefined ? savedValue : config.defaultValue;
            this.createSlider(config, i, value, startY);
        }
    }

    private createSlider(config: SliderConfig, index: number, initialValue: number, startY: number): void {
        const sliderObj = this.sliderPrefab.instantiate(this.sliderContainer);
        sliderObj.name = "Slider_" + config.propertyName;

        const col = index % 2;
        const row = Math.floor(index / 2);

        const xOffset = (col === 0 ? -1 : 1) * (this.sliderHorizontalSpacing / 2);
        const yOffset = startY - (row * this.sliderVerticalSpacing);

        const localPos = sliderObj.getTransform().getLocalPosition();
        sliderObj.getTransform().setLocalPosition(new vec3(
            localPos.x + xOffset,
            localPos.y + yOffset,
            localPos.z
        ));

        this.setSliderLabel(sliderObj, config.label);

        const sliderScript = this.findSliderComponent(sliderObj);
        if (sliderScript) {
            this.configureSlider(sliderScript, config, initialValue);
        }

        this.sliders.set(config.propertyName, sliderObj);
    }

    private setSliderLabel(sliderObj: SceneObject, label: string): void {
        const labelObj = this.findChildByName(sliderObj, this.labelChildName);
        if (labelObj) {
            const textComp = this.findTextComponent(labelObj);
            if (textComp) {
                textComp.text = label;
            }
        } else {
            const textComp = this.findTextComponent(sliderObj);
            if (textComp) {
                textComp.text = label;
            }
        }
    }

    private findTextComponent(obj: SceneObject): Text | null {
        const textComp = obj.getComponent("Component.Text");
        if (textComp) {
            return textComp as Text;
        }

        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findTextComponent(obj.getChild(i));
            if (found) return found;
        }

        return null;
    }

    private findSliderComponent(obj: SceneObject): any {
        const scripts = obj.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script.currentValue !== undefined && script.onValueUpdate) {
                return script;
            }
            if (script.currentValue !== undefined && script.onValueChange) {
                return script;
            }
        }

        for (let i = 0; i < obj.getChildrenCount(); i++) {
            const found = this.findSliderComponent(obj.getChild(i));
            if (found) return found;
        }

        return null;
    }

    private configureSlider(slider: any, config: SliderConfig, initialValue: number): void {
        if (slider.minValue !== undefined) {
            slider.minValue = config.min;
            slider.maxValue = config.max;
            slider.currentValue = initialValue;

            if (slider.onValueUpdate) {
                slider.onValueUpdate.add((value: number) => {
                    this.onSliderValueChanged(config.propertyName, value);
                });
            }
        } else {
            const normalized = (initialValue - config.min) / (config.max - config.min);
            slider.currentValue = normalized;

            if (slider.onValueChange) {
                slider.onValueChange.add((normalizedValue: number) => {
                    const actualValue = config.min + normalizedValue * (config.max - config.min);
                    this.onSliderValueChanged(config.propertyName, actualValue);
                });
            }
        }
    }

    private onSliderValueChanged(propertyName: string, value: number): void {
        if (!this.activeComponent) return;

        const component = this.activeComponent as any;
        if (component[propertyName] !== undefined) {
            component[propertyName] = value;
        }

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        valueMap.set(propertyName, value);
    }

    private findChildByName(parent: SceneObject, name: string): SceneObject | null {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) {
                return child;
            }
            const found = this.findChildByName(child, name);
            if (found) return found;
        }
        return null;
    }

    public updateSliderValue(propertyName: string, value: number): void {
        const sliderObj = this.sliders.get(propertyName);
        if (!sliderObj) return;

        const slider = this.findSliderComponent(sliderObj);
        if (!slider) return;

        const config = this.getConfigForProperty(propertyName);
        if (!config) return;

        if (slider.minValue !== undefined) {
            slider.currentValue = value;
        } else {
            const normalized = (value - config.min) / (config.max - config.min);
            slider.currentValue = normalized;
        }
    }

    private getConfigForProperty(propertyName: string): SliderConfig | null {
        for (const config of this.vectorFieldConfigs) {
            if (config.propertyName === propertyName) return config;
        }
        for (const config of this.magneticFieldConfigs) {
            if (config.propertyName === propertyName) return config;
        }
        return null;
    }
}
