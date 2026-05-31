// CarFlowStream.js — animated streamline ribbons for ONE baked car-flow slice.
// CarFlowStreamlines.ts builds the geometry for the current slice only and
// rebuilds it when the draggable slice changes. This shader animates a smooth
// green wind-tunnel pulse from the car's nose toward its rear.
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

    // Soft tube shading: two smoothsteps, no lighting branch.
    float radial = abs(crossSection);
    float edge = 1.0 - smoothstep(0.70, 1.0, radial);
    float core = 1.0 - smoothstep(0.0, 0.42, radial);

    // Path data runs left-to-right in the image. Use 1-pathT so the visible
    // wave travels right-to-left. Avoid trig/pow here; this runs per fragment.
    float pf = 1.0 - pathT;
    float phase = fract(Time * PhaseSpeed + templatePhase);
    float band = fract(pf * 3.15 - phase + 1.0);
    float bandDist = abs(band - 0.5) * 2.0;
    float pulse = 1.0 - smoothstep(0.10, 0.92, bandDist);
    float glint = 1.0 - smoothstep(0.00, 0.20, bandDist);
    float flowOpacity = 0.22 + pulse * 0.40 + glint * 0.12;
    float tubeShade = edge * (0.82 + core * 0.32);
    float alpha = clamp(tubeShade * flowOpacity * (0.82 + speedColor * 0.18), 0.0, 0.76);

    // Smooth single-family green ramp. The value change is continuous so the
    // streamlines read as airflow, not chopped bars.
    float t = smoothstep(0.16, 0.96, speedColor);
    vec3 slow = vec3(0.18, 0.76, 0.12);
    vec3 fast = vec3(0.72, 1.00, 0.24);
    vec3 color = mix(slow, fast, t);
    color += vec3(0.14, 0.18, 0.05) * core * (0.28 + glint * 0.72);
    color = clamp(color, 0.0, 1.0);

    transformedPosition = pos;
    vertexColor = vec4(color * alpha, alpha);
}
