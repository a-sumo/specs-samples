# Dynamic Geometry Workflow in Lens Studio

A workflow for creating procedural geometry in TypeScript and manipulating it dynamically with GPU shaders.

## Overview

This approach separates geometry generation (CPU/TypeScript) from dynamic transformation (GPU/Shader):

1. **TypeScript Script**: Generates mesh geometry using `MeshBuilder`, encoding per-vertex data in texture coordinates
2. **Vertex Shader**: Reads texture coordinates, performs transformations, outputs new positions
3. **Fragment Shader**: Uses vertex outputs for coloring
4. **Material**: Connects shader to mesh, exposes parameters for real-time control

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TypeScript Script                          │
│  • Generates mesh with MeshBuilder                              │
│  • Stores per-vertex data in texture coords (uv0, uv1, uv2)     │
│  • Sets material parameters via mainPass                        │
│  • Exposes public API for runtime control                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Material                                 │
│  • Graph Material with Code Node                                │
│  • Vertex shader transforms positions                           │
│  • Fragment shader handles coloring                             │
│  • Parameters exposed as uniforms                               │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: TypeScript Geometry Generator

### MeshBuilder Setup

```typescript
@component
export class MyGenerator extends BaseScriptComponent {
    @input material: Material;

    private meshBuilder: MeshBuilder;
    private renderMeshVisual: RenderMeshVisual;

    onAwake() {
        // Define vertex attributes
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },  // uv0: custom data
            { name: "texture1", components: 2 },  // uv1: more custom data
            { name: "texture2", components: 2 },  // uv2: even more data
        ]);

        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        this.generateMesh();
    }
}
```

### Encoding Data in Texture Coordinates

Use texture coordinates to pass per-vertex data to the shader:

```typescript
private addVertex(
    position: vec3,
    normal: vec3,
    customData1: number,
    customData2: number,
    customData3: number,
    customData4: number
): number {
    const index = this.vertexIndex++;

    this.meshBuilder.appendVerticesInterleaved([
        // Position (3 floats)
        position.x, position.y, position.z,
        // Normal (3 floats)
        normal.x, normal.y, normal.z,
        // texture0 (2 floats) - e.g., RGB color r, g
        customData1, customData2,
        // texture1 (2 floats) - e.g., RGB color b, extra param
        customData3, customData4,
    ]);

    return index;
}
```

### Building the Mesh

```typescript
private generateMesh(): void {
    // Generate vertices
    for (/* your geometry logic */) {
        const idx0 = this.addVertex(pos0, normal, r, g, b, 0);
        const idx1 = this.addVertex(pos1, normal, r, g, b, 0);
        const idx2 = this.addVertex(pos2, normal, r, g, b, 0);

        // Add triangle
        this.meshBuilder.appendIndices([idx0, idx1, idx2]);
    }

    // Finalize mesh
    this.meshBuilder.updateMesh();
    const mesh = this.meshBuilder.getMesh();

    // Create render component
    this.renderMeshVisual = this.sceneObject.createComponent("RenderMeshVisual");
    this.renderMeshVisual.mesh = mesh;
    this.renderMeshVisual.mainMaterial = this.material;

    // Initialize material parameters
    this.updateMaterialParams();
}
```

### Material Parameter Control

```typescript
private _blend: number = 0.0;
private _mode: number = 0;

private updateMaterialParams(): void {
    if (!this.material) return;

    const pass = this.material.mainPass;
    pass.blend = this._blend;
    pass.mode = this._mode;
    pass.size = this.size;
}

// Public API for external control (e.g., button callbacks)
public setBlend(value: number): void {
    this._blend = Math.max(0, Math.min(1, value));
    this.updateMaterialParams();
}

public nextMode(): void {
    this._mode = (this._mode + 1) % MODE_COUNT;
    this.updateMaterialParams();
}
```

## Step 2: Vertex Shader (Code Node)

Create a Graph Material with a Code Node for the vertex shader.

### Shader Structure

```glsl
// Inputs (uniforms from material)
input_float size;
input_float blend;
input_int mode;

// Outputs to fragment shader
output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    // Read custom data from texture coordinates
    vec2 uv0 = system.getSurfaceUVCoord0();
    vec2 uv1 = system.getSurfaceUVCoord1();

    float r = uv0.x;
    float g = uv0.y;
    float b = uv1.x;

    // Get current vertex position
    vec3 vertexPos = system.getSurfacePositionObjectSpace();

    // Calculate base position (where this vertex was generated)
    vec3 baseCenter = calculateBasePosition(r, g, b, size);

    // Calculate target position (transformed)
    vec3 targetCenter = calculateTargetPosition(r, g, b, mode, size);

    // Preserve vertex offset from center (for geometry like cubes, spheres)
    vec3 offset = vertexPos - baseCenter;

    // Interpolate and apply offset
    vec3 finalCenter = mix(baseCenter, targetCenter, blend);
    transformedPosition = finalCenter + offset;

    // Output color
    vertexColor = vec4(r, g, b, 1.0);
}
```

