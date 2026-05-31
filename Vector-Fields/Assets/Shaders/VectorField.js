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
//     3 = particle (billboard triangle fan, minimal geometry)
//     4 = arrow body (static, orient by field)
//     5 = arrow cone (static, orient by field)
//     6 = arrow cap center (static)

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float FieldScale;
input_float Preset;
input_vec3 TargetPosition;
input_float Time;
input_float FlowSpeed;
input_float ArrowScale;
input_float ConeLength;
input_float ConeRadius;
input_float ColorMapScale;
input_float ColorMapOffset;

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

// 5: Saddle - flow exits along one axis and returns along another
vec3 fieldSaddle(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale;

    vec3 crossing = vec3(rel.x, -rel.y * 0.35, -rel.z);
    float len = length(crossing);
    vec3 shaped = crossing / (1.0 + len);
    vec3 sparkle = vec3(
        sin(rel.y * s * 1.7),
        cos((rel.x - rel.z) * s),
        sin(rel.x * s * 1.2)
    ) * 0.12;

    return (shaped + sparkle) * 0.55;
}

// 6: Helix - a spiral that climbs as it turns
vec3 fieldHelix(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale;

    float distXZ = length(vec2(rel.x, rel.z));
    vec3 tangent = (distXZ > 0.001) ? vec3(-rel.z, 0.0, rel.x) / distXZ : vec3(1.0, 0.0, 0.0);
    float climb = 0.35 + 0.20 * sin(distXZ * s + rel.y * 0.5);
    vec3 inward = (distXZ > 0.001) ? vec3(-rel.x, 0.0, -rel.z) / distXZ : vec3(0.0);

    return (tangent * 0.62 + inward * 0.10 + vec3(0.0, climb, 0.0)) * 0.45;
}

// 7: River - layered lanes moving at different speeds
vec3 fieldRiver(vec3 p) {
    vec3 rel = p - TargetPosition;
    float s = FieldScale;

    float lane = sin((rel.y + rel.z * 0.55) * s * 1.35);
    float bend = cos((rel.x * 0.45 + rel.z) * s);
    return vec3(
        0.56 + lane * 0.24,
        bend * 0.16,
        sin(rel.y * s * 0.8) * 0.22
    ) * 0.45;
}

// 8: Surface wind - tangent lanes that can be projected onto a sphere
vec3 fieldSurfaceWind(vec3 p) {
    vec3 n = normalize(p + vec3(0.0001, 0.0002, 0.0003));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(0.0001, 0.0, 0.0));
    vec3 north = normalize(cross(n, east));
    float latitude = asin(clamp(n.y, -1.0, 1.0));
    float longitude = atan(n.z, n.x);
    float jet = 0.46 + 0.18 * sin(latitude * 6.0 + Time * 0.12);
    float meander = sin(longitude * 3.0 + latitude * 4.0 + Time * 0.18);
    return (east * jet + north * meander * 0.20) * 0.42;
}

vec3 safeNormalize(vec3 v, vec3 fallback) {
    float len = length(v);
    if (len < 0.0001) return fallback;
    return v / len;
}

float fieldPresetValue() {
    return floor(Preset + 0.0001);
}

float colorMapValue() {
    return floor(fract(Preset) * 100.0 + 0.5);
}

// 9: Ambient audio plane - one shared direction with subtle per-vector noise.
// TargetPosition encodes the audio/control channels: x=recorded yaw, y=22-40Hz bass, z=opacity/magnitude.
vec3 fieldAmbientPlane(vec3 p) {
    float yaw = (clamp(TargetPosition.x, 0.0, 1.0) - 0.5) * 1.62;
    float pitch = (clamp(TargetPosition.y, 0.0, 1.0) - 0.5) * 1.05;
    float magnitude = clamp(TargetPosition.z, 0.0, 1.0);
    float seed = snoise(vec3(p.x * 0.82, p.z * 0.82, Time * 0.035));
    float slow = snoise(vec3(p.x * 0.28 + 13.1, p.z * 0.28 - 7.4, Time * 0.018));
    yaw += seed * 0.18 + slow * 0.06;
    pitch += slow * 0.12 + seed * 0.035;
    float c = cos(pitch);
    vec3 direction = vec3(cos(yaw) * c, sin(pitch), sin(yaw) * c);
    return safeNormalize(direction, vec3(1.0, 0.0, 0.0)) * (0.18 + magnitude * 0.48);
}

