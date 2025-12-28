import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { BaseButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton";

export interface PaletteItem {
	id: string;
	prefab: ObjectPrefab;
}

export class PaletteSelectionEvent {
	id: string;
	index: number;
	sceneObject: SceneObject;

	constructor(id: string, index: number, sceneObject: SceneObject) {
		this.id = id;
		this.index = index;
		this.sceneObject = sceneObject;
	}
}

export class PresetChangedEvent {
	presetName: PigmentPresetName | null;
	presetIndex: number;
	colors: vec4[];

	constructor(
		presetName: PigmentPresetName | null,
		presetIndex: number,
		colors: vec4[]
	) {
		this.presetName = presetName;
		this.presetIndex = presetIndex;
		this.colors = colors;
	}
}

const OIL_PIGMENT_PRESETS = {
	classic: [
		{ name: "Titanium White", color: new vec4(0.98, 0.98, 0.96, 1.0) },
		{ name: "Ivory Black", color: new vec4(0.08, 0.08, 0.08, 1.0) },
		{ name: "Cadmium Yellow", color: new vec4(1.0, 0.85, 0.0, 1.0) },
		{ name: "Cadmium Red", color: new vec4(0.89, 0.09, 0.05, 1.0) },
		{ name: "Ultramarine Blue", color: new vec4(0.15, 0.15, 0.7, 1.0) },
		{ name: "Viridian Green", color: new vec4(0.0, 0.5, 0.45, 1.0) },
	],
	zorn: [
		{ name: "Titanium White", color: new vec4(0.98, 0.98, 0.96, 1.0) },
		{ name: "Ivory Black", color: new vec4(0.08, 0.08, 0.08, 1.0) },
		{ name: "Yellow Ochre", color: new vec4(0.8, 0.65, 0.25, 1.0) },
		{ name: "Cadmium Red", color: new vec4(0.89, 0.09, 0.05, 1.0) },
		{ name: "Burnt Sienna", color: new vec4(0.54, 0.27, 0.12, 1.0) },
		{ name: "Raw Umber", color: new vec4(0.44, 0.32, 0.18, 1.0) },
	],
	primary: [
		{ name: "Titanium White", color: new vec4(0.98, 0.98, 0.96, 1.0) },
		{ name: "Ivory Black", color: new vec4(0.08, 0.08, 0.08, 1.0) },
		{ name: "Cadmium Yellow Light", color: new vec4(1.0, 0.92, 0.0, 1.0) },
		{ name: "Cadmium Red Medium", color: new vec4(0.89, 0.09, 0.05, 1.0) },
		{ name: "Ultramarine Blue", color: new vec4(0.15, 0.15, 0.7, 1.0) },
		{ name: "Phthalo Blue", color: new vec4(0.0, 0.25, 0.55, 1.0) },
	],
	impressionist: [
		{ name: "Titanium White", color: new vec4(0.98, 0.98, 0.96, 1.0) },
		{ name: "Cadmium Yellow", color: new vec4(1.0, 0.85, 0.0, 1.0) },
		{ name: "Cadmium Orange", color: new vec4(0.93, 0.53, 0.18, 1.0) },
		{ name: "Cadmium Red", color: new vec4(0.89, 0.09, 0.05, 1.0) },
		{ name: "Ultramarine Blue", color: new vec4(0.15, 0.15, 0.7, 1.0) },
		{ name: "Viridian Green", color: new vec4(0.0, 0.5, 0.45, 1.0) },
	],
	earth: [
		{ name: "Titanium White", color: new vec4(0.98, 0.98, 0.96, 1.0) },
		{ name: "Ivory Black", color: new vec4(0.08, 0.08, 0.08, 1.0) },
		{ name: "Yellow Ochre", color: new vec4(0.8, 0.65, 0.25, 1.0) },
		{ name: "Burnt Sienna", color: new vec4(0.54, 0.27, 0.12, 1.0) },
		{ name: "Raw Umber", color: new vec4(0.44, 0.32, 0.18, 1.0) },
		{ name: "Sap Green", color: new vec4(0.31, 0.4, 0.18, 1.0) },
	],
};

export type PigmentPresetName = keyof typeof OIL_PIGMENT_PRESETS;

const PRESET_ORDER: PigmentPresetName[] = [
	"classic",
	"zorn",
	"primary",
	"impressionist",
	"earth",
];

// Clear/empty color (black with zero alpha)
const CLEAR_COLOR = new vec4(0, 0, 0, 0);

interface PaletteItemData {
	sceneObject: SceneObject;
	button: BaseButton;
	index: number;
	slotTextObj: SceneObject | null;
	coloredSquare: SceneObject | null;
	coloredSquareMaterial: Material | null;
	color: vec4;
}

interface PaletteItemListEntry {
	id: string;
	sceneObject: SceneObject;
	button: BaseButton;
	slotTextObj: SceneObject | null;
	coloredSquare: SceneObject | null;
	coloredSquareMaterial: Material | null;
	color: vec4;
}

interface BoundingBox {
	min: vec3;
	max: vec3;
	size: vec3;
	center: vec3;
}

@component
export class PaletteController extends BaseScriptComponent {
	@input
	@hint("List of prefabs to instantiate as palette items")
	itemPrefabs: ObjectPrefab[] = [];

	@input
	@hint("Optional IDs for each prefab (comma-separated)")
	itemIds: string = "";

	@input
	@hint("Path to the colored square within item hierarchy")
	coloredSquarePath: string = "Colored Square";

	@input
	@hint("Path to the slot's text within item hierarchy")
	slotTextPath: string = "Text";

	@input
	@hint("Number of columns in the grid (0 = auto-calculate)")
	columns: number = 0;

	@input
	@hint("Number of rows in the grid (0 = auto-calculate)")
	rows: number = 0;

	@input
	@hint("Padding between items")
	padding: vec2 = new vec2(5, 5);

	@input
	@hint("Offset of the item grid")
	offset: vec2 = new vec2(0, 0);

	@input
	@hint("Index of the default selected item (-1 for none)")
	defaultSelectedIndex: number = 0;

	@input
	@hint("Layout direction: true = row-first, false = column-first")
	layoutByRow: boolean = true;

	@input
	@hint("In editor scanner creation button")
	editorTestButton: SceneObject | null = null;

	private isEditor = global.deviceInfoSystem.isEditor();
	private items: Map<string, PaletteItemData> = new Map();
	private itemList: PaletteItemListEntry[] = [];
	private activeItemId: string | null = null;
	private isUpdatingSelection: boolean = false;
	private initialized: boolean = false;

	// Preset state - null means uninitialized or cleared
	private currentPreset: PigmentPresetName | null = null;
	private currentPresetIndex: number = -1;

	private onSelectionChangedEvent: Event<PaletteSelectionEvent> =
		new Event<PaletteSelectionEvent>();
	public readonly onSelectionChanged: PublicApi<PaletteSelectionEvent> =
		this.onSelectionChangedEvent.publicApi();

	private onPresetChangedEvent: Event<PresetChangedEvent> =
		new Event<PresetChangedEvent>();
	public readonly onPresetChanged: PublicApi<PresetChangedEvent> =
		this.onPresetChangedEvent.publicApi();

	onAwake(): void {
		this.createEvent("OnStartEvent").bind(this.initialize.bind(this));
		// if (this.editorTestButton && !this.isEditor) {
		// 	this.editorTestButton.enabled = false;
		// }
	}

	initialize(): void {
		if (this.initialized) return;

		this.instantiateItems();
		this.layoutItems();
		this.setupButtonListeners();

		if (
			this.defaultSelectedIndex >= 0 &&
			this.defaultSelectedIndex < this.itemList.length
		) {
			const defaultItem = this.itemList[this.defaultSelectedIndex];
			this.setActiveItem(defaultItem.id, false);
		}

		this.initialized = true;
		print("PaletteController: Initialization complete");
	}

	public applyPresetByIndex(index: number, notify: boolean = true): void {
		if (index < 0 || index >= PRESET_ORDER.length) {
			print(`PaletteController: Invalid preset index ${index}`);
			return;
		}

		const presetName = PRESET_ORDER[index];
		this.applyPreset(presetName, index, notify);
	}

	public setOilPigmentPreset(
		presetName: PigmentPresetName = "classic",
		notify: boolean = true
	): void {
		const index = PRESET_ORDER.indexOf(presetName);
		if (index < 0) {
			print(`PaletteController: Unknown preset '${presetName}'`);
			return;
		}

		this.applyPreset(presetName, index, notify);
	}

	private applyPreset(
		presetName: PigmentPresetName,
		presetIndex: number,
		notify: boolean
	): void {
		const preset = OIL_PIGMENT_PRESETS[presetName];
		if (!preset) return;

		// Only skip if already applied (null means never applied)
		if (
			this.currentPreset !== null &&
			this.currentPreset === presetName &&
			this.currentPresetIndex === presetIndex
		) {
			return;
		}

		this.currentPreset = presetName;
		this.currentPresetIndex = presetIndex;

		const count = Math.min(this.itemList.length, preset.length);
		const colors: vec4[] = [];

		for (let i = 0; i < count; i++) {
			const pigment = preset[i];
			const item = this.itemList[i];

			item.color = pigment.color;
			colors.push(pigment.color);

			const itemData = this.items.get(item.id);
			if (itemData) {
				itemData.color = pigment.color;
			}

			if (item.coloredSquareMaterial) {
				item.coloredSquareMaterial.mainPass.mainColor = pigment.color;
			}

			if (item.slotTextObj) {
				const textComponent = item.slotTextObj.getComponent("Text") as Text;
				if (textComponent) {
					textComponent.text = `${i + 1}`;
				}
			}
		}

		print(
			`PaletteController: Applied '${presetName}' preset (index ${presetIndex})`
		);

		if (notify) {
			this.onPresetChangedEvent.invoke(
				new PresetChangedEvent(presetName, presetIndex, colors)
			);
		}
	}

	/**
	 * Clear all slot colors to black with zero alpha
	 * This effectively empties the palette
	 */
	public clearSlotColors(notify: boolean = true): void {
		const colors: vec4[] = [];

		for (let i = 0; i < this.itemList.length; i++) {
			const item = this.itemList[i];
			const clearColor = new vec4(0, 0, 0, 0);

			item.color = clearColor;
			colors.push(clearColor);

			const itemData = this.items.get(item.id);
			if (itemData) {
				itemData.color = clearColor;
			}

			if (item.coloredSquareMaterial) {
				item.coloredSquareMaterial.mainPass.mainColor = clearColor;
			}
		}

		// Reset preset state
		this.currentPreset = null;
		this.currentPresetIndex = -1;

		print("PaletteController: Cleared all slot colors");

		if (notify) {
			this.onPresetChangedEvent.invoke(
				new PresetChangedEvent(null, -1, colors)
			);
		}
	}

	/**
	 * Check if the palette is cleared (all slots empty)
	 */
	public isCleared(): boolean {
		return this.currentPreset === null && this.currentPresetIndex === -1;
	}

	/**
	 * Check if a specific slot is empty (zero alpha)
	 */
	public isSlotEmpty(index: number): boolean {
		if (index < 0 || index >= this.itemList.length) return true;
		return this.itemList[index].color.w === 0;
	}

	/**
	 * Get number of non-empty slots
	 */
	public getActiveSlotCount(): number {
		let count = 0;
		for (const item of this.itemList) {
			if (item.color.w > 0) {
				count++;
			}
		}
		return count;
	}

	private instantiateItems(): void {
		const ids = this.itemIds
			.split(",")
			.map((id) => id.trim())
			.filter((id) => id.length > 0);

		for (let i = 0; i < this.itemPrefabs.length; i++) {
			const prefab = this.itemPrefabs[i];
			if (!prefab) continue;

			const sceneObject = prefab.instantiate(this.getSceneObject());
			const id = ids[i] || `item_${i}`;
			sceneObject.name = `PaletteItem_${id}`;

			const button = this.findButtonComponent(sceneObject);
			if (!button) {
				print(
					`PaletteController: No BaseButton found on prefab ${i}, skipping`
				);
				sceneObject.destroy();
				continue;
			}

			const coloredSquare = this.findChildByPath(
				sceneObject,
				this.coloredSquarePath
			);
			let coloredSquareMaterial: Material | null = null;

			if (coloredSquare) {
				const renderMesh = coloredSquare.getComponent(
					"Component.RenderMeshVisual"
				) as RenderMeshVisual;
				if (renderMesh && renderMesh.mainMaterial) {
					renderMesh.mainMaterial = renderMesh.mainMaterial.clone();
					coloredSquareMaterial = renderMesh.mainMaterial;
				}
			}

			const slotTextObj = this.findChildByPath(sceneObject, this.slotTextPath);
			if (slotTextObj) {
				const textComp = slotTextObj.getComponent("Text") as Text;
				if (textComp) {
					textComp.text = `${i + 1}`;
				}
			}

			button.setIsToggleable(true);

			// Initialize with clear color - preset will be applied after
			const initialColor = new vec4(0, 0, 0, 0);

			const itemData: PaletteItemData = {
				sceneObject,
				button,
				index: this.itemList.length,
				slotTextObj,
				coloredSquare,
				coloredSquareMaterial,
				color: initialColor,
			};

			this.items.set(id, itemData);
			this.itemList.push({
				id,
				sceneObject,
				button,
				slotTextObj,
				coloredSquare,
				coloredSquareMaterial,
				color: initialColor,
			});
		}

		print(`PaletteController: Instantiated ${this.itemList.length} items`);
	}

	private findChildByPath(
		sceneObject: SceneObject,
		path: string
	): SceneObject | null {
		if (!path) return sceneObject;

		const pathParts = path.split("/");
		let current = sceneObject;

		for (const part of pathParts) {
			let found = false;
			for (let i = 0; i < current.getChildrenCount(); i++) {
				const child = current.getChild(i);
				if (child.name === part) {
					current = child;
					found = true;
					break;
				}
			}
			if (!found) {
				return null;
			}
		}

		return current;
	}

	private findButtonComponent(sceneObject: SceneObject): BaseButton | null {
		const button = sceneObject.getComponent(
			"Component.ScriptComponent"
		) as BaseButton;

		if (button && typeof (button as any).setIsToggleable === "function") {
			return button;
		}

		for (let i = 0; i < sceneObject.getChildrenCount(); i++) {
			const child = sceneObject.getChild(i);
			const childButton = this.findButtonComponent(child);
			if (childButton) return childButton;
		}

		return null;
	}

	private layoutItems(): void {
		if (this.itemList.length === 0) return;

		const itemCount = this.itemList.length;
		let cols = this.columns;
		let rows = this.rows;

		if (cols <= 0 && rows <= 0) {
			cols = Math.ceil(Math.sqrt(itemCount));
			rows = Math.ceil(itemCount / cols);
		} else if (cols <= 0) {
			cols = Math.ceil(itemCount / rows);
		} else if (rows <= 0) {
			rows = Math.ceil(itemCount / cols);
		}

		const boundingBoxes = this.itemList.map((item) =>
			this.calculateBoundingBox(item.sceneObject)
		);

		let maxWidth = 0;
		let maxHeight = 0;
		for (const bbox of boundingBoxes) {
			maxWidth = Math.max(maxWidth, bbox.size.x);
			maxHeight = Math.max(maxHeight, bbox.size.y);
		}

		if (maxWidth === 0) maxWidth = 10;
		if (maxHeight === 0) maxHeight = 10;

		const cellWidth = maxWidth + this.padding.x;
		const cellHeight = maxHeight + this.padding.y;

		const totalWidth = cols * cellWidth;
		const totalHeight = rows * cellHeight;

		const startX = -totalWidth / 2 + cellWidth / 2;
		const startY = totalHeight / 2 - cellHeight / 2;

		for (let i = 0; i < this.itemList.length; i++) {
			let col: number;
			let row: number;

			if (this.layoutByRow) {
				col = i % cols;
				row = Math.floor(i / cols);
			} else {
				row = i % rows;
				col = Math.floor(i / rows);
			}

			const x = startX + col * cellWidth;
			const y = startY - row * cellHeight;

			const item = this.itemList[i];
			const transform = item.sceneObject.getTransform();
			transform.setLocalPosition(
				new vec3(x + this.offset.x, y + this.offset.y, 0)
			);
		}

		print(
			`PaletteController: Laid out ${itemCount} items in ${rows}x${cols} grid`
		);
	}

	private calculateBoundingBox(sceneObject: SceneObject): BoundingBox {
		const defaultBox: BoundingBox = {
			min: vec3.zero(),
			max: vec3.zero(),
			size: vec3.zero(),
			center: vec3.zero(),
		};

		const meshVisuals = this.findMeshVisuals(sceneObject);
		if (meshVisuals.length === 0) return defaultBox;

		let minX = Infinity;
		let minY = Infinity;
		let minZ = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		let maxZ = -Infinity;

		for (const meshVisual of meshVisuals) {
			const aabbMin = meshVisual.localAabbMin();
			const aabbMax = meshVisual.localAabbMax();

			minX = Math.min(minX, aabbMin.x);
			minY = Math.min(minY, aabbMin.y);
			minZ = Math.min(minZ, aabbMin.z);
			maxX = Math.max(maxX, aabbMax.x);
			maxY = Math.max(maxY, aabbMax.y);
			maxZ = Math.max(maxZ, aabbMax.z);
		}

		if (!isFinite(minX)) return defaultBox;

		const min = new vec3(minX, minY, minZ);
		const max = new vec3(maxX, maxY, maxZ);
		const size = max.sub(min);
		const center = min.add(max).uniformScale(0.5);

		return { min, max, size, center };
	}

	private findMeshVisuals(sceneObject: SceneObject): RenderMeshVisual[] {
		const results: RenderMeshVisual[] = [];

		const meshVisual = sceneObject.getComponent(
			"Component.RenderMeshVisual"
		) as RenderMeshVisual;
		if (meshVisual) results.push(meshVisual);

		for (let i = 0; i < sceneObject.getChildrenCount(); i++) {
			const childResults = this.findMeshVisuals(sceneObject.getChild(i));
			results.push(...childResults);
		}

		return results;
	}

	private setupButtonListeners(): void {
		for (const item of this.itemList) {
			const itemId = item.id;

			item.button.onValueChange.add((value: number) => {
				if (this.isUpdatingSelection) return;

				if (value === 1) {
					this.setActiveItem(itemId, true);
				} else if (this.activeItemId === itemId) {
					this.isUpdatingSelection = true;
					item.button.toggle(true);
					if (item.slotTextObj) {
						const textComp = item.slotTextObj.getComponent("Text") as Text;
						if (textComp) {
							textComp.textFill.color = new vec4(1, 1, 1, 1);
						}
					}
					this.isUpdatingSelection = false;
				}
			});
		}
	}

	public setActiveItem(id: string, notify: boolean = true): void {
		if (this.activeItemId === id) return;
		if (this.isUpdatingSelection) return;

		const newItem = this.items.get(id);
		if (!newItem) {
			print(`PaletteController: Item '${id}' not found`);
			return;
		}

		this.isUpdatingSelection = true;

		if (this.activeItemId !== null) {
			const prevItem = this.items.get(this.activeItemId);
			if (prevItem) {
				prevItem.button.toggle(false);
				if (prevItem.slotTextObj) {
					const textComp = prevItem.slotTextObj.getComponent("Text") as Text;
					if (textComp) {
						textComp.textFill.color = new vec4(0.9, 0.9, 0.9, 1);
					}
				}
			}
		}

		this.activeItemId = id;
		newItem.button.toggle(true);
		if (newItem.slotTextObj) {
			const textComp = newItem.slotTextObj.getComponent("Text") as Text;
			if (textComp) {
				textComp.textFill.color = new vec4(1, 0.85, 0, 1);
			}
		}
		this.isUpdatingSelection = false;

		if (notify) {
			this.onSelectionChangedEvent.invoke(
				new PaletteSelectionEvent(id, newItem.index, newItem.sceneObject)
			);
		}
	}

	public setActiveItemByIndex(index: number, notify: boolean = true): void {
		if (index < 0 || index >= this.itemList.length) return;
		this.setActiveItem(this.itemList[index].id, notify);
	}

	public getActiveItemId(): string | null {
		return this.activeItemId;
	}

	public getActiveItemIndex(): number {
		if (this.activeItemId === null) return -1;
		const item = this.items.get(this.activeItemId);
		return item ? item.index : -1;
	}

	public getActiveSceneObject(): SceneObject | null {
		if (this.activeItemId === null) return null;
		const item = this.items.get(this.activeItemId);
		return item ? item.sceneObject : null;
	}

	public getItemById(id: string): SceneObject | null {
		const item = this.items.get(id);
		return item ? item.sceneObject : null;
	}

	public getItemByIndex(index: number): SceneObject | null {
		if (index < 0 || index >= this.itemList.length) return null;
		return this.itemList[index].sceneObject;
	}

	public getItemCount(): number {
		return this.itemList.length;
	}

	public getAllItemIds(): string[] {
		return this.itemList.map((item) => item.id);
	}

	public relayout(): void {
		this.layoutItems();
	}

	public setActiveItemColor(color: vec4): void {
		if (this.activeItemId === null) return;
		this.setItemColor(this.activeItemId, color);
	}

	public setItemColor(id: string, color: vec4): void {
		const item = this.items.get(id);
		if (!item) return;

		item.color = color;

		const listItem = this.itemList.find((i) => i.id === id);
		if (listItem) {
			listItem.color = color;
		}

		if (item.coloredSquareMaterial) {
			item.coloredSquareMaterial.mainPass.mainColor = color;
		}

		// Mark as custom preset
		this.currentPreset = null;
		this.currentPresetIndex = -1;
	}

	public setItemColorByIndex(index: number, color: vec4): void {
		if (index < 0 || index >= this.itemList.length) return;
		this.setItemColor(this.itemList[index].id, color);
	}

	public getItemColor(id: string): vec4 | null {
		const item = this.items.get(id);
		return item ? item.color : null;
	}

	public getActiveItemColor(): vec4 | null {
		if (this.activeItemId === null) return null;
		return this.getItemColor(this.activeItemId);
	}

	public getCurrentPreset(): PigmentPresetName | null {
		return this.currentPreset;
	}

	public getCurrentPresetIndex(): number {
		return this.currentPresetIndex;
	}

	public getAvailablePresets(): PigmentPresetName[] {
		return [...PRESET_ORDER];
	}

	public getPresetInfo(
		presetName: PigmentPresetName
	): { name: string; color: vec4 }[] | null {
		const preset = OIL_PIGMENT_PRESETS[presetName];
		if (!preset) return null;

		return preset.map((p) => ({
			name: p.name,
			color: new vec4(p.color.x, p.color.y, p.color.z, p.color.w),
		}));
	}

	public getAllColors(): vec4[] {
		return this.itemList.map(
			(item) =>
				new vec4(item.color.x, item.color.y, item.color.z, item.color.w)
		);
	}

	public setColorsFromArray(colors: vec4[]): void {
		const count = Math.min(this.itemList.length, colors.length);
		for (let i = 0; i < count; i++) {
			const item = this.itemList[i];
			item.color = colors[i];
			if (item.coloredSquareMaterial) {
				item.coloredSquareMaterial.mainPass.mainColor = colors[i];
			}
		}

		// Mark as custom
		this.currentPreset = null;
		this.currentPresetIndex = -1;
	}

	public logCurrentPalette(): void {
		const presetStr =
			this.currentPreset !== null
				? `${this.currentPreset} (index ${this.currentPresetIndex})`
				: "custom/cleared";

		print(`=== Current Palette: ${presetStr} ===`);
		for (let i = 0; i < this.itemList.length; i++) {
			const item = this.itemList[i];
			const c = item.color;
			const status = c.w > 0 ? "active" : "empty";
			print(
				`  [${i}] RGBA(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}, ${c.w.toFixed(2)}) - ${status}`
			);
		}
	}
}