// ArtemisOrbit.ts
// Coordinated Artemis II playback for the gravity-field showcase. Earth fixed at
// origin; Moon and spacecraft both driven from real geocentric J2000 ephemerides
// on one shared mission clock, so the lunar flyby lines up (closest approach
// ~8,283 km @ t=421,515 s, 2026-04-06 23:02 UTC).
//
// Because the gravity-field plane samples its Moon/Earth from the same scene
// objects, moving the Moon here makes its gravity well follow it automatically.
// Spacecraft marker is meant to be an instance of
//   Assets/Meshes/Models/artemis_ii_-_space_launch_system_sls.glb
//
// CONTROLS / LOGIC (wire to menu later):
//   play() pause() toggle()
//   setProgress(0..1)  setTime(missionSeconds)  getProgress()
//   setSpeed(missionSecondsPerRealSecond)  setScale(unitsPer1000Km)
//   show() hide()
//   getMissionInfo() -> live readout struct (MET, phase, distances, UTC anchors)
//
// Default scale = 0.1 cm per 1000 km → Moon ~38 cm out, apogee ~41 cm; fits a
// ~100 cm plane (Earth at center).
// Trajectory shown as a growing trail (flown portion), redrawn each sample crossing.

import { ARTEMIS_II_TRAJECTORY } from "./ArtemisTrajectory";
import { MOON_EPHEMERIS } from "./MoonEphemeris";

export type ArtemisMissionInfo = {
    progress: number; // 0..1 through the mission
    metSeconds: number; // mission elapsed time (s)
    met: string; // "T+Dd HH:MM:SS"
    utc: string; // absolute UTC clock, "YYYY-MM-DD HH:MM:SS UTC"
    missionDay: number;
    phase: string;
    spacecraftToMoonKm: number;
    spacecraftToEarthKm: number;
    moonDistanceKm: number; // Earth->Moon
    playing: boolean;
    speed: number; // mission seconds per real second
};

