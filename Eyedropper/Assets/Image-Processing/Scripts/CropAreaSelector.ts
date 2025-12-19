import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { Interactor } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

/**
 * HoverHitInfo contains position data for hover/drag interactions
 */
export type HoverHitInfo = {
    localPosition: vec2;
    normalizedPosition: vec2;
    worldPosition: vec3;
};

const ONE_OVER_255 = 0.00392156862;

/**
 * CropAreaSelector
 * 
 * Allows users to capture a snapshot of a screen texture and select a crop region.
 * 
 * Workflow:
 * 1. User pinches snapshot button to capture current screen state
 * 2. The captured snapshot is displayed on this SceneObject's mesh
 * 3. User drags on the snapshot to select a crop region
 * 4. The cropped pixels are displayed on cropAreaMesh with grid overlay
 * 5. Center pixel color is shown on selectedPixelMesh
 */
@component
export class CropAreaSelector extends BaseScriptComponent {
    @input
    @hint("Grid size (odd number). E.g., 9 = 9x9 grid with center pixel in middle")
    gridScale: number = 9;

    @input
    @hint("The source screen texture to capture snapshots from")
    screenCropTexture: Texture;

    @input
    @hint("Mesh displaying the cropped pixel grid")
    cropAreaMesh: SceneObject;

    @input
    @hint("Mesh displaying the currently selected color")
    selectedPixelMesh: SceneObject;

    @input
    @hint("Button to trigger snapshot capture")
    snapshotButton: PinchButton;

    // Texture providers and materials
    private screenCropProvider: ProceduralTextureProvider = null;
    private snapshotMaterial: any = null;
    private cropAreaMaterial: any = null;
    private selectedColorMaterial: any = null;
    
    // Texture dimensions
    private screenCropWidth: number = 0;
    private screenCropHeight: number = 0;
    
    // Component references
    private _transform: Transform;
    private _interactable: Interactable;
    private _collider: ColliderComponent;
    
    // Validated grid scale
    private _validatedGridScale: number = 9;

    // Interaction state
    private _isHovered: boolean = false;
    private _isDragging: boolean = false;
    private _currentHitInfo: HoverHitInfo | null = null;
    private _currentInteractor: Interactor | null = null;
    private _isTextureReady: boolean = false;

    // Events
    private _onHoverStartEvent = new Event<HoverHitInfo>();
    readonly onHoverStart: PublicApi<HoverHitInfo> = this._onHoverStartEvent.publicApi();

    private _onHoverUpdateEvent = new Event<HoverHitInfo>();
    readonly onHoverUpdate: PublicApi<HoverHitInfo> = this._onHoverUpdateEvent.publicApi();

    private _onHoverEndEvent = new Event<void>();
    readonly onHoverEnd: PublicApi<void> = this._onHoverEndEvent.publicApi();

    private _onCropAreaChangedEvent = new Event<void>();
    readonly onCropAreaChanged: PublicApi<void> = this._onCropAreaChangedEvent.publicApi();

    private _onSnapshotTakenEvent = new Event<void>();
    readonly onSnapshotTaken: PublicApi<void> = this._onSnapshotTakenEvent.publicApi();

    // Public getters
    get isHovered(): boolean { return this._isHovered; }
    get isDragging(): boolean { return this._isDragging; }
    get currentHitInfo(): HoverHitInfo | null { return this._currentHitInfo; }
    get currentInteractor(): Interactor | null { return this._currentInteractor; }
    get validatedGridScale(): number { return this._validatedGridScale; }
    get isTextureReady(): boolean { return this._isTextureReady; }

    onAwake(): void {
        this._validatedGridScale = this.computeValidGridScale();
        this.createEvent("OnStartEvent").bind(() => this.initialize());
    }

    private computeValidGridScale(): number {
        let scale = Math.max(1, Math.floor(this.gridScale));
        if (scale % 2 === 0) {
            scale += 1;
        }
        return scale;
    }

    private initialize(): void {
        this._transform = this.sceneObject.getTransform();
        
        this.cacheMaterialReferences();
        this.setupCollider();
        this.setupInteractable();
        this.setupSnapshotButton();
        
        this.createEvent("OnDestroyEvent").bind(() => this.cleanup());

        print("CropAreaSelector: Initialized, awaiting snapshot capture");
    }

