/**
 * RGBCubeLattice.ts
 *
 * RGB cube visualization using lattice deformation for smooth color space transitions.
 * Uses a 3x3x3 grid of bones as control points - GPU handles vertex interpolation.
 */
@component
export class RGBCubeLattice extends BaseScriptComponent {

  @input
  @hint("Size of the cube in scene units")
  private _cubeSize: number = 100.0;

  @input
  @hint("Number of lines per axis")
  private _gridDensity: number = 5;

  @input
  @hint("Number of segments per line")
  private _lineSegments: number = 16;

  @input
  @hint("Radius of each tube")
  private _tubeRadius: number = 1.0;

  @input
  @hint("Segments around tube circumference")
  private _circleSegments: number = 6;

  @input
  @hint("Material to apply")
  public material!: Material;

  @input
  @hint("Transition duration in seconds")
  private _transitionDuration: number = 0.5;

  // Lattice configuration
  private static readonly LATTICE_SIZE = 3; // 3x3x3 = 27 control points
  private static readonly NUM_BONES = 27;

  // Color space presets
  public static readonly PRESET_RGB = 0;
  public static readonly PRESET_CIELAB = 1;
  public static readonly PRESET_CIEXYZ = 2;
  public static readonly PRESET_OKLAB = 3;
  public static readonly PRESET_CIELUV = 4;
  public static readonly PRESET_COUNT = 5;

  private readonly D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

  private meshBuilder!: MeshBuilder;
  private meshVisual!: RenderMeshVisual;
  private skin!: Skin;

  // Bone scene objects and their target positions
  private bones: SceneObject[] = [];
  private bonePositions: vec3[][] = []; // [presetIndex][boneIndex]

  // Current and target state
  private _currentPreset: number = 0;
  private _targetPreset: number = 0;
  private _transitionProgress: number = 1.0;
  private _isTransitioning: boolean = false;
  private _transitionStartTime: number = 0;

  onAwake(): void {
    this.precomputeLatticePositions();
    this.createBoneHierarchy();
    this.setupMeshVisual();
    this.generateMesh();
    this.positionBones(0); // Start at RGB

    // Update loop for transitions
    this.createEvent("UpdateEvent").bind(() => this.updateTransition());
  }

  /**
   * Pre-compute lattice control point positions for each color space
   */
  private precomputeLatticePositions(): void {
    this.bonePositions = [];

    for (let preset = 0; preset < RGBCubeLattice.PRESET_COUNT; preset++) {
      const positions: vec3[] = [];

      for (let iz = 0; iz < RGBCubeLattice.LATTICE_SIZE; iz++) {
        for (let iy = 0; iy < RGBCubeLattice.LATTICE_SIZE; iy++) {
          for (let ix = 0; ix < RGBCubeLattice.LATTICE_SIZE; ix++) {
            // Lattice point in normalized RGB space (0-1)
            const r = ix / (RGBCubeLattice.LATTICE_SIZE - 1);
            const g = iy / (RGBCubeLattice.LATTICE_SIZE - 1);
            const b = iz / (RGBCubeLattice.LATTICE_SIZE - 1);

            // Get position in target color space
            const pos = this.rgbToColorSpacePosition(r, g, b, preset);
            positions.push(pos);
          }
        }
      }

      this.bonePositions.push(positions);
    }

    print(`RGBCubeLattice: Pre-computed ${RGBCubeLattice.PRESET_COUNT} presets with ${RGBCubeLattice.NUM_BONES} control points each`);
  }

