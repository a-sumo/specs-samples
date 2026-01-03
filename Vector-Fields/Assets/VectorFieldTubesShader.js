// VectorFieldTubesShader.js
// Integrates a vector field to compute tube positions on the GPU
//
// Vertex encoding:
//   position.z = t (0-1, maps to step index for integration)
//   normal.z = 1 for tube vertices, 0 for cap centers
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startY) starting position of this tube

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float Time;
input_float FieldScale;
input_int Preset;

output_vec3 transformedPosition;
output_vec4 vertexColor;

// ========================================
// NOISE FUNCTIONS
// ========================================
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
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

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 curlNoise(vec3 p) {
    float e = 0.1;
    float n1 = snoise(p + vec3(e, 0.0, 0.0));
    float n2 = snoise(p - vec3(e, 0.0, 0.0));
    float n3 = snoise(p + vec3(0.0, e, 0.0));
    float n4 = snoise(p - vec3(0.0, e, 0.0));
    float n5 = snoise(p + vec3(0.0, 0.0, e));
    float n6 = snoise(p - vec3(0.0, 0.0, e));

    float x = (n4 - n3) - (n6 - n5);
    float y = (n6 - n5) - (n2 - n1);
    float z = (n2 - n1) - (n4 - n3);

    return normalize(vec3(x, y, z));
}

// ========================================
// VECTOR FIELD PRESETS
// ========================================

// 0: Curl Noise - smooth turbulent flow
vec3 fieldCurlNoise(vec3 p, float t) {
    return curlNoise(p * FieldScale + vec3(0.0, t * 0.1, 0.0));
}

// 1: Tornado - spiral vortex
vec3 fieldTornado(vec3 p, float t) {
    float r = length(p.xz);
    float angle = atan(p.z, p.x);
    vec3 tangent = vec3(-p.z, 0.0, p.x);
    if (r > 0.001) tangent /= r;
    float upward = 1.0 / (1.0 + r * 0.5);
    float swirl = 1.0 - upward * 0.5;
    return normalize(tangent * swirl + vec3(0.0, upward, 0.0));
}

// 2: Attractor - pulled toward moving point
vec3 fieldAttractor(vec3 p, float t) {
    vec3 attractor = vec3(sin(t) * 2.0, cos(t * 0.7) * 2.0, sin(t * 0.5) * 2.0);
    vec3 toAttractor = attractor - p;
    float dist = length(toAttractor);
    if (dist < 0.001) return vec3(0.0, 1.0, 0.0);
    return normalize(toAttractor);
}

// 3: Waves - sinusoidal pattern
vec3 fieldWaves(vec3 p, float t) {
    float wave = sin(p.x * FieldScale + t) * cos(p.z * FieldScale + t * 0.7);
    return normalize(vec3(
        cos(p.z * FieldScale + t),
        wave,
        sin(p.x * FieldScale + t)
    ));
}

// 4: Lorenz - chaotic attractor
vec3 fieldLorenz(vec3 p, float t) {
    float sigma = 10.0;
    float rho = 28.0;
    float beta = 8.0 / 3.0;
    vec3 scaled = p * 0.1;
    float dx = sigma * (scaled.y - scaled.x);
    float dy = scaled.x * (rho - scaled.z) - scaled.y;
    float dz = scaled.x * scaled.y - beta * scaled.z;
    return normalize(vec3(dx, dy, dz));
}

// 5: Helix - double spiral
vec3 fieldHelix(vec3 p, float t) {
    float angle = p.y * FieldScale + t;
    return normalize(vec3(cos(angle), 1.0, sin(angle)));
}

vec3 vectorField(vec3 pos, float t) {
    if (Preset == 0) return fieldCurlNoise(pos, t);
    if (Preset == 1) return fieldTornado(pos, t);
    if (Preset == 2) return fieldAttractor(pos, t);
    if (Preset == 3) return fieldWaves(pos, t);
    if (Preset == 4) return fieldLorenz(pos, t);
    if (Preset == 5) return fieldHelix(pos, t);
    return fieldCurlNoise(pos, t);
}

void main() {
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();

    // Decode vertex data
    float t = inPos.z;
    float localX = inUV0.x;
    float localY = inUV0.y;
    float startX = inUV1.x;
    float startY = inUV1.y;
    float radius = TubeRadius;

    // Cap centers
    bool isCapCenter = (inNormal.z < 0.5);
    if (isCapCenter) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;
    }

    // Calculate which integration step this vertex is at
    int stepIndex = int(t * NumSteps + 0.5);
    float time = Time;

    // ========================================
    // INTEGRATE VECTOR FIELD
    // Start at (startX, 0, startY) and step through field
    // ========================================
    vec3 pos = vec3(startX, 0.0, startY);
    vec3 prevPos = pos;

    for (int i = 0; i < 64; i++) {
        if (i >= stepIndex) break;

        prevPos = pos;
        vec3 vel = vectorField(pos, time);
        pos = pos + vel * StepSize;
    }

    // ========================================
    // COMPUTE TANGENT (direction of travel)
    // ========================================
    vec3 tangent;
    if (stepIndex > 0) {
        tangent = normalize(pos - prevPos);
    } else {
        tangent = normalize(vectorField(pos, time));
    }

    // ========================================
    // BUILD PERPENDICULAR FRAME
    // ========================================
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 frameNormal = normalize(cross(up, tangent));
    if (length(frameNormal) < 0.001) {
        frameNormal = vec3(1.0, 0.0, 0.0);
    }
    vec3 frameBinormal = normalize(cross(tangent, frameNormal));

    // ========================================
    // PLACE TUBE CROSS-SECTION
    // ========================================
    vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
    vec3 finalPos = pos + offset;

    // Color based on progress along tube
    vec3 color = vec3(
        localX * 0.5 + 0.5,
        localY * 0.5 + 0.5,
        t
    );

    transformedPosition = finalPos;
    vertexColor = vec4(color, 1.0);
}