vec3 getField(vec3 p) {
    float preset = fieldPresetValue();
    if (preset < 0.5) return fieldExpansion(p);
    if (preset < 1.5) return fieldContraction(p);
    if (preset < 2.5) return fieldCirculation(p);
    if (preset < 3.5) return fieldWaves(p);
    if (preset < 4.5) return fieldVortex(p);
    if (preset < 5.5) return fieldSaddle(p);
    if (preset < 6.5) return fieldHelix(p);
    if (preset < 7.5) return fieldRiver(p);
    if (preset < 8.5) return fieldSurfaceWind(p);
    if (preset < 9.5) return fieldAmbientPlane(p);
    return fieldWaves(p);
}

bool usesSphereSurface() {
    return fieldPresetValue() > 7.5 && fieldPresetValue() < 8.5;
}

vec3 projectToDomain(vec3 p, float domainRadius) {
    if (!usesSphereSurface()) return p;
    return safeNormalize(p, vec3(0.0, 1.0, 0.0)) * domainRadius;
}

vec3 getDomainField(vec3 p, float domainRadius) {
    vec3 samplePos = projectToDomain(p, domainRadius);
    vec3 fieldVec = getField(samplePos);
    if (usesSphereSurface()) {
        vec3 normal = safeNormalize(samplePos, vec3(0.0, 1.0, 0.0));
        fieldVec -= normal * dot(fieldVec, normal);
    }
    return fieldVec;
}

vec3 advanceDomain(vec3 p, float domainRadius, float amount) {
    vec3 nextPos = p + getDomainField(p, domainRadius) * StepSize * amount;
    return projectToDomain(nextPos, domainRadius);
}

// ========================================
// MATPLOTLIB-STYLE COLOR MAPS
// ========================================

vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 stops5(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
    x = clamp(x, 0.0, 1.0);
    if (x < 0.25) return mix(c0, c1, smoothstep(0.0, 0.25, x));
    if (x < 0.50) return mix(c1, c2, smoothstep(0.25, 0.50, x));
    if (x < 0.75) return mix(c2, c3, smoothstep(0.50, 0.75, x));
    return mix(c3, c4, smoothstep(0.75, 1.0, x));
}

vec3 stops7(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5, vec3 c6) {
    x = clamp(x, 0.0, 1.0);
    if (x < 0.1667) return mix(c0, c1, smoothstep(0.0, 0.1667, x));
    if (x < 0.3333) return mix(c1, c2, smoothstep(0.1667, 0.3333, x));
    if (x < 0.5000) return mix(c2, c3, smoothstep(0.3333, 0.5000, x));
    if (x < 0.6667) return mix(c3, c4, smoothstep(0.5000, 0.6667, x));
    if (x < 0.8333) return mix(c4, c5, smoothstep(0.6667, 0.8333, x));
    return mix(c5, c6, smoothstep(0.8333, 1.0, x));
}

vec3 stops9(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5, vec3 c6, vec3 c7, vec3 c8) {
    x = clamp(x, 0.0, 1.0);
    if (x < 0.125) return mix(c0, c1, smoothstep(0.0, 0.125, x));
    if (x < 0.250) return mix(c1, c2, smoothstep(0.125, 0.250, x));
    if (x < 0.375) return mix(c2, c3, smoothstep(0.250, 0.375, x));
    if (x < 0.500) return mix(c3, c4, smoothstep(0.375, 0.500, x));
    if (x < 0.625) return mix(c4, c5, smoothstep(0.500, 0.625, x));
    if (x < 0.750) return mix(c5, c6, smoothstep(0.625, 0.750, x));
    if (x < 0.875) return mix(c6, c7, smoothstep(0.750, 0.875, x));
    return mix(c7, c8, smoothstep(0.875, 1.0, x));
}

vec3 mapFlag(float x) {
    float p = fract(x * 8.0);
    if (p < 0.25) return vec3(1.0, 0.0, 0.0);
    if (p < 0.50) return vec3(1.0);
    if (p < 0.75) return vec3(0.0, 0.0, 1.0);
    return vec3(0.0);
}

vec3 mapPrism(float x) {
    return hsv2rgb(vec3(fract(x * 6.0), 1.0, 1.0));
}

