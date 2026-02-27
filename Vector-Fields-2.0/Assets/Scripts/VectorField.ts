// VectorFieldTubes.ts
// Tube geometry that integrates a vector field on the GPU
// Based on TubeTest.ts pattern

enum TubeMode {
    Trails = 0,    // Flowing tubes that bend along field lines
    Particles = 1, // Short trails - minimal geometry, same flow animation
    Arrows = 2     // Static arrows: orient + scale by field, cone tip
}

@component
export class VectorFieldTubes extends BaseScriptComponent {

    // Normalized default values (0-1) for: [preset, scale, radius, speed, length]
    // Use with setters: setPresetNormalized, setFieldScaleNormalized, setRadiusNormalized, setFlowSpeedNormalized, setLengthSegmentsNormalized
    public static readonly NORMALIZED_DEFAULTS: number[] = [0.0, 0.31, 0.16, 0.5, 0.10];

    // ============ PERFORMANCE ============

    private static readonly MIN_LENGTH_SEGMENTS: number = 2;
    private static readonly MAX_LENGTH_SEGMENTS: number = 64;

    // LOD presets: [radialSegments, maxLengthSegments, gridSize]
    private static readonly LOD_PRESETS: number[][] = [
        [4, 6, 6],    // 0: Low - 216 tubes, 4 radial, 6 length
        [5, 10, 7],   // 1: Medium - 343 tubes, 5 radial, 10 length
        [6, 16, 8],   // 2: High - 512 tubes, 6 radial, 16 length
        [8, 24, 9],   // 3: Ultra - 729 tubes, 8 radial, 24 length
    ];

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Low", 0),
        new ComboBoxItem("Medium", 1),
        new ComboBoxItem("High", 2),
        new ComboBoxItem("Ultra", 3)
    ]))
    @hint("Level of detail - affects radial segments, length segments, and grid size")
    private _lod: number = 1;

    private _radialSegments: number = 5;  // Medium LOD default

    @input
    @widget(new SliderWidget(8000, 65000, 1000))
    @hint("Maximum vertex count budget - geometry adapts to stay below this (UInt16 max: 65535)")
    private _maxVertexCount: number = 32000;

    // ============ MODE ============

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Trails", 0),
        new ComboBoxItem("Particles", 1),
        new ComboBoxItem("Arrows", 2)
    ]))
    @hint("Trails: flowing tubes, Particles: short flowing trails, Arrows: static oriented")
    private _tubeMode: number = 0;

    // ============ GEOMETRY ============

    @input
    @widget(new SliderWidget(2, 64, 2))
    @hint("Desired segments along tube length (may be reduced to fit vertex budget)")
    private _desiredLengthSegments: number = 8;

    // Actual segments used after budget adaptation
    private _lengthSegments: number = 8;

    @input
    @widget(new SliderWidget(0.01, 0.2, 0.01))
    @hint("Tube radius")
    private _radius: number = 0.04;

    @input
    @widget(new SliderWidget(1.0, 30.0, 0.1))
    @hint("Cone tip length multiplier for Arrow mode")
    private _coneLength: number = 4.0;

    @input
    @widget(new SliderWidget(1.0, 2.5, 0.1))
    @hint("Cone tip radius multiplier for Arrow mode")
    private _coneRadius: number = 1.7;

    @input
    @widget(new SliderWidget(0.5, 5.0, 0.1))
    @hint("Arrow length scale factor (multiplied by field magnitude)")
    private _arrowScale: number = 2.0;

    // ============ GRID ============

    @input
    @widget(new SliderWidget(1, 10, 1))
    @hint("Grid size (NxNxN)")
    private _gridSize: number = 8;

    @input
    @widget(new SliderWidget(0.1, 5.0, 0.1))
    @hint("Spacing between tube start positions")
    private _gridSpacing: number = 0.6;

    // ============ INTEGRATION ============

    @input
    @widget(new SliderWidget(0.01, 0.5, 0.01))
    @hint("Step size for vector field integration")
    private _stepSize: number = 0.1;

    @input
    @widget(new SliderWidget(0.1, 3.0, 0.1))
    @hint("Field noise/frequency scale")
    private _fieldScale: number = 1.0;

    @input
    @widget(new SliderWidget(0.0, 100.0, 0.5))
    @hint("Speed at which tubes flow along field lines")
    private _flowSpeed: number = 50.0;

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

    // Multiple mesh support for large geometry counts
    private static readonly MAX_VERTS_PER_MESH: number = 32000;  // Safe UInt16 limit with headroom
    private meshBuilders: MeshBuilder[] = [];
    private meshVisuals: RenderMeshVisual[] = [];
    private currentMeshIndex: number = 0;
    private currentMeshVertexCount: number = 0;
    private mainPass: Pass;

    // ============ VERTEX BUDGET HELPERS ============

    /**
     * Apply LOD preset values
     */
    private applyLOD(): void {
        const preset = VectorFieldTubes.LOD_PRESETS[this._lod];
        this._radialSegments = preset[0];
        this._desiredLengthSegments = preset[1];
        this._gridSize = preset[2];
    }

    /**
     * Compute vertex count for given parameters
     */
    public computeVertexCount(gridSize: number, lengthSegments: number, mode: number): number {
        const tubeCount = gridSize * gridSize * gridSize;
        const radial = this._radialSegments;

        if (mode === TubeMode.Particles) {
            // Particles: 2 rings + 2 flat caps
            return tubeCount * (2 * radial + 2);
        } else if (mode === TubeMode.Arrows) {
            // Arrows: 2 rings (straight tube) + cone (radial + 1) + start cap (1)
            const tubeVerts = 2 * radial;
            const coneVerts = radial + 1;
            const startCapVerts = 1;
            return tubeCount * (tubeVerts + coneVerts + startCapVerts);
        } else {
            // Trails: full tube + 2 flat caps
            const tubeVerts = (lengthSegments + 1) * radial;
            const capVerts = 2;  // start + end cap centers
            return tubeCount * (tubeVerts + capVerts);
        }
    }

    /**
     * Compute max lengthSegments that fits within vertex budget
     */
    public computeMaxLengthSegments(gridSize: number, maxVertices: number, mode: number): number {
        if (mode === TubeMode.Particles || mode === TubeMode.Arrows) {
            // These modes don't use lengthSegments for tube body
            return VectorFieldTubes.MIN_LENGTH_SEGMENTS;
        }

        // Trails mode: solve for lengthSegments
        const tubeCount = gridSize * gridSize * gridSize;
        const radial = this._radialSegments;
        const capVerts = 2;

        // maxVertices = tubeCount * ((lengthSegments + 1) * radial + capVerts)
        const budgetPerTube = Math.floor(maxVertices / tubeCount);
        const lengthSegments = Math.floor((budgetPerTube - capVerts) / radial) - 1;

        return Math.max(
            VectorFieldTubes.MIN_LENGTH_SEGMENTS,
            Math.min(VectorFieldTubes.MAX_LENGTH_SEGMENTS, lengthSegments)
        );
    }

    private adaptGeometryToBudget(): void {
        // For Particles/Arrows, check if grid size itself exceeds budget
        if (this._tubeMode === TubeMode.Particles || this._tubeMode === TubeMode.Arrows) {
            this._lengthSegments = VectorFieldTubes.MIN_LENGTH_SEGMENTS;

            const baseVerts = this.computeVertexCount(
                this._gridSize,
                this._lengthSegments,
                this._tubeMode
            );

            if (baseVerts > this._maxVertexCount) {
                // Calculate max grid size that fits budget
                const radial = this._radialSegments;
                const vertsPerTube = this._tubeMode === TubeMode.Particles
                    ? (2 * radial + 2)
                    : (2 * radial + radial + 1 + 1);  // arrows
                const maxTubes = Math.floor(this._maxVertexCount / vertsPerTube);
                const maxGrid = Math.floor(Math.pow(maxTubes, 1/3));

                print("VectorFieldTubes: WARNING - Grid " + this._gridSize + "³ exceeds budget (" +
                      baseVerts + "/" + this._maxVertexCount + "). Max grid for this mode: " + maxGrid + "³");
            }
        } else {
            // Trails mode: adapt lengthSegments
            const maxAllowed = this.computeMaxLengthSegments(
                this._gridSize,
                this._maxVertexCount,
                this._tubeMode
            );
            this._lengthSegments = Math.min(this._desiredLengthSegments, maxAllowed);

            if (this._lengthSegments < this._desiredLengthSegments) {
                const actualVerts = this.computeVertexCount(
                    this._gridSize,
                    this._lengthSegments,
                    this._tubeMode
                );
                print("VectorFieldTubes: Adapted lengthSegments " + this._desiredLengthSegments +
                      " → " + this._lengthSegments + " to fit vertex budget (" + actualVerts + "/" + this._maxVertexCount + ")");
            }
        }
    }

    onAwake(): void {
        this.setupMeshVisual();
        this.applyLOD();
        this.adaptGeometryToBudget();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

        const tubeCount = this._gridSize * this._gridSize * this._gridSize;
        const modeNames = ["Trails", "Particles", "Arrows"];
        const lodNames = ["Low", "Medium", "High", "Ultra"];
        print("VectorFieldTubes: Initialized " + tubeCount + " " + modeNames[this._tubeMode] +
              " (" + lodNames[this._lod] + " LOD, " + this._radialSegments + " radial)");
    }

    private setupMeshVisual(): void {
        if (this.material) {
            this.mainPass = this.material.mainPass;
        } else {
            print("VectorFieldTubes: WARNING - No material assigned!");
        }
    }

    private clearMeshes(): void {
        // Remove existing mesh visuals
        for (const visual of this.meshVisuals) {
            if (visual) {
                visual.destroy();
            }
        }
        this.meshVisuals = [];
        this.meshBuilders = [];
        this.currentMeshIndex = 0;
        this.currentMeshVertexCount = 0;
    }

    private createNewMeshBuilder(): MeshBuilder {
        const meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
            { name: "texture1", components: 2 },
            { name: "texture2", components: 2 },
            { name: "texture3", components: 1 },
        ]);
        meshBuilder.topology = MeshTopology.Triangles;
        meshBuilder.indexType = MeshIndexType.UInt16;
        return meshBuilder;
    }

    private createMeshVisual(): RenderMeshVisual {
        const visual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            visual.mainMaterial = this.material;
        }
        return visual;
    }

    private getOrCreateCurrentMeshBuilder(): MeshBuilder {
        if (this.meshBuilders.length === 0) {
            this.meshBuilders.push(this.createNewMeshBuilder());
            this.currentMeshIndex = 0;
            this.currentMeshVertexCount = 0;
        }
        return this.meshBuilders[this.currentMeshIndex];
    }

    private startNewMeshIfNeeded(requiredVerts: number): MeshBuilder {
        // Check if current mesh can fit the new geometry
        if (this.currentMeshVertexCount + requiredVerts > VectorFieldTubes.MAX_VERTS_PER_MESH) {
            // Finalize current mesh and start a new one
            this.currentMeshIndex++;
            this.meshBuilders.push(this.createNewMeshBuilder());
            this.currentMeshVertexCount = 0;
        }
        return this.meshBuilders[this.currentMeshIndex];
    }

    private computeVertsPerTube(): number {
        const radial = this._radialSegments;
        if (this._tubeMode === TubeMode.Particles) {
            return 2 * radial + 2;
        } else if (this._tubeMode === TubeMode.Arrows) {
            return 2 * radial + radial + 1 + 1;
        } else {
            return (this._lengthSegments + 1) * radial + 2;
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
        this.mainPass.Time = getTime();
        this.mainPass.FlowSpeed = this._flowSpeed;
        this.mainPass.ArrowScale = this._arrowScale;
        this.mainPass.ConeLength = this._coneLength;
        this.mainPass.ConeRadius = this._coneRadius;

        // Only update target position if inside collider bounds
        // Convert to local space since tube positions are in local space
        if (this.trackedObject) {
            const worldPos = this.trackedObject.getTransform().getWorldPosition();
            if (this.isInsideCollider(worldPos)) {
                // Transform world position to local space
                const invWorld = this.sceneObject.getTransform().getInvertedWorldTransform();
                this.lastValidTargetPos = invWorld.multiplyPoint(worldPos);
            }
        }
        this.mainPass.TargetPosition = this.lastValidTargetPos;
    }

    private generateMesh(): void {
        // Encoding (position/normal get distorted, use UVs for all data):
        //   texture0 = (localX, localY) unit circle coords for cross-section
        //   texture1 = (startX, startZ) starting position in XZ plane
        //   texture2 = (startY, t) starting Y position and t parameter
        //   texture3 = (geoType) geometry type:
        //     0=trailCap, 1=trail, 3=particle (short trail), 4=arrow, 5=arrowCone, 6=arrowCap

        // Clear any existing meshes
        this.clearMeshes();

        // Initialize first mesh builder
        this.meshBuilders.push(this.createNewMeshBuilder());
        this.currentMeshIndex = 0;
        this.currentMeshVertexCount = 0;

        const pathLength = this._lengthSegments + 1;
        const circleSegments = this._radialSegments;
        const vertsPerTube = this.computeVertsPerTube();

        let totalTubes = 0;

        // Generate 3D grid of tubes (centered around origin)
        const halfExtent = (this._gridSize - 1) * this._gridSpacing / 2;
        for (let gx = 0; gx < this._gridSize; gx++) {
            for (let gy = 0; gy < this._gridSize; gy++) {
                for (let gz = 0; gz < this._gridSize; gz++) {
                    const startX = -halfExtent + gx * this._gridSpacing;
                    const startY = -halfExtent + gy * this._gridSpacing;
                    const startZ = -halfExtent + gz * this._gridSpacing;

                    // Check if we need a new mesh for this tube
                    this.startNewMeshIfNeeded(vertsPerTube);

                    if (this._tubeMode === TubeMode.Particles) {
                        this.generateParticle(startX, startY, startZ, circleSegments);
                    } else if (this._tubeMode === TubeMode.Arrows) {
                        this.generateArrow(startX, startY, startZ, circleSegments);
                    } else {
                        this.generateTrail(startX, startY, startZ, pathLength, circleSegments);
                    }

                    this.currentMeshVertexCount += vertsPerTube;
                    totalTubes++;
                }
            }
        }

        // Finalize all mesh builders and create visuals
        let totalVerts = 0;
        for (let i = 0; i < this.meshBuilders.length; i++) {
            const builder = this.meshBuilders[i];
            if (builder.isValid()) {
                const visual = this.createMeshVisual();
                visual.mesh = builder.getMesh();
                builder.updateMesh();
                this.meshVisuals.push(visual);
                totalVerts += builder.getVerticesCount();
            }
        }

        const expectedVerts = this.computeVertexCount(
            this._gridSize,
            this._lengthSegments,
            this._tubeMode
        );
        const modeNames = ["Trails", "Particles", "Arrows"];

        if (totalVerts !== expectedVerts) {
            print("VectorFieldTubes: WARNING - Vertex count mismatch! Actual: " + totalVerts +
                  ", Expected: " + expectedVerts + " (diff: " + (totalVerts - expectedVerts) + ")");
        }

        print("VectorFieldTubes: Generated " + totalTubes + " " + modeNames[this._tubeMode] +
              " across " + this.meshBuilders.length + " mesh(es), " + totalVerts + " total vertices" +
              " (" + this._radialSegments + " radial, " + this._lengthSegments + " length)");
    }

    /**
     * Generate Trail mode: tube body that bends along field, flat caps at both ends
     */
    private generateTrail(startX: number, startY: number, startZ: number, pathLength: number, circleSegments: number): void {
        const meshBuilder = this.meshBuilders[this.currentMeshIndex];
        const startVertexIndex = meshBuilder.getVerticesCount();

        // Generate tube body vertices
        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,         // position (unused)
                    0.0, 0.0, 0.0,         // normal (unused)
                    localX, localY,        // texture0: unit circle coords
                    startX, startZ,        // texture1: starting position XZ
                    startY, t,             // texture2: startY, t parameter
                    1.0                    // texture3: geoType = trail
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

                meshBuilder.appendIndices([
                    current, next, currentNext,
                    next, nextNext, currentNext
                ]);
            }
        }

        // Generate flat caps at both ends
        this.generateTrailCaps(meshBuilder, startX, startY, startZ, startVertexIndex, pathLength, circleSegments);
    }

    /**
     * Generate flat caps for Trail mode (no cone)
     */
    private generateTrailCaps(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, startVertexIndex: number, pathLength: number, circleSegments: number): void {
        // START CAP (flat, at t = 0)
        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center
            startX, startZ,        // texture1: starting position XZ
            startY, 0.0,           // texture2: startY, t=0
            0.0                    // texture3: geoType = cap
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        // END CAP (flat, at t = 1)
        const endCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center
            startX, startZ,
            startY, 1.0,           // texture2: startY, t=1
            0.0                    // texture3: geoType = cap
        ]);

        const lastRingStart = startVertexIndex + (pathLength - 1) * circleSegments;
        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + (i + 1) % circleSegments;
            meshBuilder.appendIndices([endCapIndex, current, next]);
        }
    }

    /**
     * Generate Arrow mode: straight 2-ring tube with cone tip
     * Shader will orient and scale based on field at position
     */
    private generateArrow(startX: number, startY: number, startZ: number, circleSegments: number): void {
        const meshBuilder = this.meshBuilders[this.currentMeshIndex];
        const startVertexIndex = meshBuilder.getVerticesCount();

        // Just 2 rings for arrow body (t=0 base, t=1 before cone)
        for (let i = 0; i < 2; i++) {
            const t = i;  // 0 or 1

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,         // position (unused)
                    0.0, 0.0, 0.0,         // normal (unused)
                    localX, localY,        // texture0: unit circle coords
                    startX, startZ,        // texture1: starting position XZ
                    startY, t,             // texture2: startY, t
                    4.0                    // texture3: geoType = arrow
                ]);
            }
        }

        // Connect the two rings (arrow body)
        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            const currentNext = startVertexIndex + circleSegments + i;
            const nextNext = startVertexIndex + circleSegments + (i + 1) % circleSegments;

            meshBuilder.appendIndices([
                current, next, currentNext,
                next, nextNext, currentNext
            ]);
        }

        // START CAP (flat, at t = 0) - use geoType=6 for arrow caps
        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center
            startX, startZ,
            startY, 0.0,           // texture2: startY, t=0
            6.0                    // texture3: geoType = arrowCap
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        // CONE TIP (at t > 1)
        // Cone base ring (wider, at t=1)
        const coneBaseStart = meshBuilder.getVerticesCount();
        for (let j = 0; j < circleSegments; j++) {
            const theta = (j / circleSegments) * Math.PI * 2;
            const localX = Math.cos(theta) * this._coneRadius;
            const localY = Math.sin(theta) * this._coneRadius;

            meshBuilder.appendVerticesInterleaved([
                0.0, 0.0, 0.0,         // position (unused)
                0.0, 0.0, 0.0,         // normal (unused)
                localX, localY,        // texture0: scaled unit circle
                startX, startZ,
                startY, 1.0,           // texture2: startY, t=1 (cone base)
                5.0                    // texture3: geoType = arrowCone
            ]);
        }

        // Cone tip vertex - t=2.0 marks it as tip, shader uses ConeLength uniform
        const coneTipIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center (tip)
            startX, startZ,
            startY, 2.0,           // texture2: startY, t=2 marks cone tip
            5.0                    // texture3: geoType = arrowCone
        ]);

        // Connect cone base to tip
        for (let i = 0; i < circleSegments; i++) {
            const current = coneBaseStart + i;
            const next = coneBaseStart + (i + 1) % circleSegments;
            meshBuilder.appendIndices([current, next, coneTipIndex]);
        }

        // Connect arrow body end ring to cone base (skirt)
        const bodyEndRing = startVertexIndex + circleSegments;
        for (let i = 0; i < circleSegments; i++) {
            const tubeVert = bodyEndRing + i;
            const tubeNext = bodyEndRing + (i + 1) % circleSegments;
            const coneVert = coneBaseStart + i;
            const coneNext = coneBaseStart + (i + 1) % circleSegments;

            meshBuilder.appendIndices([
                tubeVert, tubeNext, coneVert,
                tubeNext, coneNext, coneVert
            ]);
        }
    }

    /**
     * Generate Particle mode: short trail (2 rings + caps)
     */
    private generateParticle(startX: number, startY: number, startZ: number, circleSegments: number): void {
        const meshBuilder = this.meshBuilders[this.currentMeshIndex];
        const startVertexIndex = meshBuilder.getVerticesCount();

        // 2 rings for a short tube
        for (let i = 0; i < 2; i++) {
            const t = i;  // 0 or 1

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,         // position (unused)
                    0.0, 0.0, 0.0,         // normal (unused)
                    localX, localY,        // texture0: unit circle coords
                    startX, startZ,        // texture1: starting position XZ
                    startY, t,             // texture2: startY, t
                    3.0                    // texture3: geoType = particle
                ]);
            }
        }

        // Connect the two rings
        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            const currentNext = startVertexIndex + circleSegments + i;
            const nextNext = startVertexIndex + circleSegments + (i + 1) % circleSegments;

            meshBuilder.appendIndices([
                current, next, currentNext,
                next, nextNext, currentNext
            ]);
        }

        // START CAP (flat, at t = 0)
        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center
            startX, startZ,        // texture1: starting position XZ
            startY, 0.0,           // texture2: startY, t=0
            0.0                    // texture3: geoType = trailCap (same as trail caps)
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        // END CAP (flat, at t = 1)
        const endCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: center
            startX, startZ,
            startY, 1.0,           // texture2: startY, t=1
            0.0                    // texture3: geoType = trailCap
        ]);

        const lastRingStart = startVertexIndex + circleSegments;
        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + (i + 1) % circleSegments;
            meshBuilder.appendIndices([endCapIndex, current, next]);
        }
    }

    private onUpdate(): void {
        this.updateMaterialParams();
    }

    public refresh(): void {
        this.adaptGeometryToBudget();
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

    /**
     * Set flow speed from normalized value (0-1)
     * Maps to range 0.0-100.0
     */
    public setFlowSpeedNormalized(value: number): void {
        this._flowSpeed = value * 100.0;
    }

    /**
     * Set desired length segments from normalized value (0-1)
     * Maps to range 2-64 (actual may be lower due to vertex budget)
     */
    public setLengthSegmentsNormalized(value: number): void {
        this._desiredLengthSegments = Math.floor(2 + value * 62);
        this.refresh();
    }

    /**
     * Set tube mode: 0=Trails, 1=Particles, 2=Arrows
     */
    public setTubeMode(mode: number): void {
        this._tubeMode = Math.floor(Math.min(2, Math.max(0, mode)));
        this.refresh();
    }

    /**
     * Set LOD level: 0=Low, 1=Medium, 2=High, 3=Ultra
     */
    public setLOD(level: number): void {
        this._lod = Math.floor(Math.min(3, Math.max(0, level)));
        this.applyLOD();
        this.refresh();
    }

    /**
     * Set LOD from normalized value (0-1)
     * Maps to LOD levels 0-3
     */
    public setLODNormalized(value: number): void {
        this._lod = Math.floor(Math.min(0.999, Math.max(0, value)) * 4);
        this.applyLOD();
        this.refresh();
    }

    // Property accessors

    /** Actual length segments used (may be less than desired due to budget) */
    get lengthSegments(): number { return this._lengthSegments; }

    /** Desired length segments (set this, actual may be adapted) */
    get desiredLengthSegments(): number { return this._desiredLengthSegments; }
    set desiredLengthSegments(value: number) {
        this._desiredLengthSegments = Math.max(VectorFieldTubes.MIN_LENGTH_SEGMENTS, Math.floor(value));
        this.refresh();
    }

    /** Radial segments (set by LOD) */
    get radialSegments(): number { return this._radialSegments; }

    /** Level of detail (0=Low, 1=Medium, 2=High, 3=Ultra) */
    get lod(): number { return this._lod; }
    set lod(value: number) {
        this._lod = Math.floor(Math.min(3, Math.max(0, value)));
        this.applyLOD();
        this.refresh();
    }

    get maxVertexCount(): number { return this._maxVertexCount; }
    set maxVertexCount(value: number) {
        this._maxVertexCount = Math.max(1000, Math.floor(value));
        this.refresh();
    }

    get tubeMode(): number { return this._tubeMode; }
    set tubeMode(value: number) {
        this._tubeMode = Math.floor(Math.min(2, Math.max(0, value)));
        this.refresh();
    }

    get coneLength(): number { return this._coneLength; }
    set coneLength(value: number) {
        this._coneLength = Math.max(0.1, value);
        this.refresh();
    }

    get coneRadius(): number { return this._coneRadius; }
    set coneRadius(value: number) {
        this._coneRadius = Math.max(1.0, value);
        this.refresh();
    }

    get arrowScale(): number { return this._arrowScale; }
    set arrowScale(value: number) {
        this._arrowScale = Math.max(0.1, value);
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

    get flowSpeed(): number { return this._flowSpeed; }
    set flowSpeed(value: number) {
        this._flowSpeed = value;
    }

    get preset(): number { return this._preset; }
    set preset(value: number) {
        this._preset = value;
    }
}
