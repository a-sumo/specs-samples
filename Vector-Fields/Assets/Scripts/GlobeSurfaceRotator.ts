// GlobeSurfaceRotator.ts
// Trackball-style surface drag for SIK Interactable globes.
//
// Dynamics model: drag feeds a TARGET angular velocity (world-space rad/s).
// The actual angular velocity eases toward it with a time-constant filter
// (noise reduction), and the rotation is integrated from that smoothed
// velocity every frame. On release the velocity decays exponentially
// (gradual slowdown / inertia). Optional auto-level eases the polar axis
// back to vertical so latitude lines settle horizontal, and returnToRest()
// eases the whole globe back to its starting orientation.

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
    @widget(new SliderWidget(0.0, 0.3, 0.01))
    @hint("Smoothing time constant (seconds). Higher = smoother / less jitter but more lag. 0 = raw.")
    smoothingTime: number = 0.08;

    @input
    @widget(new SliderWidget(2.0, 60.0, 1.0))
    @hint("Maximum degrees of rotation accepted per frame (clamps spikes).")
    maxStepDegrees: number = 24.0;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Fraction of spin velocity kept when you let go (momentum). 0 = stop instantly.")
    inertiaStrength: number = 0.7;

    @input
    @widget(new SliderWidget(0.5, 16.0, 0.25))
    @hint("Higher values stop release momentum faster.")
    inertiaDamping: number = 3.5;

    @input
    @hint("After release, ease the polar axis back to vertical (latitude lines settle horizontal).")
    levelOnRelease: boolean = false;

    @input
    @widget(new SliderWidget(0.5, 8.0, 0.25))
    @hint("How fast auto-level eases the globe upright.")
    levelSpeed: number = 2.5;

    @input
    @widget(new SliderWidget(0.0, 10.0, 0.5))
    @hint("Seconds of no interaction before easing back to the start orientation. 0 = never.")
    autoReturnSeconds: number = 0.0;

    @input
    @widget(new SliderWidget(0.5, 8.0, 0.25))
    @hint("How fast returnToRest()/auto-return eases home.")
    returnSpeed: number = 3.0;

    @input
    @widget(new SliderWidget(0.01, 0.45, 0.01))
    @hint("Fallback rotation scale when no surface hit point is available.")
    fallbackDragRadiansPerCm: number = 0.12;

    @input
    @hint("Block spin about the world X axis (pitch / tilt up-down).")
    lockAxisX: boolean = false;

    @input
    @hint("Block spin about the world Y axis (yaw / horizontal spin).")
    lockAxisY: boolean = false;

    @input
    @hint("Block spin about the world Z axis (roll / sideways tumble).")
    lockAxisZ: boolean = false;

    private targetTransform: Transform | null = null;
    private interactable: any = null;
    private gravityApi: any = null;
    private proxyApi: any = null;
    private dragging: boolean = false;

    // Trackball math runs in WORLD space relative to the globe center. Using the
    // object's local frame would feed the applied rotation back into the next
    // measurement (the local frame rotates with the object), cancelling itself
    // out. World-space directions depend only on the cursor and the sphere
    // silhouette, so there is no feedback.
    private lastWorldDirection: vec3 | null = null;

    // World-space angular velocity (axis * rad/s), encoded as a rotation vector.
    private angularVelocity: vec3 = vec3.zero();
    private targetVelocity: vec3 = vec3.zero();
    private hasFreshInput: boolean = false;

    // Rest pose + idle/return state.
    private homeRotation: quat | null = null;
    private returning: boolean = false;
    private idleTime: number = 0.0;

    private static readonly POLE_LOCAL: vec3 = vec3.up();

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bindInteractable());
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private bindInteractable(): void {
        const target = this.targetObject ? this.targetObject : this.sceneObject;
        const owner = this.interactableObject ? this.interactableObject : this.sceneObject;
        this.targetObject = target;
        this.interactableObject = owner;
        this.targetTransform = target.getTransform();
        this.homeRotation = this.targetTransform.getWorldRotation();
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

    // ---- public UX hooks (wire to a button / gesture) --------------------

    /** Ease the globe back to the orientation it had at startup. */
    public returnToRest(): void {
        this.returning = true;
        this.dragging = false;
        this.angularVelocity = vec3.zero();
        this.targetVelocity = vec3.zero();
    }

    /** Capture the current orientation as the new rest pose. */
    public setRestHere(): void {
        if (this.targetTransform) this.homeRotation = this.targetTransform.getWorldRotation();
    }

    // ---- axis locks (wire to buttons) ------------------------------------

    /** Block spin about each world axis. Free rotation = (false, false, false). */
    public setAxisLock(x: boolean, y: boolean, z: boolean): void {
        this.lockAxisX = x;
        this.lockAxisY = y;
        this.lockAxisZ = z;
    }

    /** Remove all locks: rotate freely in every direction. */
    public unlockAll(): void {
        this.setAxisLock(false, false, false);
    }

    /** Allow only horizontal spin (about world up) — like a desk globe. */
    public lockToVerticalSpin(): void {
        this.setAxisLock(true, false, true);
    }

    /** Toggle between vertical-spin-only and fully free. */
    public toggleVerticalSpin(): void {
        const spinOnly = this.lockAxisX && this.lockAxisZ && !this.lockAxisY;
        if (spinOnly) this.unlockAll(); else this.lockToVerticalSpin();
    }

    /** Toggle the sideways roll/tumble lock, leaving yaw + pitch free. */
    public toggleRollLock(): void {
        this.lockAxisZ = !this.lockAxisZ;
    }

    // ---- drag input ------------------------------------------------------

    private beginDrag(event: any): void {
        if (!this.enabled) return;
        this.deactivateProxyForContentInteraction();
        this.gravityApi = this.findGravityApi();
        this.dragging = true;
        this.returning = false;
        this.idleTime = 0.0;
        this.angularVelocity = vec3.zero();
        this.targetVelocity = vec3.zero();
        this.hasFreshInput = false;
        this.lastWorldDirection = this.hitWorldDirection(event);
    }

    private updateSurfaceDrag(event: any): void {
        if (!this.enabled || !this.dragging) return;
        const nextDirection = this.hitWorldDirection(event);
        if (!nextDirection) return;
        this.feedSurfaceDirection(nextDirection);
    }

    private updateFallbackDrag(event: any): void {
        if (!this.enabled || !this.dragging) return;
        if (this.hitWorldDirection(event)) return; // surface path owns this frame

        const drag = this.eventDragVector(event);
        if (!drag || drag.length < 0.0001) return;

        // Off-sphere fallback: yaw around world up, pitch around world right.
        const scale = Math.max(0.0, this.fallbackDragRadiansPerCm) * Math.max(0.0, this.sensitivity);
        const rotationVector = vec3.up().uniformScale(-drag.x * scale)
            .add(vec3.right().uniformScale(drag.y * scale));
        const dt = Math.max(0.001, getDeltaTime());
        this.targetVelocity = rotationVector.uniformScale(1.0 / dt);
        this.hasFreshInput = true;
    }

    private endDrag(): void {
        if (!this.dragging) return;
        this.dragging = false;
        this.lastWorldDirection = null;
        this.idleTime = 0.0;
        // Keep a fraction of the smoothed velocity as release momentum.
        this.angularVelocity = this.angularVelocity.uniformScale(this.clamp(this.inertiaStrength, 0.0, 1.0));
    }

    // Convert the latest surface hit into a target angular velocity.
    private feedSurfaceDirection(nextDirection: vec3): void {
        const from = this.lastWorldDirection;
        this.lastWorldDirection = nextDirection;
        if (!from) return;

        const dot = this.clamp(from.dot(nextDirection), -1.0, 1.0);
        const angle = Math.acos(dot) * Math.max(0.0, this.sensitivity);
        let axis = from.cross(nextDirection);
        if (angle < 0.00001 || axis.length < 0.00001) {
            // Cursor effectively still: target zero so the spin eases to a stop.
            this.targetVelocity = vec3.zero();
            this.hasFreshInput = true;
            return;
        }
        axis = axis.normalize();
        const dt = Math.max(0.001, getDeltaTime());
        this.targetVelocity = axis.uniformScale(angle / dt);
        this.hasFreshInput = true;
    }

    // ---- per-frame integration ------------------------------------------

    private onUpdate(): void {
        if (!this.enabled || !this.targetTransform) return;
        const dt = Math.max(0.001, getDeltaTime());

        if (this.dragging) {
            const target = this.hasFreshInput ? this.targetVelocity : vec3.zero();
            this.hasFreshInput = false;
            const k = this.smoothingTime > 0.0001 ? 1.0 - Math.exp(-dt / this.smoothingTime) : 1.0;
            this.angularVelocity = this.lerpVec(this.angularVelocity, target, k);
            this.integrate(dt);
            this.idleTime = 0.0;
            return;
        }

        // Released: carry momentum, then decay it.
        this.integrate(dt);
        this.angularVelocity = this.angularVelocity.uniformScale(Math.exp(-Math.max(0.0, this.inertiaDamping) * dt));
        this.idleTime += dt;

        if (this.returning) {
            this.stepReturn(dt);
            return;
        }
        if (this.levelOnRelease) {
            this.stepLevel(dt);
        }
        if (this.autoReturnSeconds > 0.0 && this.idleTime >= this.autoReturnSeconds) {
            this.returning = true;
        }
    }

    private integrate(dt: number): void {
        // Constrain the spin to the unlocked world axes.
        if (this.lockAxisX || this.lockAxisY || this.lockAxisZ) {
            this.angularVelocity = new vec3(
                this.lockAxisX ? 0.0 : this.angularVelocity.x,
                this.lockAxisY ? 0.0 : this.angularVelocity.y,
                this.lockAxisZ ? 0.0 : this.angularVelocity.z
            );
        }
        const speed = this.angularVelocity.length;
        if (speed < 0.00001) return;
        let angle = speed * dt;
        const maxStep = this.degToRad(Math.max(1.0, this.maxStepDegrees));
        if (angle > maxStep) angle = maxStep;
        const axis = this.angularVelocity.uniformScale(1.0 / speed);
        this.applyRotationDelta(quat.angleAxis(angle, axis));
    }

    // Ease the polar axis toward world-up; preserves azimuth + horizontal spin.
    private stepLevel(dt: number): void {
        if (!this.targetTransform) return;
        const rotation = this.targetTransform.getWorldRotation();
        const poleLocal = GlobeSurfaceRotator.POLE_LOCAL;
        const pole = rotation.multiplyVec3(poleLocal).normalize();
        const up = vec3.up();
        const dot = this.clamp(pole.dot(up), -1.0, 1.0);
        const tilt = Math.acos(dot);
        if (tilt < this.degToRad(0.4)) return;

        let axis = pole.cross(up);
        // Pole pointing straight down: any horizontal axis works.
        axis = axis.length < 0.00001 ? vec3.right() : axis.normalize();
        const k = 1.0 - Math.exp(-Math.max(0.0, this.levelSpeed) * dt);
        this.applyRotationDelta(quat.angleAxis(tilt * k, axis));
    }

    private stepReturn(dt: number): void {
        if (!this.targetTransform || !this.homeRotation) {
            this.returning = false;
            return;
        }
        const rotation = this.targetTransform.getWorldRotation();
        const k = 1.0 - Math.exp(-Math.max(0.0, this.returnSpeed) * dt);
        const next = quat.slerp(rotation, this.homeRotation, k);
        this.targetTransform.setWorldRotation(next);

        const closeness = Math.abs(this.clamp(rotation.dot(this.homeRotation), -1.0, 1.0));
        const remaining = 2.0 * Math.acos(closeness);
        if (remaining < this.degToRad(0.4)) {
            this.targetTransform.setWorldRotation(this.homeRotation);
            this.returning = false;
        }
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

    private deactivateProxyForContentInteraction(): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (!api) return;
        try {
            if (typeof api.deactivateForContentInteraction === "function") {
                api.deactivateForContentInteraction();
            } else if (typeof api.notifyContentInteractionStart === "function") {
                api.notifyContentInteractionStart();
            } else if (typeof api.setActive === "function") {
                api.setActive(false);
            } else if (typeof api.cancelAndDock === "function") {
                api.cancelAndDock();
            }
        } catch (e) {}
    }

    private findProxyApi(): any {
        const root = this.findObjectByName("ProxyInteractionPlane");
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (
                candidate &&
                (typeof candidate.deactivateForContentInteraction === "function" ||
                    typeof candidate.notifyContentInteractionStart === "function" ||
                    typeof candidate.setActive === "function" ||
                    typeof candidate.cancelAndDock === "function")
            ) {
                return candidate;
            }
        }
        return null;
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

    private addEventListener(event: any, callback: (event: any) => void): void {
        if (!event) return;
        if (typeof event.add === "function") {
            event.add(callback);
        } else if (typeof event === "function") {
            event(callback);
        }
    }

    private lerpVec(a: vec3, b: vec3, k: number): vec3 {
        return a.add(b.sub(a).uniformScale(k));
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.max(minValue, Math.min(maxValue, value));
    }

    private degToRad(degrees: number): number {
        return degrees * Math.PI / 180.0;
    }
}
