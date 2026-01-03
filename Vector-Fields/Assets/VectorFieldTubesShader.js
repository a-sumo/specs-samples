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

output_vec3 transformedPosition;
output_vec4 vertexColor;

// Simple vector field - we'll make this more complex later
vec3 vectorField(vec3 pos) {
    // For now: spiral upward field
    // Rotates around Y axis while moving up
    float angle = atan(pos.z, pos.x);
    float r = length(pos.xz);

    vec3 tangential = vec3(-pos.z, 0.0, pos.x); // perpendicular in XZ
    if (r > 0.001) tangential /= r;

    vec3 field = tangential * 0.5 + vec3(0.0, 1.0, 0.0);
    return normalize(field);
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

    // ========================================
    // INTEGRATE VECTOR FIELD
    // Start at (startX, 0, startY) and step through field
    // ========================================
    vec3 pos = vec3(startX, 0.0, startY);
    vec3 prevPos = pos;

    for (int i = 0; i < 64; i++) {
        if (i >= stepIndex) break;

        prevPos = pos;
        vec3 vel = vectorField(pos);
        pos = pos + vel * StepSize;
    }

    // ========================================
    // COMPUTE TANGENT (direction of travel)
    // ========================================
    vec3 tangent;
    if (stepIndex > 0) {
        tangent = normalize(pos - prevPos);
    } else {
        tangent = normalize(vectorField(pos));
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
