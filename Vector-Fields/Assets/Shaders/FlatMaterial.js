// FlatMaterial.js
// Device-safe unlit color pass for generated MeshBuilder surfaces.

input_vec4 FlatColor;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec4 color = clamp(FlatColor, 0.0, 1.0);
    float alpha = color.a;

    transformedPosition = pos;
    vertexColor = vec4(color.rgb * alpha, alpha);
}
