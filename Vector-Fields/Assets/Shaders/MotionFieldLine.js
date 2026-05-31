// MotionFieldLine.js
// Unlit premultiplied color pass for generated planar line quads.

input_vec4 FlatColor;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec2 uv = system.getSurfaceUVCoord0();
    vec4 color = clamp(FlatColor, 0.0, 1.0);

    float across = abs(uv.y - 0.5) * 2.0;
    float feather = 1.0 - smoothstep(0.62, 1.0, across);
    float alpha = color.a * feather;

    transformedPosition = pos;
    vertexColor = vec4(color.rgb * alpha, alpha);
}
