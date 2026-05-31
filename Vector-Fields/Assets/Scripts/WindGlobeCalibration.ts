// Calibrates the lat/lon → world mapping for a textured Earth model.
//
// On awake, the script:
//   1. Walks the Earth hierarchy to find its main RenderMeshVisual (largest
//      bbox, name-biased toward "earth"/"surface").
//   2. Measures the bounding-sphere radius in world units.
//   3. If `desiredRadiusWorld` > 0, rescales the Earth SceneObject so the
//      bbox radius matches.
//   4. Snaps the Anchor and Verify markers onto the sphere surface at their
//      configured lat/lon, using the current yawOffset.
//
// At runtime:
//   - You drag the Anchor onto a known landmark on the visible globe.
//   - The script reads where it sits relative to the Earth's center, infers
//     the yawOffset, and repositions the Verify marker.
//   - If Verify lands on its real landmark on the texture, the calibration
//     is correct.
//
// Convention (Earth-local frame, before applying Earth's world rotation):
//   dir(lat, lon) = ( cos(lat) * sin(lon + yawOffset),
//                     sin(lat),
//                     cos(lat) * cos(lon + yawOffset) )

import { SurfaceLabel } from "./SurfaceLabel";

const DEFAULT_WEATHER_CALLOUT_MATERIAL: Material = requireAsset("../Materials/FlatMaterial 2.mat") as Material;
const WIND_FONT: Font = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;

@component
export class WindGlobeCalibration extends BaseScriptComponent {
  @input
  @hint("Root SceneObject containing the Earth mesh. World position = sphere center.")
  earthSphere!: SceneObject;

  @input
  @hint("Marker you drag onto a known landmark.")
  anchor!: SceneObject;

  @input
  @hint("Anchor latitude (NYC = 40.71).")
  anchorLat: number = 40.71;

  @input
  @hint("Anchor longitude (NYC = -74.01).")
  anchorLon: number = -74.01;

  @input
  @hint("Verify marker — auto-positions at its lat/lon using the calibration.")
  verifier!: SceneObject;

  @input
  @hint("Verifier latitude (London = 51.51).")
  verifyLat: number = 51.51;

  @input
  @hint("Verifier longitude (London = -0.13).")
  verifyLon: number = -0.13;

  @input
  @hint("If > 0, rescale the Earth so its bbox radius matches this (cm). Otherwise leave natural size.")
  desiredRadiusWorld: number = 12;

  @input
  @allowUndefined
  @hint("Wind-speed widget. Pinned directly below the globe AABB so it keeps the same relative position and never orbits when the globe spins.")
  legend: SceneObject = null as any;

  @input
  @hint("Gap (cm) between the bottom of the globe's AABB and the wind-speed widget.")
  legendGapCm: number = 8;

  @input
  @allowUndefined
  @hint("Optional head/camera anchor. Empty searches for Camera Object.")
  cameraRoot: SceneObject = null as any;

  @input
  @allowUndefined
  @hint("Flat material used for selected weather-event callouts.")
  calloutMaterial: Material = DEFAULT_WEATHER_CALLOUT_MATERIAL;

  @input
  @widget(new SliderWidget(0.2, 2.0, 0.05))
  @hint("Seconds for an event focus rotation.")
  eventFocusSeconds: number = 0.7;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  @hint("Small lift for selected weather-event callout anchor, in cm. Keep near zero so the dot remains on the true event location.")
  eventCalloutSurfaceLiftCm: number = 0.15;

  @input
  @widget(new SliderWidget(-180.0, 180.0, 1.0))
  @hint("Manual longitude offset for the Earth texture, in degrees. Use if the map texture seam is not aligned to the default lat/lon convention.")
  textureLongitudeOffsetDeg: number = 0;

  @input
  @hint("Flip east/west longitude mapping for Earth textures with mirrored UV orientation.")
  invertLongitude: boolean = false;

  // Filled by the bbox measurement + anchor calibration. Streamline component
  // reads these directly.
  public radiusWorld: number = 1;
  public yawOffsetRad: number = 0;

  private readonly D2R = Math.PI / 180;
  private earthMesh: RenderMeshVisual | null = null;
  private initialized: boolean = false;
  private focusActive: boolean = false;
  private focusElapsed: number = 0.0;
  private focusDuration: number = 0.7;
  private focusStartRotation: quat = quat.quatIdentity();
  private focusTargetRotation: quat = quat.quatIdentity();
  private selectedEventLat: number = 0.0;
  private selectedEventLon: number = 0.0;
  private hasSelectedEvent: boolean = false;
  private eventCallout: SurfaceLabel | null = null;
  private legendUnitsObject: SceneObject | null = null;
  private legendUnitsText: Text | null = null;

