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
    float tubeShade = edge * (0.72 + shoulder * 0.20 + core * 0.40);
    float flowOpacity = 0.30 + wake * 0.44 + head * 0.44;
    float alpha = clamp(tubeShade * flowOpacity, 0.0, 1.0);

    float t = smoothstep(0.0, 1.0, speedColor);
    vec3 calm = vec3(0.18, 0.50, 1.00);
    vec3 breeze = vec3(0.06, 0.92, 1.00);
    vec3 strong = vec3(0.12, 1.00, 0.62);
    vec3 gale = vec3(1.00, 0.96, 0.12);
    vec3 storm = vec3(1.00, 0.44, 0.05);
    vec3 severe = vec3(1.00, 0.08, 0.08);
    vec3 color = mix(calm, breeze, smoothstep(0.00, 0.22, t));
    color = mix(color, strong, smoothstep(0.18, 0.42, t));
    color = mix(color, gale, smoothstep(0.38, 0.66, t));
    color = mix(color, storm, smoothstep(0.62, 0.84, t));
    color = mix(color, severe, smoothstep(0.80, 1.00, t));
    color = clamp(color * 1.28 + vec3(0.055, 0.070, 0.095), 0.0, 1.0);
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = clamp(mix(vec3(luma), color, 1.25), 0.0, 1.0);
    color *= 0.98 + core * 0.28;
    color += vec3(0.12, 0.13, 0.14) * core * head;
    color = clamp(color, 0.0, 1.0);

    vec3 nrm = normalize(pos + vec3(0.0, 0.0, 0.0001));
    float wave = sin(Time * 1.2 + templatePhase * 6.2831853) * head;
    pos += nrm * (0.12 + wave * Displace * (0.4 + 0.6 * speedColor));

    transformedPosition = pos;
    vertexColor = vec4(color * alpha, alpha);
}
