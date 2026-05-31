// @ts-nocheck
// VectorFieldUIStyle.ts
//
// Custom toon UI shell for Vector Fields. SIK/UIKit components keep all
// interaction behavior; this script only replaces visible button surfaces.

export type FieldButtonBinding = {
    button: SceneObject;
    fillObject: SceneObject;
    frameObject: SceneObject;
    labelObject: SceneObject | null;
    fillPass: any;
    framePass: any;
    defaultFill: vec4;
    hoverFill: vec4;
    pressedFill: vec4;
    selectedFill: vec4;
    frameFill: vec4;
    hovered: boolean;
    pressed: boolean;
    selected: boolean;
    currentScale: vec3;
    targetScale: vec3;
};

export type FieldButtonOptions = {
    widthCm?: number;
    heightCm?: number;
    depthCm?: number;
    cornerRadiusCm?: number;
    frameThicknessCm?: number;
    labelFontSize?: number;
    labelInsetCm?: number;
    renderOrder?: number;
    paletteIndex?: number;
    buttonMaterial?: Material | null;
};

export type FieldPanelBinding = {
    panel: SceneObject;
    backplateObject: SceneObject;
    frameObject: SceneObject;
    accentObjects: SceneObject[];
    backplatePass: any;
    framePass: any;
};

export type FieldPanelOptions = {
    widthCm?: number;
    heightCm?: number;
    depthCm?: number;
    offsetXCm?: number;
    offsetYCm?: number;
    cornerRadiusCm?: number;
    frameThicknessCm?: number;
    renderOrder?: number;
    panelMaterial?: Material | null;
    backplateColor?: vec4;
    frameColor?: vec4;
};

type FieldPalette = {
    fill: vec4;
    hover: vec4;
    pressed: vec4;
    selected: vec4;
    frame: vec4;
    text: vec4;
    textOutline: vec4;
};

const FILL_NAME = "__FieldButtonFill";
const FRAME_NAME = "__FieldButtonFrame";
const PANEL_BACKPLATE_NAME = "__FieldPanelBackplate";
const PANEL_FRAME_NAME = "__FieldPanelFrame";
const PANEL_ACCENT_NAME = "__FieldPanelAccent";

const PANEL = new vec4(0.38, 0.38, 0.39, 0.97);
const PANEL_FRAME = new vec4(0.92, 0.92, 0.88, 1.0);
const BUTTON = new vec4(0.34, 0.34, 0.35, 1.0);
const BUTTON_ALT = new vec4(0.40, 0.40, 0.40, 1.0);
const BUTTON_HOVER = new vec4(0.52, 0.52, 0.50, 1.0);
const BUTTON_PRESSED = new vec4(0.28, 0.28, 0.29, 1.0);
const BUTTON_SELECTED = new vec4(0.24, 0.24, 0.25, 1.0);
const BUTTON_FRAME = new vec4(0.88, 0.88, 0.84, 1.0);
const INK = new vec4(0.08, 0.08, 0.09, 1.0);
const WHITE = new vec4(1.0, 0.98, 0.94, 1.0);

const PALETTES: FieldPalette[] = [
    { fill: BUTTON, hover: BUTTON_HOVER, pressed: BUTTON_PRESSED, selected: BUTTON_SELECTED, frame: BUTTON_FRAME, text: WHITE, textOutline: INK },
    { fill: BUTTON_ALT, hover: BUTTON_HOVER, pressed: BUTTON_PRESSED, selected: BUTTON_SELECTED, frame: BUTTON_FRAME, text: WHITE, textOutline: INK },
    { fill: new vec4(0.31, 0.31, 0.32, 1.0), hover: BUTTON_HOVER, pressed: BUTTON_PRESSED, selected: BUTTON_SELECTED, frame: BUTTON_FRAME, text: WHITE, textOutline: INK },
    { fill: new vec4(0.43, 0.43, 0.42, 1.0), hover: BUTTON_HOVER, pressed: BUTTON_PRESSED, selected: BUTTON_SELECTED, frame: BUTTON_FRAME, text: WHITE, textOutline: INK },
];

