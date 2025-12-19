import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { CancelFunction } from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { LensConfig } from "SpectaclesInteractionKit.lspkg/Utils/LensConfig";

export class ActiveScannerEvent {
	scanner: SceneObject | null;
	interactableObject: SceneObject | null;
	scannerId: string | null;

	constructor(
		scanner: SceneObject | null,
		interactableObject: SceneObject | null,
		scannerId: string | null
	) {
		this.scanner = scanner;
		this.interactableObject = interactableObject;
		this.scannerId = scannerId;
	}
}

interface ScannerData {
	id: string;
	creationTime: number;
	interactableObject: SceneObject | null;
}

@component
export class PictureController extends BaseScriptComponent {
	@input scannerPrefab: ObjectPrefab;

	@input
	@hint(
		"Path to the interactable object within scanner hierarchy (e.g., 'ImageAnchor/CameraCrop')"
	)
	interactablePath: string = "ImageAnchor/CameraCrop";

	private isEditor = global.deviceInfoSystem.isEditor();
	private rightHand = SIK.HandInputData.getHand("right");
	private leftHand = SIK.HandInputData.getHand("left");
	private leftDown = false;
	private rightDown = false;
	private scannerInstances: SceneObject[] = [];
	private scannerData: Map<string, ScannerData> = new Map();
	private activeScanner: SceneObject | null = null;
	private activeInteractable: SceneObject | null = null;
	private activeScannerId: string | null = null;

	public onActiveScannerChanged = new Event<ActiveScannerEvent>();

	private static instance: PictureController | null = null;

	onAwake() {
		PictureController.instance = this;

		this.rightHand.onPinchUp.add(this.rightPinchUp);
		this.rightHand.onPinchDown.add(this.rightPinchDown);
		this.leftHand.onPinchUp.add(this.leftPinchUp);
		this.leftHand.onPinchDown.add(this.leftPinchDown);

		if (!this.isEditor) {
			var obj = this.getSceneObject();
			if (obj && obj.getChildrenCount() > 0) {
				obj.getChild(0).destroy();
			}
		}

		this.createEvent("UpdateEvent").bind(this.update.bind(this));
	}

	public static getInstance(): PictureController | null {
		return PictureController.instance;
	}

