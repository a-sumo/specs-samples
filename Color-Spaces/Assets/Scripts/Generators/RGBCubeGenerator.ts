
/**
 * RGBCubeGenerator.ts
 *
 * Generates an RGB cube visualization using small voxel cubes
 * that can be mapped to different color spaces
 */
@component
export class RGBCubeGenerator extends BaseScriptComponent {
  @input
  @hint("Size of the display volume in scene units")
  private _displaySize: number = 100.0;

  @input
  @hint("Number of samples per axis (e.g., 8 = 8x8x8 = 512 voxels)")
  private _gridResolution: number = 8;

  @input
  @hint("Size of each voxel cube")
  @widget(new SliderWidget(0.1, 10, 0.1))
  private _voxelSize: number = 3.0;

  @input
  @hint("Material to apply to all voxels")
  public material!: Material;

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
  @hint("Interpolation: 0 = from space, 1 = to space")
  private _blend: number = 0.0;

  @input
  @hint("Text component to display active color space name")
  colorSpaceText: Text;

  private meshBuilder!: MeshBuilder;
  private meshVisual!: RenderMeshVisual;

  private static readonly COLOR_SPACE_NAMES = [
    "RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"
  ];

  private readonly D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };
  private sampleData: { center: vec3; r: number; g: number; b: number }[] = [];

  onAwake(): void {
    this.setupMeshVisual();
    this.collectSampleData();
    this.generateMesh();
    this.updateMaterialParams();
  }

  private setupMeshVisual(): void {
    this.meshVisual = this.sceneObject.createComponent(
      "Component.RenderMeshVisual"
    );
    if (this.material) {
      this.meshVisual.mainMaterial = this.material;
    }
  }

  // ============================================
  // COLOR SPACE CONVERSIONS (kept for reference)
  // ============================================

  private srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

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
    const L =
      yr > Math.pow(6 / 29, 3)
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

    const l_ = Math.cbrt(l),
      m_ = Math.cbrt(m),
      s_ = Math.cbrt(s);

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

  // ============================================
  // MESH GENERATION - VOXEL CUBES
  // ============================================

  private collectSampleData(): void {
    this.sampleData = [];
    const res = this._gridResolution;

    // Generate a uniform grid of sample points throughout the RGB cube
    for (let ri = 0; ri <= res; ri++) {
      for (let gi = 0; gi <= res; gi++) {
        for (let bi = 0; bi <= res; bi++) {
          const r = ri / res;
          const g = gi / res;
          const b = bi / res;
          const center = this.rgbToDisplayPosition(r, g, b);
          this.sampleData.push({ center, r, g, b });
        }
      }
    }

    print(`RGBCubeGenerator: ${this.sampleData.length} voxels (${res + 1}³)`);
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

    const size = this._voxelSize;

    for (const sample of this.sampleData) {
      this.generateVoxelCube(sample.center, sample.r, sample.g, sample.b, size);
    }

    if (this.meshBuilder.isValid()) {
      const mesh = this.meshBuilder.getMesh();
      this.meshVisual.mesh = mesh;
      this.meshBuilder.updateMesh();
    }
  }

  /**
   * Generate a voxel cube at the given center position
   */
  private generateVoxelCube(center: vec3, r: number, g: number, b: number, size: number): void {
    const half = size * 0.5;

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

  private static readonly COLOR_SPACE_COUNT = 5;

  /** Set both color spaces and blend */
  public setColorSpace(from: number, to: number, blend: number = 1.0): void {
    this._colorSpaceFrom = from;
    this._colorSpaceTo = to;
    this._blend = blend;
    this.updateMaterialParams();
  }

  /** Cycle to next color space (keeps from/to in sync, blend=1) */
  public nextColorSpace(): void {
    const next = (this._colorSpaceTo + 1) % RGBCubeGenerator.COLOR_SPACE_COUNT;
    this._colorSpaceFrom = next;
    this._colorSpaceTo = next;
    this._blend = 1.0;
    this.updateMaterialParams();
  }

  /** Cycle to previous color space (keeps from/to in sync, blend=1) */
  public prevColorSpace(): void {
    const prev = (this._colorSpaceTo - 1 + RGBCubeGenerator.COLOR_SPACE_COUNT) % RGBCubeGenerator.COLOR_SPACE_COUNT;
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

  /** Start transition: set from=current, to=target, blend=0 (then animate blend to 1) */
  public startTransition(targetSpace: number): void {
    this._colorSpaceFrom = this._colorSpaceTo;
    this._colorSpaceTo = targetSpace;
    this._blend = 0.0;
    this.updateMaterialParams();
  }

  public refresh(): void {
    this.collectSampleData();
    this.generateMesh();
    this.updateMaterialParams();
  }

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
      const name = RGBCubeGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
      this.colorSpaceText.text = name;
    }
  }

  /** Get current color space name */
  public getColorSpaceName(): string {
    return RGBCubeGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo] || "Unknown";
  }

  get voxelSize(): number { return this._voxelSize; }
  set voxelSize(value: number) {
    this._voxelSize = value;
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
}