vec3 mapTurbo(float x) {
    const vec4 kRedVec4 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
    const vec4 kGreenVec4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
    const vec4 kBlueVec4 = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
    const vec2 kRedVec2 = vec2(-152.94239396, 59.28637943);
    const vec2 kGreenVec2 = vec2(4.27729857, 2.82956604);
    const vec2 kBlueVec2 = vec2(-89.90310912, 27.34824973);
    float t = clamp(x, 0.0, 1.0);
    vec4 v4 = vec4(1.0, t, t * t, t * t * t);
    vec2 v2 = vec2(v4.z, v4.w) * v4.z;
    return clamp(vec3(
        dot(v4, kRedVec4) + dot(v2, kRedVec2),
        dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
        dot(v4, kBlueVec4) + dot(v2, kBlueVec2)
    ), 0.0, 1.0);
}

vec3 mapJet(float x) {
    float t = clamp(x, 0.0, 1.0);
    return clamp(vec3(
        1.5 - abs(4.0 * t - 3.0),
        1.5 - abs(4.0 * t - 2.0),
        1.5 - abs(4.0 * t - 1.0)
    ), 0.0, 1.0);
}

vec3 mapCubehelix(float x) {
    float t = clamp(x, 0.0, 1.0);
    float angle = 6.2831853 * (0.5 / 3.0 - 1.5 * t);
    float amp = 0.5 * t * (1.0 - t);
    float c = cos(angle);
    float s = sin(angle);
    return clamp(vec3(
        t + amp * (-0.14861 * c + 1.78277 * s),
        t + amp * (-0.29227 * c - 0.90649 * s),
        t + amp * (1.97294 * c)
    ), 0.0, 1.0);
}

vec3 mapViridis(float x) {
    return stops5(
        x,
        vec3(0.99, 0.91, 0.15),
        vec3(0.37, 0.79, 0.38),
        vec3(0.13, 0.57, 0.55),
        vec3(0.23, 0.32, 0.55),
        vec3(0.27, 0.01, 0.33)
    );
}

vec3 mapPlasma(float x) {
    return stops7(
        x,
        vec3(0.94, 0.98, 0.13),
        vec3(0.99, 0.65, 0.21),
        vec3(0.88, 0.39, 0.38),
        vec3(0.70, 0.16, 0.56),
        vec3(0.42, 0.00, 0.66),
        vec3(0.23, 0.06, 0.50),
        vec3(0.05, 0.03, 0.53)
    );
}

