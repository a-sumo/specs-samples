// TubeTestShader.js
// GPU sine deformation with CPU-defined tube frame
//
// Vertex encoding from TubeTest.ts:
//   position.x = localX (cos(theta) - circular frame, pre-computed on CPU)
//   position.y = t (0-1 along tube length)
//   position.z = localY (sin(theta) - circular frame, pre-computed on CPU)
//   normal.x = localX (for surface normal)
//   normal.y = localY (for surface normal)
//   normal.z = 1 for tube vertices, 0 for cap centers

input_float TubeRadius;
input_float TubeLength;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 inPos = system.getSurfacePositionObjectSpace();
    vec3 inNormal = system.getSurfaceNormalObjectSpace();
    vec2 inUV = system.getSurfaceUVCoord0();

    // Decode vertex data
    // localX/localY from texture0 (avoids position attribute issues)
    float localX = inUV.x;                // cos(theta) from CPU, range -1 to 1
    float localY = inUV.y;                // sin(theta) from CPU, range -1 to 1
    float t = inPos.y;                    // 0-1 along tube
    float isTubeVertex = inNormal.z;      // 1 = tube, 0 = cap center

    float time = system.getTimeElapsed();

    // Uniforms with fallbacks
    float radius = TubeRadius > 0.0 ? TubeRadius : 0.1;
    float tubeLen = TubeLength > 0.0 ? TubeLength : 5.0;

    // ========================================
    // DEBUG: Simple straight tube along Z axis
    // No deformation - just test if circle is preserved
    // ========================================
    float z = t * tubeLen;
    vec3 center = vec3(0.0, 0.0, z);

    // Fixed frame for straight tube along Z:
    // X axis = (1, 0, 0)
    // Y axis = (0, 1, 0)
    vec3 frameNormal = vec3(1.0, 0.0, 0.0);
    vec3 frameBinormal = vec3(0.0, 1.0, 0.0);

    // ========================================
    // Transform CPU's circular frame to world space
    // localX = cos(theta), localY = sin(theta) from CPU
    // ========================================
    vec3 offset = (localX * frameNormal + localY * frameBinormal) * radius;
    vec3 finalPos = center + offset;

    // Surface normal (for lighting if needed)
    vec3 surfaceNormal = normalize(localX * frameNormal + localY * frameBinormal);

    // ========================================
    // DEBUG: Output localX/localY as colors to verify values
    // Red = localX remapped from [-1,1] to [0,1]
    // Green = localY remapped from [-1,1] to [0,1]
    // ========================================
    vec3 color = vec3(
        localX * 0.5 + 0.5,   // Should go 0->1->0 around the tube
        localY * 0.5 + 0.5,   // Should go 0.5->1->0.5->0->0.5 around tube
        t                      // Blue = position along tube
    );

    // DEBUG: Also print the actual offset magnitude
    // If circular, offset length should equal radius everywhere
    float offsetLen = length(offset);

    transformedPosition = finalPos;
    vertexColor = vec4(color, 1.0);
}