@component
export class VectorFieldUIStyle extends BaseScriptComponent {
    static preparePanel(panel: SceneObject | null, options?: FieldPanelOptions): FieldPanelBinding | null {
        if (!panel) return null;

        const width = Math.max(4.0, options?.widthCm || 34.0);
        const height = Math.max(4.0, options?.heightCm || 26.0);
        const depth = Math.max(0.08, options?.depthCm || 0.34);
        const offsetX = options?.offsetXCm || 0.0;
        const offsetY = options?.offsetYCm || 0.0;
        const radius = Math.max(0.0, options?.cornerRadiusCm || 1.2);
        const frame = Math.max(0.03, options?.frameThicknessCm || 0.32);
        const renderOrder = Math.floor(options?.renderOrder ?? 8);
        const backplateColor = options?.backplateColor || PANEL;
        const frameColor = options?.frameColor || PANEL_FRAME;
        const sourceMaterial = options?.panelMaterial || this.findFirstMaterial(panel);

        const frameObject = this.ensureDirectChild(panel, PANEL_FRAME_NAME);
        const backplateObject = this.ensureDirectChild(panel, PANEL_BACKPLATE_NAME);
        const frameRmv = this.ensureVisual(frameObject, sourceMaterial);
        const backplateRmv = this.ensureVisual(backplateObject, sourceMaterial);

        this.configureSurfaceAt(frameObject, frameRmv, width + frame * 2.0, height + frame * 2.0, depth * 0.88, radius + frame, offsetX, offsetY, -0.24, frameColor, renderOrder);
        this.configureSurfaceAt(backplateObject, backplateRmv, width, height, depth, radius, offsetX, offsetY, -0.16, backplateColor, renderOrder + 1);

        const accents: SceneObject[] = [];
        for (let i = 0; i < 8; i++) {
            const accent = this.findDirectChild(panel, PANEL_ACCENT_NAME + i);
            if (accent) accent.enabled = false;
        }

        this.disableOwnRenderMesh(panel);
        return {
            panel: panel,
            backplateObject: backplateObject,
            frameObject: frameObject,
            accentObjects: accents,
            backplatePass: backplateRmv.mainMaterial ? backplateRmv.mainMaterial.mainPass : null,
            framePass: frameRmv.mainMaterial ? frameRmv.mainMaterial.mainPass : null,
        };
    }

    static prepareButton(button: SceneObject | null, label: string, options?: FieldButtonOptions): FieldButtonBinding | null {
        if (!button) return null;

        const width = Math.max(1.0, options?.widthCm || 6.0);
        const height = Math.max(0.7, options?.heightCm || 2.35);
        const depth = Math.max(0.12, options?.depthCm || 0.46);
        const radius = Math.max(0.03, options?.cornerRadiusCm || 0.46);
        const frame = Math.max(0.03, options?.frameThicknessCm || 0.16);
        const renderOrder = Math.floor(options?.renderOrder ?? 70);
        const palette = this.palette(options?.paletteIndex || 0);
        const sourceMaterial = options?.buttonMaterial || this.findFirstMaterial(button);

        this.resizeUIKitButton(button, width, height, Math.max(1.0, depth * 3.0));

        const frameObject = this.ensureDirectChild(button, FRAME_NAME);
        const fillObject = this.ensureDirectChild(button, FILL_NAME);
        const frameRmv = this.ensureVisual(frameObject, sourceMaterial);
        const fillRmv = this.ensureVisual(fillObject, sourceMaterial);

        this.configureSurface(frameObject, frameRmv, width + frame * 2.0, height + frame * 2.0, depth * 0.82, radius + frame, -0.05, palette.frame, renderOrder);
        this.configureSurface(fillObject, fillRmv, width, height, depth, radius, 0.04, palette.fill, renderOrder + 1);
        this.disableStockRenderMeshes(button, fillObject, frameObject);
        this.disableText3D(button);

        const labelObject = this.configureLabel(button, label, width, height, depth, palette, options, renderOrder + 2);
        const binding: FieldButtonBinding = {
            button: button,
            fillObject: fillObject,
            frameObject: frameObject,
            labelObject: labelObject,
            fillPass: fillRmv.mainMaterial ? fillRmv.mainMaterial.mainPass : null,
            framePass: frameRmv.mainMaterial ? frameRmv.mainMaterial.mainPass : null,
            defaultFill: palette.fill,
            hoverFill: palette.hover,
            pressedFill: palette.pressed,
            selectedFill: palette.selected,
            frameFill: palette.frame,
            hovered: false,
            pressed: false,
            selected: false,
            currentScale: new vec3(1, 1, 1),
            targetScale: new vec3(1, 1, 1),
        };
        this.bindFeedback(button, binding);
        this.applyState(binding);
        return binding;
    }

