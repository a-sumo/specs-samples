/**
 * Specs Inc. 2026
 * Central singleton controller for surface placement workflows across all modes. Manages placement mode
 * prefab instantiation (Horizontal, Vertical, TableTop), coordinates HandHintsController for onboarding,
 * provides startSurfacePlacement() and stopSurfacePlacement() public API, handles detector lifecycle with
 * automatic cleanup, plays calibration audio feedback, and ensures only one active placement session at a time.
 */
import { PlacementMode, PlacementSettings } from "./PlacementSettings";

import { HandHintsController } from "./HandHintsController";
import { Singleton } from "../Decorators/Singleton";
import { SurfaceDetector } from "./SurfaceDetector";
import { TableTop } from "./TableTop";

// public static getInstance: () => SIKLogLevelProvider

const CALIBRATE_AUDIOTRACK: AudioTrackAsset = requireAsset(
  "../Sounds/CalibrateSnap.mp3"
) as AudioTrackAsset;

const HANDHINTS_PREFAB: ObjectPrefab = requireAsset(
  "../Prefabs/HandHints.prefab"
) as ObjectPrefab;

const PLACEMENT_MODE_PREFABS: ObjectPrefab[] = [
  requireAsset("../Prefabs/HorizontalPlacement.prefab") as ObjectPrefab,
  requireAsset("../Prefabs/VerticalPlacement.prefab") as ObjectPrefab,
  requireAsset("../Prefabs/TableTopPlacement.prefab") as ObjectPrefab,
];

@Singleton
export class SurfacePlacementController {
  public static getInstance: () => SurfacePlacementController;

  private handHindsController: HandHintsController = null;
  private currDetector: SurfaceDetector = null;

  private sceneObject: SceneObject = null;

  public constructor() {
    this.sceneObject = global.scene.createSceneObject(
      "SurfacePlacementController"
    );

    this.init();
  }

  private init() {
    const audioComponent = this.sceneObject.createComponent("AudioComponent");
    audioComponent.audioTrack = CALIBRATE_AUDIOTRACK;

    const handHintsObj = HANDHINTS_PREFAB.instantiate(this.sceneObject);
    this.handHindsController = handHintsObj.getComponent(
      HandHintsController.getTypeName()
    );
    this.handHindsController.disableHint();
  }

  startSurfacePlacement(
    settings: PlacementSettings,
    callback: (pos: vec3, rot: quat) => void
  ) {
    if (this.currDetector != null) {
      //in case mode is changed remove current detector
      this.stopSurfacePlacement();
    }
    //create new one and init
    const detectorObj = PLACEMENT_MODE_PREFABS[
      settings.placementMode
    ].instantiate(this.sceneObject);
    this.currDetector = detectorObj
      .getComponents("ScriptComponent")
      .find((s) => s instanceof SurfaceDetector) as SurfaceDetector;

    if (settings.placementMode == PlacementMode.NEAR_SURFACE) {
      const tableTop = detectorObj.getComponent(TableTop.getTypeName());
      tableTop.setOptions(settings);
    }

    this.currDetector.init(this.handHindsController);
    //start surface placement on desired mode
    this.currDetector.startSurfaceCalibration(callback);
  }

  stopSurfacePlacement() {
    if (this.currDetector) {
      this.handHindsController.disableHint();
      this.currDetector.onDestroy();
      this.currDetector.getSceneObject().destroy();
      this.currDetector = null;
    }
  }
}
