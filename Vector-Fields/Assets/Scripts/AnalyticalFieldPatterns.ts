type AnalyticalPattern = {
    proxyName: string;
    visualName: string;
    metricName: string;
    pattern: string;
};

type FieldVector2 = {
    x: number;
    y: number;
};

type FieldMetrics = {
    divergence: number;
    curl: number;
};

const BASE_MATERIAL: Material = requireAsset("../Materials/FlatMaterial.mat") as Material;
const GUIDE_FONT: Font = requireAsset("../Fonts/Nunito_Sans/NunitoSans.ttf") as Font;

const PATTERNS: AnalyticalPattern[] = [
    {
        proxyName: "Proxy_Uniform_Field_Pattern",
        visualName: "__AnalyticalExpansion",
        metricName: "__AnalyticalMetricExpansion",
        pattern: "expansion",
    },
    {
        proxyName: "Proxy_Source_Sink_Field_Pattern",
        visualName: "__AnalyticalContraction",
        metricName: "__AnalyticalMetricContraction",
        pattern: "contraction",
    },
    {
        proxyName: "Proxy_Vortex_Curl_Field_Pattern",
        visualName: "__AnalyticalRotation",
        metricName: "__AnalyticalMetricRotation",
        pattern: "rotation",
    },
    {
        proxyName: "Proxy_Shear_Saddle_Field_Pattern",
        visualName: "__AnalyticalSaddle",
        metricName: "__AnalyticalMetricSaddle",
        pattern: "saddle",
    },
];

@component
export class AnalyticalFieldPatterns extends BaseScriptComponent {
    @input
    @hint("Hide the simple proxy meshes once the generated analytical fields are ready.")
    hideProxyMeshes: boolean = true;

    @input
    @widget(new SliderWidget(1.2, 4.8, 0.1))
    patternWidth: number = 1.72;

    @input
    @widget(new SliderWidget(0.8, 3.2, 0.1))
    patternHeight: number = 1.18;

    @input
    @widget(new SliderWidget(3, 9, 1))
    columns: number = 5;

    @input
    @widget(new SliderWidget(3, 7, 1))
    rows: number = 5;

    @input
    @widget(new SliderWidget(0.05, 0.45, 0.01))
    arrowLength: number = 0.22;

    @input
    @widget(new SliderWidget(0.01, 0.10, 0.005))
    arrowWidth: number = 0.035;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    backdropAlpha: number = 0.18;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    arrowAlpha: number = 0.88;

    private built: boolean = false;
    private visuals: RenderMeshVisual[] = [];

