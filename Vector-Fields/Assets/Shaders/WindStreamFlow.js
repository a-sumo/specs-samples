// WindStreamFlow - animated globe wind ribbons.
//
// Consumes packed UVs from WindStreamlines.ts:
//   texture0 = (pathT, templatePhase)
//   texture1 = (speedColor, speedRatioRaw)
//   texture2 = (crossSection, capRadial)
//
// The output is premultiplied because WindStreamFlow.mat uses
// PremultipliedAlpha blending.

input_float Time;
input_float PhaseSpeed;
input_float Displace;

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
    float capMask = step(0.0, uv2.y);
    float radial = clamp(mix(abs(crossSection), uv2.y, capMask), 0.0, 1.0);

    float phase = fract(Time * PhaseSpeed + templatePhase);
    float behind = fract(phase - pathT + 1.0);
    float wrappedDistance = abs(fract(pathT - phase + 0.5) - 0.5);

    float edge = 1.0 - smoothstep(0.64, 1.0, radial);
    float shoulder = 1.0 - smoothstep(0.18, 0.92, radial);
    float core = 1.0 - smoothstep(0.0, 0.42, radial);

    float head = 1.0 - smoothstep(0.0, 0.060, wrappedDistance);
    float wake = 1.0 - smoothstep(0.035, 0.58, behind);
    float tubeShade = edge * (0.60 + shoulder * 0.18 + core * 0.34);
    float flowOpacity = 0.16 + wake * 0.34 + head * 0.34;
    float alpha = clamp(tubeShade * flowOpacity, 0.0, 0.92);

    float t = smoothstep(0.0, 1.0, speedColor);
    vec3 calm = vec3(0.04, 0.20, 0.46);
    vec3 breeze = vec3(0.00, 0.56, 0.90);
    vec3 strong = vec3(0.00, 0.78, 0.46);
    vec3 gale = vec3(0.96, 0.88, 0.18);
    vec3 storm = vec3(0.96, 0.36, 0.10);
    vec3 severe = vec3(0.82, 0.06, 0.04);
    vec3 color = mix(calm, breeze, smoothstep(0.00, 0.22, t));
    color = mix(color, strong, smoothstep(0.18, 0.42, t));
    color = mix(color, gale, smoothstep(0.38, 0.66, t));
    color = mix(color, storm, smoothstep(0.62, 0.84, t));
    color = mix(color, severe, smoothstep(0.80, 1.00, t));
    color *= 0.82 + core * 0.24;
    color += vec3(0.08, 0.09, 0.10) * core * head;

    vec3 nrm = normalize(pos + vec3(0.0, 0.0, 0.0001));
    float wave = sin(Time * 1.2 + templatePhase * 6.2831853) * head;
    pos += nrm * (0.12 + wave * Displace * (0.4 + 0.6 * speedColor));

    transformedPosition = pos;
    vertexColor = vec4(color * alpha, alpha);
}