	private generateUniqueId(): string {
		return (
			Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15)
		);
	}

	/**
	 * Check if a SceneObject is valid (not null and not destroyed)
	 */
	private isValidSceneObject(obj: SceneObject | null): boolean {
		if (!obj) return false;
		try {
			// Accessing a property on a destroyed object will throw
			const _ = obj.name;
			return true;
		} catch (e) {
			return false;
		}
	}

	/**
	 * Extract scanner ID from scanner name
	 */
	private extractScannerId(scanner: SceneObject): string | null {
		if (!this.isValidSceneObject(scanner)) return null;
		
		try {
			const name = scanner.name;
			if (!name) return null;
			
			const idMatch = name.match(/Scanner_(\w+)/);
			if (!idMatch || !idMatch[1]) return null;
			
			return idMatch[1];
		} catch (e) {
			return null;
		}
	}

	/**
	 * Clean up destroyed scanners from the instances array
	 */
	private cleanupDestroyedScanners(): void {
		const validScanners: SceneObject[] = [];
		const invalidIds: string[] = [];

		for (const scanner of this.scannerInstances) {
			if (this.isValidSceneObject(scanner)) {
				validScanners.push(scanner);
			} else {
				// Try to find and remove associated data
				// Since we can't get the ID from a destroyed object, we'll need to check data validity separately
			}
		}

		// Also clean up scannerData entries that reference destroyed interactables
		for (const [scannerId, data] of this.scannerData.entries()) {
			// Check if this scanner still exists in our valid list
			const scannerExists = validScanners.some((s) => {
				const id = this.extractScannerId(s);
				return id === scannerId;
			});

			if (!scannerExists) {
				invalidIds.push(scannerId);
			}
		}

		// Remove invalid data entries
		for (const id of invalidIds) {
			this.scannerData.delete(id);
		}

		this.scannerInstances = validScanners;
	}

	update() {
		// Periodically clean up destroyed scanners
		this.cleanupDestroyedScanners();

		let previousActiveScanner = this.activeScanner;
		this.activeScanner = null;
		this.activeInteractable = null;
		this.activeScannerId = null;

		for (let i = 0; i < this.scannerInstances.length; i++) {
			const scanner = this.scannerInstances[i];

			// Validate scanner
			if (!this.isValidSceneObject(scanner)) {
				continue;
			}

			const scannerId = this.extractScannerId(scanner);
			if (!scannerId) continue;

			const data = this.scannerData.get(scannerId);
			if (!data) continue;

			const interactableObj = data.interactableObject;
			
			// Validate interactable object
			if (!this.isValidSceneObject(interactableObj)) {
				// Update data to reflect destroyed interactable
				data.interactableObject = null;
				continue;
			}

			try {
				const interactable = interactableObj.getComponent(
					Interactable.getTypeName()
				) as any;

				if (
					interactable &&
					(interactable.hoveringInteractor || interactable.triggeringInteractor)
				) {
					this.activeScanner = scanner;
					this.activeInteractable = interactableObj;
					this.activeScannerId = scannerId;
					break;
				}
			} catch (e) {
				// Component access failed, skip this scanner
				continue;
			}
		}

		// Only fire event if active scanner actually changed
		const activeChanged = previousActiveScanner !== this.activeScanner;
		const previousWasValid = this.isValidSceneObject(previousActiveScanner);
		const currentIsValid = this.isValidSceneObject(this.activeScanner);

		if (activeChanged || (previousWasValid !== currentIsValid)) {
			this.onActiveScannerChanged.invoke(
				new ActiveScannerEvent(
					this.activeScanner,
					this.activeInteractable,
					this.activeScannerId
				)
			);
		}
	}

	private findInteractableInScanner(scanner: SceneObject): SceneObject | null {
		if (!this.isValidSceneObject(scanner)) return null;
		if (!this.interactablePath) return scanner;

		const pathParts = this.interactablePath.split("/");
		let current: SceneObject | null = scanner;

		for (const part of pathParts) {
			if (!current || !this.isValidSceneObject(current)) {
				return null;
			}

			let found = false;
			const childCount = current.getChildrenCount();
			
			for (let i = 0; i < childCount; i++) {
				const child = current.getChild(i);
				if (child && child.name === part) {
					current = child;
					found = true;
					break;
				}
			}
			
			if (!found) {
				print("PictureController: Could not find path part '" + part + "'");
				return null;
			}
		}

		return current;
	}

	public getActiveScanner(): SceneObject | null {
		return this.isValidSceneObject(this.activeScanner) ? this.activeScanner : null;
	}

	public getActiveInteractable(): SceneObject | null {
		return this.isValidSceneObject(this.activeInteractable) ? this.activeInteractable : null;
	}

	public getActiveScannerId(): string | null {
		return this.activeScannerId;
	}

	public getScannerData(scannerId: string): ScannerData | undefined {
		return this.scannerData.get(scannerId);
	}

	public getScannerCount(): number {
		this.cleanupDestroyedScanners();
		return this.scannerInstances.length;
	}

	public getAllScannerIds(): string[] {
		this.cleanupDestroyedScanners();
		return Array.from(this.scannerData.keys());
	}

	editorTest() {
		this.createScanner();
	}

	private leftPinchDown = () => {
		this.leftDown = true;
		if (this.rightDown && this.isPinchClose()) {
			this.createScanner();
		}
	};

	private leftPinchUp = () => {
		this.leftDown = false;
	};

	private rightPinchDown = () => {
		this.rightDown = true;
		if (this.leftDown && this.isPinchClose()) {
			this.createScanner();
		}
	};

	private rightPinchUp = () => {
		this.rightDown = false;
	};

	isPinchClose(): boolean {
		try {
			const leftThumb = this.leftHand?.thumbTip?.position;
			const rightThumb = this.rightHand?.thumbTip?.position;
			
			if (!leftThumb || !rightThumb) return false;
			
			return leftThumb.distance(rightThumb) < 10;
		} catch (e) {
			return false;
		}
	}

	createScanner(): SceneObject | null {
		if (!this.scannerPrefab) {
			print("PictureController: No scanner prefab assigned");
			return null;
		}

		const parent = this.getSceneObject();
		if (!this.isValidSceneObject(parent)) {
			print("PictureController: Invalid parent object");
			return null;
		}

		const scannerId = this.generateUniqueId();
		const scanner = this.scannerPrefab.instantiate(parent);
		
		if (!scanner) {
			print("PictureController: Failed to instantiate scanner");
			return null;
		}

		scanner.name = `Scanner_${scannerId}`;

		const interactableObj = this.findInteractableInScanner(scanner);

		this.scannerData.set(scannerId, {
			id: scannerId,
			creationTime: getTime(),
			interactableObject: interactableObj,
		});

		this.scannerInstances.push(scanner);

		print(
			"Scanner created with ID: " +
				scannerId +
				" (Total: " +
				this.scannerInstances.length +
				")"
		);

		return scanner;
	}

	public removeScanner(scannerId: string): boolean {
		if (!scannerId) return false;

		const data = this.scannerData.get(scannerId);
		if (!data) {
			print("PictureController: Scanner not found: " + scannerId);
			return false;
		}

		// Find and destroy the scanner object
		for (const scanner of this.scannerInstances) {
			const id = this.extractScannerId(scanner);
			if (id === scannerId && this.isValidSceneObject(scanner)) {
				try {
					scanner.destroy();
				} catch (e) {
					print("PictureController: Error destroying scanner: " + e);
				}
				break;
			}
		}

		// Remove from arrays
		this.scannerInstances = this.scannerInstances.filter((scanner) => {
			const id = this.extractScannerId(scanner);
			return id !== scannerId;
		});

		this.scannerData.delete(scannerId);

		// Clear active scanner if it was removed
		if (this.activeScannerId === scannerId) {
			this.activeScanner = null;
			this.activeInteractable = null;
			this.activeScannerId = null;
			
			this.onActiveScannerChanged.invoke(
				new ActiveScannerEvent(null, null, null)
			);
		}

		print("Scanner removed: " + scannerId + " (Remaining: " + this.scannerInstances.length + ")");
		return true;
	}

	public arrangeScannersInGrid(
		centerPosition: vec3 = new vec3(0, 0, 0),
		spacing: number = 10
	): void {
		this.cleanupDestroyedScanners();

		const nodeCount = this.scannerInstances.length;
		if (nodeCount === 0) return;

		// Calculate grid dimensions (roughly square)
		const cols = Math.ceil(Math.sqrt(nodeCount));
		const rows = Math.ceil(nodeCount / cols);

		// Calculate starting position to center the grid
		const startX = centerPosition.x - ((cols - 1) * spacing) / 2;
		const startY = centerPosition.z - ((rows - 1) * spacing) / 2;

		for (let i = 0; i < nodeCount; i++) {
			const scanner = this.scannerInstances[i];
			
			if (!this.isValidSceneObject(scanner)) continue;

			const row = Math.floor(i / cols);
			const col = i % cols;

			const x = startX + col * spacing;
			const y = startY + row * spacing;
			const z = centerPosition.y;

			try {
				const transform = scanner.getTransform();
				if (transform) {
					transform.setWorldPosition(new vec3(x, y, z));
				}
			} catch (e) {
				print("PictureController: Error positioning scanner: " + e);
			}
		}

		print(
			"Arranged " + nodeCount + " scanners in " + rows + "x" + cols + " grid"
		);
	}
}

// |Time| Will call a callback function every frame for a set duration with a number increasing from 0 to 1.
export function makeTween(
	callback: (time: number) => void,
	duration: number
): CancelFunction {
	const updateDispatcher = LensConfig.getInstance().updateDispatcher;
	const lateUpdateEvent = updateDispatcher.createLateUpdateEvent("Tween");
	const startTime = getTime();
	let hasRemovedEvent = false;
	
	lateUpdateEvent.bind(() => {
		if (getTime() > startTime + duration) {
			hasRemovedEvent = true;
			updateDispatcher.removeEvent(lateUpdateEvent);
			callback(1);
		} else {
			callback((getTime() - startTime) / duration);
		}
	});

	// Create a Cancelation function to stop this animation at any time
	function cancel() {
		if (!hasRemovedEvent) {
			hasRemovedEvent = true;
			updateDispatcher.removeEvent(lateUpdateEvent);
		}
	}

	return cancel;
}