  onAwake() {
    this.initOnce();
    this.createEvent("OnStartEvent").bind(() => this.initOnce());
    this.createEvent("UpdateEvent").bind(() => this.tick());
    // LateUpdate runs after GlobeSurfaceRotator has spun the globe root this
    // frame, so re-pinning the widget's world position here cancels the orbit
    // before the frame renders.
    this.createEvent("LateUpdateEvent").bind(() => this.pinLegend());
  }

  public prepare(): void {
    this.initOnce();
    this.pinLegend();
  }

  public focusWeatherEvent(lat: number, lon: number, title: string, detail: string): void {
    if (!this.earthSphere) return;
    if (isNaN(lat) || isNaN(lon)) return;

    this.initOnce();
    this.selectedEventLat = lat;
    this.selectedEventLon = lon;
    this.hasSelectedEvent = true;

    const rootTransform = this.sceneObject.getTransform();
    const camera = this.getCameraObject();
    const center = this.earthSphere.getTransform().getWorldPosition();
    const cameraPos = camera ? camera.getTransform().getWorldPosition() : center.add(new vec3(0.0, 0.0, 1.0));
    const desiredDir = this.safeDirection(cameraPos.sub(center), new vec3(0.0, 0.0, 1.0));
    const currentPoint = this.latLonToWorld(lat, lon);
    const currentDir = this.safeDirection(currentPoint.sub(center), desiredDir);
    const delta = this.rotationBetween(currentDir, desiredDir);

    this.focusStartRotation = rootTransform.getWorldRotation();
    this.focusTargetRotation = delta.multiply(this.focusStartRotation);
    this.focusElapsed = 0.0;
    const seconds = isNaN(this.eventFocusSeconds) ? 0.7 : this.eventFocusSeconds;
    this.focusDuration = Math.max(0.05, seconds);
    this.focusActive = true;
    this.showEventCallout(title, detail);
  }

  private initOnce() {
    if (this.initialized) return;
    if (!this.earthSphere) return;
    this.earthMesh = this.findEarthMesh(this.earthSphere);
    if (!this.earthMesh) {
      print("[WindGlobeCalibration] No RenderMeshVisual found under earthSphere.");
      return;
    }
    this.initialized = true;
    this.disableLegendBillboard();
    this.measureRadius();
    if (this.desiredRadiusWorld > 0 && this.radiusWorld > 0.001) {
      const factor = this.desiredRadiusWorld / this.radiusWorld;
      const t = this.earthSphere.getTransform();
      const s = t.getLocalScale();
      t.setLocalScale(new vec3(s.x * factor, s.y * factor, s.z * factor));
      this.measureRadius();
    }
    this.snapMarkersToSurface();
    this.pinLegend();
    print(
      "[WindGlobeCalibration] radiusWorld=" +
        this.radiusWorld.toFixed(3) +
        " cm. Drag Anchor onto a landmark to calibrate yaw."
    );
  }

  // Keep the wind-speed widget directly under the globe's AABB, in world space,
  // then yaw-face the viewer while preserving world-up orientation.
  private pinLegend() {
    if (!this.legend || !this.earthSphere) return;
    const center = this.earthSphere.getTransform().getWorldPosition();
    const drop = this.radiusWorld + Math.max(0, this.legendGapCm);
    const legendPosition = new vec3(center.x, center.y - drop, center.z);
    const legendTransform = this.legend.getTransform();
    legendTransform.setWorldPosition(legendPosition);

    const camera = this.getCameraObject();
    let legendRotation = legendTransform.getWorldRotation();
    if (camera) {
      const toCamera = camera.getTransform().getWorldPosition().sub(legendPosition);
      const faceDirection = this.safeHorizontalDirection(toCamera, new vec3(0.0, 0.0, 1.0));
      legendRotation = quat.lookAt(faceDirection, new vec3(0.0, 1.0, 0.0));
      legendTransform.setWorldRotation(legendRotation);
    }
    this.pinLegendUnits(legendPosition, legendRotation);
  }

  // Public: lat/lon (degrees) → world point on the calibrated sphere.
  latLonToWorld(latDeg: number, lonDeg: number): vec3 {
    if (!this.earthSphere) return vec3.zero();
    const t = this.earthSphere.getTransform();
    const center = t.getWorldPosition();
    const rot = t.getWorldRotation();
    const localDir = this.latLonDirLocal(latDeg, lonDeg);
    const worldDir = rot.multiplyVec3(localDir);
    return center.add(worldDir.uniformScale(this.radiusWorld));
  }

  // Direction in Earth-local frame, with the calibrated yaw applied.
  latLonDirLocal(latDeg: number, lonDeg: number): vec3 {
    const phi = latDeg * this.D2R;
    const mappedLon = (this.invertLongitude ? -lonDeg : lonDeg) + this.textureLongitudeOffsetDeg;
    const lam = mappedLon * this.D2R + this.yawOffsetRad;
    const cosPhi = Math.cos(phi);
    return new vec3(cosPhi * Math.sin(lam), Math.sin(phi), cosPhi * Math.cos(lam));
  }

