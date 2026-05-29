// FlowSlicePlane.ts — drives the baked-field flow-map slice plane.
// The heavy work is offline-baked into the field atlas; per frame this only
// pushes Time + the slice depth (from a draggable handle) into the shader.
@component
export class FlowSlicePlane extends BaseScriptComponent {
  @input material: Material;                 // material using FlowSlice.ss_graph
  @input fieldTex: Texture;                  // flow_field.png atlas
  @input('float') @widget(new SliderWidget(0, 1, 0.01)) slice: number = 0.5;
  @input('float') flowSpeed: number = 0.35;
  @input('float') density: number = 18.0;
  @input('float') brightness: number = 1.4;

  // Optional: drive the slice from this object's local position along an axis,
  // so dragging the plane through the car scrubs the slice. Maps [-travel/2, +travel/2] -> [0,1].
  @input('bool') driveFromPosition: boolean = true;
  @input('int') @widget(new ComboBoxWidget([new ComboBoxItem('X', 0), new ComboBoxItem('Y', 1), new ComboBoxItem('Z', 2)])) axis: number = 2;
  @input('float') travel: number = 8.6;      // car length in LS units (from bake: CARL)

  private pass: any;

  onAwake(): void {
    if (!this.material) { print('FlowSlicePlane: no material'); return; }
    this.pass = this.material.mainPass as any;
    if (this.fieldTex) this.pass.FieldTex = this.fieldTex;
    this.pass.FlowSpeed = this.flowSpeed;
    this.pass.Density = this.density;
    this.pass.Brightness = this.brightness;
    this.createEvent('UpdateEvent').bind(() => this.onUpdate());
  }

  private onUpdate(): void {
    let s = this.slice;
    if (this.driveFromPosition) {
      const p = this.getTransform().getLocalPosition();
      const c = this.axis === 0 ? p.x : this.axis === 1 ? p.y : p.z;
      s = Math.max(0, Math.min(1, c / this.travel + 0.5));
    }
    this.pass.Time = getTime();
    this.pass.SliceT = s;
  }
}
