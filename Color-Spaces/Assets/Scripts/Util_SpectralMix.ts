// Util_SpectralMix.ts
// Utility for testing spectral/Kubelka-Munk color mixing

@component
export class Util_SpectralMix extends BaseScriptComponent {
    
    @input
    material: Material;
    
    @input
    @widget(new ColorWidget())
    pig0Color: vec3 = new vec3(1, 1, 1);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig0Conc: number = 0.2;
    
    @input
    @widget(new ColorWidget())
    pig1Color: vec3 = new vec3(0.08, 0.08, 0.08);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig1Conc: number = 0.2;
    
    @input
    @widget(new ColorWidget())
    pig2Color: vec3 = new vec3(1, 0.92, 0);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig2Conc: number = 0.2;
    
    @input
    @widget(new ColorWidget())
    pig3Color: vec3 = new vec3(0.89, 0, 0.13);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig3Conc: number = 0.15;
    
    @input
    @widget(new ColorWidget())
    pig4Color: vec3 = new vec3(0.1, 0.1, 0.7);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig4Conc: number = 0.15;
    
    @input
    @widget(new ColorWidget())
    pig5Color: vec3 = new vec3(0, 0.47, 0.44);
    @input
    @widget(new SliderWidget(0, 1, 0.01))
    pig5Conc: number = 0.1;
    
    private static readonly NUM_PIGMENTS = 6;
    
    private proceduralTexture: Texture;
    private mainPass: Pass;
    
    onAwake(): void {
        if (!this.material) {
            print("Util_SpectralMix: No material assigned!");
            return;
        }
        
        this.mainPass = this.material.mainPass;
        
        // Create procedural texture (6x1, RGBA)
        this.proceduralTexture = ProceduralTextureProvider.createWithFormat(
            Util_SpectralMix.NUM_PIGMENTS, 
            1, 
            TextureFormat.RGBA8Unorm
        );
        
        // Assign to material
        this.mainPass.pigmentTex = this.proceduralTexture;
        this.mainPass.numPigments = Util_SpectralMix.NUM_PIGMENTS;
        this.mainPass.texWidth = Util_SpectralMix.NUM_PIGMENTS;
        
        this.rebuildPixels();
        
        this.createEvent("UpdateEvent").bind(() => this.rebuildPixels());
        
        print("Util_SpectralMix initialized");
    }
    
    private rebuildPixels(): void {
        const pixels = new Uint8Array(Util_SpectralMix.NUM_PIGMENTS * 4);
        
        const pigments = [
            { color: this.pig0Color, conc: this.pig0Conc },
            { color: this.pig1Color, conc: this.pig1Conc },
            { color: this.pig2Color, conc: this.pig2Conc },
            { color: this.pig3Color, conc: this.pig3Conc },
            { color: this.pig4Color, conc: this.pig4Conc },
            { color: this.pig5Color, conc: this.pig5Conc },
        ];
        
        for (let i = 0; i < Util_SpectralMix.NUM_PIGMENTS; i++) {
            const idx = i * 4;
            pixels[idx + 0] = Math.round(pigments[i].color.x * 255);
            pixels[idx + 1] = Math.round(pigments[i].color.y * 255);
            pixels[idx + 2] = Math.round(pigments[i].color.z * 255);
            pixels[idx + 3] = Math.round(pigments[i].conc * 255);
        }
        
        (this.proceduralTexture.control as ProceduralTextureProvider).setPixels(
            0, 0, Util_SpectralMix.NUM_PIGMENTS, 1, pixels
        );
    }
}