    private cacheMaterialReferences(): void {
        this.snapshotMaterial = this.sceneObject.getComponent("RenderMeshVisual").mainPass;
        this.cropAreaMaterial = this.cropAreaMesh.getComponent("RenderMeshVisual").mainPass;
        this.selectedColorMaterial = this.selectedPixelMesh.getComponent("RenderMeshVisual").mainPass;
        
        this.cropAreaMaterial.gridScale = this._validatedGridScale;
    }

    private setupSnapshotButton(): void {
        if (!this.snapshotButton) {
            print("CropAreaSelector: Warning - No snapshot button assigned");
            return;
        }

        this.snapshotButton.onButtonPinched.add(() => {
            this.takeSnapshot();
        });

        print("CropAreaSelector: Snapshot button configured");
    }

    /**
     * Captures the current state of screenCropTexture as a static snapshot.
     * Updates this SceneObject's mesh with the captured image.
     */
    public takeSnapshot(): void {
        if (!this.screenCropTexture) {
            print("CropAreaSelector: Error - No screen crop texture assigned");
            return;
        }

        const colorspace = this.screenCropTexture.getColorspace();
        const width = this.screenCropTexture.getWidth();
        const height = this.screenCropTexture.getHeight();

        if (colorspace !== 3 || width <= 0 || height <= 0) {
            print("CropAreaSelector: Warning - Texture not ready (colorspace: " + colorspace + ", size: " + width + "x" + height + ")");
            return;
        }

        // Create procedural texture from current screen state
        const proceduralTexture = ProceduralTextureProvider.createFromTexture(this.screenCropTexture);
        this.screenCropProvider = proceduralTexture.control as ProceduralTextureProvider;

        this.screenCropWidth = width;
        this.screenCropHeight = height;

        // Update snapshot display on this SceneObject's mesh
        this.updateSnapshotDisplay(proceduralTexture);

        this._isTextureReady = true;

        // Initialize crop area at center
        const position = this._currentHitInfo?.localPosition ?? new vec2(0, 0);
        this.updateCropArea(position);

        this._onSnapshotTakenEvent.invoke();
        print("CropAreaSelector: Snapshot captured (" + width + "x" + height + ")");
    }

    private updateSnapshotDisplay(proceduralTexture: Texture): void {
        this.snapshotMaterial.baseTex = proceduralTexture;
    }

    private setupCollider(): void {
        this._collider = this.sceneObject.getComponent("Physics.ColliderComponent");

        if (!this._collider) {
            this._collider = this.sceneObject.createComponent("Physics.ColliderComponent");
            this._collider.fitVisual = true;
        }
    }

    private setupInteractable(): void {
        this._interactable = this.sceneObject.getComponent(Interactable.getTypeName());

        if (!this._interactable) {
            this._interactable = this.sceneObject.createComponent(Interactable.getTypeName());
        }

        this._interactable.allowMultipleInteractors = false;

        this._interactable.onHoverEnter((e: InteractorEvent) => {
            this._isHovered = true;
            this._currentInteractor = e.interactor;
            const hitInfo = this.computeHitPosition(e.interactor);
            this._currentHitInfo = hitInfo;
            this._onHoverStartEvent.invoke(hitInfo);
        });

        this._interactable.onHoverUpdate((e: InteractorEvent) => {
            if (!e.interactor.targetHitInfo) {
                return;
            }

            const hitInfo = this.computeHitPosition(e.interactor);

            if (!this.isWithinBounds(hitInfo.localPosition)) {
                return;
            }

            this._currentHitInfo = hitInfo;
            this._onHoverUpdateEvent.invoke(hitInfo);
        });

        this._interactable.onHoverExit(() => {
            this._isHovered = false;
            this._currentInteractor = null;
            this._currentHitInfo = null;
            this._onHoverEndEvent.invoke();
        });

        this._interactable.onDragStart((e: InteractorEvent) => {
            if (!this._isTextureReady) {
                print("CropAreaSelector: Snapshot required before selecting crop area");
                return;
            }
            
            if (!e.interactor.targetHitInfo) {
                return;
            }

            const hitInfo = this.computeHitPosition(e.interactor);

            if (!this.isWithinBounds(hitInfo.localPosition)) {
                return;
            }

            this._isDragging = true;
            this._currentHitInfo = hitInfo;
            this.updateCropArea(hitInfo.localPosition);
        });

        this._interactable.onDragUpdate((e: InteractorEvent) => {
            if (!this._isDragging || !this._isTextureReady) {
                return;
            }
            
            if (!e.interactor.targetHitInfo) {
                return;
            }

            const hitInfo = this.computeHitPosition(e.interactor);

            if (!this.isWithinBounds(hitInfo.localPosition)) {
                return;
            }

            this._currentHitInfo = hitInfo;
            this.updateCropArea(hitInfo.localPosition);
        });

        this._interactable.onDragEnd(() => {
            this._isDragging = false;
        });
    }

