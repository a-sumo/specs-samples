// MotionFieldPlane.ts
// A first, concrete vector-field layer: a flat advection field that can be
// stirred by moving a handle through it. Built with MeshBuilder so it avoids
// fragile shader-graph wiring during UX iteration.

import { TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";

type FieldSample = {
    x: number;
    z: number;
    speed: number;
};

type FieldMetrics = {
    divergence: number;
    curl: number;
};

type MotionFieldPresetId = "expansion" | "contraction" | "curl" | "motion";

type Tracer = {
    x: number;
    z: number;
    trailX: number[];
    trailZ: number[];
};

const LINE_MATERIAL: Material = requireAsset("../Materials/FlatMaterial 2.mat") as Material;
const DETAIL_MATERIAL: Material = requireAsset("../Materials/MotionFieldDetail.mat") as Material;
const GUIDE_FONT: Font = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;
const LINE_WIDTH_SCALE: number = 1.62;
const METRIC_READOUT_SIZE: number = 78;
const METRIC_READOUT_ORDER: number = 96;
const DYNAMIC_MESH_FPS: number = 24.0;
const METRIC_READOUT_FPS: number = 10.0;
const INTERACTION_REFRESH_SECONDS: number = 0.25;

@component
export class MotionFieldPlane extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Optional draggable handle. Its local X/Z position creates a moving gust in the field.")
    interactionObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional draggable metric cursor. Its local X/Z position samples divergence and curl.")
    metricCursorObject: SceneObject = null as any;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Expansion", 0),
        new ComboBoxItem("Contraction", 1),
        new ComboBoxItem("Curl", 2),
        new ComboBoxItem("Motion", 3),
    ]))
    @hint("Initial planar field preset.")
    initialPreset: number = 3;

    @input
    @widget(new SliderWidget(8.0, 64.0, 0.5))
    planeWidth: number = 48.0;

    @input
    @widget(new SliderWidget(5.0, 44.0, 0.5))
    planeDepth: number = 28.0;

    @input
    @widget(new SliderWidget(30, 420, 5))
    tracerCount: number = 132;

    @input
    @widget(new SliderWidget(4, 18, 1))
    trailSamples: number = 8;

    @input
    @widget(new SliderWidget(0.2, 4.0, 0.05))
    flowSpeed: number = 1.15;

    @input
    @widget(new SliderWidget(0.0, 3.0, 0.05))
    gustStrength: number = 2.1;

    @input
    @widget(new SliderWidget(1.0, 8.0, 0.25))
    gustRadius: number = 3.9;

    @input
    @widget(new SliderWidget(0.0, 3.0, 0.05))
    curlStrength: number = 1.45;

    @input
    @widget(new SliderWidget(5, 27, 1))
    arrowColumns: number = 11;

    @input
    @widget(new SliderWidget(3, 17, 1))
    arrowRows: number = 7;

    @input
    @widget(new SliderWidget(0.02, 0.18, 0.005))
    trailWidth: number = 0.075;

    @input
    @widget(new SliderWidget(0.25, 1.8, 0.025))
    arrowLength: number = 0.95;

    @input
    @widget(new SliderWidget(0.18, 1.2, 0.02))
    metricSampleStep: number = 0.55;

    @input
    @widget(new SliderWidget(0.0, 5.0, 0.1))
    @hint("Field memory: seconds for stirred motion to ease back to rest after you stop. 0 = snap back instantly.")
    flowMemorySeconds: number = 2.0;

    @input
    @widget(new SliderWidget(0.0, 3.0, 0.05))
    @hint("How strongly continued stirring builds up momentum in the field (cumulative energy).")
    flowAccumulation: number = 1.65;

    private backdropVisual: RenderMeshVisual | null = null;
    private gridVisual: RenderMeshVisual | null = null;
    private arrowVisual: RenderMeshVisual | null = null;
    private trailVisual: RenderMeshVisual | null = null;
    private rippleVisual: RenderMeshVisual | null = null;
    private metricStencilVisual: RenderMeshVisual | null = null;
    private metricReadoutPlateVisual: RenderMeshVisual | null = null;
    private metricCursorGizmoVisual: RenderMeshVisual | null = null;

    private backdropMaterial: Material | null = null;
    private gridMaterial: Material | null = null;
    private arrowMaterial: Material | null = null;
    private trailMaterial: Material | null = null;
    private rippleMaterial: Material | null = null;
    private metricStencilMaterial: Material | null = null;
    private metricReadoutPlateMaterial: Material | null = null;
    private metricCursorGizmoMaterial: Material | null = null;

    private tracers: Tracer[] = [];
    private preset: MotionFieldPresetId = "motion";
    private handleX: number = 0.0;
    private handleZ: number = 0.0;
    private prevHandleX: number = 0.0;
    private prevHandleZ: number = 0.0;
    private handleVX: number = 0.0;
    private handleVZ: number = 0.0;
    private driveX: number = 0.0;
    private driveZ: number = 0.0;
    private momentumX: number = 0.0;
    private momentumZ: number = 0.0;
    private driveEnergy: number = 0.35;
    private handleSpeedScalar: number = 0.0;
    private handleActive: boolean = false;
    private metricX: number = 0.0;
    private metricZ: number = 0.0;
    private divergenceText: Text | null = null;
    private curlText: Text | null = null;
    private initialized: boolean = false;
    private dynamicMeshAccumulator: number = 0.0;
    private metricReadoutAccumulator: number = 0.0;
    private interactionRefreshAccumulator: number = 0.0;

    onAwake(): void {
        this.preset = this.presetFromIndex(this.initialPreset);
        this.createApi();
        this.initialize();
        this.createEvent("OnStartEvent").bind(() => {
            this.initialize();
        });
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    public stage(): void {
        this.sceneObject.enabled = true;
        this.initialize();
        this.bindInteractionTargets();
        this.resetField();
    }

    public show(): void {
        this.stage();
    }

    public hide(): void {
        this.sceneObject.enabled = false;
    }

    public resetField(): void {
        this.seedTracers();
        this.dynamicMeshAccumulator = 0.0;
        this.metricReadoutAccumulator = 0.0;
        this.buildDynamicMeshes();
        this.updateMetricReadouts();
    }

    public setFlowSpeedNormalized(value: number): void {
        this.flowSpeed = 0.25 + Math.max(0.0, Math.min(1.0, value)) * 2.75;
    }

    public setPreset(mode: number | string): void {
        const next = this.normalizePreset(mode);
        if (next === this.preset) {
            this.updateMetricReadouts();
            return;
        }
        this.preset = next;
        this.resetField();
        this.updateMetricReadouts();
        print("MotionFieldPlane: preset " + this.preset);
    }

    public setFieldMode(mode: number | string): void {
        this.setPreset(mode);
    }

    public getPreset(): number {
        return this.presetIndex(this.preset);
    }

    private createApi(): void {
        const self = this;
        (this as any).motionFieldApi = {
            stage: () => self.stage(),
            show: () => self.show(),
            hide: () => self.hide(),
            reset: () => self.resetField(),
            resetField: () => self.resetField(),
            setFlowSpeedNormalized: (value: number) => self.setFlowSpeedNormalized(value),
            setPreset: (mode: number | string) => self.setPreset(mode),
            setFieldMode: (mode: number | string) => self.setFieldMode(mode),
            getPreset: () => self.getPreset(),
        };
    }

    private initialize(): void {
        if (this.initialized) return;
        this.ensureVisuals();
        this.bindInteractionTargets();
        this.seedTracers();
        this.updateHandle(1.0 / 60.0);
        this.updateMetricCursor();
        this.updateDetailMaterial();
        this.buildStaticMeshes();
        this.buildDynamicMeshes();
        this.updateMetricReadouts();
        this.initialized = true;
        print("MotionFieldPlane: shader detail + tracer field ready");
    }

    private ensureVisuals(): void {
        this.backdropVisual = this.createVisual("__MotionFieldBackdrop", 26, new vec4(0.50, 0.50, 0.50, 0.88), DETAIL_MATERIAL);
        this.gridVisual = this.createVisual("__MotionFieldGrid", 27, new vec4(0.92, 0.96, 1.0, 0.46));
        this.arrowVisual = this.createVisual("__MotionFieldArrows", 30, new vec4(0.92, 0.96, 1.0, 0.62));
        this.rippleVisual = this.createVisual("__MotionFieldHandleWake", 31, new vec4(1.0, 0.92, 0.88, 0.54));
        this.metricStencilVisual = this.createVisual("__MotionFieldMetricStencil", 32, new vec4(0.96, 0.98, 1.0, 0.64));
        this.metricReadoutPlateVisual = this.createVisual("__MotionFieldMetricReadoutPlate", 90, new vec4(1.0, 1.0, 1.0, 0.24));
        this.metricCursorGizmoVisual = this.createVisual("__MotionFieldCursorGizmo", 34, new vec4(0.96, 0.98, 1.0, 0.92));
        this.clearLegacyTrailMesh();
    }

    private createVisual(name: string, renderOrder: number, color: vec4, materialAsset?: Material): RenderMeshVisual {
        const obj = this.ensureChild(name);
        obj.enabled = true;
        let visual = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (!visual) {
            visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        visual.enabled = true;
        const mat = (materialAsset || LINE_MATERIAL).clone();
        visual.mainMaterial = mat;
        this.setRenderOrder(visual, renderOrder);
        this.setMaterialColor(mat, color);
        if (name.indexOf("Backdrop") >= 0) this.backdropMaterial = mat;
        else if (name.indexOf("Grid") >= 0) this.gridMaterial = mat;
        else if (name.indexOf("Trails") >= 0) this.trailMaterial = mat;
        else if (name.indexOf("Arrows") >= 0) this.arrowMaterial = mat;
        else if (name.indexOf("CursorGizmo") >= 0) this.metricCursorGizmoMaterial = mat;
        else if (name.indexOf("MetricReadoutPlate") >= 0) this.metricReadoutPlateMaterial = mat;
        else if (name.indexOf("Metric") >= 0) this.metricStencilMaterial = mat;
        else this.rippleMaterial = mat;
        return visual;
    }

    private ensureChild(name: string): SceneObject {
        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(this.sceneObject);
        child.getTransform().setLocalPosition(new vec3(0.0, 0.0, 0.0));
        child.getTransform().setLocalRotation(quat.quatIdentity());
        child.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));
        return child;
    }

    private bindInteractionTargets(): void {
        if (!this.interactionObject) {
            const handle = this.findChildByName("Motion Field Handle");
            if (handle) this.interactionObject = handle;
        }
        if (!this.metricCursorObject) {
            const cursor = this.findChildByName("Motion Field Metric Cursor");
            if (cursor) this.metricCursorObject = cursor;
        }
        this.configureInteractionTarget(this.interactionObject);
        this.configureInteractionTarget(this.metricCursorObject);
    }

    private configureInteractionTarget(target: SceneObject | null): void {
        if (!target) return;
        target.enabled = true;

        const colliders = target.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = true;
        }

        const scripts = target.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (!script) continue;
            if (script.name === "Interactable") {
                try { script.enabled = true; } catch (e) {}
                try { script.targetingMode = TargetingMode.All; } catch (e) {}
                try { script.targetingVisual = 1; } catch (e) {}
                try { script.ignoreInteractionPlane = false; } catch (e) {}
                try { script.keepHoverOnTrigger = true; } catch (e) {}
                try { script.enableInstantDrag = true; } catch (e) {}
                try { script.allowMultipleInteractors = true; } catch (e) {}
                try { script.enablePokeDirectionality = false; } catch (e) {}
                try { script.useFilteredPinch = false; } catch (e) {}
            } else if (script.name === "InteractableManipulation" || script.enableTranslation !== undefined || script._enableXTranslation !== undefined) {
                try { script.enabled = true; } catch (e) {}
                try { script.enableTranslation = true; } catch (e) {}
                try { script.enableRotation = false; } catch (e) {}
                try { script.enableScale = false; } catch (e) {}
                try { script._enableXTranslation = true; } catch (e) {}
                try { script._enableYTranslation = true; } catch (e) {}
                try { script._enableZTranslation = true; } catch (e) {}
                try { script.isSynced = false; } catch (e) {}
            }
        }
    }

    private disableChild(name: string): void {
        const child = this.findChildByName(name);
        if (child) child.enabled = false;
    }

    private seedTracers(): void {
        const count = Math.max(24, Math.floor(this.tracerCount));
        const halfW = this.planeWidth * 0.5;
        const halfD = this.planeDepth * 0.5;
        const samples = Math.max(3, Math.floor(this.trailSamples));
        this.tracers = [];
        for (let i = 0; i < count; i++) {
            const u = this.hash01(i * 19.17 + 2.3);
            const v = this.hash01(i * 41.11 + 7.9);
            const t: Tracer = {
                x: -halfW + u * this.planeWidth,
                z: -halfD + v * this.planeDepth,
                trailX: [],
                trailZ: [],
            };
            for (let k = 0; k < samples; k++) {
                t.trailX.push(t.x);
                t.trailZ.push(t.z);
            }
            this.tracers.push(t);
        }
    }

    private tick(): void {
        if (!this.initialized) return;
        const dt = Math.min(0.04, Math.max(0.001, getDeltaTime()));
        this.interactionRefreshAccumulator += dt;
        if (this.interactionRefreshAccumulator >= INTERACTION_REFRESH_SECONDS) {
            this.interactionRefreshAccumulator = 0.0;
            this.bindInteractionTargets();
        }
        this.updateHandle(dt);
        this.updateMetricCursor();
        this.updateDetailMaterial();
        this.dynamicMeshAccumulator += dt;
        if (this.dynamicMeshAccumulator >= 1.0 / DYNAMIC_MESH_FPS) {
            this.dynamicMeshAccumulator = 0.0;
            this.buildDynamicMeshes();
        }
        this.metricReadoutAccumulator += dt;
        if (this.metricReadoutAccumulator >= 1.0 / METRIC_READOUT_FPS) {
            this.metricReadoutAccumulator = 0.0;
            this.updateMetricReadouts();
        }
    }

    private updateHandle(dt: number): void {
        this.prevHandleX = this.handleX;
        this.prevHandleZ = this.handleZ;
        if (this.interactionObject) {
            const inv = this.sceneObject.getTransform().getInvertedWorldTransform();
            const local = inv.multiplyPoint(this.interactionObject.getTransform().getWorldPosition());
            this.handleX = this.clamp(local.x, -this.planeWidth * 0.5, this.planeWidth * 0.5);
            this.handleZ = this.clamp(local.z, -this.planeDepth * 0.5, this.planeDepth * 0.5);
            this.pinInteractionObjectToPlane();
        } else {
            const t = getTime();
            this.handleX = Math.sin(t * 0.43) * this.planeWidth * 0.28;
            this.handleZ = Math.cos(t * 0.31) * this.planeDepth * 0.30;
        }
        this.handleActive = this.preset === "motion";
        const invDt = 1.0 / Math.max(0.001, dt);
        this.handleVX = (this.handleX - this.prevHandleX) * invDt;
        this.handleVZ = (this.handleZ - this.prevHandleZ) * invDt;

        const halfW = Math.max(0.001, this.planeWidth * 0.5);
        const halfD = Math.max(0.001, this.planeDepth * 0.5);
        const handleSpeed = Math.sqrt(this.handleVX * this.handleVX + this.handleVZ * this.handleVZ);
        const velocityFollow = this.clamp(dt * 10.0, 0.0, 1.0);
        this.handleSpeedScalar += (this.clamp(handleSpeed * 0.035, 0.0, 2.2) - this.handleSpeedScalar) * velocityFollow;

        const positionDriveX = this.clamp(this.handleX / halfW, -1.0, 1.0) * 1.55;
        const positionDriveZ = this.clamp(this.handleZ / halfD, -1.0, 1.0) * 1.55;
        const motionDriveX = this.clamp(this.handleVX * 0.16, -3.4, 3.4);
        const motionDriveZ = this.clamp(this.handleVZ * 0.16, -3.4, 3.4);
        // Leaky integrator gives the field memory: stirring accumulates
        // momentum (cumulative energy) that eases back to rest over
        // flowMemorySeconds instead of snapping the instant you stop.
        const memTau = Math.max(0.05, this.flowMemorySeconds);
        const memDecay = Math.exp(-dt / memTau);
        const momCap = 3.8;
        this.momentumX = this.clamp(this.momentumX * memDecay + motionDriveX * this.flowAccumulation * dt, -momCap, momCap);
        this.momentumZ = this.clamp(this.momentumZ * memDecay + motionDriveZ * this.flowAccumulation * dt, -momCap, momCap);
        const targetDriveX = this.clamp(positionDriveX + this.momentumX, -4.2, 4.2);
        const targetDriveZ = this.clamp(positionDriveZ + this.momentumZ, -4.2, 4.2);
        const follow = this.clamp(dt * 12.0, 0.0, 1.0);
        this.driveX += (targetDriveX - this.driveX) * follow;
        this.driveZ += (targetDriveZ - this.driveZ) * follow;
        const targetEnergy = this.clamp(
            0.45 + Math.sqrt(this.driveX * this.driveX + this.driveZ * this.driveZ) * 0.30 + this.handleSpeedScalar * 0.16,
            0.34,
            1.0
        );
        this.driveEnergy += (targetEnergy - this.driveEnergy) * follow;
    }

    private pinInteractionObjectToPlane(): void {
        if (!this.interactionObject) return;
        try {
            const obj = this.interactionObject as any;
            const parent = obj.getParent ? obj.getParent() : null;
            if (parent === this.sceneObject) {
                this.interactionObject.getTransform().setLocalPosition(new vec3(this.handleX, 0.55, this.handleZ));
            }
        } catch (e) {}
    }

    private updateMetricCursor(): void {
        const cursor = this.metricCursorObject || this.findChildByName("Motion Field Metric Cursor");
        const halfW = this.planeWidth * 0.5;
        const halfD = this.planeDepth * 0.5;
        if (cursor) {
            const inv = this.sceneObject.getTransform().getInvertedWorldTransform();
            const local = inv.multiplyPoint(cursor.getTransform().getWorldPosition());
            this.metricX = this.clamp(local.x, -halfW, halfW);
            this.metricZ = this.clamp(local.z, -halfD, halfD);
            try {
                const obj = cursor as any;
                const parent = obj.getParent ? obj.getParent() : null;
                if (parent === this.sceneObject) {
                    cursor.getTransform().setLocalPosition(new vec3(this.metricX, 0.72, this.metricZ));
                }
            } catch (e) {}
        } else if (this.metricX === 0.0 && this.metricZ === 0.0) {
            this.metricX = -halfW * 0.22;
            this.metricZ = 0.0;
        }
    }

    private advectTracers(dt: number): void {
        const halfW = this.planeWidth * 0.5;
        const halfD = this.planeDepth * 0.5;
        const samples = Math.max(3, Math.floor(this.trailSamples));
        const stepScale = 1.55;
        for (let i = 0; i < this.tracers.length; i++) {
            const p = this.tracers[i];
            const f = this.sampleField(p.x, p.z, getTime());
            p.x += f.x * dt * stepScale;
            p.z += f.z * dt * stepScale;
            let wrapped = false;
            if (p.x > halfW) { p.x = -halfW; wrapped = true; }
            if (p.x < -halfW) { p.x = halfW; wrapped = true; }
            if (p.z > halfD) { p.z = -halfD; wrapped = true; }
            if (p.z < -halfD) { p.z = halfD; wrapped = true; }
            if (wrapped) {
                p.trailX = [];
                p.trailZ = [];
                for (let k = 0; k < samples; k++) {
                    p.trailX.push(p.x);
                    p.trailZ.push(p.z);
                }
            } else {
                p.trailX.push(p.x);
                p.trailZ.push(p.z);
                while (p.trailX.length > samples) {
                    p.trailX.shift();
                    p.trailZ.shift();
                }
            }
        }
    }

    private sampleField(x: number, z: number, time: number): FieldSample {
        if (this.preset !== "motion") {
            return this.sampleAnalyticalField(x, z, time);
        }
        return this.sampleMotionField(x, z, time);
    }

    private sampleAnalyticalField(x: number, z: number, time: number): FieldSample {
        const pulse = 0.94 + 0.06 * Math.sin(time * 0.75);
        let vx = x * pulse;
        let vz = z * pulse;
        if (this.preset === "contraction") {
            vx = -x * pulse;
            vz = -z * pulse;
        } else if (this.preset === "curl") {
            vx = -z * pulse;
            vz = x * pulse;
        }
        return { x: vx, z: vz, speed: Math.sqrt(vx * vx + vz * vz) };
    }

    private sampleMotionField(x: number, z: number, time: number): FieldSample {
        let vx = this.flowSpeed;
        let vz = Math.sin(z * 0.55 + time * 0.9) * 0.22 + Math.sin(x * 0.27 + time * 0.42) * 0.12;
        if (this.handleActive) {
            const dx = x - this.handleX;
            const dz = z - this.handleZ;
            const radius = Math.max(0.001, this.gustRadius * (1.0 + this.handleSpeedScalar * 0.08));
            const d2 = dx * dx + dz * dz;
            const falloff = Math.exp(-d2 / (radius * radius * 1.25));
            const len = Math.max(0.001, Math.sqrt(d2));
            const deformation = 1.25 + this.handleSpeedScalar * 0.32;
            const dragX = this.driveX * deformation;
            const dragZ = this.driveZ * deformation;
            vx += dragX * this.gustStrength * falloff;
            vz += dragZ * this.gustStrength * falloff;
            const swirlSign = this.driveZ >= 0.0 ? 1.0 : -1.0;
            const swirl = this.curlStrength * falloff * (0.75 + this.driveEnergy * 1.05 + this.handleSpeedScalar * 0.25) * swirlSign;
            vx += (-dz / len) * swirl;
            vz += (dx / len) * swirl;
        }
        return { x: vx, z: vz, speed: Math.sqrt(vx * vx + vz * vz) };
    }

    private updateDetailMaterial(): void {
        if (!this.backdropMaterial) return;
        const u = this.clamp((this.handleX / Math.max(0.001, this.planeWidth)) + 0.5, 0.0, 1.0);
        const v = this.clamp((this.handleZ / Math.max(0.001, this.planeDepth)) + 0.5, 0.0, 1.0);
        const wake = this.clamp(this.driveEnergy + this.handleSpeedScalar * 0.35, 0.42, 1.0);
        const data = new vec4(u, v, wake, 0.88);
        const pass = this.backdropMaterial.mainPass as any;
        try { pass.FlatColor = data; } catch (e) {}
        try { pass.Port_FlatColor_N000 = data; } catch (e) {}
    }

    private buildStaticMeshes(): void {
        if (this.backdropVisual) {
            const mb = this.makeBuilder();
            const hw = this.planeWidth * 0.5;
            const hd = this.planeDepth * 0.5;
            this.addQuad(mb, -hw, -hd, hw, -hd, hw, hd, -hw, hd, -0.045);
            this.backdropVisual.mesh = mb.getMesh();
            mb.updateMesh();
        }
        if (this.gridVisual) {
            const mb = this.makeBuilder();
            const hw = this.planeWidth * 0.5;
            const hd = this.planeDepth * 0.5;
            const cols = 12;
            const rows = 7;
            for (let i = 0; i <= cols; i++) {
                const x = -hw + this.planeWidth * (i / cols);
                this.addLine(mb, x, -hd, x, hd, 0.052, 0.015);
            }
            for (let i = 0; i <= rows; i++) {
                const z = -hd + this.planeDepth * (i / rows);
                this.addLine(mb, -hw, z, hw, z, 0.052, 0.016);
            }
            this.gridVisual.mesh = mb.getMesh();
            mb.updateMesh();
        }
        this.buildMetricReadoutPlateMesh();
    }

    private buildDynamicMeshes(): void {
        this.clearLegacyTrailMesh();
        this.buildArrowMesh();
        this.buildRippleMesh();
        this.buildMetricStencilMesh();
        this.buildMetricCursorGizmoMesh();
    }

    private buildTrailMesh(): void {
        if (!this.trailVisual) return;
        const mb = this.makeBuilder();
        for (let i = 0; i < this.tracers.length; i++) {
            const p = this.tracers[i];
            for (let k = 1; k < p.trailX.length; k++) {
                this.addLine(mb, p.trailX[k - 1], p.trailZ[k - 1], p.trailX[k], p.trailZ[k], this.trailWidth, 0.052);
            }
        }
        this.trailVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private clearLegacyTrailMesh(): void {
        this.disableChild("__MotionFieldTrails");
        if (!this.trailVisual) return;
        const mb = this.makeBuilder();
        this.trailVisual.enabled = false;
        this.trailVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildArrowMesh(): void {
        if (!this.arrowVisual) return;
        const mb = this.makeBuilder();
        const cols = Math.max(3, Math.floor(this.arrowColumns));
        const rows = Math.max(2, Math.floor(this.arrowRows));
        const hw = this.planeWidth * 0.5;
        const hd = this.planeDepth * 0.5;
        const t = getTime();
        for (let iy = 0; iy < rows; iy++) {
            const z = -hd + this.planeDepth * ((iy + 0.5) / rows);
            for (let ix = 0; ix < cols; ix++) {
                const x = -hw + this.planeWidth * ((ix + 0.5) / cols);
                const f = this.sampleField(x, z, t);
                const velocityStretch = this.handleActive ? this.handleSpeedScalar : 0.0;
                const len = this.arrowLength * this.clamp(1.05 + f.speed * 0.20 + velocityStretch * 0.72, 1.05, 3.25);
                const width = 0.12 * this.clamp(1.0 + velocityStretch * 0.16, 1.0, 1.32);
                this.addArrow(mb, x, z, f.x, f.z, len, width, 0.055);
            }
        }
        this.arrowVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private clearLegacyArrowMesh(): void {
        this.disableChild("__MotionFieldArrows");
        if (!this.arrowVisual) return;
        const mb = this.makeBuilder();
        this.arrowVisual.enabled = false;
        this.arrowVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildRippleMesh(): void {
        if (!this.rippleVisual) return;
        const mb = this.makeBuilder();
        if (!this.handleActive) {
            this.rippleVisual.mesh = mb.getMesh();
            mb.updateMesh();
            return;
        }
        const pulse = 0.5 + 0.5 * Math.sin(getTime() * 5.2);
        const radius = Math.max(0.45, this.gustRadius * (0.42 + pulse * 0.12));
        const segments = 36;
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2.0;
            const a1 = ((i + 1) / segments) * Math.PI * 2.0;
            const x0 = this.handleX + Math.cos(a0) * radius;
            const z0 = this.handleZ + Math.sin(a0) * radius;
            const x1 = this.handleX + Math.cos(a1) * radius;
            const z1 = this.handleZ + Math.sin(a1) * radius;
            this.addLine(mb, x0, z0, x1, z1, 0.045, 0.085);
        }
        this.rippleVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildMetricStencilMesh(): void {
        if (!this.metricStencilVisual) return;
        const mb = this.makeBuilder();
        const x = this.metricX;
        const z = this.metricZ;
        const half = this.clamp(this.metricSampleStep * 0.62, 0.32, 0.52);
        this.addBoxFrame(mb, x, z, half, half, 0.024, 0.135);
        this.addLine(mb, x - half * 0.52, z, x + half * 0.52, z, 0.014, 0.14);
        this.addLine(mb, x, z - half * 0.52, x, z + half * 0.52, 0.014, 0.14);

        this.metricStencilVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildMetricCursorGizmoMesh(): void {
        if (!this.metricCursorGizmoVisual) return;
        const mb = this.makeBuilder();
        const x = this.metricX;
        const z = this.metricZ;
        const inner = 0.24;
        const half = 0.58;
        const outer = 0.86;
        this.addBoxFrame(mb, x, z, half, half, 0.044, 0.225);
        this.addLine(mb, x - outer, z, x - inner, z, 0.038, 0.24);
        this.addLine(mb, x + inner, z, x + outer, z, 0.038, 0.24);
        this.addLine(mb, x, z - outer, x, z - inner, 0.038, 0.24);
        this.addLine(mb, x, z + inner, x, z + outer, 0.038, 0.24);
        this.addSolidBox(mb, x, z, 0.10, 0.10, 0.258);
        this.metricCursorGizmoVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildMetricReadoutPlateMesh(): void {
        if (!this.metricReadoutPlateVisual) return;
        const mb = this.makeBuilder();
        const z = -this.planeDepth * 0.66;
        const leftX = -this.planeWidth * 0.34;
        const rightX = this.planeWidth * 0.30;
        this.addSolidBox(mb, leftX, z, 6.30, 1.08, 0.30);
        this.addSolidBox(mb, rightX, z, 6.30, 1.08, 0.30);
        this.addBoxFrame(mb, leftX, z, 6.30, 1.08, 0.035, 0.36);
        this.addBoxFrame(mb, rightX, z, 6.30, 1.08, 0.035, 0.36);
        this.metricReadoutPlateVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private updateMetricReadouts(): void {
        const metrics = this.measureAt(this.metricX, this.metricZ);
        const metricZ = -this.planeDepth * 0.66;
        this.divergenceText = this.configureText(
            "__MotionFieldDivergenceReadout",
            "DIV  " + this.formatSigned(metrics.divergence),
            new vec3(-this.planeWidth * 0.34, 0.70, metricZ),
            METRIC_READOUT_SIZE,
            new vec4(1.0, 1.0, 1.0, 1.0)
        );
        this.curlText = this.configureText(
            "__MotionFieldCurlReadout",
            "CURL  " + this.formatSigned(metrics.curl),
            new vec3(this.planeWidth * 0.30, 0.70, metricZ),
            METRIC_READOUT_SIZE,
            new vec4(1.0, 1.0, 1.0, 1.0)
        );
    }

    private configureText(name: string, value: string, localPosition: vec3, size: number, color: vec4): Text {
        const object = this.ensureChild(name);
        object.getTransform().setLocalPosition(localPosition);
        object.getTransform().setLocalRotation(quat.angleAxis(-Math.PI * 0.5, new vec3(1.0, 0.0, 0.0)));
        object.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));

        let text = object.getComponent("Component.Text") as Text;
        if (!text) {
            text = object.createComponent("Component.Text") as Text;
        }
        text.text = value;
        text.font = GUIDE_FONT;
        text.size = size;
        text.horizontalAlignment = HorizontalAlignment.Center;
        text.verticalAlignment = VerticalAlignment.Center;
        text.horizontalOverflow = HorizontalOverflow.Wrap;
        text.verticalOverflow = VerticalOverflow.Overflow;
        text.worldSpaceRect = Rect.create(-5.7, 5.7, -0.86, 0.86);
        text.depthTest = false;
        text.twoSided = true;
        try { text.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        text.renderOrder = METRIC_READOUT_ORDER;
        try {
            text.textFill.color = color;
        } catch (e) {}
        return text;
    }

    private measureAt(x: number, z: number): FieldMetrics {
        const eps = Math.max(0.1, this.metricSampleStep);
        const t = getTime();
        const fxPlus = this.sampleField(x + eps, z, t);
        const fxMinus = this.sampleField(x - eps, z, t);
        const fzPlus = this.sampleField(x, z + eps, t);
        const fzMinus = this.sampleField(x, z - eps, t);
        return {
            divergence: ((fxPlus.x - fxMinus.x) + (fzPlus.z - fzMinus.z)) / (2.0 * eps),
            curl: ((fxPlus.z - fxMinus.z) - (fzPlus.x - fzMinus.x)) / (2.0 * eps),
        };
    }

    private addRing(mb: MeshBuilder, cx: number, cz: number, radius: number, width: number, y: number, segments: number): void {
        const count = Math.max(8, Math.floor(segments));
        for (let i = 0; i < count; i++) {
            const a0 = (i / count) * Math.PI * 2.0;
            const a1 = ((i + 1) / count) * Math.PI * 2.0;
            this.addLine(
                mb,
                cx + Math.cos(a0) * radius,
                cz + Math.sin(a0) * radius,
                cx + Math.cos(a1) * radius,
                cz + Math.sin(a1) * radius,
                width,
                y
            );
        }
    }

    private addDiamondFrame(mb: MeshBuilder, cx: number, cz: number, radius: number, width: number, y: number): void {
        this.addLine(mb, cx, cz + radius, cx + radius, cz, width, y);
        this.addLine(mb, cx + radius, cz, cx, cz - radius, width, y);
        this.addLine(mb, cx, cz - radius, cx - radius, cz, width, y);
        this.addLine(mb, cx - radius, cz, cx, cz + radius, width, y);
    }

    private addBoxFrame(mb: MeshBuilder, cx: number, cz: number, halfX: number, halfZ: number, width: number, y: number): void {
        this.addLine(mb, cx - halfX, cz - halfZ, cx + halfX, cz - halfZ, width, y);
        this.addLine(mb, cx + halfX, cz - halfZ, cx + halfX, cz + halfZ, width, y);
        this.addLine(mb, cx + halfX, cz + halfZ, cx - halfX, cz + halfZ, width, y);
        this.addLine(mb, cx - halfX, cz + halfZ, cx - halfX, cz - halfZ, width, y);
    }

    private addSolidBox(mb: MeshBuilder, cx: number, cz: number, halfX: number, halfZ: number, y: number): void {
        const base = mb.getVerticesCount();
        this.addVertex(mb, cx - halfX, y, cz - halfZ, 0.5, 0.5);
        this.addVertex(mb, cx + halfX, y, cz - halfZ, 0.5, 0.5);
        this.addVertex(mb, cx + halfX, y, cz + halfZ, 0.5, 0.5);
        this.addVertex(mb, cx - halfX, y, cz + halfZ, 0.5, 0.5);
        mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    private addArrow(mb: MeshBuilder, x: number, z: number, vx: number, vz: number, length: number, width: number, y: number): void {
        const mag = Math.max(0.001, Math.sqrt(vx * vx + vz * vz));
        const dx = vx / mag;
        const dz = vz / mag;
        const sx = x - dx * length * 0.42;
        const sz = z - dz * length * 0.42;
        const ex = x + dx * length * 0.34;
        const ez = z + dz * length * 0.34;
        this.addLine(mb, sx, sz, ex, ez, width, y);

        const px = -dz;
        const pz = dx;
        const head = length * 0.36;
        const hw = width * 2.1 * LINE_WIDTH_SCALE;
        const tipX = x + dx * length * 0.55;
        const tipZ = z + dz * length * 0.55;
        const baseX = tipX - dx * head;
        const baseZ = tipZ - dz * head;
        const base = mb.getVerticesCount();
        this.addVertex(mb, tipX, y, tipZ, 0.5, 0.5);
        this.addVertex(mb, baseX + px * hw, y, baseZ + pz * hw, 0.0, 0.0);
        this.addVertex(mb, baseX - px * hw, y, baseZ - pz * hw, 1.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2]);
    }

    private addLine(mb: MeshBuilder, x0: number, z0: number, x1: number, z1: number, width: number, y: number): void {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.max(0.0001, Math.sqrt(dx * dx + dz * dz));
        const px = -dz / len * width * LINE_WIDTH_SCALE * 0.5;
        const pz = dx / len * width * LINE_WIDTH_SCALE * 0.5;
        const base = mb.getVerticesCount();
        this.addVertex(mb, x0 + px, y, z0 + pz, 0.0, 0.0);
        this.addVertex(mb, x0 - px, y, z0 - pz, 0.0, 1.0);
        this.addVertex(mb, x1 + px, y, z1 + pz, 1.0, 0.0);
        this.addVertex(mb, x1 - px, y, z1 - pz, 1.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2, base + 2, base + 1, base + 3]);
    }

    private addQuad(mb: MeshBuilder, x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, y: number): void {
        const base = mb.getVerticesCount();
        this.addVertex(mb, x0, y, z0, 0.0, 0.0);
        this.addVertex(mb, x1, y, z1, 1.0, 0.0);
        this.addVertex(mb, x2, y, z2, 1.0, 1.0);
        this.addVertex(mb, x3, y, z3, 0.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    private addVertex(mb: MeshBuilder, x: number, y: number, z: number, u: number, v: number): void {
        mb.appendVerticesInterleaved([x, y, z, 0.0, 1.0, 0.0, u, v]);
    }

    private makeBuilder(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;
        return mb;
    }

    private setMaterialColor(material: Material | null, color: vec4): void {
        if (!material) return;
        const pass = material.mainPass as any;
        const rgb = new vec3(color.x, color.y, color.z);
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.baseColorFactor = color; } catch (e) {}
        try { pass.color = color; } catch (e) {}
        try { pass.Port_FinalColor_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor1_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor2_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor3_N004 = color; } catch (e) {}
        try { pass.Port_FlatColor_N000 = color; } catch (e) {}
        try { pass.Port_Albedo_N405 = rgb; } catch (e) {}
        try { pass.Port_Emissive_N405 = new vec3(color.x * 0.25, color.y * 0.25, color.z * 0.25); } catch (e) {}
        try { pass.Port_Opacity_N405 = color.w; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.Opacity = color.w; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
    }

    private setRenderOrder(visual: RenderMeshVisual, renderOrder: number): void {
        const v = visual as any;
        try { v.renderOrder = renderOrder; } catch (e) {}
        try { v.RenderOrder = renderOrder; } catch (e) {}
        try {
            if (typeof v.setRenderOrder === "function") v.setRenderOrder(renderOrder);
        } catch (e) {}
    }

    private normalizePreset(mode: number | string): MotionFieldPresetId {
        if (typeof mode === "string") {
            const key = mode.toLowerCase();
            if (key === "rotation" || key === "vortex") return "curl";
            if (key === "expansion" || key === "contraction" || key === "curl" || key === "motion") {
                return key as MotionFieldPresetId;
            }
            return "motion";
        }
        return this.presetFromIndex(mode);
    }

    private presetFromIndex(index: number): MotionFieldPresetId {
        const safe = Math.floor(index);
        if (safe === 0) return "expansion";
        if (safe === 1) return "contraction";
        if (safe === 2) return "curl";
        return "motion";
    }

    private presetIndex(mode: MotionFieldPresetId): number {
        if (mode === "expansion") return 0;
        if (mode === "contraction") return 1;
        if (mode === "curl") return 2;
        return 3;
    }

    private formatSigned(value: number): string {
        const rounded = Math.abs(value) < 0.005 ? 0.0 : value;
        return (rounded >= 0.0 ? "+" : "") + rounded.toFixed(2);
    }

    private capitalize(value: string): string {
        return value.length > 0 ? value.charAt(0).toUpperCase() + value.substr(1) : value;
    }

    private findChildByName(name: string): SceneObject | null {
        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            if (child.name === name) return child;
        }
        return null;
    }

    private hash01(value: number): number {
        const n = Math.sin(value * 12.9898) * 43758.5453;
        return n - Math.floor(n);
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.max(minValue, Math.min(maxValue, value));
    }

    private smoothstep(edge0: number, edge1: number, value: number): number {
        const t = this.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }
}
