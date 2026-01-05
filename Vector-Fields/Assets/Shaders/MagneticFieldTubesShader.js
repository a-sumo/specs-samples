// MagneticFieldTubesShader.js
// Computes magnetic field from two magnetic dipoles
// Each magnet's Y-axis rotation determines the north/south pole orientation
//
// Vertex encoding (same as VectorFieldTubesShader):
//   position.z = t (0-1, maps to step index for integration)
//   normal.z = 1 for tube vertices, 0 for cap centers
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startZ) starting position in XZ plane
//   texture2.x = startY starting Y position

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float FieldStrength;
input_float Time;
input_float FlowSpeed;

// Magnet 1: position and forward direction (from S to N pole)
input_vec3 Magnet1Position;
input_vec3 Magnet1Forward;  // Unit vector pointing from S to N

// Magnet 2: position and forward direction (from S to N pole)
input_vec3 Magnet2Position;
input_vec3 Magnet2Forward;  // Unit vector pointing from S to N

output_vec3 transformedPosition;
output_vec4 vertexColor;

// ========================================
// MAGNETIC FIELD COMPUTATION
// ========================================

// Magnetic dipole field: B = (3(m dot r_hat)r_hat - m) / r^3
// Where m is the magnetic moment (direction from S to N)
// and r is the vector from dipole to the point
vec3 dipoleMagneticField(vec3 point, vec3 dipolePos, vec3 moment) {
    vec3 r = point - dipolePos;
    float dist = length(r);

    // Avoid singularity at dipole location
    if (dist < 0.1) {
        // Inside the magnet, field roughly aligns with moment
        return moment * FieldStrength * 2.0;
    }

    vec3 rHat = r / dist;
    float dist3 = dist * dist * dist;

    // Dipole field formula
    float mDotR = dot(moment, rHat);
    vec3 B = (3.0 * mDotR * rHat - moment) / dist3;

    return B * FieldStrength;
}

// Combined magnetic field from both dipoles
vec3 getMagneticField(vec3 p) {
    vec3 B1 = dipoleMagneticField(p, Magnet1Position, Magnet1Forward);
    vec3 B2 = dipoleMagneticField(p, Magnet2Position, Magnet2Forward);

    // Superposition principle: total field is sum of individual fields
    vec3 totalB = B1 + B2;

    // Normalize and scale for visualization (field can get very strong near poles)
    float mag = length(totalB);
    if (mag > 0.001) {
        // Soft clamp the magnitude while preserving direction
        float clampedMag = mag / (1.0 + mag * 0.5);
        totalB = normalize(totalB) * clampedMag * 0.5;
    }

    return totalB;
}

// ========================================
// COLOR BASED ON FIELD DIRECTION
// ========================================
vec3 getColor(vec3 field, float t) {
    // Color based on field direction
    // Red = +X (or toward N), Blue = -X (toward S)
    // Use vertical component for variation

    vec3 normField = normalize(field + vec3(0.001));

    // Base color: red for north-pointing, blue for south-pointing
    float northness = dot(normField, normalize(Magnet1Forward + Magnet2Forward + vec3(0.001)));

    vec3 northColor = vec3(0.9, 0.2, 0.2);  // Red for north
    vec3 southColor = vec3(0.2, 0.4, 0.9);  // Blue for south
    vec3 neutralColor = vec3(0.8, 0.8, 0.3); // Yellow for perpendicular

    float blend = northness * 0.5 + 0.5;  // Map -1..1 to 0..1

    vec3 baseColor;
    if (blend > 0.5) {
        baseColor = mix(neutralColor, northColor, (blend - 0.5) * 2.0);
    } else {
        baseColor = mix(southColor, neutralColor, blend * 2.0);
    }

    // Add some variation based on field strength
    float strength = length(field);
    baseColor = mix(baseColor * 0.6, baseColor, min(1.0, strength * 2.0));

    return baseColor;
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
    // TIME-BASED FLOW
    // ========================================
    float maxPreSteps = 32.0;

    // Per-tube phase offset
    float tubePhase = fract(sin(dot(vec3(startX, startY, startZ), vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;

    float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
    int preSteps = int(flowOffset);
    float fractional = fract(flowOffset);

    // Pre-integrate to move the effective starting position
    for (int i = 0; i < 32; i++) {
        if (i >= preSteps) break;
        pos += getMagneticField(pos) * StepSize;
    }
    pos += getMagneticField(pos) * StepSize * fractional;
    prevPos = pos;

    // Growth/fade for smooth looping
    float growZone = 10.0;
    float shrinkZone = 18.0;

    float growthFactor = smoothstep(0.0, growZone, flowOffset);
    float shrinkFactor = smoothstep(0.0, shrinkZone, maxPreSteps - flowOffset);

    float clampedT = min(t, growthFactor);
    int clampedStepIndex = int(clampedT * NumSteps + 0.5);

    float deathFade = 1.0 - smoothstep(shrinkFactor - 0.15, shrinkFactor, t);
    float birthFade = 1.0 - smoothstep(growthFactor - 0.15, growthFactor, t);
    float flowFade = birthFade * deathFade;

    // ========================================
    // INTEGRATE THROUGH MAGNETIC FIELD
    // ========================================
    for (int i = 0; i < 64; i++) {
        if (i >= clampedStepIndex) break;
        prevPos = pos;
        pos += getMagneticField(pos) * StepSize;
    }

    // ========================================
    // COMPUTE TANGENT (direction of travel)
    // ========================================
    vec3 field = getMagneticField(pos);
    vec3 tangent;
    if (stepIndex > 0 && length(pos - prevPos) > 0.0001) {
        tangent = normalize(pos - prevPos);
    } else {
        tangent = normalize(field + vec3(0.0, 0.001, 0.0));
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

    // Color with flow fade applied
    vec3 color = getColor(field, t);

    transformedPosition = finalPos;
    vertexColor = vec4(color, flowFade);
}
