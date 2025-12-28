import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { PictureController, ActiveScannerEvent } from "./PictureController";
import { PaletteController } from "./PaletteController";
import { Slider } from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

/**
 * Event data for when a color is sampled via touch/trigger
 */
export class ColorSampledEvent {
	color: vec4;
	hex: string;
	scannerId: string | null;
	uv: vec2;
	
	constructor(color: vec4, hex: string, scannerId: string | null, uv: vec2) {
		this.color = color;
		this.hex = hex;
		this.scannerId = scannerId;
		this.uv = uv;
	}
}

/**
 * CursorPlaneController
 *
 * Manages a single cursor plane in the scene that tracks hover interactions
 * on active scanners. The cursor plane is a regular SceneObject (not prefab)
 * that gets repositioned when users interact with scanner cameraCrops.
 */
@component
export class CursorPlaneController extends BaseScriptComponent {
	@input
	@hint("The cursor plane SceneObject to move around")
	cursorPlane: SceneObject;

	@input
	@hint("The region hover plane SceneObject (positioned at hit with normal offset)")
	regionHoverPlane: SceneObject;

	@input
	@hint("Text component to display the sampled color as HEX code")
	sampledColorText: Text;

	@input
	@hint("Object whose material mainColor will be set to the sampled color")
	sampleColorIndicator: SceneObject;

	@input
	@hint("Object showing the sampled region grid")
	sampleRegionIndicator: SceneObject;

	@input
	@hint("Default grid size for texture sampling (odd number, e.g., 9 = 9x9 grid). Overridden by slider if assigned.")
	defaultGridSize: number = 9;

	@input
	@hint("Path to cameraCrop within scanner hierarchy")
	cameraCropPath: string = "ImageAnchor/CameraCrop";

	@input
	@hint("PaletteController to set colors on when sampling")
	paletteController: PaletteController;

	@input
	@hint("Slider to control grid size (optional). If assigned, this overrides defaultGridSize.")
	gridSizeSlider: SceneObject;

	@input
	@hint("Text to display current grid size (optional)")
	gridSizeText: Text;

	@input
	@hint("Minimum grid size")
	minGridSize: number = 3;

	@input
	@hint("Maximum grid size")
	maxGridSize: number = 21;

	// State
	private pictureController: PictureController | null = null;
	private activeScanner: SceneObject | null = null;
	private activeInteractable: Interactable | null = null;
	private activeCameraCrop: SceneObject | null = null;
	private activeCameraCropTransform: Transform | null = null;
	private activeCameraCropMaterial: any = null;

	// Transform references
	private cursorPlaneTransform: Transform;
	private regionHoverPlaneTransform: Transform | null = null;

	// Material references
	private sampleRegionMaterial: any = null;
	private sampledColorMaterial: any = null;

	// Validated grid size
	private validatedGridSize: number = 9;

	// Event cleanup
	private unsubscribeInteractable: (() => void)[] = [];
	private unsubscribeScannerChanged: (() => void) | null = null;

	// Reusable textures to avoid per-frame allocations
	private sampledTexture: Texture | null = null;
	private sampledTextureProvider: ProceduralTextureProvider | null = null;
	private pixelBuffer: Uint8Array | null = null;

	// Current sampled color state (updated on hover)
	private currentSampledColor: vec4 = new vec4(0, 0, 0, 1);
	private currentSampledHex: string = "#000000";
	private currentSampledUV: vec2 = new vec2(0.5, 0.5);
	private activeScannerId: string | null = null;

	// Public event for color sampling
	private onColorSampledEvent: Event<ColorSampledEvent> = new Event<ColorSampledEvent>();
	public readonly onColorSampled: PublicApi<ColorSampledEvent> = this.onColorSampledEvent.publicApi();

	// Slider reference
	private sliderComponent: Slider | null = null;