@component
export class ArtemisOrbit extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Earth — frame origin. Moon/spacecraft are placed relative to its world position.")
    earthObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Moon — driven by the real ephemeris (its gravity well follows automatically).")
    moonObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Spacecraft marker (the SLS .glb instance) — driven by the Artemis trajectory.")
    spacecraftObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional: object to render the full trajectory arc into (a RenderMeshVisual is built on it). Make it a sibling of Earth.")
    pathObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Material for the trajectory line (an unlit/flat material reads best).")
    pathMaterial: Material = null as any;

    @input
    @widget(new SliderWidget(0.01, 0.3, 0.005))
    @hint("Scene cm per 1000 km. 0.1 → Moon ~38 cm out, apogee ~41 cm (fits a ~100 cm plane).")
    unitsPer1000Km: number = 0.1;

    @input
    @widget(new SliderWidget(1000, 100000, 1000))
    @hint("Mission seconds played per real second. ~20000 plays the full ~8.9-day mission in ~38 s.")
    missionSecondsPerSecond: number = 20000;

    @input
    @hint("Loop playback when the mission ends.")
    loop: boolean = true;

    @input
    @hint("Start playing as soon as this is enabled.")
    autoPlay: boolean = false;

    @input
    @hint("Point the marker's +Y axis along its direction of travel (prograde). This is heading, not true attitude — no attitude data exists.")
    orientToVelocity: boolean = true;

    // Real closest-lunar-approach time (s from epoch) — verified flyby instant.
    private static readonly FLYBY_SEC: number = 421515.0;

    private playing: boolean = false;
    private missionT: number = 0.0;
    private readonly duration: number = ARTEMIS_II_TRAJECTORY.durationSec;
    private lastScKm: vec3 = vec3.zero();
    private lastMnKm: vec3 = vec3.zero();
    // Rotation that lays the Moon's orbital plane flat on the scene XZ plane
    // (orbit normal -> +Y), so the wells/orbit sit on the gravity grid.
    private frameRot: quat = quat.fromEulerAngles(0, 0, 0);
    private lastTrailIdx: number = -1;
    private trailVisual: any = null;

    onAwake(): void {
        this.frameRot = this.computeOrbitUpAlign();
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
        this.createEvent("OnStartEvent").bind(() => {
            this.apply();
            this.initTrail();
            if (this.autoPlay) this.playing = true;
        });
    }

    // ---- playback controls --------------------------------------------

    public play(): void {
        this.playing = true;
    }
    public pause(): void {
        this.playing = false;
    }
    public toggle(): void {
        this.playing = !this.playing;
    }
    public isPlaying(): boolean {
        return this.playing;
    }
    public setSpeed(missionSecondsPerRealSecond: number): void {
        this.missionSecondsPerSecond = missionSecondsPerRealSecond;
    }
    public setScale(unitsPer1000Km: number): void {
        this.unitsPer1000Km = unitsPer1000Km;
        this.apply();
    }

    /** Scrub to normalized progress [0..1]. */
    public setProgress(p: number): void {
        this.missionT = this.clamp(p, 0, 1) * this.duration;
        this.apply();
    }
    /** Jump to a mission time (seconds from epoch). */
    public setTime(missionSeconds: number): void {
        this.missionT = this.clamp(missionSeconds, 0, this.duration);
        this.apply();
    }
    public getProgress(): number {
        return this.duration > 0 ? this.missionT / this.duration : 0;
    }
    /** Jump straight to the lunar flyby instant. */
    public goToFlyby(): void {
        this.setTime(ArtemisOrbit.FLYBY_SEC);
    }

    public show(): void {
        this.setVisible(true);
    }
    public hide(): void {
        this.setVisible(false);
    }

    // ---- live mission info (for the readout panel) --------------------

    public getMissionInfo(): ArtemisMissionInfo {
        const toMoon = this.lastScKm.sub(this.lastMnKm).length;
        const toEarth = this.lastScKm.length;
        return {
            progress: this.getProgress(),
            metSeconds: this.missionT,
            met: this.formatMET(this.missionT),
            utc: this.formatUTC(this.missionT),
            missionDay: this.missionT / 86400.0,
            phase: this.phaseAt(this.missionT),
            spacecraftToMoonKm: toMoon,
            spacecraftToEarthKm: toEarth,
            moonDistanceKm: this.lastMnKm.length,
            playing: this.playing,
            speed: this.missionSecondsPerSecond,
        };
    }

    public getStartUTC(): string {
        return ARTEMIS_II_TRAJECTORY.startUTC;
    }
    public getFlybyUTC(): string {
        return ARTEMIS_II_TRAJECTORY.flybyUTC;
    }
    public getEndUTC(): string {
        return ARTEMIS_II_TRAJECTORY.stopUTC;
    }

    // ---- internals -----------------------------------------------------

    private onUpdate(): void {
        if (this.playing) {
            this.missionT += this.missionSecondsPerSecond * getDeltaTime();
            if (this.missionT >= this.duration) {
                if (this.loop) this.missionT = this.missionT % this.duration;
                else {
                    this.missionT = this.duration;
                    this.playing = false;
                }
            }
        }
        // Enforce coordinated positions every frame (also overrides GravityField's
        // one-time Moon restore when paused).
        this.apply();
        this.updateTrail();
    }

    private apply(): void {
        this.lastScKm = this.sample(ARTEMIS_II_TRAJECTORY, this.missionT);
        this.lastMnKm = this.sample(MOON_EPHEMERIS, this.missionT);
        this.placeKm(this.spacecraftObject, this.lastScKm);
        this.placeKm(this.moonObject, this.lastMnKm);
        if (this.orientToVelocity) this.orientSpacecraft();
    }

    // Point the marker's +Y axis along the direction of travel (derived from the
    // path tangent — heading only; the ephemeris carries no attitude).
    private orientSpacecraft(): void {
        if (!this.spacecraftObject) return;
        const ahead = this.sample(ARTEMIS_II_TRAJECTORY, Math.min(this.duration, this.missionT + 2000));
        let dir = this.frameRot.multiplyVec3(ahead.sub(this.lastScKm));
        if (dir.length < 0.00001) return;
        dir = dir.normalize();
        const up = vec3.up();
        const d = this.clamp(up.dot(dir), -1, 1);
        let rot: quat;
        const axis = up.cross(dir);
        if (axis.length < 0.000001) {
            rot = d > 0 ? quat.fromEulerAngles(0, 0, 0) : quat.angleAxis(Math.PI, vec3.right());
        } else {
            rot = quat.angleAxis(Math.acos(d), axis.normalize());
        }
        this.spacecraftObject.getTransform().setLocalRotation(rot);
    }

    // Offset (in the shared parent's local space) for a km vector: align the orbit
    // plane to scene XZ, then scale. Working in local space keeps everything aligned
    // and lets SnapToStage move/rotate the whole root without breaking the layout.
    private offsetFor(pKm: vec3): vec3 {
        const k = this.unitsPer1000Km / 1000.0; // scene units per km
        return this.frameRot.multiplyVec3(pKm).uniformScale(k);
    }

    private earthLocal(): vec3 {
        return this.earthObject ? this.earthObject.getTransform().getLocalPosition() : vec3.zero();
    }

    // Place obj relative to Earth, in their shared parent's local space.
    private placeKm(obj: SceneObject, pKm: vec3): void {
        if (!obj) return;
        obj.getTransform().setLocalPosition(this.earthLocal().add(this.offsetFor(pKm)));
    }

    // Trail setup: prepare the RenderMeshVisual on the path object (in the bodies' local space).
    private initTrail(): void {
        if (!this.pathObject) return;
        const tr = this.pathObject.getTransform();
        tr.setLocalPosition(vec3.zero());
        tr.setLocalRotation(quat.fromEulerAngles(0, 0, 0));
        tr.setLocalScale(vec3.one());
        this.trailVisual = this.pathObject.getComponent("Component.RenderMeshVisual");
        if (!this.trailVisual) this.trailVisual = this.pathObject.createComponent("Component.RenderMeshVisual");
        if (this.pathMaterial) this.trailVisual.mainMaterial = this.pathMaterial;
        this.lastTrailIdx = -1;
        this.updateTrail();
    }

    // Redraw the trail: the flown portion of the trajectory, ending at the spacecraft.
    private updateTrail(): void {
        if (!this.trailVisual) return;
        const idx = this.idxAt(this.missionT);
        if (idx === this.lastTrailIdx) return; // only when we cross a new sample
        this.lastTrailIdx = idx;

        const d: any = ARTEMIS_II_TRAJECTORY;
        const base = this.earthLocal();
        const verts: number[] = [];
        for (let i = 0; i <= idx; i++) {
            const p = base.add(this.offsetFor(new vec3(d.x[i], d.y[i], d.z[i])));
            verts.push(p.x, p.y, p.z);
        }
        const cur = base.add(this.offsetFor(this.lastScKm)); // end exactly at the rocket
        verts.push(cur.x, cur.y, cur.z);

        const count = (verts.length / 3) | 0;
        const mb = new MeshBuilder([{ name: "position", components: 3 }]);
        mb.topology = MeshTopology.Lines;
        mb.indexType = MeshIndexType.UInt16;
        mb.appendVerticesInterleaved(verts);
        const indices: number[] = [];
        for (let i = 0; i < count - 1; i++) indices.push(i, i + 1);
        mb.appendIndices(indices);
        this.trailVisual.mesh = mb.getMesh();
        mb.updateMesh();
    }

    private idxAt(t: number): number {
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

    // Build the rotation that maps the Moon orbital-plane normal onto scene +Y.
    private computeOrbitUpAlign(): quat {
        const m: any = MOON_EPHEMERIS;
        const n = m.t.length;
        if (n < 3) return quat.fromEulerAngles(0, 0, 0);
        const a = new vec3(m.x[0], m.y[0], m.z[0]);
        let b = new vec3(m.x[(n / 4) | 0], m.y[(n / 4) | 0], m.z[(n / 4) | 0]);
        let nrm = a.cross(b);
        if (nrm.length < 1.0) {
            b = new vec3(m.x[(n / 2) | 0], m.y[(n / 2) | 0], m.z[(n / 2) | 0]);
            nrm = a.cross(b);
        }
        if (nrm.length < 1e-6) return quat.fromEulerAngles(0, 0, 0);
        nrm = nrm.normalize();
        const up = vec3.up();
        const d = this.clamp(nrm.dot(up), -1, 1);
        let axis = nrm.cross(up);
        if (axis.length < 1e-6) {
            return d > 0 ? quat.fromEulerAngles(0, 0, 0) : quat.angleAxis(Math.PI, vec3.right());
        }
        return quat.angleAxis(Math.acos(d), axis.normalize());
    }

    // Linear interpolation of the parallel t/x/y/z arrays at mission time t (km).
    private sample(data: any, t: number): vec3 {
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

    private phaseAt(t: number): string {
        const flyby = ArtemisOrbit.FLYBY_SEC;
        const win = 43200.0; // ±12 h around closest approach
        if (t < flyby - win) return "Outbound transit";
        if (t <= flyby + win) return "Lunar flyby";
        if (t >= this.duration - 21600.0) return "Entry interface approach";
        return "Return transit";
    }

    private formatMET(t: number): string {
        let s = Math.max(0, Math.floor(t));
        const d = Math.floor(s / 86400);
        s -= d * 86400;
        const h = Math.floor(s / 3600);
        s -= h * 3600;
        const m = Math.floor(s / 60);
        s -= m * 60;
        return "T+" + d + "d " + this.pad(h) + ":" + this.pad(m) + ":" + this.pad(s);
    }

    // Absolute UTC = epoch (startUTC) + MET. The mission spans Apr 2-10 2026, so
    // only the day rolls over (no month/year boundary handling needed here).
    private formatUTC(met: number): string {
        const iso = ARTEMIS_II_TRAJECTORY.startUTC; // 2026-04-02T01:57:37.084
        const dp = iso.split("T")[0].split("-");
        const tp = iso.split("T")[1].split(":");
        const year = dp[0];
        const month = dp[1];
        const day0 = parseInt(dp[2], 10);
        const h0 = parseInt(tp[0], 10);
        const m0 = parseInt(tp[1], 10);
        const s0 = parseInt(tp[2], 10);
        let total = h0 * 3600 + m0 * 60 + s0 + Math.max(0, Math.floor(met));
        const dayOff = Math.floor(total / 86400);
        total -= dayOff * 86400;
        const h = Math.floor(total / 3600);
        total -= h * 3600;
        const m = Math.floor(total / 60);
        total -= m * 60;
        return year + "-" + month + "-" + this.pad(day0 + dayOff) + " " +
            this.pad(h) + ":" + this.pad(m) + ":" + this.pad(total) + " UTC";
    }

    private pad(n: number): string {
        return (n < 10 ? "0" : "") + n;
    }

    private setVisible(on: boolean): void {
        if (this.moonObject) this.moonObject.enabled = on;
        if (this.spacecraftObject) this.spacecraftObject.enabled = on;
    }

    private clamp(v: number, lo: number, hi: number): number {
        return Math.max(lo, Math.min(hi, v));
    }
}
