// Projector_Gamut.ts
// GPU-based gamut projection - finds nearest achievable color for each input
// Standalone component that can receive colors from any source via setInputColors()

@component
export class Projector_Gamut extends BaseScriptComponent {

    // ============ INPUTS ============

    @input
    @hint("Encoder script (Encoder_PigmentMix, Encoder_FullRGB, etc.)")
    encoder: ScriptComponent;

    @input
    @hint("Material with Gamut Projection shader")
    projectionMaterial: Material;

    @input
    @hint("VFX component to display projected colors (optional)")
    vfxComponent: VFXComponent;

    @input
    @hint("Maximum colors to support (determines texture size)")
    maxColors: number = 64;

    @input
    @hint("PaletteController to listen for color changes (optional, for auto-reproject)")
    paletteController: ScriptComponent;

    // ============ PRIVATE STATE ============

    private inputTexture: Texture;
    private inputProvider: ProceduralTextureProvider;
    private projectedPosRT: Texture;
    private projectedColorRT: Texture;
    private projectionMaterialInstance: Material;

    private isInitialized: boolean = false;
    private initAttempts: number = 0;
    private gamutTexSize: number = 64;
    private gamutValidCount: number = 0;

    private texWidth: number = 8;
    private texHeight: number = 8;

    // For CPU readback of results
    private inputColors: vec3[] = [];
    private projectedColors: vec3[] = [];
    private projectedLAB: vec3[] = [];
    private resultsReady: boolean = false;
    private colorCount: number = 0;
    private framesSinceInput: number = 0;
    private inputPending: boolean = false;

