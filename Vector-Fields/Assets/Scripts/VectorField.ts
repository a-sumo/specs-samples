// VectorFieldTubes.ts
// Tube geometry that integrates a vector field on the GPU
// Based on TubeTest.ts pattern

enum TubeMode {
    Trails = 0,    // Flowing tubes that bend along field lines
    Particles = 1, // Billboard tracers - minimal geometry, same flow animation
    Arrows = 2     // Static arrows: orient + scale by field, cone tip
}

enum DomainMode {
    Volume = 0,
    SphereSurface = 1,
    PlaneY = 2
}

@component
export class VectorFieldTubes extends BaseScriptComponent {

    // Normalized default values (0-1) for: [preset, scale, radius, speed, length]
    // Use with setters: setPresetNormalized, setFieldScaleNormalized, setRadiusNormalized, setFlowSpeedNormalized, setLengthSegmentsNormalized
    public static readonly NORMALIZED_DEFAULTS: number[] = [0.0, 0.31, 0.16, 0.5, 0.10];
    private static readonly FIELD_RENDER_ORDER: number = 40;

    // ============ PERFORMANCE ============

    private static readonly MIN_LENGTH_SEGMENTS: number = 2;
    private static readonly MAX_LENGTH_SEGMENTS: number = 64;

    // LOD presets: [radialSegments, maxLengthSegments, gridSize]
    // Keep these deliberately lean; the shader does the visual work, and
    // mobile device first paint suffers most from CPU MeshBuilder bursts.
    private static readonly LOD_PRESETS: number[][] = [
        [3, 4, 4],    // 0: Lite
        [4, 6, 5],    // 1: Clear
        [4, 8, 6],    // 2: Sharp
        [5, 10, 7],   // 3: Mega
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
    private _maxVertexCount: number = 12000;

    // ============ MODE ============

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Trails", 0),
        new ComboBoxItem("Particles", 1),
        new ComboBoxItem("Arrows", 2)
    ]))
    @hint("Trails: flowing tubes, Particles: billboard tracers, Arrows: static oriented")
    private _tubeMode: number = 0;

    // ============ GEOMETRY ============

    private static readonly PARTICLE_FAN_SEGMENTS: number = 8;
    private static readonly SURFACE_SAMPLE_MULTIPLIER: number = 4;

    @input
    @widget(new SliderWidget(2, 64, 2))
    @hint("Desired segments along tube length (may be reduced to fit vertex budget)")
    private _desiredLengthSegments: number = 4;

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
    private _gridSize: number = 5;

    @input
    @widget(new SliderWidget(0.1, 5.0, 0.1))
    @hint("Spacing between tube start positions")
    private _gridSpacing: number = 0.6;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Volume", 0),
        new ComboBoxItem("Sphere Surface", 1),
        new ComboBoxItem("Y-Normal Plane", 2)
    ]))
    @hint("Where seeds are placed. Sphere Surface keeps the field on a globe-like shell.")
    private _domainMode: number = 0;

    @input
    @widget(new SliderWidget(1.0, 8.0, 0.1))
    @hint("Radius for sphere surface fields")
    private _sphereRadius: number = 4.8;

    @input
    @widget(new SliderWidget(2.0, 12.0, 0.1))
    @hint("Width of the Y-normal ambient plane domain")
    private _planeWidth: number = 6.8;

    @input
    @widget(new SliderWidget(1.0, 8.0, 0.1))
    @hint("Depth of the Y-normal ambient plane domain")
    private _planeDepth: number = 4.05;

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
        new ComboBoxItem("Burst", 0),
        new ComboBoxItem("Pull", 1),
        new ComboBoxItem("Orbit", 2),
        new ComboBoxItem("Waves", 3),
        new ComboBoxItem("Surface Wind", 8),
        new ComboBoxItem("Ambient Audio Plane", 9)
    ]))
    @hint("Vector field type")
    private _preset: number = 0;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("jet", 13),
        new ComboBoxItem("viridis", 17),
        new ComboBoxItem("plasma", 18)
    ]))
    @hint("Matplotlib-style colormap for speed/intensity.")
    private _colorMap: number = 17;

    @input
    @widget(new SliderWidget(0.05, 4.0, 0.01))
    @hint("Multiplies the normalized value before sampling the selected color gradient.")
    private _colorMapScale: number = 1.0;

    @input
    @widget(new SliderWidget(-1.0, 1.0, 0.01))
    @hint("Adds to the normalized value before sampling the selected color gradient.")
    private _colorMapOffset: number = 0.0;

    // ============ TRACKED OBJECT ============

    @input
    @hint("Object that affects the field - field reacts to its position")
    trackedObject: SceneObject = null as any;

    @input
    @hint("Box collider - field only animates when tracked object is inside")
    fieldCollider: ColliderComponent = null as any;

    // ============ MATERIAL ============

    @input
    @hint("Material with VectorFieldTubesShader.js")
    material: Material = null as any;

    // Multiple mesh support for large geometry counts
    private static readonly MAX_VERTS_PER_MESH: number = 32000;  // Safe UInt16 limit with headroom
    private meshBuilders: MeshBuilder[] = [];
    private meshVisuals: RenderMeshVisual[] = [];
    private currentMeshIndex: number = 0;
    private currentMeshVertexCount: number = 0;
    private mainPass: Pass = null as any;
    private refreshEvent: DelayedCallbackEvent | null = null;
    private refreshQueued: boolean = false;
    private hasGeneratedMesh: boolean = false;

    private createScriptApi(): void {
        const self = this;
        (this as any).fieldApi = {
            setPreset: (index: number) => self.setPreset(index),
            setTubeMode: (mode: number) => self.setTubeMode(mode),
            setDomainMode: (mode: number) => self.setDomainMode(mode),
            setSphereRadius: (radius: number) => self.setSphereRadius(radius),
            setFlowSpeedNormalized: (value: number) => self.setFlowSpeedNormalized(value),
            setFieldScaleNormalized: (value: number) => self.setFieldScaleNormalized(value),
            setRadiusNormalized: (value: number) => self.setRadiusNormalized(value),
            setLengthSegmentsNormalized: (value: number) => self.setLengthSegmentsNormalized(value),
            setArrowScaleNormalized: (value: number) => self.setArrowScaleNormalized(value),
            setColorMap: (value: number | string) => self.setColorMap(value),
            setPalette: (value: number | string) => self.setColorMap(value),
            setColorMapScale: (value: number) => self.setColorMapScale(value),
            setColorMapOffset: (value: number) => self.setColorMapOffset(value),
            setGradientScale: (value: number) => self.setColorMapScale(value),
            setGradientOffset: (value: number) => self.setColorMapOffset(value),
            updateMaterialParams: () => self.updateMaterialParams(),
            setAmbientChannels: (magnitude: number, yaw: number, bass: number, opacity?: number) =>
                self.setAmbientChannels(magnitude, yaw, bass, opacity),
            queueRefresh: (delaySeconds?: number) => self.queueRefresh(delaySeconds),
            refresh: () => self.refresh(),
            get preset(): number { return self.preset; },
            set preset(value: number) { self.preset = value; },
            get colorMap(): number { return self.colorMap; },
            set colorMap(value: number) { self.colorMap = value; },
            get colorMapScale(): number { return self.colorMapScale; },
            set colorMapScale(value: number) { self.colorMapScale = value; },
            get colorMapOffset(): number { return self.colorMapOffset; },
            set colorMapOffset(value: number) { self.colorMapOffset = value; },
            get tubeMode(): number { return self.tubeMode; },
            set tubeMode(value: number) { self.tubeMode = value; },
            get domainMode(): number { return self.domainMode; },
            set domainMode(value: number) { self.domainMode = value; },
            get sphereRadius(): number { return self.sphereRadius; },
            set sphereRadius(value: number) { self.sphereRadius = value; },
            get fieldScale(): number { return self.fieldScale; },
            set fieldScale(value: number) { self.fieldScale = value; },
            get radius(): number { return self.radius; },
            set radius(value: number) { self.radius = value; },
            get flowSpeed(): number { return self.flowSpeed; },
            set flowSpeed(value: number) { self.flowSpeed = value; },
            get stepSize(): number { return self.stepSize; },
            set stepSize(value: number) { self.stepSize = value; },
            get arrowScale(): number { return self.arrowScale; },
            set arrowScale(value: number) { self.arrowScale = value; },
        };
    }

    // ============ VERTEX BUDGET HELPERS ============

    /**
     * Apply LOD preset values
     */
    private applyLOD(): void {
        const preset = VectorFieldTubes.LOD_PRESETS[this._lod];
        this._radialSegments = preset[0];
        this._desiredLengthSegments = Math.min(this._desiredLengthSegments, preset[1]);
        this._gridSize = Math.min(this._gridSize, preset[2]);
    }

    /**
     * Compute vertex count for given parameters
     */
    public computeVertexCount(gridSize: number, lengthSegments: number, mode: number): number {
        const tubeCount = this.computeSeedCount(gridSize);
        const radial = this._radialSegments;

        if (mode === TubeMode.Particles) {
            // Particles: center vertex + billboard fan ring
            return tubeCount * (VectorFieldTubes.PARTICLE_FAN_SEGMENTS + 1);
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
        const tubeCount = this.computeSeedCount(gridSize);
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
                const radial = this._radialSegments;
                const vertsPerTube = this._tubeMode === TubeMode.Particles
                    ? (VectorFieldTubes.PARTICLE_FAN_SEGMENTS + 1)
                    : (2 * radial + radial + 1 + 1);  // arrows
                const maxTubes = Math.floor(this._maxVertexCount / vertsPerTube);
                const maxGrid = this._domainMode === DomainMode.SphereSurface || this._domainMode === DomainMode.PlaneY
                    ? Math.floor(Math.sqrt(maxTubes / VectorFieldTubes.SURFACE_SAMPLE_MULTIPLIER))
                    : Math.floor(Math.pow(maxTubes, 1/3));
                const nextGrid = Math.max(1, Math.min(this._gridSize, maxGrid));
                if (nextGrid < this._gridSize) {
                    const suffix = this._domainMode === DomainMode.SphereSurface
                        ? " surface grid"
                        : this._domainMode === DomainMode.PlaneY
                        ? " plane grid"
                        : "³";
                    print("VectorFieldTubes: Reducing grid " + this._gridSize + suffix + " → " + nextGrid +
                          suffix + " to stay under " + this._maxVertexCount + " vertices");
                    this._gridSize = nextGrid;
                }
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
        this.createScriptApi();
        this.setupMeshVisual();
        this.refreshEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
        this.refreshEvent.bind(() => {
            this.refreshQueued = false;
            this.refresh();
        });
        this.applyLOD();
        this.adaptGeometryToBudget();
        this.generateMesh();
        this.updateMaterialParams();
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

        const tubeCount = this.computeSeedCount(this._gridSize);
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
        this.setVisualRenderOrder(visual, VectorFieldTubes.FIELD_RENDER_ORDER);
        return visual;
    }

    private setVisualRenderOrder(visual: RenderMeshVisual, renderOrder: number): void {
        const anyVisual = visual as any;
        try {
            if (typeof anyVisual.setRenderOrder === "function") anyVisual.setRenderOrder(renderOrder);
            if (anyVisual.renderOrder !== undefined) anyVisual.renderOrder = renderOrder;
            if (anyVisual.RenderOrder !== undefined) anyVisual.RenderOrder = renderOrder;
        } catch (e) {}
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
            return VectorFieldTubes.PARTICLE_FAN_SEGMENTS + 1;
        } else if (this._tubeMode === TubeMode.Arrows) {
            return 2 * radial + radial + 1 + 1;
        } else {
            return (this._lengthSegments + 1) * radial + 2;
        }
    }

    private computeSeedCount(gridSize: number): number {
        if (this._domainMode === DomainMode.SphereSurface) {
            return Math.max(8, gridSize * gridSize * VectorFieldTubes.SURFACE_SAMPLE_MULTIPLIER);
        }
        if (this._domainMode === DomainMode.PlaneY) {
            return Math.max(12, Math.max(4, gridSize * 4) * Math.max(3, gridSize * 2));
        }
        return gridSize * gridSize * gridSize;
    }

    private computeSpherePoint(index: number, count: number): vec3 {
        const goldenAngle = Math.PI * (3.0 - Math.sqrt(5.0));
        const y = 1.0 - (2.0 * (index + 0.5)) / count;
        const ring = Math.sqrt(Math.max(0.0, 1.0 - y * y));
        const theta = index * goldenAngle;
        return new vec3(
            Math.cos(theta) * ring * this._sphereRadius,
            y * this._sphereRadius,
            Math.sin(theta) * ring * this._sphereRadius
        );
    }

    private computePlanePoint(index: number): vec3 {
        const cols = Math.max(4, this._gridSize * 4);
        const rows = Math.max(3, this._gridSize * 2);
        const col = index % cols;
        const row = Math.floor(index / cols);
        const u = cols <= 1 ? 0.5 : col / (cols - 1);
        const v = rows <= 1 ? 0.5 : row / (rows - 1);
        const jitterX = (this.hash01(index * 19.17 + 2.3) - 0.5) * this._planeWidth / Math.max(8, cols);
        const jitterZ = (this.hash01(index * 41.11 + 7.9) - 0.5) * this._planeDepth / Math.max(8, rows);
        return new vec3(
            (u - 0.5) * this._planeWidth + jitterX,
            0.0,
            (v - 0.5) * this._planeDepth + jitterZ
        );
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
        this.mainPass.Preset = this._preset + this._colorMap * 0.01;
        this.mainPass.ColorMapScale = this._colorMapScale;
        this.mainPass.ColorMapOffset = this._colorMapOffset;
        this.mainPass.Time = getTime();
        this.mainPass.FlowSpeed = this._flowSpeed;
        this.mainPass.ArrowScale = this._arrowScale;
        this.mainPass.ConeLength = this._coneLength;
        this.mainPass.ConeRadius = this._coneRadius;

        // Only update target position if inside collider bounds
        // Convert to local space since tube positions are in local space
        if (this.trackedObject && this._preset !== 9) {
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

        if (this._domainMode === DomainMode.SphereSurface) {
            const seedCount = this.computeSeedCount(this._gridSize);
            for (let i = 0; i < seedCount; i++) {
                const p = this.computeSpherePoint(i, seedCount);
                this.startNewMeshIfNeeded(vertsPerTube);

                if (this._tubeMode === TubeMode.Particles) {
                    this.generateParticle(p.x, p.y, p.z);
                } else if (this._tubeMode === TubeMode.Arrows) {
                    this.generateArrow(p.x, p.y, p.z, circleSegments);
                } else {
                    this.generateTrail(p.x, p.y, p.z, pathLength, circleSegments);
                }

                this.currentMeshVertexCount += vertsPerTube;
                totalTubes++;
            }
        } else if (this._domainMode === DomainMode.PlaneY) {
            const seedCount = this.computeSeedCount(this._gridSize);
            for (let i = 0; i < seedCount; i++) {
                const p = this.computePlanePoint(i);
                this.startNewMeshIfNeeded(vertsPerTube);

                if (this._tubeMode === TubeMode.Particles) {
                    this.generateParticle(p.x, p.y, p.z);
                } else if (this._tubeMode === TubeMode.Arrows) {
                    this.generateArrow(p.x, p.y, p.z, circleSegments);
                } else {
                    this.generateTrail(p.x, p.y, p.z, pathLength, circleSegments);
                }

                this.currentMeshVertexCount += vertsPerTube;
                totalTubes++;
            }
        } else {
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
                        this.generateParticle(startX, startY, startZ);
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
        this.hasGeneratedMesh = totalVerts > 0;
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
     * Generate Particle mode: billboard triangle fan, one small sprite per seed.
     */
    private generateParticle(startX: number, startY: number, startZ: number): void {
        const meshBuilder = this.meshBuilders[this.currentMeshIndex];
        const startVertexIndex = meshBuilder.getVerticesCount();
        const segments = VectorFieldTubes.PARTICLE_FAN_SEGMENTS;

        meshBuilder.appendVerticesInterleaved([
            0.0, 0.0, 0.0,         // position (unused)
            0.0, 0.0, 0.0,         // normal (unused)
            0.0, 0.0,              // texture0: fan center
            startX, startZ,        // texture1: starting position XZ
            startY, 0.0,           // texture2: startY, unused t
            3.0                    // texture3: geoType = particle
        ]);

        for (let j = 0; j < segments; j++) {
            const theta = (j / segments) * Math.PI * 2;
            meshBuilder.appendVerticesInterleaved([
                0.0, 0.0, 0.0,
                0.0, 0.0, 0.0,
                Math.cos(theta), Math.sin(theta),
                startX, startZ,
                startY, 1.0,
                3.0
            ]);
        }

        for (let j = 0; j < segments; j++) {
            const current = startVertexIndex + 1 + j;
            const next = startVertexIndex + 1 + ((j + 1) % segments);
            meshBuilder.appendIndices([startVertexIndex, current, next]);
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

    public queueRefresh(delaySeconds: number = 0.04): void {
        if (!this.refreshEvent) {
            this.refresh();
            return;
        }
        this.refreshQueued = true;
        this.refreshEvent.reset(delaySeconds);
    }

    public isReady(): boolean {
        return this.hasGeneratedMesh && !this.refreshQueued;
    }

    public enterLoadingMode(): void {
        this.clearMeshes();
        this.hasGeneratedMesh = false;
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Set preset from normalized value (0-1)
     * Maps to presets 0-3 (Burst, Pull, Orbit, Waves)
     */
    public setPresetNormalized(value: number): void {
        this._preset = Math.floor(Math.min(0.999, Math.max(0, value)) * 4);
    }

    /**
     * Set preset by index (0-9)
     */
    public setPreset(index: number): void {
        this._preset = Math.floor(Math.min(9, Math.max(0, index)));
    }

    public setColorMap(value: number | string): void {
        this._colorMap = this.normalizeColorMap(value);
        this.updateMaterialParams();
    }

    public setColorMapScale(value: number): void {
        if (isNaN(value)) return;
        this._colorMapScale = Math.max(-8.0, Math.min(8.0, value));
        this.updateMaterialParams();
    }

    public setColorMapOffset(value: number): void {
        if (isNaN(value)) return;
        this._colorMapOffset = Math.max(-8.0, Math.min(8.0, value));
        this.updateMaterialParams();
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

    public setArrowScaleNormalized(value: number): void {
        this._arrowScale = 0.25 + Math.max(0.0, Math.min(1.0, value)) * 3.5;
    }

    public setAmbientChannels(magnitude: number, yaw: number, bass: number, opacity?: number): void {
        this.lastValidTargetPos = new vec3(
            Math.max(0.0, Math.min(1.0, yaw)),
            Math.max(0.0, Math.min(1.0, bass)),
            Math.max(0.0, Math.min(1.0, opacity === undefined ? magnitude : opacity))
        );
    }

    /**
     * Set desired length segments from normalized value (0-1)
     * Maps to range 2-64 (actual may be lower due to vertex budget)
     */
    public setLengthSegmentsNormalized(value: number): void {
        this._desiredLengthSegments = Math.floor(2 + value * 62);
        this.queueRefresh();
    }

    /**
     * Set tube mode: 0=Trails, 1=Particles, 2=Arrows
     */
    public setTubeMode(mode: number): void {
        const nextMode = Math.floor(Math.min(2, Math.max(0, mode)));
        if (nextMode === this._tubeMode) return;
        this._tubeMode = nextMode;
        this.queueRefresh();
    }

    /**
     * Set domain mode: 0=Volume, 1=Sphere Surface, 2=Y-normal plane
     */
    public setDomainMode(mode: number): void {
        const nextMode = Math.floor(Math.min(2, Math.max(0, mode)));
        if (nextMode === this._domainMode) return;
        this._domainMode = nextMode;
        this.queueRefresh();
    }

    public setSphereRadius(radius: number): void {
        const nextRadius = Math.max(0.5, radius);
        if (Math.abs(nextRadius - this._sphereRadius) < 0.001) return;
        this._sphereRadius = nextRadius;
        if (this._domainMode === DomainMode.SphereSurface) {
            this.queueRefresh();
        }
    }

    /**
     * Set LOD level: 0=Low, 1=Medium, 2=High, 3=Ultra
     */
    public setLOD(level: number): void {
        const nextLOD = Math.floor(Math.min(3, Math.max(0, level)));
        if (nextLOD === this._lod) return;
        this._lod = nextLOD;
        this.applyLOD();
        this.queueRefresh();
    }

    /**
     * Set LOD from normalized value (0-1)
     * Maps to LOD levels 0-3
     */
    public setLODNormalized(value: number): void {
        const nextLOD = Math.floor(Math.min(0.999, Math.max(0, value)) * 4);
        if (nextLOD === this._lod) return;
        this._lod = nextLOD;
        this.applyLOD();
        this.queueRefresh();
    }

    // Property accessors

    /** Actual length segments used (may be less than desired due to budget) */
    get lengthSegments(): number { return this._lengthSegments; }

    /** Desired length segments (set this, actual may be adapted) */
    get desiredLengthSegments(): number { return this._desiredLengthSegments; }
    set desiredLengthSegments(value: number) {
        const nextValue = Math.max(VectorFieldTubes.MIN_LENGTH_SEGMENTS, Math.floor(value));
        if (nextValue === this._desiredLengthSegments) return;
        this._desiredLengthSegments = nextValue;
        this.queueRefresh();
    }

    /** Radial segments (set by LOD) */
    get radialSegments(): number { return this._radialSegments; }

    /** Level of detail (0=Low, 1=Medium, 2=High, 3=Ultra) */
    get lod(): number { return this._lod; }
    set lod(value: number) {
        const nextLOD = Math.floor(Math.min(3, Math.max(0, value)));
        if (nextLOD === this._lod) return;
        this._lod = nextLOD;
        this.applyLOD();
        this.queueRefresh();
    }

    get maxVertexCount(): number { return this._maxVertexCount; }
    set maxVertexCount(value: number) {
        const nextValue = Math.max(1000, Math.floor(value));
        if (nextValue === this._maxVertexCount) return;
        this._maxVertexCount = nextValue;
        this.queueRefresh();
    }

    get tubeMode(): number { return this._tubeMode; }
    set tubeMode(value: number) {
        const nextMode = Math.floor(Math.min(2, Math.max(0, value)));
        if (nextMode === this._tubeMode) return;
        this._tubeMode = nextMode;
        this.queueRefresh();
    }

    get coneLength(): number { return this._coneLength; }
    set coneLength(value: number) {
        const nextValue = Math.max(0.1, value);
        if (Math.abs(nextValue - this._coneLength) < 0.001) return;
        this._coneLength = nextValue;
        this.queueRefresh();
    }

    get coneRadius(): number { return this._coneRadius; }
    set coneRadius(value: number) {
        const nextValue = Math.max(1.0, value);
        if (Math.abs(nextValue - this._coneRadius) < 0.001) return;
        this._coneRadius = nextValue;
        this.queueRefresh();
    }

    get arrowScale(): number { return this._arrowScale; }
    set arrowScale(value: number) {
        this._arrowScale = Math.max(0.1, value);
    }

    get radius(): number { return this._radius; }
    set radius(value: number) { this._radius = value; }

    get gridSize(): number { return this._gridSize; }
    set gridSize(value: number) {
        const nextValue = Math.max(1, Math.floor(value));
        if (nextValue === this._gridSize) return;
        this._gridSize = nextValue;
        this.queueRefresh();
    }

    get gridSpacing(): number { return this._gridSpacing; }
    set gridSpacing(value: number) {
        if (Math.abs(value - this._gridSpacing) < 0.001) return;
        this._gridSpacing = value;
        this.queueRefresh();
    }

    get domainMode(): number { return this._domainMode; }
    set domainMode(value: number) {
        const nextMode = Math.floor(Math.min(2, Math.max(0, value)));
        if (nextMode === this._domainMode) return;
        this._domainMode = nextMode;
        this.queueRefresh();
    }

    get sphereRadius(): number { return this._sphereRadius; }
    set sphereRadius(value: number) {
        const nextRadius = Math.max(0.5, value);
        if (Math.abs(nextRadius - this._sphereRadius) < 0.001) return;
        this._sphereRadius = nextRadius;
        if (this._domainMode === DomainMode.SphereSurface) {
            this.queueRefresh();
        }
    }

    get planeWidth(): number { return this._planeWidth; }
    set planeWidth(value: number) {
        const nextValue = Math.max(0.5, value);
        if (Math.abs(nextValue - this._planeWidth) < 0.001) return;
        this._planeWidth = nextValue;
        if (this._domainMode === DomainMode.PlaneY) {
            this.queueRefresh();
        }
    }

    get planeDepth(): number { return this._planeDepth; }
    set planeDepth(value: number) {
        const nextValue = Math.max(0.5, value);
        if (Math.abs(nextValue - this._planeDepth) < 0.001) return;
        this._planeDepth = nextValue;
        if (this._domainMode === DomainMode.PlaneY) {
            this.queueRefresh();
        }
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
        this._preset = Math.floor(Math.min(9, Math.max(0, value)));
    }

    get colorMap(): number { return this._colorMap; }
    set colorMap(value: number) {
        this.setColorMap(value);
    }

    get colorMapScale(): number { return this._colorMapScale; }
    set colorMapScale(value: number) {
        this.setColorMapScale(value);
    }

    get colorMapOffset(): number { return this._colorMapOffset; }
    set colorMapOffset(value: number) {
        this.setColorMapOffset(value);
    }

    private normalizeColorMap(value: number | string): number {
        if (typeof value === "string") {
            const key = value.toLowerCase();
            if (key === "flag") return 0;
            if (key === "prism") return 1;
            if (key === "ocean") return 2;
            if (key === "gist_earth") return 3;
            if (key === "terrain") return 4;
            if (key === "gist_stern") return 5;
            if (key === "gnuplot") return 6;
            if (key === "gnuplot2") return 7;
            if (key === "cmrmap") return 8;
            if (key === "cubehelix") return 9;
            if (key === "brg") return 10;
            if (key === "gist_rainbow") return 11;
            if (key === "rainbow") return 12;
            if (key === "jet") return 13;
            if (key === "turbo") return 14;
            if (key === "nipy_spectral") return 15;
            if (key === "gist_ncar") return 16;
            if (key === "viridis") return 17;
            if (key === "plasma") return 18;
            return 17;
        }
        return Math.floor(Math.min(18, Math.max(0, value)));
    }

    private hash01(value: number): number {
        return this.fract(Math.sin(value * 12.9898) * 43758.5453123);
    }

    private fract(value: number): number {
        return value - Math.floor(value);
    }
}
