/**
 * BreathingMotion.ts
 * Gentle vertical oscillation.
 */
@component
export class BreathingMotion extends BaseScriptComponent {

    @input
    @hint("Vertical motion distance")
    amplitude: number = 2.0;

    @input
    @hint("Cycles per minute")
    speed: number = 8;

    private transform: Transform;
    private startY: number;

    onAwake(): void {
        this.transform = this.sceneObject.getTransform();
        this.startY = this.transform.getLocalPosition().y;

        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private onUpdate(): void {
        const t = getTime() * (this.speed / 60.0) * Math.PI * 2.0;
        const smooth = (Math.sin(t) + 1.0) * 0.5;
        const eased = smooth * smooth * (3.0 - 2.0 * smooth);
        const offset = (eased - 0.5) * 2.0 * this.amplitude;

        const pos = this.transform.getLocalPosition();
        pos.y = this.startY + offset;
        this.transform.setLocalPosition(pos);
    }
}
