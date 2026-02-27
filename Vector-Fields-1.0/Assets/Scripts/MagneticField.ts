// MagneticFieldTubes.ts
// Tube geometry that visualizes magnetic field from two dipole magnets
// Magnet orientation: +X axis points from S to N pole (aligned with capsule mesh)
// Rotate magnet to change pole direction

enum MagneticTubeMode {
    Trails = 0,    // Flowing tubes that bend along field lines
    Particles = 1, // Short trails - minimal geometry, same flow animation
    Arrows = 2     // Static arrows: orient + scale by field, cone tip
}

@component
export class MagneticFieldTubes extends BaseScriptComponent {

    // ============ PERFORMANCE ============

    private static readonly MIN_LENGTH_SEGMENTS: number = 2;
    private static readonly MAX_LENGTH_SEGMENTS: number = 64;

    // LOD presets: [radialSegments, maxLengthSegments, gridSize]
    private static readonly LOD_PRESETS: number[][] = [
        [4, 6, 4],    // 0: Low - 64 tubes
        [5, 10, 5],   // 1: Medium - 125 tubes
        [6, 16, 6],   // 2: High - 216 tubes
        [8, 24, 7],   // 3: Ultra - 343 tubes
    ];

    private _lod: number = 1;  // Default to Medium
    private _radialSegments: number = 5;

    @input
    @widget(new SliderWidget(10000, 100000, 5000))
    @hint("Maximum vertex count budget - geometry adapts to stay below this")
    private _maxVertexCount: number = 40000;

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
    private _desiredLengthSegments: number = 32;

    private _lengthSegments: number = 32;

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
    @widget(new SliderWidget(0.05, 1.0, 0.05))
    @hint("Arrow length scale factor (multiplied by field magnitude)")
    private _arrowScale: number = 0.15;

    // ============ GRID ============

    @input
    @widget(new SliderWidget(1, 10, 1))
    @hint("Grid size (NxNxN)")
    private _gridSize: number = 5;

    @input
    @widget(new SliderWidget(0.1, 5.0, 0.1))
    @hint("Spacing between tube start positions")
    private _gridSpacing: number = 1.0;

    // ============ INTEGRATION ============

    @input
    @widget(new SliderWidget(0.01, 0.5, 0.01))
    @hint("Step size for field integration")
    private _stepSize: number = 0.1;

    @input
    @widget(new SliderWidget(0.1, 10.0, 0.1))
    @hint("Field strength multiplier")
    private _fieldStrength: number = 1.0;

    @input
    @widget(new SliderWidget(0.0, 50.0, 0.5))
    @hint("Speed at which tubes flow along field lines")
    private _flowSpeed: number = 2.0;

    // ============ MAGNETS ============

    @input
    @hint("First magnet object - Y rotation determines N/S orientation")
    magnet1: SceneObject;

    @input
    @hint("Second magnet object - Y rotation determines N/S orientation")
    magnet2: SceneObject;

    // ============ MATERIAL ============

    @input
    @hint("Material with MagneticFieldTubesShader.js")
    material: Material;

    private meshVisuals: RenderMeshVisual[] = [];
    private mainPass: Pass;
    private _baseFlowSpeed: number = -1;

    private readonly MAX_VERTICES_PER_MESH = 65000;

    // Normalized defaults: [stepSize, fieldStrength, radius, flowSpeed, lengthSegments]
    public static readonly NORMALIZED_DEFAULTS: number[] = [0.18, 0.09, 0.16, 0.04, 0.48];

    // ============ VERTEX BUDGET HELPERS ============

    private computeVertexCount(gridSize: number, lengthSegments: number, mode: number): number {
        const tubeCount = gridSize * gridSize * gridSize;
        const radial = this._radialSegments;

        if (mode === MagneticTubeMode.Particles) {
            return tubeCount * (2 * radial + 2);
        } else if (mode === MagneticTubeMode.Arrows) {
            const tubeVerts = 2 * radial;
            const coneVerts = radial + 1;
            const startCapVerts = 1;
            return tubeCount * (tubeVerts + coneVerts + startCapVerts);
        } else {
            const tubeVerts = (lengthSegments + 1) * radial;
            const capVerts = 2;
            return tubeCount * (tubeVerts + capVerts);
        }
    }

