// Encoder_FullRGB.ts
// Encodes the full sRGB color space as LAB positions + RGB colors
// Use this to visualize the entire visible gamut

@component
export class Encoder_FullRGB extends BaseScriptComponent {
	@input
	@hint("Material with LAB encoder Code Node (outputs labPos and rgbCol)")
	encoderMaterial: Material;

	@input
	@hint("VFX component to receive textures")
	vfxComponent: VFXComponent;

	@input
	@hint("Texture size (64 = 4096 pixels)")
	texSize: number = 64;

	@input
	@hint("RGB resolution (16 = 16³ = 4096 points)")
	rgbRes: number = 16;

	@input
	@hint("Scale for VFX positions")
	scale: number = 100;

	private posRenderTarget: Texture;
	private colorRenderTarget: Texture;

	onAwake(): void {
		if (!this.encoderMaterial) {
			print("ERROR: encoderMaterial not set");
			return;
		}

		const res = new vec2(this.texSize, this.texSize);
		this.posRenderTarget = this.createRenderTarget(res);
		this.colorRenderTarget = this.createRenderTarget(res);

		// Clone and configure material
		const material = this.encoderMaterial.clone();
		material.mainPass.texSize = this.texSize;
		material.mainPass.rgbRes = this.rgbRes;

		const layer = LayerSet.makeUnique();
		const cameraObj = this.createCameraMRT(layer);
		this.createPostEffect(cameraObj, material, layer);

		this.assignToVFX();

		print("LABGamutEncoder: Setup complete");
		print(`Texture: ${this.texSize}x${this.texSize}`);
		print(
			`RGB res: ${this.rgbRes}³ = ${
				this.rgbRes * this.rgbRes * this.rgbRes
			} points`
		);
		print(`Spawn count needed: ${this.texSize * this.texSize * 2}`);

		// Debug after a few frames
		let frameCount = 0;
		this.createEvent("UpdateEvent").bind(() => {
			frameCount++;
			if (frameCount === 5) {
				// this.debugReadRenderTargets();
			}
		});
	}

	private createRenderTarget(resolution: vec2): Texture {
		const rt = global.scene.createRenderTargetTexture();
		(rt.control as any).useScreenResolution = false;
		(rt.control as any).resolution = resolution;
		return rt;
	}

	private createCameraMRT(layer: LayerSet): SceneObject {
		const obj = global.scene.createSceneObject("LABEncoderCamera");
		const cam = obj.createComponent("Component.Camera") as Camera;

		cam.enabled = true;
		cam.type = Camera.Type.Orthographic;
		cam.size = 2.0;
		cam.aspect = 1.0;
		cam.near = 0.5;
		cam.far = 100.0;
		cam.renderLayer = layer;
		cam.renderOrder = -100;
		cam.devicePropertyUsage = Camera.DeviceProperty.None;
		cam.renderTarget = this.posRenderTarget;

		// Setup MRT with 2 render targets
		const colorRenderTargets = cam.colorRenderTargets;

		// Target 0: LAB position
		while (colorRenderTargets.length < 1) {
			colorRenderTargets.push(Camera.createColorRenderTarget());
		}
		colorRenderTargets[0].targetTexture = this.posRenderTarget;
		colorRenderTargets[0].clearColor = new vec4(0, 0, 0, 0);

		// Target 1: RGB color
		while (colorRenderTargets.length < 2) {
			colorRenderTargets.push(Camera.createColorRenderTarget());
		}
		colorRenderTargets[1].targetTexture = this.colorRenderTarget;
		colorRenderTargets[1].clearColor = new vec4(0, 0, 0, 0);

		cam.colorRenderTargets = colorRenderTargets;

		print("Camera created with 2 MRT targets");
		return obj;
	}

	private createPostEffect(
		cameraObj: SceneObject,
		material: Material,
		layer: LayerSet
	): void {
		const obj = global.scene.createSceneObject("LABEncoderQuad");
		obj.setParent(cameraObj);
		obj.layer = layer;

		const pe = obj.createComponent(
			"Component.PostEffectVisual"
		) as PostEffectVisual;
		pe.mainMaterial = material;

		print("PostEffectVisual created");
	}

	private assignToVFX(): void {
		if (this.vfxComponent && this.vfxComponent.asset) {
			const props = this.vfxComponent.asset.properties;

			(props as any)["posMap"] = this.posRenderTarget;
			(props as any)["colorMap"] = this.colorRenderTarget;
			(props as any)["texSize"] = this.texSize;
			(props as any)["scale"] = this.scale;

			print(`Assigned to VFX: ${this.vfxComponent.getSceneObject().name}`);
		} else {
			print("ERROR: VFX component or asset is null");
		}
	}

	// ============ PUBLIC GETTERS ============

	isReady(): boolean {
		return this.posRenderTarget != null && this.colorRenderTarget != null;
	}

	getPosRenderTarget(): Texture {
		return this.posRenderTarget;
	}

	getColorRenderTarget(): Texture {
		return this.colorRenderTarget;
	}

	getTexSize(): number {
		return this.texSize;
	}

	getGamutValidCount(): number {
		// Full RGB cube: rgbRes³
		return this.rgbRes * this.rgbRes * this.rgbRes;
	}
}
