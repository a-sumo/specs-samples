import { FieldButtonBinding, VectorFieldUIStyle } from "./VectorFieldUIStyle";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";

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
    @hint("MagnetPhysics component to control")
    magnetPhysicsComponent: ScriptComponent;

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

    @input
    @allowUndefined
    @hint("Flat/toon material cloned for custom button and panel meshes")
    uiMaterial: Material = null as any;

    @input
    @allowUndefined
    @hint("SceneObject that visually frames the settings controls")
    panelRoot: SceneObject = null as any;

    private sliders: Map<string, SceneObject> = new Map();
    private fieldModeToggles: SceneObject[] = [];
    private presetToggles: SceneObject[] = [];
    private tubeModeToggles: SceneObject[] = [];
    private lodToggles: SceneObject[] = [];
    private fieldModeButtonStyles: FieldButtonBinding[] = [];
    private presetButtonStyles: FieldButtonBinding[] = [];
    private tubeModeButtonStyles: FieldButtonBinding[] = [];
    private lodButtonStyles: FieldButtonBinding[] = [];
    private activeComponent: any = null;
    private proxyApi: any = null;
    private fieldModesBuilt: boolean = false;
    private presetsBuilt: boolean = false;
    private tubeModesBuilt: boolean = false;
    private lodBuilt: boolean = false;
    private panelStyled: boolean = false;

    private vectorFieldValues: Map<string, number> = new Map();
    private magneticFieldValues: Map<string, number> = new Map();
    private currentFieldType: string = "";

    private fieldModes: string[] = [
        "Patterns",
        "Magnets"
    ];

    private vectorFieldPresets: string[] = [
        "Burst",
        "Pull",
        "Orbit",
        "Waves"
    ];

    private tubeModes: string[] = [
        "Lines",
        "Dots",
        "Arrows"
    ];

    private lodModes: string[] = [
        "Fast",
        "Balanced",
        "Detailed",
        "Dense"
    ];

    private vectorFieldConfigs: SliderConfig[] = [
        { label: "Field Size", propertyName: "fieldScale", min: 0.1, max: 3.0, defaultValue: 1.0 },
        { label: "Line Width", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Motion Speed", propertyName: "flowSpeed", min: 0, max: 100, defaultValue: 50.0 },
        { label: "Curve Detail", propertyName: "stepSize", min: 0.01, max: 0.5, defaultValue: 0.1 },
    ];

    private magneticFieldConfigs: SliderConfig[] = [
        { label: "Magnet Power", propertyName: "fieldStrength", min: 0.1, max: 5.0, defaultValue: 1.0 },
        { label: "Line Width", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Motion Speed", propertyName: "flowSpeed", min: 0, max: 20, defaultValue: 2.0 },
        { label: "Curve Detail", propertyName: "stepSize", min: 0.01, max: 0.3, defaultValue: 0.08 },
        { label: "Arrow Size", propertyName: "arrowScale", min: 0.05, max: 1.0, defaultValue: 0.15 },
        { label: "Pull Range", propertyName: "referenceDistance", min: 2.0, max: 30.0, defaultValue: 8.0 },
    ];

    private fieldModeCallbackAdded: boolean = false;
    private presetCallbackAdded: boolean = false;
    private tubeModeCallbackAdded: boolean = false;
    private lodCallbackAdded: boolean = false;

    onAwake(): void {
        this.createScriptApi();

        this.createEvent("OnStartEvent").bind(() => {
            this.stylePanelShell();
            this.layoutControlContainers();
            this.buildFieldModeToggles();
            this.buildForVectorField();
        });

        this.createEvent("UpdateEvent").bind(() => this.updateButtonStyles());
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
        if (!this.fieldModeToggleContainer) {
            print("DynamicSettingsPanel: No field mode container - skipping");
            return;
        }

        if (this.fieldModesBuilt) return;

        const toggleCount = this.fieldModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const totalWidth = (toggleCount - 1) * this.fieldModeToggleSpacing;
            const startOffset = -totalWidth / 2;
            const xPos = startOffset + (i * this.fieldModeToggleSpacing);
            const style = this.createProgrammaticToggle(
                this.fieldModeToggleContainer,
                "FieldMode_" + i,
                this.fieldModes[i],
                new vec3(xPos, 0.0, 0.0),
                9.2,
                3.2,
                42,
                i,
                () => this.onFieldModeSelected(i)
            );
            if (style) {
                this.fieldModeButtonStyles.push(style);
                VectorFieldUIStyle.setSelected(style, i === 0);
                this.fieldModeToggles.push(style.button);
            }
        }

        this.fieldModesBuilt = true;
        print("DynamicSettingsPanel: Built " + toggleCount + " field mode toggles");
    }

    private onFieldModeSelected(index: number): void {
        this.setSelectedButton(this.fieldModeButtonStyles, index);

        if (this.fieldController) {
            const controller = this.fieldController as any;
            if (controller.setActiveField) {
                controller.setActiveField(index);
                print("DynamicSettingsPanel: Field mode changed to " + this.fieldModes[index]);
                return;
            }
        }

        if (index === 0) {
            this.buildForVectorField();
        } else {
            this.buildForMagneticField();
        }

        print("DynamicSettingsPanel: Field mode changed to " + this.fieldModes[index]);
    }

    public buildForVectorField(): void {
        this.saveCurrentValues();
        this.clearSliders();
        this.currentFieldType = "vector";
        const vf = this.vectorFieldComponent as any;
        this.activeComponent = vf ? (vf.fieldApi || vf) : null;
        this.buildSliders(this.vectorFieldConfigs, this.vectorFieldValues);

        if (!this.presetsBuilt) {
            this.buildPresetToggles();
            this.presetsBuilt = true;
        }
        if (!this.tubeModesBuilt) {
            this.buildTubeModeToggles();
            this.tubeModesBuilt = true;
        }
        this.showPresetContainer(true);
        this.showLODContainer(false);
        this.syncPresetSelection();
        this.syncTubeModeSelection();
        print("DynamicSettingsPanel: Switched to Vector Field");
    }

    public buildForMagneticField(): void {
        this.saveCurrentValues();
        this.clearSliders();
        this.currentFieldType = "magnetic";
        const mf = this.magneticFieldComponent as any;
        this.activeComponent = mf ? (mf.fieldApi || mf) : null;
        this.buildSliders(this.magneticFieldConfigs, this.magneticFieldValues);

        if (!this.tubeModesBuilt) {
            this.buildTubeModeToggles();
            this.tubeModesBuilt = true;
        }
        this.showPresetContainer(false);
        this.showLODContainer(false);
        this.syncTubeModeSelection();
        print("DynamicSettingsPanel: Switched to Magnetic Field");
    }

    private syncTubeModeSelection(): void {
        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedMode = valueMap.get("tubeMode");
        const currentMode = savedMode !== undefined ? savedMode : 1;
        this.setSelectedButton(this.tubeModeButtonStyles, currentMode);
    }

    private syncPresetSelection(): void {
        const savedPreset = this.vectorFieldValues.get("preset");
        const currentPreset = savedPreset !== undefined ? savedPreset : 0;
        this.setSelectedButton(this.presetButtonStyles, currentPreset);
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
        const currentLOD = savedLOD !== undefined ? savedLOD : 0;
        this.setSelectedButton(this.lodButtonStyles, currentLOD);
    }

    private buildLODToggles(): void {
        if (!this.lodToggleContainer) {
            print("DynamicSettingsPanel: No LOD container - skipping");
            return;
        }

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedLOD = valueMap.get("lod");
        const currentLOD = savedLOD !== undefined ? savedLOD : 0;

        const toggleCount = this.lodModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const style = this.createToggleInContainer(
                this.lodToggleContainer,
                this.lodModes[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentLOD,
                this.lodButtonStyles,
                i + 2,
                toggleCount,
                3.8,
                6.4,
                2.8,
                () => this.onLODSelected(i)
            );
            if (style) {
                this.lodToggles.push(style.button);
            }
        }
    }

    private onLODSelected(index: number): void {
        if (!this.activeComponent) return;
        this.setSelectedButton(this.lodButtonStyles, index);

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        valueMap.set("lod", index);

        const component = this.activeComponent as any;
        if (component && component.lod !== undefined) {
            component.lod = index;
        }
        print("DynamicSettingsPanel: LOD changed to " + this.lodModes[index]);
    }

    private buildPresetToggles(): void {
        if (!this.presetToggleContainer) {
            print("DynamicSettingsPanel: No preset container - skipping");
            return;
        }

        const savedPreset = this.vectorFieldValues.get("preset");
        const currentPreset = savedPreset !== undefined ? savedPreset : 0;

        const toggleCount = this.vectorFieldPresets.length;
        for (let i = 0; i < toggleCount; i++) {
            const style = this.createToggleInContainer(
                this.presetToggleContainer,
                this.vectorFieldPresets[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentPreset,
                this.presetButtonStyles,
                i,
                4,
                3.8,
                6.8,
                2.8,
                () => this.onPresetSelected(i)
            );
            if (style) {
                this.presetToggles.push(style.button);
            }
        }
    }

    private buildTubeModeToggles(): void {
        if (!this.tubeModeToggleContainer) {
            print("DynamicSettingsPanel: No tube mode container - skipping");
            return;
        }

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        const savedMode = valueMap.get("tubeMode");
        const currentMode = savedMode !== undefined ? savedMode : 1;

        const toggleCount = this.tubeModes.length;
        for (let i = 0; i < toggleCount; i++) {
            const style = this.createToggleInContainer(
                this.tubeModeToggleContainer,
                this.tubeModes[i],
                i,
                toggleCount,
                this.optionToggleSpacing,
                i === currentMode,
                this.tubeModeButtonStyles,
                i + 4,
                toggleCount,
                3.8,
                7.0,
                2.8,
                () => this.onTubeModeSelected(i)
            );
            if (style) {
                this.tubeModeToggles.push(style.button);
            }
        }
    }

    private onPresetSelected(index: number): void {
        if (!this.activeComponent) return;
        this.setSelectedButton(this.presetButtonStyles, index);

        const component = this.activeComponent as any;
        if (component.preset !== undefined) {
            component.preset = index;
        }

        this.vectorFieldValues.set("preset", index);
        print("DynamicSettingsPanel: Preset changed to " + this.vectorFieldPresets[index]);
    }

    private onTubeModeSelected(index: number): void {
        if (!this.activeComponent) return;
        this.setSelectedButton(this.tubeModeButtonStyles, index);

        const valueMap = this.currentFieldType === "vector" ? this.vectorFieldValues : this.magneticFieldValues;
        valueMap.set("tubeMode", index);

        const component = this.activeComponent as any;
        if (component && component.tubeMode !== undefined) {
            component.tubeMode = index;
        }
        print("DynamicSettingsPanel: Tube mode changed to " + this.tubeModes[index]);
    }

    private setSelectedButton(styles: FieldButtonBinding[], selectedIndex: number): void {
        for (let i = 0; i < styles.length; i++) {
            VectorFieldUIStyle.setSelected(styles[i], i === selectedIndex);
        }
    }

    private updateButtonStyles(): void {
        this.updateButtonStyleList(this.fieldModeButtonStyles);
        this.updateButtonStyleList(this.presetButtonStyles);
        this.updateButtonStyleList(this.tubeModeButtonStyles);
        this.updateButtonStyleList(this.lodButtonStyles);
    }

    private updateButtonStyleList(styles: FieldButtonBinding[]): void {
        for (let i = 0; i < styles.length; i++) {
            VectorFieldUIStyle.update(styles[i]);
        }
    }

    private findToggleGroupComponent(obj: SceneObject): any {
        if (!obj) return null;
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
        container: SceneObject,
        label: string,
        index: number,
        totalCount: number,
        spacing: number,
        isSelected: boolean,
        styleList: FieldButtonBinding[] | null = null,
        paletteIndex: number = 0,
        maxColumns: number = 0,
        verticalSpacing: number = 3.2,
        widthCm: number = 6.0,
        heightCm: number = 2.2,
        onTap: () => void = () => {}
    ): FieldButtonBinding | null {
        const columns = maxColumns > 0 ? Math.min(maxColumns, totalCount) : totalCount;
        const rows = Math.ceil(totalCount / columns);
        const col = index % columns;
        const row = Math.floor(index / columns);
        const totalWidth = (columns - 1) * spacing;
        const totalHeight = (rows - 1) * verticalSpacing;
        const startOffset = -totalWidth / 2;

        return this.createProgrammaticToggle(container, "Toggle_" + index, label, new vec3(
            startOffset + (col * spacing),
            (totalHeight / 2) - (row * verticalSpacing),
            0.0
        ), widthCm, heightCm, label.length <= 5 ? 40 : 34, paletteIndex, onTap, isSelected, styleList);
    }

    private createProgrammaticToggle(
        parent: SceneObject,
        name: string,
        label: string,
        position: vec3,
        widthCm: number,
        heightCm: number,
        labelFontSize: number,
        paletteIndex: number,
        onTap: () => void,
        isSelected: boolean = false,
        styleList: FieldButtonBinding[] | null = null
    ): FieldButtonBinding | null {
        const toggleObj = global.scene.createSceneObject(name);
        toggleObj.setParent(parent);
        this.placeInstancedObject(toggleObj, position);

        const button = toggleObj.createComponent(RectangleButton.getTypeName()) as RectangleButton;
        button.size = new vec3(widthCm, heightCm, 1.4);
        button.initialize();

        const labelObj = global.scene.createSceneObject(this.toggleTextChildName);
        labelObj.setParent(toggleObj);
        this.placeInstancedObject(labelObj, new vec3(0.0, 0.0, 0.9));
        const textComp = labelObj.createComponent("Component.Text") as Text;
        textComp.text = label;
        textComp.size = labelFontSize;
        textComp.horizontalAlignment = HorizontalAlignment.Center;
        textComp.verticalAlignment = VerticalAlignment.Center;
        textComp.horizontalOverflow = HorizontalOverflow.Truncate;
        textComp.verticalOverflow = VerticalOverflow.Truncate;
        textComp.worldSpaceRect = Rect.create(-widthCm * 0.42, widthCm * 0.42, -heightCm * 0.42, heightCm * 0.42);

        const style = VectorFieldUIStyle.prepareButton(toggleObj, label, {
            widthCm,
            heightCm,
            labelFontSize,
            renderOrder: 80,
            paletteIndex,
            buttonMaterial: this.uiMaterial,
        });
        if (style) {
            VectorFieldUIStyle.setSelected(style, isSelected);
            if (styleList) {
                styleList.push(style);
            }
        }
        button.onTriggerUp.add(onTap);
        return style;
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

        this.placeInstancedObject(sliderObj, new vec3(xOffset, yOffset, 0.0));

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
                this.configureSliderLabelRect(textComp);
                VectorFieldUIStyle.configureText(textComp, new vec4(1.0, 0.98, 0.94, 1.0), new vec4(0.08, 0.08, 0.09, 1.0), 82);
            }
        } else {
            const textComp = this.findTextComponent(sliderObj);
            if (textComp) {
                textComp.text = label;
                this.configureSliderLabelRect(textComp);
                VectorFieldUIStyle.configureText(textComp, new vec4(1.0, 0.98, 0.94, 1.0), new vec4(0.08, 0.08, 0.09, 1.0), 82);
            }
        }
    }

    private configureSliderLabelRect(textComp: Text): void {
        const t = textComp as any;
        try {
            t.size = 42;
            t.horizontalAlignment = HorizontalAlignment.Center;
            t.verticalAlignment = VerticalAlignment.Center;
            t.horizontalOverflow = HorizontalOverflow.Wrap;
            t.verticalOverflow = VerticalOverflow.Truncate;
            t.worldSpaceRect = Rect.create(-5.8, 5.8, -1.15, 1.15);
        } catch (e) {}
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
        this.deactivateProxyForContentInteraction();

        // referenceDistance goes only to MagnetPhysics
        if (propertyName === "referenceDistance" && this.magnetPhysicsComponent) {
            const physics = this.magnetPhysicsComponent as any;
            if (physics.referenceDistance !== undefined) {
                physics.referenceDistance = value;
            }
        }
        // fieldStrength goes to BOTH visualization and physics (scaled)
        else if (propertyName === "fieldStrength") {
            // Update visualization
            const component = this.activeComponent as any;
            if (component.fieldStrength !== undefined) {
                component.fieldStrength = value;
            }
            // Update physics - scale fieldStrength (0.1-5) to forceStrength (20-500)
            if (this.magnetPhysicsComponent && this.currentFieldType === "magnetic") {
                const physics = this.magnetPhysicsComponent as any;
                if (physics.forceStrength !== undefined) {
                    // Map 0.1-5.0 → 20-500
                    const normalized = (value - 0.1) / (5.0 - 0.1);
                    physics.forceStrength = 20 + normalized * 480;
                }
            }
        }
        else {
            const component = this.activeComponent as any;
            if (component[propertyName] !== undefined) {
                component[propertyName] = value;
            }
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

    private stylePanelShell(): void {
        if (this.panelStyled) return;
        const root = this.panelRoot || this.inferPanelRoot();
        if (!root) return;
        this.panelStyled = true;
        root.getTransform().setLocalPosition(new vec3(-19.0, -6.4, -64.0));
        root.getTransform().setLocalRotation(quat.quatIdentity());
        root.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));
        VectorFieldUIStyle.preparePanel(root, {
            widthCm: 30.0,
            heightCm: 33.0,
            depthCm: 0.34,
            cornerRadiusCm: 0.9,
            frameThicknessCm: 0.24,
            renderOrder: 2,
            panelMaterial: this.uiMaterial,
            backplateColor: new vec4(0.38, 0.38, 0.39, 0.97),
            frameColor: new vec4(0.92, 0.92, 0.88, 1.0),
        });
    }

    private layoutControlContainers(): void {
        this.sliderVerticalSpacing = 5.2;
        this.sliderHorizontalSpacing = 12.2;
        this.fieldModeToggleSpacing = 10.4;
        this.optionToggleSpacing = 7.4;
        this.setContainerPosition(this.fieldModeToggleContainer, new vec3(0.0, 12.8, 1.0));
        this.setContainerPosition(this.tubeModeToggleContainer, new vec3(0.0, 8.8, 1.0));
        this.setContainerPosition(this.presetToggleContainer, new vec3(0.0, 4.8, 1.0));
        this.setContainerPosition(this.sliderContainer, new vec3(0.0, -2.3, 1.0));
        this.setContainerPosition(this.lodToggleContainer, new vec3(0.0, -11.8, 1.0));
    }

    private setContainerPosition(container: SceneObject | null, position: vec3): void {
        if (!container) return;
        const tr = container.getTransform();
        tr.setLocalPosition(position);
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1.0, 1.0, 1.0));
    }

    private placeInstancedObject(obj: SceneObject, position: vec3): void {
        const tr = obj.getTransform();
        tr.setLocalPosition(position);
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1.0, 1.0, 1.0));
    }

    private inferPanelRoot(): SceneObject | null {
        const anyContainer = this.fieldModeToggleContainer || this.sliderContainer || this.presetToggleContainer;
        if (!anyContainer) return null;
        try {
            const parentGetter = (anyContainer as any).getParent;
            if (parentGetter && typeof parentGetter === "function") {
                const parent = parentGetter.call(anyContainer) as SceneObject;
                if (parent) return parent;
            }
        } catch (e) {}
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

    private deactivateProxyForContentInteraction(): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (!api) return;
        try {
            if (typeof api.deactivateForContentInteraction === "function") {
                api.deactivateForContentInteraction();
            } else if (typeof api.notifyContentInteractionStart === "function") {
                api.notifyContentInteractionStart();
            } else if (typeof api.setActive === "function") {
                api.setActive(false);
            } else if (typeof api.cancelAndDock === "function") {
                api.cancelAndDock();
            }
        } catch (e) {}
    }

    private findProxyApi(): any {
        const root = this.findObjectByName("ProxyInteractionPlane");
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (
                candidate &&
                (typeof candidate.deactivateForContentInteraction === "function" ||
                    typeof candidate.notifyContentInteractionStart === "function" ||
                    typeof candidate.setActive === "function" ||
                    typeof candidate.cancelAndDock === "function")
            ) {
                return candidate;
            }
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
