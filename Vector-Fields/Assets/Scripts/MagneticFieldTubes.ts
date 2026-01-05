// MagneticFieldTubes.ts
// Tube geometry that visualizes magnetic field from two dipole magnets
// Magnet orientation: Y-axis rotation determines N/S pole direction
// Forward vector (+Z in local space, rotated by Y rotation) points from S to N

@component
export class MagneticFieldTubes extends BaseScriptComponent {

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

    // Max vertices per mesh (UInt16 limit)
    private readonly MAX_VERTICES_PER_MESH = 65000;

    onAwake(): void {
        this.setupMeshVisual();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
        print("MagneticFieldTubes: Initialized " + (this._gridSize * this._gridSize * this._gridSize) + " tubes");
    }

    private setupMeshVisual(): void {
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

    // Get forward vector (from S to N pole) based on object's Y rotation
    // In local space, forward is +Z, and Y rotation rotates this in the XZ plane
    private getForwardVector(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(0, 0, 1);
        }

        const transform = obj.getTransform();
        const rotation = transform.getWorldRotation();

        // Forward vector in world space (local +Z rotated by world rotation)
        const localForward = new vec3(0, 0, 1);
        return rotation.multiplyVec3(localForward);
    }

    // Get magnet position in local space (relative to this component's scene object)
    private getMagnetLocalPosition(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(0, 0, 0);
        }

        const worldPos = obj.getTransform().getWorldPosition();
        const invWorld = this.sceneObject.getTransform().getInvertedWorldTransform();
        return invWorld.multiplyPoint(worldPos);
    }

    // Get magnet forward in local space
    private getMagnetLocalForward(obj: SceneObject): vec3 {
        if (!obj) {
            return new vec3(0, 0, 1);
        }

        const worldForward = this.getForwardVector(obj);
        const invWorld = this.sceneObject.getTransform().getInvertedWorldTransform();
        // Transform direction (not point) - use multiplyDirection
        return invWorld.multiplyDirection(worldForward).normalize();
    }

    private updateMaterialParams(): void {
        if (!this.mainPass) return;

        this.mainPass.TubeRadius = this._radius;
        this.mainPass.StepSize = this._stepSize;
        this.mainPass.NumSteps = this._lengthSegments;
        this.mainPass.FieldStrength = this._fieldStrength;
        this.mainPass.Time = getTime();
        this.mainPass.FlowSpeed = this._flowSpeed;

        // Magnet 1 position and forward (in local space)
        this.mainPass.Magnet1Position = this.getMagnetLocalPosition(this.magnet1);
        this.mainPass.Magnet1Forward = this.getMagnetLocalForward(this.magnet1);

        // Magnet 2 position and forward (in local space)
        this.mainPass.Magnet2Position = this.getMagnetLocalPosition(this.magnet2);
        this.mainPass.Magnet2Forward = this.getMagnetLocalForward(this.magnet2);
    }

    private generateMesh(): void {
        this.clearMeshVisuals();

        const pathLength = this._lengthSegments + 1;
        const circleSegments = this._radialSegments;

        const vertsPerTube = pathLength * circleSegments + 2;
        const maxTubesPerMesh = Math.floor(this.MAX_VERTICES_PER_MESH / vertsPerTube);
        const totalTubes = this._gridSize * this._gridSize * this._gridSize;
        const numMeshes = Math.ceil(totalTubes / maxTubesPerMesh);

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

        let tubeIndex = 0;
        let meshCount = 0;

        for (let meshIdx = 0; meshIdx < numMeshes; meshIdx++) {
            const meshBuilder = new MeshBuilder([
                { name: "position", components: 3 },
                { name: "normal", components: 3 },
                { name: "texture0", components: 2 },
                { name: "texture1", components: 2 },
                { name: "texture2", components: 1 },
            ]);
            meshBuilder.topology = MeshTopology.Triangles;
            meshBuilder.indexType = MeshIndexType.UInt16;

            let tubesInThisMesh = 0;

            while (tubeIndex < totalTubes && tubesInThisMesh < maxTubesPerMesh) {
                const pos = tubePositions[tubeIndex];
                this.generateSingleTubeToBuilder(meshBuilder, pos.x, pos.y, pos.z, pathLength, circleSegments);
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

        print("MagneticFieldTubes: Generated " + totalTubes + " tubes across " + meshCount + " meshes");
    }

    private generateSingleTubeToBuilder(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, pathLength: number, circleSegments: number): void {
        const startVertexIndex = meshBuilder.getVerticesCount();

        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, t,
                    0.0, 0.0, 1.0,
                    localX, localY,
                    startX, startZ,
                    startY
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

        this.generateSingleTubeCapsToBuilder(meshBuilder, startX, startY, startZ, startVertexIndex, pathLength, circleSegments);
    }

    private generateSingleTubeCapsToBuilder(meshBuilder: MeshBuilder, startX: number, startY: number, startZ: number, startVertexIndex: number, pathLength: number, circleSegments: number): void {
        const startCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        const endCapIndex = meshBuilder.getVerticesCount();
        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 1.0,
            0.0, 0.0, 0.0,
            0.0, 0.0,
            startX, startZ,
            startY
        ]);

        const lastRingStart = startVertexIndex + (pathLength - 1) * circleSegments;
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
        this._lengthSegments = Math.floor(8 + value * 56);
        this.refresh();
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
    set stepSize(value: number) { this._stepSize = value; }

    get fieldStrength(): number { return this._fieldStrength; }
    set fieldStrength(value: number) { this._fieldStrength = value; }

    get flowSpeed(): number { return this._flowSpeed; }
    set flowSpeed(value: number) { this._flowSpeed = value; }
}
