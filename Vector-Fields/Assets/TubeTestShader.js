// TubeTestShader.js
// GPU sine deformation with parametric tube encoding
// Transform applied via uniforms to avoid position attribute distortion
//
// Vertex encoding from TubeTest.ts:
//   position.z = t (0-1 along tube length, parametric)
//   normal.xy = (localX, localY) unit circle coords
//   normal.z = 1 for tube vertices, 0 for cap centers
//   texture0 = (localX, localY) unit circle coords

input_float TubeRadius;   // { "default": 0.1 }
input_float TubeLength;   // { "default": 5.0 }
input_vec3 ObjectPosition;  // { "default": [0, 0, 0] }
input_vec3 ObjectRotation;  // { "default": [0, 0, 0] } // Euler angles in degrees
input_vec3 ObjectScale;     // { "default": [1, 1, 1] }

output_vec3 transformedPosition;
output_vec4 vertexColor;

// Rotate by Euler angles (XYZ order, input in degrees)
vec3 rotateByEuler(vec3 v, vec3 eulerDeg) {
    vec3 r = eulerDeg * 0.01745329251; // deg to rad (PI/180)

    // Rotation around X
    float cx = cos(r.x), sx = sin(r.x);
    v = vec3(v.x, cx * v.y - sx * v.z, sx * v.y + cx * v.z);

    // Rotation around Y
    float cy = cos(r.y), sy = sin(r.y);
    v = vec3(cy * v.x + sy * v.z, v.y, -sy * v.x + cy * v.z);

    // Rotation around Z
    float cz = cos(r.z), sz = sin(r.z);
    v = vec3(cz * v.x - sz * v.y, sz * v.x + cz * v.y, v.z);

    return v;
}

void main() {
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();
    vec2 inUV = system.getSurfaceUVCoord0();

    // Decode parametric data
    float t = inPos.z;                    // Parametric position (0-1 along tube)
    float z = t * TubeLength;             // Actual Z position
    float localX = inUV.x;                // cos(theta) - unit circle
    float localY = inUV.y;                // sin(theta) - unit circle
    float radius = TubeRadius;

    // Cap centers have localX=localY=0
    bool isCapCenter = (inNormal.z < 0.5);
    if (isCapCenter) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;  // Tiny radius for cap centers
    }

    float time = system.getTimeElapsed();

    // ========================================
    // STEP 1: Compute sine wave displacement
    // The tube center moves in X based on z position
    // ========================================
    float waveFreq = 1.5;
    float waveAmp = 0.5;

    float sineDisplacement = sin(z * waveFreq + time) * waveAmp;
    vec3 center = vec3(sineDisplacement, 0.0, z);

    // ========================================
    // STEP 2: Compute TANGENT (derivative of path)
    // ========================================
    float dxdz = cos(z * waveFreq + time) * waveAmp * waveFreq;
    vec3 tangent = normalize(vec3(dxdz, 0.0, 1.0));

    // ========================================
    // STEP 3: Build perpendicular frame
    // ========================================
    vec3 frameNormal = vec3(-tangent.z, 0.0, tangent.x);
    vec3 frameBinormal = vec3(0.0, 1.0, 0.0);

    // ========================================
    // STEP 4: Transform circular cross-section to deformed frame
    // ========================================
    vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
    vec3 localPos = center + offset;

    // ========================================
    // STEP 5: Apply object transform (scale, rotate, translate)
    // ========================================
    vec3 scaledPos = localPos * ObjectScale;
    vec3 rotatedPos = rotateByEuler(scaledPos, ObjectRotation);
    vec3 finalPos = rotatedPos + ObjectPosition;

    // Debug coloring
    vec3 color = vec3(
        localX * 0.5 + 0.5,   // Red = localX remapped
        localY * 0.5 + 0.5,   // Green = localY remapped
        t                      // Blue = position along tube
    );

    transformedPosition = finalPos;
    vertexColor = vec4(color, 1.0);
}
