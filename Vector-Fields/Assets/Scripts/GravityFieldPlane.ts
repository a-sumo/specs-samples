// GravityFieldPlane.ts
// GPU-driven gravity field on a flat XZ plane.
//
// Builds one dense plane mesh at startup and pushes the live Earth/Moon
// positions into shader uniforms each frame. No CPU rebuilds. The vertex
// shader displaces Y by the gravitational potential to produce the well
// shape, draws iso-potential contours, and animates flow stripes along the
// field direction.

@component
export class GravityFieldPlane extends BaseScriptComponent {

    @input
    @allowUndefined
    @hint("Earth SceneObject. The script reads its world position into the EarthPos uniform.")
    earthObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Moon SceneObject. The script reads its world position into the MoonPos uniform.")
    moonObject: SceneObject = null as any;

    @input
    @hint("Material instanced from GravityFieldPlane.mat. The script clones it so multiple plane instances stay independent.")
    planeMaterial: Material = null as any;

    @input
    @widget(new SliderWidget(6.0, 30.0, 0.5))
    @hint("Plane width/depth in cm.")
    planeSize: number = 18.0;

    @input
    @widget(new SliderWidget(24, 192, 4))
    @hint("Vertices per side of the plane mesh. Higher = smoother well and contours; 96 is a safe Spectacles default.")
    resolution: number = 96;

    @input
    @widget(new SliderWidget(1.0, 30.0, 0.5))
    @hint("Earth mass (relative units).")
    earthMass: number = 18.0;

    @input
    @widget(new SliderWidget(0.25, 8.0, 0.25))
    @hint("Moon mass multiplier vs. real Earth/Moon ratio.")
    moonMass: number = 2.0;

    @input
    @widget(new SliderWidget(0.05, 1.5, 0.05))
    @hint("Softening radius. Caps the 1/r singularity at body centers.")
    softening: number = 0.35;

    @input
    @widget(new SliderWidget(0.05, 4.0, 0.05))
    @hint("Vertical scale of the gravity well displacement.")
    wellDepth: number = 1.0;

    @input
    @widget(new SliderWidget(0.01, 0.5, 0.01))
    @hint("Multiplier inside the shader; tune with wellDepth for the visual look.")
    depthScale: number = 0.18;

    @input
    @widget(new SliderWidget(2.0, 24.0, 0.5))
    @hint("Number of iso-potential contour rings drawn across the plane.")
    contourCount: number = 9.0;

    @input
    @widget(new SliderWidget(0.0, 0.5, 0.01))
    @hint("Contour line half-width (relative to ring spacing).")
    contourThickness: number = 0.18;

    @input
    @widget(new SliderWidget(0.0, 4.0, 0.05))
    @hint("Animation speed for the flow stripes along the field direction.")
    flowSpeed: number = 0.6;

    @input
    @widget(new SliderWidget(0.2, 8.0, 0.1))
    @hint("Spatial frequency of the flow stripes.")
    flowScale: number = 1.6;

    @input
    @hint("Overall plane opacity scale.")
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    opacityScale: number = 0.85;

    @input
    @hint("Low-potential heatmap color (far from masses).")
    @widget(new ColorWidget())
    colorLow: vec4 = new vec4(0.05, 0.07, 0.18, 1.0);

    @input
    @hint("High-potential heatmap color (near masses).")
    @widget(new ColorWidget())
    colorHigh: vec4 = new vec4(1.0, 0.55, 0.20, 1.0);

    @input
    @hint("Contour ring color (alpha controls strength).")
    @widget(new ColorWidget())
    contourColor: vec4 = new vec4(0.95, 0.30, 0.30, 0.85);

    @input
    @hint("Tint applied where Earth dominates the field.")
    @widget(new ColorWidget())
    earthTint: vec4 = new vec4(0.62, 0.85, 1.0, 1.0);

    @input
    @hint("Tint applied where the Moon dominates the field.")
    @widget(new ColorWidget())
    moonTint: vec4 = new vec4(1.0, 0.95, 0.78, 1.0);