	onAwake() {
		if (!this.cursorPlane) {
			print("CursorPlaneController: Error - No cursor plane assigned");
			return;
		}

		this.cursorPlaneTransform = this.cursorPlane.getTransform();

		if (this.regionHoverPlane) {
			this.regionHoverPlaneTransform = this.regionHoverPlane.getTransform();
		}

		// Get PictureController via singleton
		this.pictureController = PictureController.getInstance();
		if (!this.pictureController) {
			print("CursorPlaneController: PictureController singleton not found");
			return;
		}

		// Validate grid size
		this.validatedGridSize = this.computeValidGridSize();

		// Pre-allocate reusable resources
		this.initializeReusableResources();

		// Setup materials
		this.setupMaterials();

		// Subscribe to active scanner changes (store unsubscribe function)
		const callback = this.onActiveScannerChanged.bind(this);
		this.pictureController.onActiveScannerChanged.add(callback);
		this.unsubscribeScannerChanged = () => {
			this.pictureController?.onActiveScannerChanged.remove(callback);
		};

		// Subscribe to color sampled events to update palette
		if (this.paletteController) {
			this.onColorSampled.add((event: ColorSampledEvent) => {
				this.paletteController.setActiveItemColor(event.color);
			});
		}

		// Setup grid size slider (deferred to OnStartEvent to ensure Slider is initialized)
		this.createEvent("OnStartEvent").bind(() => {
			this.setupGridSizeSlider();
		});

		// Hide planes initially (move far away)
		this.hidePlanes();

		// Register destroy event for cleanup
		this.createEvent("OnDestroyEvent").bind(this.onDestroy.bind(this));

		print("CursorPlaneController: Initialized");
	}

	private initializeReusableResources(): void {
		const gridSize = this.validatedGridSize;
		
		// Pre-allocate pixel buffer
		this.pixelBuffer = new Uint8Array(gridSize * gridSize * 4);
		
		// Pre-allocate output texture
		this.sampledTexture = ProceduralTextureProvider.createWithFormat(
			gridSize,
			gridSize,
			TextureFormat.RGBA8Unorm
		);
		this.sampledTextureProvider = this.sampledTexture.control as ProceduralTextureProvider;
	}

	private computeValidGridSize(): number {
		let size = Math.max(this.minGridSize, Math.min(this.maxGridSize, Math.floor(this.defaultGridSize)));
		if (size % 2 === 0) {
			size += 1;
		}
		return size;
	}

	private setupGridSizeSlider(): void {
		if (!this.gridSizeSlider) {
			// No slider - just update text with current value
			this.updateGridSizeText();
			return;
		}

		// Find Slider component
		this.sliderComponent = this.gridSizeSlider.getComponent("Component.ScriptComponent") as Slider;
		if (!this.sliderComponent) {
			// Try to find in children
			for (let i = 0; i < this.gridSizeSlider.getChildrenCount(); i++) {
				const child = this.gridSizeSlider.getChild(i);
				this.sliderComponent = child.getComponent("Component.ScriptComponent") as Slider;
				if (this.sliderComponent && typeof (this.sliderComponent as any).currentValue !== 'undefined') {
					break;
				}
			}
		}

		if (!this.sliderComponent) {
			print("CursorPlaneController: No Slider component found on gridSizeSlider");
			this.updateGridSizeText();
			return;
		}

		// Use slider's current value as the source of truth
		// This allows the slider's default value (set in Inspector) to override defaultGridSize
		const sliderValue = this.sliderComponent.currentValue;
		const gridSizeFromSlider = this.sliderValueToGridSize(sliderValue);
		
		// Update our grid size to match slider (if different)
		if (gridSizeFromSlider !== this.validatedGridSize) {
			this.setGridSize(gridSizeFromSlider);
		}

		// Update text display
		this.updateGridSizeText();

		// Subscribe to slider value changes
		this.sliderComponent.onValueChange.add((value: number) => {
			const newGridSize = this.sliderValueToGridSize(value);
			this.setGridSize(newGridSize);
		});

		print(`CursorPlaneController: Grid size slider initialized (${this.minGridSize}-${this.maxGridSize}), current: ${this.validatedGridSize}`);
	}

	private gridSizeToSliderValue(gridSize: number): number {
		// Map grid size to 0-1 range
		return (gridSize - this.minGridSize) / (this.maxGridSize - this.minGridSize);
	}