  // ---------- internals ----------

  private disableLegendBillboard() {
    if (!this.legend) return;
    const scripts = this.legend.getComponents("Component.ScriptComponent");
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i] as any;
      if (!script) continue;
      try {
        const scriptName = script.name ? script.name.toString().toLowerCase() : "";
        const hasBillboardInputs =
          script._xAxisEnabled !== undefined &&
          script._yAxisEnabled !== undefined &&
          script._zAxisEnabled !== undefined;
        if (scriptName === "billboard" || hasBillboardInputs) {
          script.enabled = false;
        }
      } catch (e) {}
    }
  }

  private getCameraObject(): SceneObject | null {
    return this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
  }

  private safeHorizontalDirection(value: vec3, fallback: vec3): vec3 {
    if (!value) return fallback;
    const len = Math.sqrt(value.x * value.x + value.z * value.z);
    if (len < 0.0001) return fallback;
    return new vec3(value.x / len, 0.0, value.z / len);
  }

  private safeDirection(value: vec3, fallback: vec3): vec3 {
    if (!value) return fallback;
    const len = Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
    if (len < 0.0001) return fallback;
    return new vec3(value.x / len, value.y / len, value.z / len);
  }

  private rotationBetween(fromDir: vec3, toDir: vec3): quat {
    const from = this.safeDirection(fromDir, new vec3(0.0, 0.0, 1.0));
    const to = this.safeDirection(toDir, new vec3(0.0, 0.0, 1.0));
    const d = this.clamp(from.dot(to), -1.0, 1.0);
    if (d > 0.9999) return quat.quatIdentity();
    if (d < -0.9999) {
      const fallbackAxis = Math.abs(from.y) < 0.95 ? new vec3(0.0, 1.0, 0.0) : new vec3(1.0, 0.0, 0.0);
      return quat.angleAxis(Math.PI, from.cross(fallbackAxis).normalize());
    }
    const axis = from.cross(to).normalize();
    return quat.angleAxis(Math.acos(d), axis);
  }

  private smoothstep(t: number): number {
    const x = this.clamp(t, 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  private clamp(value: number, min: number, max: number): number {
    if (isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  private findObjectByName(name: string): SceneObject | null {
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      const found = this.findInTree(global.scene.getRootObject(i), name);
      if (found) return found;
    }
    return null;
  }

  private findInTree(root: SceneObject, name: string): SceneObject | null {
    if (root.name === name) return root;
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findInTree(root.getChild(i), name);
      if (found) return found;
    }
    return null;
  }

  private findEarthMesh(root: SceneObject): RenderMeshVisual | null {
    let largest: RenderMeshVisual | null = null;
    let largestSize = 0;
    let preferred: RenderMeshVisual | null = null;

    const walk = (obj: SceneObject) => {
      const mv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null;
      if (mv && mv.mesh) {
        const min = mv.mesh.aabbMin as vec3;
        const max = mv.mesh.aabbMax as vec3;
        const size = max.sub(min).length;
        if (size > largestSize) {
          largestSize = size;
          largest = mv;
        }
        const lname = obj.name.toLowerCase();
        if (!preferred && (lname.indexOf("earth") >= 0 || lname.indexOf("surface") >= 0)) {
          preferred = mv;
        }
      }
      for (let i = 0; i < obj.getChildrenCount(); i++) walk(obj.getChild(i));
    };

    walk(root);
    return preferred || largest;
  }

  private measureRadius() {
    if (!this.earthMesh || !this.earthMesh.mesh) return;
    const min = this.earthMesh.mesh.aabbMin as vec3;
    const max = this.earthMesh.mesh.aabbMax as vec3;
    // Half the longest extent → bounding sphere radius (in mesh-local units).
    const halfExtent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * 0.5;
    // Accumulated world scale of the mesh's SceneObject.
    const wScale = this.earthMesh.sceneObject.getTransform().getWorldScale();
    const meanScale = (Math.abs(wScale.x) + Math.abs(wScale.y) + Math.abs(wScale.z)) / 3;
    this.radiusWorld = halfExtent * meanScale;
  }

  private snapMarkersToSurface() {
    if (this.anchor) {
      const p = this.latLonToWorld(this.anchorLat, this.anchorLon);
      this.anchor.getTransform().setWorldPosition(p);
    }
    if (this.verifier) {
      const p = this.latLonToWorld(this.verifyLat, this.verifyLon);
      this.verifier.getTransform().setWorldPosition(p);
    }
  }

  private tick() {
    this.updateFocusTween();
    this.pinLegend();
    this.updateEventCallout();
    if (!this.earthSphere || !this.anchor) return;
    const earthT = this.earthSphere.getTransform();
    const center = earthT.getWorldPosition();
    const rot = earthT.getWorldRotation();
    const anchorPos = this.anchor.getTransform().getWorldPosition();

    const offset = anchorPos.sub(center);
    const r = offset.length;
    if (r < 0.001) return;
    // Trust the anchor's distance as the working radius — it's where the user
    // dropped the marker, by definition the visible surface in their frame.
    this.radiusWorld = r;

    // Project anchor offset into Earth-local space.
    const local = rot.invert().multiplyVec3(offset).uniformScale(1 / r);
    // local.x = cos(lat) sin(anchorLon + yaw), local.z = cos(lat) cos(anchorLon + yaw)
    const observedLon = Math.atan2(local.x, local.z);
    const targetLon = this.anchorLon * this.D2R;
    this.yawOffsetRad = observedLon - targetLon;

    if (this.verifier) {
      this.verifier.getTransform().setWorldPosition(
        this.latLonToWorld(this.verifyLat, this.verifyLon)
      );
    }
  }

  private updateFocusTween(): void {
    if (!this.focusActive) return;
    const dt = getDeltaTime();
    this.focusElapsed = Math.min(this.focusDuration, this.focusElapsed + dt);
    const t = this.smoothstep(this.focusElapsed / Math.max(0.001, this.focusDuration));
    this.sceneObject.getTransform().setWorldRotation(quat.slerp(this.focusStartRotation, this.focusTargetRotation, t));
    if (this.focusElapsed >= this.focusDuration) {
      this.sceneObject.getTransform().setWorldRotation(this.focusTargetRotation);
      this.focusActive = false;
    }
  }

  private showEventCallout(title: string, detail: string): void {
    if (!this.eventCallout) {
      this.eventCallout = new SurfaceLabel(this.sceneObject, "SelectedWeatherEventCallout", this.calloutMaterial || DEFAULT_WEATHER_CALLOUT_MATERIAL);
      this.eventCallout.setRenderOrder(650);
    }
    const headline = title && title.length > 0 ? title : "Weather event";
    const body = detail && detail.length > 0 ? detail : "Tracked weather event";
    this.eventCallout.setCallout(headline + "\n" + body, new vec4(0.96, 0.96, 0.96, 1.0), 1.0, 0.4);
    this.eventCallout.setEnabled(true);
    this.updateEventCallout();
  }

  private updateEventCallout(): void {
    if (!this.eventCallout || !this.hasSelectedEvent || !this.earthSphere) return;
    const center = this.earthSphere.getTransform().getWorldPosition();
    const surface = this.latLonToWorld(this.selectedEventLat, this.selectedEventLon);
    const normal = this.safeDirection(surface.sub(center), new vec3(0.0, 1.0, 0.0));
    const lift = this.clamp(this.eventCalloutSurfaceLiftCm, 0.0, 2.0);
    this.eventCallout.setWorldPosition(surface.add(normal.uniformScale(lift)));
    const camera = this.getCameraObject();
    if (camera) this.eventCallout.face(camera.getTransform().getWorldPosition());
  }

  private pinLegendUnits(legendPosition: vec3, legendRotation: quat): void {
    const text = this.ensureLegendUnits();
    if (!text || !this.legendUnitsObject) return;
    text.text = "m/s  0  10  20  33  45  70+\nkm/h 0  36  72 119 162 252+\nmph  0  22  45  74 101 157+";
    const offset = legendRotation.multiplyVec3(new vec3(0.0, -1.35, 0.08));
    const t = this.legendUnitsObject.getTransform();
    t.setWorldPosition(legendPosition.add(offset));
    t.setWorldRotation(legendRotation);
  }

  private ensureLegendUnits(): Text | null {
    if (this.legendUnitsText) return this.legendUnitsText;
    if (!this.sceneObject) return null;
    this.legendUnitsObject = global.scene.createSceneObject("WindSpeedLegendUnits");
    this.legendUnitsObject.setParent(this.sceneObject);
    const text = this.legendUnitsObject.createComponent("Component.Text") as Text;
    text.font = WIND_FONT;
    text.size = 13;
    text.horizontalAlignment = HorizontalAlignment.Center;
    text.verticalAlignment = VerticalAlignment.Center;
    text.horizontalOverflow = HorizontalOverflow.Overflow;
    text.verticalOverflow = VerticalOverflow.Overflow;
    text.worldSpaceRect = Rect.create(-13.5, 13.5, -1.25, 1.25);
    text.depthTest = false;
    text.twoSided = true;
    try { text.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
    try { text.renderOrder = 662; } catch (e) {}
    try { text.textFill.color = new vec4(0.96, 0.96, 0.92, 0.96); } catch (e) {}
    this.legendUnitsText = text;
    return text;
  }
}
