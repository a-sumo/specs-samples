// GravityField.ts
// Educational gravity-field visualization for the Vector Fields lens.
//
// The important split:
//   - blue field lines: direction of gravitational pull
//   - red same-potential contours: scalar/equal-height structure
//
// The "well" is not a spatial axis. Bodies stay on the reference plane while
// the curves dip along local Y to show scalar intensity.

import { ARTEMIS_II_TRAJECTORY } from "./ArtemisTrajectory";
import { MOON_EPHEMERIS } from "./MoonEphemeris";
import { SurfaceLabel } from "./SurfaceLabel";

type GravitySample = {
    field: vec3;
    intensity: number;
};

type GravityBody = {
    id: string;
    center: vec3;
    radius: number;
    mass: number;
};

type FieldSeed = {
    sourceId: string;
    x: number;
    z: number;
};

type Point2 = {
    x: number;
    z: number;
};

type ContourGrid = {
    values: number[][];
    cols: number;
    rows: number;
    half: number;
    dx: number;
    dz: number;
};

type StoredTransform = {
    object: SceneObject;
    position: vec3;
    rotation: quat;
};

@component
export class GravityField extends BaseScriptComponent {
    private static readonly FIELD_RENDER_ORDER: number = 40;
    private static readonly CONTOUR_RENDER_ORDER: number = 41;
    private static readonly BODY_RENDER_ORDER: number = 44;
    private static readonly MAX_STAGE: number = 2;
    private static readonly MOON_MASS_RATIO: number = 0.0123000371;

    private static readonly EARTH_RADIUS: number = 1.45;
    private static readonly MOON_RADIUS: number = 0.64;
    private static readonly CURVE_RADIAL_SEGMENTS: number = 3;
    private static readonly EARTH_AXIAL_TILT_DEG: number = 23.4;
    private static readonly EARTH_SIDEREAL_DAY_HOURS: number = 23.9;
    private static readonly MOON_ORBIT_PERIOD_HOURS: number = 27.3 * 24.0;
    private static readonly MOON_ORBIT_INCLINATION_DEG: number = 5.1;
    private static readonly ARTEMIS_TRAJECTORY_WIDTH: number = 0.05;
    private static readonly ARTEMIS_TRAIL_WIDTH: number = 0.08;
    private static readonly ARTEMIS_CURSOR_RADIUS: number = 0.34;
    private static readonly ARTEMIS_TRAJECTORY_LIFT: number = 0.14;
    private static readonly ARTEMIS_DASH_LENGTH: number = 0.36;
    private static readonly ARTEMIS_DASH_GAP: number = 0.22;
    private static readonly ARTEMIS_RESAMPLE_STEP: number = 0.22;
    private static readonly ARTEMIS_OUTER_PATH_RADIUS: number = 5.15;
    private static readonly ARTEMIS_DYNAMIC_INTERVAL: number = 0.2;

    @input
    @allowUndefined
    @hint("Optional Earth object. If unset, a generated flat shaded Earth is used.")
    earthObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional Moon object. If unset, a generated flat shaded Moon is used.")
    moonObject: SceneObject = null as any;

    @input
    @hint("When on, the field samples the live Earth/Moon transforms so orbital motion deforms the visualization.")
    useModelPositions: boolean = true;

    @input
    @hint("When on, the Earth spins on its tilted axis. The 23.4 degree tilt itself is always applied.")
    earthAxialMotionEnabled: boolean = true;

    @input
    @hint("When on, moves the Moon model around Earth.")
    moonOrbitMotionEnabled: boolean = true;

    @input
    @hint("When on, the Moon is tidally locked: the same face always points toward Earth.")
    moonSynchronousRotationEnabled: boolean = true;

    @input
    @widget(new SliderWidget(0.05, 48.0, 0.05))
    @hint("Simulated hours per real second for celestial motion toggles. 8.0 makes a Moon orbit complete in ~80 s.")
    simulatedHoursPerSecond: number = 8.0;

    @input
    @widget(new SliderWidget(0.05, 1.0, 0.05))
    @hint("Minimum seconds between field rebuilds while the Moon orbit is animated.")
    motionRebuildInterval: number = 0.33;

    @input
    @widget(new SliderWidget(1.0, 30.0, 0.5))
    @hint("Relative Earth mass")
    earthMass: number = 18.0;

    @input
    @widget(new SliderWidget(0.25, 8.0, 0.25))
    @hint("Moon mass multiplier. 1 means the real Earth/Moon mass ratio.")
    moonMass: number = 2.0;

    @input
    @widget(new SliderWidget(8.0, 28.0, 1.0))
    @hint("Width/depth of the sampled plane in centimeters")
    planeSize: number = 18.0;

    @input
    @widget(new SliderWidget(5, 17, 1))
    @hint("Number of arrows per side on the flat vector plane")
    arrowResolution: number = 7;

    @input
    @widget(new SliderWidget(8, 28, 1))
    @hint("Resolution for scalar contours and well guide curves")
    wellResolution: number = 18;

    @input
    @widget(new SliderWidget(24, 120, 4))
    @hint("Number of integrated gravity field lines")
    fieldLineCount: number = 72;

    @input
    @widget(new SliderWidget(36, 240, 4))
    @hint("Integration steps per field line")
    fieldLineSteps: number = 168;

    @input
    @widget(new SliderWidget(0.1, 2.0, 0.05))
    @hint("Body-relative softening multiplier. Keeps lines stable near bodies.")
    softening: number = 0.85;

    @input
    @widget(new SliderWidget(0.05, 1.2, 0.05))
    @hint("Visual arrow length scale")
    arrowScale: number = 0.22;

    @input
    @widget(new SliderWidget(0.02, 0.35, 0.01))
    @hint("Arrow shaft width")
    arrowWidth: number = 0.04;

    @input
    @widget(new SliderWidget(0.025, 0.22, 0.005))
    @hint("Tube diameter for gravity field and same-potential curves")
    lineWidth: number = 0.08;

    @input
    @widget(new SliderWidget(0.75, 6.0, 0.05))
    @hint("Display-only scale multiplier for the Artemis II trajectory and Moon distance. Body model sizes stay constant.")
    artemisTrajectoryScale: number = 2.65;

    @input
    @widget(new SliderWidget(0.0, 1.5, 0.05))
    @hint("Minimum visual gap between the Artemis II path and the visible Earth model.")
    artemisEarthClearance: number = 0.65;

    @input
    @widget(new SliderWidget(0.15, 6.0, 0.05))
    @hint("How far the scalar gravity well falls along local Y. Depth scales with body mass so Earth dominates the Moon.")
    wellDepth: number = 2.4;

    @input
    @allowUndefined
    @hint("Flat/toon material cloned for generated gravity meshes")
    material: Material = null as any;

    @input
    @widget(new ComboBoxWidget([
        new ComboBoxItem("Bodies", 0),
        new ComboBoxItem("Arrows", 1),
        new ComboBoxItem("Field Lines", 2),
    ]))
    @hint("Standalone preview stage used when the component wakes up.")
    initialStage: number = 2;

    private visualSlots: { [key: string]: RenderMeshVisual } = {};
    private activeSlots: { [key: string]: boolean } = {};
    private currentStage: number = 0;
    private lastModelSignature: string = "";
    private activeBodies: GravityBody[] | null = null;
    private earthBase: StoredTransform | null = null;
    private moonBase: StoredTransform | null = null;
    private motionElapsedHours: number = 0.0;
    private lastMotionRebuildTime: number = -999.0;
    private wasEarthDriven: boolean = false;
    private wasMoonPositionDriven: boolean = false;
    private wasMoonRotationDriven: boolean = false;
    private artemisMissionEnabled: boolean = false;
    private artemisMissionT: number = 0.0;
    // Artemis is rebuilt incrementally: the full dotted path and the event
    // markers are static for the whole mission and built once; only the trail
    // and the position cursor update, on a coarse throttle.
    private artemisStaticBuilt: boolean = false;
    private artemisStaticSignature: string = "";
    private lastArtemisDynamicTime: number = -999.0;
    private artemisEventLabelPositions: vec3[] = [];
    // Render order is walked over the (deep) body model trees only when it
    // actually changes, not on every rebuild.
    private renderOrderedModels: { [key: string]: number } = {};
    private artemisFrameRot: quat = quat.fromEulerAngles(0, 0, 0);
    private artemisFrameReady: boolean = false;
    private artemisEventLabels: SurfaceLabel[] = [];
    private artemisEventLabelTimes: number[] = [];
    private artemisEventLabelsBuilt: boolean = false;
    private cachedCameraObject: SceneObject | null = null;

