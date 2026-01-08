// MagnetPhysics.ts
// Simulates magnetic attraction/repulsion between two magnets
// Uses dipole-dipole interaction: opposite poles attract, like poles repel
// Forward vector (+X local) points from S to N pole (aligned with capsule axis)
// Shake either magnet to separate when stuck

@component
export class MagnetPhysics extends BaseScriptComponent {

    @input
    @hint("First magnet object")
    magnet1: SceneObject;

    @input
    @hint("Second magnet object")
    magnet2: SceneObject;

    @input
    @hint("Collider for first magnet (optional)")
    collider1: ColliderComponent;

    @input
    @hint("Collider for second magnet (optional)")
    collider2: ColliderComponent;

    @input
    @widget(new SliderWidget(10, 500, 10))
    @hint("Strength of magnetic force")
    forceStrength: number = 100.0;

    @input
    @widget(new SliderWidget(0.0, 10.0, 0.1))
    @hint("Velocity damping per second")
    damping: number = 2.0;

    @input
    @widget(new SliderWidget(0.1, 2.0, 0.1))
    @hint("Minimum distance to prevent extreme forces")
    minDistance: number = 0.3;

    @input
    @widget(new SliderWidget(2.0, 30.0, 1.0))
    @hint("Distance (cm) where force equals base strength - roughly magnet diameter")
    referenceDistance: number = 8.0;

    @input
    @widget(new SliderWidget(10.0, 200.0, 10.0))
    @hint("Maximum distance for force to apply")
    maxDistance: number = 100.0;

    @input
    @widget(new SliderWidget(0.5, 1.5, 0.1))
    @hint("Scale factor for collision radius (1.0 = exact collider size)")
    contactScale: number = 1.0;

    @input
    @widget(new SliderWidget(1, 100, 1))
    @hint("Maximum velocity to prevent flying off")
    maxVelocity: number = 20.0;

    @input
    @hint("Enable physics simulation")
    enabled: boolean = true;

    @input
    @widget(new SliderWidget(1, 50, 1))
    @hint("Impulse strength when shaking to separate")
    separationImpulse: number = 15.0;

    @input
    @widget(new SliderWidget(1, 20, 1))
    @hint("Shake acceleration threshold to trigger separation")
    shakeThreshold: number = 8.0;

    @input
    @widget(new SliderWidget(0.1, 1.0, 0.1))
    @hint("Cooldown between shake separations (seconds)")
    shakeCooldown: number = 0.3;

    @input
    @widget(new SliderWidget(0.0, 0.95, 0.05))
    @hint("Force smoothing (higher = smoother but slower)")
    forceSmoothing: number = 0.7;

    // Normalized default for force strength (0-1 maps to 1-500)
    public static readonly NORMALIZED_FORCE_DEFAULT: number = 0.2;

    // Physics state
    private velocity1 = vec3.zero();
    private velocity2 = vec3.zero();
    private smoothedForce = vec3.zero();
    private isStuck = false;
    private stickOffset = vec3.zero(); // Offset from magnet1 to magnet2 when stuck

    // Collision state
    private isColliding = false;
    private collisionNormal = vec3.zero();
    private overlapDepth = 0;

    // Manipulation tracking
    private wasManipulating1 = false;
    private wasManipulating2 = false;
    private lastPos1 = vec3.zero();
    private lastPos2 = vec3.zero();
    private lastManipVel1 = vec3.zero();
    private lastManipVel2 = vec3.zero();
    private lastSeparationTime = 0;

    onAwake(): void {
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

        if (this.magnet1) this.lastPos1 = this.getPosition(this.magnet1);
        if (this.magnet2) this.lastPos2 = this.getPosition(this.magnet2);

        this.setupCollisionEvents();
        print("MagnetPhysics: Initialized");
    }

    private setupCollisionEvents(): void {
        if (!this.collider1 || !this.collider2) return;

        this.collider1.onOverlapEnter.add((e: OverlapEnterEventArgs) => {
            if (e.overlap.collider === this.collider2) this.isColliding = true;
        });

        this.collider1.onOverlapStay.add((e: OverlapStayEventArgs) => {
            if (e.overlap.collider === this.collider2) {
                this.isColliding = true;
                this.updateCollisionInfo();
            }
        });

        this.collider1.onOverlapExit.add((e: OverlapExitEventArgs) => {
            if (e.overlap.collider === this.collider2) {
                this.isColliding = false;
                this.overlapDepth = 0;
            }
        });
    }