    private computeMaxLengthSegments(gridSize: number, maxVertices: number, mode: number): number {
        if (mode === MagneticTubeMode.Particles || mode === MagneticTubeMode.Arrows) {
            return MagneticFieldTubes.MIN_LENGTH_SEGMENTS;
        }

        const tubeCount = gridSize * gridSize * gridSize;
        const radial = this._radialSegments;
        const capVerts = 2;

        const budgetPerTube = Math.floor(maxVertices / tubeCount);
        const lengthSegments = Math.floor((budgetPerTube - capVerts) / radial) - 1;

        return Math.max(
            MagneticFieldTubes.MIN_LENGTH_SEGMENTS,
            Math.min(MagneticFieldTubes.MAX_LENGTH_SEGMENTS, lengthSegments)
        );
    }

    private applyLOD(): void {
        const preset = MagneticFieldTubes.LOD_PRESETS[this._lod];
        this._radialSegments = preset[0];
        this._desiredLengthSegments = preset[1];
        this._gridSize = preset[2];
    }

    private adaptGeometryToBudget(): void {
        const maxAllowed = this.computeMaxLengthSegments(
            this._gridSize,
            this._maxVertexCount,
            this._tubeMode
        );

        if (this._tubeMode === MagneticTubeMode.Particles || this._tubeMode === MagneticTubeMode.Arrows) {
            this._lengthSegments = MagneticFieldTubes.MIN_LENGTH_SEGMENTS;
        } else {
            this._lengthSegments = Math.min(this._desiredLengthSegments, maxAllowed);
        }

        const actualVerts = this.computeVertexCount(
            this._gridSize,
            this._lengthSegments,
            this._tubeMode
        );

        if (this._tubeMode === MagneticTubeMode.Trails && this._lengthSegments < this._desiredLengthSegments) {
            print("MagneticFieldTubes: Adapted lengthSegments " + this._desiredLengthSegments +
                  " → " + this._lengthSegments + " to fit vertex budget (" + actualVerts + "/" + this._maxVertexCount + ")");
        }
    }

    onAwake(): void {
        this.setupMaterial();
        this.applyLOD();
        this.adaptGeometryToBudget();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

        const tubeCount = this._gridSize * this._gridSize * this._gridSize;
        const modeNames = ["Trails", "Particles", "Arrows"];
        const lodNames = ["Low", "Medium", "High", "Ultra"];
        print("MagneticFieldTubes: Initialized " + tubeCount + " " + modeNames[this._tubeMode] + " (LOD: " + lodNames[this._lod] + ")");
    }

    private setupMaterial(): void {
        if (this.material) {
            this.mainPass = this.material.mainPass;
        } else {
            print("MagneticFieldTubes: WARNING - No material assigned!");
        }
    }

    private clearMeshVisuals(): void {
        for (const mv of this.meshVisuals) {
            if (mv) {
                mv.destroy();
            }
        }
        this.meshVisuals = [];
    }

