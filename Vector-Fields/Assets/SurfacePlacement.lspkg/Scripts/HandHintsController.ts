import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindLateUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Specs Inc. 2026
 * Hand and mobile hint animation controller for onboarding during surface placement. Plays targeted
 * animations (mobile tap, far pinch, hand touch) from AnimationPlayer clips, smoothly scales hints
 * in/out with lerp-based transitions, anchors hints to specified transforms for world-space positioning,
 * and manages hint visibility based on platform (mobile vs hand tracking) for contextual user guidance.
 */
@component
export class HandHintsController extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Platform Configuration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Mobile device visual for tap hints</span>')

  @input mobileDeviceObject: SceneObject;

  private desiredScale: vec3 = vec3.zero();

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
  private logger: Logger;  private trans: Transform = null;
  private anchorTrans: Transform = null;
  private animationPlayer: AnimationPlayer = null;  /**
   * Called when component is initialized
   */
  onAwake(): void {
    // Initialize logger
    this.logger = new Logger("HandHintsController", this.enableLogging || this.enableLoggingLifecycle, true);

    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake() - Component initializing");
    }


    this.animationPlayer =
      this.getSceneObject().getComponent("AnimationPlayer");
    this.resetPlayer();
    this.trans = this.getSceneObject().getTransform();
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));

    this.enableHint(this.getSceneObject().getParent().getTransform());
    this.playHandTouchSurface();
  }

  private onUpdate() {
    this.trans.setWorldScale(
      vec3.lerp(
        this.trans.getWorldScale(),
        this.desiredScale,
        getDeltaTime() * 6
      )
    );
    if (this.anchorTrans != null) {
      this.trans.setWorldPosition(this.anchorTrans.getWorldPosition());
      this.trans.setWorldRotation(this.anchorTrans.getWorldRotation());
      this.trans.setLocalScale(this.anchorTrans.getLocalScale());
    }
  }

  private resetPlayer() {
    this.mobileDeviceObject.enabled = false;
    for (let i = 0; i < this.animationPlayer.clips.length; i++) {
      this.animationPlayer.clips[i].disabled = true;
    }
  }

  enableHint(anchor: Transform) {
    this.desiredScale = vec3.one();
    this.anchorTrans = anchor;
  }

  disableHint() {
    this.desiredScale = vec3.zero();
    this.trans.setWorldScale(vec3.zero());
    this.anchorTrans = null;
  }

  playMobileTap() {
    this.resetPlayer();
    this.mobileDeviceObject.enabled = true;
    this.animationPlayer.getClip("Controller_Tap").disabled = false;
  }

  playFarPinch() {
    this.resetPlayer();
    this.animationPlayer.getClip("Pinch_Far").disabled = false;
  }

  playHandTouchSurface() {
    this.resetPlayer();
    this.animationPlayer.getClip("Palm_Touch_Near").disabled = false;
  }

  playFarDrag() {
    this.resetPlayer();
    this.animationPlayer.getClip("Pinch_Move_X").disabled = false;
  }
}
