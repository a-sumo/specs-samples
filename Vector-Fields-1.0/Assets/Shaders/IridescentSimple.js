// IridescentSimple.js
// Simple rainbow iridescent effect with fresnel-based hue shift

input_float Speed;
input_float Power;

output_vec4 fragColor;

vec3 hsv2rgb(float h, float s, float v) {
    vec3 c = vec3(h, s, v);
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    float animTime = system.getTimeElapsed() * Speed;
    vec3 N = normalize(system.getSurfaceNormalWorldSpace());
    vec3 surfacePos = system.getSurfacePositionWorldSpace();
    vec3 V = normalize(system.getCameraPosition() - surfacePos);

    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, Power);

    float hue = fract(animTime + fresnel * 0.5);
    vec3 color = hsv2rgb(hue, 0.7, 0.95);
    color = mix(color, vec3(1.0), fresnel * 0.4);

    fragColor = vec4(color, 0.9);
}
