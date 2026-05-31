// ProxyVisualTransformController.ts
// Uses one docked interaction plane to transform the currently staged visual root.

type ProxyPose = {
    position: vec3;
    rotation: quat;
    scale: vec3;
};

const PROXY_RECTANGLE_MATERIAL: Material = requireAsset("../Materials/ProxyInteractionDots.mat") as Material;
const PROXY_OUTLINE_MATERIAL: Material = requireAsset("../Materials/FlatMaterial.mat") as Material;
const PROXY_OUTLINE_CHILD_NAME = "__ProxyActiveTubeOutline";
const PROXY_OUTLINE_RADIUS = 0.018;
const PROXY_OUTLINE_LIFT = 0.055;
const PROXY_OUTLINE_SEGMENTS = 8;

@component
export class ProxyVisualTransformController extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint("Menu root used as the docking reference. Empty searches for Story Chapter Guide UI.")
    menuRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Story Step Director root that reports the active visual root.")
    directorRoot: SceneObject = null as any;

    @input
    @allowUndefined
    @hint("Optional camera fallback when no menu root is available.")
    cameraRoot: SceneObject = null as any;

    @input
    @hint("Menu-local dock offset while the guide is unfolded.")
    unfoldedDockOffset: vec3 = new vec3(0.0, 14.0, 0.6);

    @input
    @hint("Menu-local dock offset while the guide is folded.")
    foldedDockOffset: vec3 = new vec3(17.1, 12.2, 0.6);

    @input
    @hint("Local scale used when the proxy returns to its dock.")
    dockScale: vec3 = new vec3(4.8, 4.8, 4.8);

    @input
    @widget(new SliderWidget(1, 30, 0.5))
    @hint("How quickly the proxy plane lands back on the dock.")
    dockSmoothing: number = 12.0;

    @input
    @widget(new SliderWidget(0.12, 1.2, 0.02))
    @hint("Seconds used when toggling the proxy inactive and returning it to dock.")
    dockTweenSeconds: number = 0.38;

    @input
    @hint("Hide the proxy plane when no transformable visual is active.")
    hideWhenNoActiveVisual: boolean = false;

    @input
    @hint("Apply proxy scale changes to the active visual root.")
    driveScale: boolean = true;

    @input
    @hint("Apply proxy rotation changes to the active visual root.")
    driveRotation: boolean = true;

    private directorApi: any = null;
    private guideApi: any = null;
    private interactable: any = null;
    private active: boolean = false;
    private returningToDock: boolean = true;
    private activeRoot: SceneObject | null = null;
    private activeKey: string = "";
    private proxyStartPose: ProxyPose | null = null;
    private baseRoots: SceneObject[] = [];
    private basePoses: ProxyPose[] = [];
    private dockTweenStartPose: ProxyPose | null = null;
    private lastDockPose: ProxyPose | null = null;
    private proxyMeshVisual: RenderMeshVisual | null = null;
    private proxyOutlineObject: SceneObject | null = null;
    private proxyOutlineVisual: RenderMeshVisual | null = null;
    private proxyMeshReady: boolean = false;
    private proxyOutlineReady: boolean = false;
    private dockTweenElapsed: number = 0.0;
    private proxyActiveVisual: number = 0.0;
    private proxyAvailableVisual: number = 1.0;
    private proxyInactiveColor: vec4 = new vec4(0.18, 0.46, 1.0, 0.52);
    private proxyActiveColor: vec4 = new vec4(0.38, 0.68, 1.0, 0.78);
    private proxyDisabledColor: vec4 = new vec4(0.10, 0.20, 0.36, 0.22);
    private proxyOutlineColor: vec4 = new vec4(0.26, 0.58, 1.0, 1.0);

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.start());
        this.createEvent("UpdateEvent").bind(() => this.update());
    }

    public isActive(): boolean {
        return this.active;
    }

    public canActivate(): boolean {
        return this.resolveActiveVisualRoot() !== null;
    }

    public setActive(enabled: boolean): boolean {
        if (enabled) return this.activate();
        this.deactivate();
        return false;
    }

    public toggleActive(): boolean {
        if (this.active) {
            this.deactivate();
            return false;
        }
        return this.activate();
    }

    public activate(): boolean {
        const root = this.resolveActiveVisualRoot();
        if (!root) {
            this.setProxyAvailable(false);
            return false;
        }
        if (this.active) return true;

        this.active = true;
        this.returningToDock = false;
        this.dockTweenStartPose = null;
        this.dockTweenElapsed = 0.0;
        this.activeRoot = root;
        this.activeKey = this.resolveActiveVisualKey(root);
        this.proxyStartPose = this.capturePose(this.sceneObject);
        this.lastDockPose = this.dockPose();
        this.baseRoots = [];
        this.basePoses = [];
        this.basePoseForRoot(root);
        this.setProxyAvailable(true);
        return true;
    }

    public deactivate(): void {
        this.active = false;
        this.activeRoot = null;
        this.activeKey = "";
        this.proxyStartPose = null;
        this.lastDockPose = null;
        this.baseRoots = [];
        this.basePoses = [];
        this.setProxyAvailable(this.resolveActiveVisualRoot() !== null);
        this.beginDockTween();
    }

    public cancelAndDock(): void {
        this.deactivate();
    }

    public deactivateForContentInteraction(): void {
        if (this.active) {
            this.deactivate();
            return;
        }
        this.setProxyAvailable(this.resolveActiveVisualRoot() !== null);
    }

    public notifyContentInteractionStart(): void {
        this.deactivateForContentInteraction();
    }

    public dockSoftly(): void {
        if (this.active) return;
        this.beginDockTween();
    }

    private start(): void {
        this.directorApi = this.findDirectorApi();
        this.guideApi = this.findGuideApi();
        this.interactable = this.findInteractable(this.sceneObject);
        this.ensureProxyMeshVisual();
        this.ensureProxyOutlineVisual();
        this.configureProxyInteractables();
        this.applyProxyVisualStyle(this.proxyInactiveColor, 880);
        this.updateProxyOutlineVisual(false, 886);
        this.setVisualsEnabled(true);
        this.snapToDock();
    }

    private update(): void {
        const root = this.resolveActiveVisualRoot();
        const available = root !== null;
        this.setProxyAvailable(available || this.active || this.returningToDock);
        this.updateProxyVisualState(available);

        if (this.active) {
            if (!root) {
                this.deactivate();
            } else {
                this.followDockMotionWhileActive();
                this.syncActiveRoot(root);
                this.applyProxyToActiveRoot();
                return;
            }
        }

        this.landAtDock();
        if (!available && this.hideWhenNoActiveVisual && this.isNearDock()) {
            this.setProxyAvailable(false);
        }
    }

    private syncActiveRoot(root: SceneObject): void {
        const key = this.resolveActiveVisualKey(root);
        if (this.activeRoot === root && this.activeKey === key) return;
        this.activeRoot = root;
        this.activeKey = key;
        this.basePoseForRoot(root);
    }

    private applyProxyToActiveRoot(): void {
        if (!this.activeRoot || !this.proxyStartPose) return;
        const base = this.basePoseForRoot(this.activeRoot);
        const proxy = this.capturePose(this.sceneObject);
        const translation = proxy.position.sub(this.proxyStartPose.position);
        const rotationDelta = proxy.rotation.multiply(this.proxyStartPose.rotation.invert());
        const scaleRatio = this.safeScaleRatio(proxy.scale, this.proxyStartPose.scale);

        const transform = this.activeRoot.getTransform();
        transform.setWorldPosition(base.position.add(translation));
        if (this.driveRotation) {
            transform.setWorldRotation(rotationDelta.multiply(base.rotation));
        }
        if (this.driveScale) {
            transform.setLocalScale(new vec3(
                base.scale.x * scaleRatio.x,
                base.scale.y * scaleRatio.y,
                base.scale.z * scaleRatio.z
            ));
        }
    }

    private basePoseForRoot(root: SceneObject): ProxyPose {
        for (let i = 0; i < this.baseRoots.length; i++) {
            if (this.baseRoots[i] === root) return this.basePoses[i];
        }
        const pose = this.capturePose(root);
        this.baseRoots.push(root);
        this.basePoses.push(pose);
        return pose;
    }

    private capturePose(object: SceneObject): ProxyPose {
        const transform = object.getTransform();
        const p = transform.getWorldPosition();
        const r = transform.getWorldRotation();
        const s = transform.getLocalScale();
        return {
            position: new vec3(p.x, p.y, p.z),
            rotation: new quat(r.w, r.x, r.y, r.z),
            scale: new vec3(s.x, s.y, s.z),
        };
    }

    private dockPose(): ProxyPose {
        const menu = this.menuRoot || this.findObjectByName("Story Chapter Guide UI");
        const offset = this.menuIsFolded() ? this.foldedDockOffset : this.unfoldedDockOffset;
        if (menu) {
            const transform = menu.getTransform();
            const rotation = transform.getWorldRotation();
            const scale = transform.getLocalScale();
            const scaledOffset = new vec3(offset.x * scale.x, offset.y * scale.y, offset.z * scale.z);
            const position = transform.getWorldPosition().add(rotation.multiplyVec3(scaledOffset));
            return {
                position,
                rotation,
                scale: this.dockScale,
            };
        }

        const camera = this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
        if (camera) {
            const transform = camera.getTransform();
            const cameraRotation = transform.getWorldRotation();
            const forward = cameraRotation.multiplyVec3(new vec3(0.0, 0.0, -1.0));
            const right = cameraRotation.multiplyVec3(new vec3(1.0, 0.0, 0.0));
            const up = new vec3(0.0, 1.0, 0.0);
            return {
                position: transform.getWorldPosition()
                    .add(forward.uniformScale(58.0))
                    .add(right.uniformScale(18.0))
                    .add(up.uniformScale(-12.0)),
                rotation: quat.lookAt(forward.uniformScale(-1.0), up),
                scale: this.dockScale,
            };
        }

        return {
            position: this.sceneObject.getTransform().getWorldPosition(),
            rotation: this.sceneObject.getTransform().getWorldRotation(),
            scale: this.dockScale,
        };
    }

    private landAtDock(): void {
        const target = this.dockPose();
        const transform = this.sceneObject.getTransform();
        if (this.dockTweenStartPose) {
            this.dockTweenElapsed += getDeltaTime();
            const duration = Math.max(0.05, this.dockTweenSeconds);
            const t = this.clamp(this.dockTweenElapsed / duration, 0.0, 1.0);
            const eased = this.easeOutCubic(t);
            transform.setWorldPosition(this.mixVec3(this.dockTweenStartPose.position, target.position, eased));
            transform.setWorldRotation(quat.slerp(this.dockTweenStartPose.rotation, target.rotation, eased));
            transform.setLocalScale(this.mixVec3(this.dockTweenStartPose.scale, target.scale, eased));
            if (t >= 1.0) {
                this.dockTweenStartPose = null;
                this.returningToDock = false;
                this.lastDockPose = target;
            }
            return;
        }

        transform.setWorldPosition(target.position);
        transform.setWorldRotation(target.rotation);
        transform.setLocalScale(target.scale);
        this.returningToDock = false;
        this.lastDockPose = target;
    }

    private snapToDock(): void {
        const target = this.dockPose();
        const transform = this.sceneObject.getTransform();
        transform.setWorldPosition(target.position);
        transform.setWorldRotation(target.rotation);
        transform.setLocalScale(target.scale);
        this.dockTweenStartPose = null;
        this.dockTweenElapsed = 0.0;
        this.returningToDock = false;
        this.lastDockPose = target;
    }

    private isNearDock(): boolean {
        if (this.dockTweenStartPose) return false;
        const target = this.dockPose();
        const current = this.sceneObject.getTransform().getWorldPosition();
        return current.distance(target.position) < 0.35;
    }

    private beginDockTween(): void {
        this.returningToDock = true;
        this.dockTweenStartPose = this.capturePose(this.sceneObject);
        this.dockTweenElapsed = 0.0;
    }

    private followDockMotionWhileActive(): void {
        const previousDock = this.lastDockPose || this.dockPose();
        const nextDock = this.dockPose();
        const deltaRotation = nextDock.rotation.multiply(previousDock.rotation.invert());
        const transform = this.sceneObject.getTransform();
        const currentPosition = transform.getWorldPosition();
        const currentRotation = transform.getWorldRotation();
        const currentOffset = currentPosition.sub(previousDock.position);

        transform.setWorldPosition(nextDock.position.add(deltaRotation.multiplyVec3(currentOffset)));
        transform.setWorldRotation(deltaRotation.multiply(currentRotation));

        if (this.proxyStartPose) {
            const startOffset = this.proxyStartPose.position.sub(previousDock.position);
            this.proxyStartPose = {
                position: nextDock.position.add(deltaRotation.multiplyVec3(startOffset)),
                rotation: deltaRotation.multiply(this.proxyStartPose.rotation),
                scale: this.proxyStartPose.scale,
            };
        }
        this.lastDockPose = nextDock;
    }

    private resolveActiveVisualRoot(): SceneObject | null {
        const api = this.directorApi || this.findDirectorApi();
        this.directorApi = api;
        if (api && typeof api.getActiveVisualRoot === "function") {
            const root = api.getActiveVisualRoot() as SceneObject;
            if (root && root.enabled) return root;
            return null;
        }
        return this.findFallbackActiveRoot();
    }

    private resolveActiveVisualKey(root: SceneObject): string {
        const api = this.directorApi || this.findDirectorApi();
        this.directorApi = api;
        if (api && typeof api.getActiveVisualKey === "function") {
            const key = api.getActiveVisualKey();
            if (key && key.length > 0) return key;
        }
        return root ? root.name : "";
    }

    private findFallbackActiveRoot(): SceneObject | null {
        const names = [
            "Motion Field Root",
            "Vector Field Examples Root",
            "Gravity Field Root",
            "Magnetic Field Root",
            "Globe Calibration",
            "Car Fluid Flow",
        ];
        for (let i = 0; i < names.length; i++) {
            const object = this.findObjectByName(names[i]);
            if (object && object.enabled) return object;
        }
        return null;
    }

    private setProxyAvailable(available: boolean): void {
        const hasActiveRoot = this.resolveActiveVisualRoot() !== null;
        const canInteract = this.active && hasActiveRoot;
        this.setVisualsEnabled(available || this.active || this.returningToDock || !this.hideWhenNoActiveVisual);
        this.setCollidersEnabled(canInteract);
        this.setScriptEnabledByName("Interactable", canInteract);
        this.setScriptEnabledByName("InteractableManipulation", canInteract);
    }

    private updateProxyVisualState(available: boolean): void {
        const alpha = this.clamp(getDeltaTime() * 14.0, 0.0, 1.0);
        const activeTarget = this.active ? 1.0 : 0.0;
        const availableTarget = available ? 1.0 : 0.0;
        this.proxyActiveVisual += (activeTarget - this.proxyActiveVisual) * alpha;
        this.proxyAvailableVisual += (availableTarget - this.proxyAvailableVisual) * alpha;

        const resting = this.mixVec4(this.proxyDisabledColor, this.proxyInactiveColor, this.proxyAvailableVisual);
        let color = this.mixVec4(resting, this.proxyActiveColor, this.proxyActiveVisual);
        if (this.proxyActiveVisual > 0.01) {
            const pulse = (0.5 + 0.5 * Math.sin(getTime() * 5.2)) * 0.02 * this.proxyActiveVisual;
            color = new vec4(color.x, color.y, color.z, this.clamp(color.w + pulse, 0.0, 1.0));
        }

        const renderOrder = Math.round(760 + 120 * this.proxyActiveVisual);
        this.applyProxyVisualStyle(color, renderOrder);
        this.updateProxyOutlineVisual(this.active, renderOrder + 6);
    }

    private applyProxyVisualStyle(color: vec4, renderOrder: number): void {
        const proxyVisual = this.ensureProxyMeshVisual();
        if (proxyVisual) {
            try { proxyVisual.renderOrder = renderOrder; } catch (e) {}
            this.applyColorToMaterial(proxyVisual.mainMaterial, color);
        }
        const renderVisuals = this.sceneObject.getComponents("Component.RenderMeshVisual");
        for (let i = 0; i < renderVisuals.length; i++) {
            const visual = renderVisuals[i] as RenderMeshVisual;
            if (!visual) continue;
            try { visual.renderOrder = renderOrder; } catch (e) {}
            this.applyColorToMaterial(visual.mainMaterial, color);
        }
        const images = this.sceneObject.getComponents("Image" as any);
        for (let i = 0; i < images.length; i++) {
            const image = images[i] as Image;
            if (!image) continue;
            try { image.renderOrder = renderOrder; } catch (e) {}
            const material = (image as any).mainMaterial || (image as any).material;
            if (!material) continue;
            const pass = material.mainPass as any;
            if (!pass) continue;
            try { pass.baseColor = color; } catch (e) {}
            try { pass.BaseColor = color; } catch (e) {}
            try { pass.Port_Default_N369 = color; } catch (e) {}
            try { pass.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
            try { pass.BlendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
            try { pass.DepthWrite = false; } catch (e) {}
            try { pass.DepthTest = false; } catch (e) {}
            try { pass.depthWrite = false; } catch (e) {}
            try { pass.depthTest = false; } catch (e) {}
        }
    }

    private updateProxyOutlineVisual(enabled: boolean, renderOrder: number): void {
        const outline = this.ensureProxyOutlineVisual();
        if (!outline) return;
        outline.enabled = enabled;
        if (!enabled) return;
        try { outline.renderOrder = renderOrder; } catch (e) {}
        this.applyColorToMaterial(outline.mainMaterial, this.proxyOutlineColor);
    }

    private setVisualsEnabled(enabled: boolean): void {
        const proxyVisual = this.ensureProxyMeshVisual();
        const renderVisuals = this.sceneObject.getComponents("Component.RenderMeshVisual");
        for (let i = 0; i < renderVisuals.length; i++) {
            const visual = renderVisuals[i] as RenderMeshVisual;
            if (visual) visual.enabled = enabled;
        }
        if (proxyVisual) proxyVisual.enabled = enabled;
        this.updateProxyOutlineVisual(enabled && this.active, 886);
        const images = this.sceneObject.getComponents("Image" as any);
        for (let i = 0; i < images.length; i++) {
            const image = images[i] as Image;
            if (image) image.enabled = false;
        }
    }

    private ensureProxyMeshVisual(): RenderMeshVisual | null {
        if (!this.proxyMeshVisual) {
            this.proxyMeshVisual = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (!this.proxyMeshVisual) {
                this.proxyMeshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            }
        }
        if (!this.proxyMeshVisual) return null;

        if (!this.proxyMeshVisual.mainMaterial) {
            try {
                this.proxyMeshVisual.mainMaterial = (PROXY_RECTANGLE_MATERIAL as any).clone() as Material;
            } catch (e) {
                this.proxyMeshVisual.mainMaterial = PROXY_RECTANGLE_MATERIAL;
            }
        }

        if (!this.proxyMeshReady) {
            const meshBuilder = this.buildProxyPlaneMesh();
            if (meshBuilder.isValid()) {
                this.proxyMeshVisual.mesh = meshBuilder.getMesh();
                meshBuilder.updateMesh();
                this.proxyMeshReady = true;
            }
        }
        return this.proxyMeshVisual;
    }

    private ensureProxyOutlineVisual(): RenderMeshVisual | null {
        if (!this.proxyOutlineObject) {
            this.proxyOutlineObject = this.ensureChild(PROXY_OUTLINE_CHILD_NAME);
        }
        if (!this.proxyOutlineVisual && this.proxyOutlineObject) {
            this.proxyOutlineVisual = this.proxyOutlineObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (!this.proxyOutlineVisual) {
                this.proxyOutlineVisual = this.proxyOutlineObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            }
        }
        if (!this.proxyOutlineVisual) return null;

        if (!this.proxyOutlineVisual.mainMaterial) {
            try {
                this.proxyOutlineVisual.mainMaterial = (PROXY_OUTLINE_MATERIAL as any).clone() as Material;
            } catch (e) {
                this.proxyOutlineVisual.mainMaterial = PROXY_OUTLINE_MATERIAL;
            }
        }

        if (!this.proxyOutlineReady) {
            const meshBuilder = this.buildProxyOutlineMesh();
            if (meshBuilder.isValid()) {
                this.proxyOutlineVisual.mesh = meshBuilder.getMesh();
                meshBuilder.updateMesh();
                this.proxyOutlineReady = true;
            }
        }
        return this.proxyOutlineVisual;
    }

    private buildProxyPlaneMesh(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;

        const hx = 0.5;
        const hy = 0.5;

        this.addProxyPlaneFace(
            mb,
            new vec3(-hx, -hy, 0.0),
            new vec3(hx, -hy, 0.0),
            new vec3(hx, hy, 0.0),
            new vec3(-hx, hy, 0.0)
        );
        return mb;
    }

    private buildProxyOutlineMesh(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;

        const hx = 0.5;
        const hy = 0.5;
        const z = PROXY_OUTLINE_LIFT;
        const radius = PROXY_OUTLINE_RADIUS;
        const segments = PROXY_OUTLINE_SEGMENTS;

        this.appendOutlineTubeSegment(mb, new vec3(-hx, -hy, z), new vec3(hx, -hy, z), radius, segments);
        this.appendOutlineTubeSegment(mb, new vec3(hx, -hy, z), new vec3(hx, hy, z), radius, segments);
        this.appendOutlineTubeSegment(mb, new vec3(hx, hy, z), new vec3(-hx, hy, z), radius, segments);
        this.appendOutlineTubeSegment(mb, new vec3(-hx, hy, z), new vec3(-hx, -hy, z), radius, segments);
        return mb;
    }

    private appendOutlineTubeSegment(mb: MeshBuilder, start: vec3, end: vec3, radius: number, segments: number): void {
        const axis = this.subVec3(end, start);
        const length = this.lenVec3(axis);
        if (length < 0.001) return;
        const dir = this.scaleVec3(axis, 1.0 / length);
        const frame = this.frameForAxis(dir);
        const base = mb.getVerticesCount();

        for (let ring = 0; ring < 2; ring++) {
            const center = ring === 0 ? start : end;
            for (let i = 0; i < segments; i++) {
                const a = (i / segments) * Math.PI * 2.0;
                const normal = this.addVec3(
                    this.scaleVec3(frame.x, Math.cos(a)),
                    this.scaleVec3(frame.y, Math.sin(a))
                );
                const p = this.addVec3(center, this.scaleVec3(normal, radius));
                this.appendOutlineVertex(mb, p, normal, ring, i / segments);
            }
        }

        for (let i = 0; i < segments; i++) {
            const j = (i + 1) % segments;
            const a = base + i;
            const b = base + j;
            const c = base + segments + i;
            const d = base + segments + j;
            mb.appendIndices([a, c, b, b, c, d]);
        }

        const startCenter = mb.getVerticesCount();
        this.appendOutlineVertex(mb, start, this.scaleVec3(dir, -1.0), 0.5, 0.5);
        const endCenter = mb.getVerticesCount();
        this.appendOutlineVertex(mb, end, dir, 0.5, 0.5);
        for (let i = 0; i < segments; i++) {
            const j = (i + 1) % segments;
            mb.appendIndices([startCenter, base + j, base + i]);
            mb.appendIndices([endCenter, base + segments + i, base + segments + j]);
        }
    }

    private appendOutlineVertex(mb: MeshBuilder, position: vec3, normal: vec3, u: number, v: number): void {
        mb.appendVerticesInterleaved([
            position.x, position.y, position.z,
            normal.x, normal.y, normal.z,
            u, v,
        ]);
    }

    private addProxyPlaneFace(mb: MeshBuilder, a: vec3, b: vec3, c: vec3, d: vec3): void {
        const normal = new vec3(0.0, 0.0, 1.0);
        const base = mb.getVerticesCount();
        this.appendProxyVertex(mb, a, normal, 0.0, 0.0);
        this.appendProxyVertex(mb, b, normal, 1.0, 0.0);
        this.appendProxyVertex(mb, c, normal, 1.0, 1.0);
        this.appendProxyVertex(mb, d, normal, 0.0, 1.0);
        mb.appendIndices([base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    private appendProxyVertex(mb: MeshBuilder, position: vec3, normal: vec3, u: number, v: number): void {
        mb.appendVerticesInterleaved([
            position.x, position.y, position.z,
            normal.x, normal.y, normal.z,
            u, v,
        ]);
    }

    private applyColorToMaterial(material: Material | null, color: vec4): void {
        if (!material) return;
        const pass = material.mainPass as any;
        if (!pass) return;
        try { pass.FlatColor = color; } catch (e) {}
        try { pass.Port_FlatColor_N000 = color; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.BaseColor = color; } catch (e) {}
        try { pass.mainColor = color; } catch (e) {}
        try { pass.opacity = color.w; } catch (e) {}
        try { pass.Opacity = color.w; } catch (e) {}
        try { pass.blendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        try { pass.BlendMode = BlendMode.PremultipliedAlphaAuto; } catch (e) {}
        try { pass.DepthWrite = false; } catch (e) {}
        try { pass.DepthTest = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.twoSided = true; } catch (e) {}
        try { pass.TwoSided = true; } catch (e) {}
    }

    private ensureChild(name: string): SceneObject {
        for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
            const child = this.sceneObject.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(this.sceneObject);
        child.getTransform().setLocalPosition(new vec3(0.0, 0.0, 0.0));
        child.getTransform().setLocalRotation(quat.quatIdentity());
        child.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));
        return child;
    }

    private frameForAxis(axis: vec3): { x: vec3, y: vec3 } {
        const ref = Math.abs(axis.y) < 0.82 ? new vec3(0.0, 1.0, 0.0) : new vec3(1.0, 0.0, 0.0);
        let x = this.normVec3(this.crossVec3(ref, axis));
        if (this.lenVec3(x) < 0.001) x = new vec3(1.0, 0.0, 0.0);
        const y = this.normVec3(this.crossVec3(axis, x));
        return { x, y };
    }

    private addVec3(a: vec3, b: vec3): vec3 {
        return new vec3(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    private subVec3(a: vec3, b: vec3): vec3 {
        return new vec3(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    private scaleVec3(a: vec3, s: number): vec3 {
        return new vec3(a.x * s, a.y * s, a.z * s);
    }

    private lenVec3(a: vec3): number {
        return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    }

    private normVec3(a: vec3): vec3 {
        const length = this.lenVec3(a);
        return length > 0.00001 ? this.scaleVec3(a, 1.0 / length) : new vec3(0.0, 1.0, 0.0);
    }

    private crossVec3(a: vec3, b: vec3): vec3 {
        return new vec3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x
        );
    }

    private setCollidersEnabled(enabled: boolean): void {
        const colliders = this.sceneObject.getComponents("Physics.ColliderComponent");
        for (let i = 0; i < colliders.length; i++) {
            const collider = colliders[i] as ColliderComponent;
            if (collider) collider.enabled = enabled;
        }
    }

    private setScriptEnabledByName(name: string, enabled: boolean): void {
        const scripts = this.sceneObject.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && script.name === name) {
                try { script.enabled = enabled; } catch (e) {}
            }
        }
    }

    private configureProxyInteractables(): void {
        const scripts = this.sceneObject.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (!script) continue;
            if (script.name === "Interactable") {
                try { script.targetingMode = 3; } catch (e) {}
                try { script.targetingVisual = 1; } catch (e) {}
                try { script.ignoreInteractionPlane = true; } catch (e) {}
                try { script.keepHoverOnTrigger = false; } catch (e) {}
            } else if (script.name === "InteractableManipulation") {
                try { script.enableTranslation = true; } catch (e) {}
                try { script.enableRotation = true; } catch (e) {}
                try { script.enableScale = true; } catch (e) {}
                try { script.enableStretchZ = false; } catch (e) {}
                try { script.minimumScaleFactor = 0.35; } catch (e) {}
                try { script.maximumScaleFactor = 3.0; } catch (e) {}
            }
        }
    }

    private menuIsFolded(): boolean {
        const api = this.guideApi || this.findGuideApi();
        this.guideApi = api;
        if (api && typeof api.isFolded === "function") return api.isFolded();
        if (api && typeof api.isMenuFolded === "function") return api.isMenuFolded();
        try {
            if (api && api.folded !== undefined) return api.folded ? true : false;
        } catch (e) {}
        return false;
    }

    private findDirectorApi(): any {
        const root = this.directorRoot || this.findObjectByName("Story Step Director");
        return this.findScriptApi(root, "getActiveVisualRoot") || this.findScriptApi(root, "stageStep");
    }

    private findGuideApi(): any {
        const root = this.menuRoot || this.findObjectByName("Story Chapter Guide UI");
        return this.findScriptApi(root, "isFolded") || this.findScriptApi(root, "goTo");
    }

    private findScriptApi(root: SceneObject | null, methodName: string): any {
        if (!root) return null;
        const scripts = root.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i] as any;
            if (script && typeof script[methodName] === "function") return script;
        }
        return null;
    }

    private findInteractable(object: SceneObject): any {
        const scripts = object.getComponents("Component.ScriptComponent");
        for (let i = 0; i < scripts.length; i++) {
            const candidate = scripts[i] as any;
            if (candidate && candidate.name === "Interactable" && candidate.onTriggerStart) {
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

    private listen(eventApi: any, callback: (event?: any) => void): void {
        if (!eventApi) return;
        if (typeof eventApi.add === "function") eventApi.add(callback);
        else if (typeof eventApi === "function") eventApi(callback);
    }

    private safeScaleRatio(current: vec3, start: vec3): vec3 {
        return new vec3(
            this.safeDiv(current.x, start.x),
            this.safeDiv(current.y, start.y),
            this.safeDiv(current.z, start.z)
        );
    }

    private safeDiv(a: number, b: number): number {
        return Math.abs(b) < 0.0001 ? 1.0 : a / b;
    }

    private mixVec3(a: vec3, b: vec3, t: number): vec3 {
        const k = this.clamp(t, 0.0, 1.0);
        return new vec3(
            a.x + (b.x - a.x) * k,
            a.y + (b.y - a.y) * k,
            a.z + (b.z - a.z) * k
        );
    }

    private mixVec4(a: vec4, b: vec4, t: number): vec4 {
        const k = this.clamp(t, 0.0, 1.0);
        return new vec4(
            a.x + (b.x - a.x) * k,
            a.y + (b.y - a.y) * k,
            a.z + (b.z - a.z) * k,
            a.w + (b.w - a.w) * k
        );
    }

    private easeOutCubic(t: number): number {
        const k = 1.0 - this.clamp(t, 0.0, 1.0);
        return 1.0 - k * k * k;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}
