// StageCalibration.ts
// One shared surface calibration for the whole experience, driven by the menu.
//
// Public API (call from menu buttons / chapter logic):
//   StageCalibration.getInstance()
//     .calibrate()            -> engage the detection UX (grid/reticle), store anchor, re-snap all
//     .calibrateIfNeeded()    -> calibrate only if not already calibrated
//     .cancelCalibration()    -> abort an in-progress calibration
//     .recalibrate()          -> alias of calibrate()
//     .setPlacementMode(m)    -> 0 Horizontal | 1 Vertical | 2 Tabletop (applies next calibrate)
//     .isCalibrated()         -> bool
//     .isCalibrating()        -> bool
//     .getAnchorPosition()    -> vec3
//     .getAnchorRotation()    -> quat
//     .subscribe(cb)/.unsubscribe(cb) -> fired after each successful calibration
//
// SnapToStage components subscribe to this and reposition their plane onto the
// shared anchor; the menu can also subscribe to know when calibration completes.

import { SurfacePlacementController } from "SurfacePlacement.lspkg/Scripts/SurfacePlacementController";
import { PlacementMode, PlacementSettings } from "SurfacePlacement.lspkg/Scripts/PlacementSettings";

@component
export class StageCalibration extends BaseScriptComponent {
    @input
    @hint("Run calibration automatically at lens start. Leave OFF for menu-driven flows.")
    calibrateOnStart: boolean = false;

    @input
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Horizontal (floor)", 0),
            new ComboBoxItem("Vertical (wall)", 1),
            new ComboBoxItem("Tabletop (near surface)", 2),
        ])
    )
    @hint("Surface type used for calibration.")
    placementMode: number = 0;

    private static instance: StageCalibration = null as any;

    private calibrated: boolean = false;
    private calibrating: boolean = false;
    private anchorPos: vec3 = vec3.zero();
    private anchorRot: quat = quat.fromEulerAngles(0, 0, 0);
    private subscribers: Array<() => void> = [];

    static getInstance(): StageCalibration {
        return StageCalibration.instance;
    }

    onAwake(): void {
        StageCalibration.instance = this;
        if (this.calibrateOnStart) {
            this.createEvent("OnStartEvent").bind(() => this.calibrate());
        }
    }

    // ---- engage --------------------------------------------------------

    /** Engage the detection UX; on confirm, store the anchor and re-snap all subscribers. */
    public calibrate(): void {
        if (this.calibrating) return;
        this.calibrating = true;
        SurfacePlacementController.getInstance().startSurfacePlacement(
            new PlacementSettings(this.toMode(this.placementMode)),
            (pos: vec3, rot: quat) => {
                this.anchorPos = pos;
                this.anchorRot = rot;
                this.calibrated = true;
                this.calibrating = false;
                this.notify();
            }
        );
    }

    /** Alias kept for readability at call sites. */
    public recalibrate(): void {
        this.calibrate();
    }

    /** Calibrate only if we don't already have an anchor. */
    public calibrateIfNeeded(): void {
        if (!this.calibrated && !this.calibrating) this.calibrate();
    }

    /** Abort a calibration that is currently in progress. */
    public cancelCalibration(): void {
        if (!this.calibrating) return;
        SurfacePlacementController.getInstance().stopSurfacePlacement();
        this.calibrating = false;
    }

    // ---- modify --------------------------------------------------------

    /** Set the surface type for the next calibration (0 Horizontal | 1 Vertical | 2 Tabletop). */
    public setPlacementMode(mode: number): void {
        this.placementMode = mode;
    }

    // ---- query ---------------------------------------------------------

    public isCalibrated(): boolean {
        return this.calibrated;
    }
    public isCalibrating(): boolean {
        return this.calibrating;
    }
    public getAnchorPosition(): vec3 {
        return this.anchorPos;
    }
    public getAnchorRotation(): quat {
        return this.anchorRot;
    }

    // ---- subscriptions -------------------------------------------------

    /** Invoked after every successful calibration (used by SnapToStage + the menu). */
    public subscribe(callback: () => void): void {
        if (callback && this.subscribers.indexOf(callback) < 0) {
            this.subscribers.push(callback);
        }
    }
    public unsubscribe(callback: () => void): void {
        const i = this.subscribers.indexOf(callback);
        if (i >= 0) this.subscribers.splice(i, 1);
    }

    private notify(): void {
        for (let i = 0; i < this.subscribers.length; i++) this.subscribers[i]();
    }

    private toMode(index: number): PlacementMode {
        if (index === 1) return PlacementMode.VERTICAL;
        if (index === 2) return PlacementMode.NEAR_SURFACE;
        return PlacementMode.HORIZONTAL;
    }
}
