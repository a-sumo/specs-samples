// FlowSliceGizmo — flat guidance geometry for the flow slice plane:
//   1. a thin rectangular outline framing the control plane (X-Y), and
//   2. a horizontal shelf at the bottom with a double-arrow along the Z scroll
//      axis, telling the user which way to drag.
// Built once in onAwake. Sized to match the slice mesh (parent it under the
// slice object so it inherits the same offset/scale and slides with it).
@component
export class FlowSliceGizmo extends BaseScriptComponent {
  @input material: Material;
  @input('float') planeWidth: number = 36.6;
  @input('float') planeHeight: number = 14.12;
  @input('float') travel: number = 9;
  @input('float') lineWidth: number = 0.3;

  onAwake(): void { this.build(); }

  private build(): void {
    const hw = this.planeWidth * 0.5, hh = this.planeHeight * 0.5, lw = this.lineWidth;
    const V: number[] = [], I: number[] = [];
    let vb = 0;
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      V.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      I.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3); vb += 4;
    };
    const tri = (a: number[], b: number[], c: number[]) => {
      V.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      I.push(vb, vb + 1, vb + 2); vb += 3;
    };

    // --- outline border (4 thin quads in the X-Y plane, z=0) ---
    quad([-hw, -hh, 0], [hw, -hh, 0], [hw, -hh + lw, 0], [-hw, -hh + lw, 0]); // bottom
    quad([-hw, hh - lw, 0], [hw, hh - lw, 0], [hw, hh, 0], [-hw, hh, 0]);     // top
    quad([-hw, -hh, 0], [-hw + lw, -hh, 0], [-hw + lw, hh, 0], [-hw, hh, 0]); // left
    quad([hw - lw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [hw - lw, hh, 0]);     // right

    // --- bottom shelf double-arrow along Z (horizontal X-Z plane at y=-hh) ---
    const y = -hh - lw;
    const ht = this.travel * 0.5;
    const shaftW = lw * 0.6, headL = ht * 0.32, headW = lw * 2.6;
    quad([-shaftW, y, -ht + headL], [shaftW, y, -ht + headL], [shaftW, y, ht - headL], [-shaftW, y, ht - headL]);
    tri([-headW, y, ht - headL], [headW, y, ht - headL], [0, y, ht]);          // +Z head
    tri([headW, y, -ht + headL], [-headW, y, -ht + headL], [0, y, -ht]);       // -Z head

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