    onAwake(): void {
        this.createApi();
        this.createEvent("OnStartEvent").bind(() => this.stage());
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    public stage(): void {
        this.ensureBuilt();
        this.sceneObject.enabled = true;
    }

    public show(): void {
        this.stage();
    }

    public hide(): void {
        this.sceneObject.enabled = false;
    }

    public rebuild(): void {
        this.built = false;
        this.visuals = [];
        this.ensureBuilt();
    }

    private createApi(): void {
        const self = this;
        (this as any).analyticalFieldApi = {
            stage: () => self.stage(),
            show: () => self.show(),
            hide: () => self.hide(),
            rebuild: () => self.rebuild(),
        };
    }

    private tick(): void {
        if (!this.built) this.ensureBuilt();
    }

    private ensureBuilt(): void {
        if (this.built) return;
        this.visuals = [];
        for (let i = 0; i < PATTERNS.length; i++) {
            this.buildPattern(PATTERNS[i]);
        }
        this.built = true;
        print("AnalyticalFieldPatterns: built " + PATTERNS.length + " generated examples");
    }

    private buildPattern(pattern: AnalyticalPattern): void {
        const proxy = this.findChildByName(this.sceneObject, pattern.proxyName);
        const anchor = proxy ? proxy.getTransform().getLocalPosition() : vec3.zero();
        if (proxy && this.hideProxyMeshes) {
            const visual = proxy.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (visual) visual.enabled = false;
        }

        const visual = this.createVisual(pattern.visualName, 84, new vec4(0.86, 0.86, 0.82, this.arrowAlpha));
        const mb = this.makeBuilder();
        this.addBackdrop(mb, anchor, this.patternWidth, this.patternHeight);
        this.addPatternArrows(mb, anchor, pattern.pattern);
        visual.mesh = mb.getMesh();
        mb.updateMesh();
        this.visuals.push(visual);
        this.createMetricReadout(pattern, anchor);
    }

    private addBackdrop(mb: MeshBuilder, center: vec3, width: number, height: number): void {
        const hw = width * 0.5;
        const hh = height * 0.5;
        const z = center.z - 0.035;
        const base = mb.getVerticesCount();
        this.addVertex(mb, center.x - hw, center.y - hh, z, 0.0, 0.0);
        this.addVertex(mb, center.x + hw, center.y - hh, z, 1.0, 0.0);
        this.addVertex(mb, center.x + hw, center.y + hh, z, 1.0, 1.0);
        this.addVertex(mb, center.x - hw, center.y + hh, z, 0.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    private addPatternArrows(mb: MeshBuilder, center: vec3, pattern: string): void {
        const cols = Math.max(3, Math.floor(this.columns));
        const rows = Math.max(3, Math.floor(this.rows));
        const hw = this.patternWidth * 0.39;
        const hh = this.patternHeight * 0.34;
        const t = getTime();
        for (let iy = 0; iy < rows; iy++) {
            const y = rows <= 1 ? 0.0 : -hh + (iy / (rows - 1)) * hh * 2.0;
            for (let ix = 0; ix < cols; ix++) {
                const x = cols <= 1 ? 0.0 : -hw + (ix / (cols - 1)) * hw * 2.0;
                const dir = this.samplePattern(pattern, x / Math.max(0.001, hw), y / Math.max(0.001, hh), t);
                const speed = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
                if (speed < 0.025) continue;
                const length = this.arrowLength * this.clamp(0.72 + speed * 0.42, 0.72, 1.36);
                this.addArrow(mb, new vec3(center.x + x, center.y + y, center.z + 0.04), dir, length);
            }
        }
        this.addCenterDiamond(mb, new vec3(center.x, center.y, center.z + 0.07), this.arrowWidth * 2.0);
    }

    private samplePattern(pattern: string, x: number, y: number, t: number): FieldVector2 {
        const pulse = 0.92 + 0.08 * Math.sin(t * 0.65);
        if (pattern === "expansion") {
            return { x: x * pulse, y: y * pulse };
        }
        if (pattern === "contraction") {
            return { x: -x * pulse, y: -y * pulse };
        }
        if (pattern === "rotation") {
            return { x: -y * pulse, y: x * pulse };
        }
        return { x: x * pulse, y: -y * pulse };
    }

    private createMetricReadout(pattern: AnalyticalPattern, anchor: vec3): void {
        const object = this.ensureChild(pattern.metricName);
        object.getTransform().setLocalPosition(new vec3(anchor.x, anchor.y - this.patternHeight * 0.60, anchor.z + 0.11));
        object.getTransform().setLocalRotation(quat.quatIdentity());
        object.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));

        let text = object.getComponent("Component.Text") as Text;
        if (!text) {
            text = object.createComponent("Component.Text") as Text;
        }

        const metrics = this.measureCenter(pattern.pattern);
        text.text = "center div " + this.formatSigned(metrics.divergence) + " / curl " + this.formatSigned(metrics.curl);
        text.font = GUIDE_FONT;
        text.size = 18;
        text.horizontalAlignment = HorizontalAlignment.Center;
        text.verticalAlignment = VerticalAlignment.Center;
        text.horizontalOverflow = HorizontalOverflow.Wrap;
        text.verticalOverflow = VerticalOverflow.Overflow;
        text.worldSpaceRect = Rect.create(-this.patternWidth * 0.56, this.patternWidth * 0.56, -0.28, 0.28);
        text.depthTest = false;
        text.twoSided = true;
        text.renderOrder = 92;
        if (text.textFill && (text.textFill as any).color !== undefined) {
            text.textFill.color = new vec4(0.96, 0.94, 0.88, 1.0);
        }
    }

    private measureCenter(pattern: string): FieldMetrics {
        const eps = 0.05;
        const fxPlus = this.samplePattern(pattern, eps, 0.0, 0.0);
        const fxMinus = this.samplePattern(pattern, -eps, 0.0, 0.0);
        const fyPlus = this.samplePattern(pattern, 0.0, eps, 0.0);
        const fyMinus = this.samplePattern(pattern, 0.0, -eps, 0.0);
        return {
            divergence: ((fxPlus.x - fxMinus.x) + (fyPlus.y - fyMinus.y)) / (2.0 * eps),
            curl: ((fxPlus.y - fxMinus.y) - (fyPlus.x - fyMinus.x)) / (2.0 * eps),
        };
    }

    private formatSigned(value: number): string {
        const rounded = Math.abs(value) < 0.005 ? 0.0 : value;
        return (rounded >= 0.0 ? "+" : "") + rounded.toFixed(2);
    }

    private createVisual(name: string, renderOrder: number, color: vec4): RenderMeshVisual {
        const obj = this.ensureChild(name);
        let visual = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (!visual) {
            visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        const material = BASE_MATERIAL.clone();
        visual.mainMaterial = material;
        this.setRenderOrder(visual, renderOrder);
        this.setMaterialColor(material, color);
        return visual;
    }

    private addArrow(mb: MeshBuilder, center: vec3, direction: FieldVector2, length: number): void {
        const mag = Math.max(0.001, Math.sqrt(direction.x * direction.x + direction.y * direction.y));
        const dx = direction.x / mag;
        const dy = direction.y / mag;
        const px = -dy;
        const py = dx;
        const shaftLength = length * 0.58;
        const headLength = length * 0.42;
        const width = this.arrowWidth;
        const start = new vec3(center.x - dx * length * 0.44, center.y - dy * length * 0.44, center.z);
        const headBase = new vec3(start.x + dx * shaftLength, start.y + dy * shaftLength, center.z);
        const tip = new vec3(headBase.x + dx * headLength, headBase.y + dy * headLength, center.z);

        const base = mb.getVerticesCount();
        this.addVertex(mb, start.x + px * width, start.y + py * width, start.z, 0.0, 0.0);
        this.addVertex(mb, start.x - px * width, start.y - py * width, start.z, 0.0, 1.0);
        this.addVertex(mb, headBase.x + px * width, headBase.y + py * width, headBase.z, 1.0, 0.0);
        this.addVertex(mb, headBase.x - px * width, headBase.y - py * width, headBase.z, 1.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2, base + 2, base + 1, base + 3]);

        const h = mb.getVerticesCount();
        const headWidth = width * 2.7;
        this.addVertex(mb, tip.x, tip.y, tip.z, 0.5, 1.0);
        this.addVertex(mb, headBase.x + px * headWidth, headBase.y + py * headWidth, headBase.z, 0.0, 0.0);
        this.addVertex(mb, headBase.x - px * headWidth, headBase.y - py * headWidth, headBase.z, 1.0, 0.0);
        mb.appendIndices([h, h + 1, h + 2]);
    }

    private addCenterDiamond(mb: MeshBuilder, center: vec3, radius: number): void {
        const base = mb.getVerticesCount();
        this.addVertex(mb, center.x, center.y + radius, center.z, 0.5, 1.0);
        this.addVertex(mb, center.x + radius, center.y, center.z, 1.0, 0.5);
        this.addVertex(mb, center.x, center.y - radius, center.z, 0.5, 0.0);
        this.addVertex(mb, center.x - radius, center.y, center.z, 0.0, 0.5);
        mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    private addVertex(mb: MeshBuilder, x: number, y: number, z: number, u: number, v: number): void {
        mb.appendVerticesInterleaved([x, y, z, 0.0, 0.0, 1.0, u, v]);
    }

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

    private setMaterialColor(material: Material | null, color: vec4): void {
        if (!material) return;
        const pass = material.mainPass as any;
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.baseColorFactor = color; } catch (e) {}
        try { pass.color = color; } catch (e) {}
        try { pass.Port_FinalColor_N004 = color; } catch (e) {}
        try { pass.Port_FlatColor_N000 = color; } catch (e) {}
        try { pass.Port_Opacity_N405 = color.w; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
    }

    private setRenderOrder(visual: RenderMeshVisual, renderOrder: number): void {
        const v = visual as any;
        try { v.renderOrder = renderOrder; } catch (e) {}
        try { v.RenderOrder = renderOrder; } catch (e) {}
        try {
            if (typeof v.setRenderOrder === "function") v.setRenderOrder(renderOrder);
        } catch (e) {}
    }

    private ensureChild(name: string): SceneObject {
        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(this.sceneObject);
        child.getTransform().setLocalPosition(vec3.zero());
        child.getTransform().setLocalRotation(quat.quatIdentity());
        child.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));
        return child;
    }

    private findChildByName(parent: SceneObject, name: string): SceneObject | null {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
            const found = this.findChildByName(child, name);
            if (found) return found;
        }
        return null;
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.max(minValue, Math.min(maxValue, value));
    }
}