    private visual: RenderMeshVisual | null = null;
    private materialInstance: Material | null = null;
    private earthBasePos: vec3 = new vec3(-4.2, 0.82, 0.0);
    private moonBasePos: vec3 = new vec3(5.1, 0.42, 0.0);

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.initialize());
        this.createEvent("UpdateEvent").bind(() => this.updateUniforms());
    }

    private initialize(): void {
        if (!this.planeMaterial) {
            print("GravityFieldPlane: planeMaterial not assigned");
            return;
        }
        this.materialInstance = (this.planeMaterial as any).clone() as Material;
        this.buildMesh();
        this.applyStaticUniforms();
        this.updateUniforms();
    }

    private buildMesh(): void {
        const res = Math.max(8, Math.floor(this.resolution));
        const half = this.planeSize * 0.5;
        const step = this.planeSize / (res - 1);

        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;

        const verts: number[] = new Array(res * res * 8);
        let vi = 0;
        for (let iz = 0; iz < res; iz++) {
            const z = -half + iz * step;
            const v = iz / (res - 1);
            for (let ix = 0; ix < res; ix++) {
                const x = -half + ix * step;
                const u = ix / (res - 1);
                verts[vi++] = x;       // px
                verts[vi++] = 0.0;     // py — shader rewrites this
                verts[vi++] = z;       // pz
                verts[vi++] = 0.0;     // nx
                verts[vi++] = 1.0;     // ny
                verts[vi++] = 0.0;     // nz
                verts[vi++] = u;
                verts[vi++] = v;
            }
        }
        mb.appendVerticesInterleaved(verts);

        const inds: number[] = new Array((res - 1) * (res - 1) * 6);
        let ii = 0;
        for (let iz = 0; iz < res - 1; iz++) {
            const rowA = iz * res;
            const rowB = rowA + res;
            for (let ix = 0; ix < res - 1; ix++) {
                const a = rowA + ix;
                const b = a + 1;
                const c = rowB + ix;
                const d = c + 1;
                inds[ii++] = a; inds[ii++] = c; inds[ii++] = b;
                inds[ii++] = b; inds[ii++] = c; inds[ii++] = d;
            }
        }
        mb.appendIndices(inds);

        this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.visual.mesh = mb.getMesh();
        this.visual.mainMaterial = this.materialInstance!;
        mb.updateMesh();
    }

    private applyStaticUniforms(): void {
        if (!this.materialInstance) return;
        const pass = this.materialInstance.mainPass as any;
        pass.EarthMass = this.earthMass;
        pass.MoonMass = Math.max(0.001, this.earthMass * 0.0123 * this.moonMass);
        pass.Softening = this.softening;
        pass.WellDepth = this.wellDepth;
        pass.DepthScale = this.depthScale;
        pass.ContourCount = this.contourCount;
        pass.ContourThickness = this.contourThickness;
        pass.FlowSpeed = this.flowSpeed;
        pass.FlowScale = this.flowScale;
        pass.OpacityScale = this.opacityScale;
        pass.ContourColor = this.contourColor;
        pass.ColorLow = this.colorLow;
        pass.ColorHigh = this.colorHigh;
        pass.EarthTint = this.earthTint;
        pass.MoonTint = this.moonTint;
    }

    private updateUniforms(): void {
        if (!this.materialInstance) return;
        const pass = this.materialInstance.mainPass as any;

        // Push live body positions, expressed in the plane SceneObject's local space.
        const inv = this.sceneObject.getTransform().getInvertedWorldTransform();
        const earthLocal = this.earthObject
            ? inv.multiplyPoint(this.earthObject.getTransform().getWorldPosition())
            : this.earthBasePos;
        const moonLocal = this.moonObject
            ? inv.multiplyPoint(this.moonObject.getTransform().getWorldPosition())
            : this.moonBasePos;

        pass.EarthPos = earthLocal;
        pass.MoonPos = moonLocal;

        // Inspector tweaks should still take effect at runtime without a reload.
        pass.EarthMass = this.earthMass;
        pass.MoonMass = Math.max(0.001, this.earthMass * 0.0123 * this.moonMass);
        pass.Softening = this.softening;
        pass.WellDepth = this.wellDepth;
        pass.DepthScale = this.depthScale;
        pass.ContourCount = this.contourCount;
        pass.ContourThickness = this.contourThickness;
        pass.FlowSpeed = this.flowSpeed;
        pass.FlowScale = this.flowScale;
        pass.OpacityScale = this.opacityScale;
    }
}
