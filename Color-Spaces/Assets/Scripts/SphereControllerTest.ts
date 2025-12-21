import { SphereController, SpherePointId } from "./SphereController";

/**
 * Debug test for SphereController.
 * Runs through rotation sequence: left, center, right, center, up, center, down, center.
 * Visualizes with a sphere mesh and point markers.
 */
@component
export class SphereControllerTest extends BaseScriptComponent {
  @input
  @hint("Sphere mesh to rotate")
  sphereMesh: RenderMeshVisual;

  @input
  @hint("Radius for visualization")
  sphereRadius: number = 20;

  @input
  @hint("Duration of each rotation step (seconds)")
  stepDuration: number = 2.5;

  @input
  @hint("Pause between steps (seconds)")
  pauseDuration: number = 1.0;

  @input
  @hint("Text to show current state")
  debugText: Text;

  @input
  @hint("Reference to RGBCubeGenerator (optional)")
  cubeGenerator: ScriptComponent;

  private controller: SphereController;
  private currentStep: number = 0;
  private stepStartTime: number = 0;
  private isPaused: boolean = false;
  private isRunning: boolean = false;

  private startRotation: quat;
  private targetRotation: quat;
  private previousColorSpace: number = 0;
  private cubeGeneratorApi: any;

  // Sequence: rotate to each cardinal direction, return to center each time
  private readonly sequence: { target: SpherePointId; label: string }[] = [
    { target: 0, label: "CENTER (RGB)" },
    { target: 4, label: "LEFT (CIELUV)" },
    { target: 0, label: "CENTER (RGB)" },
    { target: 2, label: "RIGHT (CIEXYZ)" },
    { target: 0, label: "CENTER (RGB)" },
    { target: 1, label: "UP (CIELAB)" },
    { target: 0, label: "CENTER (RGB)" },
    { target: 3, label: "DOWN (Oklab)" },
    { target: 0, label: "CENTER (RGB)" },
  ];

  onAwake(): void {
    this.controller = new SphereController([
      "RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"
    ]);

    this.controller.onActiveChange = (id, label) => {
      this.log(`Active changed to: ${id} (${label})`);
    };

    // Cache cube generator API
    if (this.cubeGenerator) {
      this.cubeGeneratorApi = this.cubeGenerator as any;
    }

    // Start test after a short delay
    const delayEvent = this.createEvent("DelayedCallbackEvent");
    delayEvent.bind(() => {
      this.startTest();
    });
    (delayEvent as DelayedCallbackEvent).reset(1.0);
  }

  private startTest(): void {
    this.log("=== SPHERE CONTROLLER TEST START ===");
    this.log("Sequence: CENTER -> LEFT -> CENTER -> RIGHT -> CENTER -> UP -> CENTER -> DOWN -> CENTER");
    this.log("");

    this.isRunning = true;
    this.currentStep = 0;
    this.startNextStep();

    const updateEvent = this.createEvent("UpdateEvent");
    updateEvent.bind(() => this.update());
  }

  private startNextStep(): void {
    if (this.currentStep >= this.sequence.length) {
      this.log("=== TEST COMPLETE ===");
      this.isRunning = false;
      return;
    }

    const step = this.sequence[this.currentStep];
    this.log(`Step ${this.currentStep + 1}/${this.sequence.length}: Rotating to ${step.label}`);

    this.startRotation = this.controller.currentRotation;
    this.targetRotation = this.controller.getRotationToPoint(step.target);
    this.stepStartTime = getTime();
    this.isPaused = false;

    // Start continuous color space transition
    if (this.cubeGeneratorApi && this.cubeGeneratorApi.startTransition) {
      this.log(`  Starting color transition: ${this.previousColorSpace} -> ${step.target}`);
      this.cubeGeneratorApi.startTransition(step.target);
    }

    this.updateDebugText(`Rotating to: ${step.label}`);
  }

  private update(): void {
    if (!this.isRunning) return;

    const elapsed = getTime() - this.stepStartTime;

    if (this.isPaused) {
      // Waiting between steps
      if (elapsed >= this.pauseDuration) {
        this.currentStep++;
        this.startNextStep();
      }
    } else {
      // Animating rotation
      const t = Math.min(elapsed / this.stepDuration, 1);
      const eased = this.easeInOutCubic(t);

      const interpolated = quat.slerp(this.startRotation, this.targetRotation, eased);
      this.controller.setRotation(interpolated);

      // Update sphere visual
      this.updateSphereVisual(interpolated);

      // Continuously update color space blend (synchronized with rotation)
      if (this.cubeGeneratorApi && this.cubeGeneratorApi.setBlend) {
        this.cubeGeneratorApi.setBlend(eased);
      }

      // Log point positions when done
      if (t >= 1) {
        this.logPointPositions();
        this.isPaused = true;
        this.stepStartTime = getTime();

        const step = this.sequence[this.currentStep];
        this.previousColorSpace = step.target;
        this.updateDebugText(`At: ${step.label} | Active: ${this.controller.activeLabel}`);
      }
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private updateSphereVisual(rotation: quat): void {
    if (this.sphereMesh) {
      const transform = this.sphereMesh.getSceneObject().getTransform();
      transform.setLocalRotation(rotation);
    }
  }

  private logPointPositions(): void {
    const frontness = this.controller.getPointFrontness();
    this.log("Point positions (frontness):");

    for (const point of this.controller.allPoints) {
      const f = frontness.get(point.id)?.toFixed(2) || "?";
      const pos = point.currentPosition;
      const hidden = this.controller.isPointHidden(point.id) ? " [HIDDEN]" : "";
      const active = point.id === this.controller.activePointId ? " [ACTIVE]" : "";
      this.log(`  ${point.id} ${point.label}: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) frontness=${f}${active}${hidden}`);
    }
    this.log("");
  }

  private updateDebugText(message: string): void {
    if (this.debugText) {
      this.debugText.text = message;
    }
  }

  private log(message: string): void {
    print("[SphereTest] " + message);
  }

  /**
   * Manually trigger a rotation to a specific point.
   */
  public rotateToPoint(pointId: number): void {
    if (pointId < 0 || pointId > 4) return;

    this.startRotation = this.controller.currentRotation;
    this.targetRotation = this.controller.getRotationToPoint(pointId as SpherePointId);
    this.stepStartTime = getTime();
    this.isPaused = false;
    this.isRunning = true;

    // Reset sequence to prevent interference
    this.currentStep = this.sequence.length;
  }

  /**
   * Get current active point for external queries.
   */
  public getActivePoint(): number {
    return this.controller.activePointId;
  }
}
