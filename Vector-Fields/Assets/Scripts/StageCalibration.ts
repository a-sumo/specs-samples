// StageCalibration.ts
// One shared surface calibration for the whole experience, driven by the menu.
//
// Public API (call from menu buttons / chapter logic):
//   StageCalibration.getInstance()
//     .calibrate()            -> show preview plane, pinch to confirm, store anchor, re-snap all
//     .calibrateIfNeeded()    -> calibrate only if not already calibrated
//     .cancelCalibration()    -> hide preview and abort an in-progress calibration
//     .recalibrate()          -> alias of calibrate()
//     .setPlacementMode(m)    -> 0 Horizontal | 1 Vertical | 2 Tabletop (applies next calibrate)
//     .calibrateForMode(m)    -> set plane mode and immediately start calibration
//     .getPlacementMode()     -> selected plane mode
//     .isCalibrated()         -> bool
//     .isCalibrating()        -> bool
//     .getAnchorPosition()    -> vec3
//     .getAnchorRotation()    -> quat
//     .subscribe(cb)/.unsubscribe(cb) -> fired after each successful calibration
//
// SnapToStage components subscribe to this and reposition their plane onto the
// shared anchor; the menu can also subscribe to know when calibration completes.

import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";

const IMAGE_MATERIAL = requireAsset("../Image.mat") as Material;
const TEX_REFERENCE_PANEL = requireAsset("../Images/CalibrationUI/reference_plane_panel.png") as Texture;
const TEX_REFERENCE_PLANE = requireAsset("../Images/CalibrationUI/reference_plane_preview.png") as Texture;

type PreviewPose = {
    position: vec3;
    rotation: quat;
};

@component
export class StageCalibration extends BaseScriptComponent {
    @input
    @hint("Run calibration automatically at lens start, then keep that anchor until the user changes the view plane.")
    calibrateOnStart: boolean = false;