    onAwake(): void {
        // Calculate texture dimensions from maxColors
        this.texWidth = Math.ceil(Math.sqrt(this.maxColors));
        this.texHeight = Math.ceil(this.maxColors / this.texWidth);

        // Try to initialize early on start
        this.createEvent("OnStartEvent").bind(() => {
            this.tryInit();
            this.setupPaletteListener();
        });
        // Continue trying on update if not ready yet
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    private setupPaletteListener(): void {
        if (!this.paletteController) {
            print("Projector_Gamut: No PaletteController assigned, won't auto-reproject on palette changes");
            return;
        }

        const controller = this.paletteController as any;

        // Listen for preset changes
        if (controller.onPresetChanged) {
            controller.onPresetChanged.add((event: any) => {
                print(`Projector_Gamut: Palette preset changed, invalidating results`);
                this.invalidateResults();
                // Re-project if we have input colors
                if (this.inputColors.length > 0) {
                    this.reproject();
                }
            });
        }

        // Listen for manual color changes
        if (controller.onColorsManuallyChanged) {
            controller.onColorsManuallyChanged.add((colors: any) => {
                print(`Projector_Gamut: Palette colors manually changed, invalidating results`);
                this.invalidateResults();
                if (this.inputColors.length > 0) {
                    this.reproject();
                }
            });
        }

        // Listen for palette restored
        if (controller.onPaletteRestored) {
            controller.onPaletteRestored.add((colors: any) => {
                print(`Projector_Gamut: Palette restored, invalidating results`);
                this.invalidateResults();
                if (this.inputColors.length > 0) {
                    this.reproject();
                }
            });
        }

        print("Projector_Gamut: Listening for palette changes");
    }

    private onUpdate(): void {
        if (!this.isInitialized) {
            this.tryInit();
        }

        // Track frames since input was set (GPU needs time to render)
        if (this.inputPending) {
            this.framesSinceInput++;
        }
    }

    /**
     * Invalidate cached results - call this when the gamut changes (e.g., preset change)
     * The GPU projection updates automatically, but CPU readback cache needs refresh.
     */
    public invalidateResults(): void {
        this.resultsReady = false;
        print("Projector_Gamut: Results invalidated, will re-read on next get");
    }

    /**
     * Re-project the current input colors (call after gamut changes)
     */
    public reproject(): void {
        if (this.inputColors.length > 0) {
            this.resultsReady = false;
            this.inputPending = true;
            this.framesSinceInput = 0;
            print(`Projector_Gamut: Re-projecting ${this.inputColors.length} colors`);
        }
    }

    private tryInit(): void {
        this.initAttempts++;

        if (this.initAttempts % 10 === 1) {
            print(`Projector_Gamut: Init attempt ${this.initAttempts}`);
            print(`  encoder assigned: ${this.encoder != null}`);
            print(`  projectionMaterial assigned: ${this.projectionMaterial != null}`);
        }

        if (!this.encoder || !this.projectionMaterial) return;

        const enc = this.encoder as any;
        if (!enc.isReady || !enc.isReady()) {
            if (this.initAttempts % 10 === 1) {
                print(`  encoder.isReady(): false`);
            }
            return;
        }

        // Get encoder data
        this.gamutTexSize = enc.getTexSize();
        const gamutPosRT = enc.getPosRenderTarget();
        const gamutColorRT = enc.getColorRenderTarget();

        if (!gamutPosRT || !gamutColorRT) {
            print("Projector_Gamut: Encoder textures not ready");
            return;
        }

        if (typeof enc.getGamutValidCount === 'function') {
            this.gamutValidCount = enc.getGamutValidCount();
        } else {
            this.gamutValidCount = this.gamutTexSize * this.gamutTexSize;
        }

        // Create input texture for colors to project
        this.createInputTexture();

        // Create output render targets
        this.createOutputRenderTargets();

        // Setup projection camera and material
        this.setupProjectionPipeline(gamutPosRT, gamutColorRT);

        // Assign outputs to VFX if provided
        this.assignToVFX();

        this.isInitialized = true;
        print(`Projector_Gamut: Ready`);
        print(`  gamutTexSize=${this.gamutTexSize}, gamutValidCount=${this.gamutValidCount}`);
        print(`  maxColors=${this.maxColors}, texSize=${this.texWidth}x${this.texHeight}`);
    }

    private createInputTexture(): void {
        this.inputTexture = ProceduralTextureProvider.createWithFormat(
            this.texWidth,
            this.texHeight,
            TextureFormat.RGBA8Unorm
        );
        this.inputProvider = this.inputTexture.control as ProceduralTextureProvider;

        // Initialize with invalid pixels (alpha = 0)
        const pixels = new Uint8Array(this.texWidth * this.texHeight * 4);
        this.inputProvider.setPixels(0, 0, this.texWidth, this.texHeight, pixels);
    }

    private createOutputRenderTargets(): void {
        const res = new vec2(this.texWidth, this.texHeight);
        this.projectedPosRT = this.createRenderTarget(res);
        this.projectedColorRT = this.createRenderTarget(res);
    }

    private createRenderTarget(resolution: vec2): Texture {
        const rt = global.scene.createRenderTargetTexture();
        const control = rt.control as any;
        control.useScreenResolution = false;
        control.resolution = resolution;
        control.clearColorEnabled = true;
        return rt;
    }

    private setupProjectionPipeline(gamutPosRT: Texture, gamutColorRT: Texture): void {
        this.projectionMaterialInstance = this.projectionMaterial.clone();
        const pass = this.projectionMaterialInstance.mainPass;

        pass.gamutPosTex = gamutPosRT;
        pass.gamutColorTex = gamutColorRT;
        pass.inputPosTex = this.inputTexture;
        pass.gamutTexSize = this.gamutTexSize;
        pass.inputTexWidth = this.texWidth;
        pass.inputTexHeight = this.texHeight;
        pass.gamutValidCount = this.gamutValidCount;

        const layer = LayerSet.makeUnique();
        const cameraObj = this.createCameraMRT(layer);
        this.createPostEffect(cameraObj, this.projectionMaterialInstance, layer);
    }

    private createCameraMRT(layer: LayerSet): SceneObject {
        const obj = global.scene.createSceneObject("Projector_Gamut_Camera");
        const cam = obj.createComponent("Component.Camera") as Camera;

        cam.enabled = true;
        cam.type = Camera.Type.Orthographic;
        cam.size = 2.0;
        cam.aspect = 1.0;
        cam.near = 0.5;
        cam.far = 100.0;
        cam.renderLayer = layer;
        cam.renderOrder = -90;
        cam.devicePropertyUsage = Camera.DeviceProperty.None;
        cam.renderTarget = this.projectedPosRT;

        const colorRenderTargets = cam.colorRenderTargets;
        while (colorRenderTargets.length < 2) {
            colorRenderTargets.push(Camera.createColorRenderTarget());
        }
        colorRenderTargets[0].targetTexture = this.projectedPosRT;
        colorRenderTargets[0].clearColor = new vec4(0, 0, 0, 0);
        colorRenderTargets[1].targetTexture = this.projectedColorRT;
        colorRenderTargets[1].clearColor = new vec4(0, 0, 0, 0);
        cam.colorRenderTargets = colorRenderTargets;

        return obj;
    }

    private createPostEffect(cameraObj: SceneObject, material: Material, layer: LayerSet): void {
        const obj = global.scene.createSceneObject("Projector_Gamut_Quad");
        obj.setParent(cameraObj);
        obj.layer = layer;
        const pe = obj.createComponent("Component.PostEffectVisual") as PostEffectVisual;
        pe.mainMaterial = material;
    }

    private assignToVFX(): void {
        if (this.vfxComponent?.asset) {
            const props = this.vfxComponent.asset.properties as any;
            // inputPosMap = LAB positions of input colors BEFORE projection
            props["inputPosMap"] = this.inputTexture;
            // posMap = LAB positions of projected colors (nearest gamut match)
            props["posMap"] = this.projectedPosRT;
            // colorMap = RGB colors of projected results
            props["colorMap"] = this.projectedColorRT;
            props["texWidth"] = this.texWidth;
            props["texHeight"] = this.texHeight;
            print("Projector_Gamut: Assigned to VFX (inputPosMap, posMap, colorMap)");
        }
    }

    // ============ COLOR CONVERSION ============

    public rgb2lab(rgb: vec3): vec3 {
        let r = rgb.x > 0.04045 ? Math.pow((rgb.x + 0.055) / 1.055, 2.4) : rgb.x / 12.92;
        let g = rgb.y > 0.04045 ? Math.pow((rgb.y + 0.055) / 1.055, 2.4) : rgb.y / 12.92;
        let b = rgb.z > 0.04045 ? Math.pow((rgb.z + 0.055) / 1.055, 2.4) : rgb.z / 12.92;

        let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
        let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
        let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

        x /= 0.95047;
        z /= 1.08883;

        const delta = 6.0 / 29.0;
        const delta3 = delta * delta * delta;

        const fx = x > delta3 ? Math.pow(x, 1 / 3) : x / (3 * delta * delta) + 4 / 29;
        const fy = y > delta3 ? Math.pow(y, 1 / 3) : y / (3 * delta * delta) + 4 / 29;
        const fz = z > delta3 ? Math.pow(z, 1 / 3) : z / (3 * delta * delta) + 4 / 29;

        return new vec3(116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz));
    }