    private updateCollisionInfo(): void {
        const delta = this.getPosition(this.magnet2).sub(this.getPosition(this.magnet1));
        const distance = delta.length;

        this.collisionNormal = distance > 0.001 ? delta.normalize() : new vec3(0, 1, 0);

        const r1 = this.getColliderRadius(this.collider1);
        const r2 = this.getColliderRadius(this.collider2);
        this.overlapDepth = Math.max(0, r1 + r2 - distance);
    }

    private getColliderRadius(collider: ColliderComponent): number {
        const shape = collider?.shape;
        if (!shape) return 0.5;

        let radius = (shape as any).radius ?? 0.5;
        if ((shape as any).length !== undefined) {
            radius += (shape as any).length / 2;
        }
        return radius;
    }

    private getPosition(obj: SceneObject): vec3 {
        return obj.getTransform().getWorldPosition();
    }

    private setPosition(obj: SceneObject, pos: vec3): void {
        obj.getTransform().setWorldPosition(pos);
    }

    private getForwardVector(obj: SceneObject): vec3 {
        return obj.getTransform().getWorldRotation().multiplyVec3(new vec3(1, 0, 0));
    }

    private getCollisionRadius(obj: SceneObject): number {
        const scale = obj.getTransform().getWorldScale();
        return 0.5 * Math.max(scale.x, Math.max(scale.y, scale.z));
    }

    // Returns alignment: negative = attracting, positive = repelling
    private computeAlignment(): number {
        const pos1 = this.getPosition(this.magnet1);
        const pos2 = this.getPosition(this.magnet2);
        const delta = pos2.sub(pos1);
        const distance = delta.length;

        if (distance < 0.001) return -1; // Very close = attracting

        const direction = delta.normalize();
        const m1 = this.getForwardVector(this.magnet1);
        const m2 = this.getForwardVector(this.magnet2);

        const m1FacingM2 = m1.dot(direction);
        const m2FacingM1 = m2.dot(direction.uniformScale(-1));

        return m1FacingM2 * m2FacingM1;
    }

    private computeMagneticForce(): vec3 {
        if (!this.magnet1 || !this.magnet2) return vec3.zero();

        const pos1 = this.getPosition(this.magnet1);
        const pos2 = this.getPosition(this.magnet2);
        const delta = pos2.sub(pos1);
        const distance = delta.length;

        if (distance < 0.001 || distance > this.maxDistance) return vec3.zero();

        const direction = delta.normalize();
        const m1 = this.getForwardVector(this.magnet1);
        const m2 = this.getForwardVector(this.magnet2);

        const m1FacingM2 = m1.dot(direction);
        const m2FacingM1 = m2.dot(direction.uniformScale(-1));
        const alignment = m1FacingM2 * m2FacingM1;
        const axialAlignment = Math.abs(m1FacingM2) * Math.abs(m2FacingM1);

        const effectiveDistance = Math.max(distance, this.minDistance);
        // Normalize by reference distance: at referenceDistance, distanceFactor = 1
        const normalizedDist = effectiveDistance / this.referenceDistance;
        const distanceFactor = normalizedDist * normalizedDist * normalizedDist; // r³ falloff

        // Close-range boost for attraction only
        const isAttracting = alignment < 0;
        const proximityFactor = Math.max(0, 1.0 - effectiveDistance / 2.0);
        const closeRangeBoost = isAttracting ? (1.0 + 8.0 * proximityFactor * proximityFactor) : 1.0;

        const alignmentFactor = Math.max(0.3, Math.sqrt(axialAlignment));
        const maxForce = this.forceStrength * 5.0;
        const forceMagnitude = Math.min(
            this.forceStrength * alignmentFactor * closeRangeBoost / distanceFactor,
            maxForce
        );

        return direction.uniformScale(forceMagnitude * alignment);
    }

    private getContactDistance(): number {
        // Distance at which magnets should be in contact (touching)
        // contactScale lets you tune how close they need to be
        let baseDist: number;
        if (this.collider1 && this.collider2) {
            baseDist = this.getColliderRadius(this.collider1) + this.getColliderRadius(this.collider2);
        } else {
            baseDist = this.getCollisionRadius(this.magnet1) + this.getCollisionRadius(this.magnet2);
        }
        return baseDist * this.contactScale;
    }

