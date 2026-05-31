// ProxyInteractionDots.js
// Plain proxy rectangle. Keep this Code Node deliberately simple: one vec4
// input, object-space position output, premultiplied vertex color output.

input_vec4 FlatColor;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 posObject = system.getSurfacePositionObjectSpace();
    vec2 uv = system.getSurfaceUVCoord0();
    mat4 objectToWorld = system.getMatrixWorld();

    vec2 localExtent = abs(uv - 0.5) * 2.0;
    float edge = max(localExtent.x, localExtent.y);
    float rectMask = 1.0 - smoothstep(0.995, 1.0, edge);

    vec2 proxyScale = max(vec2(length(objectToWorld[0].xyz), length(objectToWorld[1].xyz)), vec2(0.001));
    vec2 dotGrid = max(floor(proxyScale * 1.05), vec2(2.0));
    vec2 cell = fract(uv * dotGrid) - 0.5;
    vec2 cellWorldSize = proxyScale / dotGrid;
    vec2 cellAspect = cellWorldSize / max(min(cellWorldSize.x, cellWorldSize.y), 0.001);
    float dotDistance = length(cell);
    dotDistance = length(cell * cellAspect);
    float dotMask = 1.0 - smoothstep(0.15, 0.22, dotDistance);
    float proxySelected = smoothstep(0.58, 0.72, FlatColor.a);
    float fillAlpha = FlatColor.a * (0.58 + dotMask * 0.24 + proxySelected * 0.08) * rectMask;
    float alpha = clamp(fillAlpha, 0.0, 1.0);

    vec3 baseColor = clamp(FlatColor.rgb, 0.0, 1.0);
    vec3 color = mix(baseColor, vec3(1.0), dotMask * 0.38 + proxySelected * 0.12);

    transformedPosition = posObject;
    vertexColor = vec4(color * alpha, alpha);
}