    // ============ PUBLIC API ============

    public isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Set input colors to project onto the gamut.
     * Can be called from PaletteExtractor, manual input, or any other source.
     * Colors are converted to LAB and written to the input texture.
     */
    public setInputColors(colors: vec3[]): void {
        if (!this.isInitialized) {
            print("Projector_Gamut: Not ready, cannot set input colors");
            return;
        }

        this.inputColors = colors.slice();
        this.colorCount = Math.min(colors.length, this.texWidth * this.texHeight);
        this.resultsReady = false;

        const pixels = new Uint8Array(this.texWidth * this.texHeight * 4);

        for (let i = 0; i < this.colorCount; i++) {
            const rgb = colors[i];
            const lab = this.rgb2lab(rgb);

            // Encode LAB to texture format: R = normA, G = normL, B = normB
            const normA = (lab.y + 128) / 255;
            const normL = lab.x / 100;
            const normB = (lab.z + 128) / 255;

            const idx = i * 4;
            pixels[idx + 0] = Math.round(normA * 255);
            pixels[idx + 1] = Math.round(normL * 255);
            pixels[idx + 2] = Math.round(normB * 255);
            pixels[idx + 3] = 255;  // Valid
        }

        // Remaining pixels are invalid (alpha = 0, already initialized)

        this.inputProvider.setPixels(0, 0, this.texWidth, this.texHeight, pixels);

        // Mark that we're waiting for GPU to render
        this.inputPending = true;
        this.framesSinceInput = 0;

        print(`Projector_Gamut: Projecting ${this.colorCount} colors`);
    }

    /**
     * Check if projection results are ready (GPU has had time to render)
     */
    public areResultsReady(): boolean {
        // Need at least 1 frame for GPU to render after input was set
        return this.isInitialized && this.inputPending && this.framesSinceInput >= 1;
    }

