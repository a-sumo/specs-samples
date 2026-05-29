// SnapToStage.ts
// Binds a plane-based chapter to the shared StageCalibration anchor. The PLANE
// lands on the calibrated surface; the rest of the assembly keeps its relative
// pose (single rigid move of the root). No detection of its own.
//
// Public API (call from menu buttons / chapter logic):
//   snap()              -> force re-snap to the current anchor
//   setOffset(vec3)     -> change the surface-local offset and re-snap (modify)
//   setHeight(number)   -> change only the +Y lift and re-snap (modify)
//   show() / hide()     -> enable/disable this chapter's content
//   isShown()           -> bool
//
// Auto-snaps whenever the anchor is (re)calibrated and the first time its
// chapter activates (OnStartEvent fires on first enable).

import { StageCalibration } from "./StageCalibration";

@component
export class SnapToStage extends BaseScriptComponent {
    @input
    @hint("Root that moves (carries the plane + content); internal layout preserved.")
    placementRoot: SceneObject;

    @input
    @hint("The plane that should land flat on the calibrated surface.")
    planeObject: SceneObject;

    @input
    @hint("Offset in surface-local space applied after snapping (+Y lifts the plane).")
    offset: vec3 = vec3.zero();

    @input
    @allowUndefined
    @hint("Object toggled by show()/hide(). Defaults to placementRoot.")
    contentRoot: SceneObject = null as any;

    @input
    @hint("Re-snap automatically whenever the anchor is (re)calibrated.")
    autoSnap: boolean = true;

    private boundSnap: () => void = () => {
        if (this.autoSnap) this.snap();
    };

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.register());
    }

    onDestroy(): void {
        const cal = StageCalibration.getInstance();
        if (cal) cal.unsubscribe(this.boundSnap);
    }

    private register(): void {
        const cal = StageCalibration.getInstance();
        if (!cal) {
            print("SnapToStage: no StageCalibration found in scene");
            return;
        }
        cal.subscribe(this.boundSnap);
        if (cal.isCalibrated() && this.autoSnap) this.snap();
    }

    // ---- modify --------------------------------------------------------

    /** Change the surface-local offset and re-snap. */
    public setOffset(offset: vec3): void {
        this.offset = offset;
        this.snap();
    }

    /** Change only the vertical lift off the surface and re-snap. */
    public setHeight(height: number): void {
        this.offset = new vec3(this.offset.x, height, this.offset.z);
        this.snap();
    }

    // ---- show / hide ---------------------------------------------------

    public show(): void {
        this.target().enabled = true;
    }
    public hide(): void {
        this.target().enabled = false;
    }
    public isShown(): boolean {
        return this.target().enabled;
    }

    private target(): SceneObject {
        return this.contentRoot ? this.contentRoot : this.placementRoot;
    }

    // ---- snap ----------------------------------------------------------

    /** Rigidly move the root so the plane lands on the current anchor. */
    public snap(): void {
        const cal = StageCalibration.getInstance();
        if (!cal || !cal.isCalibrated() || !this.placementRoot || !this.planeObject) return;

        const pos = cal.getAnchorPosition();
        const rot = cal.getAnchorRotation();
        const root = this.placementRoot.getTransform();
        const plane = this.planeObject.getTransform();

        const target = pos.add(rot.multiplyVec3(this.offset));
        const deltaRot = rot.multiply(plane.getWorldRotation().invert());
        const arm = root.getWorldPosition().sub(plane.getWorldPosition());

        root.setWorldRotation(deltaRot.multiply(root.getWorldRotation()));
        root.setWorldPosition(target.add(deltaRot.multiplyVec3(arm)));
    }
}
