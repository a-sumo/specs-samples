// PigmentMixParticleEncoder.ts
// Encodes the achievable gamut from mixing physical pigments (Kubelka-Munk)
// Uses preset palettes for VFX particle visualization

@component
export class PigmentMixParticleEncoder extends BaseScriptComponent {

    @input
    @hint("Material with PigmentGamutEncoder shader")
    encoderMaterial: Material;

    @input
    @hint("VFX component to receive textures")
    vfxComponent: VFXComponent;

    @input
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("CMYK + White/Black", 0),
            new ComboBoxItem("Primary (RGB + CMY)", 1),
            new ComboBoxItem("Earth Tones", 2),
            new ComboBoxItem("Pastels", 3),
            new ComboBoxItem("Warm", 4),
            new ComboBoxItem("Cool", 5),
            new ComboBoxItem("Custom", 6),
        ])
    )
    @hint("Pigment palette preset")
    palettePreset: number = 0;

    @input
    @hint("Output texture size (64 = 4096 pixels)")
    texSize: number = 64;

    @input
    @hint("Mix steps between pigments")
    mixSteps: number = 20;

    @input
    @hint("Scale for VFX positions")
    scale: number = 100;

    // Custom pigment colors (used when palettePreset = Custom)
    @input
    @hint("Custom: Pigment 0")
    @widget(new ColorWidget())
    pig0Color: vec3 = new vec3(1, 1, 1);

    @input
    @hint("Custom: Pigment 1")
    @widget(new ColorWidget())
    pig1Color: vec3 = new vec3(0.08, 0.08, 0.08);

    @input
    @hint("Custom: Pigment 2")
    @widget(new ColorWidget())
    pig2Color: vec3 = new vec3(1, 0.92, 0);

    @input
    @hint("Custom: Pigment 3")
    @widget(new ColorWidget())
    pig3Color: vec3 = new vec3(0.89, 0, 0.13);

    @input
    @hint("Custom: Pigment 4")
    @widget(new ColorWidget())
    pig4Color: vec3 = new vec3(0.1, 0.1, 0.7);

    @input
    @hint("Custom: Pigment 5")
    @widget(new ColorWidget())
    pig5Color: vec3 = new vec3(0, 0.47, 0.44);

    private static readonly NUM_PIGMENTS = 6;

    // Preset palettes
    private static readonly PRESETS: { [key: number]: vec3[] } = {
        // 0: CMYK + White/Black (traditional print)
        0: [
            new vec3(1, 1, 1),           // White
            new vec3(0.08, 0.08, 0.08),  // Black
            new vec3(0, 1, 1),           // Cyan
            new vec3(1, 0, 1),           // Magenta
            new vec3(1, 1, 0),           // Yellow
            new vec3(0, 0.47, 0.44),     // Teal
        ],
        // 1: Primary (RGB + CMY)
        1: [
            new vec3(1, 0, 0),           // Red
            new vec3(0, 1, 0),           // Green
            new vec3(0, 0, 1),           // Blue
            new vec3(0, 1, 1),           // Cyan
            new vec3(1, 0, 1),           // Magenta
            new vec3(1, 1, 0),           // Yellow
        ],
        // 2: Earth Tones
        2: [
            new vec3(0.96, 0.93, 0.87),  // Cream
            new vec3(0.24, 0.15, 0.10),  // Dark brown
            new vec3(0.72, 0.53, 0.35),  // Tan
            new vec3(0.55, 0.27, 0.07),  // Sienna
            new vec3(0.33, 0.42, 0.18),  // Olive
            new vec3(0.76, 0.60, 0.42),  // Buff
        ],
        // 3: Pastels
        3: [
            new vec3(1, 1, 1),           // White
            new vec3(1, 0.85, 0.85),     // Pink
            new vec3(0.85, 0.92, 1),     // Light blue
            new vec3(0.85, 1, 0.85),     // Mint
            new vec3(1, 0.95, 0.8),      // Cream
            new vec3(0.9, 0.85, 1),      // Lavender
        ],
        // 4: Warm
        4: [
            new vec3(1, 1, 1),           // White
            new vec3(0.2, 0.1, 0.05),    // Dark brown
            new vec3(1, 0.85, 0),        // Golden yellow
            new vec3(1, 0.5, 0),         // Orange
            new vec3(0.8, 0.2, 0.1),     // Red-orange
            new vec3(0.6, 0.1, 0.1),     // Deep red
        ],
        // 5: Cool
        5: [
            new vec3(1, 1, 1),           // White
            new vec3(0.1, 0.1, 0.2),     // Dark blue
            new vec3(0, 0.6, 0.8),       // Cyan
            new vec3(0.2, 0.4, 0.8),     // Blue
            new vec3(0.4, 0.2, 0.6),     // Purple
            new vec3(0.1, 0.5, 0.5),     // Teal
        ],
    };

    private posRenderTarget: Texture;
    private colorRenderTarget: Texture;
    private pigmentTexture: Texture;
    private initialized: boolean = false;

    // Current pigment colors
    private currentPigments: vec3[] = [];
    private currentPreset: number = -1;

    onAwake(): void {
        if (!this.encoderMaterial) {
            print("PigmentMixParticleEncoder: ERROR - encoderMaterial not set");
            return;
        }

        // Apply selected preset (or custom colors)
        this.applyPreset(this.palettePreset);

        // Create pigment texture
        this.pigmentTexture = ProceduralTextureProvider.createWithFormat(
            PigmentMixParticleEncoder.NUM_PIGMENTS,
            1,
            TextureFormat.RGBA8Unorm
        );
        this.updatePigmentTexture();

        // Create render targets
        const res = new vec2(this.texSize, this.texSize);
        this.posRenderTarget = this.createRenderTarget(res);
        this.colorRenderTarget = this.createRenderTarget(res);

        // Clone and configure material
        const material = this.encoderMaterial.clone();
        material.mainPass.pigmentTex = this.pigmentTexture;
        material.mainPass.numPigments = PigmentMixParticleEncoder.NUM_PIGMENTS;
        material.mainPass.texWidth = PigmentMixParticleEncoder.NUM_PIGMENTS;
        material.mainPass.texSize = this.texSize;
        material.mainPass.mixSteps = this.mixSteps;

        // Create camera and post effect
        const layer = LayerSet.makeUnique();
        const cameraObj = this.createCameraMRT(layer);
        this.createPostEffect(cameraObj, material, layer);

        // Assign to VFX
        this.assignToVFX();

        // Update pigments every frame (reads from currentPigments)
        this.createEvent("UpdateEvent").bind(() => this.updatePigmentTexture());

        this.createEvent("OnStartEvent").bind(() => {
            this.initialized = true;
            const presetName = this.getPresetName(this.palettePreset);
            print(`PigmentMixParticleEncoder: Ready (palette: ${presetName})`);
        });
    }

    private getPresetName(index: number): string {
        const names = ["CMYK + White/Black", "Primary (RGB + CMY)", "Earth Tones", "Pastels", "Warm", "Cool", "Custom"];
        return names[index] || "Unknown";
    }

    private applyPreset(presetIndex: number): void {
        if (presetIndex === 6) {
            // Custom: use the pig*Color inputs
            this.currentPigments = [
                this.pig0Color,
                this.pig1Color,
                this.pig2Color,
                this.pig3Color,
                this.pig4Color,
                this.pig5Color,
            ];
        } else {
            // Use preset
            const preset = PigmentMixParticleEncoder.PRESETS[presetIndex];
            if (preset) {
                this.currentPigments = preset.map(c => new vec3(c.x, c.y, c.z));
            } else {
                // Fallback to CMYK
                this.currentPigments = PigmentMixParticleEncoder.PRESETS[0].map(c => new vec3(c.x, c.y, c.z));
            }
        }
        this.currentPreset = presetIndex;
    }

    private updatePigmentTexture(): void {
        const pixels = new Uint8Array(PigmentMixParticleEncoder.NUM_PIGMENTS * 4);

        for (let i = 0; i < PigmentMixParticleEncoder.NUM_PIGMENTS; i++) {
            const pigment = this.currentPigments[i] || new vec3(0.5, 0.5, 0.5);
            const idx = i * 4;
            pixels[idx + 0] = Math.round(pigment.x * 255);
            pixels[idx + 1] = Math.round(pigment.y * 255);
            pixels[idx + 2] = Math.round(pigment.z * 255);
            pixels[idx + 3] = 255;
        }

        (this.pigmentTexture.control as ProceduralTextureProvider).setPixels(
            0, 0, PigmentMixParticleEncoder.NUM_PIGMENTS, 1, pixels
        );
    }

    private createRenderTarget(resolution: vec2): Texture {
        const rt = global.scene.createRenderTargetTexture();
        (rt.control as any).useScreenResolution = false;
        (rt.control as any).resolution = resolution;
        return rt;
    }

    private createCameraMRT(layer: LayerSet): SceneObject {
        const obj = global.scene.createSceneObject("Encoder_PigmentMix_Camera");
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

        const colorRenderTargets = cam.colorRenderTargets;
        while (colorRenderTargets.length < 2) {
            colorRenderTargets.push(Camera.createColorRenderTarget());
        }
        colorRenderTargets[0].targetTexture = this.posRenderTarget;
        colorRenderTargets[0].clearColor = new vec4(0, 0, 0, 0);
        colorRenderTargets[1].targetTexture = this.colorRenderTarget;
        colorRenderTargets[1].clearColor = new vec4(0, 0, 0, 0);
        cam.colorRenderTargets = colorRenderTargets;

        return obj;
    }

    private createPostEffect(cameraObj: SceneObject, material: Material, layer: LayerSet): void {
        const obj = global.scene.createSceneObject("Encoder_PigmentMix_Quad");
        obj.setParent(cameraObj);
        obj.layer = layer;
        const pe = obj.createComponent("Component.PostEffectVisual") as PostEffectVisual;
        pe.mainMaterial = material;
    }

    private assignToVFX(): void {
        if (this.vfxComponent?.asset) {
            const props = this.vfxComponent.asset.properties as any;
            props["posMap"] = this.posRenderTarget;
            props["colorMap"] = this.colorRenderTarget;
            props["texSize"] = this.texSize;
            props["scale"] = this.scale;
        }
    }

    // ============ PUBLIC API ============

    isReady(): boolean {
        return this.initialized;
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

    getScale(): number {
        return this.scale;
    }

    /**
     * Set palette preset by index
     * 0 = CMYK + White/Black, 1 = Primary, 2 = Earth Tones,
     * 3 = Pastels, 4 = Warm, 5 = Cool, 6 = Custom
     */
    setPreset(presetIndex: number): void {
        this.palettePreset = presetIndex;
        this.applyPreset(presetIndex);
        print(`PigmentMixParticleEncoder: Switched to ${this.getPresetName(presetIndex)}`);
    }

    /** Get current preset index */
    getPreset(): number {
        return this.currentPreset;
    }

    /** Cycle to next preset */
    nextPreset(): void {
        const next = (this.currentPreset + 1) % 7;
        this.setPreset(next);
    }

    /** Cycle to previous preset */
    prevPreset(): void {
        const prev = (this.currentPreset - 1 + 7) % 7;
        this.setPreset(prev);
    }

    /**
     * Set pigment colors directly (switches to Custom mode)
     */
    setPigmentColors(colors: vec3[]): void {
        this.palettePreset = 6; // Custom
        this.currentPreset = 6;
        for (let i = 0; i < Math.min(colors.length, PigmentMixParticleEncoder.NUM_PIGMENTS); i++) {
            this.currentPigments[i] = colors[i];
        }
    }

    /**
     * Get current pigment colors
     */
    getPigmentColors(): vec3[] {
        return [...this.currentPigments];
    }

    getGamutValidCount(): number {
        const n = PigmentMixParticleEncoder.NUM_PIGMENTS;
        const steps = this.mixSteps;

        const purePigments = n;
        const twoWayMixes = (n * (n - 1) / 2) * (steps - 1);

        let threeWaySteps = 0;
        for (let s1 = 1; s1 < steps - 1; s1++) {
            for (let s2 = 1; s2 < steps - s1; s2++) {
                threeWaySteps++;
            }
        }
        const threeWayMixes = (n * (n - 1) * (n - 2) / 6) * threeWaySteps;

        return purePigments + twoWayMixes + threeWayMixes;
    }

    /** Get list of available preset names */
    static getPresetNames(): string[] {
        return ["CMYK + White/Black", "Primary (RGB + CMY)", "Earth Tones", "Pastels", "Warm", "Cool", "Custom"];
    }
}
