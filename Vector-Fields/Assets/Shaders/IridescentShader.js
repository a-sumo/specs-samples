// IridescentShader.js
// Creates a soap-bubble/oil-slick iridescent effect using fresnel and thin-film interference

input_float FresnelPower;
input_float ColorSpeed;
input_float Saturation;
input_float Brightness;
input_float FilmThickness;
input_float Opacity;

output_vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 thinFilmColor(float cosTheta, float thickness, float animTime) {
    float delta = 2.0 * thickness * cosTheta;
    float r = 0.5 + 0.5 * cos(delta * 10.0 + animTime * 2.0);
    float g = 0.5 + 0.5 * cos(delta * 12.0 + animTime * 2.0 + 2.094);
    float b = 0.5 + 0.5 * cos(delta * 14.0 + animTime * 2.0 + 4.188);
    return vec3(r, g, b);
}

void main() {
    float animTime = system.getTimeElapsed() * ColorSpeed;
    vec3 normal = normalize(system.getSurfaceNormalWorldSpace());
    vec3 surfacePos = system.getSurfacePositionWorldSpace();
    vec3 viewDir = normalize(system.getCameraPosition() - surfacePos);

    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, FresnelPower);

    float baseHue = fract(animTime);
    vec3 filmColor = thinFilmColor(NdotV, FilmThickness, animTime);

    float hueShift = fresnel * 0.6;
    float hue = fract(baseHue + hueShift);

    vec3 rainbowColor = hsv2rgb(vec3(hue, Saturation, Brightness));
    vec3 color = mix(rainbowColor, filmColor * Brightness, 0.4);
    color = mix(color, vec3(1.0), fresnel * 0.3);

    float sparkle = fract(sin(dot(surfacePos.xy, vec2(12.9898, 78.233)) + animTime * 5.0) * 43758.5453);
    color += sparkle * fresnel * 0.1;

    fragColor = vec4(color, Opacity);
}
