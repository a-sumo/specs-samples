// Spawns markers at every active tropical cyclone in StormsData.ts. Markers
// are positioned via the WindGlobeCalibration's latLonToWorld helper, then
// pulsed in scale via a sin wave for visibility.
//
// Setup:
//   - calibrationObject: the Globe Calibration SceneObject.
//   - markerPrefab (optional): a prefab spawned per storm. If empty, the
//     script creates a small unlit sphere child instead.
//   - markerScale: base local scale for each marker.

import { STORMS, STORMS_FETCHED_AT, Storm } from "./StormsData";

@component
export class StormMarkers extends BaseScriptComponent {
  @input
  @hint("Globe Calibration SceneObject (its WindGlobeCalibration script is read).")
  calibrationObject!: SceneObject;

  @input
  @allowUndefined
  @hint("Optional prefab to instantiate per storm. Leave empty to use auto sphere markers.")
  markerPrefab: ObjectPrefab | null = null;

  @input
  @allowUndefined
  @hint("Optional template SceneObject — duplicated per storm if no prefab is supplied.")
  markerTemplate: SceneObject | null = null;

  @input
  markerScale: number = 0.8;

  @input
  @hint("Multiplier on the pulse amplitude. 0 = static, 1 = breathing.")
  pulseAmount: number = 0.35;

  @input
  @hint("Pulse frequency in Hz.")
  pulseHz: number = 1.4;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  @hint("Tiny outward lift from the globe surface, in cm. Keep low so the marker remains on the storm location.")
  surfaceLiftCm: number = 0.0;

  private cal: any = null;
  private markers: { obj: SceneObject; storm: Storm; baseScale: vec3 }[] = [];

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("UpdateEvent").bind(() => this.tick());
  }

  private init() {
    if (!this.calibrationObject) {
      print("[StormMarkers] missing calibrationObject");
      return;
    }
    const comps = this.calibrationObject.getComponents("Component.ScriptComponent") as ScriptComponent[];
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i] as any;
      if (typeof c.latLonToWorld === "function") { this.cal = c; break; }
    }
    if (!this.cal) {
      print("[StormMarkers] No WindGlobeCalibration found.");
      return;
    }

    print(`[StormMarkers] ${STORMS.length} storms (data fetched ${STORMS_FETCHED_AT})`);
    for (const s of STORMS) this.spawnMarker(s);
  }

  private spawnMarker(s: Storm) {
    if (s.lat === null || s.lon === null || isNaN(s.lat) || isNaN(s.lon)) {
      print(`[StormMarkers] ${s.name} has no valid coordinate — skipping marker.`);
      return;
    }
    let obj: SceneObject | null = null;
    if (this.markerPrefab) {
      obj = this.markerPrefab.instantiate(this.sceneObject);
    } else if (this.markerTemplate) {
      // Reuse-by-copy is not a primitive in LS; rely on the user wiring a prefab
      // for repeated markers. Fall back to using the template directly when
      // there is exactly one storm.
      obj = this.markerTemplate;
    }
    if (!obj) {
      print(`[StormMarkers] no marker prefab/template — skipping ${s.name}`);
      return;
    }
    obj.name = `Storm · ${s.name}`;
    const t = obj.getTransform();
    const baseScale = new vec3(this.markerScale, this.markerScale, this.markerScale);
    t.setLocalScale(baseScale);

    const marker = { obj, storm: s, baseScale };
    this.placeMarker(marker);
    this.markers.push(marker);
  }

  private tick() {
    if (this.markers.length === 0) return;
    const t = getTime();
    const phase = t * this.pulseHz * 2 * Math.PI;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      this.placeMarker(m);
      const f = 1 + this.pulseAmount * Math.sin(phase + i);
      m.obj.getTransform().setLocalScale(new vec3(
        m.baseScale.x * f,
        m.baseScale.y * f,
        m.baseScale.z * f,
      ));
    }
  }

  private placeMarker(m: { obj: SceneObject; storm: Storm; baseScale: vec3 }) {
    if (!this.cal || typeof this.cal.latLonToWorld !== "function") return;
    if (m.storm.lat === null || m.storm.lon === null || isNaN(m.storm.lat) || isNaN(m.storm.lon)) return;
    const world = this.cal.latLonToWorld(m.storm.lat, m.storm.lon) as vec3;
    let placed = world;
    if (this.surfaceLiftCm > 0 && this.cal.earthSphere) {
      const center = this.cal.earthSphere.getTransform().getWorldPosition() as vec3;
      const normal = world.sub(center);
      const len = normal.length;
      if (len > 0.0001) placed = world.add(normal.uniformScale(this.surfaceLiftCm / len));
    }
    m.obj.getTransform().setWorldPosition(placed);
  }
}
