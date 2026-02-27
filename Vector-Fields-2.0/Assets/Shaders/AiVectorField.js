// AiVectorField.js
// Samples a vector field from a 2D texture atlas encoding a 3D volume.
// The atlas is generated at runtime by AiFieldGenerator.ts from an AI prompt.
//
// Atlas layout: N slices of an N×N grid tiled into a 2D texture.
//   tilesPerRow = ceil(sqrt(N)), texture size = tilesPerRow*N × tilesPerRow*N
//   Slice z maps to tile at (z % tilesPerRow, floor(z / tilesPerRow))
//   RGB channels = velocity XYZ (stored as float16, no packing)
//
// Vertex encoding (same as VectorField.js):
//   texture0 = (localX, localY) unit circle coords for cross-section
//   texture1 = (startX, startZ) starting position in XZ plane
//   texture2 = (startY, t) starting Y position and t parameter
//   texture3 = (geoType) geometry type:
//     0 = trail cap center (flat)
//     1 = trail body (flow animation + integration)
//     3 = particle (short trail)
//     4 = arrow body (static, orient by field)
//     5 = arrow cone (static, orient by field)
//     6 = arrow cap center (static)

input_texture_2d FieldAtlas;
input_float AtlasSize;
input_float FieldExtent;

input_float TubeRadius;
input_float StepSize;
input_float NumSteps;
input_float Time;
input_float FlowSpeed;
input_float ArrowScale;
input_float ConeLength;
input_float ConeRadius;

output_vec3 transformedPosition;
output_vec4 vertexColor;

// ========================================
// ATLAS-BASED FIELD SAMPLING
// ========================================

vec3 getField(vec3 p) {
    // Map world position to [0,1]³ within the field bounding box
    vec3 uvw = (p / FieldExtent) * 0.5 + 0.5;
    uvw = clamp(uvw, vec3(0.002), vec3(0.998));

    float N = AtlasSize;
    float tilesPerRow = ceil(sqrt(N));
    float invTiles = 1.0 / tilesPerRow;

    // Z-slice interpolation
    float sliceF = uvw.z * (N - 1.0);
    float sliceLow = floor(sliceF);
    float sliceHigh = min(sliceLow + 1.0, N - 1.0);
    float zFrac = sliceF - sliceLow;

    // Tile positions for low and high Z slices
    vec2 tileLow = vec2(mod(sliceLow, tilesPerRow), floor(sliceLow / tilesPerRow)) * invTiles;
    vec2 tileHigh = vec2(mod(sliceHigh, tilesPerRow), floor(sliceHigh / tilesPerRow)) * invTiles;

    // Position within tile (half-pixel inset to avoid bleeding across tile borders)
    float texSize = tilesPerRow * N;
    float halfPixel = 0.5 / texSize;
    vec2 inTile = uvw.xy * invTiles;
    inTile = clamp(inTile, vec2(halfPixel), vec2(invTiles - halfPixel));

    // Sample both slices and interpolate for trilinear Z
    vec3 fieldLow = FieldAtlas.sampleLod(tileLow + inTile, 0.0).rgb;
    vec3 fieldHigh = FieldAtlas.sampleLod(tileHigh + inTile, 0.0).rgb;

    return mix(fieldLow, fieldHigh, zFrac);
}

// ========================================
// PLASMA COLOR GRADIENT
// ========================================

vec3 plasmaGradient(float value) {
    vec3 c0 = vec3(0.05, 0.0, 0.2);
    vec3 c1 = vec3(0.3, 0.0, 0.5);
    vec3 c2 = vec3(0.7, 0.0, 0.7);
    vec3 c3 = vec3(0.95, 0.3, 0.6);
    vec3 c4 = vec3(1.0, 0.85, 0.5);
    vec3 c5 = vec3(1.0, 1.0, 0.95);

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

    // Decode vertex data from UVs
    float localX = inUV0.x;
    float localY = inUV0.y;
    float startX = inUV1.x;
    float startZ = inUV1.y;
    float startY = inUV2.x;
    float t = inUV2.y;
    float geoType = inUV3.x;
    float radius = TubeRadius;

    // Geometry type flags
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

    float tClamped = min(t, 1.0);
    int stepIndex = int(tClamped * NumSteps + 0.5);

    // ========================================
    // START AT 3D GRID POSITION
    // ========================================
    vec3 startPos = vec3(startX, startY, startZ);
    vec3 pos = startPos;
    vec3 prevPos = pos;

    vec3 finalPos = startPos;
    vec3 color = vec3(1.0);
    float alpha = 1.0;

    // ========================================
    // ARROW MODE
    // ========================================
    if (isArrowMode) {
        vec3 fieldVec = getField(startPos);
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

    // ========================================
    // TRAIL & PARTICLE MODE
    // ========================================
    } else {
        float maxPreSteps = 32.0;
        float tubePhase = fract(sin(dot(startPos, vec3(12.9898, 78.233, 45.164))) * 43758.5453) * maxPreSteps;
        float flowOffset = mod(Time * FlowSpeed + tubePhase, maxPreSteps);
        int preSteps = int(flowOffset);
        float fractional = fract(flowOffset);

        // Pre-integrate to shift starting position
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
