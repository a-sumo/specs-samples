// OrbitMotion.ts
// Drives a SceneObject around a circular orbit in the local XZ plane of its parent.

@component
export class OrbitMotion extends BaseScriptComponent {

    @input
    @hint("Orbit radius in cm (local space)")
    radius: number = 10.0;

    @input
    @hint("Orbital angular speed in radians per second")
    angularSpeed: number = 0.6;

    @input
    @hint("Orbit plane tilt in degrees around local X axis")
    inclinationDeg: number = 25.0;

    @input
    @hint("Starting phase in degrees")
    phaseDeg: number = 0.0;

    @input
    @hint("Spin the orbiting object on its local Y axis")
    selfSpin: boolean = true;

    @input
    @hint("Self-spin angular speed in radians per second")
    selfSpinSpeed: number = 0.4;

    private t: number = 0.0;

    onAwake() {
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    private tick(): void {
        const dt = getDeltaTime();
        this.t += dt;
        const angle = this.t * this.angularSpeed + (this.phaseDeg * Math.PI / 180.0);
        const tilt = this.inclinationDeg * Math.PI / 180.0;

        const x = Math.cos(angle) * this.radius;
        const zFlat = Math.sin(angle) * this.radius;
        const y = zFlat * Math.sin(tilt);
        const z = zFlat * Math.cos(tilt);

        const tr = this.sceneObject.getTransform();
        tr.setLocalPosition(new vec3(x, y, z));

        if (this.selfSpin) {
            const spin = this.t * this.selfSpinSpeed;
            tr.setLocalRotation(quat.fromEulerAngles(0, spin, 0));
        }
    }
}
