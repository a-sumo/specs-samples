// VectorFieldTubesShader.js
// Integrates a vector field to compute tube positions on the GPU
// Based on vector-field-trails.html approach
//
// Vertex encoding:
//   position.z = t (0-1, maps to step index for integration)
//   normal.z = 1 for tube vertices, 0 for cap centers
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startZ) starting position in XZ plane
//   texture2.x = startY starting Y position

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float FieldScale;
input_int Preset;
input_vec3 TargetPosition;
input_float Time;
input_float FlowSpeed;

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

// ========================================
// VECTOR FIELD PRESETS
// ========================================

// 0: Expansion - radial waves expanding from target with 3D oscillation
vec3 fieldExpansion(vec3 p) {
    vec3 rel = p - TargetPosition;
    float dist = length(rel);
    float s = FieldScale;

    // Radial direction with sinusoidal modulation
    vec3 radial = (dist > 0.001) ? rel / dist : vec3(0.0, 1.0, 0.0);
    float wave = sin(dist * s * 2.0) * 0.5 + 0.5;

    // Add perpendicular oscillation for 3D interest
    vec3 perp = vec3(
        sin(rel.y * s) * cos(rel.z * s),
        sin(rel.z * s) * cos(rel.x * s),
        sin(rel.x * s) * cos(rel.y * s)
    );

    return (radial * wave + perp * 0.3) * 0.4;
}

// 1: Contraction - spiraling inward toward target
vec3 fieldContraction(vec3 p) {
    vec3 rel = p - TargetPosition;
    float dist = length(rel);
    float s = FieldScale;

    // Inward direction
    vec3 inward = (dist > 0.001) ? -rel / dist : vec3(0.0);
    float wave = sin(dist * s * 2.0) * 0.3 + 0.7;

    // Add spiral/twist component
    vec3 twist = vec3(
        sin(rel.z * s + rel.y * s * 0.5),
        cos(rel.x * s + rel.z * s * 0.5),
        sin(rel.y * s + rel.x * s * 0.5)
    );

    return (inward * wave + twist * 0.25) * 0.4;
}

// 2: Circulation - 3D swirling vortex around target
vec3 fieldCirculation(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale;

    // Rotation in XZ plane
    float distXZ = length(vec2(rel.x, rel.z));
    vec3 tangentXZ = (distXZ > 0.001) ? vec3(-rel.z, 0.0, rel.x) / distXZ : vec3(1.0, 0.0, 0.0);

    // Rotation in XY plane
    float distXY = length(vec2(rel.x, rel.y));
    vec3 tangentXY = (distXY > 0.001) ? vec3(-rel.y, rel.x, 0.0) / distXY : vec3(0.0, 1.0, 0.0);

    // Combine rotations with distance-based mixing and wave modulation
    float wave = sin(length(rel) * s) * 0.5 + 0.5;
    vec3 combined = mix(tangentXZ, tangentXY, sin(rel.y * s) * 0.5 + 0.5);

    // Add vertical oscillation
    combined.y += sin(rel.x * s) * cos(rel.z * s) * 0.4;

    return combined * wave * 0.45;
}

// 3: Waves - sinusoidal interference centered on target
vec3 fieldWaves(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale;
    return vec3(
        sin(rel.y * s) * cos(rel.z * s * 0.5),
        sin(rel.z * s) * cos(rel.x * s * 0.5),
        sin(rel.x * s) * cos(rel.y * s * 0.5)
    ) * 0.35;
}

// 4: Vortex - rotating cells centered on target
vec3 fieldVortex(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale * 0.7;

    float vx = sin(rel.z * s) * cos(rel.y * s * 0.5);
    float vy = sin(rel.x * s) * cos(rel.z * s * 0.5);
    float vz = sin(rel.y * s) * cos(rel.x * s * 0.5);

    float angle = atan(rel.z, rel.x);
    vec3 spin = vec3(-sin(angle), 0.0, cos(angle)) * 0.3;

    return (vec3(vx, vy, vz) + spin) * 0.35;
}

vec3 getField(vec3 p) {
    if (Preset == 0) return fieldExpansion(p);
    if (Preset == 1) return fieldContraction(p);
    if (Preset == 2) return fieldCirculation(p);
    if (Preset == 3) return fieldWaves(p);
    if (Preset == 4) return fieldVortex(p);
    return fieldWaves(p);
}

