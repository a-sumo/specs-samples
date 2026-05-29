// MotionFieldPlane.ts
// A first, concrete vector-field layer: a flat advection field that can be
// stirred by moving a handle through it. Built with MeshBuilder so it avoids
// fragile shader-graph wiring during UX iteration.

type FieldSample = {
    x: number;
    z: number;
    speed: number;
};

type Tracer = {
    x: number;
    z: number;
    trailX: number[];
    trailZ: number[];
};

const BASE_MATERIAL: Material = requireAsset("../Materials/FlatMaterial.mat") as Material;
const DETAIL_MATERIAL: Material = requireAsset("../Materials/MotionFieldDetail.mat") as Material;

@component
export class MotionFieldPlane extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Optional draggable handle. Its local X/Z position creates a moving gust in the field.")
    interactionObject: SceneObject = null as any;

    @input
    @widget(new SliderWidget(8.0, 34.0, 0.5))
    planeWidth: number = 24.0;

    @input
    @widget(new SliderWidget(5.0, 22.0, 0.5))
    planeDepth: number = 14.0;

    @input
    @widget(new SliderWidget(30, 220, 5))
    tracerCount: number = 132;

    @input
    @widget(new SliderWidget(4, 18, 1))
    trailSamples: number = 10;

    @input
    @widget(new SliderWidget(0.2, 4.0, 0.05))
    flowSpeed: number = 1.15;

    @input
    @widget(new SliderWidget(0.0, 3.0, 0.05))
    gustStrength: number = 1.25;

    @input
    @widget(new SliderWidget(1.0, 8.0, 0.25))
    gustRadius: number = 3.2;

    @input
    @widget(new SliderWidget(0.0, 3.0, 0.05))
    curlStrength: number = 0.85;

    @input
    @widget(new SliderWidget(5, 17, 1))
    arrowColumns: number = 11;

    @input
    @widget(new SliderWidget(3, 11, 1))
    arrowRows: number = 7;

    @input
    @widget(new SliderWidget(0.02, 0.18, 0.005))
    trailWidth: number = 0.075;

    @input
    @widget(new SliderWidget(0.15, 0.8, 0.025))
    arrowLength: number = 0.42;

    private backdropVisual: RenderMeshVisual | null = null;
    private gridVisual: RenderMeshVisual | null = null;
    private arrowVisual: RenderMeshVisual | null = null;
    private trailVisual: RenderMeshVisual | null = null;
    private rippleVisual: RenderMeshVisual | null = null;

    private backdropMaterial: Material | null = null;
    private gridMaterial: Material | null = null;
    private arrowMaterial: Material | null = null;
    private trailMaterial: Material | null = null;
    private rippleMaterial: Material | null = null;

    private tracers: Tracer[] = [];
    private handleX: number = 0.0;
    private handleZ: number = 0.0;
    private prevHandleX: number = 0.0;
    private prevHandleZ: number = 0.0;
    private handleVX: number = 0.0;
    private handleVZ: number = 0.0;
    private driveX: number = 0.0;
    private driveZ: number = 0.0;
    private driveEnergy: number = 0.35;
    private handleActive: boolean = false;
    private initialized: boolean = false;

    onAwake(): void {
        this.initialize();
        this.createEvent("OnStartEvent").bind(() => this.initialize());
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    resetField(): void {
        this.seedTracers();
        this.buildDynamicMeshes();
    }

    setFlowSpeedNormalized(value: number): void {
        this.flowSpeed = 0.25 + Math.max(0.0, Math.min(1.0, value)) * 2.75;
    }

    private initialize(): void {
        if (this.initialized) return;
        this.ensureVisuals();
        this.seedTracers();
        this.updateHandle(1.0 / 60.0);
        this.updateDetailMaterial();
        this.buildStaticMeshes();
        this.buildDynamicMeshes();
        this.initialized = true;
        print("MotionFieldPlane: shader detail + tracer field ready");
    }

    private ensureVisuals(): void {
        this.backdropVisual = this.createVisual("__MotionFieldBackdrop", 26, new vec4(0.50, 0.50, 0.50, 0.88), DETAIL_MATERIAL);
        this.gridVisual = this.createVisual("__MotionFieldGrid", 27, new vec4(0.90, 0.90, 0.86, 0.32));
        this.trailVisual = this.createVisual("__MotionFieldTrails", 29, new vec4(1.0, 0.97, 0.90, 0.82));
        this.arrowVisual = this.createVisual("__MotionFieldArrows", 30, new vec4(1.0, 0.99, 0.94, 0.95));
        this.rippleVisual = this.createVisual("__MotionFieldHandleWake", 31, new vec4(1.0, 0.92, 0.88, 0.68));
    }

    private createVisual(name: string, renderOrder: number, color: vec4, materialAsset?: Material): RenderMeshVisual {
        const obj = this.ensureChild(name);
        let visual = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (!visual) {
            visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        const mat = (materialAsset || BASE_MATERIAL).clone();
        visual.mainMaterial = mat;
        this.setRenderOrder(visual, renderOrder);
        this.setMaterialColor(mat, color);
        if (name.indexOf("Backdrop") >= 0) this.backdropMaterial = mat;
        else if (name.indexOf("Grid") >= 0) this.gridMaterial = mat;
        else if (name.indexOf("Trails") >= 0) this.trailMaterial = mat;
        else if (name.indexOf("Arrows") >= 0) this.arrowMaterial = mat;
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
        this.updateHandle(dt);
        this.updateDetailMaterial();
        this.advectTracers(dt);
        this.buildDynamicMeshes();
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
            this.handleActive = true;
        } else {
            const t = getTime();
            this.handleX = Math.sin(t * 0.43) * this.planeWidth * 0.28;
            this.handleZ = Math.cos(t * 0.31) * this.planeDepth * 0.30;
            this.handleActive = true;
        }
        const invDt = 1.0 / Math.max(0.001, dt);
        this.handleVX = (this.handleX - this.prevHandleX) * invDt;
        this.handleVZ = (this.handleZ - this.prevHandleZ) * invDt;

        const halfW = Math.max(0.001, this.planeWidth * 0.5);
        const halfD = Math.max(0.001, this.planeDepth * 0.5);
        const positionDriveX = this.clamp(this.handleX / halfW, -1.0, 1.0) * 1.28;
        const positionDriveZ = this.clamp(this.handleZ / halfD, -1.0, 1.0) * 1.28;
        const motionDriveX = this.clamp(this.handleVX * 0.11, -2.2, 2.2);
        const motionDriveZ = this.clamp(this.handleVZ * 0.11, -2.2, 2.2);
        const targetDriveX = this.clamp(positionDriveX + motionDriveX, -2.8, 2.8);
        const targetDriveZ = this.clamp(positionDriveZ + motionDriveZ, -2.8, 2.8);
        const follow = this.clamp(dt * 12.0, 0.0, 1.0);
        this.driveX += (targetDriveX - this.driveX) * follow;
        this.driveZ += (targetDriveZ - this.driveZ) * follow;
        const targetEnergy = this.clamp(
            0.38 + Math.sqrt(this.driveX * this.driveX + this.driveZ * this.driveZ) * 0.22,
            0.28,
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
        let vx = this.flowSpeed;
        let vz = Math.sin(z * 0.55 + time * 0.9) * 0.22 + Math.sin(x * 0.27 + time * 0.42) * 0.12;
        if (this.handleActive) {
            const dx = x - this.handleX;
            const dz = z - this.handleZ;
            const radius = Math.max(0.001, this.gustRadius);
            const d2 = dx * dx + dz * dz;
            const falloff = Math.exp(-d2 / (radius * radius));
            const len = Math.max(0.001, Math.sqrt(d2));
            const dragX = this.driveX;
            const dragZ = this.driveZ;
            vx += dragX * this.gustStrength * falloff;
            vz += dragZ * this.gustStrength * falloff;
            const swirlSign = this.driveZ >= 0.0 ? 1.0 : -1.0;
            vx += (-dz / len) * this.curlStrength * falloff * (0.55 + this.driveEnergy * 0.65) * swirlSign;
            vz += (dx / len) * this.curlStrength * falloff * (0.55 + this.driveEnergy * 0.65) * swirlSign;
        }
        return { x: vx, z: vz, speed: Math.sqrt(vx * vx + vz * vz) };
    }

    private updateDetailMaterial(): void {
        if (!this.backdropMaterial) return;
        const u = this.clamp((this.handleX / Math.max(0.001, this.planeWidth)) + 0.5, 0.0, 1.0);
        const v = this.clamp((this.handleZ / Math.max(0.001, this.planeDepth)) + 0.5, 0.0, 1.0);
        const handleSpeed = Math.sqrt(this.handleVX * this.handleVX + this.handleVZ * this.handleVZ);
        const wake = this.clamp(this.driveEnergy + handleSpeed * 0.018, 0.28, 1.0);
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
                this.addLine(mb, x, -hd, x, hd, 0.025, 0.015);
            }
            for (let i = 0; i <= rows; i++) {
                const z = -hd + this.planeDepth * (i / rows);
                this.addLine(mb, -hw, z, hw, z, 0.025, 0.016);
            }
            this.gridVisual.mesh = mb.getMesh();
            mb.updateMesh();
        }
    }

    private buildDynamicMeshes(): void {
        this.buildTrailMesh();
        this.buildArrowMesh();
        this.buildRippleMesh();
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
                const len = this.arrowLength * this.clamp(0.65 + f.speed * 0.22, 0.65, 1.45);
                this.addArrow(mb, x, z, f.x, f.z, len, 0.075, 0.055);
            }
        }
        this.arrowVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private buildRippleMesh(): void {
        if (!this.rippleVisual || !this.handleActive) return;
        const mb = this.makeBuilder();
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
        const hw = width * 2.1;
        const tipX = x + dx * length * 0.55;
        const tipZ = z + dz * length * 0.55;
        const baseX = tipX - dx * head;
        const baseZ = tipZ - dz * head;
        const base = mb.getVerticesCount();
        this.addVertex(mb, tipX, y, tipZ, 0.5, 1.0);
        this.addVertex(mb, baseX + px * hw, y, baseZ + pz * hw, 0.0, 0.0);
        this.addVertex(mb, baseX - px * hw, y, baseZ - pz * hw, 1.0, 0.0);
        mb.appendIndices([base, base + 1, base + 2]);
    }

    private addLine(mb: MeshBuilder, x0: number, z0: number, x1: number, z1: number, width: number, y: number): void {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.max(0.0001, Math.sqrt(dx * dx + dz * dz));
        const px = -dz / len * width * 0.5;
        const pz = dx / len * width * 0.5;
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

    private hash01(value: number): number {
        const n = Math.sin(value * 12.9898) * 43758.5453;
        return n - Math.floor(n);
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.max(minValue, Math.min(maxValue, value));
    }
}
