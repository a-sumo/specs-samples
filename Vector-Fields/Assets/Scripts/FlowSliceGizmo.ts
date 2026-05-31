// FlowSliceGizmo — procedural 3D guidance geometry for the flow slice plane.
// The frame uses actual tube/cone geometry instead of flat quads, so it keeps
// its shape when the object is scaled and reads as a physical slice control.
//
// Two parts, two materials so they can read as distinct colors:
//   - a thin blue outline (in theme) tracing the slice, plus the one-way wind cue
//   - bold accent-colored grab handles on the left and right edges, each with a
//     depth double-arrow showing the slice slides toward/away from you
@component
export class FlowSliceGizmo extends BaseScriptComponent {
  @input material: Material;
  @input('float') planeWidth: number = 36.6;
  @input('float') planeHeight: number = 14.12;
  @input('float') travel: number = 9;
  @input('float') lineWidth: number = 0.18;
  @input('float') flowDirection: number = -1;
  @input('int') radialSegments: number = 10;

  // In-theme blue for the slice outline + wind cue.
  private static OUTLINE_COLOR = new vec4(0.094, 0.471, 0.878, 1.0);
  // Lighter, brighter blue for the grab handles so they pop against the outline.
  private static HANDLE_COLOR = new vec4(0.42, 0.71, 1.0, 1.0);

  private handleObject!: SceneObject;

  onAwake(): void {
    this.build();
  }

