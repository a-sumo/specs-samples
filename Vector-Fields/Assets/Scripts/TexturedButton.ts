// TexturedButton.ts
// A SIK-driven button whose VISUAL is a custom texture (e.g. an HTML/CSS
// design baked to a compressed PNG) instead of a stock SIK button. The SIK
// Interactable + Collider on the quad does the hit-testing; this script swaps
// the texture for hover/press feedback and fires an action on release.
//
// Wire it to the globe by setting `globeRotator` to the object holding the
// GlobeSurfaceRotator — pressing the button then calls returnToRest().
// Other scripts can also subscribe via the public `onPress` API.

@component
export class TexturedButton extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Object with the SIK Interactable + Collider. Defaults to this SceneObject.")
    interactableObject: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Image to retexture for feedback. Defaults to an Image or RenderMeshVisual on this object.")
    image: Image = null as any;

    @input
    @allowUndefined
    @hint("Default button texture.")
    normalTex: Texture = null as any;

    @input
    @allowUndefined
    @hint("Texture while hovered/targeted (optional).")
    hoverTex: Texture = null as any;

    @input
    @allowUndefined
    @hint("Texture while pressed (optional).")
    pressedTex: Texture = null as any;

    @input
    @allowUndefined
    @hint("Texture shown while toggled ON (optional, only used when 'isToggle' is set).")
    activeTex: Texture = null as any;

    @input
    @allowUndefined
    @hint("Optional: object with a GlobeSurfaceRotator (or any script exposing the action method).")
    globeRotator: SceneObject = null as any;

    @input
    @hint("Method to call on the rotator each press, e.g. toggleVerticalSpin, toggleRollLock, unlockAll, returnToRest.")
    action: string = "toggleVerticalSpin";

    @input
    @hint("If on, this button latches: alternates state each press and shows activeTex while ON.")
    isToggle: boolean = true;

    private interactable: any = null;
    private rotatorApi: any = null;
    private visual: any = null;
    private hovered: boolean = false;
    private toggled: boolean = false;
    private onPressCallbacks: Array<() => void> = [];
    private proxyApi: any = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bind());
    }

    /** Subscribe to button presses. */
    public onPress(callback: () => void): void {
        if (callback) this.onPressCallbacks.push(callback);
    }

    private bind(): void {
        const owner = this.interactableObject ? this.interactableObject : this.sceneObject;
        this.visual = this.image
            || this.sceneObject.getComponent("Component.Image")
            || this.sceneObject.getComponent("Component.RenderMeshVisual");
        this.rotatorApi = this.findRotator();
        this.interactable = this.findInteractable(owner);

        if (!this.interactable) {
            print("TexturedButton: add a SIK Interactable + Collider to " + owner.name);
            return;
        }

        this.applyTexture(this.baseTexture());
        this.listen(this.interactable.onHoverEnter, () => this.setHovered(true));
        this.listen(this.interactable.onHoverExit, () => this.setHovered(false));
        this.listen(this.interactable.onTriggerStart, () => this.applyTexture(this.pressedTex || this.hoverTex || this.baseTexture()));
        this.listen(this.interactable.onTriggerEnd, () => this.fire(true));
        this.listen(this.interactable.onTriggerEndOutside, () => this.fire(false));
        this.listen(this.interactable.onTriggerCanceled, () => this.fire(false));
    }

    private setHovered(hovered: boolean): void {
        this.hovered = hovered;
        this.applyTexture(this.restingTexture());
    }

    // Only counts as a press when the release happened inside the button.
    private fire(inside: boolean): void {
        if (inside) {
            this.deactivateProxyForContentInteraction();
            if (this.isToggle) this.toggled = !this.toggled;
            this.performAction();
            for (let i = 0; i < this.onPressCallbacks.length; i++) {
                this.onPressCallbacks[i]();
            }
        }
        this.applyTexture(this.restingTexture());
    }

    private performAction(): void {
        if (this.rotatorApi && this.action && typeof this.rotatorApi[this.action] === "function") {
            this.rotatorApi[this.action]();
        }
    }

    // Texture for the unpressed state, accounting for toggle latch.
    private baseTexture(): Texture {
        if (this.isToggle && this.toggled && this.activeTex) return this.activeTex;
        return this.normalTex;
    }

    private restingTexture(): Texture {
        return this.hovered ? (this.hoverTex || this.baseTexture()) : this.baseTexture();
    }

    private applyTexture(tex: Texture): void {
        if (!tex || !this.visual || !this.visual.mainPass) return;
        this.visual.mainPass.baseTex = tex;
    }

    private findRotator(): any {
        if (!this.globeRotator) return null;
        const scripts = this.globeRotator.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate && (typeof candidate[this.action] === "function" || typeof candidate.returnToRest === "function")) {
                return candidate;
            }
        }
        return null;
    }

    private findInteractable(object: SceneObject): any {
        const scripts = object.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate && candidate.onTriggerEnd && typeof candidate.onTriggerEnd.add === "function") {
                return candidate;
            }
        }
        return null;
    }

    private deactivateProxyForContentInteraction(): void {
        const api = this.proxyApi || this.findProxyApi();
        this.proxyApi = api;
        if (!api) return;
        try {
            if (typeof api.deactivateForContentInteraction === "function") {
                api.deactivateForContentInteraction();
            } else if (typeof api.notifyContentInteractionStart === "function") {
                api.notifyContentInteractionStart();
            } else if (typeof api.setActive === "function") {
                api.setActive(false);
            } else if (typeof api.cancelAndDock === "function") {
                api.cancelAndDock();
            }
        } catch (e) {}
    }

    private findProxyApi(): any {
        const root = this.findObjectByName("ProxyInteractionPlane");
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (
                candidate &&
                (typeof candidate.deactivateForContentInteraction === "function" ||
                    typeof candidate.notifyContentInteractionStart === "function" ||
                    typeof candidate.setActive === "function" ||
                    typeof candidate.cancelAndDock === "function")
            ) {
                return candidate;
            }
        }
        return null;
    }

    private findObjectByName(name: string): SceneObject | null {
        for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
            const found = this.findInTree(global.scene.getRootObject(i), name);
            if (found) return found;
        }
        return null;
    }

    private findInTree(root: SceneObject, name: string): SceneObject | null {
        if (root.name === name) return root;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const found = this.findInTree(root.getChild(i), name);
            if (found) return found;
        }
        return null;
    }

    private listen(event: any, callback: () => void): void {
        if (!event) return;
        if (typeof event.add === "function") event.add(callback);
        else if (typeof event === "function") event(callback);
    }
}
