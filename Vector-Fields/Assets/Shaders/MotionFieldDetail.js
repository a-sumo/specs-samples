// MotionFieldDetail.js
// Procedural planar advection detail for MotionFieldPlane.
//
// FlatColor packs live state:
//   x = handle U in 0..1
//   y = handle V in 0..1
//   z = wake strength in 0..1
//   w = overall opacity

input_vec4 FlatColor;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec2 uv = system.getSurfaceUVCoord0();
    float time = system.getTimeElapsed();

    vec2 handleUv = clamp(FlatColor.xy, 0.0, 1.0);
    float wakeStrength = clamp(FlatColor.z, 0.0, 1.0);
    float opacity = clamp(FlatColor.w, 0.0, 1.0);

    vec2 p = uv - 0.5;
    vec2 hp = handleUv - 0.5;
    vec2 aspect = vec2(1.7142857, 1.0);
    vec2 d = (p - hp) * aspect;
    float r = length(d);
    float nearHandle = 1.0 - smoothstep(0.02, 0.24, r);
    float wakeFalloff = exp(-r * 5.2) * wakeStrength;

    vec2 swirlDir = vec2(-d.y, d.x) / max(0.045, r);
    vec2 baseDir = normalize(vec2(1.0, 0.10 * sin(uv.x * 8.0 + time * 0.72)));
    vec2 fieldDir = normalize(baseDir + swirlDir * wakeFalloff * 0.72 + vec2(0.0, sin((uv.x + uv.y) * 7.0 + time) * 0.045));
    float speed = clamp(length(baseDir + swirlDir * wakeFalloff * 1.25), 0.0, 2.0) * 0.5;

    vec2 warped = uv;
    warped.y += sin(uv.x * 10.0 + time * 0.74) * 0.018;
    warped.y += sin(uv.x * 21.0 - time * 0.52 + uv.y * 6.0) * 0.007;
    warped += swirlDir * wakeFalloff * 0.035;

    float linePhase = fract(warped.y * 24.0 + warped.x * 1.15 + time * 0.18);
    float lineDist = abs(linePhase - 0.5);
    float streamLine = 1.0 - smoothstep(0.020, 0.052, lineDist);

    float finePhase = fract(warped.y * 52.0 - warped.x * 1.5 + time * 0.11);
    float fineDist = abs(finePhase - 0.5);
    float fineLine = 1.0 - smoothstep(0.012, 0.032, fineDist);

    float pulsePhase = fract(warped.x * 5.4 - time * 0.42 + warped.y * 0.8);
    float pulseDist = abs(pulsePhase - 0.5);
    float pulse = 1.0 - smoothstep(0.035, 0.18, pulseDist);

    float ringPhase = fract(r * 13.0 - time * 0.82);
    float ring = (1.0 - smoothstep(0.025, 0.080, abs(ringPhase - 0.5))) * wakeFalloff;

    vec2 gridUv = uv * vec2(12.0, 7.0);
    vec2 cell = fract(gridUv) - 0.5;
    vec2 dir = normalize(fieldDir + vec2(0.0001, 0.0));
    vec2 side = vec2(-dir.y, dir.x);
    vec2 local = vec2(dot(cell, dir), dot(cell, side));
    float shaft = (1.0 - smoothstep(0.018, 0.046, abs(local.y))) *
                  smoothstep(-0.34, -0.18, local.x) *
                  (1.0 - smoothstep(0.02, 0.20, local.x));
    float headWidth = mix(0.13, 0.02, smoothstep(0.06, 0.34, local.x));
    float head = (1.0 - smoothstep(headWidth, headWidth + 0.035, abs(local.y))) *
                 smoothstep(0.02, 0.09, local.x) *
                 (1.0 - smoothstep(0.28, 0.38, local.x));
    float arrows = clamp(shaft + head, 0.0, 1.0);

    float border = smoothstep(0.0, 0.03, uv.x) * smoothstep(0.0, 0.03, uv.y) *
                   smoothstep(0.0, 0.03, 1.0 - uv.x) * smoothstep(0.0, 0.03, 1.0 - uv.y);

    float gridX = 1.0 - smoothstep(0.004, 0.014, abs(fract(uv.x * 12.0) - 0.5));
    float gridY = 1.0 - smoothstep(0.004, 0.014, abs(fract(uv.y * 7.0) - 0.5));
    float grid = (gridX + gridY) * 0.18;

    vec3 base = vec3(0.62, 0.66, 0.78) * (0.30 + 0.22 * speed);
    vec3 lineColor = vec3(1.00, 1.00, 0.96);
    vec3 highColor = vec3(0.34, 0.62, 1.00);
    vec3 warmTip = vec3(1.00, 0.72, 0.52);
    vec3 color = base;
    color += lineColor * (streamLine * (0.34 + pulse * 0.46) + fineLine * 0.115);
    color += highColor * (arrows * 0.52 + ring * 0.78 + nearHandle * 0.32);
    color += warmTip * (pulse * streamLine * wakeFalloff * 0.58);
    color += vec3(0.94, 0.96, 1.00) * grid;
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.34);
    color = clamp(color * 1.34 + vec3(0.11, 0.12, 0.16), 0.0, 1.0) * border;

    float alphaSignal = 0.28 + streamLine * 0.34 + fineLine * 0.16 + arrows * 0.30 + ring * 0.42 + nearHandle * 0.26 + grid * 0.24;
    float alpha = clamp(alphaSignal * opacity * border, 0.0, 0.96);
    alpha = max(alpha, 0.18 * opacity * border);

    pos.y += (streamLine * 0.018 + ring * 0.035 + nearHandle * 0.025) * opacity;

    transformedPosition = pos;
    vertexColor = vec4(color * alpha, alpha);
}
