import { FLOW_PATHS } from "./FlowPaths";

// CarFlowStreamlines — Earth-wind-map-style streamline GEOMETRY for the baked
// car-flow field, driven by a draggable slice. Only the CURRENT slice's
// streamlines exist as mesh at any time; dragging along the slide axis rebuilds
// smoothed tube-ribbon geo from that slice's baked paths (FLOW_PATHS.slices[k]).
// The CarFlowStream shader animates a soft flowing speed ramp along the geo.
@component
export class CarFlowStreamlines extends BaseScriptComponent {
  @input material: Material;
  @input('float') planeWidth: number = 24;      // local width the field X-domain maps to
  @input('float') planeHeight: number = 9.27;   // local height the field Y-domain maps to
  @input('float') ribbonWidth: number = 0.10;
  @input('float') phaseSpeed: number = 0.4;
  @input('float') speedScaleRef: number = 1.5;

  // slice control — which baked Z-slice's geo is built
  @input('bool') autoScroll: boolean = false;
  @input('float') autoScrollSpeed: number = 0.2;
  @input('bool') driveFromPosition: boolean = true;
  @input('int') axis: number = 2;
  @input('float') travel: number = 3.635;

  private pass: any;
  private rmv: RenderMeshVisual;
  private nz: number = 1;
  private builtSlice: number = -1;          // which slice the current mesh holds
  private home: vec3 = new vec3(0, 0, 0);   // aligned rest position; slide is relative to this
  private readonly smoothSamplesPerSegment: number = 4;

  onAwake(): void {
    this.nz = FLOW_PATHS.NZ;
    this.home = this.getTransform().getLocalPosition();

    let rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    this.rmv = rmv;
    if (this.material) {
      this.rmv.mainMaterial = this.material;
      this.pass = this.material.mainPass as any;
      this.pass.PhaseSpeed = this.phaseSpeed;
    }

    // build the starting slice so something shows before the first drag
    this.buildSlice(Math.round(0.5 * (this.nz - 1)));
    print("[CarFlowStreamlines] ready, " + this.nz + " slices (geo rebuilt on slice change)");
    this.createEvent('UpdateEvent').bind(() => this.tick());
  }

  private tick(): void {
    if (!this.pass) return;
    const k = this.sliceFromControl();
    if (k !== this.builtSlice) this.buildSlice(k);   // update the geo when the slice changes
    this.pass.Time = getTime();
    this.pass.PhaseSpeed = this.phaseSpeed;
  }

  // Resolve the active slice index from auto-scroll or the draggable position,
  // keeping the object locked to its slide axis through home.
  private sliceFromControl(): number {
    let s = 0.5;
    const half = this.travel * 0.5;
    const h = this.home;
    if (this.autoScroll) {
      const ph = getTime() * this.autoScrollSpeed;
      const c = (Math.abs((ph % 2.0) - 1.0) * 2.0 - 1.0) * half;   // -half..+half
      this.setSlide(h, c);
      s = c / this.travel + 0.5;
    } else if (this.driveFromPosition) {
      const p = this.getTransform().getLocalPosition();
      let c = this.axis === 0 ? p.x - h.x : this.axis === 1 ? p.y - h.y : p.z - h.z;
      c = Math.max(-half, Math.min(half, c));
      this.setSlide(h, c);
      s = c / this.travel + 0.5;
    }
    return Math.max(0, Math.min(this.nz - 1, Math.round(s * (this.nz - 1))));
  }

  // Build ribbon geo for ONE slice's streamlines (FLOW_PATHS.slices[k]).
  private buildSlice(k: number): void {
    const D = FLOW_PATHS;
    const N = D.N;
    const X0 = D.X0, X1 = D.X1, Y0 = D.Y0, Y1 = D.Y1;
    const mapX = (x: number) => ((x - X0) / (X1 - X0)) * this.planeWidth - this.planeWidth * 0.5;
    const mapY = (y: number) => ((y - Y0) / (Y1 - Y0)) * this.planeHeight - this.planeHeight * 0.5;

    const mb = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "texture0", components: 2 },   // (pathT, templatePhase)
      { name: "texture1", components: 2 },   // (speedColor, _)
      { name: "texture2", components: 2 },   // (crossSection, _)
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;