  private build(): void {
    const hw = this.planeWidth * 0.5;
    const hh = this.planeHeight * 0.5;
    const segs = Math.max(6, Math.min(18, Math.floor(this.radialSegments)));

    // Outline is deliberately thin so the handles dominate visually.
    const lineRadius = Math.max(0.012, this.lineWidth * 0.10);
    const lift = lineRadius * 1.8;

    // --- Outline mesh (blue) -------------------------------------------------
    const outline = this.makeBuilder();
    this.appendTubeSegment(outline, new vec3(-hw, -hh, lift), new vec3(hw, -hh, lift), lineRadius, segs);
    this.appendTubeSegment(outline, new vec3(hw, -hh, lift), new vec3(hw, hh, lift), lineRadius, segs);
    this.appendTubeSegment(outline, new vec3(hw, hh, lift), new vec3(-hw, hh, lift), lineRadius, segs);
    this.appendTubeSegment(outline, new vec3(-hw, hh, lift), new vec3(-hw, -hh, lift), lineRadius, segs);

    // One-way wind cue: default is nose/tip-to-back across the car image.
    const dir = this.flowDirection < 0 ? -1.0 : 1.0;
    const arrowY = -hh - this.lineWidth * 0.76;
    this.appendArrow(
      outline,
      new vec3(-dir * hw * 0.43, arrowY, lift),
      new vec3(dir * hw * 0.43, arrowY, lift),
      lineRadius * 1.1,
      lineRadius * 4.4,
      segs
    );
    outline.updateMesh();

    let rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = outline.getMesh();
    if (this.material) {
      this.applyTint(this.material, FlowSliceGizmo.OUTLINE_COLOR);
      rmv.mainMaterial = this.material;
    }

    // --- Handle mesh (accent) ------------------------------------------------
    // A thick vertical grip on each side edge, plus a depth (Z) double-arrow so
    // it reads as "grab here and slide the slice toward / away from you".
    const handles = this.makeBuilder();
    const gripRadius = Math.max(0.05, this.lineWidth * 0.34);
    const gripHalf = hh * 0.5;
    const depthHalf = Math.min(this.travel * 0.5, hh * 0.42);
    for (const side of [-1, 1]) {
      const x = side * hw;
      this.appendTubeSegment(handles, new vec3(x, -gripHalf, lift), new vec3(x, gripHalf, lift), gripRadius, segs);
      this.appendDoubleArrow(
        handles,
        new vec3(x, 0.0, -depthHalf),
        new vec3(x, 0.0, depthHalf),
        gripRadius * 0.55,
        gripRadius * 1.7,
        segs
      );
    }
    handles.updateMesh();

    this.handleObject = this.getOrCreateChild("Slice Handles");
    let hrmv = this.handleObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!hrmv) hrmv = this.handleObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    hrmv.mesh = handles.getMesh();
    if (this.material) {
      const handleMat = this.material.clone();
      this.applyTint(handleMat, FlowSliceGizmo.HANDLE_COLOR);
      hrmv.mainMaterial = handleMat;
    }
  }

  private getOrCreateChild(name: string): SceneObject {
    const count = this.sceneObject.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const c = this.sceneObject.getChild(i);
      if (c && c.name === name) return c;
    }
    const child = global.scene.createSceneObject(name);
    child.setParent(this.sceneObject);
    return child;
  }

  private appendArrow(mb: MeshBuilder, start: vec3, end: vec3, shaftRadius: number, headRadius: number, segments: number): void {
    const axis = this.sub(end, start);
    const length = this.len(axis);
    if (length < 0.001) return;
    const dir = this.scale(axis, 1.0 / length);
    const headLength = Math.min(length * 0.28, Math.max(shaftRadius * 4.5, this.lineWidth * 0.72));
    const neck = this.sub(end, this.scale(dir, headLength));
    this.appendTubeSegment(mb, start, neck, shaftRadius, segments);
    this.appendCone(mb, neck, end, headRadius, segments);
  }

  private appendDoubleArrow(mb: MeshBuilder, start: vec3, end: vec3, shaftRadius: number, headRadius: number, segments: number): void {
    const axis = this.sub(end, start);
    const length = this.len(axis);
    if (length < 0.001) return;
    const dir = this.scale(axis, 1.0 / length);
    const headLength = Math.min(length * 0.34, Math.max(shaftRadius * 4.0, this.lineWidth * 0.46));
    const innerA = this.add(start, this.scale(dir, headLength));
    const innerB = this.sub(end, this.scale(dir, headLength));
    this.appendTubeSegment(mb, innerA, innerB, shaftRadius, segments);
    this.appendCone(mb, innerA, start, headRadius, segments);
    this.appendCone(mb, innerB, end, headRadius, segments);
  }

  private appendTubeSegment(mb: MeshBuilder, start: vec3, end: vec3, radius: number, segments: number): void {
    const axis = this.sub(end, start);
    const length = this.len(axis);
    if (length < 0.001) return;
    const dir = this.scale(axis, 1.0 / length);
    const frame = this.frameForAxis(dir);
    const base = mb.getVerticesCount();

    for (let ring = 0; ring < 2; ring++) {
      const center = ring === 0 ? start : end;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2.0;
        const normal = this.add(this.scale(frame.x, Math.cos(a)), this.scale(frame.y, Math.sin(a)));
        const p = this.add(center, this.scale(normal, radius));
        this.addVertex(mb, p, normal, ring, i / segments);
      }
    }

    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = base + i;
      const b = base + j;
      const c = base + segments + i;
      const d = base + segments + j;
      mb.appendIndices([a, c, b, b, c, d]);
    }

    const startCenter = mb.getVerticesCount();
    this.addVertex(mb, start, this.scale(dir, -1.0), 0.5, 0.5);
    const endCenter = mb.getVerticesCount();
    this.addVertex(mb, end, dir, 0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      mb.appendIndices([startCenter, base + j, base + i]);
      mb.appendIndices([endCenter, base + segments + i, base + segments + j]);
    }
  }

  private appendCone(mb: MeshBuilder, baseCenter: vec3, tip: vec3, baseRadius: number, segments: number): void {
    const axis = this.sub(tip, baseCenter);
    const length = this.len(axis);
    if (length < 0.001) return;
    const dir = this.scale(axis, 1.0 / length);
    const frame = this.frameForAxis(dir);
    const base = mb.getVerticesCount();

    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2.0;
      const radial = this.add(this.scale(frame.x, Math.cos(a)), this.scale(frame.y, Math.sin(a)));
      const sideNormal = this.norm(this.add(this.scale(radial, length), this.scale(dir, baseRadius * 0.55)));
      const p = this.add(baseCenter, this.scale(radial, baseRadius));
      this.addVertex(mb, p, sideNormal, 0.0, i / segments);
    }

    const tipIndex = mb.getVerticesCount();
    this.addVertex(mb, tip, dir, 1.0, 0.5);
    const capCenter = mb.getVerticesCount();
    this.addVertex(mb, baseCenter, this.scale(dir, -1.0), 0.5, 0.5);

    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      mb.appendIndices([base + i, tipIndex, base + j]);
      mb.appendIndices([capCenter, base + j, base + i]);
    }
  }

  private addVertex(mb: MeshBuilder, p: vec3, n: vec3, u: number, v: number): void {
    mb.appendVerticesInterleaved([p.x, p.y, p.z, n.x, n.y, n.z, u, v]);
  }

  private makeBuilder(): MeshBuilder {
    const mb = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 },
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    return mb;
  }

  private frameForAxis(axis: vec3): { x: vec3, y: vec3 } {
    const ref = Math.abs(axis.y) < 0.82 ? new vec3(0.0, 1.0, 0.0) : new vec3(1.0, 0.0, 0.0);
    let x = this.norm(this.cross(ref, axis));
    if (this.len(x) < 0.001) x = new vec3(1.0, 0.0, 0.0);
    const y = this.norm(this.cross(axis, x));
    return { x: x, y: y };
  }

  private applyTint(mat: Material, color: vec4): void {
    const pass = mat.mainPass as any;
    try { pass.baseColor = color; } catch (e) {}
    try { pass.baseColorFactor = color; } catch (e) {}
    try { pass.Port_Default_N369 = color; } catch (e) {}
    try { pass.color = color; } catch (e) {}
  }

  private add(a: vec3, b: vec3): vec3 { return new vec3(a.x + b.x, a.y + b.y, a.z + b.z); }
  private sub(a: vec3, b: vec3): vec3 { return new vec3(a.x - b.x, a.y - b.y, a.z - b.z); }
  private scale(a: vec3, s: number): vec3 { return new vec3(a.x * s, a.y * s, a.z * s); }
  private len(a: vec3): number { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  private norm(a: vec3): vec3 {
    const l = this.len(a);
    return l > 0.00001 ? this.scale(a, 1.0 / l) : new vec3(0.0, 1.0, 0.0);
  }
  private cross(a: vec3, b: vec3): vec3 {
    return new vec3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x
    );
  }
}
