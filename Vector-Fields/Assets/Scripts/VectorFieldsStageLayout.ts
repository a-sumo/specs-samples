// VectorFieldsStageLayout.ts
// Owns the default physical placement for the Vector Fields story examples.

@component
export class VectorFieldsStageLayout extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Motion/advection field root. Falls back to Motion Field Root by name.")
    motionFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Gravity field root. Falls back to Gravity Field Root by name.")
    gravityFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Wind globe root. Falls back to Globe Calibration by name.")
    windGlobeRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Magnetic field root. Falls back to Magnetic Field Root by name.")
    magneticFieldRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Chapter guide root. Falls back to Story Chapter Guide UI by name.")
    menuRoot: SceneObject = null as any;

    @input
    @hint("Apply the authored layout at startup.")
    applyOnStart: boolean = false;

    @input
    @hint("Keep applying for a brief startup window so older setup scripts settle first.")
    settleSeconds: number = 1.25;

    @input
    @hint("Floor height relative to the head/camera anchor, in centimeters.")
    floorY: number = -112.0;

    @input
    @hint("Default forward distance for floor fields, in centimeters.")
    floorZ: number = -118.0;

    @input
    @hint("Head-relative height for the 2D motion plane. This is a front display, not a floor plane.")
    motionFrontY: number = -3.0;

    @input
    @hint("Head-relative forward distance for the 2D motion plane.")
    motionFrontZ: number = -50.0;

    @input
    @hint("Chest/head height for hand-rotated examples, in centimeters.")
    handLevelY: number = -6.0;

    @input
    @hint("Default forward distance for hand-rotated examples, in centimeters.")
    handLevelZ: number = -72.0;

    @input
    @hint("Horizontal spacing between hand-level wind and magnetic examples.")
    handLevelSpacing: number = 42.0;

    @input
    @hint("Fallback menu distance when Follow is off.")
    menuZ: number = -68.0;

    @input
    @hint("Fallback menu height when Follow is off.")
    menuY: number = -16.0;

    @input
    @hint("Apply scale presets with the positions.")
    applyScales: boolean = true;

    private elapsed: number = 0.0;
    private startEventRef: any = null;
    private updateEventRef: any = null;

    onAwake(): void {
        this.startEventRef = this.createEvent("OnStartEvent");
        this.startEventRef.bind(() => {
            this.elapsed = 0.0;
            if (this.applyOnStart) this.applyLayout();
        });
        this.updateEventRef = this.createEvent("UpdateEvent");
        this.updateEventRef.bind(() => this.onUpdate());
    }

    public applyLayout(): void {
        this.applyLayoutInternal(true);
    }

    private applyLayoutInternal(includeMenu: boolean): void {
        const motion = this.motionFieldRoot || this.findObjectByName("Motion Field Root");
        const gravity = this.gravityFieldRoot || this.findObjectByName("Gravity Field Root");
        const wind = this.windGlobeRoot || this.findObjectByName("Globe Calibration");
        const magnetic = this.magneticFieldRoot || this.findObjectByName("Magnetic Field Root");

        this.place(motion, new vec3(0.0, this.motionFrontY, this.motionFrontZ), this.motionPlaneRotation(), new vec3(1.0, 1.0, 1.0));
        this.place(gravity, new vec3(0.0, this.floorY, this.floorZ), quat.quatIdentity(), new vec3(1.0, 1.0, 1.0));
        this.place(wind, new vec3(-this.handLevelSpacing * 0.5, this.handLevelY, this.handLevelZ), quat.quatIdentity(), new vec3(1.0, 1.0, 1.0));
        this.place(magnetic, new vec3(this.handLevelSpacing * 0.5, this.handLevelY, this.handLevelZ), quat.quatIdentity(), new vec3(1.0, 1.0, 1.0));
        if (includeMenu) {
            const menu = this.menuRoot || this.findObjectByName("Story Chapter Guide UI");
            this.place(menu, new vec3(0.0, this.menuY, this.menuZ), quat.quatIdentity(), new vec3(1.0, 1.0, 1.0));
        }
    }

    private onUpdate(): void {
        if (!this.applyOnStart) return;
        if (this.elapsed > this.settleSeconds) return;
        this.elapsed += getDeltaTime();
        this.applyLayoutInternal(false);
    }

    private place(object: SceneObject | null, position: vec3, rotation: quat, scale: vec3): void {
        if (!object) return;
        const tr = object.getTransform();
        tr.setLocalPosition(position);
        tr.setLocalRotation(rotation);
        if (this.applyScales) {
            tr.setLocalScale(scale);
        }
    }

    private motionPlaneRotation(): quat {
        return quat.angleAxis(Math.PI * 0.5, new vec3(1.0, 0.0, 0.0));
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
}
