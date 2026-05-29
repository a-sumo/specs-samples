import { EUROPA_TECNOSINE_AMBIENT_DURATION, sampleEuropaTecnosineAmbientChannels } from "./EuropaTecnosineAmbientChannels";

const EUROPA_AUDIO_TRACK = requireAsset("../Audio/europa-tecnosine-main-version-07-43-13869.mp3") as AudioTrackAsset;
const TWO_PI = 6.28318530718;
const EUROPA_TECNOSINE_DURATION = EUROPA_TECNOSINE_AMBIENT_DURATION;

// Baked channels: x=audio magnitude, y=recorded channel 2 yaw, z=22-40Hz sub-bass intensity, w=opacity.
@component
export class EuropaTecnosineIntroDriver extends BaseScriptComponent {
    @input
    autoStart: boolean = true;

    @input
    loop: boolean = false;

    @input
    activateVectorFieldOnStart: boolean = true;

    @input
    useSphericalVectorShell: boolean = true;

    @input
    driveVectorField: boolean = true;

    @input
    driveMotionField: boolean = true;

    @input
    driveTargetOrbit: boolean = true;

    @input
    useAmbientVectorPlane: boolean = true;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    volume: number = 0.78;

    @input
    @widget(new SliderWidget(0.0, 464.0, 0.1))
    startTime: number = 0.0;

    @input
    @widget(new SliderWidget(-2.0, 2.0, 0.01))
    visualLeadSeconds: number = 0.0;

    @input
    @widget(new SliderWidget(0.0, 1.5, 0.01))
    influence: number = 0.85;

    @input
    @widget(new SliderWidget(2.0, 8.0, 0.1))
    shellRadius: number = 4.8;

    @input
    vectorFieldObjectName: string = "VectorField";

    @input
    motionFieldObjectName: string = "Motion Field Root";

    @input
    targetObjectName: string = "Target";

    @input
    @allowUndefined
    fieldController: ScriptComponent = null as any;

    @input
    @allowUndefined
    vectorFieldComponent: ScriptComponent = null as any;

    @input
    @allowUndefined
    motionFieldComponent: ScriptComponent = null as any;

    @input
    @allowUndefined
    targetObject: SceneObject = null as any;

    private audioComponent: AudioComponent | null = null;
    private sceneStartTime: number = 0.0;
    private manualTime: number = -1.0;
    private lastPreset: number = -1;
    private shellConfigured: boolean = false;
    private smoothSample: vec4 = new vec4(0.0, 0.0, 0.0, 0.0);

