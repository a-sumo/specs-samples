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

  // demo: ping-pong the plane along the slide axis to mock the collider sliding
  @input('bool') autoScroll: boolean = false;
  @input('float') autoScrollSpeed: number = 0.12;

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
    const half = this.travel * 0.5;

    if (this.autoScroll) {
      // ping-pong the plane position along the slide axis, slice follows
      const ph = getTime() * this.autoScrollSpeed;
      const tri = Math.abs((ph % 2.0) - 1.0);        // 0 -> 1 -> 0
      const c = (tri * 2.0 - 1.0) * half;            // -half .. +half
      this.setSlidePos(c);
      s = c / this.travel + 0.5;
    } else if (this.driveFromPosition) {
      // lock to a single slide axis, clamp within bounds so it can only slide
      const p = this.getTransform().getLocalPosition();
      let c = this.axis === 0 ? p.x : this.axis === 1 ? p.y : p.z;
      c = Math.max(-half, Math.min(half, c));
      this.setSlidePos(c);
      s = c / this.travel + 0.5;
    }

    this.pass.Time = getTime();
    this.pass.SliceT = s;
  }

  private setSlidePos(c: number): void {
    this.getTransform().setLocalPosition(new vec3(
      this.axis === 0 ? c : 0,
      this.axis === 1 ? c : 0,
      this.axis === 2 ? c : 0));
  }
}
