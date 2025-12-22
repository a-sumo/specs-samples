
/**
 * PigmentGamutMeshGenerator.ts
 *
 * Generates an RGB cube visualization showing only achievable colors via pigment mixing.
 * Uses small cubes at each achievable sample point.
 */
@component
export class PigmentGamutMeshGenerator extends BaseScriptComponent {

  // ============ GEOMETRY ============

  @input
  @hint("Size of the display volume in scene units")
  private _displaySize: number = 100.0;

  @input
  @hint("Samples per axis (e.g., 10 = 10³ grid)")
  @widget(new SliderWidget(2, 20, 1))
  private _gridResolution: number = 10;

  @input
  @hint("Size of each voxel cube")
  @widget(new SliderWidget(0.1, 10, 0.1))
  private _voxelSize: number = 2.0;

  // ============ MATERIAL ============

  @input
  @hint("Material for voxels")
  public material!: Material;

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
  @hint("Tolerance for matching RGB to achievable gamut")
  @widget(new SliderWidget(0.01, 0.2, 0.01))
  private _gamutTolerance: number = 0.05;

  @input
  @hint("Resolution of pigment mix sampling for gamut LUT")
  @widget(new SliderWidget(5, 30, 1))
  private _gamutSampleSteps: number = 20;

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
  private static readonly COLOR_SPACE_COUNT = 5;
  private readonly D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

  private meshBuilder!: MeshBuilder;
  private meshVisual!: RenderMeshVisual;
  private currentPigments: vec3[] = [];
  private gamutLUT: vec3[] = [];
  private sampleData: { center: vec3; r: number; g: number; b: number }[] = [];

  // Tween state
  private isTweening: boolean = false;
  private tweenStartValue: number = 0;
  private tweenEndValue: number = 1;
  private tweenDuration: number = 0.5;
  private tweenElapsed: number = 0;
  private updateEvent: SceneEvent | null = null;

  // Precomputed achievability grid for fast lookups
  private static readonly ACHIEV_GRID_RES = 32; // Resolution of precomputed grid
  private achievabilityGrid: boolean[] = [];

