// VectorFieldTransform.js - Vertex shader for GPU vector field integration
//
// This shader integrates particles through a vector field on the GPU.
// The mesh is generated on the CPU with ribbon geometry for each trail.
//
// Vertex data encoding (from MeshBuilder):
//   position.x = seed.x
//   position.y = segmentIndex (0-1, where 0 = head, 1 = tail)
//   position.z = seed.z
//   normal.x   = seed.y
//   normal.y   = ribbonSide (-1 or 1)
//   normal.z   = lineIndex normalized (0-1)
//
// Uniforms (all uppercase, connected from material):
//   Preset, Speed, FieldScale, StepSize, Brightness, etc.
//
// The shader:
// 1. Decodes seed position and segmentIndex from vertex data
// 2. Integrates through vector field step-by-step (curved trails)
// 3. Outputs transformed position with ribbon offset
// 4. Colors based on preset and velocity

// ============================================================
// INPUTS
// ============================================================

input_float Time;
input_float Speed;
input_float FieldScale;
input_float StepSize;
input_float Preset;
input_float NumSteps;
input_float Brightness;
input_float FadeStart;
input_float FieldSize;
input_float LineWidth;
input_float TrailLength;

// ============================================================
// OUTPUTS
// ============================================================

output_vec3 transformedPosition;
output_vec4 vertexColor;

// ============================================================
// NOISE FUNCTIONS (Simplex 3D)
// ============================================================

