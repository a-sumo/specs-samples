// SIKCursorRenderPriority.ts
// Keeps the stock Spectacles Interaction Kit cursor visible above authored UI.

import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";

@component
export class SIKCursorRenderPriority extends BaseScriptComponent {
    @input
    @hint("Render order assigned to SIK's runtime InteractorCursor visuals.")
    cursorRenderOrder: number = 20000;

    @input
    @hint("When enabled, cursor materials ignore scene depth so they remain visible over UI cards.")
    disableCursorDepthTest: boolean = true;

    private configuredVisuals: SceneObject[] = [];

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.applyCursorPriority());
        this.createEvent("UpdateEvent").bind(() => this.applyCursorPriority());
    }

    private applyCursorPriority(): void {
        const cursors = this.getSikCursors();
        for (let i = 0; i < cursors.length; i++) {
            const cursor = cursors[i] as any;
            try { cursor.renderOrder = this.cursorRenderOrder; } catch (e) {}

            const visual = this.getCursorVisual(cursor);
            if (visual) {
                this.configureVisualObject(visual, this.cursorRenderOrder);
            }
        }
    }

    private getSikCursors(): any[] {
        try {
            const controller = (SIK as any).CursorController;
            if (controller && typeof controller.getAllCursors === "function") {
                return controller.getAllCursors() as any[];
            }
        } catch (e) {}
        return [];
    }

    private getCursorVisual(cursor: any): SceneObject | null {
        try {
            if (cursor && cursor.visual) {
                return cursor.visual as SceneObject;
            }
        } catch (e) {}
        return null;
    }

    private configureVisualObject(object: SceneObject, renderOrder: number): void {
        if (this.hasConfiguredVisual(object)) return;
        this.configuredVisuals.push(object);

        const visuals = object.getComponents("Component.RenderMeshVisual");
        for (let i = 0; i < visuals.length; i++) {
            const visual = visuals[i] as RenderMeshVisual;
            try { visual.setRenderOrder(renderOrder); } catch (e) {}
            try { (visual as any).renderOrder = renderOrder; } catch (e) {}

            const material = visual.mainMaterial;
            if (material) {
                this.configureMaterial(material);
            }
        }
    }

    private configureMaterial(material: Material): void {
        const pass = this.getMainPass(material);
        if (!pass) return;

        if (this.disableCursorDepthTest) {
            try { pass.depthTest = false; } catch (e) {}
            try { pass.DepthTest = false; } catch (e) {}
        }
        try { pass.depthWrite = false; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
        try { pass.twoSided = true; } catch (e) {}
        try { pass.TwoSided = true; } catch (e) {}
        try { pass.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        try { pass.BlendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
    }

    private getMainPass(material: Material): any {
        try {
            return material.mainPass as any;
        } catch (e) {
            return null;
        }
    }

    private hasConfiguredVisual(object: SceneObject): boolean {
        for (let i = 0; i < this.configuredVisuals.length; i++) {
            if (this.configuredVisuals[i] === object) return true;
        }
        return false;
    }
}
