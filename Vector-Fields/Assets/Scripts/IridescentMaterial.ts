// IridescentMaterial.ts
// Applies view-dependent iridescent coloring to any object with a Graph Material

@component
export class IridescentMaterial extends BaseScriptComponent {

    @input
    @hint("Material to apply iridescence to")
    material: Material;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Fresnel power - higher = more edge color")
    private _fresnelPower: number = 2.0;

    @input
    @widget(new SliderWidget(0.0, 5.0, 0.1))
    @hint("Speed of color cycling")
    private _colorSpeed: number = 0.5;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Saturation of iridescent colors")
    private _saturation: number = 0.8;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Base brightness")
    private _brightness: number = 0.9;

    @input
    @widget(new SliderWidget(0.0, 1.0, 0.05))
    @hint("Opacity")
    private _opacity: number = 0.85;

    @input
    @hint("Use world position for color variation")
    private _usePositionVariation: boolean = true;

    @input
    @hint("Camera for view-dependent effects (optional)")
    camera: Camera;

    private mainPass: Pass;

    onAwake(): void {
        if (this.material) {
            this.mainPass = this.material.mainPass;
        } else {
            print("IridescentMaterial: No material assigned!");
            return;
        }

        this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
    }

    private hsvToRgb(h: number, s: number, v: number): vec3 {
        h = h - Math.floor(h);
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: return new vec3(v, t, p);
            case 1: return new vec3(q, v, p);
            case 2: return new vec3(p, v, t);
            case 3: return new vec3(p, q, v);
            case 4: return new vec3(t, p, v);
            case 5: return new vec3(v, p, q);
            default: return new vec3(v, v, v);
        }
    }

    private getCameraPosition(): vec3 {
        if (this.camera) {
            return this.camera.getTransform().getWorldPosition();
        }
        return new vec3(0, 0, 50);
    }

    private onUpdate(): void {
        if (!this.mainPass) return;

        const time = getTime();
        const objectPos = this.sceneObject.getTransform().getWorldPosition();
        const cameraPos = this.getCameraPosition();

        const viewDir = cameraPos.sub(objectPos).normalize();
        const objectUp = this.sceneObject.getTransform().up;

        const viewDot = Math.abs(viewDir.dot(objectUp));
        const fresnel = Math.pow(1.0 - viewDot, this._fresnelPower);

        let hue = (time * this._colorSpeed) % 1.0;

        if (this._usePositionVariation) {
            const posHash = (objectPos.x * 0.1 + objectPos.y * 0.2 + objectPos.z * 0.15) % 1.0;
            hue = (hue + posHash + fresnel * 0.3) % 1.0;
        } else {
            hue = (hue + fresnel * 0.5) % 1.0;
        }

        const rgb = this.hsvToRgb(hue, this._saturation, this._brightness);
        const color = new vec4(rgb.x, rgb.y, rgb.z, this._opacity);

        try {
            this.mainPass.Port_FinalColor_N004 = color;
        } catch (e) {
            try {
                this.mainPass.baseColor = color;
            } catch (e2) {
                try {
                    this.mainPass.BaseColor = color;
                } catch (e3) {}
            }
        }
    }

    get fresnelPower(): number { return this._fresnelPower; }
    set fresnelPower(value: number) { this._fresnelPower = Math.max(0, value); }

    get colorSpeed(): number { return this._colorSpeed; }
    set colorSpeed(value: number) { this._colorSpeed = value; }

    get saturation(): number { return this._saturation; }
    set saturation(value: number) { this._saturation = Math.max(0, Math.min(1, value)); }

    get brightness(): number { return this._brightness; }
    set brightness(value: number) { this._brightness = Math.max(0, Math.min(1, value)); }

    get opacity(): number { return this._opacity; }
    set opacity(value: number) { this._opacity = Math.max(0, Math.min(1, value)); }
}
