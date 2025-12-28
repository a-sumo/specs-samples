/**
 * SingleColorMarker.ts
 *
 * Displays a single color as a voxel that moves through color spaces.
 * Uses the same material as RGBCubeGenerator (ColorSpaceTransform shader).
 * The marker's displayed color automatically matches its RGB position.
 *
 * Connect H, S, V sliders from Spectacles UI Kit to setH(), setS(), setV()
 * or use setHSV() to set all at once.
 */
@component
export class SingleColorMarker extends BaseScriptComponent {

    // ============ COLOR (HSV) ============

    @input
    @hint("Hue (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _h: number = 0.0;

    @input
    @hint("Saturation (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _s: number = 1.0;

    @input
    @hint("Value (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _v: number = 1.0;

    // ============ GEOMETRY ============

    @input
    @hint("Size of the display volume (should match other generators)")
    private _displaySize: number = 100.0;

    @input
    @hint("Size of the marker sphere")
    @widget(new SliderWidget(1, 20, 0.5))
    private _markerSize: number = 5.0;

    // ============ MATERIAL ============

    @input
    @hint("Material (use same as RGBCubeGenerator with ColorSpaceTransform)")
    material: Material;

    // ============ COLOR SPACE ============

    @input
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("RGB", 0),
            new ComboBoxItem("CIELAB", 1),
            new ComboBoxItem("CIEXYZ", 2),
            new ComboBoxItem("Oklab", 3),
            new ComboBoxItem("CIELUV", 4),
        ])
    )
    @hint("Source color space (blend = 0)")
    private _colorSpaceFrom: number = 0;