  onAwake(): void {
    this.initializePigments();
    this.buildGamutLUT();
    this.setupMeshVisual();
    this.collectSampleData();
    this.generateMesh();
    this.updateMaterialParams();
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
    const n = PigmentGamutMeshGenerator.NUM_PIGMENTS;

    // Pure pigments
    for (let i = 0; i < n; i++) {
      this.gamutLUT.push(this.currentPigments[i]);
    }

    // Two-way mixes
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const weights = new Array(n).fill(0);
          weights[i] = 1 - t;
          weights[j] = t;
          this.gamutLUT.push(this.mixPigments(weights));
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
                this.gamutLUT.push(this.mixPigments(weights));
              }
            }
          }
        }
      }
    }

    // Build precomputed achievability grid for fast lookups
    this.buildAchievabilityGrid();

    print(`PigmentGamutMeshGenerator: Built LUT with ${this.gamutLUT.length} achievable colors`);
  }

  private buildAchievabilityGrid(): void {
    const res = PigmentGamutMeshGenerator.ACHIEV_GRID_RES;
    const total = res * res * res;
    this.achievabilityGrid = new Array(total).fill(false);

    const tol = this._gamutTolerance;

    // Mark all grid cells that contain achievable colors
    for (const c of this.gamutLUT) {
      // Find grid cells within tolerance of this color
      const minR = Math.max(0, Math.floor((c.x - tol) * res));
      const maxR = Math.min(res - 1, Math.floor((c.x + tol) * res));
      const minG = Math.max(0, Math.floor((c.y - tol) * res));
      const maxG = Math.min(res - 1, Math.floor((c.y + tol) * res));
      const minB = Math.max(0, Math.floor((c.z - tol) * res));
      const maxB = Math.min(res - 1, Math.floor((c.z + tol) * res));

      for (let ri = minR; ri <= maxR; ri++) {
        for (let gi = minG; gi <= maxG; gi++) {
          for (let bi = minB; bi <= maxB; bi++) {
            this.achievabilityGrid[ri * res * res + gi * res + bi] = true;
          }
        }
      }
    }
  }

  private isColorAchievable(r: number, g: number, b: number): boolean {
    // Fast O(1) lookup using precomputed grid
    const res = PigmentGamutMeshGenerator.ACHIEV_GRID_RES;
    const ri = Math.min(res - 1, Math.max(0, Math.floor(r * res)));
    const gi = Math.min(res - 1, Math.max(0, Math.floor(g * res)));
    const bi = Math.min(res - 1, Math.max(0, Math.floor(b * res)));
    return this.achievabilityGrid[ri * res * res + gi * res + bi];
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

  // Always generate in RGB space - shader handles color space transformation
  private rgbToDisplayPosition(r: number, g: number, b: number): vec3 {
    const size = this._displaySize;
    return new vec3(
      (r - 0.5) * size,
      (b - 0.5) * size,
      (g - 0.5) * size
    );
  }

  private updateMaterialParams(): void {
    if (this.material) {
      const pass = this.material.mainPass;
      pass.colorSpaceFrom = this._colorSpaceFrom;
      pass.colorSpaceTo = this._colorSpaceTo;
      pass.blend = this._blend;
      pass.cubeSize = this._displaySize;
    }
    this.updateColorSpaceText();
  }

  private updateColorSpaceText(): void {
    if (this.colorSpaceText) {
      const name = PigmentGamutMeshGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
      this.colorSpaceText.text = name;
    }
  }

  /** Get current color space name */
  public getColorSpaceName(): string {
    return PigmentGamutMeshGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
  }

  // ============================================
  // MESH GENERATION - SAMPLE CUBES
  // ============================================

  private collectSampleData(): void {
    this.sampleData = [];
    const res = this._gridResolution;

    for (let ri = 0; ri <= res; ri++) {
      for (let gi = 0; gi <= res; gi++) {
        for (let bi = 0; bi <= res; bi++) {
          const r = ri / res;
          const g = gi / res;
          const b = bi / res;

          if (!this.isColorAchievable(r, g, b)) continue;

          const center = this.rgbToDisplayPosition(r, g, b);
          this.sampleData.push({ center, r, g, b });
        }
      }
    }

    print(`PigmentGamutMeshGenerator: ${this.sampleData.length} achievable voxels (from ${(res + 1) ** 3} tested)`);
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

    for (const sample of this.sampleData) {
      this.generateCube(sample.center, sample.r, sample.g, sample.b, this._voxelSize);
    }

    if (this.meshBuilder.isValid()) {
      const mesh = this.meshBuilder.getMesh();
      this.meshVisual.mesh = mesh;
      this.meshBuilder.updateMesh();
    }
  }

  /**
   * Generate a cube at the given center position
   */
  private generateCube(center: vec3, r: number, g: number, b: number, size: number): void {
    const half = size * 0.5;
    const startIndex = this.meshBuilder.getVerticesCount();

    // 8 corners of the cube
    const corners = [
      new vec3(center.x - half, center.y - half, center.z - half), // 0: left-bottom-back
      new vec3(center.x + half, center.y - half, center.z - half), // 1: right-bottom-back
      new vec3(center.x + half, center.y + half, center.z - half), // 2: right-top-back
      new vec3(center.x - half, center.y + half, center.z - half), // 3: left-top-back
      new vec3(center.x - half, center.y - half, center.z + half), // 4: left-bottom-front
      new vec3(center.x + half, center.y - half, center.z + half), // 5: right-bottom-front
      new vec3(center.x + half, center.y + half, center.z + half), // 6: right-top-front
      new vec3(center.x - half, center.y + half, center.z + half), // 7: left-top-front
    ];

    // 6 faces with their normals and vertex indices
    const faces = [
      { normal: new vec3(0, 0, -1), verts: [0, 1, 2, 3] }, // back
      { normal: new vec3(0, 0, 1), verts: [5, 4, 7, 6] },  // front
      { normal: new vec3(-1, 0, 0), verts: [4, 0, 3, 7] }, // left
      { normal: new vec3(1, 0, 0), verts: [1, 5, 6, 2] },  // right
      { normal: new vec3(0, -1, 0), verts: [4, 5, 1, 0] }, // bottom
      { normal: new vec3(0, 1, 0), verts: [3, 2, 6, 7] },  // top
    ];

    for (const face of faces) {
      const faceStartIndex = this.meshBuilder.getVerticesCount();

      // Add 4 vertices for this face
      for (const vi of face.verts) {
        const pos = corners[vi];
        this.meshBuilder.appendVerticesInterleaved([
          pos.x, pos.y, pos.z,
          face.normal.x, face.normal.y, face.normal.z,
          r, g,
          b, 1.0,
        ]);
      }

      // Two triangles per face
      this.meshBuilder.appendIndices([
        faceStartIndex, faceStartIndex + 1, faceStartIndex + 2,
        faceStartIndex, faceStartIndex + 2, faceStartIndex + 3,
      ]);
    }
  }

  // ============================================
  // PUBLIC API (use as event callbacks)
  // ============================================

  public refresh(): void {
    this.initializePigments();
    this.buildGamutLUT();
    this.collectSampleData();
    this.generateMesh();
    this.updateMaterialParams();
  }

  /** Cycle to next color space */
  public nextColorSpace(): void {
    const next = (this._colorSpaceTo + 1) % PigmentGamutMeshGenerator.COLOR_SPACE_COUNT;
    this._colorSpaceFrom = next;
    this._colorSpaceTo = next;
    this._blend = 1.0;
    this.updateMaterialParams();
  }

  /** Cycle to previous color space */
  public prevColorSpace(): void {
    const prev = (this._colorSpaceTo - 1 + PigmentGamutMeshGenerator.COLOR_SPACE_COUNT) % PigmentGamutMeshGenerator.COLOR_SPACE_COUNT;
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

  /** Set blend value (0 = from space, 1 = to space) */
  public setBlend(value: number): void {
    this._blend = value;
    this.updateMaterialParams();
  }

  /** Start transition: set from=current, to=target, blend=0 */
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

  // ============================================
  // PROPERTY ACCESSORS
  // ============================================

  get displaySize(): number { return this._displaySize; }
  set displaySize(value: number) {
    this._displaySize = value;
    this.collectSampleData();
    this.generateMesh();
    this.updateMaterialParams();
  }

  get gridResolution(): number { return this._gridResolution; }
  set gridResolution(value: number) {
    this._gridResolution = Math.max(1, Math.floor(value));
    this.collectSampleData();
    this.generateMesh();
  }

  get voxelSize(): number { return this._voxelSize; }
  set voxelSize(value: number) {
    this._voxelSize = value;
    this.generateMesh();
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

  get gamutTolerance(): number { return this._gamutTolerance; }
  set gamutTolerance(value: number) {
    this._gamutTolerance = value;
    this.buildAchievabilityGrid(); // Rebuild grid with new tolerance
    this.collectSampleData();
    this.generateMesh();
  }

  /** Set display size (convenience method for syncing across generators) */
  public setDisplaySize(size: number): void {
    this.displaySize = size;
  }

  /** Set voxel size (convenience method for syncing across generators) */
  public setVoxelSize(size: number): void {
    this.voxelSize = size;
  }

  /** Set grid resolution (convenience method for syncing across generators) */
  public setGridResolution(res: number): void {
    this.gridResolution = res;
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
    if (!this.isTweening) return;

    const dt = getDeltaTime();
    this.tweenElapsed += dt;

    if (this.tweenElapsed >= this.tweenDuration) {
      this._blend = this.tweenEndValue;
      this.isTweening = false;
    } else {
      const t = this.tweenElapsed / this.tweenDuration;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this._blend = this.tweenStartValue + (this.tweenEndValue - this.tweenStartValue) * eased;
    }

    this.updateMaterialParams();
  }

  /** Tween color space blend to a target value */
  public tweenBlendTo(target: number, duration: number = 0.5): void {
    this.ensureUpdateEvent();
    this.tweenStartValue = this._blend;
    this.tweenEndValue = Math.max(0, Math.min(1, target));
    this.tweenDuration = duration;
    this.tweenElapsed = 0;
    this.isTweening = true;
  }

  /** Tween to rest position (RGB space, blend = 0) */
  public tweenToRest(duration: number = 0.5): void {
    this._colorSpaceFrom = this._colorSpaceTo;
    this._colorSpaceTo = 0; // RGB
    this.tweenBlendTo(1, duration);
  }

  /** Tween to a specific color space */
  public tweenToColorSpace(space: number, duration: number = 0.5): void {
    this._colorSpaceFrom = this._colorSpaceTo;
    this._colorSpaceTo = space;
    this._blend = 0;
    this.tweenBlendTo(1, duration);
  }

  /** Check if currently tweening */
  public getIsTweening(): boolean {
    return this.isTweening;
  }

  /** Stop any active tween */
  public stopTween(): void {
    this.isTweening = false;
  }
}
