/**
 * Specs Inc. 2026
 * Surface placement example demonstrating three placement modes: Near Surface (tabletop with height
 * adjustment widget), Horizontal (ground plane detection), and Vertical (wall detection). Integrates
 * SurfacePlacementController singleton for AR object positioning, provides slider callback for height
 * adjustment, auto-start option for immediate placement, and reset functionality for re-calibration.
 */
import { PlacementMode, PlacementSettings } from "./Scripts/PlacementSettings";

import { SurfacePlacementController } from "./Scripts/SurfacePlacementController";
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindLateUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators";

@component
export class Example extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Placement Configuration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Object and placement mode selection</span>')

  @input
  @allowUndefined
  objectVisuals: SceneObject;

  @input("int")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Near Surface", 0),
      new ComboBoxItem("Horizontal", 1),
      new ComboBoxItem("Vertical", 2),
    ])
  )
  placementSettingMode: number = 0;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Behavior Settings</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Auto-start and initialization options</span>')

  @input
  autoStart: boolean = true;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging Configuration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Control logging output for this script instance</span>')

  @input
  @hint("Enable general logging (animation cycles, events, etc.)")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy, etc.)")
  enableLoggingLifecycle: boolean = false;

  // Logger instance
  private logger: Logger;  private transform: Transform = null;

  private surfacePlacement: SurfacePlacementController =
    SurfacePlacementController.getInstance();  /**
   * Called when component is initialized
   */
  onAwake(): void {
    // Initialize logger
    this.logger = new Logger("Example", this.enableLogging || this.enableLoggingLifecycle, true);

    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake() - Component initializing");
    }


    this.transform = this.getSceneObject().getTransform();
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    this.objectVisuals.enabled = false;

    if (this.autoStart) {
      this.startPlacement();
    }
  }

  startPlacement() {
    this.objectVisuals.enabled = false;

    let placementSettings: PlacementSettings;
    switch (this.placementSettingMode) {
      case 0: // Near Surface
        placementSettings = new PlacementSettings(
          PlacementMode.NEAR_SURFACE,
          true, // use surface adjustment widget
          new vec3(10, 10, 0), // offset in cm of widget from surface center
          this.onSliderUpdated.bind(this) // callback from widget height changes
        );
        break;
      case 1: // Horizontal
        placementSettings = new PlacementSettings(PlacementMode.HORIZONTAL);
        break;
      case 2: // Vertical
        placementSettings = new PlacementSettings(PlacementMode.VERTICAL);
        break;
      default:
        placementSettings = new PlacementSettings(PlacementMode.NEAR_SURFACE);
    }

    this.surfacePlacement.startSurfacePlacement(
      placementSettings,
      (pos, rot) => {
        this.onSurfaceDetected(pos, rot);
      }
    );
  }

  resetPlacement() {
    this.surfacePlacement.stopSurfacePlacement();
    this.startPlacement();
  }

  private onSliderUpdated(pos: vec3) {
    this.transform.setWorldPosition(pos);
  }

  private onSurfaceDetected(pos: vec3, rot: quat) {
    this.objectVisuals.enabled = true;
    this.transform.setWorldPosition(pos);
    this.transform.setWorldRotation(rot);
  }
}
