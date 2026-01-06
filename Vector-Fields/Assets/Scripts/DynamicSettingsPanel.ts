// DynamicSettingsPanel.ts
// Dynamically creates sliders from a prefab and binds them to field components
// Uses SpectaclesInteractionKit Slider component

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
    @hint("Vertical spacing between sliders")
    sliderSpacing: number = 4.0;

    @input
    @hint("VectorFieldTubes component to control")
    vectorFieldComponent: ScriptComponent;

    @input
    @hint("MagneticFieldTubes component to control")
    magneticFieldComponent: ScriptComponent;

    @input
    @hint("Text component on slider prefab for label (child name)")
    labelChildName: string = "Text";

    private sliders: Map<string, SceneObject> = new Map();
    private activeComponent: any = null;

    private vectorFieldConfigs: SliderConfig[] = [
        { label: "Preset", propertyName: "preset", min: 0, max: 4, defaultValue: 0 },
        { label: "Field Scale", propertyName: "fieldScale", min: 0.1, max: 3.0, defaultValue: 1.0 },
        { label: "Radius", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Flow Speed", propertyName: "flowSpeed", min: 0, max: 100, defaultValue: 50 },
        { label: "Step Size", propertyName: "stepSize", min: 0.01, max: 0.5, defaultValue: 0.1 },
    ];

    private magneticFieldConfigs: SliderConfig[] = [
        { label: "Field Strength", propertyName: "fieldStrength", min: 0.1, max: 10, defaultValue: 1.0 },
        { label: "Radius", propertyName: "radius", min: 0.01, max: 0.2, defaultValue: 0.05 },
        { label: "Flow Speed", propertyName: "flowSpeed", min: 0, max: 50, defaultValue: 2.0 },
        { label: "Step Size", propertyName: "stepSize", min: 0.01, max: 0.5, defaultValue: 0.1 },
        { label: "Arrow Scale", propertyName: "arrowScale", min: 0.05, max: 1.0, defaultValue: 0.15 },
    ];

    onAwake(): void {
        if (!this.sliderPrefab) {
            print("DynamicSettingsPanel: ERROR - No slider prefab assigned!");
            return;
        }
        if (!this.sliderContainer) {
            print("DynamicSettingsPanel: ERROR - No slider container assigned!");
            return;
        }

        this.createScriptApi();
    }

    private createScriptApi(): void {
        const self = this;
        (this as any).panelApi = {
            buildForVectorField: () => self.buildForVectorField(),
            buildForMagneticField: () => self.buildForMagneticField(),
            updateSliderValue: (prop: string, val: number) => self.updateSliderValue(prop, val),
        };
    }

    public buildForVectorField(): void {
        this.clearSliders();
        this.activeComponent = this.vectorFieldComponent;
        this.buildSliders(this.vectorFieldConfigs);
        print("DynamicSettingsPanel: Built " + this.vectorFieldConfigs.length + " sliders for Vector Field");
    }

    public buildForMagneticField(): void {
        this.clearSliders();
        this.activeComponent = this.magneticFieldComponent;
        this.buildSliders(this.magneticFieldConfigs);
        print("DynamicSettingsPanel: Built " + this.magneticFieldConfigs.length + " sliders for Magnetic Field");
    }

    private clearSliders(): void {
        this.sliders.forEach((sliderObj, key) => {
            if (sliderObj) {
                sliderObj.destroy();
            }
        });
        this.sliders.clear();
    }

    private buildSliders(configs: SliderConfig[]): void {
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            this.createSlider(config, i);
        }
    }

    private createSlider(config: SliderConfig, index: number): void {
        const sliderObj = this.sliderPrefab.instantiate(this.sliderContainer);
        sliderObj.name = "Slider_" + config.propertyName;

        const localPos = sliderObj.getTransform().getLocalPosition();
        sliderObj.getTransform().setLocalPosition(new vec3(
            localPos.x,
            localPos.y - (index * this.sliderSpacing),
            localPos.z
        ));

        this.setSliderLabel(sliderObj, config.label);

        const sliderScript = this.findSliderComponent(sliderObj);
        if (sliderScript) {
            this.configureSlider(sliderScript, config);
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

    private configureSlider(slider: any, config: SliderConfig): void {
        if (slider.minValue !== undefined) {
            slider.minValue = config.min;
            slider.maxValue = config.max;
            slider.currentValue = config.defaultValue;

            if (slider.onValueUpdate) {
                slider.onValueUpdate.add((value: number) => {
                    this.onSliderValueChanged(config.propertyName, value);
                });
            }
        } else {
            const normalized = (config.defaultValue - config.min) / (config.max - config.min);
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
