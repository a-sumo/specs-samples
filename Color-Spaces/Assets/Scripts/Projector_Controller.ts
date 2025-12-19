// Projector_Controller.ts
// Moves SceneObjects to match projected LAB positions from Projector_Gamut

@component
export class Projector_Controller extends BaseScriptComponent {

    @input
    @hint("Reference to Projector_Gamut script")
    gamutProjector: ScriptComponent;
    
    @input
    @hint("SceneObjects to position (one per projected color)")
    targetObjects: SceneObject[];
    
    @input
    @hint("Scale factor for LAB space (same as VFX)")
    scale: vec3 = new vec3(100, 100, 100);
    
    @input
    @hint("Rotation in degrees (same as VFX)")
    rotation: vec3 = new vec3(0, 0, 0);
    
    @input
    @hint("World position offset (same as VFX)")
    offset: vec3 = new vec3(0, 0, 0);
    
    @input
    @hint("Update positions every frame")
    continuousUpdate: boolean = true;
    
    private projector: any;
    private isInitialized: boolean = false;
    private positions: vec3[] = [];
    private colors: vec4[] = [];
    
    onAwake(): void {
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }
    
    private onUpdate(): void {
        if (!this.isInitialized) {
            this.tryInitialize();
        }
        
        if (this.isInitialized && this.continuousUpdate) {
            this.updatePositions();
        }
    }
    
    private tryInitialize(): void {
        if (!this.gamutProjector) {
            print("ERROR: gamutProjector not set");
            return;
        }
        
        this.projector = this.gamutProjector as any;
        
        // Check if projector is ready
        const posRT = this.projector.getProjectedPosTexture?.() || this.projector.projectedPosRT;
        const colorRT = this.projector.getProjectedColorTexture?.() || this.projector.projectedColorRT;
        
        if (!posRT || !colorRT) {
            return; // Not ready yet
        }
        
        // Try to read texture
        try {
            this.readProjectedData();
            this.isInitialized = true;
            print(`ProjectedPositionController initialized with ${this.positions.length} positions`);
            this.updatePositions();
        } catch (e) {
            // Not ready yet
        }
    }
    
    private readProjectedData(): void {
        const posRT = this.projector.getProjectedPosTexture?.() || this.projector.projectedPosRT;
        const colorRT = this.projector.getProjectedColorTexture?.() || this.projector.projectedColorRT;
        const width = this.projector.inputTexWidth || 8;
        const height = this.projector.inputTexHeight || 8;
        
        // Read position texture
        const posTemp = ProceduralTextureProvider.createFromTexture(posRT);
        const posProvider = posTemp.control as ProceduralTextureProvider;
        const posPixels = new Uint8Array(width * height * 4);
        posProvider.getPixels(0, 0, width, height, posPixels);
        
        // Read color texture
        const colorTemp = ProceduralTextureProvider.createFromTexture(colorRT);
        const colorProvider = colorTemp.control as ProceduralTextureProvider;
        const colorPixels = new Uint8Array(width * height * 4);
        colorProvider.getPixels(0, 0, width, height, colorPixels);
        
        // Parse into arrays
        this.positions = [];
        this.colors = [];
        
        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            const alpha = posPixels[idx + 3];
            
            if (alpha > 127) { // Valid entry
                // LAB from texture: R=normA, G=normL, B=normB
                const normA = posPixels[idx + 0] / 255;
                const normL = posPixels[idx + 1] / 255;
                const normB = posPixels[idx + 2] / 255;
                
                // Convert to local position (centered)
                const localPos = new vec3(
                    normA - 0.5,  // a* → X
                    normL - 0.5,  // L* → Y
                    normB - 0.5   // b* → Z
                );
                
                // Apply scale
                const scaledPos = new vec3(
                    localPos.x * this.scale.x,
                    localPos.y * this.scale.y,
                    localPos.z * this.scale.z
                );
                
                // Apply rotation
                const rotatedPos = this.applyRotation(scaledPos, this.rotation);
                
                // Apply offset
                const worldPos = new vec3(
                    rotatedPos.x + this.offset.x,
                    rotatedPos.y + this.offset.y,
                    rotatedPos.z + this.offset.z
                );
                
                this.positions.push(worldPos);
                
                // RGB color
                this.colors.push(new vec4(
                    colorPixels[idx + 0] / 255,
                    colorPixels[idx + 1] / 255,
                    colorPixels[idx + 2] / 255,
                    1.0
                ));
            }
        }
    }
    
    private applyRotation(p: vec3, rotDeg: vec3): vec3 {
        const toRad = Math.PI / 180;
        const rx = rotDeg.x * toRad;
        const ry = rotDeg.y * toRad;
        const rz = rotDeg.z * toRad;
        
        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);
        
        // Y rotation
        let x = p.x * cy + p.z * sy;
        let y = p.y;
        let z = -p.x * sy + p.z * cy;
        
        // X rotation
        const y2 = y * cx - z * sx;
        const z2 = y * sx + z * cx;
        y = y2;
        z = z2;
        
        // Z rotation
        const x2 = x * cz - y * sz;
        const y3 = x * sz + y * cz;
        
        return new vec3(x2, y3, z);
    }
    
    private updatePositions(): void {
        if (this.continuousUpdate) {
            try {
                this.readProjectedData();
            } catch (e) {
                // Texture not ready
                return;
            }
        }
        
        // Move target objects to positions
        for (let i = 0; i < this.targetObjects.length; i++) {
            const obj = this.targetObjects[i];
            if (!obj) continue;
            
            if (i < this.positions.length) {
                const pos = this.positions[i];
                obj.getTransform().setWorldPosition(pos);
                obj.enabled = true;
                
                // Optionally set color on material if available
                this.trySetColor(obj, i);
            } else {
                // Hide if no corresponding position
                obj.enabled = false;
            }
        }
    }
    
    private trySetColor(obj: SceneObject, index: number): void {
        if (index >= this.colors.length) return;
        
        const color = this.colors[index];
        
        // Try to find a RenderMeshVisual and set its color
        const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial) {
            try {
                rmv.mainMaterial.mainPass.baseColor = color;
            } catch (e) {
                // Material doesn't have baseColor property
            }
        }
    }
    
    // ============ PUBLIC API ============
    
    getPosition(index: number): vec3 | null {
        if (index >= 0 && index < this.positions.length) {
            return this.positions[index];
        }
        return null;
    }
    
    getColor(index: number): vec4 | null {
        if (index >= 0 && index < this.colors.length) {
            return this.colors[index];
        }
        return null;
    }
    
    getPositionCount(): number {
        return this.positions.length;
    }
    
    // Force refresh positions
    refresh(): void {
        if (this.isInitialized) {
            this.readProjectedData();
            this.updatePositions();
        }
    }
}