    onAwake(): void {
        this.createApi();
        this.sceneStartTime = getTime() - this.clamp(this.startTime, 0.0, EUROPA_TECNOSINE_DURATION);
        this.resolveTargets();
        this.ensureAudioComponent();
        this.configureVectorShell();

        this.createEvent("OnStartEvent").bind(() => {
            this.resolveTargets();
            this.configureVectorShell();
            if (this.autoStart) {
                this.startIntro();
            }
        });
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private createApi(): void {
        const self = this;
        (this as any).europaIntroApi = {
            start: () => self.startIntro(),
            stop: () => self.stopIntro(),
            reset: () => self.resetIntro(),
            setTime: (timeSeconds: number) => self.setIntroTime(timeSeconds),
            sampleAt: (timeSeconds: number) => sampleEuropaTecnosineAmbientChannels(timeSeconds),
            get time(): number { return self.getTimelineTime(); },
            get sample(): vec4 { return self.smoothSample; },
        };
    }

    public startIntro(): void {
        this.resolveTargets();
        this.configureVectorShell();
        const start = this.clamp(this.startTime, 0.0, EUROPA_TECNOSINE_DURATION);
        this.sceneStartTime = getTime() - start;
        this.manualTime = -1.0;
        this.ensureAudioComponent();

        if (this.audioComponent) {
            this.audioComponent.audioTrack = EUROPA_AUDIO_TRACK;
            this.audioComponent.volume = this.clamp01(this.volume);
            this.audioComponent.position = start;
            if (this.audioComponent.isPlaying() || this.audioComponent.isPaused()) {
                this.audioComponent.stop(false);
                this.audioComponent.position = start;
            }
            this.audioComponent.play(this.loop ? -1 : 1);
        }
    }

    public stopIntro(): void {
        this.manualTime = this.getTimelineTime();
        if (this.audioComponent && (this.audioComponent.isPlaying() || this.audioComponent.isPaused())) {
            this.audioComponent.stop(true);
        }
    }

    public resetIntro(): void {
        this.setIntroTime(this.startTime);
    }

    public setIntroTime(timeSeconds: number): void {
        const nextTime = this.clamp(timeSeconds, 0.0, EUROPA_TECNOSINE_DURATION);
        this.manualTime = nextTime;
        this.sceneStartTime = getTime() - nextTime;
        if (this.audioComponent) {
            this.audioComponent.position = nextTime;
        }
        this.applyTimeline(nextTime);
    }

    private onUpdate(): void {
        if (this.audioComponent) {
            this.audioComponent.volume = this.clamp01(this.volume);
        }
        this.applyTimeline(this.getTimelineTime());
    }

    private applyTimeline(timeSeconds: number): void {
        const sampleTime = this.wrapOrClampTime(timeSeconds + this.visualLeadSeconds);
        const raw = sampleEuropaTecnosineAmbientChannels(sampleTime);
        const dt = Math.min(0.05, Math.max(0.001, getDeltaTime()));
        const alpha = this.clamp(dt * 12.0, 0.0, 1.0);
        this.smoothSample = new vec4(
            this.lerp(this.smoothSample.x, raw.x, alpha),
            this.lerp(this.smoothSample.y, raw.y, alpha),
            this.lerp(this.smoothSample.z, raw.z, alpha),
            this.lerp(this.smoothSample.w, raw.w, alpha)
        );

        if (this.driveVectorField) {
            this.applyVectorField(sampleTime, this.smoothSample);
        }
        if (this.driveMotionField) {
            this.applyMotionField(this.smoothSample);
        }
        if (this.driveTargetOrbit) {
            this.applyTargetOrbit(sampleTime, this.smoothSample);
        }
    }

    private applyVectorField(timeSeconds: number, sample: vec4): void {
        const api = this.getScriptApi(this.vectorFieldComponent);
        if (!api) return;

        const pulse = sample.x;
        const flow = sample.y;
        const lift = sample.z;
        const amount = this.clamp(this.influence, 0.0, 1.5);

        if (this.useAmbientVectorPlane) {
            if (api.setPreset) {
                api.setPreset(9);
            } else {
                api.preset = 9;
            }
            if (api.setAmbientChannels) {
                api.setAmbientChannels(pulse, flow, lift, sample.w);
            }
            if (api.setFlowSpeedNormalized) {
                api.setFlowSpeedNormalized(this.clamp01(0.03 + flow * 0.12));
            }
            if (api.setFieldScaleNormalized) {
                api.setFieldScaleNormalized(this.clamp01((0.16 + pulse * 0.36 + lift * 0.18) * amount));
            }
            if (api.setRadiusNormalized) {
                api.setRadiusNormalized(this.clamp01(0.025 + pulse * 0.13));
            }
            if (api.setArrowScaleNormalized) {
                api.setArrowScaleNormalized(this.clamp01(0.18 + pulse * 0.58 + lift * 0.20));
            } else if (api.arrowScale !== undefined) {
                api.arrowScale = 0.45 + pulse * 2.15 + lift * 0.75;
            }
            this.lastPreset = 9;
            return;
        }

        if (api.setFlowSpeedNormalized) {
            api.setFlowSpeedNormalized(this.clamp01((0.10 + flow * 0.78 + pulse * 0.12) * amount));
        }
        if (api.setFieldScaleNormalized) {
            api.setFieldScaleNormalized(this.clamp01((0.12 + lift * 0.58 + pulse * 0.16) * amount));
        }
        if (api.setRadiusNormalized) {
            api.setRadiusNormalized(this.clamp01(0.05 + pulse * 0.18 + lift * 0.10));
        }

        const preset = this.choosePreset(pulse, flow, lift, timeSeconds);
        if (preset !== this.lastPreset) {
            if (api.setPreset) {
                api.setPreset(preset);
            } else {
                api.preset = preset;
            }
            this.lastPreset = preset;
        }
    }

    private applyMotionField(sample: vec4): void {
        const api = this.getScriptApi(this.motionFieldComponent);
        if (!api) return;

        const pulse = sample.x;
        const flow = sample.y;
        const lift = sample.z;
        const amount = this.clamp(this.influence, 0.0, 1.5);

        if (api.setFlowSpeedNormalized) {
            api.setFlowSpeedNormalized(this.clamp01(0.15 + flow * 0.78));
        } else {
            api.flowSpeed = 0.35 + flow * 2.65 * amount;
        }
        api.gustStrength = 0.25 + pulse * 2.75 * amount;
        api.curlStrength = 0.20 + lift * 2.25 * amount;
    }

    private applyTargetOrbit(timeSeconds: number, sample: vec4): void {
        if (!this.targetObject) return;

        const pulse = sample.x;
        const flow = sample.y;
        const lift = sample.z;
        const amount = this.clamp(this.influence, 0.0, 1.5);
        const angle = timeSeconds * 0.16 + flow * TWO_PI + lift * 1.3;
        const radius = (1.05 + flow * 2.25 + pulse * 0.65) * amount;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle * 0.83 + lift * 1.7) * (0.85 + flow * 1.65) * amount;
        const y = -0.40 + lift * 2.10 + Math.sin(timeSeconds * 0.21 + pulse * 4.0) * 0.28;
        this.targetObject.getTransform().setLocalPosition(new vec3(x, y, z));
    }

