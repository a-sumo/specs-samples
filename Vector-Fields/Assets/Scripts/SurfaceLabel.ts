// SurfaceLabel.ts
// Reusable sci-fi "callout card" anchored in 3D space and billboarded toward the
// camera. Layout (in the billboard plane): an anchor DOT sits on the data point,
// a diagonal LEADER LINE runs up to a bordered BOX with a faint fill that holds
// short TEXT. The base primitive for "info on a surface" across field examples.
//
// Usage: create one (pass the flat geometry material), call setCallout(text,
// accent, side) once, then face(cameraWorldPos) every frame.

const LABEL_FONT: Font = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;

export class SurfaceLabel {
    private root: SceneObject;
    private textObject: SceneObject;
    private text: Text;
    private material: Material | null;
    private fill: RenderMeshVisual | null = null;
    private frame: RenderMeshVisual | null = null;
    private baseOrder: number = 700;

    constructor(parent: SceneObject, name: string, material: Material | null = null) {
        this.material = material;
        this.root = global.scene.createSceneObject(name);
        this.root.setParent(parent);

        this.textObject = global.scene.createSceneObject(name + "_text");
        this.textObject.setParent(this.root);
        this.text = this.textObject.createComponent("Component.Text") as Text;
        this.text.font = LABEL_FONT;
        this.text.size = 18;
        this.text.horizontalAlignment = HorizontalAlignment.Center;
        this.text.verticalAlignment = VerticalAlignment.Center;
        this.text.horizontalOverflow = HorizontalOverflow.Overflow;
        this.text.verticalOverflow = VerticalOverflow.Overflow;
        this.text.depthTest = false;
        this.text.twoSided = true;
        try { this.text.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
    }

    setRenderOrder(order: number): void { this.baseOrder = order; }
    setLocalPosition(p: vec3): void { this.root.getTransform().setLocalPosition(p); }
    setWorldPosition(p: vec3): void { this.root.getTransform().setWorldPosition(p); }
    setEnabled(enabled: boolean): void { this.root.enabled = enabled; }
    destroy(): void { try { this.root.destroy(); } catch (e) {} }

    // Billboard toward the camera, kept upright via world +Y. twoSided geometry
    // and text stay legible from either side.
    face(cameraWorldPos: vec3): void {
        const here = this.root.getTransform().getWorldPosition();
        const dir = cameraWorldPos.sub(here);
        if (dir.length < 0.0001) return;
        this.root.getTransform().setWorldRotation(quat.lookAt(dir.normalize(), new vec3(0.0, 1.0, 0.0)));
    }

    // Build the callout. `side` = +1 puts the box up-right of the dot, -1 up-left.
    // `lift` staggers the leader length so neighbouring cards don't stack.
    setCallout(value: string, accent: vec4, side: number, lift: number = 0.0): void {
        this.text.text = value;
        const s = side >= 0 ? 1.0 : -1.0;

        const dotR = 0.34;
        const leadX = 2.4 * s;
        const leadY = 2.8 + lift;            // box near corner
        const w = 9.6, h = 2.7;
        const bx0 = s > 0 ? leadX : leadX - w;
        const bx1 = bx0 + w;
        const by0 = leadY, by1 = leadY + h;
        const cx = (bx0 + bx1) * 0.5, cy = (by0 + by1) * 0.5;

        // Background stays fully transparent (no fill panel) — the bordered frame
        // gives the card its shape and the text reads directly over the scene.

        // --- frame: anchor dot + diagonal leader + box border (bright accent) ---
        const lw = 0.13;
        const frameV: number[] = [], frameI: number[] = [];
        this.disc(frameV, frameI, 0.0, 0.0, dotR);
        this.lineQuad(frameV, frameI, 0.0, 0.0, leadX, leadY, lw);
        this.border(frameV, frameI, bx0, by0, bx1, by1, lw);
        this.frame = this.applyVisual(this.frame, "_frame", frameV, frameI, accent, this.baseOrder + 1);

        // --- text centred in the box ---
        this.textObject.getTransform().setLocalPosition(new vec3(cx, cy, 0.02));
        const pad = 0.5;
        this.text.worldSpaceRect = Rect.create(-(w * 0.5 - pad), (w * 0.5 - pad), -(h * 0.5 - pad), (h * 0.5 - pad));
        try { this.text.renderOrder = this.baseOrder + 2; } catch (e) {}
        try { this.text.textFill.color = new vec4(1.0, 1.0, 1.0, 1.0); } catch (e) {}
    }

    // ---- geometry helpers (billboard-local XY plane, z = 0) ----

    private makeBuilder(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;
        return mb;
    }

    private vert(out: number[], x: number, y: number): void {
        out.push(x, y, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    }

    private quad(V: number[], I: number[], x0: number, y0: number, x1: number, y1: number): void {
        const b = V.length / 8;
        this.vert(V, x0, y0); this.vert(V, x1, y0); this.vert(V, x1, y1); this.vert(V, x0, y1);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }

    private border(V: number[], I: number[], x0: number, y0: number, x1: number, y1: number, t: number): void {
        this.quad(V, I, x0, y0, x1, y0 + t);        // bottom
        this.quad(V, I, x0, y1 - t, x1, y1);        // top
        this.quad(V, I, x0, y0, x0 + t, y1);        // left
        this.quad(V, I, x1 - t, y0, x1, y1);        // right
    }

    private lineQuad(V: number[], I: number[], x0: number, y0: number, x1: number, y1: number, t: number): void {
        let dx = x1 - x0, dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy) || 1.0;
        dx /= len; dy /= len;
        const nx = -dy * t * 0.5, ny = dx * t * 0.5;
        const b = V.length / 8;
        this.vert(V, x0 + nx, y0 + ny); this.vert(V, x1 + nx, y1 + ny);
        this.vert(V, x1 - nx, y1 - ny); this.vert(V, x0 - nx, y0 - ny);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }

    private disc(V: number[], I: number[], cx: number, cy: number, r: number): void {
        const seg = 14;
        const b = V.length / 8;
        this.vert(V, cx, cy);
        for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * Math.PI * 2.0;
            this.vert(V, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        for (let i = 1; i <= seg; i++) I.push(b, b + i, b + i + 1);
    }

    private applyVisual(existing: RenderMeshVisual | null, suffix: string, V: number[], I: number[], color: vec4, order: number): RenderMeshVisual | null {
        if (!this.material || V.length === 0) return existing;
        let visual = existing;
        if (!visual) {
            const obj = global.scene.createSceneObject(this.root.name + suffix);
            obj.setParent(this.root);
            visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            try { visual.mainMaterial = (this.material as any).clone(); } catch (e) { visual.mainMaterial = this.material; }
        }
        const mb = this.makeBuilder();
        mb.appendVerticesInterleaved(V);
        mb.appendIndices(I);
        mb.updateMesh();
        visual.mesh = mb.getMesh();
        if (visual.mainMaterial) this.applyColor(visual.mainMaterial, color);
        try { (visual as any).setRenderOrder(order); } catch (e) {}
        try { (visual as any).renderOrder = order; } catch (e) {}
        return visual;
    }

    private applyColor(mat: Material, color: vec4): void {
        const pass: any = mat.mainPass;
        if (!pass) return;
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.Opacity = color.w; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.twoSided = true; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.DepthTest = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
    }
}
