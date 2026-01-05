// MagnetPoleShader.js
// Colors magnet surfaces based on pole orientation
// +Z (forward) = North = Red
// -Z (back) = South = Blue
// This aligns with MagneticFieldTubesShader where forward points S to N

output_vec4 fragColor;

void main() {
    // Get surface normal in object space
    vec3 normal = system.getSurfaceNormalObjectSpace();

    // Normalize to be safe
    normal = normalize(normal);

    // Use Z component to determine pole
    // +Z = North (red), -Z = South (blue)
    float poleFactor = normal.z;

    vec3 northColor = vec3(0.9, 0.15, 0.15);  // Red for north
    vec3 southColor = vec3(0.15, 0.3, 0.9);   // Blue for south
    vec3 sideColor = vec3(0.4, 0.4, 0.45);    // Gray for sides

    // Blend based on Z component
    vec3 color;
    float absZ = abs(poleFactor);

    if (poleFactor > 0.1) {
        // North-facing (red)
        color = mix(sideColor, northColor, smoothstep(0.1, 0.5, poleFactor));
    } else if (poleFactor < -0.1) {
        // South-facing (blue)
        color = mix(sideColor, southColor, smoothstep(0.1, 0.5, -poleFactor));
    } else {
        // Side faces (gray)
        color = sideColor;
    }

    fragColor = vec4(color, 1.0);
}
