// Projector_Gamut_Mesh.ts
// Mesh-based gamut projection - finds nearest achievable pigment mix for each input color
// Creates cube meshes at projected positions in the chosen color space

@component
export class Projector_Gamut_Mesh extends BaseScriptComponent {

    // ============ GEOMETRY SETTINGS ============

    @input
    @hint("Size of the display space in scene units")
    private _cubeSize: number = 100.0;

    @input
    @hint("Size of each sample cube")
    private _sampleSize: number = 1.0;

    @input
    @hint("Projection blend: 0 = original input position/color, 1 = fully projected")
    private _projectionBlend: number = 1.0;

    @input
    @hint("Material for projected color cubes")
    material: Material;

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
    @hint("Color space for 3D positioning")
    private _colorSpace: number = 0;

    // ============ GAMUT SETTINGS ============

    @input
    @hint("Resolution of pigment mix sampling for gamut LUT")
    private _gamutSampleSteps: number = 20;

    // ============ PIGMENT COLORS ============

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

    @input
    @hint("Maximum input colors to support")
    maxColors: number = 64;

    // ============ PRIVATE STATE ============

    private static readonly NUM_PIGMENTS = 6;
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

    // Cached positions for ALL color spaces (indexed by colorSpace enum)
    // [colorSpace][colorIndex] = position
    private inputPositionsPerSpace: vec3[][] = [];
    private projectedPositionsPerSpace: vec3[][] = [];
    private mesh: RenderMesh | null = null;

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
        });
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
        const n = Projector_Gamut_Mesh.NUM_PIGMENTS;

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

    private rgbToDisplayPosition(r: number, g: number, b: number): vec3 {
        const size = this._cubeSize;

        switch (this._colorSpace) {
            case 0: // RGB
                return new vec3(
                    (r - 0.5) * size,
                    (b - 0.5) * size,
                    (g - 0.5) * size
                );

            case 1: { // CIELAB
                const lr = this.srgbToLinear(r);
                const lg = this.srgbToLinear(g);
                const lb = this.srgbToLinear(b);
                const xyz = this.linearRgbToXyz(lr, lg, lb);
                const lab = this.xyzToLab(xyz.x, xyz.y, xyz.z);
                return new vec3(
                    (lab.y / 128) * size * 0.5,
                    (lab.x / 100 - 0.5) * size,
                    (lab.z / 128) * size * 0.5
                );
            }

            case 2: { // CIEXYZ
                const lr = this.srgbToLinear(r);
                const lg = this.srgbToLinear(g);
                const lb = this.srgbToLinear(b);
                const xyz = this.linearRgbToXyz(lr, lg, lb);
                return new vec3(
                    (xyz.x - 0.5) * size,
                    (xyz.y - 0.5) * size,
                    (xyz.z - 0.5) * size
                );
            }

            case 3: { // Oklab
                const lr = this.srgbToLinear(r);
                const lg = this.srgbToLinear(g);
                const lb = this.srgbToLinear(b);
                const oklab = this.linearRgbToOklab(lr, lg, lb);
                return new vec3(
                    (oklab.y / 0.4) * size * 0.5,
                    (oklab.x - 0.5) * size,
                    (oklab.z / 0.4) * size * 0.5
                );
            }

            case 4: { // CIELUV
                const lr = this.srgbToLinear(r);
                const lg = this.srgbToLinear(g);
                const lb = this.srgbToLinear(b);
                const xyz = this.linearRgbToXyz(lr, lg, lb);
                const luv = this.xyzToLuv(xyz.x, xyz.y, xyz.z);
                return new vec3(
                    (luv.y / 200) * size * 0.5,
                    (luv.x / 100 - 0.5) * size,
                    (luv.z / 200) * size * 0.5
                );
            }

            default:
                return new vec3(
                    (r - 0.5) * size,
                    (b - 0.5) * size,
                    (g - 0.5) * size
                );
        }
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

    private cachePositionsForAllSpaces(): void {
        // Precompute positions for all 5 color spaces
        this.inputPositionsPerSpace = [[], [], [], [], []];
        this.projectedPositionsPerSpace = [[], [], [], [], []];

        for (let i = 0; i < this.inputColors.length; i++) {
            const inputRGB = this.inputColors[i];
            const projectedRGB = this.projectedColors[i];

            // Compute linear RGB once (shared by most color spaces)
            const inLR = this.srgbToLinear(inputRGB.x);
            const inLG = this.srgbToLinear(inputRGB.y);
            const inLB = this.srgbToLinear(inputRGB.z);
            const prLR = this.srgbToLinear(projectedRGB.x);
            const prLG = this.srgbToLinear(projectedRGB.y);
            const prLB = this.srgbToLinear(projectedRGB.z);

            // Compute XYZ once (shared by LAB, XYZ, LUV)
            const inXYZ = this.linearRgbToXyz(inLR, inLG, inLB);
            const prXYZ = this.linearRgbToXyz(prLR, prLG, prLB);

            const size = this._cubeSize;

            for (let space = 0; space < 5; space++) {
                let inPos: vec3, prPos: vec3;

                switch (space) {
                    case 0: // RGB
                        inPos = new vec3((inputRGB.x - 0.5) * size, (inputRGB.z - 0.5) * size, (inputRGB.y - 0.5) * size);
                        prPos = new vec3((projectedRGB.x - 0.5) * size, (projectedRGB.z - 0.5) * size, (projectedRGB.y - 0.5) * size);
                        break;
                    case 1: { // CIELAB
                        const inLab = this.xyzToLab(inXYZ.x, inXYZ.y, inXYZ.z);
                        const prLab = this.xyzToLab(prXYZ.x, prXYZ.y, prXYZ.z);
                        inPos = new vec3((inLab.y / 128) * size * 0.5, (inLab.x / 100 - 0.5) * size, (inLab.z / 128) * size * 0.5);
                        prPos = new vec3((prLab.y / 128) * size * 0.5, (prLab.x / 100 - 0.5) * size, (prLab.z / 128) * size * 0.5);
                        break;
                    }
                    case 2: // CIEXYZ
                        inPos = new vec3((inXYZ.x - 0.5) * size, (inXYZ.y - 0.5) * size, (inXYZ.z - 0.5) * size);
                        prPos = new vec3((prXYZ.x - 0.5) * size, (prXYZ.y - 0.5) * size, (prXYZ.z - 0.5) * size);
                        break;
                    case 3: { // Oklab
                        const inOk = this.linearRgbToOklab(inLR, inLG, inLB);
                        const prOk = this.linearRgbToOklab(prLR, prLG, prLB);
                        inPos = new vec3((inOk.y / 0.4) * size * 0.5, (inOk.x - 0.5) * size, (inOk.z / 0.4) * size * 0.5);
                        prPos = new vec3((prOk.y / 0.4) * size * 0.5, (prOk.x - 0.5) * size, (prOk.z / 0.4) * size * 0.5);
                        break;
                    }
                    case 4: { // CIELUV
                        const inLuv = this.xyzToLuv(inXYZ.x, inXYZ.y, inXYZ.z);
                        const prLuv = this.xyzToLuv(prXYZ.x, prXYZ.y, prXYZ.z);
                        inPos = new vec3((inLuv.y / 200) * size * 0.5, (inLuv.x / 100 - 0.5) * size, (inLuv.z / 200) * size * 0.5);
                        prPos = new vec3((prLuv.y / 200) * size * 0.5, (prLuv.x / 100 - 0.5) * size, (prLuv.z / 200) * size * 0.5);
                        break;
                    }
                    default:
                        inPos = new vec3(0, 0, 0);
                        prPos = new vec3(0, 0, 0);
                }

                this.inputPositionsPerSpace[space].push(inPos);
                this.projectedPositionsPerSpace[space].push(prPos);
            }
        }
    }

    private generateMesh(): void {
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
            { name: "texture1", components: 2 },
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        const size = this._sampleSize;
        const blend = this._projectionBlend;
        const space = this._colorSpace;

        // Use precomputed positions for current color space
        const inputPositions = this.inputPositionsPerSpace[space];
        const projectedPositions = this.projectedPositionsPerSpace[space];

        for (let i = 0; i < this.projectedColors.length; i++) {
            const inputRGB = this.inputColors[i];
            const projectedRGB = this.projectedColors[i];
            const inputPos = inputPositions[i];
            const projectedPos = projectedPositions[i];

            // Interpolate color and position based on blend
            const r = inputRGB.x + (projectedRGB.x - inputRGB.x) * blend;
            const g = inputRGB.y + (projectedRGB.y - inputRGB.y) * blend;
            const b = inputRGB.z + (projectedRGB.z - inputRGB.z) * blend;

            const px = inputPos.x + (projectedPos.x - inputPos.x) * blend;
            const py = inputPos.y + (projectedPos.y - inputPos.y) * blend;
            const pz = inputPos.z + (projectedPos.z - inputPos.z) * blend;

            this.generateCube(px, py, pz, r, g, b, size);
        }

        if (this.meshBuilder.isValid()) {
            this.mesh = this.meshBuilder.getMesh();
            this.meshVisual.mesh = this.mesh;
            this.meshBuilder.updateMesh();
        }
    }

    private generateCube(cx: number, cy: number, cz: number, r: number, g: number, b: number, size: number): void {
        const half = size * 0.5;
        const faceStartBase = this.meshBuilder.getVerticesCount();

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
                this.meshBuilder.appendVerticesInterleaved([
                    cx + offsets[vi], cy + offsets[vi + 1], cz + offsets[vi + 2],
                    nx, ny, nz,
                    r, g,
                    b, 1.0,
                ]);
            }

            this.meshBuilder.appendIndices([
                faceStart, faceStart + 1, faceStart + 2,
                faceStart, faceStart + 2, faceStart + 3,
            ]);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    public setInputColors(colors: vec3[]): void {
        this.inputColors = colors.slice();
        this.colorCount = Math.min(colors.length, this.maxColors);
        this.inputColors = this.inputColors.slice(0, this.colorCount);

        this.projectColors();
        this.cachePositionsForAllSpaces();
        this.generateMesh();
    }

    public reproject(): void {
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.cachePositionsForAllSpaces();
            this.generateMesh();
        }
    }

    public refresh(): void {
        this.initializePigments();
        this.buildGamutLUT();
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.cachePositionsForAllSpaces();
            this.generateMesh();
        }
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

    get cubeSize(): number { return this._cubeSize; }
    set cubeSize(value: number) {
        this._cubeSize = value;
        if (this.projectedColors.length > 0) {
            this.cachePositionsForAllSpaces();  // cubeSize affects positions
            this.generateMesh();
        }
    }

    get sampleSize(): number { return this._sampleSize; }
    set sampleSize(value: number) {
        this._sampleSize = value;
        if (this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

    get colorSpace(): number { return this._colorSpace; }
    set colorSpace(value: number) {
        this._colorSpace = value;
        // Positions already cached for all spaces - just regenerate mesh
        if (this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }

    get gamutSampleSteps(): number { return this._gamutSampleSteps; }
    set gamutSampleSteps(value: number) {
        this._gamutSampleSteps = value;
        this.buildGamutLUT();
        if (this.inputColors.length > 0) {
            this.projectColors();
            this.cachePositionsForAllSpaces();
            this.generateMesh();
        }
    }

    get projectionBlend(): number { return this._projectionBlend; }
    set projectionBlend(value: number) {
        this._projectionBlend = Math.max(0, Math.min(1, value));
        if (this.projectedColors.length > 0) {
            this.generateMesh();
        }
    }
}