    @input
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Horizontal (floor)", 0),
            new ComboBoxItem("Vertical (wall)", 1),
            new ComboBoxItem("Tabletop (near surface)", 2),
        ])
    )
    @hint("Surface type used for calibration.")
    placementMode: number = 0;

    @input
    @allowUndefined
    @hint("Optional head/camera anchor. Empty searches for Camera Object.")
    cameraRoot: SceneObject = null as any;

    @input
    @widget(new SliderWidget(12.0, 80.0, 1.0))
    @hint("Size of the preview reference plane in centimeters.")
    previewSizeCm: number = 36.0;

    @input
    @widget(new SliderWidget(40.0, 180.0, 5.0))
    @hint("Fallback distance for the user-facing vertical plane.")
    frontPlaneDistanceCm: number = 105.0;

    @input
    @widget(new SliderWidget(50.0, 180.0, 5.0))
    @hint("Fallback distance for floor mode when no tracked plane is available.")
    floorPlaneForwardCm: number = 105.0;

    @input
    @widget(new SliderWidget(35.0, 170.0, 5.0))
    @hint("Fallback drop below the head for floor mode when no tracked plane is available.")
    floorPlaneDropCm: number = 105.0;

    private static instance: StageCalibration = null as any;

    private calibrated: boolean = false;
    private calibrating: boolean = false;
    private anchorPos: vec3 = vec3.zero();
    private anchorRot: quat = quat.fromEulerAngles(0, 0, 0);
    private subscribers: Array<() => void> = [];
    private previewRoot: SceneObject | null = null;
    private previewPlaneObject: SceneObject | null = null;
    private panelObject: SceneObject | null = null;
    private previewPlaneVisual: RenderMeshVisual | null = null;
    private panelVisual: RenderMeshVisual | null = null;
    private previewPlaneMaterial: Material | null = null;
    private panelMaterial: Material | null = null;
    private previewPose: PreviewPose = { position: vec3.zero(), rotation: quat.quatIdentity() };
    private hitTestSession: any = null;
    private worldQueryModule: any = null;
    private confirmCooldownUntil: number = 0.0;
    private confirmInputsBound: boolean = false;

    static getInstance(): StageCalibration {
        return StageCalibration.instance;
    }

    onAwake(): void {
        StageCalibration.instance = this;
        this.createCalibrationVisuals();
        this.createEvent("UpdateEvent").bind(() => this.updateCalibrationPreview());
        this.createEvent("OnStartEvent").bind(() => {
            this.bindConfirmInputs();
            if (this.calibrateOnStart) {
                this.calibrate();
            }
        });
    }

    // ---- engage --------------------------------------------------------

    /** Show the preview plane; on pinch, store the anchor and re-snap all subscribers. */
    public calibrate(): void {
        if (this.calibrating) return;
        this.calibrating = true;
        this.createCalibrationVisuals();
        this.startHitTestSession();
        this.showPreview(true);
        this.updateCalibrationPreview();
    }

    /** Alias kept for readability at call sites. */
    public recalibrate(): void {
        this.calibrate();
    }

    /** Set the surface type and start a new calibration pass. */
    public calibrateForMode(mode: number): void {
        if (this.calibrating) {
            this.cancelCalibration();
        }
        this.placementMode = this.normalizePlacementMode(mode);
        this.calibrate();
    }

    /** Calibrate only if we don't already have an anchor. */
    public calibrateIfNeeded(): void {
        if (!this.calibrated && !this.calibrating) this.calibrate();
    }

    /** Abort a calibration that is currently in progress. */
    public cancelCalibration(): void {
        if (!this.calibrating) return;
        this.calibrating = false;
        this.stopHitTestSession();
        this.showPreview(false);
    }

    // ---- modify --------------------------------------------------------

    /** Set the surface type for the next calibration (0 Horizontal | 1 Vertical | 2 Tabletop). */
    public setPlacementMode(mode: number): void {
        this.placementMode = this.normalizePlacementMode(mode);
    }

    /** Alias for menu code, where the same value is described as a view plane. */
    public setViewPlaneMode(mode: number): void {
        this.setPlacementMode(mode);
    }

    // ---- query ---------------------------------------------------------

    public isCalibrated(): boolean {
        return this.calibrated;
    }
    public isCalibrating(): boolean {
        return this.calibrating;
    }
    public getPlacementMode(): number {
        return this.normalizePlacementMode(this.placementMode);
    }
    public getViewPlaneMode(): number {
        return this.getPlacementMode();
    }
    public getAnchorPosition(): vec3 {
        return this.anchorPos;
    }
    public getAnchorRotation(): quat {
        return this.anchorRot;
    }

    // ---- subscriptions -------------------------------------------------

    /** Invoked after every successful calibration (used by SnapToStage + the menu). */
    public subscribe(callback: () => void): void {
        if (callback && this.subscribers.indexOf(callback) < 0) {
            this.subscribers.push(callback);
        }
    }
    public unsubscribe(callback: () => void): void {
        const i = this.subscribers.indexOf(callback);
        if (i >= 0) this.subscribers.splice(i, 1);
    }

    private notify(): void {
        for (let i = 0; i < this.subscribers.length; i++) this.subscribers[i]();
    }

    private normalizePlacementMode(mode: number): number {
        const value = Math.floor(mode);
        if (value === 1) return 1;
        if (value === 2) return 2;
        return 0;
    }

    private bindConfirmInputs(): void {
        if (this.confirmInputsBound) return;
        this.confirmInputsBound = true;
        try {
            SIK.HandInputData.getHand("left").onPinchUp.add(() => this.confirmCalibration());
            SIK.HandInputData.getHand("right").onPinchUp.add(() => this.confirmCalibration());
        } catch (e) {
            print("StageCalibration: hand pinch events unavailable, TapEvent still enabled");
        }
        this.createEvent("TapEvent").bind(() => this.confirmCalibration());
    }

    private confirmCalibration(): void {
        if (!this.calibrating) return;
        const now = getTime();
        if (now < this.confirmCooldownUntil) return;
        this.confirmCooldownUntil = now + 0.35;

        this.anchorPos = this.previewPose.position;
        this.anchorRot = this.previewPose.rotation;
        this.calibrated = true;
        this.calibrating = false;
        this.stopHitTestSession();
        this.showPreview(false);
        this.notify();
    }

    private updateCalibrationPreview(): void {
        if (!this.calibrating) return;

        const camera = this.getCameraObject();
        if (!camera) return;

        const cameraTransform = camera.getTransform();
        const fallback = this.fallbackPose(cameraTransform);
        this.applyPreviewPose(fallback);

        if (!this.hitTestSession) {
            this.updatePreviewVisuals(cameraTransform);
            return;
        }

        const ray = this.hitTestRay(cameraTransform);
        try {
            this.hitTestSession.hitTest(ray.start, ray.end, (hit: any) => {
                if (!this.calibrating) return;
                const hitPose = this.poseFromHit(cameraTransform, hit);
                if (hitPose) {
                    this.applyPreviewPose(hitPose);
                }
                this.updatePreviewVisuals(cameraTransform);
            });
        } catch (e) {
            this.updatePreviewVisuals(cameraTransform);
        }
    }

    private applyPreviewPose(pose: PreviewPose): void {
        this.previewPose = pose;
    }

    private fallbackPose(cameraTransform: Transform): PreviewPose {
        const mode = this.normalizePlacementMode(this.placementMode);
        const cameraPosition = cameraTransform.getWorldPosition();
        if (mode === 1) {
            const forward = this.safeHorizontalForward(cameraTransform);
            return {
                position: cameraPosition.add(forward.uniformScale(this.frontPlaneDistanceCm)),
                rotation: this.verticalRotation(forward),
            };
        }

        const forward = this.safeFloorForward(cameraTransform);
        return {
            position: cameraPosition
                .add(forward.uniformScale(this.floorPlaneForwardCm))
                .add(vec3.up().uniformScale(-this.floorPlaneDropCm)),
            rotation: this.horizontalRotation(cameraTransform),
        };
    }

    private poseFromHit(cameraTransform: Transform, hit: any): PreviewPose | null {
        if (!hit || !hit.position || !hit.normal) return null;
        const mode = this.normalizePlacementMode(this.placementMode);
        const normal = hit.normal as vec3;
        if (mode === 1) {
            if (Math.abs(normal.y) > 0.18) return null;
            const projectedNormal = new vec3(normal.x, 0.0, normal.z);
            return {
                position: hit.position as vec3,
                rotation: this.verticalRotation(this.safeDirection(projectedNormal, this.safeHorizontalForward(cameraTransform))),
            };
        }

        if (normal.y < 0.86) return null;
        return {
            position: hit.position as vec3,
            rotation: this.horizontalRotation(cameraTransform),
        };
    }

    private hitTestRay(cameraTransform: Transform): any {
        const mode = this.normalizePlacementMode(this.placementMode);
        const min = mode === 1 ? 50.0 : 20.0;
        const max = mode === 1 ? 1000.0 : 500.0;
        const forward = this.cameraForward(cameraTransform);
        const direction = mode === 1
            ? forward
            : this.safeDirection(new vec3(forward.x, forward.y - 0.45, forward.z), forward);
        const cameraPosition = cameraTransform.getWorldPosition();
        return {
            start: cameraPosition.add(direction.uniformScale(min)),
            end: cameraPosition.add(direction.uniformScale(max)),
        };
    }

    private horizontalRotation(cameraTransform: Transform): quat {
        return quat.lookAt(this.safeFloorForward(cameraTransform), vec3.up());
    }

    private verticalRotation(normalOrForward: vec3): quat {
        return quat.lookAt(
            this.safeDirection(normalOrForward, new vec3(0.0, 0.0, 1.0)),
            vec3.up()
        ).multiply(quat.fromEulerVec(new vec3(Math.PI * 0.5, 0.0, 0.0)));
    }

    private safeFloorForward(cameraTransform: Transform): vec3 {
        const forward = this.cameraForward(cameraTransform);
        return this.safeDirection(new vec3(forward.x, 0.0, forward.z), new vec3(0.0, 0.0, -1.0));
    }

    private safeHorizontalForward(cameraTransform: Transform): vec3 {
        const forward = this.cameraForward(cameraTransform);
        return this.safeDirection(new vec3(forward.x, 0.0, forward.z), new vec3(0.0, 0.0, -1.0));
    }

    private cameraForward(cameraTransform: Transform): vec3 {
        const rotation = cameraTransform.getWorldRotation();
        return this.safeDirection(rotation.multiplyVec3(new vec3(0.0, 0.0, -1.0)), new vec3(0.0, 0.0, -1.0));
    }

    private startHitTestSession(): void {
        this.stopHitTestSession();
        try {
            this.worldQueryModule = require("LensStudio:WorldQueryModule") as WorldQueryModule;
            const options = HitTestSessionOptions.create();
            options.filter = true;
            this.hitTestSession = this.worldQueryModule.createHitTestSessionWithOptions(options);
            this.hitTestSession.start();
        } catch (e) {
            this.hitTestSession = null;
        }
    }

    private stopHitTestSession(): void {
        if (!this.hitTestSession) return;
        try { this.hitTestSession.stop(); } catch (e) {}
        this.hitTestSession = null;
    }

    private createCalibrationVisuals(): void {
        if (!this.previewRoot) {
            this.previewRoot = this.ensureChild(this.sceneObject, "__ReferenceCalibrationPreview");
        }
        if (!this.previewPlaneObject) {
            this.previewPlaneObject = this.ensureChild(this.previewRoot, "__ReferencePlane");
        }
        if (!this.panelObject) {
            this.panelObject = this.ensureChild(this.previewRoot, "__ReferencePanel");
        }

        if (!this.previewPlaneVisual) {
            this.previewPlaneVisual = this.previewPlaneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        this.previewPlaneVisual.mesh = this.makeXzQuadMesh(this.previewSizeCm, this.previewSizeCm);
        this.previewPlaneMaterial = this.previewPlaneMaterial || this.cloneImageMaterial(TEX_REFERENCE_PLANE, new vec4(1.0, 1.0, 1.0, 0.86));
        this.previewPlaneVisual.mainMaterial = this.previewPlaneMaterial;
        this.setRenderOrder(this.previewPlaneVisual, 90);

        if (!this.panelVisual) {
            this.panelVisual = this.panelObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        }
        this.panelVisual.mesh = this.makeXyQuadMesh(19.2, 7.08);
        this.panelMaterial = this.panelMaterial || this.cloneImageMaterial(TEX_REFERENCE_PANEL, new vec4(1.0, 1.0, 1.0, 1.0));
        this.panelVisual.mainMaterial = this.panelMaterial;
        this.setRenderOrder(this.panelVisual, 340);

        this.showPreview(false);
    }

    private updatePreviewVisuals(cameraTransform: Transform): void {
        if (!this.previewRoot || !this.previewPlaneObject || !this.panelObject) return;
        this.previewRoot.enabled = true;

        const planeT = this.previewPlaneObject.getTransform();
        planeT.setWorldPosition(this.previewPose.position);
        planeT.setWorldRotation(this.previewPose.rotation);
        planeT.setLocalScale(vec3.one());

        const cameraPosition = cameraTransform.getWorldPosition();
        const worldUp = vec3.up();
        const panelPos = this.panelPositionNearPreview(cameraPosition, worldUp);

        const panelT = this.panelObject.getTransform();
        panelT.setWorldPosition(panelPos);
        const toCamera = cameraPosition.sub(panelPos);
        panelT.setWorldRotation(quat.lookAt(this.safeDirection(toCamera, new vec3(0.0, 0.0, 1.0)), worldUp));
        panelT.setLocalScale(new vec3(1.0, 1.0, 1.0));
    }

    private panelPositionNearPreview(cameraPosition: vec3, worldUp: vec3): vec3 {
        const mode = this.normalizePlacementMode(this.placementMode);
        const center = this.previewPose.position;
        const toCamera = cameraPosition.sub(center);

        if (mode === 1) {
            return center.add(worldUp.uniformScale(this.previewSizeCm * 0.64 + 10.0));
        }

        const horizontalToCamera = this.safeDirection(new vec3(toCamera.x, 0.0, toCamera.z), new vec3(0.0, 0.0, 1.0));
        return center
            .add(horizontalToCamera.uniformScale(this.previewSizeCm * 0.58))
            .add(worldUp.uniformScale(18.0));
    }

    private showPreview(enabled: boolean): void {
        if (this.previewRoot) {
            this.previewRoot.enabled = enabled;
        }
    }

    private cloneImageMaterial(texture: Texture, color: vec4): Material {
        const material = (IMAGE_MATERIAL as any).clone() as Material;
        const pass = material.mainPass as any;
        try { pass.baseTex = texture; } catch (e) {}
        try { pass.baseColor = color; } catch (e) {}
        try { pass.depthTest = false; } catch (e) {}
        try { pass.depthWrite = false; } catch (e) {}
        return material;
    }

    private makeXzQuadMesh(width: number, depth: number): RenderMesh {
        const halfW = width * 0.5;
        const halfD = depth * 0.5;
        const mb = this.makeTexturedBuilder();
        mb.appendVerticesInterleaved([
            -halfW, 0.0, -halfD, 0.0, 1.0, 0.0, 0.0, 1.0,
             halfW, 0.0, -halfD, 0.0, 1.0, 0.0, 1.0, 1.0,
            -halfW, 0.0,  halfD, 0.0, 1.0, 0.0, 0.0, 0.0,
             halfW, 0.0,  halfD, 0.0, 1.0, 0.0, 1.0, 0.0,
        ]);
        mb.appendIndices([0, 2, 1, 1, 2, 3]);
        const mesh = mb.getMesh();
        mb.updateMesh();
        return mesh;
    }

    private makeXyQuadMesh(width: number, height: number): RenderMesh {
        const halfW = width * 0.5;
        const halfH = height * 0.5;
        const mb = this.makeTexturedBuilder();
        mb.appendVerticesInterleaved([
            -halfW, -halfH, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
             halfW, -halfH, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
            -halfW,  halfH, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0,
             halfW,  halfH, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0,
        ]);
        mb.appendIndices([0, 1, 2, 1, 3, 2]);
        const mesh = mb.getMesh();
        mb.updateMesh();
        return mesh;
    }

    private makeTexturedBuilder(): MeshBuilder {
        const mb = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
        ]);
        mb.topology = MeshTopology.Triangles;
        mb.indexType = MeshIndexType.UInt16;
        return mb;
    }

    private setRenderOrder(visual: RenderMeshVisual, order: number): void {
        const anyVisual = visual as any;
        try {
            if (typeof anyVisual.setRenderOrder === "function") anyVisual.setRenderOrder(order);
            if (anyVisual.renderOrder !== undefined) anyVisual.renderOrder = order;
            if (anyVisual.RenderOrder !== undefined) anyVisual.RenderOrder = order;
        } catch (e) {}
    }

    private getCameraObject(): SceneObject | null {
        return this.cameraRoot || this.findObjectByName("Camera Object") || this.findObjectByName("Camera");
    }

    private ensureChild(parent: SceneObject, name: string): SceneObject {
        for (let i = 0; i < parent.getChildrenCount(); i++) {
            const child = parent.getChild(i);
            if (child.name === name) return child;
        }
        const child = global.scene.createSceneObject(name);
        child.setParent(parent);
        return child;
    }

    private safeDirection(value: vec3, fallback: vec3): vec3 {
        if (!value || value.length < 0.0001) return fallback;
        return value.normalize();
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
}