    static configureText(text: Text | null, color?: vec4, outline?: vec4, renderOrder?: number): void {
        if (!text) return;
        const t = text as any;
        const fill = color || WHITE;
        const stroke = outline || INK;
        try {
            if (t.textColor !== undefined) t.textColor = fill;
            if (t.Fill && t.Fill.Color !== undefined) t.Fill.Color = fill;
            if (t.fill && t.fill.color !== undefined) t.fill.color = fill;
            if (t.textFill && t.textFill.color !== undefined) t.textFill.color = fill;
            if (t.Outline) {
                t.Outline.Enabled = true;
                t.Outline.Size = 0.12;
                if (t.Outline.Fill && t.Outline.Fill.Color !== undefined) t.Outline.Fill.Color = stroke;
            }
            if (t.outlineSettings) {
                t.outlineSettings.enabled = true;
                t.outlineSettings.size = 0.12;
                if (t.outlineSettings.fill) t.outlineSettings.fill.color = stroke;
            }
            if (t.DepthTest !== undefined) t.DepthTest = false;
            if (t.depthTest !== undefined) t.depthTest = false;
            if (typeof renderOrder === "number") {
                const order = Math.floor(renderOrder);
                if (typeof t.setRenderOrder === "function") t.setRenderOrder(order);
                if (t.renderOrder !== undefined) t.renderOrder = order;
                if (t.RenderOrder !== undefined) t.RenderOrder = order;
            }
        } catch (e) {}
    }

    static setSelected(binding: FieldButtonBinding | null, selected: boolean): void {
        if (!binding || binding.selected === selected) return;
        binding.selected = selected;
        this.applyState(binding);
    }

    static update(binding: FieldButtonBinding | null): void {
        if (!binding) return;
        const a = 0.32;
        binding.currentScale = new vec3(
            binding.currentScale.x + (binding.targetScale.x - binding.currentScale.x) * a,
            binding.currentScale.y + (binding.targetScale.y - binding.currentScale.y) * a,
            binding.currentScale.z + (binding.targetScale.z - binding.currentScale.z) * a
        );
        binding.fillObject.getTransform().setLocalScale(binding.currentScale);
        binding.frameObject.getTransform().setLocalScale(binding.currentScale);
    }