  /**
   * Create the bone hierarchy for the lattice
   */
  private createBoneHierarchy(): void {
    // Create skin component on this object
    this.skin = this.sceneObject.createComponent("Component.Skin") as Skin;

    // Create armature parent
    const armature = global.scene.createSceneObject("RGBCubeLattice_Armature");
    armature.setParent(this.sceneObject);

    // Create bones for each lattice point
    this.bones = [];
    this.skin.clearBones();

    for (let iz = 0; iz < RGBCubeLattice.LATTICE_SIZE; iz++) {
      for (let iy = 0; iy < RGBCubeLattice.LATTICE_SIZE; iy++) {
        for (let ix = 0; ix < RGBCubeLattice.LATTICE_SIZE; ix++) {
          const boneName = `Bone_${ix}_${iy}_${iz}`;
          const bone = global.scene.createSceneObject(boneName);
          bone.setParent(armature);

          // Initial position at RGB space
          const r = ix / (RGBCubeLattice.LATTICE_SIZE - 1);
          const g = iy / (RGBCubeLattice.LATTICE_SIZE - 1);
          const b = iz / (RGBCubeLattice.LATTICE_SIZE - 1);
          const pos = this.rgbToColorSpacePosition(r, g, b, 0);
          bone.getTransform().setLocalPosition(pos);

          this.bones.push(bone);
          this.skin.setSkinBone(boneName, bone);
        }
      }
    }

    print(`RGBCubeLattice: Created ${this.bones.length} bones`);
  }

  private setupMeshVisual(): void {
    // Create mesh object as child
    const meshObj = global.scene.createSceneObject("RGBCubeLattice_Mesh");
    meshObj.setParent(this.sceneObject);

    this.meshVisual = meshObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (this.material) {
      this.meshVisual.mainMaterial = this.material;
    }

    // Connect skin to mesh
    this.meshVisual.setSkin(this.skin);
  }

