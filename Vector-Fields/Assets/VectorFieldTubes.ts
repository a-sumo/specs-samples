// VectorFieldTubes.ts
// Tube geometry that integrates a vector field on the GPU
// Based on TubeTest.ts pattern

@component
export class VectorFieldTubes extends BaseScriptComponent {

    // ============ GEOMETRY ============

    @input
    @widget(new SliderWidget(8, 64, 4))
    @hint("Segments along tube length (integration steps)")
    private _lengthSegments: number = 32;

    @input
    @widget(new SliderWidget(3, 16, 1))
    @hint("Segments around tube circumference")
    private _radialSegments: number = 8;

    @input
    @widget(new SliderWidget(0.01, 0.2, 0.01))
    @hint("Tube radius")
    private _radius: number = 0.05;

    // ============ GRID ============

    @input
    @widget(new SliderWidget(1, 10, 1))
    @hint("Grid size (NxN)")
    private _gridSize: number = 5;

    @input
    @widget(new SliderWidget(0.5, 5.0, 0.1))
    @hint("Spacing between tube start positions")
    private _gridSpacing: number = 1.0;

    // ============ INTEGRATION ============

    @input
    @widget(new SliderWidget(0.01, 0.5, 0.01))
    @hint("Step size for vector field integration")
    private _stepSize: number = 0.1;

    @input
    @widget(new SliderWidget(0.1, 3.0, 0.1))
    @hint("Field noise/frequency scale")
    private _fieldScale: number = 1.0;

