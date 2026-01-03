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
        this.updateMaterialParams();  // Set initial values
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
        print("TubeTest: Created tube with " + this._lengthSegments + " length segments, " +
              this._radialSegments + " radial segments");
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
            this.mainPass = this.material.mainPass;
            print("TubeTest: Material assigned, mainPass set");
        } else {
            print("TubeTest: WARNING - No material assigned!");
        }
    }

    private updateMaterialParams(): void {
        if (!this.mainPass) return;
        this.mainPass.TubeRadius = this._radius;
        this.mainPass.TubeLength = this._length;
    }

    private generateTube(): void {
        // GPU deformation approach:
        // - Encode parametric data (t, angle) in vertices
        // - GPU computes actual positions via sine path + perpendicular frame
        //
        // Encoding:
        //   position.y = t (0-1 along tube length)
        //   normal.x = angle (0-1 around tube, -1 for cap centers)
        //   normal.y = 1 for tube vertices, 0 for cap centers

        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const pathLength = this._lengthSegments + 1;  // Number of rings
        const circleSegments = this._radialSegments;

        // Generate tube body vertices with local frame encoding
        // Store actual object-space positions so transforms work correctly
        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);  // 0 to 1 along tube
            const z = t * this._length;      // actual Z position in object space

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);  // -1 to 1
                const localY = Math.sin(theta);  // -1 to 1

                // Position: actual object-space coords (x=localX*radius, y=localY*radius, z)
                // This allows object transforms to work correctly
                const x = localX * this._radius;
                const y = localY * this._radius;

                this.meshBuilder.appendVerticesInterleaved([
                    x, y, z,               // position: actual object-space position
                    localX, localY, 1.0,   // normal: localX, localY, isTube=1
                    localX, localY         // texture0: unit circle coords for GPU deformation
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
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position: center at z=0
            0.0, 0.0, 0.0,         // normal: 0,0,0 = cap center
            0.0, 0.0               // texture0: localX=0, localY=0
        ]);

        const startCenterIndex = tubeVertexCount;

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
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, this._length,  // position: center at z=length
            0.0, 0.0, 0.0,           // normal: 0,0,0 = cap center
            0.0, 0.0                 // texture0: localX=0, localY=0
        ]);

        const endCenterIndex = tubeVertexCount + 1;
        const lastRingStart = (pathLength - 1) * circleSegments;

        for (let i = 0; i < circleSegments; i++) {
            const current = lastRingStart + i;
            const next = lastRingStart + ((i + 1) % circleSegments);
            this.meshBuilder.appendIndices([
                endCenterIndex, current, next
            ]);
        }
    }

    private onUpdate(): void {
        this.updateMaterialParams();
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