// ========================================
// COLOR BASED ON VELOCITY
// ========================================
vec3 getColor(vec3 vel, float t) {
    vec3 baseColor;
    if (Preset == 0) baseColor = vec3(0.9, 0.5, 0.2);      // Orange - expansion
    else if (Preset == 1) baseColor = vec3(0.3, 0.5, 0.9); // Blue - contraction
    else if (Preset == 2) baseColor = vec3(0.8, 0.3, 0.8); // Purple - circulation
    else if (Preset == 3) baseColor = vec3(0.2, 0.9, 0.6); // Green - waves
    else baseColor = vec3(0.9, 0.3, 0.5);                  // Pink - vortex

    vec3 velColor = abs(normalize(vel + 0.001)) * 0.3;
    return mix(baseColor, baseColor + velColor, 0.5);
}

void main() {
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();
    vec2 inUV2 = system.getSurfaceUVCoord2();

    // Decode vertex data
    float t = inPos.z;
    float localX = inUV0.x;
    float localY = inUV0.y;
    float startX = inUV1.x;
    float startZ = inUV1.y;
    float startY = inUV2.x;
    float radius = TubeRadius;

    // Cap centers
    bool isCapCenter = (inNormal.z < 0.5);
    if (isCapCenter) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;
    }

    // Calculate step index
    int stepIndex = int(t * NumSteps + 0.5);

    // ========================================
    // START AT 3D GRID POSITION
    // ========================================
    vec3 pos = vec3(startX, startY, startZ);
    vec3 prevPos = pos;

    // ========================================
    // TIME-BASED FLOW: Pre-integrate to shift starting point
    // This makes the tube "flow" along the field line
    // Wraps around to create continuous looping flow
    // ========================================
    float maxPreSteps = 32.0; // Loop after this many steps

    // Per-tube phase offset based on starting position (0 to maxPreSteps)
    float tubePhase = fract(sin(dot(vec3(startX, startY, startZ), vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;

    float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
    int preSteps = int(flowOffset);
    float fractional = fract(flowOffset);

    // Pre-integrate to move the effective starting position
    for (int i = 0; i < 32; i++) {
        if (i >= preSteps) break;
        pos += getField(pos) * StepSize;
    }
    // Fractional step for smooth motion
    pos += getField(pos) * StepSize * fractional;
    prevPos = pos;

    // Growth + fade near wrap point for smoother transition
    float growZone = 10.0; // Steps to grow over
    float shrinkZone = 18.0; // Steps to shrink over (larger = fade out earlier, before jitter)

    // Growth factor: 0 at wrap point, 1 when fully grown
    float growthFactor = smoothstep(0.0, growZone, flowOffset);

    // Shrink factor: 1 normally, 0 as approaching wrap (starts earlier)
    float shrinkFactor = smoothstep(0.0, shrinkZone, maxPreSteps - flowOffset);

    // BIRTH: Tube grows from start (t=0) toward end (t=1)
    // Clamp t to growth factor - vertices beyond are collapsed to the growing tip
    float clampedT = min(t, growthFactor);
    int clampedStepIndex = int(clampedT * NumSteps + 0.5);

    // DEATH: Fade from end (t=1) toward start (t=0)
    // Vertices with high t fade out first
    float deathFade = 1.0 - smoothstep(shrinkFactor - 0.15, shrinkFactor, t);

    // Birth fade: vertices fade in as they become part of the visible tube
    float birthFade = smoothstep(growthFactor - 0.15, growthFactor, t);
    birthFade = 1.0 - birthFade; // Invert: visible when t < growthFactor

    // Combined opacity
    float flowFade = birthFade * deathFade;

    // ========================================
    // INTEGRATE THROUGH VECTOR FIELD
    // ========================================
    for (int i = 0; i < 64; i++) {
        if (i >= clampedStepIndex) break;
        prevPos = pos;
        pos += getField(pos) * StepSize;
    }

    // ========================================
    // COMPUTE TANGENT (direction of travel)
    // ========================================
    vec3 vel = getField(pos);
    vec3 tangent;
    if (stepIndex > 0 && length(pos - prevPos) > 0.0001) {
        tangent = normalize(pos - prevPos);
    } else {
        tangent = normalize(vel + vec3(0.0, 0.001, 0.0));
    }

    // ========================================
    // BUILD PERPENDICULAR FRAME
    // ========================================
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 frameNormal = cross(up, tangent);
    float fnLen = length(frameNormal);
    if (fnLen < 0.001) {
        frameNormal = vec3(1.0, 0.0, 0.0);
    } else {
        frameNormal /= fnLen;
    }
    vec3 frameBinormal = normalize(cross(tangent, frameNormal));

    // ========================================
    // PLACE TUBE CROSS-SECTION
    // ========================================
    vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
    vec3 finalPos = pos + offset;

    vec3 color = getColor(vel, t);

    transformedPosition = finalPos;
    vertexColor = vec4(color, flowFade);
}