vec3 mod289_v3(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289_v4(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289_v4(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
    vec2 C = vec2(1.0/6.0, 1.0/3.0);
    vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289_v3(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 curlNoise(vec3 p) {
    float e = 0.1;
    float n1 = snoise(p + vec3(0.0, e, 0.0));
    float n2 = snoise(p - vec3(0.0, e, 0.0));
    float n3 = snoise(p + vec3(0.0, 0.0, e));
    float n4 = snoise(p - vec3(0.0, 0.0, e));
    float n5 = snoise(p + vec3(e, 0.0, 0.0));
    float n6 = snoise(p - vec3(e, 0.0, 0.0));

    return vec3(
        (n2 - n1) - (n4 - n3),
        (n4 - n3) - (n6 - n5),
        (n6 - n5) - (n2 - n1)
    );
}

// ============================================================
// VECTOR FIELD PRESETS (matching HTML exactly)
// ============================================================

// 0: Curl Noise - smooth turbulence
vec3 fieldCurlNoise(vec3 p, float t, float scale) {
    vec3 curl = curlNoise(p * scale + t * 0.05);
    return normalize(curl + 0.001) * 0.4;
}

// 1: Tornado - upward spiral
vec3 fieldTornado(vec3 p, float t) {
    float r = length(p.xz);
    float angle = atan(p.z, p.x) + t * 0.5;  // Rotate with time
    float lift = 0.3 / (r + 0.5);
    float spin = 1.0 / (r + 0.3);

    return vec3(
        -sin(angle) * spin,
        lift + 0.1,
        cos(angle) * spin
    ) * 0.4;
}

// 2: Strange Attractor
vec3 fieldAttractor(vec3 p, float t) {
    float a = 0.2 + sin(t * 0.3) * 0.05;  // Animate parameters
    float b = 0.2 + cos(t * 0.2) * 0.05;
    float c = 5.7;
    return vec3(
        -p.y - p.z,
        p.x + a * p.y,
        b + p.z * (p.x - c)
    ) * 0.08;
}

// 3: Waves - sinusoidal interference
vec3 fieldWaves(vec3 p, float t, float scale) {
    float s = scale;
    return vec3(
        sin(p.y * s + t) * cos(p.z * s * 0.5),
        sin(p.z * s + t * 1.1) * cos(p.x * s * 0.5),
        sin(p.x * s + t * 0.9) * cos(p.y * s * 0.5)
    ) * 0.35;
}

// 4: Lorenz System
vec3 fieldLorenz(vec3 p, float t) {
    float sigma = 10.0 + sin(t * 0.2) * 1.0;  // Animate parameters
    float rho = 28.0 + cos(t * 0.15) * 2.0;
    float beta = 8.0 / 3.0;

    vec3 scaled = p * 0.1;
    return vec3(
        sigma * (scaled.y - scaled.x),
        scaled.x * (rho - scaled.z) - scaled.y,
        scaled.x * scaled.y - beta * scaled.z
    ) * 0.015;
}

// 5: Torus Flow
vec3 fieldTorus(vec3 p, float t) {
    float R = 2.0;
    float angle = atan(p.z, p.x) + t * 0.3;  // Rotate with time
    vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));

    float polAngle = atan(p.y, length(p.xz) - R) + t * 0.5;
    vec3 poloidal = vec3(
        cos(angle) * (-sin(polAngle)),
        cos(polAngle),
        sin(angle) * (-sin(polAngle))
    );

    return (tangent * 0.7 + poloidal * 0.3) * 0.4;
}

// 6: Sink/Source pattern
vec3 fieldSinkSource(vec3 p, float t) {
    vec3 v = vec3(0.0);

    // Animate source/sink positions
    vec3 source1 = vec3(2.0 * cos(t * 0.3), 0.0, 2.0 * sin(t * 0.3));
    vec3 sink1 = vec3(-2.0 * cos(t * 0.3), 0.0, -2.0 * sin(t * 0.3));
    vec3 source2 = vec3(0.0, 2.0 * cos(t * 0.4), 2.0 * sin(t * 0.4));
    vec3 sink2 = vec3(0.0, -2.0 * cos(t * 0.4), -2.0 * sin(t * 0.4));

    vec3 d1 = p - source1;
    vec3 d2 = p - sink1;
    vec3 d3 = p - source2;
    vec3 d4 = p - sink2;

    v += normalize(d1) / (dot(d1, d1) + 0.5);
    v -= normalize(d2) / (dot(d2, d2) + 0.5);
    v += normalize(d3) / (dot(d3, d3) + 0.5);
    v -= normalize(d4) / (dot(d4, d4) + 0.5);

    return v * 0.3;
}

// 7: Multi-scale Turbulence
vec3 fieldTurbulence(vec3 p, float t, float scale) {
    vec3 v = vec3(0.0);
    float amp = 1.0;
    float freq = scale;

    for (int i = 0; i < 4; i++) {
        v += curlNoise(p * freq + t * 0.05 * float(i + 1)) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }

    return normalize(v + 0.001) * 0.35;
}

// 8: Double Helix
vec3 fieldHelix(vec3 p, float t) {
    float helixRadius = 1.5;
    float twist = 2.0;

    float angle1 = p.y * twist + t;
    float angle2 = p.y * twist + t + 3.14159;

    vec3 center1 = vec3(cos(angle1) * helixRadius, 0.0, sin(angle1) * helixRadius);
    vec3 center2 = vec3(cos(angle2) * helixRadius, 0.0, sin(angle2) * helixRadius);

    vec3 toCenter1 = center1 - p;
    vec3 toCenter2 = center2 - p;

    float d1 = length(toCenter1.xz);
    float d2 = length(toCenter2.xz);

    vec3 attract = (toCenter1 / (d1 + 0.3) + toCenter2 / (d2 + 0.3)) * 0.3;
    vec3 up = vec3(0.0, 0.4, 0.0);

    return attract + up;
}

// 9: Galaxy - differential rotation
vec3 fieldGalaxy(vec3 p, float t) {
    float r = length(p.xz) + 0.1;
    float angle = atan(p.z, p.x);

    float omega = 1.0 / sqrt(r);

    float armPhase = angle - log(r) * 2.0 + t * 0.2;
    float armStrength = sin(armPhase * 2.0) * 0.3;

    vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));
    vec3 radial = vec3(cos(angle), 0.0, sin(angle));

    float flatten = -p.y * 0.5;

    return tangent * omega * 0.5 + radial * armStrength * 0.2 + vec3(0.0, flatten, 0.0);
}

// ============================================================
// FIELD SELECTOR
// ============================================================

vec3 getField(vec3 p, float t, int preset, float scale) {
    if (preset == 0) return fieldCurlNoise(p, t, scale);
    if (preset == 1) return fieldTornado(p, t);
    if (preset == 2) return fieldAttractor(p, t);
    if (preset == 3) return fieldWaves(p, t, scale);
    if (preset == 4) return fieldLorenz(p, t);
    if (preset == 5) return fieldTorus(p, t);
    if (preset == 6) return fieldSinkSource(p, t);
    if (preset == 7) return fieldTurbulence(p, t, scale);
    if (preset == 8) return fieldHelix(p, t);
    if (preset == 9) return fieldGalaxy(p, t);
    return fieldCurlNoise(p, t, scale);
}

// Float-based version (avoids int cast issues)
vec3 getFieldFloat(vec3 p, float t, float preset, float scale) {
    if (preset < 0.5) return fieldCurlNoise(p, t, scale);
    if (preset < 1.5) return fieldTornado(p, t);
    if (preset < 2.5) return fieldAttractor(p, t);
    if (preset < 3.5) return fieldWaves(p, t, scale);
    if (preset < 4.5) return fieldLorenz(p, t);
    if (preset < 5.5) return fieldTorus(p, t);
    if (preset < 6.5) return fieldSinkSource(p, t);
    if (preset < 7.5) return fieldTurbulence(p, t, scale);
    if (preset < 8.5) return fieldHelix(p, t);
    if (preset < 9.5) return fieldGalaxy(p, t);
    return fieldCurlNoise(p, t, scale);
}

