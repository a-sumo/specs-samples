// GamutProjectionMeshGenerator.ts
// Mesh-based gamut projection - finds nearest achievable pigment mix for each input color
// Creates cube meshes at projected positions in the chosen color space


@component
export class GamutProjectionMeshGenerator extends BaseScriptComponent {

    // ============ GEOMETRY ============

    @input
    @hint("Size of the display volume in scene units")
    private _displaySize: number = 100.0;

    @input
    @hint("Size of each voxel cube")
    @widget(new SliderWidget(0.1, 10, 0.1))
    private _voxelSize: number = 1.0;

    // ============ PROJECTION LINES ============

    @input
    @hint("Show lines connecting input to projected positions")
    private _showLines: boolean = true;

    @input
    @hint("Radius of projection line tubes")
    private _lineRadius: number = 0.3;

    @input
    @hint("Tube segments (3-12)")
    private _tubeSegments: number = 6;

    // ============ PROJECTION ============

    @input
    @hint("Projection blend: 0 = input, 1 = projected")
    @widget(new SliderWidget(0, 1, 0.01))
    private _projectionBlend: number = 1.0;

    // ============ MATERIAL ============

    @input
    @hint("Material for voxels")
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

    // ============ UI ============

    @input
    @hint("Text component to display active color space name")
    colorSpaceText: Text;

    // ============ GAMUT ============

    @input
    @hint("Resolution of pigment mix sampling for gamut LUT")
    @widget(new SliderWidget(5, 30, 1))
    private _gamutSampleSteps: number = 20;

    @input
    @hint("Maximum input colors to support")
    maxColors: number = 64;

    // ============ PIGMENTS ============

    @input
    @hint("Pigment 0: White")
    @widget(new ColorWidget())
    pig0Color: vec3 = new vec3(1, 1, 1);

    @input
    @hint("Pigment 1: Black")
    @widget(new ColorWidget())
    pig1Color: vec3 = new vec3(0.08, 0.08, 0.08);

    @input
    @hint("Pigment 2: Yellow")
    @widget(new ColorWidget())
    pig2Color: vec3 = new vec3(1, 0.92, 0);

    @input
    @hint("Pigment 3: Red")
    @widget(new ColorWidget())
    pig3Color: vec3 = new vec3(0.89, 0, 0.13);

    @input
    @hint("Pigment 4: Blue")
    @widget(new ColorWidget())
    pig4Color: vec3 = new vec3(0.1, 0.1, 0.7);

    @input
    @hint("Pigment 5: Green")
    @widget(new ColorWidget())
    pig5Color: vec3 = new vec3(0, 0.47, 0.44);

    // ============ PRIVATE STATE ============

    private static readonly NUM_PIGMENTS = 6;
    private static readonly COLOR_SPACE_NAMES = [
        "RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"
    ];
    private readonly D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

    private meshBuilder!: MeshBuilder;
    private meshVisual!: RenderMeshVisual;

    private currentPigments: vec3[] = [];
    private gamutLUT: { lab: vec3; rgb: vec3 }[] = [];

    // Input and projected colors
    private inputColors: vec3[] = [];
    private inputLAB: vec3[] = [];
    private projectedColors: vec3[] = [];
    private projectedLAB: vec3[] = [];
    private colorCount: number = 0;
    private mesh: RenderMesh | null = null;

    // Projection tween state
    private isTweening: boolean = false;
    private tweenStartValue: number = 0;
    private tweenEndValue: number = 1;
    private tweenDuration: number = 0.5; // seconds
    private tweenElapsed: number = 0;
    private updateEvent: SceneEvent | null = null;

    // Color space tween state (separate from projection tween)
    private isBlendTweening: boolean = false;
    private blendTweenStart: number = 0;
    private blendTweenEnd: number = 1;
    private blendTweenDuration: number = 0.5;
    private blendTweenElapsed: number = 0;

