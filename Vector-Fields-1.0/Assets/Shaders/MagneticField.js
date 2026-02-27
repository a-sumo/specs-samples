// MagneticFieldTubesShader.js
// Computes magnetic field from two magnetic dipoles
// Magnet's +X axis points from S to N pole (aligned with capsule mesh)
//
// Vertex encoding (all data in UVs to avoid distortion):
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startZ) starting position in XZ plane
//   texture2 = (startY, t) starting Y position and t parameter
//   texture3 = (geoType) geometry type:
//     0 = trail cap center (flat)
//     1 = trail body (flow animation + integration)
//     3 = particle (short trail - flow animation + integration)
//     4 = arrow body (static, orient by field)
//     5 = arrow cone (static, orient by field)
//     6 = arrow cap center (static)

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float FieldStrength;
input_float Time;
input_float FlowSpeed;
input_float ArrowScale;
input_float ConeLength;
input_float ConeRadius;

input_vec3 Magnet1Position;
input_vec3 Magnet1Forward;

input_vec3 Magnet2Position;
input_vec3 Magnet2Forward;

output_vec3 transformedPosition;
output_vec4 vertexColor;

// ========================================
// MAGNETIC FIELD COMPUTATION
// ========================================

vec3 dipoleMagneticField(vec3 point, vec3 dipolePos, vec3 moment) {
    vec3 r = point - dipolePos;
    float dist = length(r);

    vec3 result;
    if (dist < 0.1) {
        result = moment * FieldStrength * 2.0;
    } else {
        vec3 rHat = r / dist;
        float dist3 = dist * dist * dist;
        float mDotR = dot(moment, rHat);
        vec3 B = (3.0 * mDotR * rHat - moment) / dist3;
        result = B * FieldStrength;
    }
    return result;
}

vec3 getMagneticField(vec3 p) {
    vec3 B1 = dipoleMagneticField(p, Magnet1Position, Magnet1Forward);
    vec3 B2 = dipoleMagneticField(p, Magnet2Position, Magnet2Forward);

    vec3 totalB = B1 + B2;

    float mag = length(totalB);
    if (mag > 0.001) {
        float clampedMag = mag / (1.0 + mag * 0.5);
        totalB = normalize(totalB) * clampedMag * 0.5;
    }

    return totalB;
}

// ========================================
// COLOR BASED ON FIELD DIRECTION
// ========================================

vec3 getGradientColor(float value) {
    vec3 c0 = vec3(0.0, 0.9, 1.0);
    vec3 c1 = vec3(0.2, 0.3, 1.0);
    vec3 c2 = vec3(0.85, 0.15, 0.95);
    vec3 c3 = vec3(1.0, 0.15, 0.25);
    vec3 c4 = vec3(1.0, 0.5, 0.0);

    vec3 result;
    if (value < 0.25) {
        result = mix(c0, c1, value * 4.0);
    } else if (value < 0.5) {
        result = mix(c1, c2, (value - 0.25) * 4.0);
    } else if (value < 0.75) {
        result = mix(c2, c3, (value - 0.5) * 4.0);
    } else {
        result = mix(c3, c4, (value - 0.75) * 4.0);
    }
    return result;
}

vec3 getColor(vec3 field, float t) {
    vec3 normField = normalize(field + vec3(0.001));

    vec3 avgNorth = normalize(Magnet1Forward + Magnet2Forward + vec3(0.001));
    float northness = dot(normField, avgNorth);

    float gradientPos = northness * 0.5 + 0.5;

    vec3 baseColor = getGradientColor(gradientPos);

    float strength = length(field);
    float intensityBoost = min(1.0, strength * 2.0);

    baseColor = mix(baseColor * 0.7, baseColor, intensityBoost);

    return baseColor;
}

