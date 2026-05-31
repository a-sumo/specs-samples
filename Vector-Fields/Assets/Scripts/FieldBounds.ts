// FieldBounds — static wireframe box showing the field volume the slice sweeps.
//   X = planeWidth (field length), Y = planeHeight (field height),
//   Z = depth (the scroll range = slice travel).
// Place it at the slice plane's HOME transform (same offset/scale) but NOT as a
// child of the sliding plane, so it stays put and marks the scroll bounds.
@component
export class FieldBounds extends BaseScriptComponent {
  @input material: Material;
  @input('float') planeWidth: number = 36.6;
  @input('float') planeHeight: number = 14.12;
  @input('float') depth: number = 9;          // scroll range along Z (= slice travel)
  @input('float') lineWidth: number = 0.18;

  onAwake(): void { this.build(); }

  private build(): void {
    const hw = this.planeWidth * 0.5, hh = this.planeHeight * 0.5, hd = this.depth * 0.5;
    const w = this.lineWidth;
    const V: number[] = [], I: number[] = [];
    let vb = 0;
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      V.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      I.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3); vb += 4;
    };
    const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const add = (p: number[], q: number[]) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
    const scal = (p: number[], s: number) => [p[0] * s, p[1] * s, p[2] * s];
    const norm = (p: number[]) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
    const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // a beam = two perpendicular thin quads, so the edge is visible from any angle
    const beam = (p0: number[], p1: number[]) => {
      const dir = norm(sub(p1, p0));
      let up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const n1 = scal(norm(cross(dir, up)), w);
      const n2 = scal(norm(cross(dir, n1)), w);
      quad(sub(p0, n1), sub(p1, n1), add(p1, n1), add(p0, n1));
      quad(sub(p0, n2), sub(p1, n2), add(p1, n2), add(p0, n2));
    };
    const c = (sx: number, sy: number, sz: number) => [sx * hw, sy * hh, sz * hd];
    // 4 edges along X
    beam(c(-1, -1, -1), c(1, -1, -1)); beam(c(-1, 1, -1), c(1, 1, -1));
    beam(c(-1, -1, 1), c(1, -1, 1)); beam(c(-1, 1, 1), c(1, 1, 1));
    // 4 edges along Y
    beam(c(-1, -1, -1), c(-1, 1, -1)); beam(c(1, -1, -1), c(1, 1, -1));
    beam(c(-1, -1, 1), c(-1, 1, 1)); beam(c(1, -1, 1), c(1, 1, 1));
    // 4 edges along Z
    beam(c(-1, -1, -1), c(-1, -1, 1)); beam(c(1, -1, -1), c(1, -1, 1));
    beam(c(-1, 1, -1), c(-1, 1, 1)); beam(c(1, 1, -1), c(1, 1, 1));

    const mb = new MeshBuilder([{ name: "position", components: 3 }]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    mb.appendVerticesInterleaved(V);
    mb.appendIndices(I);
    mb.updateMesh();

    let rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = mb.getMesh();
    if (this.material) rmv.mainMaterial = this.material;
  }
}