    private createMeshVisual(): RenderMeshVisual {
        const mv = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            mv.mainMaterial = this.material;
        }
        this.meshVisuals.push(mv);
        return mv;
    }

    private getForwardVector(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(1, 0, 0);
        }
        const transform = obj.getTransform();
        const rotation = transform.getWorldRotation();
        const localForward = new vec3(1, 0, 0);
        return rotation.multiplyVec3(localForward);
    }

    private getMagnetLocalPosition(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(0, 0, 0);
        }
        const worldPos = obj.getTransform().getWorldPosition();
        const invWorld = this.sceneObject.getTransform().getInvertedWorldTransform();
        return invWorld.multiplyPoint(worldPos);
    }

    private getMagnetLocalForward(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(0, 0, 1);
        }
        const worldForward = this.getForwardVector(obj);
        const parentRotation = this.sceneObject.getTransform().getWorldRotation();
        const invRotation = parentRotation.invert();
        const localForward = invRotation.multiplyVec3(worldForward);
        const len = localForward.length;
        if (len < 0.001) {
            return new vec3(0, 0, 1);
        }
        return localForward.normalize();
    }

    private updateMaterialParams(): void {
        if (!this.mainPass) return;

        this.mainPass.TubeRadius = this._radius;
        this.mainPass.StepSize = this._stepSize;
        this.mainPass.NumSteps = this._lengthSegments;
        this.mainPass.FieldStrength = this._fieldStrength;
        this.mainPass.Time = getTime();
        this.mainPass.FlowSpeed = this._flowSpeed;
        this.mainPass.ArrowScale = this._arrowScale;
        this.mainPass.ConeLength = this._coneLength;
        this.mainPass.ConeRadius = this._coneRadius;

        if (this.magnet1) {
            this.mainPass.Magnet1Position = this.getMagnetLocalPosition(this.magnet1);
            this.mainPass.Magnet1Forward = this.getMagnetLocalForward(this.magnet1);
        } else {
            this.mainPass.Magnet1Position = new vec3(-2, 0, 0);
            this.mainPass.Magnet1Forward = new vec3(1, 0, 0);
        }

        if (this.magnet2) {
            this.mainPass.Magnet2Position = this.getMagnetLocalPosition(this.magnet2);
            this.mainPass.Magnet2Forward = this.getMagnetLocalForward(this.magnet2);
        } else {
            this.mainPass.Magnet2Position = new vec3(2, 0, 0);
            this.mainPass.Magnet2Forward = new vec3(-1, 0, 0);
        }
    }

    private generateMesh(): void {
        // Encoding (position/normal get distorted, use UVs for all data):
        //   texture0 = (localX, localY) unit circle coords for cross-section
        //   texture1 = (startX, startZ) starting position in XZ plane
        //   texture2 = (startY, t) starting Y position and t parameter
        //   texture3 = (geoType) geometry type:
        //     0=trailCap, 1=trail, 3=particle (short trail), 4=arrow, 5=arrowCone, 6=arrowCap

        this.clearMeshVisuals();

        const pathLength = this._lengthSegments + 1;
        const circleSegments = this._radialSegments;

        let vertsPerTube: number;
        if (this._tubeMode === MagneticTubeMode.Particles) {
            vertsPerTube = 2 * circleSegments + 2;
        } else if (this._tubeMode === MagneticTubeMode.Arrows) {
            vertsPerTube = 2 * circleSegments + circleSegments + 1 + 1;
        } else {
            vertsPerTube = pathLength * circleSegments + 2;
        }

        const maxTubesPerMesh = Math.floor(this.MAX_VERTICES_PER_MESH / vertsPerTube);

        const tubePositions: { x: number, y: number, z: number }[] = [];
        const halfExtent = (this._gridSize - 1) * this._gridSpacing / 2;
        for (let gx = 0; gx < this._gridSize; gx++) {
            for (let gy = 0; gy < this._gridSize; gy++) {
                for (let gz = 0; gz < this._gridSize; gz++) {
                    tubePositions.push({
                        x: -halfExtent + gx * this._gridSpacing,
                        y: -halfExtent + gy * this._gridSpacing,
                        z: -halfExtent + gz * this._gridSpacing
                    });
                }
            }
        }

        const totalTubes = tubePositions.length;
        const numMeshes = Math.ceil(totalTubes / maxTubesPerMesh);
        let tubeIndex = 0;
        let meshCount = 0;

        for (let meshIdx = 0; meshIdx < numMeshes; meshIdx++) {
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

            let tubesInThisMesh = 0;

            while (tubeIndex < totalTubes && tubesInThisMesh < maxTubesPerMesh) {
                const pos = tubePositions[tubeIndex];

                if (this._tubeMode === MagneticTubeMode.Particles) {
                    this.generateParticle(meshBuilder, pos.x, pos.y, pos.z, circleSegments);
                } else if (this._tubeMode === MagneticTubeMode.Arrows) {
                    this.generateArrow(meshBuilder, pos.x, pos.y, pos.z, circleSegments);
                } else {
                    this.generateTrail(meshBuilder, pos.x, pos.y, pos.z, pathLength, circleSegments);
                }

                tubesInThisMesh++;
                tubeIndex++;
            }

            if (meshBuilder.isValid()) {
                const mv = this.createMeshVisual();
                mv.mesh = meshBuilder.getMesh();
                meshBuilder.updateMesh();
                meshCount++;
            }
        }

        const modeNames = ["Trails", "Particles", "Arrows"];
        print("MagneticFieldTubes: Generated " + totalTubes + " " + modeNames[this._tubeMode] + " across " + meshCount + " mesh(es)");
    }

    private generateTrail(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, pathLength: number, circleSegments: number): void {
        const startVertexIndex = meshBuilder.getVerticesCount();

        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    localX, localY,
                    startX, startZ,
                    startY, t,
                    1.0
                ]);
            }
        }

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

        this.generateTrailCaps(meshBuilder, startX, startY, startZ, startVertexIndex, pathLength, circleSegments);
    }

    private generateTrailCaps(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, startVertexIndex: number, pathLength: number, circleSegments: number): void {
        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 0.0,
            0.0
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        const endCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 1.0,
            0.0
        ]);

        const lastRingStart = startVertexIndex + (pathLength - 1) * circleSegments;
        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + (i + 1) % circleSegments;
            meshBuilder.appendIndices([endCapIndex, current, next]);
        }
    }

    private generateArrow(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, circleSegments: number): void {
        const startVertexIndex = meshBuilder.getVerticesCount();

        for (let i = 0; i < 2; i++) {
            const t = i;

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    localX, localY,
                    startX, startZ,
                    startY, t,
                    4.0
                ]);
            }
        }

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

        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 0.0,
            6.0
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        const coneBaseStart = meshBuilder.getVerticesCount();
        for (let j = 0; j < circleSegments; j++) {
            const theta = (j / circleSegments) * Math.PI * 2;
            const localX = Math.cos(theta) * this._coneRadius;
            const localY = Math.sin(theta) * this._coneRadius;

            meshBuilder.appendVerticesInterleaved([
                0.0, 0.0, 0.0,
                0.0, 0.0, 0.0,
                localX, localY,
                startX, startZ,
                startY, 1.0,
                5.0
            ]);
        }

        const coneTipIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 2.0,
            5.0
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = coneBaseStart + i;
            const next = coneBaseStart + (i + 1) % circleSegments;
            meshBuilder.appendIndices([current, next, coneTipIndex]);
        }

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

    private generateParticle(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, circleSegments: number): void {
        const startVertexIndex = meshBuilder.getVerticesCount();

        for (let i = 0; i < 2; i++) {
            const t = i;

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    localX, localY,
                    startX, startZ,
                    startY, t,
                    3.0
                ]);
            }
        }

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

        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 0.0,
            0.0
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        const endCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY, 1.0,
            0.0
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

    public setFieldStrengthNormalized(value: number): void {
        this._fieldStrength = 0.1 + value * 9.9;
    }

    public setStepSizeNormalized(value: number): void {
        this._stepSize = 0.01 + value * 0.49;
    }

    public setRadiusNormalized(value: number): void {
        this._radius = 0.01 + value * 0.19;
    }

    public setFlowSpeedNormalized(value: number): void {
        this._flowSpeed = value * 50.0;
    }

    public setLengthSegmentsNormalized(value: number): void {
        this._desiredLengthSegments = Math.floor(2 + value * 62);
        this.refresh();
    }

    public setTubeMode(mode: number): void {
        this._tubeMode = Math.floor(Math.min(2, Math.max(0, mode)));
        this.refresh();
    }

    get lengthSegments(): number { return this._lengthSegments; }
    get desiredLengthSegments(): number { return this._desiredLengthSegments; }
    set desiredLengthSegments(value: number) {
        this._desiredLengthSegments = Math.max(MagneticFieldTubes.MIN_LENGTH_SEGMENTS, Math.floor(value));
        this.refresh();
    }

    get radialSegments(): number { return this._radialSegments; }

    get lod(): number { return this._lod; }
    set lod(value: number) {
        this._lod = Math.max(0, Math.min(MagneticFieldTubes.LOD_PRESETS.length - 1, Math.floor(value)));
        this.applyLOD();
        this.refresh();
    }

    public setLOD(level: number): void {
        this.lod = level;
    }

    public setLODNormalized(value: number): void {
        const maxIndex = MagneticFieldTubes.LOD_PRESETS.length - 1;
        this.lod = Math.round(value * maxIndex);
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
    set stepSize(value: number) { this._stepSize = value; }

    get fieldStrength(): number { return this._fieldStrength; }
    set fieldStrength(value: number) { this._fieldStrength = value; }

    get flowSpeed(): number { return this._flowSpeed; }
    set flowSpeed(value: number) { this._flowSpeed = value; }

    public syncFromPhysicsStrength(physicsForceStrength: number): void {
        if (this._baseFlowSpeed < 0) {
            this._baseFlowSpeed = this._flowSpeed;
        }
        const normalized = (physicsForceStrength - 1) / 499;
        const speedMultiplier = 1.0 + normalized * 4.0;
        this._flowSpeed = this._baseFlowSpeed * speedMultiplier;
        this._fieldStrength = 1.0 + normalized * 2.0;
    }
}