void main() {
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();
    vec2 inUV2 = system.getSurfaceUVCoord2();
    vec2 inUV3 = system.getSurfaceUVCoord3();

    float localX = inUV0.x;
    float localY = inUV0.y;
    float startX = inUV1.x;
    float startZ = inUV1.y;
    float startY = inUV2.x;
    float t = inUV2.y;
    float geoType = inUV3.x;
    float radius = TubeRadius;

    bool isTrailCap = (geoType < 0.5);
    bool isArrow = (geoType > 3.5 && geoType < 4.5);
    bool isArrowCone = (geoType > 4.5 && geoType < 5.5);
    bool isArrowCap = (geoType > 5.5);
    bool isArrowMode = isArrow || isArrowCone || isArrowCap;

    if (isTrailCap || isArrowCap) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;
    }

    float tClamped = min(t, 1.0);
    int stepIndex = int(tClamped * NumSteps + 0.5);

    vec3 startPos = vec3(startX, startY, startZ);
    vec3 pos = startPos;
    vec3 prevPos = pos;

    vec3 finalPos = startPos;
    vec3 color = vec3(1.0);
    float alpha = 1.0;

    if (isArrowMode) {
        vec3 fieldVec = getMagneticField(startPos);
        float magnitude = length(fieldVec);
        vec3 tangent = (magnitude > 0.001) ? fieldVec / magnitude : vec3(0.0, 1.0, 0.0);

        float arrowLength = magnitude * ArrowScale;

        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 frameNormal = cross(up, tangent);
        float fnLen = length(frameNormal);
        if (fnLen < 0.001) {
            frameNormal = vec3(1.0, 0.0, 0.0);
        } else {
            frameNormal /= fnLen;
        }
        vec3 frameBinormal = normalize(cross(tangent, frameNormal));

        float alongArrow = tClamped * arrowLength;
        vec3 arrowPos = startPos + tangent * alongArrow;

        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = arrowPos + offset;

        if (isArrowCone && t > 1.5) {
            float coneHeight = ConeLength * TubeRadius;
            finalPos = startPos + tangent * (arrowLength + coneHeight);
        }

        color = getColor(fieldVec, tClamped);
        if (isArrowCone) {
            color = mix(color, vec3(1.0), 0.2);
        }
        alpha = 1.0;

    } else {
        float maxPreSteps = 32.0;
        float tubePhase = fract(sin(dot(startPos, vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;
        float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
        int preSteps = int(flowOffset);
        float fractional = fract(flowOffset);

        for (int i = 0; i < 32; i++) {
            if (i >= preSteps) break;
            pos += getMagneticField(pos) * StepSize;
        }
        pos += getMagneticField(pos) * StepSize * fractional;
        prevPos = pos;

        float growZone = 10.0;
        float shrinkZone = 18.0;
        float growthFactor = smoothstep(0.0, growZone, flowOffset);
        float shrinkFactor = smoothstep(0.0, shrinkZone, maxPreSteps - flowOffset);

        float clampedT = min(tClamped, growthFactor);
        int clampedStepIndex = int(clampedT * NumSteps + 0.5);

        float deathFade = 1.0 - smoothstep(shrinkFactor - 0.15, shrinkFactor, tClamped);
        float birthFade = 1.0 - smoothstep(growthFactor - 0.15, growthFactor, tClamped);
        float flowFade = birthFade * deathFade;

        for (int i = 0; i < 64; i++) {
            if (i >= clampedStepIndex) break;
            prevPos = pos;
            pos += getMagneticField(pos) * StepSize;
        }

        vec3 vel = getMagneticField(pos);
        vec3 tangent;
        if (stepIndex > 0 && length(pos - prevPos) > 0.0001) {
            tangent = normalize(pos - prevPos);
        } else {
            tangent = normalize(vel + vec3(0.0, 0.001, 0.0));
        }

        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 frameNormal = cross(up, tangent);
        float fnLen = length(frameNormal);
        if (fnLen < 0.001) {
            frameNormal = vec3(1.0, 0.0, 0.0);
        } else {
            frameNormal /= fnLen;
        }
        vec3 frameBinormal = normalize(cross(tangent, frameNormal));

        vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
        finalPos = pos + offset;

        color = getColor(vel, tClamped);
        alpha = flowFade;
    }

    transformedPosition = finalPos;
    vertexColor = vec4(color, alpha);
}
