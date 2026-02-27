# AI Vector Field Generator: Implementation Guide

Two-file addition to the Vector Fields project. `AiFieldGenerator.ts` calls Claude, gets a field recipe (composable primitives), evaluates them on a 32x32x32 grid, and packs the result into a 2D texture atlas. `AiVectorField.js` is a Custom Code Node shader identical to `VectorField.js` except `getField(p)` samples the atlas instead of computing analytically. Existing `VectorFieldTubes.ts` mesh generation is reused as-is with a different material.

## Files

```
Assets/Shaders/AiVectorField.js    Custom Code Node. Atlas-sampled getField(), same tube integration.
Assets/Scripts/AiFieldGenerator.ts  Component. AI call + field evaluation + texture atlas creation.
```

## Atlas Layout

A 3D field of N^3 voxels is tiled as Z-slices into a 2D texture.

```
tilesPerRow = ceil(sqrt(N))
texWidth    = tilesPerRow * N
texHeight   = tilesPerRow * N

For N=32:  tilesPerRow=6, texture=192x192, 36 tile slots (32 used, 4 empty)
For N=64:  tilesPerRow=8, texture=512x512, 64 tile slots (all used)
```

Slice `z` lives at tile `(z % tilesPerRow, floor(z / tilesPerRow))`.
RGB channels store velocity XYZ directly in RGBA16Float (no packing/unpacking).
Shader does trilinear Z interpolation by sampling two adjacent slices and mixing.

Half-pixel inset on tile UVs prevents bilinear bleed across tile borders:
```glsl
float halfPixel = 0.5 / (tilesPerRow * AtlasSize);
vec2 inTile = clamp(uvw.xy * invTiles, vec2(halfPixel), vec2(invTiles - halfPixel));
```

## Lens Studio Setup

### 1. Create Material

Duplicate `VectorField.mat` and its `.ss_graph`. Rename to `AiVectorField`.

In the Material Editor, replace the VectorField Custom Code Node with `AiVectorField.js`. The new shader has the same outputs (`transformedPosition`, `vertexColor`) and most of the same inputs, plus three new ones:

New inputs (add to material graph):
```
FieldAtlas   input_texture_2d   The 2D atlas texture (assigned at runtime by component)
AtlasSize    input_float        Grid resolution per axis (e.g., 32.0)
FieldExtent  input_float        Half-size of field bounding box (e.g., 3.0)
```

Removed inputs (not in this shader):
```
Preset       (no analytical presets, field comes from atlas)
FieldScale   (baked into the atlas data)
```

Kept inputs (same as VectorField):
```
TubeRadius   input_float
StepSize     input_float
NumSteps     input_float
Time         input_float
FlowSpeed    input_float
ArrowScale   input_float
ConeLength   input_float
ConeRadius   input_float
```

### 2. Wire Outputs in Material Graph

Same as VectorField.mat:
- `transformedPosition` (vec3) -> Transform Vector node (Object to World) -> World Position output
- `vertexColor` (vec4) -> fragment color. Wire `.rgb` to Base Color, `.a` to Opacity.
- Set Blend Mode to PremultipliedAlpha.
- DepthWrite: true, DepthTest: true, CullMode: Front, FrustumCulling: Extend (pad 10.0).

### 3. Scene Setup

Option A: Duplicate the existing VectorField SceneObject and swap the material.

Option B: New from scratch:
1. Create SceneObject "AiField"
2. Add `VectorFieldTubes.ts` component (reuse for mesh generation)
   - Assign the new `AiVectorField` material
   - Set LOD, mode, grid size as desired
3. Add `AiFieldGenerator.ts` component
   - Assign the same `AiVectorField` material
   - Set grid size (default 32), field extent (default 3.0)
4. Add `InternetModule` to the scene (for AI API calls)
   - Assign it to AiFieldGenerator's `internetModule` input

### 4. Inspector Inputs for AiFieldGenerator

```
material         Material        The AiVectorField material (same one as VectorFieldTubes)
_gridSize        int [16-64]     Resolution. 32 is good default. Higher = slower eval, sharper field.
_fieldExtent     float [1-10]    Field covers [-extent, +extent] on each axis. Match grid spacing.
internetModule   InternetModule  For API calls. Required for AI generation, optional for presets.
_apiKey          string          Claude API key (sk-ant-...). Or use Remote Service Gateway token.
_apiUrl          string          Default: https://api.anthropic.com/v1/messages
```

## Testing Without AI

Call `loadPreset()` from another script or the console. Five presets are built in:

```typescript
const gen = sceneObject.getComponent("Component.ScriptComponent") as AiFieldGenerator;

gen.loadPreset("tornado");           // helical upward spiral + turbulence
gen.loadPreset("galaxy");            // flat disk rotation with inward drift
gen.loadPreset("ocean_currents");    // uniform flow + waves + local vortex
gen.loadPreset("black_hole");        // central attractor with orbital rotation
gen.loadPreset("dueling_vortices");  // two counter-rotating vortices
```

Or construct a recipe directly:

```typescript
gen.generateFromRecipe({
    operations: [
        { type: "vortex", center: [0,0,0], axis: [0,1,0], strength: 0.5, radius: 3.0 },
        { type: "curl_noise", scale: 1.0, strength: 0.15 }
    ],
    globalScale: 1.0
});
```

Expected console output:
```
AiFieldGenerator: Created 192x192 atlas (6x6 tiles of 32²)
AiFieldGenerator: Loading preset 'tornado'
AiFieldGenerator: Evaluated 32768 samples in 85ms
```

## Testing With AI

```typescript
gen.generateFromPrompt("a tornado with turbulent edges spiraling upward");
```

Requires `internetModule` and `_apiKey` to be set. Component calls Claude Sonnet, which returns a JSON recipe, which gets evaluated and written to the atlas. Round-trip is 2-5 seconds depending on network.

Expected console output:
```
AiFieldGenerator: Generating field for: a tornado with turbulent edges
AiFieldGenerator: Evaluated 32768 samples in 92ms
AiFieldGenerator: Field generated with 3 operations
```

If using Remote Service Gateway instead of direct API:
- Change `_apiUrl` to the gateway endpoint
- Set `_apiKey` to the gateway token
- Adjust the request body in `callAI()` if the gateway wraps the Anthropic API differently

## Field Recipe Format

The AI outputs this, but you can also write it by hand:

```json
{
  "operations": [
    { "type": "vortex",     "center": [0,0,0], "axis": [0,1,0], "strength": 0.5, "radius": 2.0 },
    { "type": "source",     "center": [0,-2,0], "strength": 0.3, "falloff": 2.0 },
    { "type": "curl_noise", "scale": 1.2, "strength": 0.15, "center": [0,0,0] },
    { "type": "uniform",    "direction": [1,0,0], "strength": 0.1 }
  ],
  "globalScale": 1.0
}
```

All operations are superposed (added together). `globalScale` multiplies the final velocity.

### Available Primitives

| Type | Key Params | Description |
|------|-----------|-------------|
| `vortex` | center, axis, strength, radius | Rotation around axis. Falloff by radius. |
| `source` | center, strength, falloff | Radial outward. Negative strength = inward. |
| `sink` | center, strength, falloff | Alias for source with negated strength. |
| `uniform` | direction, strength | Constant flow everywhere. |
| `curl_noise` | scale, strength, center | Turbulent divergence-free flow. Scale = frequency. |
| `wave` | frequency[3], amplitude[3] | Sinusoidal interference pattern. |
| `spiral` | center, axis, strength, spinStrength, radius | Rotation + radial. strength = radial, spinStrength = tangential. |
| `dipole` | center, direction, strength | Magnetic dipole. direction = moment vector. |
| `attractor` | center, strength, twist, radius | Point attractor with optional twist. |
| `tornado` | center, radius, liftStrength, spinStrength | Helical upward spiral in XZ plane. |
| `shear` | axis, direction, strength | Velocity scales with distance along axis. |

All params have sensible defaults. Strengths in 0.1-0.8 work best for visualization.
The field domain is [-fieldExtent, +fieldExtent] on each axis (default 3.0).

## Gotchas

**Shader: no early returns.** Lens Studio Custom Code Nodes forbid `return` statements. The shader uses if/else blocks that always reach the end. Don't refactor with early exits.

**Shader: no `Preset` or `FieldScale` inputs.** Unlike VectorField.js, this shader has no analytical presets. The field is entirely defined by the atlas texture. If FieldAtlas is unassigned or blank, tubes will collapse to points.

**UV encoding.** Same as VectorField.js: all vertex data is encoded in texture coordinates (texture0-3), not position/normal, because Lens Studio distorts/normalizes those attributes. The mesh from VectorFieldTubes.ts already handles this.

**Vertex budget.** Still applies. VectorFieldTubes enforces UInt16 index limits (65535 max). The AI field doesn't change geometry, only where tubes go.

**Grid size vs field extent.** If `_fieldExtent` is large (e.g., 5.0) but `_gridSize` is small (e.g., 16), the field will look blocky because each voxel covers a large spatial region. Rule of thumb: keep extent/gridSize < 0.2 for smooth results. Default 3.0/32 = 0.09 is fine.

**Texture format.** RGBA16Float via `ProceduralTextureProvider.createWithFormat()`. Velocity stored directly as float (no [0,1] packing). `setPixelsFloat32()` takes Float32Array and the runtime handles the Float32->Float16 conversion.

**Claude response parsing.** The component strips markdown code fences from Claude's response before JSON.parse. If the model wraps its output differently, check `callAI()` parsing logic.

**Performance.** 32^3 grid evaluation: ~50-200ms depending on recipe complexity (curl_noise is heaviest because it calls simplex noise 6x per sample). This runs once per generation, not per frame. The shader's per-frame cost is similar to VectorField.js since the integration loop is the same.

**Atlas border bleeding.** Bilinear filtering can sample across tile boundaries. Mitigated by: half-pixel UV inset per tile, `sampleLod(uv, 0.0)` to disable mipmaps. Imperceptible for smooth fields. Could be visible with sharp discontinuities at slice boundaries, but real fields are continuous so this shouldn't matter.