    const w = Math.max(0.025, this.ribbonWidth * 0.74);
    const sref = this.speedScaleRef;
    const verts: number[] = [];
    const idx: number[] = [];
    let vbase = 0;
    const slice = D.slices[k];
    for (let t = 0; t < N; t++) {
      const ln = slice[t]; const xs = ln.x, ys = ln.y, sp = ln.sp;
      const phase = (t * 0.6180339887) % 1.0;
      const smooth = this.smoothPath(xs, ys, sp, mapX, mapY);
      if (smooth.x.length < 2) continue;
      const ringStart = vbase;
      for (let i = 0; i < smooth.x.length; i++) {
        const px = smooth.x[i], py = smooth.y[i];
        const i0 = Math.max(0, i - 1), i1 = Math.min(smooth.x.length - 1, i + 1);
        let tx = smooth.x[i1] - smooth.x[i0], ty = smooth.y[i1] - smooth.y[i0];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const pt = smooth.t[i];
        const sc = Math.min(1, smooth.speed[i] / sref);
        verts.push(px - nx * w, py - ny * w, 0, pt, phase, sc, 0, -1, 0);
        verts.push(px + nx * w, py + ny * w, 0, pt, phase, sc, 0, 1, 0);
        vbase += 2;
      }
      for (let i = 0; i < smooth.x.length - 1; i++) {
        const a = ringStart + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    mb.appendVerticesInterleaved(verts);
    mb.appendIndices(idx);
    mb.updateMesh();
    this.rmv.mesh = mb.getMesh();
    this.builtSlice = k;
  }

  private smoothPath(
    xs: number[],
    ys: number[],
    speeds: number[],
    mapX: (x: number) => number,
    mapY: (y: number) => number
  ): { x: number[], y: number[], speed: number[], t: number[] } {
    const n = xs.length;
    const outX: number[] = [];
    const outY: number[] = [];
    const outSpeed: number[] = [];
    const samples = Math.max(1, Math.floor(this.smoothSamplesPerSegment));

    const px = (i: number) => mapX(xs[Math.max(0, Math.min(n - 1, i))]);
    const py = (i: number) => mapY(ys[Math.max(0, Math.min(n - 1, i))]);
    const ps = (i: number) => speeds[Math.max(0, Math.min(n - 1, i))];

    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < samples; s++) {
        const u = s / samples;
        outX.push(this.catmull(px(i - 1), px(i), px(i + 1), px(i + 2), u));
        outY.push(this.catmull(py(i - 1), py(i), py(i + 1), py(i + 2), u));
        outSpeed.push(this.lerp(ps(i), ps(i + 1), this.smoothstep(u)));
      }
    }
    outX.push(px(n - 1));
    outY.push(py(n - 1));
    outSpeed.push(ps(n - 1));

    const outT: number[] = [];
    let total = 0.0;
    outT[0] = 0.0;
    for (let i = 1; i < outX.length; i++) {
      total += Math.hypot(outX[i] - outX[i - 1], outY[i] - outY[i - 1]);
      outT[i] = total;
    }
    if (total > 0.0001) {
      for (let i = 0; i < outT.length; i++) outT[i] /= total;
    }
    return { x: outX, y: outY, speed: outSpeed, t: outT };
  }

  private catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2.0 * p1) +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private smoothstep(t: number): number {
    const x = Math.max(0.0, Math.min(1.0, t));
    return x * x * (3.0 - 2.0 * x);
  }

  private setSlide(h: vec3, c: number): void {
    this.getTransform().setLocalPosition(new vec3(
      h.x + (this.axis === 0 ? c : 0),
      h.y + (this.axis === 1 ? c : 0),
      h.z + (this.axis === 2 ? c : 0)));
  }
}
