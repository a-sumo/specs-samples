/**
 * Specs Inc. 2026
 * Height adjustment slider for near-surface placement with visual feedback. Controls ground visual
 * position and alpha based on slider interaction, provides smooth interpolation (speed 4) for alpha
 * transitions, manages 4cm slider range for fine-tuned height control, triggers update callback for
 * external object positioning, and animates slider appearance with scale transitions.
 */
import animate, {
  CancelFunction,
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";

import { Slider } from "SpectaclesInteractionKit.lspkg/Components/UI/Slider/Slider";
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindLateUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators";

const SLIDER_SCALE = 1;
const SLIDER_RANGE_CM = 4;

@component
export class SurfaceSlider extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Slider Configuration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Slider and ground visual components</span>')

  @input sliderObj: SceneObject;
  @input groundVisualObj: SceneObject;

  private trans: Transform = null;

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
  private logger: Logger;  private goundVisualTrans: Transform = null;
  private surfaceRenderer: RenderMeshVisual = null;
  private desiredAlpha: number = 0;
  private groundVisualPos: vec3 = vec3.zero();
  private sliderOffsetPos: vec3 = vec3.zero();

  private onSliderUpdateEvent: ((value: vec3) => void) | null = null;  /**
   * Called when component is initialized
   */
  onAwake(): void {
    // Initialize logger
    this.logger = new Logger("SurfaceSlider", this.enableLogging || this.enableLoggingLifecycle, true);

    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake() - Component initializing");
    }


    this.trans = this.getSceneObject().getTransform();
    this.goundVisualTrans = this.groundVisualObj.getTransform();
    this.surfaceRenderer =
      this.groundVisualObj.getComponent("RenderMeshVisual");
    this.surfaceRenderer.mainPass.Alpha = this.desiredAlpha;
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
  }

  init(offsetPos: vec3, onSliderUpdated: (value: vec3) => void) {
    this.sliderOffsetPos = offsetPos;
    this.onSliderUpdateEvent = onSliderUpdated;
  }

  private onUpdate() {
    //interpolate surface alpha when slider touched
    this.surfaceRenderer.mainPass.Alpha = MathUtils.lerp(
      this.surfaceRenderer.mainPass.Alpha,
      this.desiredAlpha,
      getDeltaTime() * 4
    );
    //move ground based on slider position
    this.goundVisualTrans.setLocalPosition(this.groundVisualPos);
  }

  resetSlider() {
    this.trans.setLocalScale(vec3.zero());
    this.groundVisualPos.y = 0;
    this.goundVisualTrans.setLocalPosition(vec3.zero());
    this.sliderObj.getComponent(Slider.getTypeName()).currentValue = 0.5;
  }

  onSliderStart() {
    this.desiredAlpha = 1;
  }

  onSliderMoved(val: number) {
    this.groundVisualPos.y = MathUtils.remap(
      val,
      0,
      1,
      -SLIDER_RANGE_CM,
      SLIDER_RANGE_CM
    );
    this.onSliderUpdateEvent?.(this.goundVisualTrans.getWorldPosition());
  }

  onSliderEnd() {
    this.desiredAlpha = 0;
  }

  showSlider(calibrationTrans: Transform) {
    this.groundVisualPos = vec3.zero();
    const desiredPosition = calibrationTrans.getWorldPosition();
    let desiredRotation = calibrationTrans.getWorldRotation();
    if (global.deviceInfoSystem.isEditor()) {
      desiredRotation = desiredRotation.multiply(
        quat.fromEulerVec(new vec3(-Math.PI / 2, 0, 0))
      );
    }
    //set parent position and rotation
    this.trans.setWorldPosition(desiredPosition);
    this.trans.setWorldRotation(desiredRotation);
    //slider section scale in
    animate({
      easing: "ease-out-elastic",
      duration: 1,
      update: (t: number) => {
        this.trans.setWorldScale(
          vec3.lerp(vec3.zero(), vec3.one().uniformScale(SLIDER_SCALE), t)
        );
      },
      ended: null,
      cancelSet: new CancelSet(),
    });

    //slider offset position
    const sliderTrans = this.getSceneObject().getChild(0).getTransform();
    sliderTrans.setLocalPosition(
      this.sliderOffsetPos.uniformScale(SLIDER_SCALE)
    );
  }
}
