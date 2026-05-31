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

  // Filled by the bbox measurement + anchor calibration. Streamline component
  // reads these directly.
  public radiusWorld: number = 1;
  public yawOffsetRad: number = 0;

  private readonly D2R = Math.PI / 180;
  private earthMesh: RenderMeshVisual | null = null;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.initOnce());
    this.createEvent("UpdateEvent").bind(() => this.tick());
    // LateUpdate runs after GlobeSurfaceRotator has spun the globe root this
    // frame, so re-pinning the widget's world position here cancels the orbit
    // before the frame renders.
    this.createEvent("LateUpdateEvent").bind(() => this.pinLegend());
  }

  private initOnce() {
    if (!this.earthSphere) return;
    this.earthMesh = this.findEarthMesh(this.earthSphere);
    if (!this.earthMesh) {
      print("[WindGlobeCalibration] No RenderMeshVisual found under earthSphere.");
      return;
    }
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
  // so it holds the same relative position and does not rotate around the globe
  // when the surface is spun. Billboard handles facing; this only fixes position.
  private pinLegend() {
    if (!this.legend || !this.earthSphere) return;
    const center = this.earthSphere.getTransform().getWorldPosition();
    const drop = this.radiusWorld + Math.max(0, this.legendGapCm);
    this.legend.getTransform().setWorldPosition(new vec3(center.x, center.y - drop, center.z));
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
    const lam = lonDeg * this.D2R + this.yawOffsetRad;
    const cosPhi = Math.cos(phi);
    return new vec3(cosPhi * Math.sin(lam), Math.sin(phi), cosPhi * Math.cos(lam));
  }

  // ---------- internals ----------

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
    this.pinLegend();
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
}
