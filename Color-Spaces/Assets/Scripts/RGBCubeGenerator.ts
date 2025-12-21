
/**
 * Generates an RGB cube visualization with vertical lines
 * that can be mapped to different color spaces
 */
@component
export class RGBCubeGenerator extends BaseScriptComponent {
  @input
  @hint("Size of the cube in scene units")
  private _cubeSize: number = 100.0;

  @input
  @hint("Number of lines per axis (e.g., 5 = 5x5 grid of vertical lines)")
  private _gridDensity: number = 5;

  @input
  @hint("Number of segments per line (for smooth curves when transformed)")
  private _lineSegments: number = 24;

  @input
  @hint("Radius of each tube")
  private _tubeRadius: number = 1.0;

  @input
  @hint("Number of segments around tube circumference")
  private _circleSegments: number = 8;

  @input
  @hint("Number of latitude rings on hemisphere caps")
  private _capSegments: number = 4;

  @input
  @hint("Material to apply to all lines")
  public material!: Material;

  @input
  @hint("Draw the wireframe edges of the cube")
  private _showWireframe: boolean = true;

  @input
  @hint("Draw the grid of vertical lines")
  private _showGridLines: boolean = true;

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("None", 0),
      new ComboBoxItem("Flat", 1),
      new ComboBoxItem("Rounded", 2),
    ])
  )
  @hint("End cap style for tubes")
  private _capStyle: number = 2;

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

  onAwake(): void {
    this.setupMeshVisual();
    this.generateCube();
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
    const size = this._cubeSize;
    return new vec3(
      (r - 0.5) * size,
      (b - 0.5) * size,
      (g - 0.5) * size
    );
  }

  // ============================================
  // MESH GENERATION
  // ============================================

  private generateCube(): void {
    this.meshBuilder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 },
      { name: "texture1", components: 2 },
    ]);

    this.meshBuilder.topology = MeshTopology.Triangles;
    this.meshBuilder.indexType = MeshIndexType.UInt16;

    if (this._showGridLines) {
      this.generateGridLines();
    }

    if (this._showWireframe) {
      this.generateWireframe();
    }

    if (this.meshBuilder.isValid()) {
      const mesh = this.meshBuilder.getMesh();
      this.meshVisual.mesh = mesh;
      this.meshBuilder.updateMesh();
      this.updateMaterialParams();
    }
  }

  private generateGridLines(): void {
    const density = this._gridDensity;

    for (let ri = 0; ri <= density; ri++) {
      for (let gi = 0; gi <= density; gi++) {
        const r = ri / density;
        const g = gi / density;

        const points: vec3[] = [];

        for (let bi = 0; bi <= this._lineSegments; bi++) {
          const b = bi / this._lineSegments;
          const pos = this.rgbToDisplayPosition(r, g, b);
          points.push(pos);
        }

        this.generateTubeAlongPath(points, r, g);
      }
    }
  }

  private generateWireframe(): void {
    const edges: [vec3, vec3][] = [
      [new vec3(0, 0, 0), new vec3(1, 0, 0)],
      [new vec3(1, 0, 0), new vec3(1, 1, 0)],
      [new vec3(1, 1, 0), new vec3(0, 1, 0)],
      [new vec3(0, 1, 0), new vec3(0, 0, 0)],
      [new vec3(0, 0, 1), new vec3(1, 0, 1)],
      [new vec3(1, 0, 1), new vec3(1, 1, 1)],
      [new vec3(1, 1, 1), new vec3(0, 1, 1)],
      [new vec3(0, 1, 1), new vec3(0, 0, 1)],
      [new vec3(0, 0, 0), new vec3(0, 0, 1)],
      [new vec3(1, 0, 0), new vec3(1, 0, 1)],
      [new vec3(1, 1, 0), new vec3(1, 1, 1)],
      [new vec3(0, 1, 0), new vec3(0, 1, 1)],
    ];

    for (const [start, end] of edges) {
      const points: vec3[] = [];

      for (let i = 0; i <= this._lineSegments; i++) {
        const t = i / this._lineSegments;
        const r = start.x + (end.x - start.x) * t;
        const g = start.y + (end.y - start.y) * t;
        const b = start.z + (end.z - start.z) * t;

        const pos = this.rgbToDisplayPosition(r, g, b);
        points.push(pos);
      }

      this.generateWireframeTube(points, start, end);
    }
  }

  private generateTubeAlongPath(points: vec3[], r: number, g: number): void {
    const segments = this._circleSegments;
    const radius = this._tubeRadius;
    const startIndex = this.meshBuilder.getVerticesCount();

    // Store frame data for caps
    const frames: { pos: vec3; right: vec3; up: vec3; forward: vec3 }[] = [];

    for (let i = 0; i < points.length; i++) {
      const b = i / (points.length - 1);
      const pos = points[i];

      let forward: vec3;
      if (i === 0) {
        forward = points[1].sub(points[0]).normalize();
      } else if (i === points.length - 1) {
        forward = points[i].sub(points[i - 1]).normalize();
      } else {
        forward = points[i + 1].sub(points[i - 1]).normalize();
      }

      const worldUp = new vec3(0, 1, 0);
      let right: vec3;
      let up: vec3;

      if (Math.abs(forward.dot(worldUp)) > 0.99) {
        right = new vec3(1, 0, 0);
        up = forward.cross(right).normalize();
        right = up.cross(forward).normalize();
      } else {
        right = forward.cross(worldUp).normalize();
        up = right.cross(forward).normalize();
      }

      frames.push({ pos, right, up, forward });

      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const localPos = right
          .uniformScale(cos * radius)
          .add(up.uniformScale(sin * radius));
        const worldPos = pos.add(localPos);
        const normal = localPos.normalize();

        this.meshBuilder.appendVerticesInterleaved([
          worldPos.x, worldPos.y, worldPos.z,
          normal.x, normal.y, normal.z,
          r, g,
          b, j / segments,
        ]);
      }
    }

    // Generate tube indices
    for (let i = 0; i < points.length - 1; i++) {
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

    // Generate end caps
    if (this._capStyle === 1) {
      this.generateFlatCap(frames[0], r, g, 0, radius, segments, true);
      this.generateFlatCap(frames[frames.length - 1], r, g, 1, radius, segments, false);
    } else if (this._capStyle === 2) {
      this.generateRoundedCap(frames[0], r, g, 0, radius, segments, true);
      this.generateRoundedCap(frames[frames.length - 1], r, g, 1, radius, segments, false);
    }
  }

  private generateWireframeTube(points: vec3[], startRGB: vec3, endRGB: vec3): void {
    const segments = this._circleSegments;
    const radius = this._tubeRadius * 0.5;
    const startIndex = this.meshBuilder.getVerticesCount();

    const frames: { pos: vec3; right: vec3; up: vec3; forward: vec3; r: number; g: number; b: number }[] = [];

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const pos = points[i];

      const r = startRGB.x + (endRGB.x - startRGB.x) * t;
      const g = startRGB.y + (endRGB.y - startRGB.y) * t;
      const b = startRGB.z + (endRGB.z - startRGB.z) * t;

      let forward: vec3;
      if (i === 0) {
        forward = points[1].sub(points[0]).normalize();
      } else if (i === points.length - 1) {
        forward = points[i].sub(points[i - 1]).normalize();
      } else {
        forward = points[i + 1].sub(points[i - 1]).normalize();
      }

      const worldUp = new vec3(0, 1, 0);
      let right: vec3;
      let up: vec3;

      if (Math.abs(forward.dot(worldUp)) > 0.99) {
        right = new vec3(1, 0, 0);
        up = forward.cross(right).normalize();
        right = up.cross(forward).normalize();
      } else {
        right = forward.cross(worldUp).normalize();
        up = right.cross(forward).normalize();
      }

      frames.push({ pos, right, up, forward, r, g, b });

      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const localPos = right
          .uniformScale(cos * radius)
          .add(up.uniformScale(sin * radius));
        const worldPos = pos.add(localPos);
        const normal = localPos.normalize();

        this.meshBuilder.appendVerticesInterleaved([
          worldPos.x, worldPos.y, worldPos.z,
          normal.x, normal.y, normal.z,
          r, g,
          b, j / segments,
        ]);
      }
    }

    // Generate tube indices
    for (let i = 0; i < points.length - 1; i++) {
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

    // Generate end caps for wireframe
    const startFrame = frames[0];
    const endFrame = frames[frames.length - 1];

    if (this._capStyle === 1) {
      this.generateFlatCap(
        { pos: startFrame.pos, right: startFrame.right, up: startFrame.up, forward: startFrame.forward },
        startFrame.r, startFrame.g, startFrame.b, radius, segments, true
      );
      this.generateFlatCap(
        { pos: endFrame.pos, right: endFrame.right, up: endFrame.up, forward: endFrame.forward },
        endFrame.r, endFrame.g, endFrame.b, radius, segments, false
      );
    } else if (this._capStyle === 2) {
      this.generateRoundedCap(
        { pos: startFrame.pos, right: startFrame.right, up: startFrame.up, forward: startFrame.forward },
        startFrame.r, startFrame.g, startFrame.b, radius, segments, true
      );
      this.generateRoundedCap(
        { pos: endFrame.pos, right: endFrame.right, up: endFrame.up, forward: endFrame.forward },
        endFrame.r, endFrame.g, endFrame.b, radius, segments, false
      );
    }
  }

  private generateFlatCap(
    frame: { pos: vec3; right: vec3; up: vec3; forward: vec3 },
    r: number,
    g: number,
    b: number,
    radius: number,
    segments: number,
    isStart: boolean
  ): void {
    const startIndex = this.meshBuilder.getVerticesCount();
    const normal = isStart ? frame.forward.uniformScale(-1) : frame.forward;

    // Center vertex
    this.meshBuilder.appendVerticesInterleaved([
      frame.pos.x, frame.pos.y, frame.pos.z,
      normal.x, normal.y, normal.z,
      r, g,
      b, 0.5,
    ]);

    // Edge vertices
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const localPos = frame.right
        .uniformScale(cos * radius)
        .add(frame.up.uniformScale(sin * radius));
      const worldPos = frame.pos.add(localPos);

      this.meshBuilder.appendVerticesInterleaved([
        worldPos.x, worldPos.y, worldPos.z,
        normal.x, normal.y, normal.z,
        r, g,
        b, j / segments,
      ]);
    }

    // Indices (fan from center)
    for (let j = 0; j < segments; j++) {
      const current = startIndex + 1 + j;
      const next = startIndex + 1 + ((j + 1) % segments);

      if (isStart) {
        this.meshBuilder.appendIndices([startIndex, next, current]);
      } else {
        this.meshBuilder.appendIndices([startIndex, current, next]);
      }
    }
  }

  private generateRoundedCap(
    frame: { pos: vec3; right: vec3; up: vec3; forward: vec3 },
    r: number,
    g: number,
    b: number,
    radius: number,
    segments: number,
    isStart: boolean
  ): void {
    const capSegs = this._capSegments;
    const startIndex = this.meshBuilder.getVerticesCount();
    const direction = isStart ? -1 : 1;

    // Generate hemisphere vertices
    // Latitude rings from equator (tube edge) to pole
    for (let lat = 0; lat <= capSegs; lat++) {
      const phi = (lat / capSegs) * (Math.PI / 2); // 0 to 90 degrees
      const ringRadius = Math.cos(phi) * radius;
      const zOffset = Math.sin(phi) * radius * direction;

      // Offset position along forward direction
      const ringCenter = frame.pos.add(frame.forward.uniformScale(zOffset));

      if (lat === capSegs) {
        // Pole vertex (single point at top of hemisphere)
        const normal = frame.forward.uniformScale(direction);
        this.meshBuilder.appendVerticesInterleaved([
          ringCenter.x, ringCenter.y, ringCenter.z,
          normal.x, normal.y, normal.z,
          r, g,
          b, 0.5,
        ]);
      } else {
        // Ring of vertices
        for (let lon = 0; lon < segments; lon++) {
          const theta = (lon / segments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);

          const localPos = frame.right
            .uniformScale(cos * ringRadius)
            .add(frame.up.uniformScale(sin * ringRadius));
          const worldPos = ringCenter.add(localPos);

          // Normal points outward from center of sphere
          const sphereCenter = frame.pos;
          const normal = worldPos.sub(sphereCenter).normalize();

          this.meshBuilder.appendVerticesInterleaved([
            worldPos.x, worldPos.y, worldPos.z,
            normal.x, normal.y, normal.z,
            r, g,
            b, lon / segments,
          ]);
        }
      }
    }

    // Generate indices
    // Connect latitude rings
    for (let lat = 0; lat < capSegs - 1; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const current = startIndex + lat * segments + lon;
        const next = startIndex + lat * segments + ((lon + 1) % segments);
        const currentUp = startIndex + (lat + 1) * segments + lon;
        const nextUp = startIndex + (lat + 1) * segments + ((lon + 1) % segments);

        if (isStart) {
          this.meshBuilder.appendIndices([
            current, next, currentUp,
            next, nextUp, currentUp,
          ]);
        } else {
          this.meshBuilder.appendIndices([
            current, currentUp, next,
            next, currentUp, nextUp,
          ]);
        }
      }
    }

    // Connect last ring to pole
    const lastRingStart = startIndex + (capSegs - 1) * segments;
    const poleIndex = startIndex + capSegs * segments;

    for (let lon = 0; lon < segments; lon++) {
      const current = lastRingStart + lon;
      const next = lastRingStart + ((lon + 1) % segments);

      if (isStart) {
        this.meshBuilder.appendIndices([current, next, poleIndex]);
      } else {
        this.meshBuilder.appendIndices([current, poleIndex, next]);
      }
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
    this.generateCube();
    this.updateMaterialParams();
  }

  get cubeSize(): number { return this._cubeSize; }
  set cubeSize(value: number) {
    this._cubeSize = value;
    this.generateCube();
    this.updateMaterialParams();
  }

  get gridDensity(): number { return this._gridDensity; }
  set gridDensity(value: number) {
    this._gridDensity = value;
    this.generateCube();
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
      pass.cubeSize = this._cubeSize;
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

  get tubeRadius(): number { return this._tubeRadius; }
  set tubeRadius(value: number) {
    this._tubeRadius = value;
    this.generateCube();
  }

  get lineSegments(): number { return this._lineSegments; }
  set lineSegments(value: number) {
    this._lineSegments = value;
    this.generateCube();
  }

  get capStyle(): number { return this._capStyle; }
  set capStyle(value: number) {
    this._capStyle = value;
    this.generateCube();
  }

  get capSegments(): number { return this._capSegments; }
  set capSegments(value: number) {
    this._capSegments = value;
    this.generateCube();
  }
}