// ============================================================
// COLOR BASED ON PRESET
// ============================================================

vec3 getPresetColor(int preset) {
    if (preset == 0) return vec3(0.2, 0.5, 1.0);      // Blue - curl
    if (preset == 1) return vec3(0.8, 0.4, 0.1);      // Orange - tornado
    if (preset == 2) return vec3(0.9, 0.2, 0.4);      // Red - attractor
    if (preset == 3) return vec3(0.2, 0.9, 0.6);      // Cyan - waves
    if (preset == 4) return vec3(0.7, 0.3, 0.9);      // Purple - lorenz
    if (preset == 5) return vec3(0.3, 0.8, 0.3);      // Green - torus
    if (preset == 6) return vec3(1.0, 0.8, 0.2);      // Yellow - sink/source
    if (preset == 7) return vec3(0.5, 0.5, 0.9);      // Light blue - turbulence
    if (preset == 8) return vec3(0.9, 0.5, 0.7);      // Pink - helix
    if (preset == 9) return vec3(0.8, 0.7, 0.4);      // Gold - galaxy
    return vec3(0.2, 0.5, 1.0);
}

vec3 getPresetColorFloat(float preset) {
    if (preset < 0.5) return vec3(0.2, 0.5, 1.0);      // Blue - curl
    if (preset < 1.5) return vec3(0.8, 0.4, 0.1);      // Orange - tornado
    if (preset < 2.5) return vec3(0.9, 0.2, 0.4);      // Red - attractor
    if (preset < 3.5) return vec3(0.2, 0.9, 0.6);      // Cyan - waves
    if (preset < 4.5) return vec3(0.7, 0.3, 0.9);      // Purple - lorenz
    if (preset < 5.5) return vec3(0.3, 0.8, 0.3);      // Green - torus
    if (preset < 6.5) return vec3(1.0, 0.8, 0.2);      // Yellow - sink/source
    if (preset < 7.5) return vec3(0.5, 0.5, 0.9);      // Light blue - turbulence
    if (preset < 8.5) return vec3(0.9, 0.5, 0.7);      // Pink - helix
    if (preset < 9.5) return vec3(0.8, 0.7, 0.4);      // Gold - galaxy
    return vec3(0.2, 0.5, 1.0);
}

// ============================================================
// MAIN - VERTEX SHADER
// ============================================================

void main() {
    // Get vertex data
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();

    float t = inPos.y;
    vec3 seedPosition = vec3(inPos.x, inNormal.x, inPos.z);
    float ribbonSide = inNormal.y;
    float lineIndex = inNormal.z * 400.0;

    // Use uniforms directly (all uppercase) with fallbacks
    float elapsedTime = system.getTimeElapsed();
    float uSpeed = Speed > 0.0 ? Speed : 1.0;
    float uScale = FieldScale > 0.0 ? FieldScale : 1.0;
    float uStepSize = StepSize > 0.0 ? StepSize : 0.1;
    float uBrightness = Brightness > 0.0 ? Brightness : 1.0;
    float uPreset = Preset;  // Float for comparison

    float animTime = elapsedTime * uSpeed;

    // Animate the seed position so heads move too
    float linePhase = lineIndex * 0.0137;
    float cycle = mod(animTime * 0.25 + linePhase, 5.0);
    vec3 animatedSeed = seedPosition + getFieldFloat(seedPosition, 0.0, uPreset, uScale) * cycle * 1.5;

    // Integrate step by step for CURVED trails
    vec3 pos = animatedSeed;
    int numSteps = int(t * 32.0);

    for (int i = 0; i < 32; i++) {
        if (i >= numSteps) break;
        vec3 dir = getFieldFloat(pos, animTime, uPreset, uScale);
        pos += dir * uStepSize;
    }

    // Get final velocity for coloring
    vec3 vel = getFieldFloat(pos, animTime, uPreset, uScale);

    // Simple ribbon offset
    vec3 finalPos = pos + vec3(ribbonSide * 0.02, 0.0, 0.0);

    // Color based on preset
    vec3 baseColor = getPresetColorFloat(uPreset);
    vec3 velColor = abs(normalize(vel + 0.001)) * 0.3;
    vec3 color = mix(baseColor, baseColor + velColor, 0.5);
    color *= uBrightness * (0.5 + t * 0.5);

    transformedPosition = finalPos;
    vertexColor = vec4(color, 1.0);
}
