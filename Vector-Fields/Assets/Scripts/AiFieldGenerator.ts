// AiFieldGenerator.ts
// Generates vector fields from text prompts using an AI model.
// Pipeline: prompt → Claude API → field recipe (JSON) → evaluate on 3D grid → 2D atlas texture
// The atlas texture is sampled by AiVectorField.js shader for tube integration.

// ============================================
// FIELD RECIPE TYPES
// ============================================

interface FieldOp {
    type: string;
    // Spatial
    center?: number[];     // [x, y, z] - default [0,0,0]
    axis?: number[];       // [x, y, z] - default [0,1,0]
    direction?: number[];  // [x, y, z] - for uniform flow
    // Scalars
    strength?: number;     // default 1.0
    scale?: number;        // noise/wave frequency scale, default 1.0
    falloff?: number;      // distance falloff exponent, default 2.0
    radius?: number;       // effective radius, default 1.0
    twist?: number;        // twist amount, default 0.0
    frequency?: number[];  // [fx, fy, fz] for waves
    amplitude?: number[];  // [ax, ay, az] for waves
    liftStrength?: number; // vertical force for tornado
    spinStrength?: number; // rotational force for tornado
}

interface FieldRecipe {
    operations: FieldOp[];
    globalScale?: number;  // multiplied into all velocities, default 1.0
}

// ============================================
// 3D SIMPLEX NOISE (Ashima/Stefan Gustavson)
// ============================================

function mod289(x: number): number { return x - Math.floor(x / 289.0) * 289.0; }

function permute(x: number): number { return mod289(((x * 34.0) + 1.0) * x); }

