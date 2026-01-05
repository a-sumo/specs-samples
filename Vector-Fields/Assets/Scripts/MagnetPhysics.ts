// MagnetPhysics.ts
// Simulates magnetic attraction/repulsion between two magnets
// Uses dipole-dipole interaction: opposite poles attract, like poles repel
// Forward vector (+Z local, rotated by Y) points from S to N pole

@component
export class MagnetPhysics extends BaseScriptComponent {

    @input
    @hint("First magnet object")
    magnet1: SceneObject;

    @input
    @hint("Second magnet object")
    magnet2: SceneObject;

    @input
    @widget(new SliderWidget(0.1, 50.0, 0.1))
    @hint("Strength of magnetic force")
    forceStrength: number = 10.0;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    @hint("Velocity damping (0 = no damping, 1 = full damping)")
    damping: number = 0.1;

    @input
    @widget(new SliderWidget(0.5, 5.0, 0.1))
    @hint("Minimum distance to prevent extreme forces")
    minDistance: number = 1.0;

    @input
    @widget(new SliderWidget(0.0, 20.0, 0.5))
    @hint("Maximum distance for force to apply")
    maxDistance: number = 15.0;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.1))
    @hint("Bounciness on collision (0 = no bounce, 1 = full bounce)")
    bounciness: number = 0.3;

    @input
    @hint("Enable physics simulation")
    enabled: boolean = true;

    // Velocities for each magnet
    private velocity1: vec3 = vec3.zero();
    private velocity2: vec3 = vec3.zero();

    // Track if magnets are being manipulated
    private wasManipulating1: boolean = false;
    private wasManipulating2: boolean = false;
    private lastPos1: vec3 = vec3.zero();
    private lastPos2: vec3 = vec3.zero();

    onAwake(): void {
        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

        if (this.magnet1) {
            this.lastPos1 = this.magnet1.getTransform().getWorldPosition();
        }
        if (this.magnet2) {
            this.lastPos2 = this.magnet2.getTransform().getWorldPosition();
        }

        print("MagnetPhysics: Initialized");
    }

    // Get forward vector (from S to N pole) based on object's Y rotation
    private getForwardVector(obj: SceneObject): vec3 {
        const rotation = obj.getTransform().getWorldRotation();
        const localForward = new vec3(0, 0, 1);
        return rotation.multiplyVec3(localForward);
    }

    // Compute magnetic force on magnet2 due to magnet1
    // Dipole-dipole force is complex, but simplified:
    // - Force along axis connecting them
    // - Attractive if opposite poles face each other
    // - Repulsive if same poles face each other
    private computeMagneticForce(): vec3 {
        if (!this.magnet1 || !this.magnet2) {
            return vec3.zero();
        }

        const pos1 = this.magnet1.getTransform().getWorldPosition();
        const pos2 = this.magnet2.getTransform().getWorldPosition();

        // Vector from magnet1 to magnet2
        const delta = pos2.sub(pos1);
        const distance = delta.length;

        if (distance < 0.001 || distance > this.maxDistance) {
            return vec3.zero();
        }

        const direction = delta.normalize();

        // Get magnetic moment directions (forward = S to N)
        const m1 = this.getForwardVector(this.magnet1);
        const m2 = this.getForwardVector(this.magnet2);

        // Determine attraction/repulsion based on pole alignment
        // If m1 points toward m2 position and m2 points toward m1 position,
        // then N of m1 faces S of m2 = attraction
        //
        // dot(m1, direction) > 0 means N pole of m1 faces toward m2
        // dot(m2, -direction) > 0 means N pole of m2 faces toward m1
        // If both N poles face each other: repel
        // If both S poles face each other: repel
        // If N faces S: attract

        const m1FacingM2 = m1.dot(direction);      // >0 if N pole of m1 faces m2
        const m2FacingM1 = m2.dot(direction.uniformScale(-1)); // >0 if N pole of m2 faces m1

        // Alignment factor:
        // +1 if like poles face each other (repel)
        // -1 if opposite poles face each other (attract)
        const alignment = m1FacingM2 * m2FacingM1;

        // Also consider overall dipole alignment for force magnitude
        // Stronger interaction when dipoles are more aligned with connection axis
        const axialAlignment = Math.abs(m1FacingM2) * Math.abs(m2FacingM1);

        // Clamp distance for force calculation
        const effectiveDistance = Math.max(distance, this.minDistance);

        // Force magnitude falls off with distance^3 (dipole-dipole)
        const forceMagnitude = this.forceStrength * axialAlignment / (effectiveDistance * effectiveDistance);

        // Force direction: positive alignment = repulsion (force points away)
        // negative alignment = attraction (force points toward)
        const force = direction.uniformScale(forceMagnitude * alignment);

        return force;
    }

    // Detect if object is being manually manipulated (position changed externally)
    private isBeingManipulated(obj: SceneObject, lastPos: vec3, velocity: vec3): boolean {
        const currentPos = obj.getTransform().getWorldPosition();
        const expectedPos = lastPos.add(velocity.uniformScale(getDeltaTime()));
        const diff = currentPos.sub(expectedPos).length;

        // If position differs significantly from physics prediction, user is manipulating
        return diff > 0.01;
    }

    // Get collision radius from SceneObject's scale (default sphere radius is 0.25)
    private getCollisionRadius(obj: SceneObject): number {
        const scale = obj.getTransform().getWorldScale();
        // Use max scale component for non-uniform scaling
        const maxScale = Math.max(scale.x, Math.max(scale.y, scale.z));
        return 0.25 * maxScale;
    }

    // Handle sphere-sphere collision between the two magnets
    // Returns true if collision occurred
    private handleCollision(): boolean {
        if (!this.magnet1 || !this.magnet2) return false;

        const pos1 = this.magnet1.getTransform().getWorldPosition();
        const pos2 = this.magnet2.getTransform().getWorldPosition();

        const radius1 = this.getCollisionRadius(this.magnet1);
        const radius2 = this.getCollisionRadius(this.magnet2);

        const delta = pos2.sub(pos1);
        const distance = delta.length;
        const minDist = radius1 + radius2;

        if (distance >= minDist || distance < 0.001) {
            return false; // No collision
        }

        // Collision detected - separate the magnets
        const overlap = minDist - distance;
        const normal = delta.normalize(); // Points from m1 to m2

        // Push magnets apart (half each)
        const separation = normal.uniformScale(overlap * 0.5);
        const newPos1 = pos1.sub(separation);
        const newPos2 = pos2.add(separation);

        this.magnet1.getTransform().setWorldPosition(newPos1);
        this.magnet2.getTransform().setWorldPosition(newPos2);

        // Reflect velocities along collision normal with bounciness
        const relativeVel = this.velocity2.sub(this.velocity1);
        const velAlongNormal = relativeVel.dot(normal);

        // Only resolve if velocities are moving toward each other
        if (velAlongNormal < 0) {
            const impulse = normal.uniformScale(velAlongNormal * (1 + this.bounciness));

            // Apply impulse (equal mass assumption)
            this.velocity1 = this.velocity1.add(impulse.uniformScale(0.5));
            this.velocity2 = this.velocity2.sub(impulse.uniformScale(0.5));
        }

        return true;
    }

    private onUpdate(): void {
        if (!this.enabled || !this.magnet1 || !this.magnet2) {
            return;
        }

        const dt = getDeltaTime();
        if (dt <= 0) return;

        const pos1 = this.magnet1.getTransform().getWorldPosition();
        const pos2 = this.magnet2.getTransform().getWorldPosition();

        // Detect manipulation (user moving the magnet)
        const manipulating1 = this.isBeingManipulated(this.magnet1, this.lastPos1, this.velocity1);
        const manipulating2 = this.isBeingManipulated(this.magnet2, this.lastPos2, this.velocity2);

        // Reset velocity if user just grabbed/released the magnet
        if (manipulating1 && !this.wasManipulating1) {
            this.velocity1 = vec3.zero();
        }
        if (manipulating2 && !this.wasManipulating2) {
            this.velocity2 = vec3.zero();
        }

        // Compute magnetic force (on magnet2 from magnet1)
        const force = this.computeMagneticForce();

        // Apply forces (equal and opposite)
        // Only apply if not being manipulated
        if (!manipulating1) {
            // Force on magnet1 is opposite
            const acceleration1 = force.uniformScale(-1);
            this.velocity1 = this.velocity1.add(acceleration1.uniformScale(dt));
            this.velocity1 = this.velocity1.uniformScale(1.0 - this.damping);

            const newPos1 = pos1.add(this.velocity1.uniformScale(dt));
            this.magnet1.getTransform().setWorldPosition(newPos1);
        } else {
            // Track velocity from manual movement
            this.velocity1 = pos1.sub(this.lastPos1).uniformScale(1.0 / dt);
        }

        if (!manipulating2) {
            const acceleration2 = force;
            this.velocity2 = this.velocity2.add(acceleration2.uniformScale(dt));
            this.velocity2 = this.velocity2.uniformScale(1.0 - this.damping);

            const newPos2 = pos2.add(this.velocity2.uniformScale(dt));
            this.magnet2.getTransform().setWorldPosition(newPos2);
        } else {
            this.velocity2 = pos2.sub(this.lastPos2).uniformScale(1.0 / dt);
        }

        // Handle collision - prevent overlap
        this.handleCollision();

        // Update tracking
        this.lastPos1 = this.magnet1.getTransform().getWorldPosition();
        this.lastPos2 = this.magnet2.getTransform().getWorldPosition();
        this.wasManipulating1 = manipulating1;
        this.wasManipulating2 = manipulating2;
    }

    // Public API to enable/disable physics
    public setEnabled(value: boolean): void {
        this.enabled = value;
        if (!value) {
            this.velocity1 = vec3.zero();
            this.velocity2 = vec3.zero();
        }
    }

    // Reset velocities
    public resetVelocities(): void {
        this.velocity1 = vec3.zero();
        this.velocity2 = vec3.zero();
    }
}