    private handleCollision(): boolean {
        if (!this.magnet1 || !this.magnet2) return false;

        const pos1 = this.getPosition(this.magnet1);
        const pos2 = this.getPosition(this.magnet2);
        const delta = pos2.sub(pos1);
        const distance = delta.length;

        const contactDist = this.getContactDistance();
        const isClose = distance < contactDist * 1.02; // 2% tolerance - must be nearly touching

        // Check if magnets are close enough to potentially stick
        if (!isClose) {
            // Don't immediately unstick - only if we're far enough apart
            if (this.isStuck && distance < contactDist * 1.2) {
                // Still close, stay stuck
            } else {
                this.isStuck = false;
            }
            if (!this.isStuck) return false;
        }

        const normal = distance > 0.001 ? delta.normalize() : new vec3(0, 1, 0);
        const overlap = contactDist - distance;

        // Separate if overlapping
        if (overlap > 0) {
            const separation = normal.uniformScale(overlap * 0.5);
            this.setPosition(this.magnet1, pos1.sub(separation));
            this.setPosition(this.magnet2, pos2.add(separation));
        }

        const attracting = this.computeAlignment() < 0;

        if (attracting) {
            // Stick together - save the offset so we can maintain it
            if (!this.isStuck) {
                // Just became stuck - record the offset
                const newPos1 = this.getPosition(this.magnet1);
                const newPos2 = this.getPosition(this.magnet2);
                this.stickOffset = newPos2.sub(newPos1);
            }
            this.isStuck = true;
            this.velocity1 = vec3.zero();
            this.velocity2 = vec3.zero();
        } else {
            // Repelling - bounce apart
            this.isStuck = false;
            const relativeVel = this.velocity2.sub(this.velocity1);
            const velAlongNormal = relativeVel.dot(normal);

            if (velAlongNormal < 0) {
                // Apply repulsion impulse
                const repulsionStrength = Math.max(1.0, Math.abs(velAlongNormal));
                const impulse = normal.uniformScale(repulsionStrength);
                this.velocity1 = this.velocity1.sub(impulse);
                this.velocity2 = this.velocity2.add(impulse);
            }
        }

        return true;
    }

    private isBeingManipulated(obj: SceneObject, lastPos: vec3, velocity: vec3): boolean {
        const currentPos = this.getPosition(obj);
        const expectedPos = lastPos.add(velocity.uniformScale(getDeltaTime()));
        return currentPos.sub(expectedPos).length > 0.01;
    }

    private checkShakeSeparation(currentVel: vec3, lastVel: vec3, isManipulating: boolean): boolean {
        if (!isManipulating) return false;

        const now = getTime();
        if (now - this.lastSeparationTime < this.shakeCooldown) return false;

        const dt = getDeltaTime();
        if (dt <= 0) return false;

        const acceleration = currentVel.sub(lastVel).length / dt;
        if (acceleration > this.shakeThreshold) {
            this.lastSeparationTime = now;
            return true;
        }
        return false;
    }

    private clampVelocity(vel: vec3): vec3 {
        const speed = vel.length;
        return speed > this.maxVelocity ? vel.normalize().uniformScale(this.maxVelocity) : vel;
    }

