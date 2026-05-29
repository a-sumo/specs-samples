/**
 * Specs Inc. 2026
 * Base surface detection class for AR placement with visual feedback and hit testing. Creates and manages
 * HitTestSession for surface queries, animates circle indicator with scale transitions, updates hint
 * anchor position during detection, handles hover enter/exit for instruction text changes, detects mobile
 * connection state for platform-specific hints, and coordinates calibration workflow with completion callbacks.
 */
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";

import { CircleAnimation } from "../Scripts/CircleAnimation";
import { HandHintsController } from "./HandHintsController";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindLateUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators";

@component
export class SurfaceDetector extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Visual Feedback</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Circle animation and hint components</span>')

  @input
  circleAnim: CircleAnimation;

  @input
  hintAnchor: SceneObject;

  @allowUndefined
  @input
  confirmText: Text;

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
  private logger: Logger;  protected cameraTransform: Transform =
    WorldCameraFinderProvider.getInstance().getTransform();
  protected hitTestSession = null;
  protected onCompleteCallback = null;
  protected onAnimCompleteCallback = null;
  protected trans = this.getSceneObject().getTransform();

  private updateEvent = null;
  private worldQueryModule = null;

  private visualParentTrans = this.getSceneObject().getChild(0).getTransform();
  private animCancel: CancelSet = new CancelSet();

  private iconTrans = null;

  protected mobileConnected = false;

  protected isCalibrationRunning = false;

  protected handHintController: HandHintsController = null;  /**
   * Called when component is initialized
   */
  onAwake(): void {
    // Initialize logger
    this.logger = new Logger("SurfaceDetector", this.enableLogging || this.enableLoggingLifecycle, true);

    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake() - Component initializing");
    }


    this.visualParentTrans.setLocalScale(vec3.zero());
    this.iconTrans = this.circleAnim.getSceneObject().getTransform();
  }

  init(handHints: HandHintsController) {
    this.handHintController = handHints;
    this.onMobileConnnectionStateChange(this.isMobileConnected());
  }

  onDestroy() {
    this.logger.debug("SurfaceDetector destroyed");
    if (this.hitTestSession != null) {
      this.hitTestSession.stop();
      this.hitTestSession = null;
    }
    if (this.updateEvent != null) {
      this.removeEvent(this.updateEvent);
      this.updateEvent = null;
    }
    if (this.animCancel) this.animCancel.cancel();
  }

  startSurfaceCalibration(callback: (pos: vec3, rot: quat) => void): void {
    this.isCalibrationRunning = true;
    this.circleAnim.reset();
    this.animateVisuals(true, null);
    this.onCompleteCallback = callback;
    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(this.update.bind(this));
  }

  onHoverEnter() {
    //change instruction text
    if (this.confirmText != null) {
      this.confirmText.text = "Drag to Move";
    }
  }

  onHoverExit() {
    //change instruction text
    if (this.confirmText != null && this.isCalibrationRunning) {
      this.confirmText.text = this.isMobileConnected()
        ? "Tap to Confirm"
        : "Pinch to Confirm";
    }
  }

  onInteractionCanceled() {}

  onInteractionStart() {}

  onInteractionEnd() {}

  protected isLookingAtCalibrationIcon() {
    const camComp = this.cameraTransform.getSceneObject().getComponent("Camera");
    return camComp.isSphereVisible(this.iconTrans.getWorldPosition(), 10);
  }

  protected animateVisuals(animateIn: boolean, callback: () => void) {
    if (this.animCancel) this.animCancel.cancel();
    const start = animateIn ? vec3.zero() : vec3.one();
    const end = animateIn ? vec3.one() : vec3.zero();
    const easingType = animateIn
      ? ("ease-out-cubic" as const)
      : ("ease-in-cubic" as const);
    animate({
      easing: easingType,
      duration: 0.5,
      update: (t: number) => {
        this.visualParentTrans.setLocalScale(vec3.lerp(start, end, t));
      },
      ended: callback,
      cancelSet: this.animCancel,
    });
  }

  protected startHitTestSession() {
    try {
      this.worldQueryModule =
        require("LensStudio:WorldQueryModule") as WorldQueryModule;
      const options = HitTestSessionOptions.create();
      options.filter = true;
      this.hitTestSession =
        this.worldQueryModule.createHitTestSessionWithOptions(options);
      this.hitTestSession.start();
    } catch (e) {
      this.logger.debug("Hit test error: " + e);
    }
  }

  protected onMobileConnnectionStateChange(isConnected: boolean) {
    //change instruction text
    if (this.confirmText != null) {
      this.confirmText.text = isConnected
        ? "Tap to Confirm"
        : "Pinch to Confirm";
    }
  }

  protected isMobileConnected() {
    return SIK.MobileInputData.isAvailable();
  }

  protected update() {
    const isMobileAvailable = SIK.MobileInputData.isAvailable();
    if (this.mobileConnected != isMobileAvailable) {
      this.mobileConnected = isMobileAvailable;
      this.onMobileConnnectionStateChange(this.mobileConnected);
    }
  }

  protected onCalibrationComplete(callback: () => void) {
    this.isCalibrationRunning = false;
    this.logger.debug("Calibration complete..");
    //remove events
    this.removeEvent(this.updateEvent);
    this.updateEvent = null;
    //delay stop hit test session
    const delay = this.createEvent("DelayedCallbackEvent");
    delay.bind(() => {
      if (this.hitTestSession != null) {
        this.logger.debug("Stopping hit test session...");
        this.hitTestSession.stop();
        this.hitTestSession = null;
      }
    });
    delay.reset(0.1);
    //play audio
    this.getSceneObject()
      .getParent()
      .getComponent("Component.AudioComponent")
      .play(1);

    //animate circle
    this.onAnimCompleteCallback = callback;
    this.circleAnim.animateCircleIn(() => {
      this.animateVisuals(false, this.onAnimCompleteCallback());
    });
  }
}
