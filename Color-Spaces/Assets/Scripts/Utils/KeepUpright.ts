/**
 * KeepUpright.ts
 *
 * Attach to any SceneObject to maintain its rotation and scale
 * while allowing position to change freely (e.g., from parent transforms).
 */
@component
export class KeepUpright extends BaseScriptComponent {

    @input
    @hint("Lock rotation to initial value")
    lockRotation: boolean = true;

    @input
    @hint("Lock scale to initial value")
    lockScale: boolean = true;

    private transform: Transform;
    private initialRotation: quat;
    private initialScale: vec3;

    onAwake(): void {
        this.transform = this.sceneObject.getTransform();
        this.initialRotation = this.transform.getWorldRotation();
        this.initialScale = this.transform.getWorldScale();

        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private onUpdate(): void {
        if (this.lockRotation) {
            this.transform.setWorldRotation(this.initialRotation);
        }
        if (this.lockScale) {
            this.transform.setWorldScale(this.initialScale);
        }
    }

    /** Update the locked rotation to current */
    public setCurrentRotationAsDefault(): void {
        this.initialRotation = this.transform.getWorldRotation();
    }

    /** Update the locked scale to current */
    public setCurrentScaleAsDefault(): void {
        this.initialScale = this.transform.getWorldScale();
    }

    /** Set a specific rotation to lock to */
    public setLockedRotation(rotation: quat): void {
        this.initialRotation = rotation;
    }

    /** Set a specific scale to lock to */
    public setLockedScale(scale: vec3): void {
        this.initialScale = scale;
    }
}