### Connecting Position Output

In the Graph Material:
1. Add Code Node with vertex shader code
2. Connect `transformedPosition` output to a **Position** node
3. Set Position node to **Object Space**
4. This overrides the default vertex position

```
[Code Node] ──transformedPosition──> [Position (Object Space)]
```

## Step 3: Fragment Shader

Use the vertex outputs for fragment coloring:

```glsl
// In fragment code node or graph
input_vec4 vertexColor;

void main() {
    // Use the interpolated vertex color
    fragColor = vertexColor;
}
```

Or connect `vertexColor` output directly to the Base Color input in the graph.

## Step 4: Material Setup in Lens Studio

### Graph Material Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                      Graph Material                              │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  Code Node   │                                               │
│  │  (Vertex)    │──transformedPosition──> [Position]            │
│  │              │──vertexColor──────────> [Base Color]          │
│  └──────────────┘                                               │
│         ▲                                                        │
│         │                                                        │
│  [Float: size]                                                  │
│  [Float: blend]                                                 │
│  [Int: mode]                                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Parameter Naming Convention

Material parameters accessed via `material.mainPass.paramName` must match the shader input names:

| Shader Input | TypeScript Access |
|--------------|-------------------|
| `input_float blend;` | `pass.blend = 0.5;` |
| `input_int mode;` | `pass.mode = 2;` |
| `input_float cubeSize;` | `pass.cubeSize = 100.0;` |

## Data Packing Strategies

### Using Multiple UV Channels

Each UV channel provides 2 floats. With 3 channels (texture0, texture1, texture2), you get 6 floats per vertex:

```typescript
// TypeScript: Packing 6 values
meshBuilder.appendVerticesInterleaved([
    px, py, pz,           // position
    nx, ny, nz,           // normal
    value1, value2,       // texture0
    value3, value4,       // texture1
    value5, value6,       // texture2
]);

// Shader: Unpacking
vec2 uv0 = system.getSurfaceUVCoord0();  // value1, value2
vec2 uv1 = system.getSurfaceUVCoord1();  // value3, value4
vec2 uv2 = system.getSurfaceUVCoord2();  // value5, value6
```

### Example: RGB + Projected RGB (6 values)

```typescript
// Pack input RGB and projected RGB
this.meshBuilder.appendVerticesInterleaved([
    pos.x, pos.y, pos.z,
    normal.x, normal.y, normal.z,
    inputR, inputG,           // texture0
    inputB, projectedR,       // texture1
    projectedG, projectedB,   // texture2
]);
```

## Public API Pattern

Expose methods for runtime control without Inspector polling:

```typescript
@component
export class MyGenerator extends BaseScriptComponent {
    private static readonly MODE_COUNT = 6;
    private static readonly MODE_NAMES = ["Mode A", "Mode B", "Mode C", ...];

    @input statusText: Text;

    private _currentMode: number = 0;

    // Called by button/event callbacks
    public nextMode(): void {
        this._currentMode = (this._currentMode + 1) % MyGenerator.MODE_COUNT;
        this.updateMaterialParams();
        this.updateStatusText();
    }

    public prevMode(): void {
        this._currentMode = (this._currentMode - 1 + MyGenerator.MODE_COUNT)
                           % MyGenerator.MODE_COUNT;
        this.updateMaterialParams();
        this.updateStatusText();
    }

    public setModeIndex(index: number): void {
        this._currentMode = Math.max(0, Math.min(index, MyGenerator.MODE_COUNT - 1));
        this.updateMaterialParams();
        this.updateStatusText();
    }

    public getModeName(): string {
        return MyGenerator.MODE_NAMES[this._currentMode] || "Unknown";
    }

    private updateStatusText(): void {
        if (this.statusText) {
            this.statusText.text = this.getModeName();
        }
    }
}
```

### Connecting to Behavior Script / Events

1. Add your generator script to a SceneObject
2. Create a Behavior Script or Button component
3. Set callback to: `SceneObject.MyGenerator.nextMode`

## Performance Considerations

### GPU vs CPU Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **CPU (rebuild mesh)** | Full control, complex logic | Slow updates, memory allocation |
| **GPU (shader transform)** | Instant updates, no allocation | Limited to position transforms |

### When to Use This Workflow

**Good for:**
- Color space transformations
- Morphing between shapes
- Animated deformations
- Real-time parameter tweaking

**Not ideal for:**
- Changing topology (vertex/triangle count)
- Complex conditional geometry
- Non-affine transformations per-vertex

## Complete Example: Color Space Cube

