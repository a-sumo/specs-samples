import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { DragInteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { RGBCubeGenerator } from "../Generators/RGBCubeGenerator";
import { PigmentGamutMeshGenerator } from "../Generators/PigmentGamutMeshGenerator";
import { GamutProjectionMeshGenerator } from "../Generators/GamutProjectionMeshGenerator";
import { SingleColorMarker } from "../Generators/SingleColorMarker";

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
  @hint("Blend threshold for snapping to full color space (0.85 = snap when 85%+ toward target)")
  snapThreshold: number = 0.85;

  @input
  @hint("Enable snapping to full color space when above threshold")
  enableSnapping: boolean = true;

  @input
  @hint("Snap to nearest color space on drag release")
  snapOnRelease: boolean = true;

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

  @input
  @hint("SingleColorMarker to update")
  singleColorMarker: SingleColorMarker;

  private static readonly SPACE_NAMES = ["RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"];

  private planeTransform: Transform;
  private cursorTransform: Transform | null = null;
  private interactable: Interactable | null = null;
  private isDragging: boolean = false;

  // Current selection state
  private currentTargetSpace: number = 0;
  private currentBlend: number = 0;
  private isSnapped: boolean = false;

  // Cleanup
  private unsubscribeEvents: (() => void)[] = [];

  onAwake(): void {
    if (this.plane) {
      this.planeTransform = this.plane.getTransform();
      this.interactable = this.plane.getComponent(Interactable.getTypeName()) as Interactable;
    }

    if (this.cursor) {
      this.cursorTransform = this.cursor.getTransform();
      // Position cursor at center (RGB) initially
      this.positionCursorAtColorSpace(0);
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
        this.isSnapped = false;
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

        // Snap on release: if blend > 0.5, snap to full; otherwise snap to RGB
        // snapToColorSpace also positions the cursor at the destination
        if (this.snapOnRelease) {
          const targetSpace = this.currentBlend > 0.5 ? this.currentTargetSpace : 0;
          this.snapToColorSpace(targetSpace);
        }
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

  /** Convert UV coordinates to world position on the plane */
  private uvToWorld(u: number, v: number): vec3 {
    if (!this.planeTransform) return new vec3(0, 0, 0);

    // Convert UV (0-1) to local coords based on uvOffset
    const localX = u - this.uvOffset;
    const localY = v - this.uvOffset;
    const localPos = new vec3(localX, localY, 0);

    // Transform to world space
    return this.planeTransform.getWorldTransform().multiplyPoint(localPos);
  }

  /** Get UV position for a color space (center for RGB, edge for others) */
  private getColorSpaceUV(space: number): vec2 {
    if (space === 0) {
      // RGB is at center
      return new vec2(0.5, 0.5);
    }

    // Find the preset for this space
    for (const preset of this.presetAngles) {
      if (preset.space === space) {
        // Position at edge in the direction of this preset's angle
        const edgeDist = 0.45; // Near edge but not quite at boundary
        const u = 0.5 + Math.cos(preset.angle) * edgeDist;
        const v = 0.5 + Math.sin(preset.angle) * edgeDist;
        return new vec2(u, v);
      }
    }

    return new vec2(0.5, 0.5);
  }

  /** Position cursor at the location for a given color space */
  private positionCursorAtColorSpace(space: number): void {
    if (!this.cursorTransform || !this.planeTransform) return;

    const uv = this.getColorSpaceUV(space);
    const worldPos = this.uvToWorld(uv.x, uv.y);

    this.cursorTransform.setWorldPosition(worldPos);
    this.cursorTransform.setWorldRotation(this.planeTransform.getWorldRotation());
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

    // Track current state for snap-on-release
    this.currentTargetSpace = nearestPreset.space;
    this.currentBlend = blend;

    // Apply snapping if enabled
    let effectiveBlend = blend;
    this.isSnapped = false;

    if (this.enableSnapping && blend >= this.snapThreshold) {
      effectiveBlend = 1.0;
      this.isSnapped = true;
    } else if (blend < this.deadZone * 0.5) {
      // Snap to center (RGB) when very close
      effectiveBlend = 0;
      this.isSnapped = true;
    }

    // Always transition from RGB (0) to the nearest preset
    this.updateColorSpaceSimple(nearestPreset.space, effectiveBlend);

    // Debug with snap indicator
    const angleDeg = (angle * 180 / Math.PI).toFixed(0);
    const snapIndicator = this.isSnapped ? " [SNAP]" : "";
    this.updateDebugText(`${angleDeg}° | RGB→${nearestPreset.name} ${(effectiveBlend * 100).toFixed(0)}%${snapIndicator}`);
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
    if (this.singleColorMarker) {
      this.singleColorMarker.setColorSpace(0, targetSpace, blend);
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
    this.snapToColorSpace(0); // Also positions cursor at center
  }

  /** Check if currently dragging */
  public getIsDragging(): boolean {
    return this.isDragging;
  }

  /** Snap to a specific color space (0=RGB, 1=CIELAB, 2=CIEXYZ, 3=Oklab, 4=CIELUV) */
  public snapToColorSpace(space: number): void {
    this.currentTargetSpace = space;
    this.currentBlend = space === 0 ? 0 : 1;
    this.isSnapped = true;

    // Update all generators
    if (this.rgbCubeGenerator) {
      this.rgbCubeGenerator.setColorSpace(0, space, this.currentBlend);
    }
    if (this.pigmentMixGenerator) {
      this.pigmentMixGenerator.setColorSpace(0, space, this.currentBlend);
    }
    if (this.projectorGamutMesh) {
      this.projectorGamutMesh.setColorSpace(0, space, this.currentBlend);
    }
    if (this.singleColorMarker) {
      this.singleColorMarker.setColorSpace(0, space, this.currentBlend);
    }

    // Position cursor at the snapped color space
    this.positionCursorAtColorSpace(space);

    const name = ColorSpacePlaneController.SPACE_NAMES[space] || "Unknown";
    this.updateDebugText(`Snapped to ${name}`);
  }

  /** Get currently selected color space index */
  public getCurrentColorSpace(): number {
    return this.currentBlend >= 0.5 ? this.currentTargetSpace : 0;
  }

  /** Get current blend value */
  public getCurrentBlend(): number {
    return this.currentBlend;
  }

  /** Check if currently snapped to a color space */
  public getIsSnapped(): boolean {
    return this.isSnapped;
  }

  /** Set snapping enabled/disabled */
  public setSnappingEnabled(enabled: boolean): void {
    this.enableSnapping = enabled;
  }

  /** Set snap threshold (0-1) */
  public setSnapThreshold(threshold: number): void {
    this.snapThreshold = Math.max(0, Math.min(1, threshold));
  }

  // ============================================
  // SYNC METHODS - apply to all generators
  // ============================================

  /** Sync display size across all generators */
  public syncDisplaySize(size: number): void {
    if (this.rgbCubeGenerator) this.rgbCubeGenerator.setDisplaySize(size);
    if (this.pigmentMixGenerator) this.pigmentMixGenerator.setDisplaySize(size);
    if (this.projectorGamutMesh) this.projectorGamutMesh.setDisplaySize(size);
    if (this.singleColorMarker) this.singleColorMarker.setDisplaySize(size);
  }

  /** Sync voxel size across all generators */
  public syncVoxelSize(size: number): void {
    if (this.rgbCubeGenerator) this.rgbCubeGenerator.setVoxelSize(size);
    if (this.pigmentMixGenerator) this.pigmentMixGenerator.setVoxelSize(size);
    if (this.projectorGamutMesh) this.projectorGamutMesh.setVoxelSize(size);
  }

  /** Sync grid resolution across RGBCubeGenerator and PigmentGamutMeshGenerator */
  public syncGridResolution(res: number): void {
    if (this.rgbCubeGenerator) this.rgbCubeGenerator.setGridResolution(res);
    if (this.pigmentMixGenerator) this.pigmentMixGenerator.setGridResolution(res);
  }

  // ============================================
  // TRANSFORM SYNC METHODS
  // ============================================

  /** Tween all generators to their rest transforms */
  public tweenAllToRestTransform(duration: number = 0.5): void {
    if (this.rgbCubeGenerator) this.rgbCubeGenerator.tweenToRestTransform(duration);
    if (this.pigmentMixGenerator) this.pigmentMixGenerator.tweenToRestTransform(duration);
    if (this.projectorGamutMesh) this.projectorGamutMesh.tweenToRestTransform(duration);
  }

  /** Snap all generators to their rest transforms */
  public snapAllToRestTransform(): void {
    if (this.rgbCubeGenerator) this.rgbCubeGenerator.snapToRestTransform();
    if (this.pigmentMixGenerator) this.pigmentMixGenerator.snapToRestTransform();
    if (this.projectorGamutMesh) this.projectorGamutMesh.snapToRestTransform();
  }

  /** Align pigment gamut with projector (tween to projector's current position) */
  public alignPigmentWithProjector(duration: number = 0.5): void {
    if (this.pigmentMixGenerator && this.projectorGamutMesh) {
      const projTransform = this.projectorGamutMesh.getSceneObject().getTransform();
      const projPos = projTransform.getWorldPosition();
      const projRot = projTransform.getWorldRotation();
      this.pigmentMixGenerator.tweenToTransform(projPos, projRot, duration);
    }
  }

  /** Align projector with pigment gamut (tween to pigment's current position) */
  public alignProjectorWithPigment(duration: number = 0.5): void {
    if (this.pigmentMixGenerator && this.projectorGamutMesh) {
      const pigTransform = this.pigmentMixGenerator.getSceneObject().getTransform();
      const pigPos = pigTransform.getWorldPosition();
      const pigRot = pigTransform.getWorldRotation();
      this.projectorGamutMesh.tweenToTransform(pigPos, pigRot, duration);
    }
  }
}