    onAwake(): void {
        this.initializePigments();
        this.buildGamutLUT();
        this.setupMeshVisual();

        // Test: project some sample colors on start
        this.createEvent("OnStartEvent").bind(() => {
            this.setInputColors([
                new vec3(1, 0, 0),      // red
                new vec3(0, 1, 0),      // green
                new vec3(0, 0, 1),      // blue
                new vec3(1, 1, 0),      // yellow
                new vec3(1, 0, 1),      // magenta
                new vec3(0, 1, 1),      // cyan
                new vec3(1, 0.5, 0),    // orange
                new vec3(0.5, 0, 0.5),  // purple
            ]);
            this.updateMaterialParams();
        });
    }

    private updateMaterialParams(): void {
        if (this.material) {
            const pass = this.material.mainPass;
            pass.colorSpaceFrom = this._colorSpaceFrom;
            pass.colorSpaceTo = this._colorSpaceTo;
            pass.blend = this._blend;
            pass.projectionBlend = this._projectionBlend;
            pass.cubeSize = this._displaySize;
        }
        this.updateColorSpaceText();
    }

    private updateColorSpaceText(): void {
        if (this.colorSpaceText) {
            const name = GamutProjectionMeshGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
            this.colorSpaceText.text = name;
        }
    }

    /** Get current color space name */
    public getColorSpaceName(): string {
        return GamutProjectionMeshGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
    }

    private initializePigments(): void {
        this.currentPigments = [
            this.pig0Color,
            this.pig1Color,
            this.pig2Color,
            this.pig3Color,
            this.pig4Color,
            this.pig5Color,
        ];
    }

    private setupMeshVisual(): void {
        this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual");
        if (this.material) {
            this.meshVisual.mainMaterial = this.material;
        }
    }

    // ============================================
    // KUBELKA-MUNK PIGMENT MIXING
    // ============================================

    private srgbToLinear(c: number): number {
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    private linearToSrgb(c: number): number {
        return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }

    private reflectanceToKS(R: number): number {
        R = Math.max(0.001, Math.min(0.999, R));
        return ((1 - R) * (1 - R)) / (2 * R);
    }

    private ksToReflectance(ks: number): number {
        return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    }

    private mixPigments(weights: number[]): vec3 {
        const ksSum = new vec3(0, 0, 0);

        for (let i = 0; i < this.currentPigments.length; i++) {
            if (weights[i] <= 0) continue;

            const c = this.currentPigments[i];
            const lin = new vec3(
                this.srgbToLinear(c.x),
                this.srgbToLinear(c.y),
                this.srgbToLinear(c.z)
            );
            const ks = new vec3(
                this.reflectanceToKS(lin.x),
                this.reflectanceToKS(lin.y),
                this.reflectanceToKS(lin.z)
            );

            ksSum.x += ks.x * weights[i];
            ksSum.y += ks.y * weights[i];
            ksSum.z += ks.z * weights[i];
        }

        const linMix = new vec3(
            this.ksToReflectance(ksSum.x),
            this.ksToReflectance(ksSum.y),
            this.ksToReflectance(ksSum.z)
        );

        return new vec3(
            Math.max(0, Math.min(1, this.linearToSrgb(linMix.x))),
            Math.max(0, Math.min(1, this.linearToSrgb(linMix.y))),
            Math.max(0, Math.min(1, this.linearToSrgb(linMix.z)))
        );
    }

    private buildGamutLUT(): void {
        this.gamutLUT = [];
        const steps = this._gamutSampleSteps;
        const n = GamutProjectionMeshGenerator.NUM_PIGMENTS;

        // Pure pigments
        for (let i = 0; i < n; i++) {
            const rgb = this.currentPigments[i];
            const lab = this.rgb2lab(rgb);
            this.gamutLUT.push({ rgb, lab });
        }

        // Two-way mixes
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                for (let s = 1; s < steps; s++) {
                    const t = s / steps;
                    const weights = new Array(n).fill(0);
                    weights[i] = 1 - t;
                    weights[j] = t;
                    const rgb = this.mixPigments(weights);
                    const lab = this.rgb2lab(rgb);
                    this.gamutLUT.push({ rgb, lab });
                }
            }
        }