    // ============ PRESET ============

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Expansion", 0),
        new ComboBoxItem("Contraction", 1),
        new ComboBoxItem("Circulation", 2),
        new ComboBoxItem("Waves", 3),
        new ComboBoxItem("Vortex", 4)
    ]))
    @hint("Vector field type")
    private _preset: number = 0;

    // ============ TRACKED OBJECT ============

    @input
    @hint("Object that affects the field - field reacts to its position")
    trackedObject: SceneObject;

    @input
    @hint("Box collider - field only animates when tracked object is inside")
    fieldCollider: ColliderComponent;

    // ============ MATERIAL ============

    @input
    @hint("Material with VectorFieldTubesShader.js")
    material: Material;

    private meshBuilder!: MeshBuilder;
    private meshVisual!: RenderMeshVisual;
    private mainPass: Pass;

    onAwake(): void {
        this.setupMeshVisual();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
        print("VectorFieldTubes: Initialized " + (this._gridSize * this._gridSize) + " tubes");
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
            this.mainPass = this.material.mainPass;
        } else {
            print("VectorFieldTubes: WARNING - No material assigned!");
        }
    }

    private lastValidTargetPos: vec3 = new vec3(0, 0, 0);

    private isInsideCollider(pos: vec3): boolean {
        if (!this.fieldCollider) return true;

        // Use this script's scene object as the center (moves with manipulation)
        const center = this.sceneObject.getTransform().getWorldPosition();
        const worldScale = this.sceneObject.getTransform().getWorldScale();
        const shape = this.fieldCollider.shape as BoxShape;

        const halfExtents = new vec3(
            shape.size.x * 0.5 * worldScale.x,
            shape.size.y * 0.5 * worldScale.y,
            shape.size.z * 0.5 * worldScale.z
        );

        return Math.abs(pos.x - center.x) <= halfExtents.x &&
               Math.abs(pos.y - center.y) <= halfExtents.y &&
               Math.abs(pos.z - center.z) <= halfExtents.z;
    }

    private updateMaterialParams(): void {
        if (!this.mainPass) return;
        this.mainPass.TubeRadius = this._radius;
        this.mainPass.StepSize = this._stepSize;
        this.mainPass.NumSteps = this._lengthSegments;
        this.mainPass.FieldScale = this._fieldScale;
        this.mainPass.Preset = this._preset;

        // Only update target position if inside collider bounds
        if (this.trackedObject) {
            const pos = this.trackedObject.getTransform().getWorldPosition();
            if (this.isInsideCollider(pos)) {
                this.lastValidTargetPos = pos;
            }
        }
        this.mainPass.TargetPosition = this.lastValidTargetPos;
    }

    private generateMesh(): void {
        // Encoding (position/normal get distorted, use UVs for data):
        //   position.z = t (0-1 along tube, used for integration step index)
        //   normal.z = 1 for tube vertices, 0 for cap centers
        //   texture0 = (localX, localY) unit circle coords
        //   texture1 = (startX, startZ) starting position in XZ plane

        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
            { name: "texture1", components: 2 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const pathLength = this._lengthSegments + 1;
        const circleSegments = this._radialSegments;

        let totalTubes = 0;

        // Generate 2D grid of tubes in XZ plane (centered around origin)
        const halfExtent = (this._gridSize - 1) * this._gridSpacing / 2;
        for (let gx = 0; gx < this._gridSize; gx++) {
            for (let gz = 0; gz < this._gridSize; gz++) {
                const startX = -halfExtent + gx * this._gridSpacing;
                const startZ = -halfExtent + gz * this._gridSpacing;
                this.generateSingleTube(startX, startZ, pathLength, circleSegments);
                totalTubes++;
            }
        }

        if (this.meshBuilder.isValid()) {
            this.meshVisual.mesh = this.meshBuilder.getMesh();
            this.meshBuilder.updateMesh();
            print("VectorFieldTubes: Generated " + totalTubes + " tubes, " +
                  this.meshBuilder.getVerticesCount() + " vertices");
        } else {
            print("VectorFieldTubes: ERROR - mesh not valid!");
        }
    }

    private generateSingleTube(startX: number, startZ: number, pathLength: number, circleSegments: number): void {
        const startVertexIndex = this.meshBuilder.getVerticesCount();

        // Generate tube body vertices
        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                this.meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, t,           // position: unused, unused, t (step index)
                    0.0, 0.0, 1.0,         // normal: unused, unused, isTube=1
                    localX, localY,        // texture0: unit circle coords
                    startX, startZ         // texture1: starting position XZ
                ]);
            }
        }

        // Generate indices for tube body
        for (let segment = 0; segment < pathLength - 1; segment++) {
            for (let i = 0; i < circleSegments; i++) {
                const current = startVertexIndex + segment * circleSegments + i;
                const next = startVertexIndex + segment * circleSegments + ((i + 1) % circleSegments);
                const currentNext = startVertexIndex + (segment + 1) * circleSegments + i;
                const nextNext = startVertexIndex + (segment + 1) * circleSegments + ((i + 1) % circleSegments);

                this.meshBuilder.appendIndices([
                    current, next, currentNext,
                    next, nextNext, currentNext
                ]);
            }
        }

        // Generate end caps
        this.generateSingleTubeCaps(startX, startZ, startVertexIndex, pathLength, circleSegments);
    }

    private generateSingleTubeCaps(startX: number, startZ: number, startVertexIndex: number, pathLength: number, circleSegments: number): void {
        // START CAP (at t = 0)
        const startCapIndex = this.meshBuilder.getVerticesCount();
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position: t=0
            0.0, 0.0, 0.0,         // normal: isCap=0
            0.0, 0.0,              // texture0: center
            startX, startZ         // texture1: starting position XZ
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            this.meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        // END CAP (at t = 1)
        const endCapIndex = this.meshBuilder.getVerticesCount();
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 1.0,         // position: t=1
            0.0, 0.0, 0.0,         // normal: isCap=0
            0.0, 0.0,              // texture0: center
            startX, startZ         // texture1: starting position XZ
        ]);

        const lastRingStart = startVertexIndex + (pathLength - 1) * circleSegments;
        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + (i + 1) % circleSegments;
            this.meshBuilder.appendIndices([endCapIndex, current, next]);
        }
    }

    private onUpdate(): void {
        this.updateMaterialParams();
    }

    public refresh(): void {
        this.generateMesh();
        this.updateMaterialParams();
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Set preset from normalized value (0-1)
     * Maps to presets 0-4 (Expansion, Contraction, Circulation, Waves, Vortex)
     */
    public setPresetNormalized(value: number): void {
        this._preset = Math.floor(Math.min(0.999, Math.max(0, value)) * 5);
    }

    /**
     * Set preset by index (0-4)
     * 0=Expansion, 1=Contraction, 2=Circulation, 3=Waves, 4=Vortex
     */
    public setPreset(index: number): void {
        this._preset = Math.floor(Math.min(4, Math.max(0, index)));
    }

    /**
     * Set field scale from normalized value (0-1)
     * Maps to scale range 0.1-3.0
     */
    public setFieldScaleNormalized(value: number): void {
        this._fieldScale = 0.1 + value * 2.9;
    }

    /**
     * Set step size from normalized value (0-1)
     * Maps to range 0.01-0.5
     */
    public setStepSizeNormalized(value: number): void {
        this._stepSize = 0.01 + value * 0.49;
    }

    /**
     * Set tube radius from normalized value (0-1)
     * Maps to range 0.01-0.2
     */
    public setRadiusNormalized(value: number): void {
        this._radius = 0.01 + value * 0.19;
    }

    // Property accessors
    get lengthSegments(): number { return this._lengthSegments; }
    set lengthSegments(value: number) {
        this._lengthSegments = Math.max(4, Math.floor(value));
        this.refresh();
    }

    get radialSegments(): number { return this._radialSegments; }
    set radialSegments(value: number) {
        this._radialSegments = Math.max(3, Math.floor(value));
        this.refresh();
    }

    get radius(): number { return this._radius; }
    set radius(value: number) { this._radius = value; }

    get gridSize(): number { return this._gridSize; }
    set gridSize(value: number) {
        this._gridSize = Math.max(1, Math.floor(value));
        this.refresh();
    }

    get gridSpacing(): number { return this._gridSpacing; }
    set gridSpacing(value: number) {
        this._gridSpacing = value;
        this.refresh();
    }

    get stepSize(): number { return this._stepSize; }
    set stepSize(value: number) {
        this._stepSize = value;
    }

    get fieldScale(): number { return this._fieldScale; }
    set fieldScale(value: number) {
        this._fieldScale = value;
    }

    get preset(): number { return this._preset; }
    set preset(value: number) {
        this._preset = value;
    }
}