    private static bindFeedback(button: SceneObject | null, binding: FieldButtonBinding): void {
        if (!button) return;
        const scripts = button.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate.onHoverEnter && typeof candidate.onHoverEnter.add === "function") {
                candidate.onHoverEnter.add(() => {
                    binding.hovered = true;
                    this.applyState(binding);
                });
            }
            if (candidate.onHoverExit && typeof candidate.onHoverExit.add === "function") {
                candidate.onHoverExit.add(() => {
                    binding.hovered = false;
                    binding.pressed = false;
                    this.applyState(binding);
                });
            }
            if (candidate.onTriggerStart && typeof candidate.onTriggerStart.add === "function") {
                candidate.onTriggerStart.add(() => {
                    binding.pressed = true;
                    this.applyState(binding);
                });
            }
            if (candidate.onTriggerEnd && typeof candidate.onTriggerEnd.add === "function") {
                candidate.onTriggerEnd.add(() => {
                    binding.pressed = false;
                    this.applyState(binding);
                });
            }
            if (candidate.onTriggerUp && typeof candidate.onTriggerUp.add === "function") {
                candidate.onTriggerUp.add(() => {
                    binding.pressed = false;
                    this.applyState(binding);
                });
            }
            if (candidate.onTriggerCanceled && typeof candidate.onTriggerCanceled.add === "function") {
                candidate.onTriggerCanceled.add(() => {
                    binding.pressed = false;
                    this.applyState(binding);
                });
            }
        }

        for (let i = 0; i < button.getChildrenCount(); i++) {
            this.bindFeedback(button.getChild(i), binding);
        }
    }

    private static applyState(binding: FieldButtonBinding): void {
        if (binding.pressed) {
            binding.targetScale = new vec3(0.98, 0.90, 0.80);
            this.setPassColor(binding.fillPass, binding.pressedFill);
        } else if (binding.hovered) {
            binding.targetScale = new vec3(1.05, 1.05, 1.08);
            this.setPassColor(binding.fillPass, binding.hoverFill);
        } else if (binding.selected) {
            binding.targetScale = new vec3(1.03, 1.03, 1.06);
            this.setPassColor(binding.fillPass, binding.selectedFill);
        } else {
            binding.targetScale = new vec3(1, 1, 1);
            this.setPassColor(binding.fillPass, binding.defaultFill);
        }
        this.setPassColor(binding.framePass, binding.frameFill);
    }

    private static configureSurface(object: SceneObject, rmv: RenderMeshVisual, width: number, height: number, depth: number, radius: number, z: number, color: vec4, renderOrder: number): void {
        const tr = object.getTransform();
        tr.setLocalPosition(new vec3(0, 0, z));
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1, 1, 1));

        const mb = this.makeMeshBuilder();
        this.addRoundedCuboid(mb, width, height, depth, radius, 5);
        rmv.mesh = mb.getMesh();
        mb.updateMesh();

        this.setPassColor(rmv.mainMaterial ? rmv.mainMaterial.mainPass : null, color);
        this.setRenderOrder(rmv, renderOrder);
    }

    private static configureSurfaceAt(object: SceneObject, rmv: RenderMeshVisual, width: number, height: number, depth: number, radius: number, x: number, y: number, z: number, color: vec4, renderOrder: number): void {
        this.configureSurface(object, rmv, width, height, depth, radius, z, color, renderOrder);
        object.getTransform().setLocalPosition(new vec3(x, y, z));
    }

    private static configureLabel(button: SceneObject, label: string, width: number, height: number, depth: number, palette: FieldPalette, options: FieldButtonOptions | undefined, renderOrder: number): SceneObject | null {
        const found = this.findFirstTextObject(button);
        if (!found) return null;

        const labelOffset = 0.24;
        const inset = Math.max(0, Math.min(width * 0.24, options?.labelInsetCm || 0.24));
        const rectWidth = Math.max(0.2, width - inset * 2.0);
        const rectHeight = Math.max(0.2, height - inset * 1.25);
        const tr = found.getTransform();
        tr.setLocalPosition(new vec3(0, 0, depth * 0.5 + labelOffset));
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(new vec3(1, 1, 1));

        const text = found.getComponent("Component.Text") as Text;
        const t = text as any;
        t.text = label;
        t.size = options?.labelFontSize || this.fitLabelFontSize(label, rectWidth, rectHeight);
        t.horizontalAlignment = HorizontalAlignment.Center;
        t.verticalAlignment = VerticalAlignment.Center;
        t.horizontalOverflow = HorizontalOverflow.Truncate;
        t.verticalOverflow = VerticalOverflow.Truncate;
        t.worldSpaceRect = Rect.create(-rectWidth * 0.5, rectWidth * 0.5, -rectHeight * 0.5, rectHeight * 0.5);
        this.configureText(text, palette.text, palette.textOutline, renderOrder);
        return found;
    }

    private static fitLabelFontSize(label: string, rectWidthCm: number, rectHeightCm: number): number {
        const chars = Math.max(4, label.length);
        const widthLimited = Math.floor((rectWidthCm * 75.0) / chars);
        const heightLimited = Math.floor(rectHeightCm * 28.0);
        return Math.max(18, Math.min(44, Math.min(widthLimited, heightLimited)));
    }

    private static resizeUIKitButton(button: SceneObject, width: number, height: number, depth: number): void {
        const scripts = button.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i] as any;
            try {
                if (s._size !== undefined) s._size = new vec3(width, height, depth);
                if (s.size !== undefined) s.size = new vec3(width, height, depth);
            } catch (e) {}
        }
    }

    private static ensureDirectChild(parent: SceneObject, name: string): SceneObject {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(parent);
        return child;
    }

    private static findDirectChild(parent: SceneObject, name: string): SceneObject | null {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
        }
        return null;
    }

    private static ensureVisual(object: SceneObject, sourceMaterial: Material | null): RenderMeshVisual {
        let rmv = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (!rmv) {
            rmv = object.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        if (sourceMaterial) {
            try {
                rmv.mainMaterial = sourceMaterial.clone();
            } catch (e) {
                rmv.mainMaterial = sourceMaterial;
            }
        }
        rmv.enabled = true;
        return rmv;
    }

    private static disableOwnRenderMesh(object: SceneObject): void {
        const rmv = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) rmv.enabled = false;
    }

    private static findFirstMaterial(object: SceneObject): Material | null {
        const rmv = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial) return rmv.mainMaterial;
        for (let i = 0; i < object.getChildrenCount(); i++) {
            const mat = this.findFirstMaterial(object.getChild(i));
            if (mat) return mat;
        }
        return null;
    }

    private static disableStockRenderMeshes(object: SceneObject, fillObject: SceneObject, frameObject: SceneObject): void {
        const isCustom = object === fillObject || object === frameObject || object.name === FILL_NAME || object.name === FRAME_NAME;
        if (!isCustom) {
            const rmv = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (rmv) rmv.enabled = false;
        }
        for (let i = 0; i < object.getChildrenCount(); i++) {
            this.disableStockRenderMeshes(object.getChild(i), fillObject, frameObject);
        }
    }

    private static findFirstTextObject(object: SceneObject): SceneObject | null {
        const text = object.getComponent("Component.Text") as Text;
        if (text) return object;
        for (let i = 0; i < object.getChildrenCount(); i++) {
            const found = this.findFirstTextObject(object.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private static disableText3D(object: SceneObject): void {
        const text3D = object.getComponent("Component.Text3D") as any;
        if (text3D) text3D.enabled = false;
        for (let i = 0; i < object.getChildrenCount(); i++) {
            this.disableText3D(object.getChild(i));
        }
    }

    private static setRenderOrder(rmv: RenderMeshVisual, renderOrder: number): void {
        const anyRmv = rmv as any;
        if (anyRmv && typeof anyRmv.setRenderOrder === "function") {
            anyRmv.setRenderOrder(renderOrder);
        }
        if (anyRmv && anyRmv.renderOrder !== undefined) {
            anyRmv.renderOrder = renderOrder;
        }
        if (anyRmv && anyRmv.RenderOrder !== undefined) {
            anyRmv.RenderOrder = renderOrder;
        }
    }

    private static setPassColor(pass: any, color: vec4): void {
        if (!pass) return;
        const rgb = new vec3(color.x, color.y, color.z);
        const emission = new vec3(color.x * 0.22, color.y * 0.22, color.z * 0.22);
        // Device builds often do not allow readback from Code Node uniforms even
        // when assignment is valid. Assign directly and catch per slot so a
        // missing alias does not prevent the real color uniform from being set.
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.baseColorFactor = color; } catch (e) {}
        try { pass.backgroundColor = color; } catch (e) {}
        try { pass.uColor = color; } catch (e) {}
        try { pass.color = color; } catch (e) {}
        try { pass.Port_FinalColor_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor1_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor2_N004 = color; } catch (e) {}
        try { pass.Port_FinalColor3_N004 = color; } catch (e) {}
        try { pass.Port_Value1_N000 = color; } catch (e) {}
        try { pass.Port_Value2_N000 = color; } catch (e) {}
        try { pass.Port_Albedo_N405 = rgb; } catch (e) {}
        try { pass.Port_Emissive_N405 = emission; } catch (e) {}
        try { pass.emissiveFactor = emission; } catch (e) {}
        try { pass.Port_Opacity_N405 = color.w; } catch (e) {}
        try { pass.Opacity = color.w; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.DepthTest = false; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
        try { pass.roughness = 1.0; } catch (e) {}
        try { pass.metallic = 0.0; } catch (e) {}
        try { pass.metalness = 0.0; } catch (e) {}
    }

    private static palette(index: number): FieldPalette {
        const i = Math.abs(Math.floor(index)) % PALETTES.length;
        return PALETTES[i];
    }

    private static makeMeshBuilder(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;
        return mb;
    }

    private static addRoundedCuboid(mb: MeshBuilder, width: number, height: number, depth: number, cornerRadius: number, cornerSegments: number): void {
        const hw = width * 0.5;
        const hh = height * 0.5;
        const hd = depth * 0.5;
        // Square corners for all field UI widgets. cornerRadius is kept in the
        // signature for compatibility but forced to 0 (straight corners).
        const r = 0;
        const perCorner = Math.max(2, Math.floor(cornerSegments));
        const points: vec3[] = [];

        this.addCorner(points, hw - r, hh - r, r, 0.0, 0.5 * Math.PI, perCorner);
        this.addCorner(points, -hw + r, hh - r, r, 0.5 * Math.PI, Math.PI, perCorner);
        this.addCorner(points, -hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI, perCorner);
        this.addCorner(points, hw - r, -hh + r, r, 1.5 * Math.PI, 2.0 * Math.PI, perCorner);

        const frontCenter = mb.getVerticesCount();
        mb.appendVerticesInterleaved([0, 0, hd, 0, 0, 1, 0.5, 0.5]);
        const frontBase = mb.getVerticesCount();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            mb.appendVerticesInterleaved([p.x, p.y, hd, 0, 0, 1, (p.x / width) + 0.5, (p.y / height) + 0.5]);
        }

        const backCenter = mb.getVerticesCount();
        mb.appendVerticesInterleaved([0, 0, -hd, 0, 0, -1, 0.5, 0.5]);
        const backBase = mb.getVerticesCount();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            mb.appendVerticesInterleaved([p.x, p.y, -hd, 0, 0, -1, (p.x / width) + 0.5, (p.y / height) + 0.5]);
        }

        for (let i = 0; i < points.length; i++) {
            const next = (i + 1) % points.length;
            mb.appendIndices([frontCenter, frontBase + i, frontBase + next]);
            mb.appendIndices([backCenter, backBase + next, backBase + i]);
        }

        const sideBase = mb.getVerticesCount();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const n = this.normalForRoundedRectPoint(p, hw, hh, r);
            mb.appendVerticesInterleaved([p.x, p.y, hd, n.x, n.y, 0, i / points.length, 1]);
            mb.appendVerticesInterleaved([p.x, p.y, -hd, n.x, n.y, 0, i / points.length, 0]);
        }
        for (let i = 0; i < points.length; i++) {
            const next = (i + 1) % points.length;
            const f0 = sideBase + i * 2;
            const b0 = f0 + 1;
            const f1 = sideBase + next * 2;
            const b1 = f1 + 1;
            mb.appendIndices([f0, b0, f1, f1, b0, b1]);
        }
    }

    private static addCorner(points: vec3[], cx: number, cy: number, r: number, a0: number, a1: number, segments: number): void {
        for (let i = 0; i <= segments; i++) {
            if (points.length > 0 && i === 0) continue;
            const t = a0 + (a1 - a0) * (i / segments);
            points.push(new vec3(cx + Math.cos(t) * r, cy + Math.sin(t) * r, 0));
        }
    }

    private static normalForRoundedRectPoint(p: vec3, hw: number, hh: number, r: number): vec3 {
        const cx = Math.max(-hw + r, Math.min(hw - r, p.x));
        const cy = Math.max(-hh + r, Math.min(hh - r, p.y));
        const nx = p.x - cx;
        const ny = p.y - cy;
        const len = Math.sqrt(nx * nx + ny * ny);
        if (len < 0.0001) {
            if (Math.abs(p.x) > Math.abs(p.y)) return new vec3(p.x >= 0 ? 1 : -1, 0, 0);
            return new vec3(0, p.y >= 0 ? 1 : -1, 0);
        }
        return new vec3(nx / len, ny / len, 0);
    }
}