### TypeScript (RGBCubeGenerator.ts)

```typescript
@component
export class RGBCubeGenerator extends BaseScriptComponent {
    @input material: Material;
    @input colorSpaceText: Text;
    @input cubeSize: number = 100;
    @input resolution: number = 8;

    private static readonly COLOR_SPACE_NAMES = [
        "RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV", "HSL"
    ];
    private static readonly COLOR_SPACE_COUNT = 6;

    private meshBuilder: MeshBuilder;
    private _colorSpaceTo: number = 0;
    private _blend: number = 1.0;

    onAwake() {
        this.meshBuilder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 },
            { name: "texture1", components: 2 },
        ]);
        this.meshBuilder.topology = MeshTopology.Triangles;
        this.meshBuilder.indexType = MeshIndexType.UInt16;

        this.generateCubeGrid();
    }

    private generateCubeGrid(): void {
        const res = this.resolution;
        for (let ri = 0; ri < res; ri++) {
            for (let gi = 0; gi < res; gi++) {
                for (let bi = 0; bi < res; bi++) {
                    const r = ri / (res - 1);
                    const g = gi / (res - 1);
                    const b = bi / (res - 1);
                    this.addSmallCube(r, g, b);
                }
            }
        }
        this.finalizeMesh();
    }

    private addSmallCube(r: number, g: number, b: number): void {
        // Add cube geometry at RGB position
        // Store r, g in texture0; b in texture1
        const center = new vec3(
            (r - 0.5) * this.cubeSize,
            (b - 0.5) * this.cubeSize,
            (g - 0.5) * this.cubeSize
        );

        // Add 8 vertices, 12 triangles for cube
        // Each vertex stores (r, g) in uv0, (b, 0) in uv1
    }

    public nextColorSpace(): void {
        this._colorSpaceTo = (this._colorSpaceTo + 1)
                            % RGBCubeGenerator.COLOR_SPACE_COUNT;
        this.updateMaterialParams();
        this.updateColorSpaceText();
    }

    private updateMaterialParams(): void {
        if (!this.material) return;
        const pass = this.material.mainPass;
        pass.colorSpaceTo = this._colorSpaceTo;
        pass.blend = this._blend;
        pass.cubeSize = this.cubeSize;
    }

    private updateColorSpaceText(): void {
        if (this.colorSpaceText) {
            this.colorSpaceText.text =
                RGBCubeGenerator.COLOR_SPACE_NAMES[this._colorSpaceTo];
        }
    }
}
```

### Vertex Shader (ColorSpaceTransform.js)

```glsl
input_float cubeSize;
input_int colorSpaceFrom;
input_int colorSpaceTo;
input_float blend;

output_vec3 transformedPosition;
output_vec4 vertexColor;

vec3 rgbSpacePosition(float r, float g, float b, float size) {
    return vec3((r - 0.5) * size, (b - 0.5) * size, (g - 0.5) * size);
}

vec3 colorSpacePosition(float r, float g, float b, int space, float size) {
    if (space == 0) return rgbSpacePosition(r, g, b, size);
    // ... other color space transformations
}

void main() {
    vec2 uv0 = system.getSurfaceUVCoord0();
    vec2 uv1 = system.getSurfaceUVCoord1();

    float r = uv0.x;
    float g = uv0.y;
    float b = uv1.x;

    vec3 vertexPos = system.getSurfacePositionObjectSpace();
    vec3 rgbCenter = rgbSpacePosition(r, g, b, cubeSize);

    vec3 fromCenter = colorSpacePosition(r, g, b, colorSpaceFrom, cubeSize);
    vec3 toCenter = colorSpacePosition(r, g, b, colorSpaceTo, cubeSize);

    float t = clamp(blend, 0.0, 1.0);
    vec3 targetCenter = mix(fromCenter, toCenter, t);

    vec3 offset = vertexPos - rgbCenter;
    transformedPosition = targetCenter + offset;
    vertexColor = vec4(r, g, b, 1.0);
}
```

## Troubleshooting

### Mesh Not Visible
- Check `updateMesh()` is called after adding vertices
- Verify material is assigned to RenderMeshVisual
- Check vertex winding order for backface culling

### Shader Parameters Not Updating
- Ensure parameter names match exactly (case-sensitive)
- Call `updateMaterialParams()` after changing values
- Verify material reference is valid

### Vertices in Wrong Position
- Check coordinate system (Y-up vs Z-up)
- Verify base position calculation matches mesh generation
- Ensure offset preservation: `finalPos = newCenter + (vertexPos - oldCenter)`

### UV Data Incorrect
- Verify `appendVerticesInterleaved` order matches attribute definitions
- Check component counts in MeshBuilder setup
- Use debug colors: `vertexColor = vec4(uv0.x, uv0.y, uv1.x, 1.0)`