  /**
   * Get lattice cell and weights for a point in normalized RGB space
   * Returns the 4 most influential bone indices and their weights
   */
  private getLatticeWeights(r: number, g: number, b: number): { indices: number[]; weights: number[] } {
    const ls = RGBCubeLattice.LATTICE_SIZE - 1;

    // Find which cell the point is in
    const fx = r * ls;
    const fy = g * ls;
    const fz = b * ls;

    const ix = Math.min(Math.floor(fx), ls - 1);
    const iy = Math.min(Math.floor(fy), ls - 1);
    const iz = Math.min(Math.floor(fz), ls - 1);

    // Local coordinates within cell (0-1)
    const lx = fx - ix;
    const ly = fy - iy;
    const lz = fz - iz;

    // 8 corners of the cell with trilinear weights
    const corners: { index: number; weight: number }[] = [];

    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const bx = ix + dx;
          const by = iy + dy;
          const bz = iz + dz;

          const boneIndex = bz * RGBCubeLattice.LATTICE_SIZE * RGBCubeLattice.LATTICE_SIZE +
                           by * RGBCubeLattice.LATTICE_SIZE + bx;

          // Trilinear weight
          const wx = dx === 0 ? (1 - lx) : lx;
          const wy = dy === 0 ? (1 - ly) : ly;
          const wz = dz === 0 ? (1 - lz) : lz;
          const weight = wx * wy * wz;

          if (weight > 0.001) {
            corners.push({ index: boneIndex, weight });
          }
        }
      }
    }

    // Sort by weight descending and take top 4
    corners.sort((a, b) => b.weight - a.weight);
    const top4 = corners.slice(0, 4);

    // Normalize weights to sum to 1
    const totalWeight = top4.reduce((sum, c) => sum + c.weight, 0);

    const indices: number[] = [];
    const weights: number[] = [];

    for (let i = 0; i < 4; i++) {
      if (i < top4.length) {
        indices.push(top4[i].index);
        weights.push(top4[i].weight / totalWeight);
      } else {
        indices.push(0);
        weights.push(0);
      }
    }

    return { indices, weights };
  }

  /**
   * Encode bone index and weight into a single float for boneData
   * Format: integer part = bone index, fractional part = weight (0-0.99)
   */
  private encodeBoneData(index: number, weight: number): number {
    return index + Math.min(0.99, weight);
  }

  private generateMesh(): void {
    this.meshBuilder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "texture0", components: 2 },
      { name: "boneData", components: 4 },
    ]);

    this.meshBuilder.topology = MeshTopology.Triangles;
    this.meshBuilder.indexType = MeshIndexType.UInt16;

    // Generate grid lines
    this.generateGridLines();

    // Set up bones for skinning
    const boneNames: string[] = [];
    const invBindMatrices: mat4[] = [];

    for (let iz = 0; iz < RGBCubeLattice.LATTICE_SIZE; iz++) {
      for (let iy = 0; iy < RGBCubeLattice.LATTICE_SIZE; iy++) {
        for (let ix = 0; ix < RGBCubeLattice.LATTICE_SIZE; ix++) {
          const boneName = `Bone_${ix}_${iy}_${iz}`;
          boneNames.push(boneName);

          // Inverse bind matrix - identity since bones start at their bind positions
          const invBind = new mat4();
          invBind.column0 = new vec4(1, 0, 0, 0);
          invBind.column1 = new vec4(0, 1, 0, 0);
          invBind.column2 = new vec4(0, 0, 1, 0);

          // Offset by initial bone position
          const r = ix / (RGBCubeLattice.LATTICE_SIZE - 1);
          const g = iy / (RGBCubeLattice.LATTICE_SIZE - 1);
          const b = iz / (RGBCubeLattice.LATTICE_SIZE - 1);
          const pos = this.rgbToColorSpacePosition(r, g, b, 0);

          invBind.column3 = new vec4(-pos.x, -pos.y, -pos.z, 1);
          invBindMatrices.push(invBind);
        }
      }
    }

    this.meshBuilder.setBones(boneNames, invBindMatrices);

    if (this.meshBuilder.isValid()) {
      this.meshBuilder.updateMesh();
      this.meshVisual.mesh = this.meshBuilder.getMesh();
      print(`RGBCubeLattice: Generated mesh with ${this.meshBuilder.getVerticesCount()} vertices`);
    }
  }

  private generateGridLines(): void {
    const density = this._gridDensity;

    for (let ri = 0; ri <= density; ri++) {
      for (let gi = 0; gi <= density; gi++) {
        const r = ri / density;
        const g = gi / density;

        // Generate tube along B axis
        this.generateTube(r, g);
      }
    }
  }

  private generateTube(r: number, g: number): void {
    const segments = this._circleSegments;
    const radius = this._tubeRadius;
    const lineSegs = this._lineSegments;
    const startIndex = this.meshBuilder.getVerticesCount();

    // Generate vertices along the tube
    for (let i = 0; i <= lineSegs; i++) {
      const b = i / lineSegs;

      // Get position in RGB space (initial pose)
      const pos = this.rgbToColorSpacePosition(r, g, b, 0);

      // Get lattice weights for this point
      const { indices, weights } = this.getLatticeWeights(r, g, b);

      // Encode bone data
      const boneData = [
        this.encodeBoneData(indices[0], weights[0]),
        this.encodeBoneData(indices[1], weights[1]),
        this.encodeBoneData(indices[2], weights[2]),
        this.encodeBoneData(indices[3], weights[3]),
      ];

      // Calculate frame for tube
      let forward: vec3;
      if (i === 0) {
        const nextPos = this.rgbToColorSpacePosition(r, g, 1 / lineSegs, 0);
        forward = nextPos.sub(pos).normalize();
      } else if (i === lineSegs) {
        const prevPos = this.rgbToColorSpacePosition(r, g, (lineSegs - 1) / lineSegs, 0);
        forward = pos.sub(prevPos).normalize();
      } else {
        const prevPos = this.rgbToColorSpacePosition(r, g, (i - 1) / lineSegs, 0);
        const nextPos = this.rgbToColorSpacePosition(r, g, (i + 1) / lineSegs, 0);
        forward = nextPos.sub(prevPos).normalize();
      }

      const worldUp = new vec3(0, 1, 0);
      let right: vec3, up: vec3;

      if (Math.abs(forward.dot(worldUp)) > 0.99) {
        right = new vec3(1, 0, 0);
        up = forward.cross(right).normalize();
        right = up.cross(forward).normalize();
      } else {
        right = forward.cross(worldUp).normalize();
        up = right.cross(forward).normalize();
      }

      // Add ring of vertices
      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const localOffset = right.uniformScale(cos * radius).add(up.uniformScale(sin * radius));
        const worldPos = pos.add(localOffset);
        const normal = localOffset.normalize();

        this.meshBuilder.appendVerticesInterleaved([
          worldPos.x, worldPos.y, worldPos.z,
          normal.x, normal.y, normal.z,
          r, g, // UV stores RGB for color
          boneData[0], boneData[1], boneData[2], boneData[3],
        ]);
      }
    }

    // Generate indices
    for (let i = 0; i < lineSegs; i++) {
      for (let j = 0; j < segments; j++) {
        const current = startIndex + i * segments + j;
        const next = startIndex + i * segments + ((j + 1) % segments);
        const currentNext = startIndex + (i + 1) * segments + j;
        const nextNext = startIndex + (i + 1) * segments + ((j + 1) % segments);

        this.meshBuilder.appendIndices([
          current, currentNext, next,
          next, currentNext, nextNext,
        ]);
      }
    }
  }

  /**
   * Position all bones to a specific preset
   */
  private positionBones(preset: number): void {
    const positions = this.bonePositions[preset];
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].getTransform().setLocalPosition(positions[i]);
    }
  }

  /**
   * Interpolate bone positions between two presets
   */
  private lerpBones(fromPreset: number, toPreset: number, t: number): void {
    const fromPositions = this.bonePositions[fromPreset];
    const toPositions = this.bonePositions[toPreset];

    for (let i = 0; i < this.bones.length; i++) {
      const from = fromPositions[i];
      const to = toPositions[i];
      const pos = new vec3(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        from.z + (to.z - from.z) * t
      );
      this.bones[i].getTransform().setLocalPosition(pos);
    }
  }

  private updateTransition(): void {
    if (!this._isTransitioning) return;

    const elapsed = getTime() - this._transitionStartTime;
    const t = Math.min(elapsed / this._transitionDuration, 1.0);

    // Smooth easing
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.lerpBones(this._currentPreset, this._targetPreset, eased);

    if (t >= 1.0) {
      this._isTransitioning = false;
      this._currentPreset = this._targetPreset;
      this._transitionProgress = 1.0;
    }
  }

  // ============================================
  // COLOR SPACE CONVERSIONS
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

  private rgbToColorSpacePosition(r: number, g: number, b: number, colorSpace: number): vec3 {
    const size = this._cubeSize;

    switch (colorSpace) {
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
  // PUBLIC API
  // ============================================

  /**
   * Set preset with smooth transition
   */
  public setPreset(index: number): void {
    const targetPreset = Math.max(0, Math.min(RGBCubeLattice.PRESET_COUNT - 1, Math.round(index)));

    if (targetPreset === this._currentPreset && !this._isTransitioning) return;

    this._targetPreset = targetPreset;
    this._transitionStartTime = getTime();
    this._isTransitioning = true;
  }

  /**
   * Set preset instantly without animation
   */
  public setPresetImmediate(index: number): void {
    const preset = Math.max(0, Math.min(RGBCubeLattice.PRESET_COUNT - 1, Math.round(index)));
    this._currentPreset = preset;
    this._targetPreset = preset;
    this._isTransitioning = false;
    this.positionBones(preset);
  }

  /**
   * Get current preset index
   */
  public getPreset(): number {
    return this._isTransitioning ? this._targetPreset : this._currentPreset;
  }

  /**
   * Get preset name by index
   */
  public static getPresetName(index: number): string {
    const names = ["RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"];
    return names[index] || "Unknown";
  }

  get transitionDuration(): number { return this._transitionDuration; }
  set transitionDuration(value: number) { this._transitionDuration = value; }

  get isTransitioning(): boolean { return this._isTransitioning; }
}
