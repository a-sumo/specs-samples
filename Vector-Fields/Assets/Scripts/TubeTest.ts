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

    @input
    @widget(new SliderWidget(1, 10, 1))
    @hint("Grid size X")
    private _gridSizeX: number = 5;

    @input
    @widget(new SliderWidget(1, 10, 1))
    @hint("Grid size Y")
    private _gridSizeY: number = 5;

    @input
    @widget(new SliderWidget(0.5, 5.0, 0.1))
    @hint("Spacing between tubes")
    private _gridSpacing: number = 1.5;

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
        this.mainPass.GridSpacing = this._gridSpacing;
        // ObjectPosition, ObjectRotation, ObjectScale wired in graph
    }

    private generateTube(): void {
        // GPU deformation approach for grid of tubes:
        // - Encode parametric data + grid position in vertices
        // - GPU computes actual positions via unique sine path per tube
        //
        // Encoding (position/normal get distorted, use UVs for data):
        //   position.z = t (0-1 along tube length)
        //   normal.z = 1 for tube vertices, 0 for cap centers
        //   texture0 = (localX, localY) unit circle coords
        //   texture1 = (gridX, gridY) grid indices

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

        // Generate grid of tubes (centered around origin)
        const offsetX = (this._gridSizeX - 1) / 2;
        const offsetY = (this._gridSizeY - 1) / 2;
        for (let gx = 0; gx < this._gridSizeX; gx++) {
            for (let gy = 0; gy < this._gridSizeY; gy++) {
                this.generateSingleTube(gx - offsetX, gy - offsetY, pathLength, circleSegments);
                totalTubes++;
            }
        }

        if (this.meshBuilder.isValid()) {
            this.meshVisual.mesh = this.meshBuilder.getMesh();
            this.meshBuilder.updateMesh();

            print("TubeTest: Generated " + totalTubes + " tubes (" +
                  this._gridSizeX + "x" + this._gridSizeY + " grid), " +
                  this.meshBuilder.getVerticesCount() + " total vertices");
        } else {
            print("TubeTest: ERROR - mesh not valid!");
        }
    }

    private generateSingleTube(gridX: number, gridY: number, pathLength: number, circleSegments: number): void {
        const startVertexIndex = this.meshBuilder.getVerticesCount();

        // Generate tube body vertices
        for (let i = 0; i < pathLength; i++) {
            const t = i / (pathLength - 1);

            for (let j = 0; j < circleSegments; j++) {
                const theta = (j / circleSegments) * Math.PI * 2;
                const localX = Math.cos(theta);
                const localY = Math.sin(theta);

                this.meshBuilder.appendVerticesInterleaved([
                    0.0, 0.0, t,           // position: unused, unused, t
                    0.0, 0.0, 1.0,         // normal: unused, unused, isTube=1
                    localX, localY,        // texture0: unit circle coords
                    gridX, gridY           // texture1: grid indices
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

        // Generate end caps for this tube
        this.generateSingleTubeCaps(gridX, gridY, startVertexIndex, pathLength, circleSegments);
    }

    private generateSingleTubeCaps(gridX: number, gridY: number, startVertexIndex: number, pathLength: number, circleSegments: number): void {
        const tubeVertexCount = pathLength * circleSegments;

        // START CAP (at t = 0)
        const startCapIndex = this.meshBuilder.getVerticesCount();
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position: unused, unused, t=0
            0.0, 0.0, 0.0,         // normal: unused, unused, isCap=0
            0.0, 0.0,              // texture0: center
            gridX, gridY           // texture1: grid indices
        ]);

        for (let i = 0; i < circleSegments; i++) {
            const current = startVertexIndex + i;
            const next = startVertexIndex + (i + 1) % circleSegments;
            this.meshBuilder.appendIndices([startCapIndex, next, current]);
        }

        // END CAP (at t = 1)
        const endCapIndex = this.meshBuilder.getVerticesCount();
        this.meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 1.0,         // position: unused, unused, t=1
            0.0, 0.0, 0.0,         // normal: unused, unused, isCap=0
            0.0, 0.0,              // texture0: center
            gridX, gridY           // texture1: grid indices
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

    get gridSizeX(): number { return this._gridSizeX; }
    set gridSizeX(value: number) {
        this._gridSizeX = Math.max(1, Math.floor(value));
        this.refresh();
    }

    get gridSizeY(): number { return this._gridSizeY; }
    set gridSizeY(value: number) {
        this._gridSizeY = Math.max(1, Math.floor(value));
        this.refresh();
    }

    get gridSpacing(): number { return this._gridSpacing; }
    set gridSpacing(value: number) {
        this._gridSpacing = value;
        this.refresh();
    }
}
