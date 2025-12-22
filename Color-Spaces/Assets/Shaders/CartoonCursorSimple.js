// CartoonCursorSimple - Minimal cartoon shader for cursor
//
// Simple fresnel rim + contour effect
// Plug into material graph, connect output to Final Color

input_vec4 baseColor;       // Base surface color
input_float rimPower;       // Fresnel exponent (2.0 = soft, 5.0 = sharp)
input_float rimStrength;    // Rim glow intensity (0.0 - 1.0)

output_vec4 fragColor;

void main() {
    vec3 N = normalize(system.getSurfaceNormalWorldSpace());
    vec3 V = normalize(system.getCameraPosition() - system.getSurfacePositionWorldSpace());

    float NdotV = max(0.0, dot(N, V));

    // Fresnel: bright rim at edges
    float rim = pow(1.0 - NdotV, rimPower);

    // Contour: dark line at silhouette
    float contour = smoothstep(0.0, 0.25, NdotV);

    // Compose
    vec3 color = baseColor.rgb;

    // Add bright rim
    color += rim * rimStrength * vec3(1.0);

    // Darken contour edges
    color *= mix(0.15, 1.0, contour);

    fragColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), baseColor.a);
}
