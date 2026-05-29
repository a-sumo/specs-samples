import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindLateUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Specs Inc. 2026
 * Dynamic dotted line renderer for visual feedback between two points. Calculates real-time distance
 * between line start and end transforms, remaps distance to shader length parameter for visual scaling,
 * updates continuously via UpdateEvent, and provides animated line effect for showing placement height
 * adjustments and surface relationships.
 */
@component
export class DotsLine extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Line Configuration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">End point for dotted line</span>')

  @input lineEndObj: SceneObject;

  private lineStartTrans: Transform = null;

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
  private logger: Logger;  private lineEndTrans: Transform = null;

  private rend = this.getSceneObject().getComponent(
    "Component.RenderMeshVisual"
  );  /**
   * Called when component is initialized
   */
  onAwake(): void {
    // Initialize logger
    this.logger = new Logger("DotsLine", this.enableLogging || this.enableLoggingLifecycle, true);

    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake() - Component initializing");
    }


    this.lineStartTrans = this.getSceneObject().getTransform();
    this.lineEndTrans = this.lineEndObj.getTransform();
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
  }

  onUpdate() {
    const distance = this.lineStartTrans
      .getWorldPosition()
      .distance(this.lineEndTrans.getWorldPosition());
    this.rend.mainPass.Length = MathUtils.remap(distance, 0, 150, 0, 25);
  }
}
