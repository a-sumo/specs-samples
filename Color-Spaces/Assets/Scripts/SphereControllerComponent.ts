import { SphereController, SpherePointId } from "./SphereController";

/**
 * Component wrapper for SphereController that integrates with RGBCubeGenerator.
 *
 * Handles input events and provides smooth animation when rotating
 * between color space selections.
 */
@component
export class SphereControllerComponent extends BaseScriptComponent {
  @input
  @hint("Reference to RGBCubeGenerator to control")
  cubeGenerator: ScriptComponent;

  @input
  @hint("Rotation speed in radians per unit of input")
  rotationSpeed: number = 0.05;

  @input
  @hint("Enable snap-to-point after releasing input")
  snapEnabled: boolean = true;

  @input
  @hint("Animation duration for snapping (seconds)")
  snapDuration: number = 0.3;

  @input
  @hint("Text component to display current selection")
  labelText: Text;

  private controller: SphereController;
  private isAnimating: boolean = false;
  private animationStartTime: number = 0;
  private animationStartRotation: quat;
  private animationTargetRotation: quat;

  private cubeGeneratorApi: any;

  onAwake(): void {
    this.controller = new SphereController([
      "RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"
    ]);

    this.controller.onActiveChange = (id, label) => {
      this.onSelectionChanged(id, label);
    };

    // Cache the cube generator API
    if (this.cubeGenerator) {
      this.cubeGeneratorApi = this.cubeGenerator;
    }

    this.updateLabel();
  }

  /**
   * Called when the active point changes.
   */
  private onSelectionChanged(pointId: SpherePointId, label: string): void {
    if (this.cubeGeneratorApi && this.cubeGeneratorApi.setColorSpaceIndex) {
      this.cubeGeneratorApi.setColorSpaceIndex(pointId);
    }
    this.updateLabel();
  }

  private updateLabel(): void {
    if (this.labelText) {
      this.labelText.text = this.controller.activeLabel;
    }
  }

  /**
   * Rotate the sphere by delta amounts.
   * Call this from touch/gesture handlers.
   *
   * @param deltaX Horizontal movement (positive = rotate right)
   * @param deltaY Vertical movement (positive = rotate up)
   */
  public rotateByDelta(deltaX: number, deltaY: number): void {
    if (this.isAnimating) return;

    const yaw = -deltaX * this.rotationSpeed;
    const pitch = deltaY * this.rotationSpeed;

    this.controller.rotate(yaw, pitch);
  }

  /**
   * Call when user releases input to snap to nearest point.
   */
  public onInputEnd(): void {
    if (!this.snapEnabled || this.isAnimating) return;

    const currentRotation = this.controller.currentRotation;
    const targetRotation = this.controller.getRotationToPoint(this.controller.activePointId);

    this.startSnapAnimation(currentRotation, targetRotation);
  }

  private startSnapAnimation(from: quat, to: quat): void {
    this.isAnimating = true;
    this.animationStartTime = getTime();
    this.animationStartRotation = from;
    this.animationTargetRotation = to;

    // Create update event for animation
    const updateEvent = this.createEvent("UpdateEvent");
    updateEvent.bind(() => this.updateAnimation());
  }

  private updateAnimation(): void {
    if (!this.isAnimating) return;

    const elapsed = getTime() - this.animationStartTime;
    const t = Math.min(elapsed / this.snapDuration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - t, 3);

    const interpolated = quat.slerp(
      this.animationStartRotation,
      this.animationTargetRotation,
      eased
    );

    this.controller.setRotation(interpolated);

    if (t >= 1) {
      this.isAnimating = false;
    }
  }

  /**
   * Directly select a point by ID.
   */
  public selectPoint(pointId: SpherePointId): void {
    if (this.isAnimating) return;

    const currentRotation = this.controller.currentRotation;
    const targetRotation = this.controller.getRotationToPoint(pointId);

    this.startSnapAnimation(currentRotation, targetRotation);
  }

  /**
   * Select next point in sequence.
   */
  public selectNext(): void {
    const next = ((this.controller.activePointId + 1) % 5) as SpherePointId;
    this.selectPoint(next);
  }

  /**
   * Select previous point in sequence.
   */
  public selectPrevious(): void {
    const prev = ((this.controller.activePointId + 4) % 5) as SpherePointId;
    this.selectPoint(prev);
  }

  /**
   * Get current active point ID.
   */
  public getActivePointId(): SpherePointId {
    return this.controller.activePointId;
  }

  /**
   * Get current active label.
   */
  public getActiveLabel(): string {
    return this.controller.activeLabel;
  }

  /**
   * Get all point positions (for rendering the sphere visualization).
   */
  public getPointPositions(): { id: number; position: vec3; label: string; frontness: number }[] {
    const frontness = this.controller.getPointFrontness();
    return this.controller.allPoints.map(p => ({
      id: p.id,
      position: p.currentPosition,
      label: p.label,
      frontness: frontness.get(p.id) || 0,
    }));
  }

  /**
   * Check if currently animating.
   */
  public isSnapping(): boolean {
    return this.isAnimating;
  }

  /**
   * Reset to initial state (point 0 at front).
   */
  public reset(): void {
    this.controller.reset();
  }
}
