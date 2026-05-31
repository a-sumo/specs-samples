// CarFlowStream.js — animated streamline ribbons for ONE baked car-flow slice.
// CarFlowStreamlines.ts builds the geometry for the current slice only and
// rebuilds it when the draggable slice changes; this shader just animates a
// flowing dash along each ribbon and colours it on the vivid Earth-wind-map
// speed ramp.
//
// Packed UVs (from CarFlowStreamlines.ts):
//   texture0 = (pathT, templatePhase)
//   texture1 = (speedColor, _)
//   texture2 = (crossSection, _)

input_float Time;
input_float PhaseSpeed;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec2 uv0 = system.getSurfaceUVCoord0();
    vec2 uv1 = system.getSurfaceUVCoord1();
    vec2 uv2 = system.getSurfaceUVCoord2();

    float pathT = clamp(uv0.x, 0.0, 1.0);
    float templatePhase = fract(uv0.y);
    float speedColor = clamp(uv1.x, 0.0, 1.0);
    float crossSection = clamp(uv2.x, -1.0, 1.0);

    // ribbon cross-section shading (soft tube)
    float radial = abs(crossSection);
    float edge = 1.0 - smoothstep(0.64, 1.0, radial);
    float shoulder = 1.0 - smoothstep(0.18, 0.92, radial);
    float core = 1.0 - smoothstep(0.0, 0.42, radial);

    // flowing dash travelling head-to-tail (flow direction inverted: pf = 1-pathT)
    float pf = 1.0 - pathT;
    float phase = fract(Time * PhaseSpeed + templatePhase);
    float behind = fract(phase - pf + 1.0);
    float wrapped = abs(fract(pf - phase + 0.5) - 0.5);
    float head = 1.0 - smoothstep(0.0, 0.06, wrapped);
    float wake = 1.0 - smoothstep(0.035, 0.58, behind);
    float flowOpacity = 0.30 + wake * 0.44 + head * 0.44;
    float tubeShade = edge * (0.72 + shoulder * 0.20 + core * 0.40);
    float alpha = clamp(tubeShade * flowOpacity, 0.0, 1.0);

    // colour: bright blue (slow) -> bright cyan (fast)
    float t = clamp((speedColor - 0.40) / 0.35, 0.0, 1.0);
    vec3 slow = vec3(0.10, 0.45, 1.00);   // bright blue
    vec3 fast = vec3(0.10, 0.95, 1.00);   // bright cyan
    vec3 color = mix(slow, fast, t);
    color += vec3(0.10, 0.12, 0.14) * core * head;   // bright comet core
    color = clamp(color, 0.0, 1.0);

    transformedPosition = pos;
    vertexColor = vec4(color * alpha, alpha);
}