function snoise3(x: number, y: number, z: number): number {
    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
        if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
        if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = mod289(i);
    const jj = mod289(j);
    const kk = mod289(k);

    // Gradients using permutation
    const gi0 = mod289(permute(permute(permute(kk) + jj) + ii));
    const gi1 = mod289(permute(permute(permute(kk + k1) + jj + j1) + ii + i1));
    const gi2 = mod289(permute(permute(permute(kk + k2) + jj + j2) + ii + i2));
    const gi3 = mod289(permute(permute(permute(kk + 1) + jj + 1) + ii + 1));

    // Use gradient index to pick pseudo-random gradient
    function grad(hash: number, gx: number, gy: number, gz: number): number {
        const h = Math.floor(hash) % 12;
        const u = h < 8 ? gx : gy;
        const v = h < 4 ? gy : (h === 12 || h === 14 ? gx : gz);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * grad(gi0, x0, y0, z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * grad(gi1, x1, y1, z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * grad(gi2, x2, y2, z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * grad(gi3, x3, y3, z3); }

    return 32.0 * (n0 + n1 + n2 + n3);
}

function curlNoise3(x: number, y: number, z: number, scale: number): number[] {
    const e = 0.1;
    const sx = x * scale, sy = y * scale, sz = z * scale;

    const n1 = snoise3(sx, sy + e, sz);
    const n2 = snoise3(sx, sy - e, sz);
    const n3 = snoise3(sx, sy, sz + e);
    const n4 = snoise3(sx, sy, sz - e);
    const n5 = snoise3(sx + e, sy, sz);
    const n6 = snoise3(sx - e, sy, sz);

    return [
        (n2 - n1) - (n4 - n3),
        (n4 - n3) - (n6 - n5),
        (n6 - n5) - (n2 - n1)
    ];
}

// ============================================
// FIELD PRIMITIVE EVALUATORS
// ============================================

function evalVortex(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const ax = op.axis ? op.axis[0] : 0;
    const ay = op.axis ? op.axis[1] : 1;
    const az = op.axis ? op.axis[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.4;
    const r = op.radius !== undefined ? op.radius : 2.0;

    // Vector from center to point
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    // Cross product of axis and displacement = tangential direction
    const tx = ay * dz - az * dy;
    const ty = az * dx - ax * dz;
    const tz = ax * dy - ay * dx;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const falloff = 1.0 / (1.0 + (dist / r) * (dist / r));
    return [tx * str * falloff, ty * str * falloff, tz * str * falloff];
}

function evalSource(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.4;
    const falloffExp = op.falloff !== undefined ? op.falloff : 2.0;

    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < 0.001) return [0, 0, 0];
    const mag = str / Math.pow(1.0 + dist, falloffExp);
    return [dx / dist * mag, dy / dist * mag, dz / dist * mag];
}

function evalUniform(op: FieldOp, _px: number, _py: number, _pz: number): number[] {
    const dx = op.direction ? op.direction[0] : 1;
    const dy = op.direction ? op.direction[1] : 0;
    const dz = op.direction ? op.direction[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.3;
    return [dx * str, dy * str, dz * str];
}

function evalCurlNoise(op: FieldOp, px: number, py: number, pz: number): number[] {
    const scale = op.scale !== undefined ? op.scale : 1.0;
    const str = op.strength !== undefined ? op.strength : 0.3;
    const ox = op.center ? op.center[0] : 0;
    const oy = op.center ? op.center[1] : 0;
    const oz = op.center ? op.center[2] : 0;
    const c = curlNoise3(px + ox, py + oy, pz + oz, scale);
    return [c[0] * str, c[1] * str, c[2] * str];
}

function evalWave(op: FieldOp, px: number, py: number, pz: number): number[] {
    const fx = op.frequency ? op.frequency[0] : 1.0;
    const fy = op.frequency ? op.frequency[1] : 1.0;
    const fz = op.frequency ? op.frequency[2] : 1.0;
    const ax = op.amplitude ? op.amplitude[0] : 0.3;
    const ay = op.amplitude ? op.amplitude[1] : 0.3;
    const az = op.amplitude ? op.amplitude[2] : 0.3;
    return [
        Math.sin(py * fy) * Math.cos(pz * fz * 0.5) * ax,
        Math.sin(pz * fz) * Math.cos(px * fx * 0.5) * ay,
        Math.sin(px * fx) * Math.cos(py * fy * 0.5) * az
    ];
}

function evalSpiral(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const rStr = op.strength !== undefined ? op.strength : 0.3;
    const sStr = op.spinStrength !== undefined ? op.spinStrength : 0.4;
    const ax = op.axis ? op.axis[0] : 0;
    const ay = op.axis ? op.axis[1] : 1;
    const az = op.axis ? op.axis[2] : 0;
    const r = op.radius !== undefined ? op.radius : 2.0;

    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const falloff = 1.0 / (1.0 + (dist / r) * (dist / r));

    // Tangential (rotation)
    const tx = ay * dz - az * dy;
    const ty = az * dx - ax * dz;
    const tz = ax * dy - ay * dx;

    // Radial (inward/outward)
    const rd = dist > 0.001 ? 1.0 / dist : 0;
    return [
        (tx * sStr + dx * rd * rStr) * falloff,
        (ty * sStr + dy * rd * rStr) * falloff,
        (tz * sStr + dz * rd * rStr) * falloff
    ];
}

function evalDipole(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const mx = op.direction ? op.direction[0] : 0;
    const my = op.direction ? op.direction[1] : 1;
    const mz = op.direction ? op.direction[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.5;

    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const r2 = dx*dx + dy*dy + dz*dz;
    const r = Math.sqrt(r2);
    if (r < 0.1) return [0, 0, 0];

    const r5 = r2 * r2 * r;
    const mdotr = mx*dx + my*dy + mz*dz;
    const c = 3.0 * mdotr / r5;
    return [
        (c * dx - mx / (r2 * r)) * str,
        (c * dy - my / (r2 * r)) * str,
        (c * dz - mz / (r2 * r)) * str
    ];
}

function evalAttractor(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.4;
    const tw = op.twist !== undefined ? op.twist : 0.3;
    const r = op.radius !== undefined ? op.radius : 2.0;

    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < 0.001) return [0, 0, 0];
    const falloff = 1.0 / (1.0 + (dist / r) * (dist / r));

    // Inward + twist
    const invDist = 1.0 / dist;
    const angle = Math.atan2(dz, dx);
    return [
        (-dx * invDist * str + Math.sin(angle) * tw) * falloff,
        (-dy * invDist * str) * falloff,
        (-dz * invDist * str - Math.cos(angle) * tw) * falloff
    ];
}

function evalTornado(op: FieldOp, px: number, py: number, pz: number): number[] {
    const cx = op.center ? op.center[0] : 0;
    const cy = op.center ? op.center[1] : 0;
    const cz = op.center ? op.center[2] : 0;
    const r = op.radius !== undefined ? op.radius : 1.5;
    const lift = op.liftStrength !== undefined ? op.liftStrength : 0.3;
    const spin = op.spinStrength !== undefined ? op.spinStrength : 0.5;

    const dx = px - cx, dz = pz - cz;
    const distXZ = Math.sqrt(dx*dx + dz*dz);
    const falloff = 1.0 / (1.0 + (distXZ / r) * (distXZ / r));

    // Tangential in XZ + upward
    const angle = Math.atan2(dz, dx);
    return [
        -Math.sin(angle) * spin * falloff,
        lift * falloff,
        Math.cos(angle) * spin * falloff
    ];
}

function evalShear(op: FieldOp, px: number, py: number, pz: number): number[] {
    const ax = op.axis ? op.axis[0] : 0;
    const ay = op.axis ? op.axis[1] : 1;
    const az = op.axis ? op.axis[2] : 0;
    const dx = op.direction ? op.direction[0] : 1;
    const dy = op.direction ? op.direction[1] : 0;
    const dz = op.direction ? op.direction[2] : 0;
    const str = op.strength !== undefined ? op.strength : 0.3;

    // Velocity in direction proportional to distance along axis
    const projection = px * ax + py * ay + pz * az;
    return [dx * projection * str, dy * projection * str, dz * projection * str];
}

function evaluateOp(op: FieldOp, px: number, py: number, pz: number): number[] {
    switch (op.type) {
        case "vortex": return evalVortex(op, px, py, pz);
        case "source": return evalSource(op, px, py, pz);
        case "sink": return evalSource({ ...op, strength: -(op.strength || 0.4) }, px, py, pz);
        case "uniform": return evalUniform(op, px, py, pz);
        case "curl_noise": return evalCurlNoise(op, px, py, pz);
        case "wave": return evalWave(op, px, py, pz);
        case "spiral": return evalSpiral(op, px, py, pz);
        case "dipole": return evalDipole(op, px, py, pz);
        case "attractor": return evalAttractor(op, px, py, pz);
        case "tornado": return evalTornado(op, px, py, pz);
        case "shear": return evalShear(op, px, py, pz);
        default: return [0, 0, 0];
    }
}

function evaluateField(recipe: FieldRecipe, px: number, py: number, pz: number): number[] {
    let vx = 0, vy = 0, vz = 0;
    for (const op of recipe.operations) {
        const v = evaluateOp(op, px, py, pz);
        vx += v[0]; vy += v[1]; vz += v[2];
    }
    const s = recipe.globalScale !== undefined ? recipe.globalScale : 1.0;
    return [vx * s, vy * s, vz * s];
}

// ============================================
// AI SYSTEM PROMPT
// ============================================

const FIELD_SYSTEM_PROMPT = `You generate vector field recipes as JSON. A vector field assigns a 3D velocity to every point in space. The field is visualized as flowing tubes in AR.

Output ONLY valid JSON matching this schema, no explanation:
{
  "operations": [ ...array of field operations... ],
  "globalScale": 1.0
}

Available operations (all superposed/added together):

- {"type":"vortex","center":[x,y,z],"axis":[x,y,z],"strength":0.4,"radius":2.0}
  Rotational flow around an axis. Positive strength = counterclockwise.

- {"type":"source","center":[x,y,z],"strength":0.4,"falloff":2.0}
  Radial outward flow from a point. Higher falloff = more concentrated.

- {"type":"sink","center":[x,y,z],"strength":0.4,"falloff":2.0}
  Radial inward flow toward a point.

- {"type":"uniform","direction":[x,y,z],"strength":0.3}
  Constant flow in one direction everywhere.

- {"type":"curl_noise","scale":1.0,"strength":0.3,"center":[ox,oy,oz]}
  Turbulent, divergence-free flow. Scale controls frequency. Center offsets the noise.

- {"type":"wave","frequency":[fx,fy,fz],"amplitude":[ax,ay,az]}
  Sinusoidal interference pattern creating oscillating cells.

- {"type":"spiral","center":[x,y,z],"axis":[x,y,z],"strength":0.3,"spinStrength":0.4,"radius":2.0}
  Combined rotation + radial flow. Positive strength = outward spiral.

- {"type":"dipole","center":[x,y,z],"direction":[mx,my,mz],"strength":0.5}
  Magnetic dipole field. Direction is the dipole moment.

- {"type":"attractor","center":[x,y,z],"strength":0.4,"twist":0.3,"radius":2.0}
  Point attractor with optional twist. Positive strength = inward.

- {"type":"tornado","center":[x,y,z],"radius":1.5,"liftStrength":0.3,"spinStrength":0.5}
  Helical upward spiral, like a tornado or whirlpool.

- {"type":"shear","axis":[x,y,z],"direction":[x,y,z],"strength":0.3}
  Velocity in direction scales with distance along axis. Creates layered flow.

Tips:
- The field domain is a cube from -3 to 3 on each axis (extent = 3.0)
- Combine 2-5 operations for interesting fields
- Keep strengths in 0.1-0.8 range for good visualization
- Interesting fields often mix structure (vortex, spiral) with chaos (curl_noise)
- Use multiple vortices at different positions for complex dynamics`;

// ============================================
// COMPONENT
// ============================================

@component
export class AiFieldGenerator extends BaseScriptComponent {

    @input
    @hint("Material using AiVectorField.js shader")
    material: Material;

    @input
    @widget(new SliderWidget(16, 64, 8))
    @hint("Grid resolution per axis. 32 = good balance of quality and speed")
    private _gridSize: number = 32;

    @input
    @widget(new SliderWidget(1.0, 10.0, 0.5))
    @hint("Half-size of field bounding box. Field goes from -extent to +extent")
    private _fieldExtent: number = 3.0;

    @input
    @hint("InternetModule for API calls (add InternetModule to your scene)")
    internetModule: InternetModule;

    @input
    @hint("API key for Claude (via Remote Service Gateway or direct)")
    private _apiKey: string = "";

    @input
    @hint("API endpoint URL")
    private _apiUrl: string = "https://api.anthropic.com/v1/messages";

    private fieldTexture: Texture;
    private textureProvider: ProceduralTextureProvider;
    private mainPass: Pass;
    private tilesPerRow: number;
    private texWidth: number;
    private texHeight: number;
    private isGenerating: boolean = false;

    onAwake(): void {
        if (this.material) {
            this.mainPass = this.material.mainPass;
        } else {
            print("AiFieldGenerator: WARNING - No material assigned!");
        }
        this.createFieldTexture();
        print("AiFieldGenerator: Initialized with " + this._gridSize + "³ grid, extent=" + this._fieldExtent);
    }

    private createFieldTexture(): void {
        const N = this._gridSize;
        this.tilesPerRow = Math.ceil(Math.sqrt(N));
        this.texWidth = this.tilesPerRow * N;
        this.texHeight = this.tilesPerRow * N;

        this.fieldTexture = ProceduralTextureProvider.createWithFormat(
            this.texWidth, this.texHeight, TextureFormat.RGBA16Float
        );
        this.textureProvider = this.fieldTexture.control as ProceduralTextureProvider;

        if (this.mainPass) {
            this.mainPass.FieldAtlas = this.fieldTexture;
            this.mainPass.AtlasSize = N;
            this.mainPass.FieldExtent = this._fieldExtent;
        }

        print("AiFieldGenerator: Created " + this.texWidth + "×" + this.texHeight +
              " atlas (" + this.tilesPerRow + "×" + this.tilesPerRow + " tiles of " + N + "²)");
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Generate a field from a text prompt using Claude API.
     * Requires internetModule and apiKey to be set.
     */
    public async generateFromPrompt(prompt: string): Promise<void> {
        if (this.isGenerating) {
            print("AiFieldGenerator: Already generating, please wait");
            return;
        }
        if (!this.internetModule) {
            print("AiFieldGenerator: ERROR - No InternetModule assigned");
            return;
        }

        this.isGenerating = true;
        print("AiFieldGenerator: Generating field for: " + prompt);

        try {
            const recipe = await this.callAI(prompt);
            if (recipe) {
                this.generateFromRecipe(recipe);
                print("AiFieldGenerator: Field generated with " + recipe.operations.length + " operations");
            }
        } catch (e) {
            print("AiFieldGenerator: ERROR - " + e);
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Generate a field directly from a recipe (no AI call needed).
     * Useful for presets or testing.
     */
    public generateFromRecipe(recipe: FieldRecipe): void {
        const N = this._gridSize;
        const extent = this._fieldExtent;
        const data = new Float32Array(this.texWidth * this.texHeight * 4);

        const startTime = getTime();

        for (let z = 0; z < N; z++) {
            const tileX = z % this.tilesPerRow;
            const tileY = Math.floor(z / this.tilesPerRow);

            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    // Map grid coords to world space [-extent, extent]
                    const wx = (x / (N - 1) * 2 - 1) * extent;
                    const wy = (y / (N - 1) * 2 - 1) * extent;
                    const wz = (z / (N - 1) * 2 - 1) * extent;

                    const vel = evaluateField(recipe, wx, wy, wz);

                    const px = tileX * N + x;
                    const py = tileY * N + y;
                    const idx = (py * this.texWidth + px) * 4;

                    data[idx]     = vel[0];
                    data[idx + 1] = vel[1];
                    data[idx + 2] = vel[2];
                    data[idx + 3] = 1.0;
                }
            }
        }

        this.textureProvider.setPixelsFloat32(0, 0, this.texWidth, this.texHeight, data);

        const elapsed = ((getTime() - startTime) * 1000).toFixed(0);
        print("AiFieldGenerator: Evaluated " + (N * N * N) + " samples in " + elapsed + "ms");
    }

    // ============================================
    // AI COMMUNICATION
    // ============================================

    private async callAI(prompt: string): Promise<FieldRecipe | null> {
        const body = JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1024,
            system: FIELD_SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }]
        });

        const request = new Request(this._apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this._apiKey,
                "anthropic-version": "2023-06-01"
            },
            body: body
        });

        const response = await this.internetModule.fetch(request);

        if (response.status !== 200) {
            const text = await response.text();
            print("AiFieldGenerator: API error " + response.status + ": " + text);
            return null;
        }

        const json = await response.json();
        const content = json.content[0].text;

        // Extract JSON from response (may be wrapped in markdown code block)
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        try {
            const recipe = JSON.parse(jsonStr) as FieldRecipe;
            if (!recipe.operations || !Array.isArray(recipe.operations)) {
                print("AiFieldGenerator: Invalid recipe - missing operations array");
                return null;
            }
            return recipe;
        } catch (e) {
            print("AiFieldGenerator: Failed to parse recipe JSON: " + e);
            print("AiFieldGenerator: Raw response: " + content.substring(0, 200));
            return null;
        }
    }

    // ============================================
    // PRESET RECIPES (for testing without AI)
    // ============================================

    public static readonly PRESETS: { [key: string]: FieldRecipe } = {
        "tornado": {
            operations: [
                { type: "tornado", center: [0, -1, 0], radius: 1.5, liftStrength: 0.3, spinStrength: 0.5 },
                { type: "curl_noise", scale: 0.8, strength: 0.15 }
            ]
        },
        "galaxy": {
            operations: [
                { type: "vortex", center: [0, 0, 0], axis: [0, 1, 0], strength: 0.5, radius: 3.0 },
                { type: "spiral", center: [0, 0, 0], axis: [0, 1, 0], strength: -0.1, spinStrength: 0.3, radius: 2.0 },
                { type: "curl_noise", scale: 1.2, strength: 0.1 }
            ]
        },
        "ocean_currents": {
            operations: [
                { type: "uniform", direction: [1, 0, 0], strength: 0.2 },
                { type: "wave", frequency: [1.5, 1.0, 1.5], amplitude: [0.2, 0.15, 0.2] },
                { type: "curl_noise", scale: 0.6, strength: 0.2 },
                { type: "vortex", center: [1.5, 0, 1], axis: [0, 1, 0], strength: 0.3, radius: 1.5 }
            ]
        },
        "black_hole": {
            operations: [
                { type: "attractor", center: [0, 0, 0], strength: 0.6, twist: 0.5, radius: 1.0 },
                { type: "vortex", center: [0, 0, 0], axis: [0, 1, 0], strength: 0.4, radius: 3.0 },
                { type: "curl_noise", scale: 2.0, strength: 0.08 }
            ]
        },
        "dueling_vortices": {
            operations: [
                { type: "vortex", center: [-1.5, 0, 0], axis: [0, 1, 0], strength: 0.5, radius: 2.0 },
                { type: "vortex", center: [1.5, 0, 0], axis: [0, -1, 0], strength: 0.5, radius: 2.0 },
                { type: "curl_noise", scale: 1.0, strength: 0.12 }
            ]
        }
    };

    /**
     * Load a built-in preset by name.
     */
    public loadPreset(name: string): void {
        const recipe = AiFieldGenerator.PRESETS[name];
        if (recipe) {
            print("AiFieldGenerator: Loading preset '" + name + "'");
            this.generateFromRecipe(recipe);
        } else {
            print("AiFieldGenerator: Unknown preset '" + name + "'. Available: " +
                  Object.keys(AiFieldGenerator.PRESETS).join(", "));
        }
    }

    // ============================================
    // ACCESSORS
    // ============================================

    get gridSize(): number { return this._gridSize; }
    get fieldExtent(): number { return this._fieldExtent; }

    set fieldExtent(value: number) {
        this._fieldExtent = value;
        if (this.mainPass) {
            this.mainPass.FieldExtent = value;
        }
    }

    get generating(): boolean { return this.isGenerating; }
}
