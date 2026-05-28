// GlobeSurfaceRotator.ts
// Trackball-style surface drag for SIK Interactable globes.

@component
export class GlobeSurfaceRotator extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Object to rotate. Defaults to this SceneObject.")
    targetObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Object with the SIK Interactable. Defaults to this SceneObject.")
    interactableObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional object containing GravityField. If set, drag is composed with Earth tilt/spin.")
    gravityFieldObject: SceneObject = null as any;

    @input
    @hint("Enables touch/hand/mouse drag rotation.")
    enabled: boolean = true;

    @input
    @widget(new SliderWidget(0.15, 2.5, 0.05))
    @hint("Multiplier for surface-drag rotation.")
    sensitivity: number = 1.0;

    @input
    @widget(new SliderWidget(2.0, 35.0, 1.0))
    @hint("Maximum degrees of rotation accepted per frame.")
    maxStepDegrees: number = 16.0;

    @input
    @widget(new SliderWidget(0.0, 0.4, 0.01))
    @hint("How much momentum remains after release.")
    inertiaStrength: number = 0.08;

    @input
    @widget(new SliderWidget(1.0, 16.0, 0.25))
    @hint("Higher values stop release momentum faster.")
    inertiaDamping: number = 8.0;

    @input
    @widget(new SliderWidget(0.01, 0.45, 0.01))
    @hint("Fallback rotation scale when no surface hit point is available.")
    fallbackDragRadiansPerCm: number = 0.12;

    private targetTransform: Transform | null = null;
    private interactable: any = null;
    private gravityApi: any = null;
    private dragging: boolean = false;
    // Trackball math runs in WORLD space relative to the globe center. Using the
    // object's local frame feeds the applied rotation back into the next
    // measurement (the local frame rotates with the object), which makes the
    // rotation cancel itself out. World-space directions depend only on the
    // cursor and the sphere silhouette, so there is no feedback.
    private lastWorldDirection: vec3 | null = null;
    private inertiaAxis: vec3 = vec3.up();
    private inertiaSpeed: number = 0.0;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bindInteractable());
        this.createEvent("UpdateEvent").bind(() => this.updateInertia());
    }

    private bindInteractable(): void {
        const target = this.targetObject ? this.targetObject : this.sceneObject;
        const owner = this.interactableObject ? this.interactableObject : this.sceneObject;
        this.targetObject = target;
        this.interactableObject = owner;
        this.targetTransform = target.getTransform();
        this.gravityApi = this.findGravityApi();
        this.interactable = this.findInteractable(owner);

        if (!this.interactable) {
            print("GlobeSurfaceRotator: add a SIK Interactable and ColliderComponent to " + owner.name);
            return;
        }

        this.addEventListener(this.interactable.onTriggerStart, (event: any) => this.beginDrag(event));
        this.addEventListener(this.interactable.onTriggerUpdate, (event: any) => this.updateSurfaceDrag(event));
        this.addEventListener(this.interactable.onDragUpdate, (event: any) => this.updateFallbackDrag(event));
        this.addEventListener(this.interactable.onTriggerEnd, () => this.endDrag());
        this.addEventListener(this.interactable.onTriggerEndOutside, () => this.endDrag());
        this.addEventListener(this.interactable.onTriggerCanceled, () => this.endDrag());
    }

    private beginDrag(event: any): void {
        if (!this.enabled) return;
        this.gravityApi = this.findGravityApi();
        this.dragging = true;
        this.inertiaSpeed = 0.0;
        this.lastWorldDirection = this.hitWorldDirection(event);
    }

    private updateSurfaceDrag(event: any): void {
        if (!this.enabled || !this.dragging) return;
        const nextDirection = this.hitWorldDirection(event);
        if (!nextDirection) return;
        this.applySurfaceDirection(nextDirection);
    }

    private updateFallbackDrag(event: any): void {
        if (!this.enabled || !this.dragging) return;
        if (this.hitWorldDirection(event)) return;

        const drag = this.eventDragVector(event);
        if (!drag || drag.length < 0.0001 || !this.targetTransform) return;

        // Fallback when the cursor is off the sphere: spin around world axes
        // using the world-space drag vector. Horizontal drag yaws around world
        // up, vertical drag pitches around world right.
        const scale = Math.max(0.0, this.fallbackDragRadiansPerCm) * Math.max(0.0, this.sensitivity);
        const yaw = quat.angleAxis(-drag.x * scale, vec3.up());
        const pitch = quat.angleAxis(drag.y * scale, vec3.right());
        const delta = yaw.multiply(pitch);
        delta.normalize();
        this.applyRotationDelta(delta);
    }

    private endDrag(): void {
        this.dragging = false;
        this.lastWorldDirection = null;
        this.inertiaSpeed *= Math.max(0.0, Math.min(1.0, this.inertiaStrength));
    }

    private updateInertia(): void {
        if (!this.enabled || this.dragging || this.inertiaSpeed <= 0.001) return;
        const dt = Math.max(0.001, getDeltaTime());
        const maxStep = this.degToRad(Math.max(1.0, this.maxStepDegrees));
        const step = Math.min(maxStep, this.inertiaSpeed * dt);
        const delta = quat.angleAxis(step, this.inertiaAxis);
        delta.normalize();
        this.applyRotationDelta(delta);
        this.inertiaSpeed *= Math.exp(-Math.max(0.0, this.inertiaDamping) * dt);
    }

    private applySurfaceDirection(nextDirection: vec3): void {
        if (!this.lastWorldDirection) {
            this.lastWorldDirection = nextDirection;
            return;
        }

        const fromDirection = this.lastWorldDirection;
        const dot = this.clamp(fromDirection.dot(nextDirection), -1.0, 1.0);
        let angle = Math.acos(dot);
        if (angle < 0.0001) {
            this.lastWorldDirection = nextDirection;
            return;
        }

        let axis = fromDirection.cross(nextDirection);
        if (axis.length < 0.0001) {
            this.lastWorldDirection = nextDirection;
            return;
        }

        axis = axis.normalize();
        angle *= Math.max(0.0, this.sensitivity);
        angle = Math.min(angle, this.degToRad(Math.max(1.0, this.maxStepDegrees)));

        // Axis and angle are in world space; apply as a world-space delta.
        const delta = quat.angleAxis(angle, axis);
        delta.normalize();
        this.applyRotationDelta(delta);

        this.inertiaAxis = axis;
        this.inertiaSpeed = angle / Math.max(0.001, getDeltaTime());
        // After rotating, the grabbed point now sits at nextDirection in world
        // space, so this is the correct reference for the next frame.
        this.lastWorldDirection = nextDirection;
    }

    private applyRotationDelta(delta: quat): void {
        if (!delta) return;
        if (this.gravityApi && typeof this.gravityApi.applyEarthManualRotation === "function") {
            this.gravityApi.applyEarthManualRotation(delta);
            return;
        }
        if (!this.targetTransform) return;
        // delta is a world-space rotation, so pre-multiply the world rotation.
        const next = delta.multiply(this.targetTransform.getWorldRotation());
        next.normalize();
        this.targetTransform.setWorldRotation(next);
    }

    private hitWorldDirection(event: any): vec3 | null {
        if (!event || !event.interactor || !event.interactor.targetHitInfo || !this.targetTransform) return null;
        const hitInfo = event.interactor.targetHitInfo;
        if (!hitInfo.hit || !hitInfo.hit.position) return null;
        // Direction from the globe center (collider/transform origin) to the
        // surface hit point, in world space.
        const dir = hitInfo.hit.position.sub(this.targetTransform.getWorldPosition());
        if (dir.length < 0.0001) return null;
        return dir.normalize();
    }

    private eventDragVector(event: any): vec3 | null {
        if (!event) return null;
        if (event.planecastDragVector) return event.planecastDragVector;
        if (event.dragVector) return event.dragVector;
        if (event.interactor && event.interactor.planecastDragVector) return event.interactor.planecastDragVector;
        if (event.interactor && event.interactor.currentDragVector) return event.interactor.currentDragVector;
        return null;
    }

    private findGravityApi(): any {
        if (this.gravityFieldObject) {
            const api = this.findGravityApiOnObject(this.gravityFieldObject);
            if (api) return api;
        }

        let object: SceneObject | null = this.targetObject ? this.targetObject : this.sceneObject;
        for (let depth = 0; object && depth < 12; depth++) {
            const api = this.findGravityApiOnObject(object);
            if (api) return api;
            object = object.getParent();
        }
        return null;
    }

    private findGravityApiOnObject(object: SceneObject): any {
        const scripts = object.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate && candidate.gravityApi) return candidate.gravityApi;
        }
        return null;
    }

    private findInteractable(object: SceneObject): any {
        const scripts = object.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (
                candidate &&
                candidate.onTriggerStart &&
                candidate.onTriggerUpdate &&
                typeof candidate.onTriggerStart.add === "function"
            ) {
                return candidate;
            }
        }
        return null;
    }

    private addEventListener(event: any, callback: (event: any) => void): void {
        if (!event) return;
        if (typeof event.add === "function") {
            event.add(callback);
        } else if (typeof event === "function") {
            event(callback);
        }
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.max(minValue, Math.min(maxValue, value));
    }

    private degToRad(degrees: number): number {
        return degrees * Math.PI / 180.0;
    }
}
