import { FLOW_PATHS } from "./FlowPaths";

// CarFlowStreamlines — Earth-wind-map-style streamline GEOMETRY for the baked
// car-flow field, driven by a draggable slice. Only the CURRENT slice's
// streamlines exist as mesh at any time; dragging along the slide axis rebuilds
// the ribbon geo from that slice's baked paths (FLOW_PATHS.slices[k]). The
// CarFlowStream shader animates a flowing dash + vivid speed ramp along the geo.
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
    const N = D.N, M = D.M;
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

    const w = this.ribbonWidth, sref = this.speedScaleRef;
    const verts: number[] = [];
    const idx: number[] = [];
    let vbase = 0;
    const slice = D.slices[k];
    for (let t = 0; t < N; t++) {
      const ln = slice[t]; const xs = ln.x, ys = ln.y, sp = ln.sp;
      const phase = (t * 0.6180339887) % 1.0;
      const ringStart = vbase;
      for (let i = 0; i < M; i++) {
        const px = mapX(xs[i]), py = mapY(ys[i]);
        const i0 = Math.max(0, i - 1), i1 = Math.min(M - 1, i + 1);
        let tx = mapX(xs[i1]) - mapX(xs[i0]), ty = mapY(ys[i1]) - mapY(ys[i0]);
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const pt = i / (M - 1);
        const sc = Math.min(1, sp[i] / sref);
        verts.push(px - nx * w, py - ny * w, 0, pt, phase, sc, 0, -1, 0);
        verts.push(px + nx * w, py + ny * w, 0, pt, phase, sc, 0, 1, 0);
        vbase += 2;
      }
      for (let i = 0; i < M - 1; i++) {
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

  private setSlide(h: vec3, c: number): void {
    this.getTransform().setLocalPosition(new vec3(
      h.x + (this.axis === 0 ? c : 0),
      h.y + (this.axis === 1 ? c : 0),
      h.z + (this.axis === 2 ? c : 0)));
  }
}