    private choosePreset(pulse: number, flow: number, lift: number, timeSeconds: number): number {
        const slowBeat = Math.sin(timeSeconds * 0.055) * 0.5 + 0.5;
        if (lift > 0.62 && flow < 0.62) return 3;
        if (flow > 0.58) return 2;
        if (pulse > 0.68 || slowBeat * pulse > 0.42) return 0;
        return 1;
    }

    private configureVectorShell(): void {
        if (this.shellConfigured) return;
        const api = this.getScriptApi(this.vectorFieldComponent);
        if (!api) return;

        if (this.activateVectorFieldOnStart && this.fieldController) {
            const controller = this.getScriptApi(this.fieldController);
            if (controller && controller.showVectorField) {
                controller.showVectorField();
            }
        }

        if (api.setTubeMode) {
            api.setTubeMode(this.useAmbientVectorPlane ? 2 : 0);
        }
        if (api.setDomainMode) {
            if (this.useAmbientVectorPlane) {
                api.setDomainMode(2);
            } else if (this.useSphericalVectorShell) {
                api.setDomainMode(1);
            }
        }
        if (this.useAmbientVectorPlane && api.setPreset) {
            api.setPreset(9);
        }
        if (api.sphereRadius !== undefined) {
            api.sphereRadius = Math.max(0.5, this.shellRadius);
        }
        if (api.setLengthSegmentsNormalized) {
            api.setLengthSegmentsNormalized(0.18);
        } else if (api.queueRefresh) {
            api.queueRefresh(0.05);
        }
        this.shellConfigured = true;
    }

    private ensureAudioComponent(): void {
        if (!this.audioComponent) {
            this.audioComponent = this.sceneObject.getComponent("Component.AudioComponent") as AudioComponent;
        }
        if (!this.audioComponent) {
            this.audioComponent = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent;
        }
        if (this.audioComponent) {
            this.audioComponent.audioTrack = EUROPA_AUDIO_TRACK;
            this.audioComponent.volume = this.clamp01(this.volume);
            this.audioComponent.position = this.clamp(this.startTime, 0.0, EUROPA_TECNOSINE_DURATION);
        }
    }

    private getTimelineTime(): number {
        let timeSeconds = getTime() - this.sceneStartTime;
        if (this.audioComponent && (this.audioComponent.isPlaying() || this.audioComponent.isPaused())) {
            timeSeconds = this.audioComponent.position;
        } else if (this.manualTime >= 0.0) {
            timeSeconds = this.manualTime;
        }
        return this.wrapOrClampTime(timeSeconds);
    }

    private wrapOrClampTime(timeSeconds: number): number {
        if (this.loop) {
            let wrapped = timeSeconds % EUROPA_TECNOSINE_DURATION;
            if (wrapped < 0.0) wrapped += EUROPA_TECNOSINE_DURATION;
            return wrapped;
        }
        return this.clamp(timeSeconds, 0.0, EUROPA_TECNOSINE_DURATION);
    }

    private resolveTargets(): void {
        if (!this.fieldController) {
            this.fieldController = this.findScriptWithMethod(this.sceneObject, "showVectorField");
        }
        if (!this.vectorFieldComponent) {
            const localVectorField = this.findChildByName(this.sceneObject, this.vectorFieldObjectName);
            const globalVectorField = localVectorField || this.findGlobalObjectByName(this.vectorFieldObjectName);
            if (globalVectorField) {
                this.vectorFieldComponent = globalVectorField.getComponent("Component.ScriptComponent") as ScriptComponent;
            }
        }
        if (!this.motionFieldComponent) {
            const motionObject = this.findGlobalObjectByName(this.motionFieldObjectName);
            if (motionObject) {
                this.motionFieldComponent = motionObject.getComponent("Component.ScriptComponent") as ScriptComponent;
            }
        }
        if (!this.targetObject) {
            this.targetObject = this.findChildByName(this.sceneObject, this.targetObjectName) || this.findGlobalObjectByName(this.targetObjectName) || null as any;
        }
    }

    private findScriptWithMethod(root: SceneObject, methodName: string): ScriptComponent {
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate && candidate[methodName]) {
                return scripts[i];
            }
        }
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const found = this.findScriptWithMethod(root.getChild(i), methodName);
            if (found) return found;
        }
        return null as any;
    }

    private getScriptApi(component: ScriptComponent): any {
        if (!component) return null;
        const script = component as any;
        return script.fieldApi || script.panelApi || script.europaIntroApi || script;
    }

    private findGlobalObjectByName(name: string): SceneObject | null {
        const rootCount = global.scene.getRootObjectsCount();
        for (let i = 0; i < rootCount; i++) {
            const root = global.scene.getRootObject(i);
            if (root.name === name) return root;
            const found = this.findChildByName(root, name);
            if (found) return found;
        }
        return null;
    }

    private findChildByName(parent: SceneObject, name: string): SceneObject | null {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
            const found = this.findChildByName(child, name);
            if (found) return found;
        }
        return null;
    }

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    private clamp01(value: number): number {
        return this.clamp(value, 0.0, 1.0);
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.min(maxValue, Math.max(minValue, value));
    }
}
