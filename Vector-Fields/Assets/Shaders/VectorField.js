// VectorFieldTubesShader.js
// Integrates a vector field to compute tube positions on the GPU
//
// Vertex encoding (all data in UVs to avoid distortion):
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startZ) starting position in XZ plane
//   texture2 = (startY, t) starting Y position and t parameter
//   texture3 = (geoType) geometry type:
//     0 = trail cap center (flat)
//     1 = trail body (flow animation + integration)
//     3 = particle (short trail - flow animation + integration, minimal geometry)
//     4 = arrow body (static, orient by field)
//     5 = arrow cone (static, orient by field)
//     6 = arrow cap center (static)

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float FieldScale;
input_int Preset;
input_vec3 TargetPosition;
input_float Time;
input_float FlowSpeed;
input_float ArrowScale;
input_float ConeLength;
input_float ConeRadius;

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
// PLASMA COLOR GRADIENT
// ========================================

// Plasma: Deep blue -> Purple -> Magenta -> Pink -> White
vec3 plasmaGradient(float value) {
    vec3 c0 = vec3(0.05, 0.0, 0.2);  // Deep blue-black
    vec3 c1 = vec3(0.3, 0.0, 0.5);   // Purple
    vec3 c2 = vec3(0.7, 0.0, 0.7);   // Magenta
    vec3 c3 = vec3(0.95, 0.3, 0.6);  // Hot pink
    vec3 c4 = vec3(1.0, 0.85, 0.5);  // Peach/yellow
    vec3 c5 = vec3(1.0, 1.0, 0.95);  // Near white

    if (value < 0.2) return mix(c0, c1, value * 5.0);
    else if (value < 0.4) return mix(c1, c2, (value - 0.2) * 5.0);
    else if (value < 0.6) return mix(c2, c3, (value - 0.4) * 5.0);
    else if (value < 0.8) return mix(c3, c4, (value - 0.6) * 5.0);
    else return mix(c4, c5, (value - 0.8) * 5.0);
}

vec3 getColor(vec3 vel, float t) {
    float speed = length(vel);
    float intensity = min(1.0, speed * 2.5);

    return plasmaGradient(intensity);
}

void main() {
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();
    vec2 inUV2 = system.getSurfaceUVCoord2();
    vec2 inUV3 = system.getSurfaceUVCoord3();

    // Decode vertex data from UVs (position/normal get distorted)
    float localX = inUV0.x;
    float localY = inUV0.y;
    float startX = inUV1.x;
    float startZ = inUV1.y;
    float startY = inUV2.x;
    float t = inUV2.y;
    float geoType = inUV3.x;
    float radius = TubeRadius;

    // Geometry type: 0=trailCap, 1=trail, 3=particle (short trail), 4=arrow, 5=arrowCone, 6=arrowCap
    bool isTrailCap = (geoType < 0.5);
    bool isArrow = (geoType > 3.5 && geoType < 4.5);
    bool isArrowCone = (geoType > 4.5 && geoType < 5.5);
    bool isArrowCap = (geoType > 5.5);
    bool isArrowMode = isArrow || isArrowCone || isArrowCap;

    // Cap centers: collapse to point
    if (isTrailCap || isArrowCap) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;
    }

    // Calculate step index for trails (clamp t, cone/arrow tip extends beyond 1)
    float tClamped = min(t, 1.0);
    int stepIndex = int(tClamped * NumSteps + 0.5);

    // ========================================
    // START AT 3D GRID POSITION
    // ========================================
    vec3 startPos = vec3(startX, startY, startZ);
    vec3 pos = startPos;
    vec3 prevPos = pos;

    // Output variables
    vec3 finalPos = startPos;
    vec3 color = vec3(1.0);
    float alpha = 1.0;

    // ========================================
    // ARROW MODE: Static arrows oriented by field
    // No integration - just sample field once, orient, scale
    // ========================================
    if (isArrowMode) {
        vec3 fieldVec = getField(startPos);
        float magnitude = length(fieldVec);
        vec3 tangent = (magnitude > 0.001) ? fieldVec / magnitude : vec3(0.0, 1.0, 0.0);

        // Scale arrow length by field magnitude
        float arrowLength = magnitude * ArrowScale;

        // Build perpendicular frame
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 frameNormal = cross(up, tangent);
        float fnLen = length(frameNormal);
        if (fnLen < 0.001) {
            frameNormal = vec3(1.0, 0.0, 0.0);
        } else {
            frameNormal /= fnLen;
        }
        vec3 frameBinormal = normalize(cross(tangent, frameNormal));

        // Position along straight arrow (t=0 is base, t=1 is before cone, t=2 is cone tip)
        float alongArrow = tClamped * arrowLength;
        vec3 arrowPos = startPos + tangent * alongArrow;

        // Cross-section offset
        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = arrowPos + offset;

        // Cone tip: t=2 marks the tip, use ConeLength uniform for height
        if (isArrowCone && t > 1.5) {
            float coneHeight = ConeLength * TubeRadius;
            finalPos = startPos + tangent * (arrowLength + coneHeight);
        }

        color = getColor(fieldVec, tClamped);
        if (isArrowCone) {
            color = mix(color, vec3(1.0), 0.2);
        }
        alpha = 1.0;

    // ========================================
    // TRAIL & PARTICLE MODE: Flowing tubes with integration
    // Particles are just short trails (minimal geometry, same animation)
    // ========================================
    } else {
        // TIME-BASED FLOW: Pre-integrate to shift starting point
        float maxPreSteps = 32.0;
        float tubePhase = fract(sin(dot(startPos, vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;
        float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
        int preSteps = int(flowOffset);
        float fractional = fract(flowOffset);

        // Pre-integrate to move the effective starting position
        for (int i = 0; i < 32; i++) {
            if (i >= preSteps) break;
            pos += getField(pos) * StepSize;
        }
        pos += getField(pos) * StepSize * fractional;
        prevPos = pos;

        // Growth + fade near wrap point
        float growZone = 10.0;
        float shrinkZone = 18.0;
        float growthFactor = smoothstep(0.0, growZone, flowOffset);
        float shrinkFactor = smoothstep(0.0, shrinkZone, maxPreSteps - flowOffset);

        float clampedT = min(tClamped, growthFactor);
        int clampedStepIndex = int(clampedT * NumSteps + 0.5);

        float deathFade = 1.0 - smoothstep(shrinkFactor - 0.15, shrinkFactor, tClamped);
        float birthFade = 1.0 - smoothstep(growthFactor - 0.15, growthFactor, tClamped);
        float flowFade = birthFade * deathFade;

        // Integrate through vector field
        for (int i = 0; i < 64; i++) {
            if (i >= clampedStepIndex) break;
            prevPos = pos;
            pos += getField(pos) * StepSize;
        }

        // Compute tangent
        vec3 vel = getField(pos);
        vec3 tangent;
        if (stepIndex > 0 && length(pos - prevPos) > 0.0001) {
            tangent = normalize(pos - prevPos);
        } else {
            tangent = normalize(vel + vec3(0.0, 0.001, 0.0));
        }

        // Build perpendicular frame
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 frameNormal = cross(up, tangent);
        float fnLen = length(frameNormal);
        if (fnLen < 0.001) {
            frameNormal = vec3(1.0, 0.0, 0.0);
        } else {
            frameNormal /= fnLen;
        }
        vec3 frameBinormal = normalize(cross(tangent, frameNormal));

        // Place tube cross-section
        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = pos + offset;

        color = getColor(vel, tClamped);
        alpha = flowFade;
    }

    transformedPosition = finalPos;
    vertexColor = vec4(color, alpha);
}
