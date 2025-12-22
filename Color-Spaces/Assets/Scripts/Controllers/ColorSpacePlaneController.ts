import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { DragInteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { RGBCubeGenerator } from "../Generators/RGBCubeGenerator";
import { PigmentGamutMeshGenerator } from "../Generators/PigmentGamutMeshGenerator";
import { GamutProjectionMeshGenerator } from "../Generators/GamutProjectionMeshGenerator";

/**
 * Interactive plane for color space selection.
 * Drag on the plane - cursor position determines color space blend.
 *
 * Layout:
 *        CIELAB (top)
 *           |
 *   CIELUV -- RGB -- CIEXYZ
 *           |
 *        Oklab (bottom)
 *
 * Subscribe to onColorSpaceChange to receive updates.
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
  @hint("Dead zone radius in center (0-1, where 0.15 = 15%)")
  deadZone: number = 0.15;

  @input
  @hint("Text for debug display")
  debugText: Text;

  @input
  @hint("UV offset for plane local coords (0.5 for -0.5..0.5 planes, 0 for 0..1 planes)")
  uvOffset: number = 0.5;

  @input
  @hint("RGBCubeGenerator to update")
  rgbCubeGenerator: RGBCubeGenerator;

  @input
  @hint("PigmentGamutMeshGenerator to update")
  pigmentMixGenerator: PigmentGamutMeshGenerator;

  @input
  @hint("GamutProjectionMeshGenerator to update")
  projectorGamutMesh: GamutProjectionMeshGenerator;

  private static readonly SPACE_NAMES = ["RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"];

  private planeTransform: Transform;
  private cursorTransform: Transform | null = null;
  private interactable: Interactable | null = null;
  private isDragging: boolean = false;

  // Cleanup
  private unsubscribeEvents: (() => void)[] = [];

  onAwake(): void {
    if (this.plane) {
      this.planeTransform = this.plane.getTransform();
      this.interactable = this.plane.getComponent(Interactable.getTypeName()) as Interactable;
    }

    if (this.cursor) {
      this.cursorTransform = this.cursor.getTransform();
      this.hideCursor();
    }

    if (this.interactable) {
      this.setupDragEvents();
    } else {
      print("ColorSpacePlaneController: No Interactable found on plane");
    }

    this.createEvent("OnDestroyEvent").bind(() => this.onDestroy());
  }

  private setupDragEvents(): void {
    if (!this.interactable) return;

    this.unsubscribeEvents.push(
      this.interactable.onDragStart.add((e: DragInteractorEvent) => {
        this.isDragging = true;
        this.handleDrag(e);
      })
    );

    this.unsubscribeEvents.push(
      this.interactable.onDragUpdate.add((e: DragInteractorEvent) => {
        this.handleDrag(e);
      })
    );

    this.unsubscribeEvents.push(
      this.interactable.onDragEnd.add(() => {
        this.isDragging = false;
        this.hideCursor();
      })
    );
  }

  private handleDrag(e: DragInteractorEvent): void {
    if (!e.interactor?.planecastPoint) return;

    const worldPos = e.interactor.planecastPoint;
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

    // Remap local coords to 0-1 UV
    // uvOffset=0.5 for planes with local coords -0.5..0.5
    // uvOffset=0 for planes with local coords 0..1
    return new vec2(
      Math.max(0, Math.min(1, localPos.x + this.uvOffset)),
      Math.max(0, Math.min(1, localPos.y + this.uvOffset))
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

  // 4 non-RGB presets evenly spaced at 90° intervals
  // RGB is always the "from" space, we transition toward the nearest preset
  // Angle 0 = right (+X), counter-clockwise
  private readonly presetAngles: { angle: number; space: number; name: string }[] = [
    { angle: 0,                name: "CIEXYZ",  space: 2 },  // right
    { angle: Math.PI / 2,      name: "CIELAB",  space: 1 },  // top
    { angle: Math.PI,          name: "CIELUV",  space: 4 },  // left
    { angle: 3 * Math.PI / 2,  name: "Oklab",   space: 3 },  // bottom
  ];

  private processUV(u: number, v: number): void {
    // Angular layout: 4 presets at corners (90° each)
    // Center = RGB, move outward = transition from RGB to nearest preset

    const dx = u - 0.5;
    const dy = v - 0.5;
    const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);

    // Get angle from center (0 = right, counter-clockwise)
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += 2 * Math.PI;  // Normalize to 0..2π

    // Find nearest preset by angle
    let nearestPreset = this.presetAngles[0];
    let minAngleDiff = Math.PI * 2;

    for (const preset of this.presetAngles) {
      let diff = Math.abs(angle - preset.angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;  // Handle wraparound
      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        nearestPreset = preset;
      }
    }

    // Blend based on distance from center
    let blend = 0;
    if (dist > this.deadZone) {
      blend = (dist - this.deadZone) / (1 - this.deadZone);
    }

    // Always transition from RGB (0) to the nearest preset
    this.updateColorSpaceSimple(nearestPreset.space, blend);

    // Debug
    const angleDeg = (angle * 180 / Math.PI).toFixed(0);
    this.updateDebugText(`UV: ${u.toFixed(2)}, ${v.toFixed(2)} | ${angleDeg}° | RGB→${nearestPreset.name} ${(blend * 100).toFixed(0)}%`);
  }

  private updateColorSpaceSimple(targetSpace: number, blend: number): void {
    // Update all target generators directly
    if (this.rgbCubeGenerator) {
      this.rgbCubeGenerator.setColorSpace(0, targetSpace, blend);
    }
    if (this.pigmentMixGenerator) {
      this.pigmentMixGenerator.setColorSpace(0, targetSpace, blend);
    }
    if (this.projectorGamutMesh) {
      this.projectorGamutMesh.setColorSpace(0, targetSpace, blend);
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

  /** Check if currently dragging */
  public getIsDragging(): boolean {
    return this.isDragging;
  }
}
