/**
 * Specs Inc. 2026
 * Vertical surface detection and placement handler. Detects and tracks vertical surfaces like walls
 * for placing AR content with smooth transitions between surface detection states.
 */
import { SurfaceDetector } from "../Scripts/SurfaceDetector";
import { SingleSurface } from "../Scripts/SingleSurface";
import { HandHintsController } from "./HandHintsController";

// Set min and max hit distance to surfaces
const MAX_HIT_DISTANCE = 1000;
const MIN_HIT_DISTANCE = 50;
const STATE_SWITCH_THRESHOLD = 15; // Number of frames to switch default pose and surface pose (so it doesnt flicker)
const DEFAULT_SCREEN_DISTANCE = 200; // Distance in cm from camera to visual when no surface is hit

@component
export class Vertical extends SurfaceDetector {
  @input
  step1: SceneObject;

  @input
  step2: SceneObject;

  private singleSurface: SingleSurface;
  private currStateCount = 0;
  private currSurfaceDetected = false;

  onAwake() {
    super.onAwake();
    this.singleSurface = this.getSceneObject().getComponent(
      SingleSurface.getTypeName()
    );
  }

  init(handHints: HandHintsController) {
    super.init(handHints);
    this.singleSurface.init(
      this.cameraTransform,
      this.trans,
      DEFAULT_SCREEN_DISTANCE
    );
  }

  onHoverEnter() {
    if (!this.isCalibrationRunning) {
      return;
    }
    super.onHoverEnter();
    this.circleAnim.setLoadingColor(false);
  }

  onHoverExit() {
    if (!this.isCalibrationRunning) {
      return;
    }
    super.onHoverExit();
    this.circleAnim.setLoadingColor(true);
  }

  onInteractionCanceled() {
    super.onInteractionCanceled();
    this.circleAnim.animateCircleIn(null);
    this.circleAnim.setLoadingColor(true);
    this.circleAnim.enableScanAnimation(true);
  }

  onInteractionStart() {
    if (!this.isCalibrationRunning) {
      return;
    }

    super.onInteractionStart();
    if (this.step1.enabled) {
      return;
    }
    this.circleAnim.animateCircleOut(null);
    this.circleAnim.enableScanAnimation(false);
    this.handHintController.disableHint();
  }

  onInteractionEnd() {
    if (!this.isCalibrationRunning) {
      return;
    }

    super.onInteractionEnd();
    if (
      this.hitTestSession != null &&
      this.step2.enabled &&
      super.isLookingAtCalibrationIcon()
    ) {
      this.startCalibrationComplete();
    } else {
      this.onInteractionCanceled();
    }
  }

  private playHandHint(isMobile: boolean) {
    if (isMobile) {
      this.handHintController.playMobileTap();
      this.hintAnchor
        .getTransform()
        .setLocalRotation(
          quat.fromEulerVec(new vec3(-30 * MathUtils.DegToRad, 0, 0))
        );
    } else {
      this.handHintController.playFarPinch();
      this.hintAnchor
        .getTransform()
        .setLocalRotation(quat.fromEulerVec(vec3.zero()));
    }
  }

  protected onMobileConnnectionStateChange(isConnected: boolean) {
    super.onMobileConnnectionStateChange(isConnected);
  }

  private setCircleColor(isTracking: boolean) {
    const dotColor = isTracking ? new vec4(1, 1, 0, 1) : new vec4(1, 1, 1, 1);
    this.circleAnim.setCircleColor(dotColor);
    this.circleAnim.enableScanAnimation(isTracking);
  }

  private startCalibrationComplete() {
    this.isCalibrationRunning = false;
    super.onCalibrationComplete(this.invokeCalibrationComplete.bind(this));
  }

  private invokeCalibrationComplete() {
    this.onCompleteCallback(
      this.singleSurface.desiredPosition,
      this.singleSurface.desiredRotation
    );
  }

  startSurfaceCalibration(callback: (pos: vec3, rot: quat) => void): void {
    this.handHintController.disableHint();
    this.enableStep1(true);
    this.currSurfaceDetected = false;
    this.isCalibrationRunning = true;
    super.startSurfaceCalibration(callback);
    this.startHitTestSession();
    this.singleSurface.startCalibration();
    this.circleAnim.setLoadingColor(true);
  }

  protected update() {
    super.update();
    if (!this.isCalibrationRunning) {
      return;
    }
    if (this.singleSurface.hasFoundPlane()) {
      this.singleSurface.adjustPosition();
    } else {
      this.singleSurface.runHitTest(
        this.hitTestSession,
        MIN_HIT_DISTANCE,
        MAX_HIT_DISTANCE,
        false,
        this.onHitTestResult.bind(this)
      );
    }
    this.singleSurface.interpolatePositionVisuals();
  }

  private enableStep1(enabled: boolean) {
    this.step1.enabled = enabled;
    this.step2.enabled = !enabled;
    this.setCircleColor(!enabled);
    this.circleAnim.getSceneObject().getComponent("ColliderComponent").enabled =
      !enabled;
    if (!enabled) {
      this.handHintController.enableHint(this.hintAnchor.getTransform());
      this.playHandHint(this.isMobileConnected());
    } else {
      this.handHintController.disableHint();
    }
  }

  private onHitTestResult(hitTestResult) {
    if (!this.isCalibrationRunning || this.singleSurface.hasFoundPlane()) {
      return;
    }
    let foundPosition = vec3.zero();
    let foundNormal = vec3.zero();
    if (hitTestResult != null) {
      foundPosition = hitTestResult.position;
      foundNormal = hitTestResult.normal;
    }
    this.updateCalibration(foundPosition, foundNormal);
  }

  private updateCalibration(foundPosition: vec3, foundNormal: vec3) {
    const camPos = this.cameraTransform.getWorldPosition();

    this.singleSurface.desiredPosition = camPos.add(
      this.cameraTransform.forward.uniformScale(-DEFAULT_SCREEN_DISTANCE)
    );
    this.singleSurface.desiredRotation = quat.lookAt(
      this.cameraTransform.forward,
      vec3.up()
    );

    //check if vertical plane is being tracking
    let foundVerticalPlane =
      Math.abs(foundNormal.y) < 0.15 && Math.abs(foundNormal.y) > 0.0001;
    //check for state change
    if (this.currSurfaceDetected != foundVerticalPlane) {
      this.currStateCount = 0;
    }
    foundVerticalPlane ? this.currStateCount++ : this.currStateCount--;

    //set UI based on current state
    if (Math.abs(this.currStateCount) > STATE_SWITCH_THRESHOLD) {
      foundVerticalPlane = this.currStateCount > 0;
      if (foundVerticalPlane != this.step2.enabled) {
        this.enableStep1(!foundVerticalPlane);
      }
    }

    this.currSurfaceDetected = foundVerticalPlane;

    if (this.step2.enabled) {
      this.singleSurface.useDefaultHeight = false;
      this.singleSurface.desiredPosition = foundPosition;
      //make sure this is perpendicular to vec3.up()
      const projectedNormal = new vec3(foundNormal.x, 0.0, foundNormal.z);
      this.singleSurface.desiredRotation = quat.lookAt(
        projectedNormal.normalize(),
        vec3.up()
      );
    }

    this.singleSurface.desiredRotation =
      this.singleSurface.desiredRotation.multiply(
        quat.fromEulerVec(new vec3(Math.PI / 2, 0, 0))
      );
  }
}