    private isWithinBounds(localPosition: vec2): boolean {
        return (
            localPosition.x >= -0.5 &&
            localPosition.x <= 0.5 &&
            localPosition.y >= -0.5 &&
            localPosition.y <= 0.5
        );
    }

    private updateCropArea(localPosition: vec2): void {
        if (!this.screenCropProvider || !this.cropAreaMaterial) {
            return;
        }

        const gridSize = this._validatedGridScale;
        const halfGrid = Math.floor(gridSize / 2);

        const centerPixel = this.localToPixelCoords(localPosition);
        const startPixel = this.clampCropRegion(centerPixel, gridSize, halfGrid);

        const croppedPixels = this.sampleCroppedPixels(startPixel, gridSize);
        this.updateCropAreaTexture(croppedPixels, gridSize);
        this.updateSelectedColor(croppedPixels, gridSize, halfGrid);
        this.resetSelectionToCenter();

        this._onCropAreaChangedEvent.invoke();
    }

    private localToPixelCoords(localPosition: vec2): vec2 {
        return new vec2(
            Math.round((localPosition.x + 0.5) * (this.screenCropWidth - 1)),
            Math.round((localPosition.y + 0.5) * (this.screenCropHeight - 1))
        );
    }

    private clampCropRegion(centerPixel: vec2, gridSize: number, halfGrid: number): vec2 {
        return new vec2(
            Math.max(0, Math.min(this.screenCropWidth - gridSize, centerPixel.x - halfGrid)),
            Math.max(0, Math.min(this.screenCropHeight - gridSize, centerPixel.y - halfGrid))
        );
    }

    private sampleCroppedPixels(startPixel: vec2, gridSize: number): Uint8Array {
        const pixelBuffer = new Uint8Array(gridSize * gridSize * 4);
        this.screenCropProvider.getPixels(
            startPixel.x,
            startPixel.y,
            gridSize,
            gridSize,
            pixelBuffer
        );
        return pixelBuffer;
    }

    private updateCropAreaTexture(croppedPixels: Uint8Array, gridSize: number): void {
        const cropAreaTexture = ProceduralTextureProvider.createWithFormat(
            gridSize,
            gridSize,
            TextureFormat.RGBA8Unorm
        );
        const texProvider = cropAreaTexture.control as ProceduralTextureProvider;
        texProvider.setPixels(0, 0, gridSize, gridSize, croppedPixels);

        this.cropAreaMaterial.mainTexture = cropAreaTexture;
    }

    private updateSelectedColor(croppedPixels: Uint8Array, gridSize: number, halfGrid: number): void {
        const centerPixelIndex = halfGrid * gridSize + halfGrid;
        const i = centerPixelIndex * 4;

        const color = new vec4(
            croppedPixels[i] * ONE_OVER_255,
            croppedPixels[i + 1] * ONE_OVER_255,
            croppedPixels[i + 2] * ONE_OVER_255,
            1.0
        );

        this.selectedColorMaterial.baseColor = color;
    }

    private resetSelectionToCenter(): void {
        const gridSize = this._validatedGridScale;
        const centerCell = Math.floor(gridSize / 2);
        const centerUV = new vec2(
            (centerCell + 0.5) / gridSize,
            (centerCell + 0.5) / gridSize
        );
        this.cropAreaMaterial.selectionUV = centerUV;
    }

    private computeHitPosition(interactor: Interactor): HoverHitInfo {
        const worldPosition = interactor.targetHitInfo?.hit?.position ?? vec3.zero();
        const invertedWorldTransform = this._transform.getInvertedWorldTransform();
        const localPos = invertedWorldTransform.multiplyPoint(worldPosition);

        return {
            localPosition: new vec2(localPos.x, localPos.y),
            normalizedPosition: new vec2(localPos.x * 2, localPos.y * 2),
            worldPosition: worldPosition,
        };
    }

    private cleanup(): void {
        if (this._interactable) {
            this._interactable.destroy();
        }
    }
}