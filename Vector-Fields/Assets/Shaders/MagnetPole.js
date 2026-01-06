// MagnetPoleShader.js
// Colors magnet surfaces based on pole orientation
// +X = North = Red (aligned with capsule mesh axis)
// -X = South = Blue

output_vec4 fragColor;

void main() {
    // Get surface normal in object space
    vec3 normal = system.getSurfaceNormalObjectSpace();

    // Normalize to be safe
    normal = normalize(normal);

    // Use X component to determine pole (capsule axis)
    // +X = North (red), -X = South (blue)
    float poleFactor = normal.x;

    vec3 northColor = vec3(0.9, 0.15, 0.15);  // Red for north
    vec3 southColor = vec3(0.15, 0.3, 0.9);   // Blue for south
    vec3 sideColor = vec3(0.9, 0.9, 0.92);    // White for sides

    // Blend based on X component
    vec3 color;

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
