/**
 * Specs Inc. 2026
 * Manual hover state controller for RoundButton components. Programmatically triggers hover enter/exit
 * states on button visual elements, bypasses normal interaction flow for forced state changes, enables
 * custom hover effects, and provides debug logging for hover event tracking during development.
 */
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { StateName } from "SpectaclesUIKit.lspkg/Scripts/Components/Element";
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
@component
export class ForceHover extends BaseScriptComponent {
  private roundButton: RoundButton = null;

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    this.roundButton = this.getSceneObject().getComponent(
      RoundButton.getTypeName()
    );
  }

  onHoverEnter() {
    print("ForceHover onHoverEnter");
    this.roundButton.visual.setState(StateName.hover);
  }

  onHoverExit() {
    print("ForceHover onHoverExit");
    this.roundButton.visual.setState(StateName.default);
  }
}