        // Three-way mixes
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                for (let k = j + 1; k < n; k++) {
                    for (let si = 1; si < steps - 1; si++) {
                        for (let sj = 1; sj < steps - si; sj++) {
                            const wi = si / steps;
                            const wj = sj / steps;
                            const wk = 1 - wi - wj;
                            if (wk > 0) {
                                const weights = new Array(n).fill(0);
                                weights[i] = wi;
                                weights[j] = wj;
                                weights[k] = wk;
                                const rgb = this.mixPigments(weights);
                                const lab = this.rgb2lab(rgb);
                                this.gamutLUT.push({ rgb, lab });
                            }
                        }
                    }
                }
            }
        }
    }

    // ============================================
    // COLOR SPACE CONVERSIONS
    // ============================================

    private linearRgbToXyz(r: number, g: number, b: number): vec3 {
        return new vec3(
            r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
            r * 0.2126729 + g * 0.7151522 + b * 0.072175,
            r * 0.0193339 + g * 0.119192 + b * 0.9503041
        );
    }

    private xyzToLab(x: number, y: number, z: number): vec3 {
        const f = (t: number) =>
            t > Math.pow(6 / 29, 3)
                ? Math.pow(t, 1 / 3)
                : t / (3 * Math.pow(6 / 29, 2)) + 4 / 29;

        const fx = f(x / this.D65.X);
        const fy = f(y / this.D65.Y);
        const fz = f(z / this.D65.Z);

        return new vec3(116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz));
    }

    private xyzToLuv(x: number, y: number, z: number): vec3 {
        const yr = y / this.D65.Y;
        const L = yr > Math.pow(6 / 29, 3)
            ? 116 * Math.pow(yr, 1 / 3) - 16
            : Math.pow(29 / 3, 3) * yr;

        const denom = x + 15 * y + 3 * z;
        if (denom === 0) return new vec3(L, 0, 0);

        const u1 = (4 * x) / denom;
        const v1 = (9 * y) / denom;
        const denomR = this.D65.X + 15 * this.D65.Y + 3 * this.D65.Z;
        const u1r = (4 * this.D65.X) / denomR;
        const v1r = (9 * this.D65.Y) / denomR;

        return new vec3(L, 13 * L * (u1 - u1r), 13 * L * (v1 - v1r));
    }

    private linearRgbToOklab(r: number, g: number, b: number): vec3 {
        const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
        const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
        const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

        const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

        return new vec3(
            0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
        );
    }

    public rgb2lab(rgb: vec3): vec3 {
        const lr = this.srgbToLinear(rgb.x);
        const lg = this.srgbToLinear(rgb.y);
        const lb = this.srgbToLinear(rgb.z);
        const xyz = this.linearRgbToXyz(lr, lg, lb);
        return this.xyzToLab(xyz.x, xyz.y, xyz.z);
    }

    // Always generate in RGB space - shader handles color space transformation
    private rgbToDisplayPosition(r: number, g: number, b: number): vec3 {
        const size = this._displaySize;
        return new vec3(
            (r - 0.5) * size,
            (b - 0.5) * size,
            (g - 0.5) * size
        );
    }

    // ============================================
    // PROJECTION - FIND NEAREST GAMUT COLOR
    // ============================================

    private findNearestGamutColor(inputLAB: vec3): { lab: vec3; rgb: vec3; deltaE: number } {
        let minDistSq = Infinity;
        let bestMatch = { lab: new vec3(50, 0, 0), rgb: new vec3(0.5, 0.5, 0.5) };

        for (const sample of this.gamutLUT) {
            const dL = inputLAB.x - sample.lab.x;
            const da = inputLAB.y - sample.lab.y;
            const db = inputLAB.z - sample.lab.z;
            const distSq = dL * dL + da * da + db * db;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestMatch = sample;
            }
        }

        return {
            lab: bestMatch.lab,
            rgb: bestMatch.rgb,
            deltaE: Math.sqrt(minDistSq)
        };
    }

    private projectColors(): void {
        this.inputLAB = [];
        this.projectedColors = [];
        this.projectedLAB = [];

        for (const inputRGB of this.inputColors) {
            const lab = this.rgb2lab(inputRGB);
            this.inputLAB.push(lab);

            const nearest = this.findNearestGamutColor(lab);
            this.projectedColors.push(nearest.rgb);
            this.projectedLAB.push(nearest.lab);
        }
    }

    // ============================================
    // MESH GENERATION
    // ============================================

    private generateMesh(): void {
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },  // input r, g
            { name: "texture1", components: 2 },  // input b, projected r
            { name: "texture2", components: 2 },  // projected g, b
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        // Generate cubes in RGB space using INPUT colors (shader handles transformation)
        for (let i = 0; i < this.projectedColors.length; i++) {
            const inputRGB = this.inputColors[i];
            const projectedRGB = this.projectedColors[i];

            // Position in RGB space based on input color
            const inputPos = this.rgbToDisplayPosition(inputRGB.x, inputRGB.y, inputRGB.z);

            this.generateCube(
                inputPos.x, inputPos.y, inputPos.z,
                inputRGB.x, inputRGB.y, inputRGB.z,
                projectedRGB.x, projectedRGB.y, projectedRGB.z,
                this._voxelSize
            );

            // Generate tube connecting input to projected position
            if (this._showLines) {
                const projectedPos = this.rgbToDisplayPosition(projectedRGB.x, projectedRGB.y, projectedRGB.z);
                this.generateTube(
                    inputPos, projectedPos,
                    inputRGB.x, inputRGB.y, inputRGB.z,
                    projectedRGB.x, projectedRGB.y, projectedRGB.z,
                    this._lineRadius,
                    this._tubeSegments
                );
            }
        }

        if (this.meshBuilder.isValid()) {
            this.mesh = this.meshBuilder.getMesh();
            this.meshVisual.mesh = this.mesh;
            this.meshBuilder.updateMesh();
        }
    }

    private generateCube(
        cx: number, cy: number, cz: number,
        inR: number, inG: number, inB: number,
        prR: number, prG: number, prB: number,
        size: number
    ): void {
        const half = size * 0.5;

        // Pre-computed corner offsets and face data to avoid object allocation
        // 8 corners: [x,y,z] offsets from center
        const offsets = [
            -half, -half, -half,  // 0
             half, -half, -half,  // 1
             half,  half, -half,  // 2
            -half,  half, -half,  // 3
            -half, -half,  half,  // 4
             half, -half,  half,  // 5
             half,  half,  half,  // 6
            -half,  half,  half,  // 7
        ];

        // 6 faces: [nx, ny, nz, v0, v1, v2, v3]
        const faces = [
            0, 0, -1, 0, 1, 2, 3,  // back
            0, 0,  1, 5, 4, 7, 6,  // front
           -1, 0,  0, 4, 0, 3, 7,  // left
            1, 0,  0, 1, 5, 6, 2,  // right
            0, -1, 0, 4, 5, 1, 0,  // bottom
            0,  1, 0, 3, 2, 6, 7,  // top
        ];

        for (let f = 0; f < 6; f++) {
            const fi = f * 7;
            const nx = faces[fi], ny = faces[fi + 1], nz = faces[fi + 2];
            const faceStart = this.meshBuilder.getVerticesCount();

            for (let v = 0; v < 4; v++) {
                const vi = faces[fi + 3 + v] * 3;
                // UV layout: texture0 = (inR, inG), texture1 = (inB, prR), texture2 = (prG, prB)
                this.meshBuilder.appendVerticesInterleaved([
                    cx + offsets[vi], cy + offsets[vi + 1], cz + offsets[vi + 2],
                    nx, ny, nz,
                    inR, inG,
                    inB, prR,
                    prG, prB,
                ]);
            }

            this.meshBuilder.appendIndices([
                faceStart, faceStart + 1, faceStart + 2,
                faceStart, faceStart + 2, faceStart + 3,
            ]);
        }
    }

    /**
     * Generate a tube connecting two positions
     * Input end: vertices stay at input position (prRGB = inRGB)
     * Projected end: vertices stay at projected position (inRGB = prRGB)
     */
    private generateTube(
        startPos: vec3, endPos: vec3,
        inR: number, inG: number, inB: number,
        prR: number, prG: number, prB: number,
        radius: number,
        segments: number
    ): void {
        // Direction from start to end
        const dir = new vec3(
            endPos.x - startPos.x,
            endPos.y - startPos.y,
            endPos.z - startPos.z
        );
        const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        if (length < 0.001) return; // Skip if too short

        // Normalize direction
        const dirN = new vec3(dir.x / length, dir.y / length, dir.z / length);

        // Find perpendicular vectors for tube cross-section
        let perpA: vec3;
        if (Math.abs(dirN.y) < 0.9) {
            // Cross with up vector
            perpA = new vec3(
                dirN.z * 0 - dirN.y * 0,
                dirN.x * 0 - dirN.z * 1,
                dirN.y * 1 - dirN.x * 0
            );
        } else {
            // Cross with right vector
            perpA = new vec3(
                dirN.z * 0 - dirN.y * 0,
                dirN.x * 0 - dirN.z * 0,
                dirN.y * 0 - dirN.x * 1
            );
        }
        // Normalize perpA
        const lenA = Math.sqrt(perpA.x * perpA.x + perpA.y * perpA.y + perpA.z * perpA.z);
        perpA = new vec3(perpA.x / lenA, perpA.y / lenA, perpA.z / lenA);

        // perpB = dir x perpA
        const perpB = new vec3(
            dirN.y * perpA.z - dirN.z * perpA.y,
            dirN.z * perpA.x - dirN.x * perpA.z,
            dirN.x * perpA.y - dirN.y * perpA.x
        );

        const startIndex = this.meshBuilder.getVerticesCount();
        const TWO_PI = Math.PI * 2;

        // Generate vertices for both rings
        for (let ring = 0; ring < 2; ring++) {
            const center = ring === 0 ? startPos : endPos;
            // Input end: prRGB = inRGB (stays at input position)
            // Projected end: inRGB = prRGB (stays at projected position)
            const uvInR = ring === 0 ? inR : prR;
            const uvInG = ring === 0 ? inG : prG;
            const uvInB = ring === 0 ? inB : prB;
            const uvPrR = ring === 0 ? inR : prR;  // Same as input for ring 0
            const uvPrG = ring === 0 ? inG : prG;
            const uvPrB = ring === 0 ? inB : prB;

            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * TWO_PI;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Normal points outward from tube center
                const nx = perpA.x * cos + perpB.x * sin;
                const ny = perpA.y * cos + perpB.y * sin;
                const nz = perpA.z * cos + perpB.z * sin;

                // Position on ring
                const px = center.x + nx * radius;
                const py = center.y + ny * radius;
                const pz = center.z + nz * radius;

                this.meshBuilder.appendVerticesInterleaved([
                    px, py, pz,
                    nx, ny, nz,
                    uvInR, uvInG,
                    uvInB, uvPrR,
                    uvPrG, uvPrB,
                ]);
            }
        }

        // Generate triangles connecting the two rings
        const vertsPerRing = segments + 1;
        for (let i = 0; i < segments; i++) {
            const a = startIndex + i;
            const b = startIndex + i + 1;
            const c = startIndex + vertsPerRing + i;
            const d = startIndex + vertsPerRing + i + 1;

            // Two triangles per quad
            this.meshBuilder.appendIndices([a, c, b]);
            this.meshBuilder.appendIndices([b, c, d]);
        }
    }

    // ============================================
    // PUBLIC API (use as event callbacks)
    // ============================================

    private static readonly COLOR_SPACE_COUNT = 5;

    public setInputColors(colors: vec3[]): void {
        this.inputColors = colors.slice();
        this.colorCount = Math.min(colors.length, this.maxColors);
        this.inputColors = this.inputColors.slice(0, this.colorCount);

        this.projectColors();
        this.generateMesh();
        this.updateMaterialParams();
    }

    public reproject(): void {
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.generateMesh();
            this.updateMaterialParams();
        }
    }

    public refresh(): void {
        this.initializePigments();
        this.buildGamutLUT();
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.generateMesh();
            this.updateMaterialParams();
        }
    }

    /** Cycle to next color space */
    public nextColorSpace(): void {
        const next = (this._colorSpaceTo + 1) % GamutProjectionMeshGenerator.COLOR_SPACE_COUNT;
        this._colorSpaceFrom = next;
        this._colorSpaceTo = next;
        this._blend = 1.0;
        this.updateMaterialParams();
    }

    /** Cycle to previous color space */
    public prevColorSpace(): void {
        const prev = (this._colorSpaceTo - 1 + GamutProjectionMeshGenerator.COLOR_SPACE_COUNT) % GamutProjectionMeshGenerator.COLOR_SPACE_COUNT;
        this._colorSpaceFrom = prev;
        this._colorSpaceTo = prev;
        this._blend = 1.0;
        this.updateMaterialParams();
    }

    /** Set target color space by index (0=RGB, 1=CIELAB, 2=CIEXYZ, 3=Oklab, 4=CIELUV) */
    public setColorSpaceIndex(index: number): void {
        this._colorSpaceFrom = index;
        this._colorSpaceTo = index;
        this._blend = 1.0;
        this.updateMaterialParams();
    }

    /** Set color space blend value (0 = from space, 1 = to space) */
    public setBlend(value: number): void {
        this._blend = value;
        this.updateMaterialParams();
    }

    /** Start color space transition: set from=current, to=target, blend=0 */
    public startTransition(targetSpace: number): void {
        this._colorSpaceFrom = this._colorSpaceTo;
        this._colorSpaceTo = targetSpace;
        this._blend = 0.0;
        this.updateMaterialParams();
    }

    /** Set both color spaces and blend */
    public setColorSpace(from: number, to: number, blend: number = 1.0): void {
        this._colorSpaceFrom = from;
        this._colorSpaceTo = to;
        this._blend = blend;
        this.updateMaterialParams();
    }

    /** Set projection blend (0 = input color/pos, 1 = projected color/pos) */
    public setProjectionBlend(value: number): void {
        this._projectionBlend = Math.max(0, Math.min(1, value));
        this.updateMaterialParams();
    }

    public getInputColors(): vec3[] {
        return [...this.inputColors];
    }

    public getProjectedColors(): vec3[] {
        return [...this.projectedColors];
    }

    public getProjectedLAB(): vec3[] {
        return [...this.projectedLAB];
    }

    public getProjectionResults(): { input: vec3; projected: vec3; inputLAB: vec3; projectedLAB: vec3; deltaE: number }[] {
        const results: { input: vec3; projected: vec3; inputLAB: vec3; projectedLAB: vec3; deltaE: number }[] = [];

        for (let i = 0; i < this.colorCount; i++) {
            const inputRGB = this.inputColors[i];
            const inputLAB = this.rgb2lab(inputRGB);
            const projRGB = this.projectedColors[i] || new vec3(0.5, 0.5, 0.5);
            const projLAB = this.projectedLAB[i] || new vec3(50, 0, 0);

            const dL = inputLAB.x - projLAB.x;
            const da = inputLAB.y - projLAB.y;
            const db = inputLAB.z - projLAB.z;
            const deltaE = Math.sqrt(dL * dL + da * da + db * db);

            results.push({ input: inputRGB, projected: projRGB, inputLAB, projectedLAB: projLAB, deltaE });
        }

        return results;
    }

    public getColorCount(): number {
        return this.colorCount;
    }

    public getGamutSize(): number {
        return this.gamutLUT.length;
    }

    // ============ PROPERTY ACCESSORS ============

    get displaySize(): number { return this._displaySize; }
    set displaySize(value: number) {
        this._displaySize = value;
        if (this.projectedColors.length > 0) {
            this.generateMesh();
            this.updateMaterialParams();
        }
    }

    get voxelSize(): number { return this._voxelSize; }
    set voxelSize(value: number) {
        this._voxelSize = value;
        if (this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

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
    set blend(value: number) {
        this._blend = value;
        this.updateMaterialParams();
    }

    get gamutSampleSteps(): number { return this._gamutSampleSteps; }
    set gamutSampleSteps(value: number) {
        this._gamutSampleSteps = value;
        this.buildGamutLUT();
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.generateMesh();
        }
    }

    get projectionBlend(): number { return this._projectionBlend; }
    set projectionBlend(value: number) {
        this._projectionBlend = Math.max(0, Math.min(1, value));
        this.updateMaterialParams();
    }

    get showLines(): boolean { return this._showLines; }
    set showLines(value: boolean) {
        this._showLines = value;
        if (this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

    get lineRadius(): number { return this._lineRadius; }
    set lineRadius(value: number) {
        this._lineRadius = value;
        if (this._showLines && this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

    get tubeSegments(): number { return this._tubeSegments; }
    set tubeSegments(value: number) {
        this._tubeSegments = Math.max(3, value);
        if (this._showLines && this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

    /** Toggle projection lines visibility */
    public setShowLines(show: boolean): void {
        this.showLines = show;
    }

    /** Set line radius */
    public setLineRadius(radius: number): void {
        this.lineRadius = radius;
    }

    /** Set display size (convenience method for syncing across generators) */
    public setDisplaySize(size: number): void {
        this.displaySize = size;
    }

    /** Set voxel size (convenience method for syncing across generators) */
    public setVoxelSize(size: number): void {
        this.voxelSize = size;
    }

    // ============================================
    // TWEEN API
    // ============================================

    private ensureUpdateEvent(): void {
        if (!this.updateEvent) {
            this.updateEvent = this.createEvent("UpdateEvent");
            this.updateEvent.bind(() => this.onUpdate());
        }
    }

    private onUpdate(): void {
        if (!this.isTweening && !this.isBlendTweening) return;

        const dt = getDeltaTime();
        let needsUpdate = false;

        // Handle projection blend tween
        if (this.isTweening) {
            this.tweenElapsed += dt;

            if (this.tweenElapsed >= this.tweenDuration) {
                this._projectionBlend = this.tweenEndValue;
                this.isTweening = false;
            } else {
                const t = this.tweenElapsed / this.tweenDuration;
                const eased = t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
                this._projectionBlend = this.tweenStartValue + (this.tweenEndValue - this.tweenStartValue) * eased;
            }
            needsUpdate = true;
        }

        // Handle color space blend tween
        if (this.isBlendTweening) {
            this.blendTweenElapsed += dt;

            if (this.blendTweenElapsed >= this.blendTweenDuration) {
                this._blend = this.blendTweenEnd;
                this.isBlendTweening = false;
            } else {
                const t = this.blendTweenElapsed / this.blendTweenDuration;
                const eased = t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
                this._blend = this.blendTweenStart + (this.blendTweenEnd - this.blendTweenStart) * eased;
            }
            needsUpdate = true;
        }

        if (needsUpdate) {
            this.updateMaterialParams();
        }
    }

    /**
     * Tween projection blend to a target value
     * @param target Target value (0 = input, 1 = projected)
     * @param duration Duration in seconds (default 0.5)
     */
    public tweenProjectionTo(target: number, duration: number = 0.5): void {
        this.ensureUpdateEvent();
        this.tweenStartValue = this._projectionBlend;
        this.tweenEndValue = Math.max(0, Math.min(1, target));
        this.tweenDuration = duration;
        this.tweenElapsed = 0;
        this.isTweening = true;
    }

    /** Tween to fully projected state (projectionBlend = 1) */
    public tweenToProjected(duration: number = 0.5): void {
        this.tweenProjectionTo(1, duration);
    }

    /** Tween to input state (projectionBlend = 0) */
    public tweenToInput(duration: number = 0.5): void {
        this.tweenProjectionTo(0, duration);
    }

    /** Toggle between input and projected states with tween */
    public toggleProjection(duration: number = 0.5): void {
        // If currently tweening, reverse direction
        if (this.isTweening) {
            const temp = this.tweenStartValue;
            this.tweenStartValue = this.tweenEndValue;
            this.tweenEndValue = temp;
            this.tweenElapsed = this.tweenDuration - this.tweenElapsed;
        } else {
            // Start new tween to opposite state
            const target = this._projectionBlend < 0.5 ? 1 : 0;
            this.tweenProjectionTo(target, duration);
        }
    }

    /** Check if currently projected (projectionBlend >= 0.5) */
    public isProjected(): boolean {
        return this._projectionBlend >= 0.5;
    }

    /** Check if currently tweening */
    public getIsTweening(): boolean {
        return this.isTweening;
    }

    /** Stop any active tween */
    public stopTween(): void {
        this.isTweening = false;
    }

    // ============================================
    // COLOR SPACE TWEEN API
    // ============================================

    /**
     * Tween color space blend to a target value
     * @param target Target blend value (0 = from space, 1 = to space)
     * @param duration Duration in seconds (default 0.5)
     */
    public tweenBlendTo(target: number, duration: number = 0.5): void {
        this.ensureUpdateEvent();
        this.blendTweenStart = this._blend;
        this.blendTweenEnd = Math.max(0, Math.min(1, target));
        this.blendTweenDuration = duration;
        this.blendTweenElapsed = 0;
        this.isBlendTweening = true;
    }

    /**
     * Tween back to RGB (rest position)
     * Sets colorSpaceFrom to current colorSpaceTo, colorSpaceTo to RGB (0), and tweens blend to 1
     * @param duration Duration in seconds (default 0.5)
     */
    public tweenToRest(duration: number = 0.5): void {
        this._colorSpaceFrom = this._colorSpaceTo;
        this._colorSpaceTo = 0; // RGB
        this.tweenBlendTo(1, duration);
    }

    /**
     * Tween to a specific color space
     * Sets colorSpaceFrom to current colorSpaceTo, colorSpaceTo to target, resets blend to 0, then tweens to 1
     * @param space Target color space index (0=RGB, 1=CIELAB, 2=CIEXYZ, 3=Oklab, 4=CIELUV)
     * @param duration Duration in seconds (default 0.5)
     */
    public tweenToColorSpace(space: number, duration: number = 0.5): void {
        this._colorSpaceFrom = this._colorSpaceTo;
        this._colorSpaceTo = space;
        this._blend = 0;
        this.tweenBlendTo(1, duration);
    }

    /** Check if currently tweening color space blend */
    public getIsBlendTweening(): boolean {
        return this.isBlendTweening;
    }

    /** Stop color space blend tween */
    public stopBlendTween(): void {
        this.isBlendTweening = false;
    }

    /** Stop all tweens (projection and color space) */
    public stopAllTweens(): void {
        this.isTweening = false;
        this.isBlendTweening = false;
    }
}
