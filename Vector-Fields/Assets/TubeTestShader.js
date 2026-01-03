// TubeTestShader.js
// GPU sine deformation for grid of instanced tubes
// Each tube has a unique sine curve based on its grid position
//
// Vertex encoding from TubeTest.ts:
//   position.z = t (0-1 along tube length)
//   normal.z = 1 for tube vertices, 0 for cap centers
//   texture0 = (localX, localY) unit circle coords
//   texture1 = (gridX, gridY) grid indices

input_float TubeRadius;
input_float TubeLength;
input_float GridSpacing;

output_vec3 transformedPosition;
output_vec4 vertexColor;

// Simple hash for pseudo-random values from grid position
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();

    // Decode grid position and parametric data
    float gridX = inUV1.x;                // Grid index from UV1
    float gridY = inUV1.y;                // Grid index from UV1
    float t = inPos.z;                    // Parametric position (0-1 along tube)
    float z = t * TubeLength;             // Actual Z position along tube
    float localX = inUV0.x;               // cos(theta) - unit circle
    float localY = inUV0.y;               // sin(theta) - unit circle
    float radius = TubeRadius;

    // Cap centers have normal.z < 0.5
    bool isCapCenter = (inNormal.z < 0.5);
    if (isCapCenter) {
        localX = 0.0;
        localY = 0.0;
        radius = 0.001;
    }

    // Base position from grid
    float baseX = gridX * GridSpacing;
    float baseY = gridY * GridSpacing;

    float time = system.getTimeElapsed();

    // ========================================
    // UNIQUE SINE PARAMETERS PER TUBE
    // Use grid position as seed for variation
    // ========================================
    vec2 gridSeed = vec2(gridX, gridY);
    float h1 = hash(gridSeed);
    float h2 = hash(gridSeed + vec2(17.3, 29.1));
    float h3 = hash(gridSeed + vec2(41.7, 53.3));
    float h4 = hash(gridSeed + vec2(67.9, 73.1));

    // Vary wave parameters per tube
    float waveFreq = 1.0 + h1 * 1.5;           // 1.0 to 2.5
    float waveAmp = 0.3 + h2 * 0.4;            // 0.3 to 0.7
    float wavePhase = h3 * 6.283185;           // 0 to 2*PI
    float waveDir = h4 * 6.283185;             // Direction angle for 2D displacement

    // ========================================
    // SINE WAVE DISPLACEMENT (unique per tube)
    // Displacement in XY plane based on waveDir
    // ========================================
    float sineValue = sin(z * waveFreq + time + wavePhase) * waveAmp;
    float dispX = cos(waveDir) * sineValue;
    float dispY = sin(waveDir) * sineValue;

    vec3 center = vec3(baseX + dispX, baseY + dispY, z);

    // ========================================
    // TANGENT (derivative of path)
    // ========================================
    float dSinedz = cos(z * waveFreq + time + wavePhase) * waveAmp * waveFreq;
    float dxdz = cos(waveDir) * dSinedz;
    float dydz = sin(waveDir) * dSinedz;
    vec3 tangent = normalize(vec3(dxdz, dydz, 1.0));

    // ========================================
    // PERPENDICULAR FRAME
    // For tubes along Z with XY displacement
    // ========================================
    vec3 frameNormal = normalize(vec3(-tangent.z, 0.0, tangent.x));
    vec3 frameBinormal = normalize(cross(tangent, frameNormal));

    // ========================================
    // TRANSFORM CIRCULAR CROSS-SECTION
    // ========================================
    vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
    vec3 finalPos = center + offset;

    // Color based on circular position and tube progress
    vec3 color = vec3(
        localX * 0.5 + 0.5,   // Red = around circumference
        localY * 0.5 + 0.5,   // Green = around circumference
        t                     // Blue = along tube length
    );

    transformedPosition = finalPos;
    vertexColor = vec4(color, 1.0);
}