    /**
     * Read back projected results from GPU.
     * Called automatically by getProjectedColors() if needed.
     */
    public readProjectedColors(): void {
        if (!this.isInitialized || this.colorCount === 0) return;

        if (this.framesSinceInput < 1) {
            print(`Projector_Gamut: WARNING - reading results before GPU rendered (frame ${this.framesSinceInput})`);
        }

        try {
            const w = this.texWidth;
            const h = this.texHeight;

            const posTemp = ProceduralTextureProvider.createFromTexture(this.projectedPosRT);
            const posProvider = posTemp.control as ProceduralTextureProvider;
            const posPixels = new Uint8Array(w * h * 4);
            posProvider.getPixels(0, 0, w, h, posPixels);

            const colorTemp = ProceduralTextureProvider.createFromTexture(this.projectedColorRT);
            const colorProvider = colorTemp.control as ProceduralTextureProvider;
            const colorPixels = new Uint8Array(w * h * 4);
            colorProvider.getPixels(0, 0, w, h, colorPixels);

            this.projectedColors = [];
            this.projectedLAB = [];

            for (let i = 0; i < this.colorCount; i++) {
                const idx = i * 4;

                const normA = posPixels[idx + 0] / 255;
                const normL = posPixels[idx + 1] / 255;
                const normB = posPixels[idx + 2] / 255;

                const L = normL * 100;
                const a = normA * 255 - 128;
                const b = normB * 255 - 128;
                this.projectedLAB.push(new vec3(L, a, b));

                const r = colorPixels[idx + 0] / 255;
                const g = colorPixels[idx + 1] / 255;
                const bCol = colorPixels[idx + 2] / 255;
                this.projectedColors.push(new vec3(r, g, bCol));
            }

            this.resultsReady = true;
            this.inputPending = false;

            print(`Projector_Gamut: Read back ${this.colorCount} projected colors`);

        } catch (e) {
            print("Projector_Gamut: Error reading projected colors: " + e);
        }
    }

    public getInputColors(): vec3[] {
        return [...this.inputColors];
    }

    public getProjectedColors(): vec3[] {
        if (!this.resultsReady && this.colorCount > 0) {
            this.readProjectedColors();
        }

        // Debug: show first few colors
        if (this.projectedColors.length > 0) {
            const c = this.projectedColors[0];
            print(`Projector_Gamut: First projected color RGB(${(c.x*255).toFixed(0)}, ${(c.y*255).toFixed(0)}, ${(c.z*255).toFixed(0)})`);
        }

        return [...this.projectedColors];
    }

    public getProjectedLAB(): vec3[] {
        if (!this.resultsReady && this.colorCount > 0) {
            this.readProjectedColors();
        }
        return [...this.projectedLAB];
    }

    public getProjectionResults(): { input: vec3; projected: vec3; inputLAB: vec3; projectedLAB: vec3; deltaE: number }[] {
        if (!this.resultsReady && this.colorCount > 0) {
            this.readProjectedColors();
        }

        const results: { input: vec3; projected: vec3; inputLAB: vec3; projectedLAB: vec3; deltaE: number }[] = [];

        for (let i = 0; i < this.colorCount; i++) {
            const inputRGB = this.inputColors[i];
            const inputLAB = this.rgb2lab(inputRGB);
            const projRGB = this.projectedColors[i] || new vec3(0.5, 0.5, 0.5);
            const projLAB = this.projectedLAB[i] || new vec3(50, 0, 0);

            const dL = inputLAB.x - projLAB.x;
            const da = inputLAB.y - projLAB.y;
            const db = inputLAB.z - projLAB.z;
            const deltaE = Math.sqrt(dL * dL + da * da + db * db);

            results.push({ input: inputRGB, projected: projRGB, inputLAB, projectedLAB: projLAB, deltaE });
        }

        return results;
    }

    public getColorCount(): number {
        return this.colorCount;
    }

    public getGamutSize(): number {
        return this.gamutValidCount;
    }

    // ============ RENDER TARGET GETTERS ============

    public getPosRenderTarget(): Texture {
        return this.projectedPosRT;
    }

    public getColorRenderTarget(): Texture {
        return this.projectedColorRT;
    }

    public getInputTexture(): Texture {
        return this.inputTexture;
    }

    public getTexDimensions(): vec2 {
        return new vec2(this.texWidth, this.texHeight);
    }
}
