// Marker

input_vec3 baseColor;

output_vec4 fragColor;

void main() {
    vec3 N = normalize(system.getSurfaceNormalWorldSpace());
    vec3 V = normalize(system.getCameraPosition() - system.getSurfacePositionWorldSpace());
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.0);

    fragColor = vec4(baseColor * (1.0 + fresnel), 1.0);
}