    private lerpVec3(a: vec3, b: vec3, t: number): vec3 {
        return new vec3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    private onUpdate(): void {
        if (!this.enabled || !this.magnet1 || !this.magnet2) return;

        const dt = getDeltaTime();
        if (dt <= 0) return;

        const pos1 = this.getPosition(this.magnet1);
        const pos2 = this.getPosition(this.magnet2);

        const manipulating1 = this.isBeingManipulated(this.magnet1, this.lastPos1, this.velocity1);
        const manipulating2 = this.isBeingManipulated(this.magnet2, this.lastPos2, this.velocity2);

        // Reset on grab
        if (manipulating1 && !this.wasManipulating1) {
            this.velocity1 = vec3.zero();
            this.lastManipVel1 = vec3.zero();
            this.smoothedForce = vec3.zero();
        }
        if (manipulating2 && !this.wasManipulating2) {
            this.velocity2 = vec3.zero();
            this.lastManipVel2 = vec3.zero();
            this.smoothedForce = vec3.zero();
        }

        // Shake detection
        const manipVel1 = manipulating1 ? pos1.sub(this.lastPos1).uniformScale(1.0 / dt) : vec3.zero();
        const manipVel2 = manipulating2 ? pos2.sub(this.lastPos2).uniformScale(1.0 / dt) : vec3.zero();

        const stuckDistance = (this.getCollisionRadius(this.magnet1) + this.getCollisionRadius(this.magnet2)) * 1.5;
        if (pos2.sub(pos1).length < stuckDistance) {
            if (this.checkShakeSeparation(manipVel1, this.lastManipVel1, manipulating1) ||
                this.checkShakeSeparation(manipVel2, this.lastManipVel2, manipulating2)) {
                this.applySeparationImpulse();
            }
        }

        this.lastManipVel1 = manipVel1;
        this.lastManipVel2 = manipVel2;

        // When stuck, keep magnets together
        if (this.isStuck) {
            this.velocity1 = vec3.zero();
            this.velocity2 = vec3.zero();
            this.smoothedForce = vec3.zero();

            // If one magnet is being manipulated, the other follows
            if (manipulating1 && !manipulating2) {
                const newPos2 = pos1.add(this.stickOffset);
                this.setPosition(this.magnet2, newPos2);
            } else if (manipulating2 && !manipulating1) {
                const newPos1 = pos2.sub(this.stickOffset);
                this.setPosition(this.magnet1, newPos1);
            }

            // Check if still in contact, unstick if pulled apart
            const currentDist = this.getPosition(this.magnet2).sub(this.getPosition(this.magnet1)).length;
            const contactDist = this.getContactDistance();
            if (currentDist > contactDist * 1.3) {
                this.isStuck = false;
            }

            this.updateTracking(manipulating1, manipulating2);
            return;
        }

        // Apply magnetic force
        const rawForce = this.computeMagneticForce();
        const smoothingRate = 1.0 - Math.pow(this.forceSmoothing, dt * 60);
        this.smoothedForce = this.lerpVec3(this.smoothedForce, rawForce, smoothingRate);

        const dampingFactor = Math.exp(-this.damping * dt);

        if (!manipulating1) {
            this.velocity1 = this.velocity1.sub(this.smoothedForce.uniformScale(dt));
            this.velocity1 = this.clampVelocity(this.velocity1.uniformScale(dampingFactor));
            this.setPosition(this.magnet1, pos1.add(this.velocity1.uniformScale(dt)));
        } else {
            this.velocity1 = pos1.sub(this.lastPos1).uniformScale(1.0 / dt);
        }

        if (!manipulating2) {
            this.velocity2 = this.velocity2.add(this.smoothedForce.uniformScale(dt));
            this.velocity2 = this.clampVelocity(this.velocity2.uniformScale(dampingFactor));
            this.setPosition(this.magnet2, pos2.add(this.velocity2.uniformScale(dt)));
        } else {
            this.velocity2 = pos2.sub(this.lastPos2).uniformScale(1.0 / dt);
        }

        // Handle collision
        if (this.handleCollision()) {
            this.velocity1 = this.velocity1.uniformScale(0.5);
            this.velocity2 = this.velocity2.uniformScale(0.5);
        }

        this.updateTracking(manipulating1, manipulating2);
    }

    private updateTracking(manipulating1: boolean, manipulating2: boolean): void {
        this.lastPos1 = this.getPosition(this.magnet1);
        this.lastPos2 = this.getPosition(this.magnet2);
        this.wasManipulating1 = manipulating1;
        this.wasManipulating2 = manipulating2;
    }

    // ============ PUBLIC API ============

    public applySeparationImpulse(): void {
        if (!this.magnet1 || !this.magnet2) return;

        this.isStuck = false;

        const delta = this.getPosition(this.magnet2).sub(this.getPosition(this.magnet1));
        const direction = delta.length > 0.001
            ? delta.normalize()
            : new vec3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();

        this.velocity1 = direction.uniformScale(-this.separationImpulse);
        this.velocity2 = direction.uniformScale(this.separationImpulse);
    }

    public setEnabled(value: boolean): void {
        this.enabled = value;
        if (!value) {
            this.velocity1 = vec3.zero();
            this.velocity2 = vec3.zero();
        }
    }

    public resetVelocities(): void {
        this.velocity1 = vec3.zero();
        this.velocity2 = vec3.zero();
    }

    public getForceStrength(): number { return this.forceStrength; }
    public setForceStrength(value: number): void { this.forceStrength = Math.max(0, value); }
    public setForceStrengthNormalized(value: number): void { this.forceStrength = 1 + value * 499; } // 0-1 maps to 1-500

    public getDamping(): number { return this.damping; }
    public setDamping(value: number): void { this.damping = Math.max(0, value); }

    public getMagnet1Position(): vec3 { return this.magnet1 ? this.getPosition(this.magnet1) : vec3.zero(); }
    public getMagnet2Position(): vec3 { return this.magnet2 ? this.getPosition(this.magnet2) : vec3.zero(); }

    public getMagnet1Forward(): vec3 { return this.magnet1 ? this.getForwardVector(this.magnet1) : new vec3(1, 0, 0); }
    public getMagnet2Forward(): vec3 { return this.magnet2 ? this.getForwardVector(this.magnet2) : new vec3(1, 0, 0); }

    public getIsStuck(): boolean { return this.isStuck; }
}
