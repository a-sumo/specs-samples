// TubeTest.ts
// Simple single tube with GPU sine deformation
// Step 1: Get smooth tube geometry working before adding vector field

@component
export class TubeTest extends BaseScriptComponent {

    @input
    @hint("Material with TubeTestShader.js")
    material: Material;

    @input
    @widget(new SliderWidget(8, 64, 4))
    @hint("Segments along tube length")
    private _lengthSegments: number = 32;

    @input
    @widget(new SliderWidget(3, 16, 1))
    @hint("Segments around tube circumference")
    private _radialSegments: number = 8;

    @input
    @widget(new SliderWidget(0.05, 0.5, 0.01))
    @hint("Tube radius")
    private _radius: number = 0.1;

    @input
    @widget(new SliderWidget(1.0, 10.0, 0.5))
    @hint("Tube length")
    private _length: number = 5.0;

    private meshBuilder!: MeshBuilder;
    private meshVisual!: RenderMeshVisual;
    private mainPass: Pass;

    onAwake(): void {
        this.setupMeshVisual();
        this.generateTube();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
        print("TubeTest: Created tube with " + this._lengthSegments + " length segments, " +
              this._radialSegments + " radial segments");
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
            this.mainPass = this.material.mainPass;
        }
    }

    private generateTube(): void {
        // Following VolumetricLine.ts pattern exactly:
        // - Compute actual positions on CPU (not encoded data for GPU)
        // - Use circleSegments vertices per ring (with modulo for indices)
        // - Order: getMesh() → assign → updateMesh()

        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const pathLength = this._lengthSegments + 1;  // Number of rings
        const circleSegments = this._radialSegments;

        // Generate a simple straight tube along Z axis for testing
        // (we can add deformation later once we confirm geometry works)
        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);  // 0 to 1
            const z = t * this._length;

            // Center of this ring
            const center = new vec3(0, 0, z);

            // For straight tube: forward = Z, right = X, up = Y
            const right = new vec3(1, 0, 0);
            const up = new vec3(0, 1, 0);

            // Generate circle vertices at this position
            for (let j = 0; j < circleSegments; j++) {
                const angle = (j / circleSegments) * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Offset from center
                const localX = cos * this._radius;
                const localY = sin * this._radius;

                const worldPos = new vec3(
                    center.x + right.x * localX + up.x * localY,
                    center.y + right.y * localX + up.y * localY,
                    center.z + right.z * localX + up.z * localY
                );

                // Normal points outward from center
                const normal = new vec3(cos, sin, 0);

                const uCoord = j / circleSegments;
                const vCoord = t;

                this.meshBuilder.appendVerticesInterleaved([
                    worldPos.x, worldPos.y, worldPos.z,
                    normal.x, normal.y, normal.z,
                    uCoord, vCoord
                ]);
            }
        }

        // Generate indices (flipped winding for correct face culling)
        for (let segment = 0; segment < pathLength - 1; segment++) {
            for (let i = 0; i < circleSegments; i++) {
                const current = segment * circleSegments + i;
                const next = segment * circleSegments + ((i + 1) % circleSegments);
                const currentNext = (segment + 1) * circleSegments + i;
                const nextNext = (segment + 1) * circleSegments + ((i + 1) % circleSegments);

                // Flipped winding order
                this.meshBuilder.appendIndices([
                    current, next, currentNext,
                    next, nextNext, currentNext
                ]);
            }
        }

        // Generate flat end caps
        this.generateEndCaps(pathLength, circleSegments);

        if (this.meshBuilder.isValid()) {
            // CRITICAL: This order matches VolumetricLine.ts
            this.meshVisual.mesh = this.meshBuilder.getMesh();
            this.meshBuilder.updateMesh();

            const tubeVerts = pathLength * circleSegments;
            const capVerts = 2;  // 2 center vertices for caps
            const totalVerts = tubeVerts + capVerts;
            const tubeTris = (pathLength - 1) * circleSegments * 2;
            const capTris = circleSegments * 2;  // triangles for both caps
            print("TubeTest: Generated " + totalVerts + " vertices, " + (tubeTris + capTris) + " triangles");
        } else {
            print("TubeTest: ERROR - mesh not valid!");
        }
    }

    private generateEndCaps(pathLength: number, circleSegments: number): void {
        const tubeVertexCount = pathLength * circleSegments;

        // ========================================
        // START CAP (at z = 0)
        // ========================================
        // Center vertex for start cap
        const startCenter = new vec3(0, 0, 0);
        const startNormal = new vec3(0, 0, 1);  // Points backward (out of tube)

        this.meshBuilder.appendVerticesInterleaved([
            startCenter.x, startCenter.y, startCenter.z,
            startNormal.x, startNormal.y, startNormal.z,
            0.5, 0.5  // UV at center
        ]);

        const startCenterIndex = tubeVertexCount;  // Index of start cap center vertex

        // Triangles from center to first ring vertices
        for (let i = 0; i < circleSegments; i++) {
            const current = i;
            const next = (i + 1) % circleSegments;
            this.meshBuilder.appendIndices([
                startCenterIndex, next, current
            ]);
        }

        // ========================================
        // END CAP (at z = length)
        // ========================================
        // Center vertex for end cap
        const endCenter = new vec3(0, 0, this._length);
        const endNormal = new vec3(0, 0, -1);  // Points forward (out of tube)

        this.meshBuilder.appendVerticesInterleaved([
            endCenter.x, endCenter.y, endCenter.z,
            endNormal.x, endNormal.y, endNormal.z,
            0.5, 0.5  // UV at center
        ]);

        const endCenterIndex = tubeVertexCount + 1;  // Index of end cap center vertex
        const lastRingStart = (pathLength - 1) * circleSegments;  // First vertex of last ring

        // Triangles from center to last ring vertices
        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + ((i + 1) % circleSegments);
            this.meshBuilder.appendIndices([
                endCenterIndex, current, next
            ]);
        }
    }

    private onUpdate(): void {
        if (this.mainPass) {
            this.mainPass.TubeRadius = this._radius;
            this.mainPass.TubeLength = this._length;
        }
    }

    public refresh(): void {
        this.generateTube();
    }

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

    get length(): number { return this._length; }
    set length(value: number) { this._length = value; }
}