	private sliderValueToGridSize(sliderValue: number): number {
		// Map 0-1 to grid size range, ensuring odd number
		const rawSize = this.minGridSize + sliderValue * (this.maxGridSize - this.minGridSize);
		let size = Math.round(rawSize);
		if (size % 2 === 0) {
			size += 1; // Ensure odd
		}
		return Math.max(this.minGridSize, Math.min(this.maxGridSize, size));
	}

	private updateGridSizeText(): void {
		if (this.gridSizeText) {
			this.gridSizeText.text = `Grid Size: ${this.validatedGridSize}`;
		}
	}

	/**
	 * Set the grid size for texture sampling
	 */
	public setGridSize(newSize: number): void {
		// Validate and ensure odd
		let size = Math.max(this.minGridSize, Math.min(this.maxGridSize, Math.floor(newSize)));
		if (size % 2 === 0) {
			size += 1;
		}

		if (size === this.validatedGridSize) return;

		this.validatedGridSize = size;

		// Reallocate resources for new size
		this.pixelBuffer = new Uint8Array(size * size * 4);
		
		this.sampledTexture = ProceduralTextureProvider.createWithFormat(
			size,
			size,
			TextureFormat.RGBA8Unorm
		);
		this.sampledTextureProvider = this.sampledTexture.control as ProceduralTextureProvider;

		// Update material
		if (this.sampleRegionMaterial) {
			this.sampleRegionMaterial.gridScale = size;
			this.sampleRegionMaterial.mainTexture = this.sampledTexture;
		}

		// Update text display
		this.updateGridSizeText();

		print(`CursorPlaneController: Grid size changed to ${size}x${size}`);
	}

	/**
	 * Get the current grid size
	 */
	public getGridSize(): number {
		return this.validatedGridSize;
	}

	private setupMaterials() {
		if (this.sampleRegionIndicator) {
			const renderMesh = this.sampleRegionIndicator.getComponent("RenderMeshVisual");
			if (renderMesh) {
				this.sampleRegionMaterial = renderMesh.mainPass;
				if (this.sampleRegionMaterial) {
					this.sampleRegionMaterial.gridScale = this.validatedGridSize;
					// Assign the pre-allocated texture
					if (this.sampledTexture) {
						this.sampleRegionMaterial.mainTexture = this.sampledTexture;
					}
				}
			}
		}

		if (this.sampleColorIndicator) {
			const renderMesh = this.sampleColorIndicator.getComponent("RenderMeshVisual");
			if (renderMesh) {
				this.sampledColorMaterial = renderMesh.mainPass;
			}
		}
	}

	private onActiveScannerChanged(event: ActiveScannerEvent) {
		this.cleanupInteractableEvents();

		this.activeScanner = event.scanner;
		this.activeScannerId = event.scannerId;

		if (this.activeScanner && event.interactableObject) {
			this.activeCameraCrop = this.findCameraCropInScanner(this.activeScanner);

			if (this.activeCameraCrop) {
				this.activeCameraCropTransform = this.activeCameraCrop.getTransform();

				const renderMesh = this.activeCameraCrop.getComponent("RenderMeshVisual");
				if (renderMesh) {
					this.activeCameraCropMaterial = renderMesh.mainPass;
				}

				this.activeInteractable = event.interactableObject.getComponent(
					Interactable.getTypeName()
				) as Interactable;

				if (this.activeInteractable) {
					this.setupHoverEvents();
					print("CursorPlaneController: Tracking scanner " + event.scannerId);
				}
			}
		} else {
			this.hidePlanes();
			this.activeCameraCropTransform = null;
			this.activeCameraCropMaterial = null;
			this.activeCameraCrop = null;
			this.activeInteractable = null;
			this.activeScannerId = null;
		}
	}

	private findCameraCropInScanner(scanner: SceneObject): SceneObject | null {
		if (!this.cameraCropPath) return scanner;

		const pathParts = this.cameraCropPath.split("/");
		let current = scanner;

		for (let part of pathParts) {
			let found = false;
			for (let i = 0; i < current.getChildrenCount(); i++) {
				let child = current.getChild(i);
				if (child.name === part) {
					current = child;
					found = true;
					break;
				}
			}
			if (!found) {
				print("CursorPlaneController: Could not find '" + part + "' in hierarchy");
				return null;
			}
		}

		return current;
	}

