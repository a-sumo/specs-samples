// TubeTestShader.js
// Simple pass-through shader for CPU-generated tube geometry
// Positions are computed on CPU, this just passes them through with color

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    // Get CPU-computed position and normal
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec3 normal = system.getSurfaceNormalObjectSpace();

    // Pass through position unchanged
    transformedPosition = pos;

    // Color based on normal direction (visualizes tube shape)
    vec3 color = normal * 0.5 + 0.5;  // Remap -1..1 to 0..1

    vertexColor = vec4(color, 1.0);
}