vec3 sampleColorMap(float value) {
    float scale = ColorMapScale;
    if (abs(scale) < 0.0001) scale = 1.0;
    float x = clamp(value * scale + ColorMapOffset, 0.0, 1.0);
    float m = colorMapValue();
    if (m < 0.5) return mapFlag(x);
    if (m < 1.5) return mapPrism(x);
    if (m < 2.5) return stops5(x, vec3(0.0, 0.06, 0.09), vec3(0.0, 0.22, 0.40), vec3(0.0, 0.44, 0.50), vec3(0.46, 0.72, 0.70), vec3(0.95, 0.94, 0.86));
    if (m < 3.5) return stops7(x, vec3(0.0, 0.0, 0.08), vec3(0.03, 0.09, 0.31), vec3(0.05, 0.34, 0.44), vec3(0.25, 0.53, 0.34), vec3(0.56, 0.65, 0.36), vec3(0.79, 0.65, 0.52), vec3(0.96, 0.93, 0.93));
    if (m < 4.5) return stops7(x, vec3(0.14, 0.20, 0.54), vec3(0.08, 0.54, 0.83), vec3(0.07, 0.75, 0.64), vec3(0.56, 0.83, 0.42), vec3(0.92, 0.91, 0.56), vec3(0.60, 0.46, 0.36), vec3(0.95, 0.93, 0.93));
    if (m < 5.5) return stops7(x, vec3(0.0), vec3(0.73, 0.0, 0.09), vec3(0.20, 0.14, 0.37), vec3(0.47, 0.49, 0.91), vec3(0.65, 0.65, 0.67), vec3(0.71, 0.65, 0.36), vec3(0.96, 0.94, 0.80));
    if (m < 6.5) return stops5(x, vec3(0.0), vec3(0.11, 0.0, 0.30), vec3(0.50, 0.0, 0.55), vec3(0.88, 0.29, 0.15), vec3(1.0, 0.96, 0.0));
    if (m < 7.5) return stops7(x, vec3(0.0), vec3(0.0, 0.06, 0.37), vec3(0.21, 0.0, 0.66), vec3(0.60, 0.14, 0.82), vec3(0.93, 0.31, 0.60), vec3(1.0, 0.58, 0.31), vec3(1.0));
    if (m < 8.5) return stops7(x, vec3(0.0), vec3(0.08, 0.08, 0.24), vec3(0.27, 0.17, 0.47), vec3(0.65, 0.18, 0.28), vec3(0.94, 0.40, 0.18), vec3(0.90, 0.85, 0.37), vec3(1.0));
    if (m < 9.5) return mapCubehelix(x);
    if (m < 10.5) return stops5(x, vec3(0.0, 0.0, 1.0), vec3(0.49, 0.0, 0.53), vec3(1.0, 0.0, 0.0), vec3(0.69, 0.38, 0.0), vec3(0.0, 1.0, 0.0));
    if (m < 11.5) return hsv2rgb(vec3(fract(0.99 - x * 0.86), 1.0, 1.0));
    if (m < 12.5) return hsv2rgb(vec3(0.76 - x * 0.76, 0.72, 1.0));
    if (m < 13.5) return mapJet(x);
    if (m < 14.5) return mapTurbo(x);
    if (m < 15.5) return stops9(x, vec3(0.0), vec3(0.42, 0.0, 0.31), vec3(0.0, 0.07, 0.66), vec3(0.0, 0.59, 1.0), vec3(0.0, 0.69, 0.0), vec3(0.84, 1.0, 0.0), vec3(1.0, 0.48, 0.0), vec3(0.86, 0.0, 0.16), vec3(0.96, 0.93, 0.96));
    if (m < 16.5) return stops9(x, vec3(0.0), vec3(0.0, 0.19, 0.44), vec3(0.0, 0.42, 1.0), vec3(0.0, 0.89, 0.94), vec3(0.0, 0.80, 0.22), vec3(0.84, 1.0, 0.0), vec3(1.0, 0.57, 0.0), vec3(1.0, 0.0, 0.30), vec3(0.92, 0.53, 1.0));
    if (m < 17.5) return mapViridis(x);
    return mapPlasma(x);
}

vec3 ambientGradient(float value) {
    return sampleColorMap(value);
}

