// VectorFieldController.ts
// Generates line geometry on the CPU for vector field trails.
// The vertex shader integrates the vector field on the GPU to compute trail positions.
// Pattern inspired by Color-Spaces RGBCubeGenerator + ColorSpaceTransform approach.

@component
export class VectorFieldController extends BaseScriptComponent {

    // ============ GEOMETRY ============

    @input
    @hint("Size of the field volume (7 = bounds of ±3.5, matching HTML)")
    private _fieldSize: number = 7.0;

    @input
    @hint("Number of trail lines (randomly positioned)")
    @widget(new SliderWidget(10, 800, 50))
    private _numTrails: number = 100;

    @input
    @hint("Number of segments per trail line")
    @widget(new SliderWidget(8, 64, 4))
    private _segmentsPerTrail: number = 32;

    @input
    @hint("Line width in scene units")
    @widget(new SliderWidget(0.1, 5.0, 0.1))
    private _lineWidth: number = 1.0;

    // ============ MATERIAL ============

    @input
    @hint("Material for vector field trails (must use VectorFieldTransform.js vertex shader)")
    material: Material;

    // ============ VECTOR FIELD ============

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Curl Noise", 0),
        new ComboBoxItem("Tornado", 1),
        new ComboBoxItem("Attractor", 2),
        new ComboBoxItem("Waves", 3),
        new ComboBoxItem("Lorenz", 4),
        new ComboBoxItem("Torus Flow", 5),
        new ComboBoxItem("Sink/Source", 6),
        new ComboBoxItem("Turbulence", 7),
        new ComboBoxItem("Helix", 8),
        new ComboBoxItem("Galaxy", 9)
    ]))
    @hint("Vector field preset")
    private _preset: number = 0;

    @input
    @widget(new SliderWidget(0.1, 3.0, 0.1))
    @hint("Animation speed multiplier")
    private _speed: number = 1.0;

    @input
    @widget(new SliderWidget(0.2, 3.0, 0.1))
    @hint("Field noise scale")
    private _fieldScale: number = 1.0;

    @input
    @widget(new SliderWidget(0.01, 0.3, 0.01))
    @hint("Integration step size")
    private _stepSize: number = 0.08;

    // ============ VISUAL ============

    @input
    @widget(new SliderWidget(0.1, 3.0, 0.1))
    @hint("Trail brightness")
    private _brightness: number = 1.0;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Trail fade start (0 = sharp, 1 = gradual)")
    private _fadeStart: number = 0.3;

    @input
    @widget(new SliderWidget(0.1, 1.0, 0.05))
    @hint("Trail length (fraction of total trail visible)")
    private _trailLength: number = 0.4;

    @input
    @hint("Auto-animate time")
    autoAnimate: boolean = true;

    @input
    @widget(new SliderWidget(0.1, 5.0, 0.1))
    @hint("Time multiplier for animation")
    timeMultiplier: number = 1.0;

    private readonly PRESET_DESCRIPTIONS: string[] = [
        "Smooth divergence-free turbulent flow",
        "Spiraling vortex pulling upward",
        "Strange attractor with chaotic orbits",
        "Sinusoidal wave interference pattern",
        "Lorenz system - butterfly attractor",
        "Flow along a torus surface",
        "Alternating sinks and sources",
        "Multi-scale turbulent noise",
        "Double helix DNA-like spiral",
        "Spiral galaxy rotation curve"
    ];

    private meshBuilder!: MeshBuilder;
    private meshVisual!: RenderMeshVisual;
    private elapsedTime: number = 0;
    private mainPass: Pass;

    // Store trail data for mesh generation
    private trailData: { startPos: vec3; trailIndex: number }[] = [];

    onAwake(): void {
        this.setupMeshVisual();
        this.collectTrailData();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
        print("VectorFieldController: Initialized with " + this.trailData.length + " random trails, " +
              this._segmentsPerTrail + " segments each");
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
            this.mainPass = this.material.mainPass;
        }
    }

    // ============================================
    // TRAIL DATA COLLECTION
    // ============================================

    private collectTrailData(): void {
        this.trailData = [];
        const bounds = this._fieldSize / 2; // ±3.5 for fieldSize=7

        // Random starting positions (matching HTML pattern)
        for (let i = 0; i < this._numTrails; i++) {
            const x = (Math.random() - 0.5) * bounds * 2;
            const y = (Math.random() - 0.5) * bounds * 2;
            const z = (Math.random() - 0.5) * bounds * 2;

            const startPos = new vec3(x, y, z);
            this.trailData.push({ startPos, trailIndex: i });
        }

        print("VectorFieldController: " + this.trailData.length + " random trails");
    }

    // ============================================
    // MESH GENERATION - LINE RIBBONS
    // ============================================

    private generateMesh(): void {
        // Encode ALL data in position - this definitely works
        // position.x = seed.x
        // position.y = segmentIndex (0-1) - shader will use this to integrate
        // position.z = seed.z + ribbonSide * 0.001 (tiny offset for ribbon)
        // We pass seed.y via normal.x
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const numSegments = this._segmentsPerTrail;

        for (const trail of this.trailData) {
            this.generateTrailRibbon(trail.startPos, trail.trailIndex, numSegments);
        }

        if (this.meshBuilder.isValid()) {
            this.meshBuilder.updateMesh();
            this.meshVisual.mesh = this.meshBuilder.getMesh();
            print("VectorFieldController: Generated mesh with " +
                  this.meshBuilder.getVerticesCount() + " vertices, " +
                  this.trailData.length + " random trails");
        } else {
            print("VectorFieldController: ERROR - mesh not valid!");
        }
    }

    /**
     * Generate a ribbon for a single trail.
     * Encoding in POSITION (which definitely works):
     *   position.x = seed.x
     *   position.y = segmentIndex (0-1) - this varies per vertex!
     *   position.z = seed.z
     * Encoding in NORMAL:
     *   normal.x = seed.y (the original Y we displaced)
     *   normal.y = ribbonSide (-1 or 1)
     *   normal.z = lineIndex normalized
     */
    private generateTrailRibbon(startPos: vec3, trailIndex: number, numSegments: number): void {
        const startVertexIndex = this.meshBuilder.getVerticesCount();
        const lineIndexNorm = trailIndex / Math.max(1, this._numTrails - 1);

        for (let i = 0; i <= numSegments; i++) {
            const segmentIndex = i / numSegments; // 0 to 1

            // Left vertex - segmentIndex goes in position.y
            this.meshBuilder.appendVerticesInterleaved([
                startPos.x, segmentIndex, startPos.z,    // position: x, SEGMENT_INDEX, z
                startPos.y, -1.0, lineIndexNorm          // normal: seed.y, ribbonSide, lineIndex
            ]);

            // Right vertex
            this.meshBuilder.appendVerticesInterleaved([
                startPos.x, segmentIndex, startPos.z,    // position: x, SEGMENT_INDEX, z
                startPos.y, 1.0, lineIndexNorm           // normal: seed.y, ribbonSide, lineIndex
            ]);
        }

        // Generate triangle indices for the ribbon
        for (let i = 0; i < numSegments; i++) {
            const baseIdx = startVertexIndex + i * 2;
            this.meshBuilder.appendIndices([
                baseIdx, baseIdx + 1, baseIdx + 2,
                baseIdx + 2, baseIdx + 1, baseIdx + 3,
            ]);
        }
    }

    // ============================================
    // MATERIAL PARAMETERS
    // ============================================

    private updateMaterialParams(): void {
        if (!this.mainPass) return;

        this.mainPass.Time = this.elapsedTime;
        this.mainPass.Preset = this._preset;
        this.mainPass.Speed = this._speed;
        this.mainPass.FieldScale = this._fieldScale;
        this.mainPass.StepSize = this._stepSize;
        this.mainPass.NumSteps = this._segmentsPerTrail;
        this.mainPass.Brightness = this._brightness;
        this.mainPass.FadeStart = this._fadeStart;
        this.mainPass.FieldSize = this._fieldSize;
        this.mainPass.LineWidth = this._lineWidth;
        this.mainPass.TrailLength = this._trailLength;
    }

    private onUpdate(): void {
        if (this.autoAnimate) {
            this.elapsedTime += getDeltaTime() * this.timeMultiplier;
        }
        this.updateMaterialParams();
    }

    // ============================================
    // PUBLIC API
    // ============================================

    public setPreset(presetIndex: number): void {
        if (presetIndex >= 0 && presetIndex <= 9) {
            this._preset = presetIndex;
            print("VectorFieldController: Changed to preset '" +
                  this.PRESET_DESCRIPTIONS[presetIndex] + "'");
        }
    }

    public nextPreset(): void {
        this._preset = (this._preset + 1) % 10;
        print("VectorFieldController: Changed to preset '" +
              this.PRESET_DESCRIPTIONS[this._preset] + "'");
    }

    public previousPreset(): void {
        this._preset = (this._preset - 1 + 10) % 10;
        print("VectorFieldController: Changed to preset '" +
              this.PRESET_DESCRIPTIONS[this._preset] + "'");
    }

    public setSpeed(value: number): void {
        this._speed = Math.max(0.1, Math.min(3.0, value));
    }

    public setFieldScale(value: number): void {
        this._fieldScale = Math.max(0.2, Math.min(3.0, value));
    }

    public setBrightness(value: number): void {
        this._brightness = Math.max(0.1, Math.min(3.0, value));
    }

    public setTime(value: number): void {
        this.elapsedTime = value;
    }

    public resetTime(): void {
        this.elapsedTime = 0;
    }

    public pauseAnimation(): void {
        this.autoAnimate = false;
    }

    public resumeAnimation(): void {
        this.autoAnimate = true;
    }

    public toggleAnimation(): void {
        this.autoAnimate = !this.autoAnimate;
    }

    public getPresetDescription(): string {
        return this.PRESET_DESCRIPTIONS[this._preset];
    }

    public getCurrentPreset(): number {
        return this._preset;
    }

    public refresh(): void {
        this.collectTrailData();
        this.generateMesh();
        this.updateMaterialParams();
    }

    // Property accessors
    get fieldSize(): number { return this._fieldSize; }
    set fieldSize(value: number) {
        this._fieldSize = value;
        this.refresh();
    }

    get numTrails(): number { return this._numTrails; }
    set numTrails(value: number) {
        this._numTrails = Math.max(10, Math.floor(value));
        this.refresh();
    }

    get segmentsPerTrail(): number { return this._segmentsPerTrail; }
    set segmentsPerTrail(value: number) {
        this._segmentsPerTrail = Math.max(4, Math.floor(value));
        this.refresh();
    }

    get lineWidth(): number { return this._lineWidth; }
    set lineWidth(value: number) {
        this._lineWidth = value;
        this.refresh();
    }

    get preset(): number { return this._preset; }
    set preset(value: number) {
        this._preset = value;
        this.updateMaterialParams();
    }

    get speed(): number { return this._speed; }
    set speed(value: number) {
        this._speed = value;
        this.updateMaterialParams();
    }

    get fieldScale(): number { return this._fieldScale; }
    set fieldScale(value: number) {
        this._fieldScale = value;
        this.updateMaterialParams();
    }

    get stepSize(): number { return this._stepSize; }
    set stepSize(value: number) {
        this._stepSize = value;
        this.updateMaterialParams();
    }

    get brightness(): number { return this._brightness; }
    set brightness(value: number) {
        this._brightness = value;
        this.updateMaterialParams();
    }

    get fadeStart(): number { return this._fadeStart; }
    set fadeStart(value: number) {
        this._fadeStart = value;
        this.updateMaterialParams();
    }

    get trailLength(): number { return this._trailLength; }
    set trailLength(value: number) {
        this._trailLength = value;
        this.updateMaterialParams();
    }

    public setTrailLength(value: number): void {
        this._trailLength = Math.max(0.1, Math.min(1.0, value));
    }
}