	private setupHoverEvents() {
		if (!this.activeInteractable) return;

		this.unsubscribeInteractable.push(
			this.activeInteractable.onHoverEnter((e: InteractorEvent) => {
				if (!e.interactor?.targetHitInfo || !this.activeCameraCropTransform) return;

				const worldPosition = e.interactor.targetHitInfo.hit?.position ?? vec3.zero();
				this.updatePlanesAtWorldPosition(worldPosition);
			})
		);

		this.unsubscribeInteractable.push(
			this.activeInteractable.onHoverUpdate((e: InteractorEvent) => {
				if (!e.interactor?.targetHitInfo || !this.activeCameraCropTransform) return;

				const worldPosition = e.interactor.targetHitInfo.hit?.position ?? vec3.zero();
				this.updatePlanesAtWorldPosition(worldPosition);
			})
		);

		this.unsubscribeInteractable.push(
			this.activeInteractable.onHoverExit(() => {
				this.hidePlanes();
			})
		);

		// Trigger/touch events - emit the sampled color
		this.unsubscribeInteractable.push(
			this.activeInteractable.onTriggerStart((e: InteractorEvent) => {
				this.emitColorSampledEvent();
			})
		);

		this.unsubscribeInteractable.push(
			this.activeInteractable.onTriggerEnd((e: InteractorEvent) => {
				// Optional: could emit on end as well if needed
			})
		);
	}

	private cleanupInteractableEvents() {
		this.unsubscribeInteractable.forEach((unsub) => unsub());
		this.unsubscribeInteractable = [];
	}

	private updatePlanesAtWorldPosition(worldPosition: vec3): void {
		if (!this.activeCameraCropTransform) return;

		const uv = this.worldToUV(worldPosition);
		this.currentSampledUV = uv;

		// Position planes directly at the hit position
		this.positionPlanes(worldPosition);
		this.updateCursorPlaneTexture(uv);
	}

	private worldToUV(worldPosition: vec3): vec2 {
		if (!this.activeCameraCropTransform) return new vec2(0.5, 0.5);

		const invertedWorldTransform = this.activeCameraCropTransform.getInvertedWorldTransform();
		const localPos = invertedWorldTransform.multiplyPoint(worldPosition);

		return new vec2(
			Math.max(0.0, Math.min(1.0, localPos.x + 0.5)),
			Math.max(0.0, Math.min(1.0, localPos.y + 0.5))
		);
	}

	private positionPlanes(worldPosition: vec3): void {
		if (!this.activeCameraCropTransform) return;

		const worldRotation = this.activeCameraCropTransform.getWorldRotation();

		// Position cursor plane directly at hit position
		this.cursorPlaneTransform.setWorldPosition(worldPosition);
		this.cursorPlaneTransform.setWorldRotation(worldRotation);

		// Position region hover plane at same position
		if (this.regionHoverPlaneTransform) {
			this.regionHoverPlaneTransform.setWorldPosition(worldPosition);
			this.regionHoverPlaneTransform.setWorldRotation(worldRotation);
		}
	}

	private hidePlanes(): void {
		const hidePosition = new vec3(0, 1000, 0);
		this.cursorPlaneTransform.setWorldPosition(hidePosition);

		if (this.regionHoverPlaneTransform) {
			this.regionHoverPlaneTransform.setWorldPosition(hidePosition);
		}
	}