vec3 getColor(vec3 vel, float t, vec3 p) {
    if (fieldPresetValue() > 8.5 && fieldPresetValue() < 9.5) {
        float magnitude = clamp(TargetPosition.z, 0.0, 1.0);
        float bass = clamp(TargetPosition.y, 0.0, 1.0);
        float band = 0.5 + 0.5 * sin(p.x * 1.15 + p.z * 0.78 + t * 1.7 + Time * 0.12);
        float ramp = clamp(0.14 + band * 0.48 + bass * 0.30 + length(vel) * 0.34, 0.0, 1.0);
        return ambientGradient(ramp) * (0.52 + magnitude * 0.62);
    }

    float speed = length(vel);
    float intensity = min(1.0, speed * 2.5);

    return sampleColorMap(intensity) * (0.72 + intensity * 0.34);
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

    // Geometry type: 0=trailCap, 1=trail, 3=particle billboard, 4=arrow, 5=arrowCone, 6=arrowCap
    bool isTrailCap = (geoType < 0.5);
    bool isParticle = (geoType > 2.5 && geoType < 3.5);
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
    vec3 encodedStartPos = vec3(startX, startY, startZ);
    float domainRadius = max(0.001, length(encodedStartPos));
    vec3 startPos = projectToDomain(encodedStartPos, domainRadius);
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
        vec3 fieldVec = getDomainField(startPos, domainRadius);
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
        if (usesSphereSurface()) {
            vec3 surfaceNormal = safeNormalize(startPos, vec3(0.0, 1.0, 0.0));
            frameNormal = safeNormalize(cross(surfaceNormal, tangent), vec3(1.0, 0.0, 0.0));
            frameBinormal = surfaceNormal;
        }

        // Position along straight arrow (t=0 is base, t=1 is before cone, t=2 is cone tip)
        float alongArrow = tClamped * arrowLength;
        vec3 arrowPos = projectToDomain(startPos + tangent * alongArrow, domainRadius);

        // Cross-section offset
        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = arrowPos + offset;

        // Cone tip: t=2 marks the tip, use ConeLength uniform for height
        if (isArrowCone && t > 1.5) {
            float coneHeight = ConeLength * TubeRadius;
            finalPos = projectToDomain(startPos + tangent * (arrowLength + coneHeight), domainRadius);
        }

        color = getColor(fieldVec, tClamped, startPos);
        if (isArrowCone) {
            color = mix(color, vec3(1.0), 0.2);
        }
        alpha = (fieldPresetValue() > 8.5 && fieldPresetValue() < 9.5) ? (0.18 + clamp(TargetPosition.z, 0.0, 1.0) * 0.72) : 1.0;

    // ========================================
    // PARTICLE MODE: flowing billboard fans
    // ========================================
    } else if (isParticle) {
        float maxPreSteps = 36.0;
        float tubePhase = fract(sin(dot(startPos, vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;
        float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
        int preSteps = int(flowOffset);
        float fractional = fract(flowOffset);

        for (int i = 0; i < 36; i++) {
            if (i >= preSteps) break;
            pos = advanceDomain(pos, domainRadius, 1.0);
        }
        pos = advanceDomain(pos, domainRadius, fractional);

        vec3 vel = getDomainField(pos, domainRadius);
        vec3 posWorld = (system.getMatrixWorld() * vec4(pos, 1.0)).xyz;
        vec3 viewDir = safeNormalize(system.getCameraPosition() - posWorld, vec3(0.0, 0.0, 1.0));
        vec3 rightWorld = cross(vec3(0.0, 1.0, 0.0), viewDir);
        if (length(rightWorld) < 0.001) rightWorld = cross(vec3(1.0, 0.0, 0.0), viewDir);
        rightWorld = safeNormalize(rightWorld, vec3(1.0, 0.0, 0.0));
        vec3 upWorld = safeNormalize(cross(viewDir, rightWorld), vec3(0.0, 1.0, 0.0));
        mat4 worldInv = system.getMatrixWorldInverse();
        vec3 right = safeNormalize((worldInv * vec4(rightWorld, 0.0)).xyz, vec3(1.0, 0.0, 0.0));
        vec3 billboardUp = safeNormalize((worldInv * vec4(upWorld, 0.0)).xyz, vec3(0.0, 1.0, 0.0));

        if (usesSphereSurface()) {
            vec3 surfaceNormal = safeNormalize(pos, vec3(0.0, 1.0, 0.0));
            pos += surfaceNormal * TubeRadius * 0.65;
        }

        float discRadius = TubeRadius * 3.2;
        vec2 fanUV = vec2(localX, localY);
        float disc = length(fanUV);
        finalPos = pos + (right * fanUV.x + billboardUp * fanUV.y) * discRadius;

        float birthFade = smoothstep(0.0, 5.0, flowOffset);
        float deathFade = smoothstep(0.0, 5.0, maxPreSteps - flowOffset);
        float edgeFade = 1.0 - smoothstep(0.74, 1.0, disc);
        color = getColor(vel, 0.5, pos);
        alpha = edgeFade * birthFade * deathFade;
        if (fieldPresetValue() > 8.5 && fieldPresetValue() < 9.5) {
            alpha *= 0.18 + clamp(TargetPosition.z, 0.0, 1.0) * 0.72;
        }

    // ========================================
    // TRAIL MODE: Flowing tubes with integration
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
            pos = advanceDomain(pos, domainRadius, 1.0);
        }
        pos = advanceDomain(pos, domainRadius, fractional);
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
            pos = advanceDomain(pos, domainRadius, 1.0);
        }

        // Compute tangent
        vec3 vel = getDomainField(pos, domainRadius);
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
        if (usesSphereSurface()) {
            vec3 surfaceNormal = safeNormalize(pos, vec3(0.0, 1.0, 0.0));
            frameNormal = safeNormalize(cross(surfaceNormal, tangent), vec3(1.0, 0.0, 0.0));
            frameBinormal = safeNormalize(cross(tangent, frameNormal), surfaceNormal);
        }

        // Place tube cross-section
        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = pos + offset;

        color = getColor(vel, tClamped, pos);
        alpha = flowFade;
        if (fieldPresetValue() > 8.5 && fieldPresetValue() < 9.5) {
            alpha *= 0.18 + clamp(TargetPosition.z, 0.0, 1.0) * 0.72;
        }
    }

    transformedPosition = finalPos;
    vertexColor = vec4(color, alpha);
}
