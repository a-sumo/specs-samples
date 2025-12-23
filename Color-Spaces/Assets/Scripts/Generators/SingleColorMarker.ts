/**
 * SingleColorMarker.ts
 *
 * Displays a single color as a voxel that moves through color spaces.
 * Uses the same material as RGBCubeGenerator (ColorSpaceTransform shader).
 * The marker's displayed color automatically matches its RGB position.
 *
 * Connect R, G, B sliders from Spectacles UI Kit to setR(), setG(), setB()
 * or use setRGB() to set all at once.
 */
@component
export class SingleColorMarker extends BaseScriptComponent {

    // ============ COLOR ============

    @input
    @hint("Red channel (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _r: number = 1.0;

    @input
    @hint("Green channel (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _g: number = 0.0;

    @input
    @hint("Blue channel (0-1)")
    @widget(new SliderWidget(0, 1, 0.01))
    private _b: number = 0.0;

    // ============ GEOMETRY ============

    @input
    @hint("Size of the display volume (should match other generators)")
    private _displaySize: number = 100.0;

    @input
    @hint("Size of the marker cube")
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

    onAwake(): void {
        this.setupMeshVisual();
        this.generateMesh();
        this.updateMaterialParams();
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
        this.generateCube(center, this._r, this._g, this._b, this._markerSize);

        if (this.meshBuilder.isValid()) {
            this.mesh = this.meshBuilder.getMesh();
            this.meshVisual.mesh = this.mesh;
            this.meshBuilder.updateMesh();
        }
    }

    private generateCube(center: vec3, r: number, g: number, b: number, size: number): void {
        const half = size * 0.5;

        const corners = [
            new vec3(center.x - half, center.y - half, center.z - half),
            new vec3(center.x + half, center.y - half, center.z - half),
            new vec3(center.x + half, center.y + half, center.z - half),
            new vec3(center.x - half, center.y + half, center.z - half),
            new vec3(center.x - half, center.y - half, center.z + half),
            new vec3(center.x + half, center.y - half, center.z + half),
            new vec3(center.x + half, center.y + half, center.z + half),
            new vec3(center.x - half, center.y + half, center.z + half),
        ];

        const faces = [
            { normal: new vec3(0, 0, -1), verts: [0, 1, 2, 3] },
            { normal: new vec3(0, 0, 1), verts: [5, 4, 7, 6] },
            { normal: new vec3(-1, 0, 0), verts: [4, 0, 3, 7] },
            { normal: new vec3(1, 0, 0), verts: [1, 5, 6, 2] },
            { normal: new vec3(0, -1, 0), verts: [4, 5, 1, 0] },
            { normal: new vec3(0, 1, 0), verts: [3, 2, 6, 7] },
        ];

        for (const face of faces) {
            const faceStartIndex = this.meshBuilder.getVerticesCount();

            for (const vi of face.verts) {
                const pos = corners[vi];
                this.meshBuilder.appendVerticesInterleaved([
                    pos.x, pos.y, pos.z,
                    face.normal.x, face.normal.y, face.normal.z,
                    r, g,
                    b, 1.0,
                ]);
            }

            this.meshBuilder.appendIndices([
                faceStartIndex, faceStartIndex + 1, faceStartIndex + 2,
                faceStartIndex, faceStartIndex + 2, faceStartIndex + 3,
            ]);
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
    // PUBLIC API - RGB CONTROL
    // ============================================

    /** Set red channel (0-1) - call from slider callback */
    public setR(value: number): void {
        this._r = Math.max(0, Math.min(1, value));
        this.generateMesh();
    }

    /** Set green channel (0-1) - call from slider callback */
    public setG(value: number): void {
        this._g = Math.max(0, Math.min(1, value));
        this.generateMesh();
    }

    /** Set blue channel (0-1) - call from slider callback */
    public setB(value: number): void {
        this._b = Math.max(0, Math.min(1, value));
        this.generateMesh();
    }

    /** Set all RGB channels at once (0-1 each) */
    public setRGB(r: number, g: number, b: number): void {
        this._r = Math.max(0, Math.min(1, r));
        this._g = Math.max(0, Math.min(1, g));
        this._b = Math.max(0, Math.min(1, b));
        this.generateMesh();
    }

    /** Set RGB from vec3 (components 0-1) */
    public setColor(color: vec3): void {
        this.setRGB(color.x, color.y, color.z);
    }

    /** Get current R value */
    public getR(): number { return this._r; }

    /** Get current G value */
    public getG(): number { return this._g; }

    /** Get current B value */
    public getB(): number { return this._b; }

    /** Get current color as vec3 */
    public getColor(): vec3 {
        return new vec3(this._r, this._g, this._b);
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

    /** Set marker cube size */
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

    get r(): number { return this._r; }
    set r(value: number) { this.setR(value); }

    get g(): number { return this._g; }
    set g(value: number) { this.setG(value); }

    get b(): number { return this._b; }
    set b(value: number) { this.setB(value); }

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