	private updateCursorPlaneTexture(uv: vec2): void {
		if (!this.sampledTextureProvider || !this.pixelBuffer || !this.activeCameraCropMaterial) return;

		const sourceTexture: Texture = this.activeCameraCropMaterial.captureImage;
		if (!sourceTexture) return;

		const width = sourceTexture.getWidth();
		const height = sourceTexture.getHeight();
		if (width <= 0 || height <= 0) return;

		const gridSize = this.validatedGridSize;
		const halfGrid = Math.floor(gridSize / 2);

		const centerPixelX = Math.round(uv.x * (width - 1));
		const centerPixelY = Math.round(uv.y * (height - 1));

		const startPixelX = Math.max(0, Math.min(width - gridSize, centerPixelX - halfGrid));
		const startPixelY = Math.max(0, Math.min(height - gridSize, centerPixelY - halfGrid));

		// Use the source texture's control directly if available, otherwise create temporary
		let sourceProvider: ProceduralTextureProvider;
		let tempTexture: Texture | null = null;
		
		if (sourceTexture.control && typeof (sourceTexture.control as any).getPixels === 'function') {
			sourceProvider = sourceTexture.control as ProceduralTextureProvider;
		} else {
			// Create temporary procedural texture from source (unavoidable for non-procedural sources)
			tempTexture = ProceduralTextureProvider.createFromTexture(sourceTexture);
			sourceProvider = tempTexture.control as ProceduralTextureProvider;
		}

		// Read pixels into pre-allocated buffer
		sourceProvider.getPixels(startPixelX, startPixelY, gridSize, gridSize, this.pixelBuffer);

		// Write to pre-allocated output texture
		this.sampledTextureProvider.setPixels(0, 0, gridSize, gridSize, this.pixelBuffer);

		// Clean up temporary texture if created
		if (tempTexture) {
			// Note: Lens Studio may not have explicit texture destroy, but nulling helps GC
			tempTexture = null;
		}

		this.updateSampledColor(this.pixelBuffer, gridSize, halfGrid);
	}

	private updateSampledColor(
		pixelBuffer: Uint8Array,
		gridSize: number,
		halfGrid: number
	): void {
		const ONE_OVER_255 = 0.00392156862;
		const centerPixelIndex = (halfGrid * gridSize + halfGrid) * 4;

		const r = pixelBuffer[centerPixelIndex];
		const g = pixelBuffer[centerPixelIndex + 1];
		const b = pixelBuffer[centerPixelIndex + 2];

		// Store current sampled color
		this.currentSampledColor = new vec4(
			r * ONE_OVER_255,
			g * ONE_OVER_255,
			b * ONE_OVER_255,
			1.0
		);
		this.currentSampledHex = this.rgbToHex(r, g, b);

		if (this.sampledColorText) {
			this.sampledColorText.text = this.currentSampledHex;
		}

		if (this.sampledColorMaterial) {
			this.sampledColorMaterial.mainColor = this.currentSampledColor;
		}
	}

	private emitColorSampledEvent(): void {
		const event = new ColorSampledEvent(
			this.currentSampledColor,
			this.currentSampledHex,
			this.activeScannerId,
			this.currentSampledUV
		);
		this.onColorSampledEvent.invoke(event);
		print(`CursorPlaneController: Color sampled ${this.currentSampledHex} from scanner ${this.activeScannerId}`);
	}

	/**
	 * Get the currently sampled color (updated on hover)
	 */
	public getCurrentSampledColor(): vec4 {
		return this.currentSampledColor;
	}

	/**
	 * Get the currently sampled color as hex string
	 */
	public getCurrentSampledHex(): string {
		return this.currentSampledHex;
	}

	private rgbToHex(r: number, g: number, b: number): string {
		const toHex = (value: number): string => {
			const hex = Math.round(value).toString(16).toUpperCase();
			return hex.length === 1 ? "0" + hex : hex;
		};
		return "#" + toHex(r) + toHex(g) + toHex(b);
	}

	private onDestroy(): void {
		// Cleanup interactable event subscriptions
		this.cleanupInteractableEvents();

		// Cleanup PictureController subscription
		if (this.unsubscribeScannerChanged) {
			this.unsubscribeScannerChanged();
			this.unsubscribeScannerChanged = null;
		}

		// Clear references
		this.pictureController = null;
		this.activeScanner = null;
		this.activeInteractable = null;
		this.activeCameraCrop = null;
		this.activeCameraCropTransform = null;
		this.activeCameraCropMaterial = null;
		this.sampleRegionMaterial = null;
		this.sampledColorMaterial = null;
		this.sampledTexture = null;
		this.sampledTextureProvider = null;
		this.pixelBuffer = null;

		print("CursorPlaneController: Destroyed and cleaned up");
	}
}