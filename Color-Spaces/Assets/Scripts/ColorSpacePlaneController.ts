import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

/**
 * Interactive plane for color space selection.
 * Hover over the plane - cursor position determines color space blend.
 *
 * Layout (UV 0-1, center = 0.5,0.5):
 *        CIELAB (top)
 *           |
 *   CIELUV -- RGB -- CIEXYZ
 *           |
 *        Oklab (bottom)
 */
@component
export class ColorSpacePlaneController extends BaseScriptComponent {
  @input
  @hint("The plane SceneObject with Interactable")
  plane: SceneObject;

  @input
  @hint("Visual cursor/handle that follows hover position")
  cursor: SceneObject;

  @input
  @hint("Reference to RGBCubeGenerator")
  cubeGenerator: ScriptComponent;

  @input
  @hint("Dead zone radius in center (0-1, where 0.15 = 15%)")
  deadZone: number = 0.15;

  @input
  @hint("Text for debug display")
  debugText: Text;

  private cubeGeneratorApi: any;
  private planeTransform: Transform;
  private cursorTransform: Transform | null = null;
  private interactable: Interactable | null = null;
  private lastActiveSpace: number = 0;
  private isHovering: boolean = false;

  // Cleanup
  private unsubscribeEvents: (() => void)[] = [];

  onAwake(): void {
    if (this.cubeGenerator) {
      this.cubeGeneratorApi = this.cubeGenerator as any;
    }

    if (this.plane) {
      this.planeTransform = this.plane.getTransform();
      this.interactable = this.plane.getComponent(Interactable.getTypeName()) as Interactable;
    }

    if (this.cursor) {
      this.cursorTransform = this.cursor.getTransform();
      this.hideCursor();
    }

    if (this.interactable) {
      this.setupHoverEvents();
    } else {
      print("ColorSpacePlaneController: No Interactable found on plane");
    }

    this.createEvent("OnDestroyEvent").bind(() => this.onDestroy());
  }

  private setupHoverEvents(): void {
    if (!this.interactable) return;

    this.unsubscribeEvents.push(
      this.interactable.onHoverEnter((e: InteractorEvent) => {
        this.isHovering = true;
        this.handleHover(e);
      })
    );

    this.unsubscribeEvents.push(
      this.interactable.onHoverUpdate((e: InteractorEvent) => {
        this.handleHover(e);
      })
    );

    this.unsubscribeEvents.push(
      this.interactable.onHoverExit(() => {
        this.isHovering = false;
        this.hideCursor();
        // Optionally snap back to center (RGB)
        // this.processUV(0.5, 0.5);
      })
    );
  }

  private handleHover(e: InteractorEvent): void {
    if (!e.interactor?.targetHitInfo?.hit?.position) return;

    const worldPos = e.interactor.targetHitInfo.hit.position;
    const uv = this.worldToUV(worldPos);

    // Position cursor at hit
    this.positionCursor(worldPos);

    // Process UV for color space
    this.processUV(uv.x, uv.y);
  }

  private worldToUV(worldPos: vec3): vec2 {
    if (!this.planeTransform) return new vec2(0.5, 0.5);

    const invertedWorld = this.planeTransform.getInvertedWorldTransform();
    const localPos = invertedWorld.multiplyPoint(worldPos);

    // Unit plane: local coords -0.5 to 0.5, remap to 0-1
    return new vec2(
      Math.max(0, Math.min(1, localPos.x + 0.5)),
      Math.max(0, Math.min(1, localPos.y + 0.5))
    );
  }

  private positionCursor(worldPos: vec3): void {
    if (!this.cursorTransform || !this.planeTransform) return;

    // Position cursor at hit, matching plane rotation
    this.cursorTransform.setWorldPosition(worldPos);
    this.cursorTransform.setWorldRotation(this.planeTransform.getWorldRotation());
  }

  private hideCursor(): void {
    if (this.cursorTransform) {
      this.cursorTransform.setWorldPosition(new vec3(0, 10000, 0));
    }
  }

  private processUV(u: number, v: number): void {
    // Remap from 0-1 to -1 to 1 (center = 0)
    const x = (u - 0.5) * 2;  // -1 to 1
    const y = (v - 0.5) * 2;  // -1 to 1

    // Distance from center
    const dist = Math.min(1, Math.sqrt(x * x + y * y));

    // Angle from center
    const angle = Math.atan2(y, x);

    // Determine target space based on angle
    let targetSpace = 0;
    if (dist > this.deadZone) {
      const deg = angle * 180 / Math.PI;
      if (deg >= -45 && deg < 45) {
        targetSpace = 2;  // CIEXYZ (right, +X)
      } else if (deg >= 45 && deg < 135) {
        targetSpace = 1;  // CIELAB (up, +Y)
      } else if (deg >= 135 || deg < -135) {
        targetSpace = 4;  // CIELUV (left, -X)
      } else {
        targetSpace = 3;  // Oklab (down, -Y)
      }
    }

    // Blend amount (0 at center/deadzone, 1 at edge)
    let blend = 0;
    if (dist > this.deadZone) {
      blend = (dist - this.deadZone) / (1 - this.deadZone);
    }

    this.updateColorSpace(targetSpace, blend);

    // Debug
    const names = ["RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"];
    this.updateDebugText(`${names[targetSpace]} ${(blend * 100).toFixed(0)}%`);
  }

  private updateColorSpace(targetSpace: number, blend: number): void {
    if (!this.cubeGeneratorApi) return;

    if (targetSpace !== this.lastActiveSpace) {
      if (this.cubeGeneratorApi.startTransition) {
        this.cubeGeneratorApi.startTransition(targetSpace);
      }
      this.lastActiveSpace = targetSpace;
    }

    if (this.cubeGeneratorApi.setBlend) {
      this.cubeGeneratorApi.setBlend(blend);
    }
  }

  private updateDebugText(message: string): void {
    if (this.debugText) {
      this.debugText.text = message;
    }
  }

  private onDestroy(): void {
    this.unsubscribeEvents.forEach(unsub => unsub());
    this.unsubscribeEvents = [];
  }

  /** Reset to center (RGB) */
  public reset(): void {
    this.processUV(0.5, 0.5);
    this.hideCursor();
  }

  /** Check if currently hovering */
  public getIsHovering(): boolean {
    return this.isHovering;
  }
}
