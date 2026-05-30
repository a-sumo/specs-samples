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
    @widget(new SliderWidget(6.0, 72.0, 0.5))
    @hint("Plane width/depth in cm.")
    planeSize: number = 56.0;

    @input
    @widget(new SliderWidget(24, 192, 4))
    @hint("Vertices per side of the plane mesh. Higher = smoother well and contours; 96 is a safe Spectacles default.")
    resolution: number = 128;

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
    opacityScale: number = 0.92;

    @input
    @hint("Low-potential heatmap color (far from masses).")
    @widget(new ColorWidget())
    colorLow: vec4 = new vec4(0.12, 0.36, 1.0, 1.0);

    @input
    @hint("High-potential heatmap color (near masses).")
    @widget(new ColorWidget())
    colorHigh: vec4 = new vec4(1.0, 0.08, 0.10, 1.0);

    @input
    @hint("Contour ring color (alpha controls strength).")
    @widget(new ColorWidget())
    contourColor: vec4 = new vec4(1.0, 0.16, 0.22, 0.98);

    @input
    @hint("Tint applied where Earth dominates the field.")
    @widget(new ColorWidget())
    earthTint: vec4 = new vec4(1.0, 0.28, 0.22, 1.0);

    @input
    @hint("Tint applied where the Moon dominates the field.")
    @widget(new ColorWidget())
    moonTint: vec4 = new vec4(0.22, 0.60, 1.0, 1.0);

    @input
    @hint("Field-line overlay color.")
    @widget(new ColorWidget())
    fieldLineColor: vec4 = new vec4(0.30, 0.62, 1.0, 0.78);

    @input
    @hint("Arrow overlay color.")
    @widget(new ColorWidget())
    arrowColor: vec4 = new vec4(1.0, 0.90, 0.96, 0.70);

    @input
    @widget(new SliderWidget(0.1, 2.5, 0.05))
    @hint("Field line density in local plane space.")
    fieldLineDensity: number = 0.82;

    @input
    @widget(new SliderWidget(0.01, 0.25, 0.005))
    @hint("Field line width relative to spacing.")
    fieldLineWidth: number = 0.065;

    @input
    @widget(new SliderWidget(1.2, 9.0, 0.1))
    @hint("Spacing between shader-drawn arrows.")
    arrowSpacing: number = 6.4;

    @input
    @widget(new SliderWidget(0.08, 1.1, 0.05))
    @hint("Size of each shader-drawn arrow within its grid cell.")
    arrowScale: number = 0.34;

    private visual: RenderMeshVisual | null = null;
    private materialInstance: Material | null = null;
    private earthBasePos: vec3 = new vec3(-4.2, 0.82, 0.0);
    private moonBasePos: vec3 = new vec3(5.1, 0.42, 0.0);
    private builtPlaneSize: number = -1.0;
    private builtResolution: number = -1;

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

        if (!this.visual) {
            this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        this.visual.mesh = mb.getMesh();
        this.visual.mainMaterial = this.materialInstance!;
        mb.updateMesh();
        this.builtPlaneSize = this.planeSize;
        this.builtResolution = res;
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
        pass.FieldLineColor = this.fieldLineColor;
        pass.ArrowColor = this.arrowColor;
        pass.FieldLineDensity = this.fieldLineDensity;
        pass.FieldLineWidth = this.fieldLineWidth;
        pass.ArrowSpacing = this.arrowSpacing;
        pass.ArrowScale = this.arrowScale;
    }

    private updateUniforms(): void {
        if (!this.materialInstance) return;
        this.rebuildMeshIfNeeded();
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
        pass.FieldLineColor = this.fieldLineColor;
        pass.ArrowColor = this.arrowColor;
        pass.FieldLineDensity = this.fieldLineDensity;
        pass.FieldLineWidth = this.fieldLineWidth;
        pass.ArrowSpacing = this.arrowSpacing;
        pass.ArrowScale = this.arrowScale;
    }

    private rebuildMeshIfNeeded(): void {
        const res = Math.max(8, Math.floor(this.resolution));
        const sizeChanged = Math.abs(this.planeSize - this.builtPlaneSize) > 0.001;
        if (sizeChanged || res !== this.builtResolution) {
            this.buildMesh();
        }
    }
}
