// CartoonCursor - Fragment shader for stylized cursor
//
// Features:
// - Fresnel rim lighting for edge glow
// - Contour/outline effect
// - Simple toon shading
// - Customizable base color

input_vec4 baseColor;
input_float fresnelPower;      // Controls rim width (default: 2.0)
input_float fresnelIntensity;  // Rim brightness (default: 1.0)
input_float outlineWidth;      // Contour thickness (default: 0.3)
input_float outlineThreshold;  // Edge detection sensitivity (default: 0.5)

output_vec4 fragColor;

void main() {
    // Get surface data
    vec3 normal = normalize(system.getSurfaceNormalWorldSpace());
    vec3 viewDir = normalize(system.getCameraPosition() - system.getSurfacePositionWorldSpace());

    // Base color
    vec3 color = baseColor.rgb;
    float alpha = baseColor.a;

    // === FRESNEL RIM EFFECT ===
    // Stronger at edges where view is tangent to surface
    float NdotV = max(0.0, dot(normal, viewDir));
    float fresnel = pow(1.0 - NdotV, fresnelPower);

    // Add rim glow - brighter version of base color
    vec3 rimColor = color + vec3(0.3);
    color = mix(color, rimColor, fresnel * fresnelIntensity);

    // === CONTOUR/OUTLINE EFFECT ===
    // Use fresnel to detect edges and darken them
    float edgeFactor = smoothstep(outlineThreshold, outlineThreshold + outlineWidth, NdotV);

    // Dark outline color
    vec3 outlineColor = color * 0.2;

    // Apply outline at edges (where NdotV is low)
    float outlineMask = 1.0 - smoothstep(0.0, outlineWidth, NdotV);
    color = mix(color, outlineColor, outlineMask * 0.8);

    // === SIMPLE TOON SHADING ===
    // Fake light from above-front
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float NdotL = dot(normal, lightDir);

    // Quantize lighting into 2-3 bands for cartoon look
    float toonShade;
    if (NdotL > 0.5) {
        toonShade = 1.0;
    } else if (NdotL > 0.0) {
        toonShade = 0.7;
    } else {
        toonShade = 0.5;
    }

    color *= toonShade;

    // === FINAL COMPOSITE ===
    // Add subtle fresnel highlight on top
    color += fresnel * fresnelIntensity * 0.3;

    // Ensure we don't exceed 1.0
    color = clamp(color, vec3(0.0), vec3(1.0));

    fragColor = vec4(color, alpha);
}
