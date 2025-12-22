// RGBCubeParticleEncoder.ts
// Encodes RGB cube data to textures for VFX particle visualization

@component
export class RGBCubeParticleEncoder extends BaseScriptComponent {
    
    @input
    @hint("Material with encoder Code Node")
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
    
    private renderTarget: Texture;
    
    onAwake(): void {
        if (!this.encoderMaterial) {
            print("ERROR: encoderMaterial not set");
            return;
        }
        
        const res = new vec2(this.texSize, this.texSize);
        this.renderTarget = this.createRenderTarget(res);
        
        // Clone and configure material
        const material = this.encoderMaterial.clone();
        material.mainPass.texSize = this.texSize;
        material.mainPass.rgbRes = this.rgbRes;
        
        const layer = LayerSet.makeUnique();
        const cameraObj = this.createCamera(this.renderTarget, layer);
        this.createPostEffect(cameraObj, material, layer);
        
        this.assignToVFX();

    }
    
    private createRenderTarget(resolution: vec2): Texture {
        const rt = global.scene.createRenderTargetTexture();
        (rt.control as any).useScreenResolution = false;
        (rt.control as any).resolution = resolution;
        return rt;
    }
    
    private createCamera(renderTarget: Texture, layer: LayerSet): SceneObject {
        const obj = global.scene.createSceneObject("EncoderCamera");
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
        cam.renderTarget = renderTarget;
        
        const colorRenderTargets = cam.colorRenderTargets;
        if (colorRenderTargets.length === 0) {
            colorRenderTargets.push(Camera.createColorRenderTarget());
        }
        colorRenderTargets[0].targetTexture = renderTarget;
        colorRenderTargets[0].clearColor = new vec4(0, 0, 0, 0);
        cam.colorRenderTargets = colorRenderTargets;
        
        print("Camera created with render target");
        return obj;
    }
    
    private createPostEffect(cameraObj: SceneObject, material: Material, layer: LayerSet): void {
        const obj = global.scene.createSceneObject("EncoderQuad");
        obj.setParent(cameraObj);
        obj.layer = layer;
        
        const pe = obj.createComponent("Component.PostEffectVisual") as PostEffectVisual;
        pe.mainMaterial = material;
        
        print("PostEffectVisual created");
    }
    
    private assignToVFX(): void {
        if (this.vfxComponent && this.vfxComponent.asset) {
            const props = this.vfxComponent.asset.properties;
            
            // Single texture for both position and color (RGB = XYZ = Color)
            (props as any)["posMap"] = this.renderTarget;
            (props as any)["texSize"] = this.texSize;
            (props as any)["scale"] = this.scale;
            
            print(`Assigned to VFX: ${this.vfxComponent.getSceneObject().name}`);
        } else {
            print("ERROR: VFX component or asset is null");
        }
    }

}