    onAwake(): void {
        this.captureBaseTransforms();
        this.createScriptApi();
        this.currentStage = this.clampStage(this.initialStage);
        this.rebuild();
        this.lastModelSignature = this.modelSignature();
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    private createScriptApi(): void {
        const self = this;
        (this as any).gravityApi = {
            setStage: (stage: number) => self.setStage(stage),
            setEarthAxialMotionEnabled: (enabled: boolean) => self.setEarthAxialMotionEnabled(enabled),
            setMoonOrbitMotionEnabled: (enabled: boolean) => self.setMoonOrbitMotionEnabled(enabled),
            setMoonSynchronousRotationEnabled: (enabled: boolean) => self.setMoonSynchronousRotationEnabled(enabled),
            setCelestialMotionEnabled: (enabled: boolean) => self.setCelestialMotionEnabled(enabled),
            setArtemisMissionEnabled: (enabled: boolean) => self.setCelestialMotionEnabled(enabled),
        };
    }

    public setStage(stage: number): void {
        const nextStage = this.clampStage(stage);
        if (nextStage === this.currentStage && Object.keys(this.visualSlots).length > 0) return;
        this.currentStage = nextStage;
        this.rebuild();
    }

    public setEarthAxialMotionEnabled(enabled: boolean): void {
        this.earthAxialMotionEnabled = enabled;
    }

    public setMoonOrbitMotionEnabled(enabled: boolean): void {
        this.moonOrbitMotionEnabled = enabled;
    }

    public setMoonSynchronousRotationEnabled(enabled: boolean): void {
        this.moonSynchronousRotationEnabled = enabled;
    }

    public setCelestialMotionEnabled(enabled: boolean): void {
        this.artemisMissionEnabled = enabled;
        this.setEarthAxialMotionEnabled(enabled);
        this.setMoonOrbitMotionEnabled(false);
        this.setMoonSynchronousRotationEnabled(enabled);
        // Force the static Artemis geometry to rebuild on the next pass.
        this.artemisStaticBuilt = false;
        if (!enabled) this.destroyArtemisEventLabels();
        this.rebuild();
    }

    public rebuild(): void {
        this.beginRebuild();
        this.activeBodies = this.computeBodies();

        // Stage 2 (well + contours + field lines) is now handled by the GPU
        // GravityFieldPlane shader. Stage 1 still draws flat CPU arrows for the
        // narration's introductory beat.
        if (this.currentStage === 1) {
            this.buildArrowPlane();
        }

        this.buildBodies();
        if (this.artemisMissionEnabled) {
            this.buildArtemisMissionVisuals();
        }
        this.endRebuild();
    }

    private beginRebuild(): void {
        this.activeSlots = {};
    }

    private endRebuild(): void {
        const keys = Object.keys(this.visualSlots);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!this.activeSlots[key]) {
                try { this.visualSlots[key].destroy(); } catch (e) {}
                delete this.visualSlots[key];
            }
        }
    }

    private tick(): void {
        const fieldBodyMoved = this.updateCelestialMotion();
        if (this.artemisMissionEnabled) {
            // During the mission the bodies move via their transforms and the
            // GPU well plane tracks them through its own uniforms, so no full
            // rebuild is needed. Only refresh the growing trail + cursor.
            this.updateArtemisDynamic();
        } else {
            this.rebuildIfModelInputsChanged(fieldBodyMoved);
        }
        this.updateArtemisEventLabels();
    }

    private updateArtemisDynamic(): void {
        const now = getTime();
        if (now - this.lastArtemisDynamicTime < GravityField.ARTEMIS_DYNAMIC_INTERVAL) return;
        this.lastArtemisDynamicTime = now;
        // Rebuilds the static path/markers only if the display scale changed;
        // otherwise just swaps the trail and cursor meshes on existing visuals.
        this.buildArtemisMissionVisuals();
    }

    // Floating timestamp labels at each Artemis waypoint. Created once when the
    // mission is enabled, repositioned + billboarded every frame, destroyed on
    // disable. Driven entirely by ARTEMIS_II_TRAJECTORY.events, so a fuller OEM
    // (all 15 steps) lights up all the labels with no extra code.
    private updateArtemisEventLabels(): void {
        if (!this.artemisMissionEnabled) {
            this.destroyArtemisEventLabels();
            return;
        }
        this.ensureArtemisEventLabels();
        // Label positions are fixed for the mission (set once in ensure...).
        // Per frame we only re-billboard them toward the camera.
        const camera = this.cameraWorldPosition();
        if (!camera) return;
        for (let i = 0; i < this.artemisEventLabels.length; i++) {
            this.artemisEventLabels[i].face(camera);
        }
    }

    private ensureArtemisEventLabels(): void {
        if (this.artemisEventLabelsBuilt) return;
        const d: any = ARTEMIS_II_TRAJECTORY;
        const events: any[] = d.events || [];
        const duration = d.t[d.t.length - 1];
        let slot = 0;
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (!ev || typeof ev.t !== "number" || ev.t < 0.0 || ev.t > duration) continue;
            const label = new SurfaceLabel(this.sceneObject, "ArtemisEventLabel_" + i, this.material);
            label.setRenderOrder(GravityField.BODY_RENDER_ORDER + 6);
            const num = (typeof ev.n === "number") ? (ev.n + "  ") : "";
            const when = (typeof ev.utc === "string" && ev.utc.length >= 16) ? ev.utc.substring(5, 16) : "";
            // Alternate the box left/right and stagger the leader so neighbouring
            // cards near Earth don't stack on top of each other.
            const side = (slot % 2 === 0) ? 1.0 : -1.0;
            const lift = Math.floor(slot / 2) * 1.6;
            label.setCallout(num + (ev.label || "") + (when ? "\n" + when : ""), new vec4(0.15, 0.55, 1.0, 1.0), side, lift);
            const at = this.artemisPlanarLocalForKm(
                this.sampleArtemis(ARTEMIS_II_TRAJECTORY, ev.t),
                GravityField.ARTEMIS_TRAJECTORY_LIFT + 0.04
            );
            label.setLocalPosition(at);
            this.artemisEventLabels.push(label);
            this.artemisEventLabelTimes.push(ev.t);
            this.artemisEventLabelPositions.push(at);
            slot++;
        }
        this.artemisEventLabelsBuilt = true;
    }

    private destroyArtemisEventLabels(): void {
        if (!this.artemisEventLabelsBuilt) return;
        for (let i = 0; i < this.artemisEventLabels.length; i++) this.artemisEventLabels[i].destroy();
        this.artemisEventLabels = [];
        this.artemisEventLabelTimes = [];
        this.artemisEventLabelPositions = [];
        this.artemisEventLabelsBuilt = false;
    }

    private cameraWorldPosition(): vec3 | null {
        if (!this.cachedCameraObject) {
            this.cachedCameraObject = this.findSceneObjectByName("Camera Object") || this.findSceneObjectByName("Camera");
        }
        return this.cachedCameraObject ? this.cachedCameraObject.getTransform().getWorldPosition() : null;
    }

    private findSceneObjectByName(name: string): SceneObject | null {
        const count = global.scene.getRootObjectsCount();
        for (let i = 0; i < count; i++) {
            const found = this.searchTree(global.scene.getRootObject(i), name);
            if (found) return found;
        }
        return null;
    }

    private searchTree(root: SceneObject, name: string): SceneObject | null {
        if (root.name === name) return root;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const found = this.searchTree(root.getChild(i), name);
            if (found) return found;
        }
        return null;
    }

    private rebuildIfModelInputsChanged(throttleForMotion: boolean): void {
        const signature = this.modelSignature();
        if (signature === this.lastModelSignature) return;
        if (throttleForMotion) {
            // Cap motion-driven rebuilds. The Artemis mission advances its sample
            // index every frame, which previously forced a full rebuild (bodies +
            // 3 resampled trajectory meshes) per frame and tanked perf.
            const now = getTime();
            const interval = this.artemisMissionEnabled ? 0.1 : Math.max(0.02, this.motionRebuildInterval);
            if (now - this.lastMotionRebuildTime < interval) return;
            this.lastMotionRebuildTime = now;
        }
        this.lastModelSignature = signature;
        this.rebuild();
    }

    private modelSignature(): string {
        const mode = this.useModelPositions ? "model" : "fallback";
        const bodySignature = this.useModelPositions
            ? this.objectSignature(this.earthObject) + "|" + this.objectSignature(this.moonObject)
            : this.objectIdentitySignature(this.earthObject) + "|" + this.objectIdentitySignature(this.moonObject);
        const artemisSignature = this.artemisMissionEnabled
            ? "artemis:" + this.artemisSampleIndex(this.artemisMissionT)
            : "artemis:off";
        const artemisDisplaySignature = "artemisDisplay:" + this.artemisTrajectoryScale.toFixed(3) + ":" + this.artemisEarthClearance.toFixed(3);
        return bodySignature + "|" + mode + "|" + artemisSignature + "|" + artemisDisplaySignature;
    }

    private objectIdentitySignature(object: SceneObject | null): string {
        if (!object) return "none";
        return object.uniqueIdentifier + ":" + object.name;
    }

    private objectSignature(object: SceneObject | null): string {
        if (!object) return "none";
        const xf = object.getTransform();
        const p = xf.getLocalPosition();
        const s = xf.getLocalScale();
        return object.uniqueIdentifier + ":" + object.name + ":" + p.x.toFixed(3) + ":" + p.y.toFixed(3) + ":" + p.z.toFixed(3) + ":" + s.x.toFixed(3) + ":" + s.y.toFixed(3) + ":" + s.z.toFixed(3);
    }

    private clampStage(stage: number): number {
        if (isNaN(stage)) return 0;
        return Math.max(0, Math.min(GravityField.MAX_STAGE, Math.floor(stage)));
    }

    private bodies(): GravityBody[] {
        if (this.activeBodies) return this.activeBodies;
        return this.computeBodies();
    }

    private computeBodies(): GravityBody[] {
        const earth = this.useModelPositions ? this.getBodyLocalPosition(this.earthObject, this.earthFallback()) : this.earthFallback();
        const moon = this.useModelPositions ? this.getBodyLocalPosition(this.moonObject, this.moonFallback()) : this.moonFallback();
        return [
            {
                id: "earth",
                center: earth,
                radius: GravityField.EARTH_RADIUS,
                mass: Math.max(0.001, this.earthMass),
            },
            {
                id: "moon",
                center: moon,
                radius: GravityField.MOON_RADIUS,
                mass: Math.max(0.001, this.earthMass * GravityField.MOON_MASS_RATIO * this.moonMass),
            },
        ];
    }

    private bodyById(id: string): GravityBody | null {
        const bodies = this.bodies();
        for (let i = 0; i < bodies.length; i++) {
            if (bodies[i].id === id) return bodies[i];
        }
        return null;
    }

    private buildBodies(): void {
        const bodies = this.bodies();
        const earth = bodies[0].center;
        const moon = bodies[1].center;

        if (!this.useAssignedModel(this.earthObject, GravityField.BODY_RENDER_ORDER)) {
            this.assignVisual("earthSphere", this.buildSphereMesh(earth, GravityField.EARTH_RADIUS, 9, 6), new vec4(0.58, 0.66, 0.68, 1.0), GravityField.BODY_RENDER_ORDER);
        }
        if (!this.useAssignedModel(this.moonObject, GravityField.BODY_RENDER_ORDER + 1)) {
            this.assignVisual("moonSphere", this.buildSphereMesh(moon, GravityField.MOON_RADIUS, 8, 5), new vec4(0.88, 0.88, 0.82, 1.0), GravityField.BODY_RENDER_ORDER + 1);
        }
    }

    private captureBaseTransforms(): void {
        this.earthBase = this.captureTransform(this.earthObject);
        this.moonBase = this.captureTransform(this.moonObject);
    }

    private captureTransform(object: SceneObject | null): StoredTransform | null {
        if (!object) return null;
        const tr = object.getTransform();
        const p = tr.getLocalPosition();
        const r = tr.getLocalRotation();
        return {
            object: object,
            position: new vec3(p.x, p.y, p.z),
            rotation: new quat(r.w, r.x, r.y, r.z),
        };
    }

    private updateCelestialMotion(): boolean {
        const dt = getDeltaTime();
        this.motionElapsedHours += dt * Math.max(0.0, this.simulatedHoursPerSecond);

        if (this.artemisMissionEnabled) {
            return this.updateArtemisMotion(dt);
        }

        const hadMoonPositionDriven = this.wasMoonPositionDriven;
        const moonMoved = this.updateMoonMotion();
        this.updateEarthMotion();
        return this.useModelPositions && (moonMoved || hadMoonPositionDriven);
    }

    private updateEarthMotion(): void {
        if (!this.earthBase) return;
        const tr = this.earthBase.object.getTransform();
        const tilt = quat.angleAxis(this.degToRad(GravityField.EARTH_AXIAL_TILT_DEG), new vec3(0.0, 0.0, 1.0));
        const spinAngle = this.earthAxialMotionEnabled
            ? this.orbitAngle(this.motionElapsedHours, GravityField.EARTH_SIDEREAL_DAY_HOURS, 0.0)
            : 0.0;
        const spin = quat.angleAxis(spinAngle, new vec3(0.0, 1.0, 0.0));
        tr.setLocalRotation(this.copyQuat(this.earthBase.rotation).multiply(tilt).multiply(spin));
        this.wasEarthDriven = true;
    }

    private updateMoonMotion(): boolean {
        if (!this.moonBase || !this.earthBase) return false;
        const tr = this.moonBase.object.getTransform();
        let positionDriven = false;
        let rotationDriven = false;

        if (this.moonOrbitMotionEnabled) {
            const baseOffset = this.moonBase.position.sub(this.earthBase.position);
            const radius = Math.max(GravityField.MOON_RADIUS + GravityField.EARTH_RADIUS + 0.1, Math.sqrt(baseOffset.x * baseOffset.x + baseOffset.z * baseOffset.z));
            const phase = Math.atan2(baseOffset.z, baseOffset.x);
            const angle = this.orbitAngle(this.motionElapsedHours, GravityField.MOON_ORBIT_PERIOD_HOURS, phase);
            const rel = this.inclinedOrbitOffset(radius, angle, GravityField.MOON_ORBIT_INCLINATION_DEG);
            tr.setLocalPosition(this.earthBase.position.add(rel));
            positionDriven = true;
        } else if (this.wasMoonPositionDriven) {
            tr.setLocalPosition(this.copyVec3(this.moonBase.position));
        }

        if (this.moonSynchronousRotationEnabled) {
            // Tidal lock: the Moon shows the same face to Earth at all times.
            // quat.lookAt aligns local -Z to the target direction.
            const moonPos = tr.getLocalPosition();
            const toEarth = this.earthBase.position.sub(moonPos);
            if (toEarth.length > 0.0001) {
                tr.setLocalRotation(quat.lookAt(this.normalizeVec(toEarth), new vec3(0.0, 1.0, 0.0)));
                rotationDriven = true;
            }
        } else if (this.wasMoonRotationDriven) {
            tr.setLocalRotation(this.copyQuat(this.moonBase.rotation));
        }

        this.wasMoonPositionDriven = positionDriven;
        this.wasMoonRotationDriven = rotationDriven;
        return positionDriven;
    }

    private updateArtemisMotion(dt: number): boolean {
        this.artemisMissionT += dt * Math.max(0.0, this.simulatedHoursPerSecond) * 3600.0;
        const duration = Math.max(1.0, ARTEMIS_II_TRAJECTORY.durationSec);
        if (this.artemisMissionT >= duration) {
            this.artemisMissionT = this.artemisMissionT % duration;
        }

        this.updateEarthMotion();

        const moonKm = this.sampleArtemis(MOON_EPHEMERIS, this.artemisMissionT);
        if (this.moonBase) {
            const moonTransform = this.moonBase.object.getTransform();
            moonTransform.setLocalPosition(this.artemisLocalForKm(moonKm, 0.0));
            if (this.moonSynchronousRotationEnabled && this.earthBase) {
                const toEarth = this.earthBase.position.sub(moonTransform.getLocalPosition());
                if (toEarth.length > 0.0001) {
                    moonTransform.setLocalRotation(quat.lookAt(this.normalizeVec(toEarth), new vec3(0.0, 1.0, 0.0)));
                    this.wasMoonRotationDriven = true;
                }
            }
            this.wasMoonPositionDriven = true;
        }

        return true;
    }

    private buildArtemisMissionVisuals(): void {
        // The full dotted path and the event markers do not change shape during
        // the mission, so build them once (and again only if the display scale
        // changes). This is what used to be rebuilt ~10x/sec and tanked perf.
        const signature = this.artemisDisplaySignatureValue();
        if (!this.artemisStaticBuilt || signature !== this.artemisStaticSignature) {
            const trajectory = this.buildArtemisTrajectoryMesh(false);
            this.assignVisual("artemisTrajectory", trajectory, new vec4(0.22, 0.55, 1.0, 0.70), GravityField.FIELD_RENDER_ORDER + 6);
            this.buildArtemisEventMarkers();
            this.destroyArtemisEventLabels();
            this.artemisStaticBuilt = true;
            this.artemisStaticSignature = signature;
        }

        // The trail grows with mission time and the cursor tracks the current
        // position; these are the only meshes refreshed per update tick.
        const trail = this.buildArtemisTrajectoryMesh(true);
        this.assignVisual("artemisTrail", trail, new vec4(0.42, 0.72, 1.0, 0.96), GravityField.FIELD_RENDER_ORDER + 7);

        const cursor = this.buildArtemisCursorMesh(this.artemisDisplayLocalForTime(this.artemisMissionT, GravityField.ARTEMIS_TRAJECTORY_LIFT + 0.03));
        this.assignVisual("artemisCursor", cursor, new vec4(0.70, 0.86, 1.0, 1.0), GravityField.BODY_RENDER_ORDER + 4);
    }

    private artemisDisplaySignatureValue(): string {
        return this.artemisTrajectoryScale.toFixed(3) + ":" + this.artemisEarthClearance.toFixed(3);
    }

    // Place a ring marker at each mission waypoint (ARTEMIS_II_TRAJECTORY.events),
    // sampled at the event's real timestamp. Events outside this segment's time
    // span are skipped, so dropping in a full launch->splashdown OEM with all 15
    // entries lights them all up with no other code changes.
    private buildArtemisEventMarkers(): void {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const events: any[] = d.events || [];
        const duration = d.t[d.t.length - 1];
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (!ev || typeof ev.t !== "number" || ev.t < 0.0 || ev.t > duration) continue;
            const center = this.artemisPlanarLocalForKm(
                this.sampleArtemis(ARTEMIS_II_TRAJECTORY, ev.t),
                GravityField.ARTEMIS_TRAJECTORY_LIFT + 0.04
            );
            const mb = this.buildArtemisMarkerMesh(center);
            this.assignVisual("artemisEvent" + i, mb, new vec4(0.12, 0.52, 1.0, 0.95), GravityField.BODY_RENDER_ORDER + 3);
        }
    }

    private buildArtemisMarkerMesh(center: vec3): MeshBuilder {
        const mb = this.makeMeshBuilder();
        const r = GravityField.ARTEMIS_CURSOR_RADIUS * 0.62;
        const w = GravityField.ARTEMIS_TRAIL_WIDTH * 0.6;
        const seg = 18;
        const ring: vec3[] = [];
        for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * Math.PI * 2.0;
            ring.push(center.add(new vec3(Math.cos(a) * r, 0.0, Math.sin(a) * r)));
        }
        this.addPlanarRibbonPath(mb, ring, w);
        return mb;
    }

    private buildArtemisTrajectoryMesh(flownOnly: boolean): MeshBuilder {
        const mb = this.makeMeshBuilder();
        const path = this.buildArtemisDisplayPath(flownOnly, GravityField.ARTEMIS_TRAJECTORY_LIFT);
        if (flownOnly) {
            this.addPlanarRibbonPath(mb, path, GravityField.ARTEMIS_TRAIL_WIDTH);
        } else {
            this.addDottedPlanarRibbonPath(
                mb,
                path,
                GravityField.ARTEMIS_TRAJECTORY_WIDTH,
                GravityField.ARTEMIS_DASH_LENGTH,
                GravityField.ARTEMIS_DASH_GAP
            );
        }
        return mb;
    }

    private buildArtemisDisplayPath(flownOnly: boolean, lift: number): vec3[] {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const n = d.t.length;
        if (n < 2) return [];
        // Honest data-driven path: project every ephemeris sample directly — no
        // outer-radius clipping, no Earth-rim snapping. The full path is whatever
        // the OEM contains; the trail (flownOnly) stops at the current mission time.
        const sampleIdx = this.artemisSampleIndex(this.artemisMissionT);
        const lastIdx = flownOnly ? Math.min(sampleIdx, n - 1) : n - 1;
        if (flownOnly && lastIdx < 1) return [];
        const path: vec3[] = [];
        for (let i = 0; i <= lastIdx; i++) {
            path.push(this.artemisPlanarLocalForKm(new vec3(d.x[i], d.y[i], d.z[i]), lift));
        }
        if (flownOnly && this.artemisMissionT < d.t[n - 1]) {
            path.push(this.artemisPlanarLocalForKm(this.sampleArtemis(ARTEMIS_II_TRAJECTORY, this.artemisMissionT), lift));
        }
        return this.compactPath(this.resamplePath(path, GravityField.ARTEMIS_RESAMPLE_STEP), 0.025);
    }

    private buildArtemisCursorMesh(center: vec3): MeshBuilder {
        const mb = this.makeMeshBuilder();
        const r = GravityField.ARTEMIS_CURSOR_RADIUS;
        const w = GravityField.ARTEMIS_TRAIL_WIDTH * 0.72;
        this.addPlanarRibbonPath(mb, [
            center.add(new vec3(-r, 0.0, 0.0)),
            center.add(new vec3(r, 0.0, 0.0)),
        ], w);
        this.addPlanarRibbonPath(mb, [
            center.add(new vec3(0.0, 0.0, -r)),
            center.add(new vec3(0.0, 0.0, r)),
        ], w);
        return mb;
    }

    private artemisLocalForKm(pKm: vec3, lift: number): vec3 {
        const origin = this.earthBase ? this.earthBase.position : this.earthFallback();
        const offset = this.artemisDisplayOffset(pKm);
        const p = origin.add(offset);
        return new vec3(p.x, p.y + lift, p.z);
    }

    private artemisRawLocalForKm(pKm: vec3, lift: number): vec3 {
        const origin = this.earthBase ? this.earthBase.position : this.earthFallback();
        const offset = this.artemisRawDisplayOffset(pKm);
        const p = origin.add(offset);
        return new vec3(p.x, p.y + lift, p.z);
    }

    private artemisPlanarLocalForKm(pKm: vec3, lift: number): vec3 {
        const origin = this.earthBase ? this.earthBase.position : this.earthFallback();
        const offset = this.artemisRawDisplayOffset(pKm);
        return new vec3(origin.x + offset.x, origin.y + lift, origin.z + offset.z);
    }

    private artemisEarthRimLocalForKm(pKm: vec3, lift: number): vec3 {
        const origin = this.earthBase ? this.earthBase.position : this.earthFallback();
        const offset = this.artemisRawDisplayOffset(pKm);
        const radius = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
        const minRadius = GravityField.EARTH_RADIUS + Math.max(0.0, this.artemisEarthClearance);
        if (radius < 0.0001) return new vec3(origin.x + minRadius, origin.y + lift, origin.z);
        return new vec3(origin.x + (offset.x / radius) * minRadius, origin.y + lift, origin.z + (offset.z / radius) * minRadius);
    }

    private artemisDisplayLocalForTime(t: number, lift: number): vec3 {
        return this.artemisPlanarLocalForKm(this.sampleArtemis(ARTEMIS_II_TRAJECTORY, t), lift);
    }

    private artemisDisplayOffset(pKm: vec3): vec3 {
        return this.applyArtemisEarthClearance(this.artemisRawDisplayOffset(pKm));
    }

    private artemisRawDisplayOffset(pKm: vec3): vec3 {
        return this.artemisFrameRotation().multiplyVec3(pKm).uniformScale(this.artemisScaleCmPerKm());
    }

    private artemisDisplayRadiusForIndex(index: number): number {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const offset = this.artemisRawDisplayOffset(new vec3(d.x[index], d.y[index], d.z[index]));
        return Math.sqrt(offset.x * offset.x + offset.z * offset.z);
    }

    private artemisOuterStartIndex(): number {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const n = d.t.length;
        if (n < 2) return 0;
        const threshold = this.artemisOuterPathRadius();
        const maxIdx = this.artemisMaxRadiusIndex();
        let start = 0;
        for (let i = maxIdx; i >= 0; i--) {
            if (this.artemisDisplayRadiusForIndex(i) < threshold) {
                start = Math.min(maxIdx, i + 1);
                break;
            }
        }
        return start;
    }

    private artemisOuterEndIndex(startIdx: number): number {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const n = d.t.length;
        if (n < 2) return 0;
        const threshold = this.artemisOuterPathRadius();
        const maxIdx = Math.max(startIdx, this.artemisMaxRadiusIndex());
        let end = n - 1;
        for (let i = maxIdx; i < n; i++) {
            if (this.artemisDisplayRadiusForIndex(i) < threshold) {
                end = Math.max(maxIdx, i - 1);
                break;
            }
        }
        return end;
    }

    private artemisMaxRadiusIndex(): number {
        const d: any = ARTEMIS_II_TRAJECTORY;
        const n = d.t.length;
        let maxIdx = 0;
        let maxRadius = -1.0;
        for (let i = 0; i < n; i++) {
            const radius = this.artemisDisplayRadiusForIndex(i);
            if (radius > maxRadius) {
                maxRadius = radius;
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    private artemisOuterPathRadius(): number {
        const minRadius = GravityField.EARTH_RADIUS + Math.max(0.0, this.artemisEarthClearance);
        return Math.max(GravityField.ARTEMIS_OUTER_PATH_RADIUS, minRadius + 3.0);
    }

    private applyArtemisEarthClearance(offset: vec3): vec3 {
        const radius = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
        const minRadius = GravityField.EARTH_RADIUS + Math.max(0.0, this.artemisEarthClearance);
        if (radius < 0.0001 || radius >= minRadius) return offset;
        const k = minRadius / radius;
        return new vec3(offset.x * k, offset.y, offset.z * k);
    }

    private clampArtemisPathToEarthClearance(path: vec3[]): vec3[] {
        const origin = this.earthBase ? this.earthBase.position : this.earthFallback();
        const minRadius = GravityField.EARTH_RADIUS + Math.max(0.0, this.artemisEarthClearance);
        const out: vec3[] = [];
        let lastDirX = 1.0;
        let lastDirZ = 0.0;
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            const offset = new vec3(p.x - origin.x, p.y - origin.y, p.z - origin.z);
            const radius = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
            if (radius > 0.0001) {
                lastDirX = offset.x / radius;
                lastDirZ = offset.z / radius;
            }
            if (radius < minRadius) {
                out.push(new vec3(origin.x + lastDirX * minRadius, p.y, origin.z + lastDirZ * minRadius));
            } else {
                out.push(p);
            }
        }
        return out;
    }

    private artemisScaleCmPerKm(): number {
        const earth = this.earthBase ? this.earthBase.position : this.earthFallback();
        const moon = this.moonBase ? this.moonBase.position : this.moonFallback();
        const visualMoonDistance = Math.max(0.5, moon.sub(earth).length);
        const moonStartDistanceKm = Math.max(1.0, this.sampleArtemis(MOON_EPHEMERIS, 0.0).length);
        return (visualMoonDistance / moonStartDistanceKm) * Math.max(0.1, this.artemisTrajectoryScale);
    }

    private artemisFrameRotation(): quat {
        if (this.artemisFrameReady) return this.artemisFrameRot;
        this.artemisFrameReady = true;
        const m: any = MOON_EPHEMERIS;
        const n = m.t.length;
        if (n < 3) return this.artemisFrameRot;
        const a = new vec3(m.x[0], m.y[0], m.z[0]);
        let b = new vec3(m.x[(n / 4) | 0], m.y[(n / 4) | 0], m.z[(n / 4) | 0]);
        let nrm = a.cross(b);
        if (nrm.length < 1.0) {
            b = new vec3(m.x[(n / 2) | 0], m.y[(n / 2) | 0], m.z[(n / 2) | 0]);
            nrm = a.cross(b);
        }
        if (nrm.length < 1e-6) return this.artemisFrameRot;
        nrm = nrm.normalize();
        const up = vec3.up();
        const d = Math.max(-1.0, Math.min(1.0, nrm.dot(up)));
        const axis = nrm.cross(up);
        if (axis.length < 1e-6) {
            this.artemisFrameRot = d > 0 ? quat.fromEulerAngles(0, 0, 0) : quat.angleAxis(Math.PI, vec3.right());
        } else {
            this.artemisFrameRot = quat.angleAxis(Math.acos(d), axis.normalize());
        }
        return this.artemisFrameRot;
    }

    private sampleArtemis(data: any, t: number): vec3 {
        const ts: number[] = data.t;
        const n = ts.length;
        if (n === 0) return vec3.zero();
        if (t <= ts[0]) return new vec3(data.x[0], data.y[0], data.z[0]);
        if (t >= ts[n - 1]) return new vec3(data.x[n - 1], data.y[n - 1], data.z[n - 1]);
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (ts[mid] <= t) lo = mid;
            else hi = mid;
        }
        const f = (t - ts[lo]) / (ts[hi] - ts[lo]);
        return new vec3(
            data.x[lo] + f * (data.x[hi] - data.x[lo]),
            data.y[lo] + f * (data.y[hi] - data.y[lo]),
            data.z[lo] + f * (data.z[hi] - data.z[lo])
        );
    }

    private artemisSampleIndex(t: number): number {
        const ts: number[] = ARTEMIS_II_TRAJECTORY.t;
        const n = ts.length;
        if (t <= ts[0]) return 0;
        if (t >= ts[n - 1]) return n - 1;
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (ts[m] <= t) lo = m;
            else hi = m;
        }
        return lo;
    }

    private orbitAngle(elapsedHours: number, periodHours: number, phase: number): number {
        return (elapsedHours / Math.max(0.001, periodHours)) * Math.PI * 2.0 + phase;
    }

    private inclinedOrbitOffset(radius: number, angle: number, inclinationDeg: number): vec3 {
        const tilt = this.degToRad(inclinationDeg);
        const x = Math.cos(angle) * radius;
        const zFlat = Math.sin(angle) * radius;
        return new vec3(x, zFlat * Math.sin(tilt), zFlat * Math.cos(tilt));
    }

    private buildArrowPlane(): void {
        const mb = this.makeMeshBuilder();
        const count = Math.max(3, Math.floor(this.arrowResolution));
        const half = this.planeSize * 0.5;
        const step = this.planeSize / Math.max(1, count - 1);

        for (let iz = 0; iz < count; iz++) {
            for (let ix = 0; ix < count; ix++) {
                const x = -half + ix * step;
                const z = -half + iz * step;
                if (this.isNearBodyXZ(x, z, 0.4)) continue;
                const sample = this.sampleGravityXZ(x, z);
                this.addArrow(mb, new vec3(x, 0.18, z), sample.field, sample.intensity, step * 0.52);
            }
        }

        this.assignVisual("arrows", mb, new vec4(0.74, 0.76, 0.82, 0.92), GravityField.FIELD_RENDER_ORDER + 3);
    }

    private buildFieldLines(): void {
        const mb = this.makeMeshBuilder();
        const requestedLines = Math.max(24, Math.floor(this.fieldLineCount));
        const seeds = this.makeRadialSeeds(Math.min(requestedLines, 72));
        const requestedSteps = Math.max(18, Math.floor(this.fieldLineSteps));
        const maxStepsByBudget = Math.max(18, Math.floor(54000 / Math.max(1, seeds.length * GravityField.CURVE_RADIAL_SEGMENTS)) - 4);
        const steps = Math.min(requestedSteps, maxStepsByBudget, 88);
        const stepSize = this.planeSize / 100.0;

        for (let i = 0; i < seeds.length; i++) {
            const path = this.traceFieldLineOutward(seeds[i], steps, stepSize);
            if (path.length < 3) continue;
            const wellPath: vec3[] = [];
            for (let j = 0; j < path.length; j++) {
                wellPath.push(this.pointOnWell(path[j].x, path[j].z, -0.04));
            }
            this.addRibbonPath(mb, wellPath, seeds[i].sourceId === "moon" ? this.lineWidth * 1.12 : this.lineWidth);
        }

        this.assignVisual("fieldLines", mb, new vec4(0.30, 0.34, 0.86, 0.82), GravityField.FIELD_RENDER_ORDER + 2);
    }

    private buildPotentialContours(): void {
        const mb = this.makeMeshBuilder();
        const levels = this.contourLevels();
        const cols = Math.max(32, Math.min(56, Math.floor(this.wellResolution * 3.4)));
        const rows = Math.max(18, Math.min(26, Math.floor(this.wellResolution * 1.55)));
        const grid = this.samplePotentialGrid(cols, rows);

        this.appendAllContourSegments(mb, levels, grid);

        const saddle = this.saddlePoint();
        if (saddle) {
            const p = this.pointOnWell(saddle.x, saddle.z, 0.08);
            this.addRibbonSegment(mb, new vec3(p.x - 0.14, p.y, p.z), new vec3(p.x + 0.14, p.y, p.z), this.lineWidth * 0.9);
            this.addRibbonSegment(mb, new vec3(p.x, p.y, p.z - 0.14), new vec3(p.x, p.y, p.z + 0.14), this.lineWidth * 0.9);
        }

        this.assignVisual("contours", mb, new vec4(0.86, 0.30, 0.34, 0.74), GravityField.CONTOUR_RENDER_ORDER);
    }

    private buildWellGuideCurves(): void {
        const mb = this.makeMeshBuilder();
        const half = this.planeSize * 0.5;
        const guideCount = Math.max(7, Math.floor(this.wellResolution * 0.7));
        const samples = Math.max(18, Math.floor(this.wellResolution * 1.8));
        const step = this.planeSize / Math.max(1, guideCount - 1);

        for (let ix = 0; ix < guideCount; ix++) {
            const x = -half + ix * step;
            const path: vec3[] = [];
            for (let s = 0; s <= samples; s++) {
                const z = -half + this.planeSize * (s / samples);
                path.push(this.pointOnWell(x, z, -0.08));
            }
            this.addRibbonPath(mb, path, this.lineWidth * 0.34);
        }

        for (let iz = 0; iz < guideCount; iz++) {
            const z = -half + iz * step;
            const path: vec3[] = [];
            for (let s = 0; s <= samples; s++) {
                const x = -half + this.planeSize * (s / samples);
                path.push(this.pointOnWell(x, z, -0.09));
            }
            this.addRibbonPath(mb, path, this.lineWidth * 0.34);
        }

        this.assignVisual("wellGuide", mb, new vec4(0.62, 0.62, 0.58, 0.36), GravityField.FIELD_RENDER_ORDER);
    }

    private makeRadialSeeds(count: number): FieldSeed[] {
        const earth = this.bodyById("earth");
        const moon = this.bodyById("moon");
        const seeds: FieldSeed[] = [];
        if (!earth && !moon) return seeds;

        const moonCount = earth && moon ? Math.max(12, Math.floor(count * 0.22)) : count;
        const earthCount = earth && moon ? Math.max(18, count - moonCount) : count;

        if (earth) this.addBodySeeds(seeds, earth, earthCount, 0.08);
        if (moon) this.addBodySeeds(seeds, moon, moonCount, 0.26);
        return seeds;
    }

    private addBodySeeds(seeds: FieldSeed[], body: GravityBody, count: number, phase: number): void {
        const ring = body.radius + (body.id === "earth" ? 0.04 : 0.035);
        for (let i = 0; i < count; i++) {
            const angle = ((i + 0.5) / count) * Math.PI * 2.0 + phase;
            seeds.push({
                sourceId: body.id,
                x: body.center.x + Math.cos(angle) * ring,
                z: body.center.z + Math.sin(angle) * ring,
            });
        }
    }

    private traceFieldLineOutward(seed: FieldSeed, maxSteps: number, stepSize: number): Point2[] {
        const path: Point2[] = [];
        const source = this.bodyById(seed.sourceId);
        if (source) {
            const dx = seed.x - source.center.x;
            const dz = seed.z - source.center.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0.0001) {
                const ux = dx / len;
                const uz = dz / len;
                path.push({ x: source.center.x, z: source.center.z });
                path.push({ x: source.center.x + ux * source.radius * 0.36, z: source.center.z + uz * source.radius * 0.36 });
                path.push({ x: source.center.x + ux * source.radius * 0.72, z: source.center.z + uz * source.radius * 0.72 });
            }
        }
        path.push({ x: seed.x, z: seed.z });
        let x = seed.x;
        let z = seed.z;
        const half = this.planeSize * 0.5;
        let lastDir: Point2 | null = null;

        for (let i = 0; i < maxSteps; i++) {
            const dir: Point2 | null = this.outwardFieldDirection(seed, x, z) || lastDir;
            if (!dir) break;
            lastDir = dir;
            x += dir.x * stepSize;
            z += dir.z * stepSize;

            if (x < -half || x > half || z < -half || z > half) break;
            if (this.nearOtherBody(x, z, seed.sourceId, 0.04)) break;
            path.push({ x: x, z: z });
        }
        return path;
    }

    private outwardFieldDirection(seed: FieldSeed, x: number, z: number): Point2 | null {
        const sample = this.sampleGravityXZ(x, z).field;
        const mag = sample.length;
        if (mag < 0.0001) return null;

        let outX = -sample.x / mag;
        let outZ = -sample.z / mag;
        const source = this.bodyById(seed.sourceId);
        if (!source) return { x: outX, z: outZ };

        const rx = x - source.center.x;
        const rz = z - source.center.z;
        const rLen = Math.sqrt(rx * rx + rz * rz);
        if (rLen < 0.0001) return { x: outX, z: outZ };

        const radialX = rx / rLen;
        const radialZ = rz / rLen;
        const distanceFromSurface = Math.max(0.0, rLen - source.radius);
        const localZone = source.id === "moon" ? 1.35 : 0.68;
        const radialWeight = Math.max(0.0, Math.min(1.0, 1.0 - distanceFromSurface / localZone));
        outX = outX * (1.0 - radialWeight) + radialX * radialWeight;
        outZ = outZ * (1.0 - radialWeight) + radialZ * radialWeight;
        const len = Math.sqrt(outX * outX + outZ * outZ);
        if (len < 0.0001) return null;
        return { x: outX / len, z: outZ / len };
    }

    private contourLevels(): number[] {
        const earth = this.bodyById("earth");
        const moon = this.bodyById("moon");
        const levels: number[] = [];
        const earthRadii = [0.28, 0.62, 1.05, 1.55, 2.15, 2.92, 3.95, 5.40];
        const moonRadii = [0.14, 0.32, 0.56, 0.90, 1.40];

        if (earth) {
            for (let i = 0; i < earthRadii.length; i++) {
                levels.push(this.samplePotentialXZ(earth.center.x + earthRadii[i], earth.center.z));
            }
        }
        if (moon) {
            for (let i = 0; i < moonRadii.length; i++) {
                levels.push(this.samplePotentialXZ(moon.center.x + moonRadii[i], moon.center.z));
            }
        }
        const saddle = this.saddlePoint();
        if (saddle) levels.push(this.samplePotentialXZ(saddle.x, saddle.z));

        levels.sort((a, b) => b - a);
        const out: number[] = [];
        for (let i = 0; i < levels.length; i++) {
            if (!isFinite(levels[i])) continue;
            let duplicate = false;
            for (let j = 0; j < out.length; j++) {
                if (Math.abs(out[j] - levels[i]) < 0.01) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) out.push(levels[i]);
        }
        return out;
    }

    private samplePotentialGrid(cols: number, rows: number): ContourGrid {
        const half = this.planeSize * 0.5;
        const dx = this.planeSize / cols;
        const dz = this.planeSize / rows;
        const values: number[][] = [];

        for (let iz = 0; iz <= rows; iz++) {
            values[iz] = [];
            const z = -half + iz * dz;
            for (let ix = 0; ix <= cols; ix++) {
                const x = -half + ix * dx;
                values[iz][ix] = this.samplePotentialXZ(x, z);
            }
        }
        return { values: values, cols: cols, rows: rows, half: half, dx: dx, dz: dz };
    }

    private appendAllContourSegments(mb: MeshBuilder, levels: number[], grid: ContourGrid): void {
        if (levels.length === 0) return;
        // Sort ascending so we can early-break once level > cellMax.
        const sorted = levels.slice().sort((a, b) => a - b);
        const values = grid.values;
        const half = grid.half;
        const dx = grid.dx;
        const dz = grid.dz;
        const ribbonWidth = this.lineWidth * 0.65;
        const lift = 0.02;
        const cross: number[] = [];

        for (let iz = 0; iz < grid.rows; iz++) {
            const rowA = values[iz];
            const rowB = values[iz + 1];
            const z0 = -half + iz * dz;
            const z1 = z0 + dz;
            for (let ix = 0; ix < grid.cols; ix++) {
                const v0 = rowA[ix];
                const v1 = rowA[ix + 1];
                const v2 = rowB[ix + 1];
                const v3 = rowB[ix];
                let cellMin = v0;
                let cellMax = v0;
                if (v1 < cellMin) cellMin = v1; else if (v1 > cellMax) cellMax = v1;
                if (v2 < cellMin) cellMin = v2; else if (v2 > cellMax) cellMax = v2;
                if (v3 < cellMin) cellMin = v3; else if (v3 > cellMax) cellMax = v3;
                if (cellMin === cellMax) continue;

                const x0 = -half + ix * dx;
                const x1 = x0 + dx;

                for (let li = 0; li < sorted.length; li++) {
                    const level = sorted[li];
                    if (level < cellMin) continue;
                    if (level > cellMax) break;

                    cross.length = 0;
                    this.pushContourCrossing(cross, level, x0, z0, x1, z0, v0, v1);
                    this.pushContourCrossing(cross, level, x1, z0, x1, z1, v1, v2);
                    this.pushContourCrossing(cross, level, x1, z1, x0, z1, v2, v3);
                    this.pushContourCrossing(cross, level, x0, z1, x0, z0, v3, v0);

                    const n = cross.length;
                    if (n === 4) {
                        const a = this.pointOnWell(cross[0], cross[1], lift);
                        const b = this.pointOnWell(cross[2], cross[3], lift);
                        this.addRibbonSegment(mb, a, b, ribbonWidth);
                    } else if (n === 8) {
                        const a = this.pointOnWell(cross[0], cross[1], lift);
                        const b = this.pointOnWell(cross[2], cross[3], lift);
                        const c = this.pointOnWell(cross[4], cross[5], lift);
                        const d = this.pointOnWell(cross[6], cross[7], lift);
                        this.addRibbonSegment(mb, a, b, ribbonWidth);
                        this.addRibbonSegment(mb, c, d, ribbonWidth);
                    }
                }
            }
        }
    }

    private pushContourCrossing(arr: number[], level: number, ax: number, az: number, bx: number, bz: number, va: number, vb: number): void {
        const da = va - level;
        const db = vb - level;
        if ((da < 0 && db < 0) || (da > 0 && db > 0)) return;
        if (da === 0 && db === 0) return;
        const denom = vb - va;
        const t = Math.abs(denom) < 0.000001 ? 0.5 : (level - va) / denom;
        const tc = t < 0.0 ? 0.0 : (t > 1.0 ? 1.0 : t);
        arr.push(ax + (bx - ax) * tc, az + (bz - az) * tc);
    }

    private saddlePoint(): Point2 | null {
        const earth = this.bodyById("earth");
        const moon = this.bodyById("moon");
        if (!earth || !moon) return null;

        const dx = moon.center.x - earth.center.x;
        const dz = moon.center.z - earth.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.001) return null;
        const ux = dx / dist;
        const uz = dz / dist;
        let lo = Math.min(0.94, (earth.radius + 0.1) / dist);
        let hi = Math.max(lo + 0.02, 1.0 - (moon.radius + 0.1) / dist);

        let flo = this.fieldProjectionOnBodyLine(earth, dx, dz, ux, uz, lo);
        let fhi = this.fieldProjectionOnBodyLine(earth, dx, dz, ux, uz, hi);
        if (Math.sign(flo) === Math.sign(fhi)) {
            const t = 1.0 / (1.0 + Math.sqrt(moon.mass / earth.mass));
            return { x: earth.center.x + dx * t, z: earth.center.z + dz * t };
        }

        for (let i = 0; i < 36; i++) {
            const mid = (lo + hi) * 0.5;
            const fm = this.fieldProjectionOnBodyLine(earth, dx, dz, ux, uz, mid);
            if (Math.sign(fm) === Math.sign(flo)) {
                lo = mid;
                flo = fm;
            } else {
                hi = mid;
                fhi = fm;
            }
        }
        const t = (lo + hi) * 0.5;
        return { x: earth.center.x + dx * t, z: earth.center.z + dz * t };
    }

    private fieldProjectionOnBodyLine(earth: GravityBody, dx: number, dz: number, ux: number, uz: number, t: number): number {
        const x = earth.center.x + dx * t;
        const z = earth.center.z + dz * t;
        const f = this.sampleGravityXZ(x, z).field;
        return f.x * ux + f.z * uz;
    }

    private sampleGravityXZ(x: number, z: number): GravitySample {
        const bodies = this.bodies();
        let fx = 0.0;
        let fz = 0.0;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            const dx = body.center.x - x;
            const dz = body.center.z - z;
            const softening = this.bodySoftening(body);
            const r2 = dx * dx + dz * dz + softening * softening;
            const invR = 1.0 / Math.sqrt(r2);
            const strength = body.mass * invR * invR;
            fx += dx * invR * strength;
            fz += dz * invR * strength;
        }
        const field = new vec3(fx, 0.0, fz);
        const intensity = Math.min(1.0, Math.log(1.0 + field.length * 0.72) / 1.8);
        return { field: field, intensity: intensity };
    }

    private samplePotentialXZ(x: number, z: number): number {
        const bodies = this.bodies();
        let potential = 0.0;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            const dx = body.center.x - x;
            const dz = body.center.z - z;
            const softening = this.bodySoftening(body);
            potential += body.mass / Math.sqrt(dx * dx + dz * dz + softening * softening);
        }
        return potential;
    }

    private wellHeightXZ(x: number, z: number): number {
        const bodies = this.bodies();
        let height = 0.0;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            const dx = x - body.center.x;
            const dz = z - body.center.z;
            const r2 = dx * dx + dz * dz;
            const isEarth = body.id === "earth";
            // Depth scales directly with mass so Earth dwarfs the Moon (~40x).
            const depth = body.mass * this.wellDepth * 0.16;
            const radius = isEarth ? 3.6 : 0.95;
            const gaussian = Math.exp(-0.5 * r2 / (radius * radius));
            const shoulder = 0.16 / Math.sqrt(r2 + radius * radius * 1.8);
            height += depth * (gaussian + shoulder);
        }
        return height;
    }

    private bodySoftening(body: GravityBody): number {
        return Math.max(0.035, this.softening * body.radius * 0.32);
    }

    private pointOnWell(x: number, z: number, lift: number): vec3 {
        return new vec3(x, -this.wellHeightXZ(x, z) + lift, z);
    }

    private nearOtherBody(x: number, z: number, sourceId: string, padding: number): boolean {
        const bodies = this.bodies();
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.id === sourceId) continue;
            if (this.distance2(x, z, body.center.x, body.center.z) < body.radius + 0.12 + padding) return true;
        }
        return false;
    }

    private isNearBodyXZ(x: number, z: number, padding: number): boolean {
        const bodies = this.bodies();
        for (let i = 0; i < bodies.length; i++) {
            if (this.distance2(x, z, bodies[i].center.x, bodies[i].center.z) < bodies[i].radius + padding) return true;
        }
        return false;
    }

    private distance2(ax: number, az: number, bx: number, bz: number): number {
        const dx = ax - bx;
        const dz = az - bz;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private addArrow(mb: MeshBuilder, origin: vec3, field: vec3, intensity: number, maxLength: number): void {
        const mag = field.length;
        if (mag < 0.0001) return;

        const dir = field.uniformScale(1.0 / mag);
        const side = new vec3(-dir.z, 0.0, dir.x);
        const len = Math.min(maxLength, maxLength * (0.22 + intensity * this.arrowScale));
        const shaftLen = len * 0.64;
        const headLen = len * 0.36;
        const shaftWidth = this.arrowWidth * (0.72 + intensity * 0.45);
        const headWidth = shaftWidth * 2.45;
        const start = origin.add(dir.uniformScale(-len * 0.35));
        const shaftEnd = start.add(dir.uniformScale(shaftLen));
        const tip = shaftEnd.add(dir.uniformScale(headLen));

        const base = mb.getVerticesCount();
        const p0 = start.add(side.uniformScale(-shaftWidth));
        const p1 = start.add(side.uniformScale(shaftWidth));
        const p2 = shaftEnd.add(side.uniformScale(-shaftWidth));
        const p3 = shaftEnd.add(side.uniformScale(shaftWidth));
        const p4 = shaftEnd.add(side.uniformScale(-headWidth));
        const p5 = shaftEnd.add(side.uniformScale(headWidth));
        mb.appendVerticesInterleaved([
            p0.x, p0.y, p0.z, 0.0, 1.0, 0.0, 0.0, 0.0,
            p1.x, p1.y, p1.z, 0.0, 1.0, 0.0, 0.0, 1.0,
            p2.x, p2.y, p2.z, 0.0, 1.0, 0.0, 0.65, 0.0,
            p3.x, p3.y, p3.z, 0.0, 1.0, 0.0, 0.65, 1.0,
            p4.x, p4.y, p4.z, 0.0, 1.0, 0.0, 0.7, 0.0,
            p5.x, p5.y, p5.z, 0.0, 1.0, 0.0, 0.7, 1.0,
            tip.x, tip.y, tip.z, 0.0, 1.0, 0.0, 1.0, 0.5,
        ]);
        mb.appendIndices([
            base, base + 2, base + 1,
            base + 1, base + 2, base + 3,
            base + 4, base + 6, base + 5,
        ]);
    }

    private addRibbonPath(mb: MeshBuilder, path: vec3[], width: number): void {
        this.addTubePath(mb, path, width, GravityField.CURVE_RADIAL_SEGMENTS);
    }

    private addRibbonSegment(mb: MeshBuilder, a: vec3, b: vec3, width: number): void {
        this.addTubePath(mb, [a, b], width, GravityField.CURVE_RADIAL_SEGMENTS);
    }

    private addDottedPlanarRibbonPath(mb: MeshBuilder, path: vec3[], width: number, dashLength: number, gapLength: number): void {
        if (path.length < 2) return;
        const dash = Math.max(0.05, dashLength);
        const gap = Math.max(0.03, gapLength);
        let drawing = true;
        let remaining = dash;
        let dashPath: vec3[] = [path[0]];

        for (let i = 0; i < path.length - 1; i++) {
            let a = path[i];
            const b = path[i + 1];
            let segLen = this.distanceVec(a, b);
            if (segLen < 0.0001) continue;

            while (segLen > 0.0001) {
                const step = Math.min(remaining, segLen);
                const next = this.lerpVec(a, b, step / segLen);
                if (drawing) {
                    dashPath.push(next);
                }

                remaining -= step;
                segLen -= step;
                a = next;

                if (remaining <= 0.0001) {
                    if (drawing && dashPath.length > 1) {
                        this.addPlanarRibbonPath(mb, dashPath, width);
                    }
                    drawing = !drawing;
                    remaining = drawing ? dash : gap;
                    dashPath = drawing ? [a] : [];
                }
            }

            if (drawing && dashPath.length === 0) {
                dashPath.push(b);
            }
        }

        if (drawing && dashPath.length > 1) {
            this.addPlanarRibbonPath(mb, dashPath, width);
        }
    }

    private addPlanarRibbonPath(mb: MeshBuilder, sourcePath: vec3[], width: number): void {
        const path = this.compactPath(sourcePath, 0.001);
        const pathLen = path.length;
        if (pathLen < 2) return;
        const halfWidth = Math.max(0.002, width * 0.5);
        const base = mb.getVerticesCount();
        const lastIndex = Math.max(1, pathLen - 1);
        const verts: number[] = new Array(pathLen * 2 * 8);
        const inds: number[] = new Array((pathLen - 1) * 6);
        let vi = 0;
        let ii = 0;
        let sideX = 1.0;
        let sideZ = 0.0;

        for (let i = 0; i < pathLen; i++) {
            const tangent = this.pathTangent(path, i);
            const flatLen = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z);
            if (flatLen > 0.0001) {
                let nextSideX = tangent.z / flatLen;
                let nextSideZ = -tangent.x / flatLen;
                if (nextSideX * sideX + nextSideZ * sideZ < 0.0) {
                    nextSideX = -nextSideX;
                    nextSideZ = -nextSideZ;
                }
                sideX = nextSideX;
                sideZ = nextSideZ;
            }

            const p = path[i];
            const t = i / lastIndex;
            const lx = p.x - sideX * halfWidth;
            const lz = p.z - sideZ * halfWidth;
            const rx = p.x + sideX * halfWidth;
            const rz = p.z + sideZ * halfWidth;
            verts[vi++] = lx; verts[vi++] = p.y; verts[vi++] = lz;
            verts[vi++] = 0.0; verts[vi++] = 1.0; verts[vi++] = 0.0;
            verts[vi++] = t; verts[vi++] = 0.0;
            verts[vi++] = rx; verts[vi++] = p.y; verts[vi++] = rz;
            verts[vi++] = 0.0; verts[vi++] = 1.0; verts[vi++] = 0.0;
            verts[vi++] = t; verts[vi++] = 1.0;
        }

        for (let i = 0; i < pathLen - 1; i++) {
            const a = base + i * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            inds[ii++] = a; inds[ii++] = c; inds[ii++] = b;
            inds[ii++] = b; inds[ii++] = c; inds[ii++] = d;
        }

        mb.appendVerticesInterleaved(verts);
        mb.appendIndices(inds);
    }

    private addDottedTubePath(mb: MeshBuilder, path: vec3[], width: number, radialSegments: number, dashLength: number, gapLength: number): void {
        if (path.length < 2) return;
        const dash = Math.max(0.05, dashLength);
        const gap = Math.max(0.03, gapLength);
        let drawing = true;
        let remaining = dash;
        let dashPath: vec3[] = [path[0]];

        for (let i = 0; i < path.length - 1; i++) {
            let a = path[i];
            const b = path[i + 1];
            let segLen = this.distanceVec(a, b);
            if (segLen < 0.0001) continue;

            while (segLen > 0.0001) {
                const step = Math.min(remaining, segLen);
                const next = this.lerpVec(a, b, step / segLen);
                if (drawing) {
                    dashPath.push(next);
                }

                remaining -= step;
                segLen -= step;
                a = next;

                if (remaining <= 0.0001) {
                    if (drawing && dashPath.length > 1) {
                        this.addTubePath(mb, dashPath, width, radialSegments);
                    }
                    drawing = !drawing;
                    remaining = drawing ? dash : gap;
                    dashPath = drawing ? [a] : [];
                }
            }

            if (drawing && dashPath.length === 0) {
                dashPath.push(b);
            }
        }

        if (drawing && dashPath.length > 1) {
            this.addTubePath(mb, dashPath, width, radialSegments);
        }
    }

    private addTubePath(mb: MeshBuilder, path: vec3[], width: number, radialSegments: number): void {
        const pathLen = path.length;
        if (pathLen < 2) return;
        const sides = Math.max(3, Math.floor(radialSegments));
        const radius = Math.max(0.002, width * 0.5);
        const base = mb.getVerticesCount();
        const lastIndex = Math.max(1, pathLen - 1);

        const vertCount = pathLen * sides;
        const segCount = pathLen - 1;
        const verts: number[] = new Array(vertCount * 8);
        const inds: number[] = new Array(segCount * sides * 6);
        let vi = 0;
        let ii = 0;

        for (let i = 0; i < pathLen; i++) {
            const tangent = this.pathTangent(path, i);
            const ref = Math.abs(tangent.y) > 0.82 ? new vec3(1.0, 0.0, 0.0) : new vec3(0.0, 1.0, 0.0);
            let normal = this.cross(ref, tangent);
            if (normal.length < 0.0001) normal = this.cross(new vec3(0.0, 0.0, 1.0), tangent);
            normal = this.normalizeVec(normal);
            const binormal = this.normalizeVec(this.cross(tangent, normal));
            const t = i / lastIndex;
            const px = path[i].x;
            const py = path[i].y;
            const pz = path[i].z;
            const nx = normal.x, ny = normal.y, nz = normal.z;
            const bx = binormal.x, by = binormal.y, bz = binormal.z;

            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2.0;
                const cs = Math.cos(a);
                const sn = Math.sin(a);
                const rx = nx * cs + bx * sn;
                const ry = ny * cs + by * sn;
                const rz = nz * cs + bz * sn;
                verts[vi++] = px + rx * radius;
                verts[vi++] = py + ry * radius;
                verts[vi++] = pz + rz * radius;
                verts[vi++] = rx;
                verts[vi++] = ry;
                verts[vi++] = rz;
                verts[vi++] = t;
                verts[vi++] = s / sides;
            }
        }

        for (let i = 0; i < segCount; i++) {
            const r0 = base + i * sides;
            const r1 = r0 + sides;
            for (let s = 0; s < sides; s++) {
                const a0 = r0 + s;
                const a1 = r0 + ((s + 1) % sides);
                const b0 = r1 + s;
                const b1 = r1 + ((s + 1) % sides);
                inds[ii++] = a0; inds[ii++] = b0; inds[ii++] = a1;
                inds[ii++] = a1; inds[ii++] = b0; inds[ii++] = b1;
            }
        }

        mb.appendVerticesInterleaved(verts);
        mb.appendIndices(inds);
    }

    private pathTangent(path: vec3[], index: number): vec3 {
        const current = path[Math.max(0, Math.min(path.length - 1, index))];
        for (let radius = 1; radius < path.length; radius++) {
            const prev = path[Math.max(0, index - radius)];
            const next = path[Math.min(path.length - 1, index + radius)];
            const tangent = next.sub(prev);
            if (tangent.length > 0.0001) {
                return this.normalizeVec(tangent);
            }
            const forward = next.sub(current);
            if (forward.length > 0.0001) {
                return this.normalizeVec(forward);
            }
            const backward = current.sub(prev);
            if (backward.length > 0.0001) {
                return this.normalizeVec(backward);
            }
        }
        return new vec3(1.0, 0.0, 0.0);
    }

    private resamplePath(path: vec3[], maxStep: number): vec3[] {
        if (path.length < 2) return path;
        const step = Math.max(0.02, maxStep);
        const out: vec3[] = [path[0]];
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const len = this.distanceVec(a, b);
            if (len < 0.0001) continue;
            const segments = Math.max(1, Math.ceil(len / step));
            for (let s = 1; s <= segments; s++) {
                out.push(this.lerpVec(a, b, s / segments));
            }
        }
        return out;
    }

    private compactPath(path: vec3[], minDistance: number): vec3[] {
        if (path.length < 2) return path;
        const minD = Math.max(0.0, minDistance);
        const out: vec3[] = [path[0]];
        for (let i = 1; i < path.length; i++) {
            if (this.distanceVec(out[out.length - 1], path[i]) >= minD) {
                out.push(path[i]);
            }
        }
        if (out.length === 1 && path.length > 1) {
            out.push(path[path.length - 1]);
        }
        return out;
    }

    private smoothPath(path: vec3[], subdivisions: number): vec3[] {
        if (path.length < 3) return path;
        const steps = Math.max(1, Math.floor(subdivisions));
        const out: vec3[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const p0 = path[Math.max(0, i - 1)];
            const p1 = path[i];
            const p2 = path[i + 1];
            const p3 = path[Math.min(path.length - 1, i + 2)];
            for (let s = 0; s < steps; s++) {
                out.push(this.catmullRom(p0, p1, p2, p3, s / steps));
            }
        }
        out.push(path[path.length - 1]);
        return out;
    }

    private catmullRom(p0: vec3, p1: vec3, p2: vec3, p3: vec3, t: number): vec3 {
        const t2 = t * t;
        const t3 = t2 * t;
        return new vec3(
            0.5 * ((2.0 * p1.x) + (-p0.x + p2.x) * t + (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 + (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3),
            0.5 * ((2.0 * p1.y) + (-p0.y + p2.y) * t + (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 + (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3),
            0.5 * ((2.0 * p1.z) + (-p0.z + p2.z) * t + (2.0 * p0.z - 5.0 * p1.z + 4.0 * p2.z - p3.z) * t2 + (-p0.z + 3.0 * p1.z - 3.0 * p2.z + p3.z) * t3)
        );
    }

    private lerpVec(a: vec3, b: vec3, t: number): vec3 {
        return new vec3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    private distanceVec(a: vec3, b: vec3): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private buildSphereMesh(center: vec3, radius: number, segments: number, rings: number): MeshBuilder {
        const mb = this.makeMeshBuilder();
        const seg = Math.max(5, Math.floor(segments));
        const ring = Math.max(4, Math.floor(rings));

        for (let iy = 0; iy < ring; iy++) {
            const v0 = iy / ring;
            const v1 = (iy + 1) / ring;
            const theta0 = v0 * Math.PI;
            const theta1 = v1 * Math.PI;
            for (let ix = 0; ix < seg; ix++) {
                const u0 = ix / seg;
                const u1 = (ix + 1) / seg;
                const p00 = this.spherePoint(center, radius, theta0, u0 * Math.PI * 2.0);
                const p01 = this.spherePoint(center, radius, theta0, u1 * Math.PI * 2.0);
                const p10 = this.spherePoint(center, radius, theta1, u0 * Math.PI * 2.0);
                const p11 = this.spherePoint(center, radius, theta1, u1 * Math.PI * 2.0);
                this.addFlatTri(mb, p00, p10, p01);
                this.addFlatTri(mb, p01, p10, p11);
            }
        }
        return mb;
    }

    private addFlatTri(mb: MeshBuilder, a: vec3, b: vec3, c: vec3): void {
        const ab = b.sub(a);
        const ac = c.sub(a);
        const n = this.normalizeVec(this.cross(ab, ac));
        const base = mb.getVerticesCount();
        mb.appendVerticesInterleaved([a.x, a.y, a.z, n.x, n.y, n.z, 0.0, 0.0]);
        mb.appendVerticesInterleaved([b.x, b.y, b.z, n.x, n.y, n.z, 0.0, 1.0]);
        mb.appendVerticesInterleaved([c.x, c.y, c.z, n.x, n.y, n.z, 1.0, 0.0]);
        mb.appendIndices([base, base + 1, base + 2]);
    }

    private spherePoint(center: vec3, radius: number, theta: number, phi: number): vec3 {
        return new vec3(
            center.x + Math.sin(theta) * Math.cos(phi) * radius,
            center.y + Math.cos(theta) * radius,
            center.z + Math.sin(theta) * Math.sin(phi) * radius
        );
    }

    private useAssignedModel(model: SceneObject | null, renderOrder: number): boolean {
        if (!model) return false;

        try { model.enabled = true; } catch (e) {}
        // Body models are deep Sketchfab trees; only walk them for render order
        // when it actually changes, not on every rebuild.
        const key = model.uniqueIdentifier;
        if (this.renderOrderedModels[key] !== renderOrder) {
            this.setObjectRenderOrderRecursive(model, renderOrder);
            this.renderOrderedModels[key] = renderOrder;
        }
        return true;
    }

    private setObjectRenderOrderRecursive(object: SceneObject, renderOrder: number): void {
        const visual = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (visual) this.setVisualRenderOrder(visual, renderOrder);
        for (let i = 0; i < object.getChildrenCount(); i++) {
            this.setObjectRenderOrderRecursive(object.getChild(i), renderOrder);
        }
    }

    private getBodyLocalPosition(body: SceneObject | null, fallback: vec3): vec3 {
        if (!body) return fallback;
        const world = body.getTransform().getWorldPosition();
        const invWorld = this.sceneObject.getTransform().getInvertedWorldTransform();
        return invWorld.multiplyPoint(world);
    }

    private earthFallback(): vec3 {
        return new vec3(-4.2, 0.82, 0.0);
    }

    private moonFallback(): vec3 {
        return new vec3(5.1, 0.42, 0.0);
    }

    private cross(a: vec3, b: vec3): vec3 {
        return new vec3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x
        );
    }

    private copyVec3(v: vec3): vec3 {
        return new vec3(v.x, v.y, v.z);
    }

    private copyQuat(q: quat): quat {
        return new quat(q.w, q.x, q.y, q.z);
    }

    private degToRad(degrees: number): number {
        return degrees * Math.PI / 180.0;
    }

    private normalizeVec(v: vec3): vec3 {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len < 0.0001) return new vec3(0.0, 1.0, 0.0);
        return new vec3(v.x / len, v.y / len, v.z / len);
    }

    private assignVisual(slotKey: string, mb: MeshBuilder, color: vec4, renderOrder: number): RenderMeshVisual | null {
        if (!mb.isValid()) return null;
        let visual = this.visualSlots[slotKey];
        if (!visual) {
            visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (this.material) {
                try {
                    visual.mainMaterial = (this.material as any).clone();
                } catch (e) {
                    visual.mainMaterial = this.material;
                }
            }
            this.visualSlots[slotKey] = visual;
        }
        if (visual.mainMaterial) {
            this.setPassColor(visual.mainMaterial.mainPass, color);
        }
        visual.mesh = mb.getMesh();
        mb.updateMesh();
        this.setVisualRenderOrder(visual, renderOrder);
        this.activeSlots[slotKey] = true;
        return visual;
    }


    private setPassColor(pass: any, color: vec4): void {
        if (!pass) return;
        const rgb = new vec3(color.x, color.y, color.z);
        const emission = new vec3(color.x * 0.35, color.y * 0.35, color.z * 0.35);
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.baseColorFactor = color; } catch (e) {}
        try { pass.backgroundColor = color; } catch (e) {}
        try { pass.uColor = color; } catch (e) {}
        try { pass.color = color; } catch (e) {}
        try { pass.albedo = color; } catch (e) {}
        try { pass.diffuseColor = color; } catch (e) {}
        try { pass.emissive = color; } catch (e) {}
        try { pass.emissiveColor = color; } catch (e) {}
        try { pass.emissiveFactor = emission; } catch (e) {}
        try { pass.Port_Albedo_N405 = rgb; } catch (e) {}
        try { pass.Port_Emissive_N405 = emission; } catch (e) {}
        try { pass.Port_FinalColor_N001 = color; } catch (e) {}
        try { pass.Port_FinalColor1_N001 = color; } catch (e) {}
        try { pass.Port_FinalColor2_N001 = color; } catch (e) {}
        try { pass.Port_FinalColor3_N001 = color; } catch (e) {}
        try { pass.Port_FinalColor_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor1_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor2_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor3_N004 = color; } catch (e) {}
        try { pass.Port_Value1_N000 = color; } catch (e) {}
        try { pass.Port_Value2_N000 = color; } catch (e) {}
        try { pass.metallicFactor = 0.0; } catch (e) {}
        try { pass.roughnessFactor = 0.7; } catch (e) {}
        try { pass.metallic = 0.0; } catch (e) {}
        try { pass.metalness = 0.0; } catch (e) {}
        try { pass.roughness = 0.85; } catch (e) {}
        try { pass.Port_Opacity_N405 = color.w; } catch (e) {}
        try { pass.Opacity = color.w; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.twoSided = true; } catch (e) {}
        try { pass.DepthTest = false; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
    }

    private setVisualRenderOrder(visual: RenderMeshVisual, renderOrder: number): void {
        const anyVisual = visual as any;
        try {
            if (typeof anyVisual.setRenderOrder === "function") anyVisual.setRenderOrder(renderOrder);
            if (anyVisual.renderOrder !== undefined) anyVisual.renderOrder = renderOrder;
            if (anyVisual.RenderOrder !== undefined) anyVisual.RenderOrder = renderOrder;
        } catch (e) {}
    }

    private makeMeshBuilder(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;
        return mb;
    }
}