    @input
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("RGB", 0),
            new ComboBoxItem("CIELAB", 1),
            new ComboBoxItem("CIEXYZ", 2),
            new ComboBoxItem("Oklab", 3),
            new ComboBoxItem("CIELUV", 4),
        ])
    )
    @hint("Target color space (blend = 1)")
    private _colorSpaceTo: number = 0;

    @input
    @hint("Color space blend: 0 = source, 1 = target")
    @widget(new SliderWidget(0, 1, 0.01))
    private _blend: number = 0.0;

    // ============ PRIVATE STATE ============

    private meshBuilder!: MeshBuilder;
    private meshVisual!: RenderMeshVisual;
    private mesh: RenderMesh | null = null;

    // Computed RGB from HSV
    private _r: number = 1.0;
    private _g: number = 0.0;
    private _b: number = 0.0;

    onAwake(): void {
        this.updateRGBFromHSV();
        this.setupMeshVisual();
        this.generateMesh();
        this.updateMaterialParams();
    }

    private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
        let r = 0, g = 0, b = 0;

        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }

        return { r, g, b };
    }

    private updateRGBFromHSV(): void {
        const rgb = this.hsvToRgb(this._h, this._s, this._v);
        this._r = rgb.r;
        this._g = rgb.g;
        this._b = rgb.b;
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
        }
    }

    private rgbToDisplayPosition(r: number, g: number, b: number): vec3 {
        const size = this._displaySize;
        return new vec3(
            (r - 0.5) * size,
            (b - 0.5) * size,
            (g - 0.5) * size
        );
    }

    private generateMesh(): void {
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
            { name: "texture1", components: 2 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const center = this.rgbToDisplayPosition(this._r, this._g, this._b);
        this.generateSphere(center, this._r, this._g, this._b, this._markerSize * 0.5);

        if (this.meshBuilder.isValid()) {
            this.mesh = this.meshBuilder.getMesh();
            this.meshVisual.mesh = this.mesh;
            this.meshBuilder.updateMesh();
        }
    }

    private generateSphere(center: vec3, r: number, g: number, b: number, radius: number): void {
        const segments = 16;
        const rings = 12;

        const startIndex = this.meshBuilder.getVerticesCount();

        for (let ring = 0; ring <= rings; ring++) {
            const phi = (ring / rings) * Math.PI;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            for (let seg = 0; seg <= segments; seg++) {
                const theta = (seg / segments) * 2.0 * Math.PI;
                const sinTheta = Math.sin(theta);
                const cosTheta = Math.cos(theta);

                const nx = sinPhi * cosTheta;
                const ny = cosPhi;
                const nz = sinPhi * sinTheta;

                const px = center.x + radius * nx;
                const py = center.y + radius * ny;
                const pz = center.z + radius * nz;

                this.meshBuilder.appendVerticesInterleaved([
                    px, py, pz,
                    nx, ny, nz,
                    r, g,
                    b, 1.0,
                ]);
            }
        }

        for (let ring = 0; ring < rings; ring++) {
            for (let seg = 0; seg < segments; seg++) {
                const curr = startIndex + ring * (segments + 1) + seg;
                const next = curr + segments + 1;

                this.meshBuilder.appendIndices([
                    curr, next, curr + 1,
                    curr + 1, next, next + 1,
                ]);
            }
        }
    }

    private updateMaterialParams(): void {
        if (this.material) {
            const pass = this.material.mainPass;
            pass.colorSpaceFrom = this._colorSpaceFrom;
            pass.colorSpaceTo = this._colorSpaceTo;
            pass.blend = this._blend;
            pass.cubeSize = this._displaySize;
        }
    }

    // ============================================
    // PUBLIC API - HSV CONTROL
    // ============================================

    /** Set hue (0-1) - call from slider callback */
    public setH(value: number): void {
        this._h = Math.max(0, Math.min(1, value));
        this.updateRGBFromHSV();
        this.generateMesh();
    }

    /** Set saturation (0-1) - call from slider callback */
    public setS(value: number): void {
        this._s = Math.max(0, Math.min(1, value));
        this.updateRGBFromHSV();
        this.generateMesh();
    }

    /** Set value/brightness (0-1) - call from slider callback */
    public setV(value: number): void {
        this._v = Math.max(0, Math.min(1, value));
        this.updateRGBFromHSV();
        this.generateMesh();
    }

    /** Set all HSV channels at once (0-1 each) */
    public setHSV(h: number, s: number, v: number): void {
        this._h = Math.max(0, Math.min(1, h));
        this._s = Math.max(0, Math.min(1, s));
        this._v = Math.max(0, Math.min(1, v));
        this.updateRGBFromHSV();
        this.generateMesh();
    }

    /** Get current H value */
    public getH(): number { return this._h; }

    /** Get current S value */
    public getS(): number { return this._s; }

    /** Get current V value */
    public getV(): number { return this._v; }

    /** Get current color as RGB vec3 */
    public getColor(): vec3 {
        return new vec3(this._r, this._g, this._b);
    }

    /** Get current RGB values */
    public getRGB(): { r: number; g: number; b: number } {
        return { r: this._r, g: this._g, b: this._b };
    }

    // ============================================
    // PUBLIC API - COLOR SPACE CONTROL
    // ============================================

    /** Set both color spaces and blend (syncs with other generators) */
    public setColorSpace(from: number, to: number, blend: number = 1.0): void {
        this._colorSpaceFrom = from;
        this._colorSpaceTo = to;
        this._blend = blend;
        this.updateMaterialParams();
    }

    /** Set blend value only */
    public setBlend(value: number): void {
        this._blend = Math.max(0, Math.min(1, value));
        this.updateMaterialParams();
    }

    /** Set target color space index */
    public setColorSpaceIndex(index: number): void {
        this._colorSpaceFrom = index;
        this._colorSpaceTo = index;
        this._blend = 1.0;
        this.updateMaterialParams();
    }

    // ============================================
    // PUBLIC API - GEOMETRY CONTROL
    // ============================================

    /** Set display size (should match other generators) */
    public setDisplaySize(size: number): void {
        this._displaySize = size;
        this.generateMesh();
        this.updateMaterialParams();
    }

    /** Set marker sphere size */
    public setMarkerSize(size: number): void {
        this._markerSize = size;
        this.generateMesh();
    }

    /** Get display size */
    public getDisplaySize(): number { return this._displaySize; }

    /** Get marker size */
    public getMarkerSize(): number { return this._markerSize; }

    // ============================================
    // PROPERTY ACCESSORS
    // ============================================

    get h(): number { return this._h; }
    set h(value: number) { this.setH(value); }

    get s(): number { return this._s; }
    set s(value: number) { this.setS(value); }

    get v(): number { return this._v; }
    set v(value: number) { this.setV(value); }

    get displaySize(): number { return this._displaySize; }
    set displaySize(value: number) { this.setDisplaySize(value); }

    get markerSize(): number { return this._markerSize; }
    set markerSize(value: number) { this.setMarkerSize(value); }

    get colorSpaceFrom(): number { return this._colorSpaceFrom; }
    set colorSpaceFrom(value: number) {
        this._colorSpaceFrom = value;
        this.updateMaterialParams();
    }

    get colorSpaceTo(): number { return this._colorSpaceTo; }
    set colorSpaceTo(value: number) {
        this._colorSpaceTo = value;
        this.updateMaterialParams();
    }

    get blend(): number { return this._blend; }
    set blend(value: number) { this.setBlend(value); }
}
