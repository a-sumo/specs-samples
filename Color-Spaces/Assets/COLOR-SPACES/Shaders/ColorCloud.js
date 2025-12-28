// ColorCloud.js
// Animated mesh gradient with UV edge transparency

output_vec4 fragColor;

void main() {
    vec2 uv = system.getSurfaceUVCoord0();
    float t = system.getTimeElapsed() * 0.3;

    float n1 = sin(uv.x * 3.0 + t) * cos(uv.y * 2.0 - t * 0.7);
    float n2 = cos(uv.x * 2.5 - t * 0.5) * sin(uv.y * 3.5 + t);

    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 blue = vec3(0.3, 0.5, 1.0);
    vec3 lemonGreen = vec3(0.8, 1.0, 0.2);

    vec3 color = mix(white, blue, n1 * 0.5 + 0.5);
    color = mix(color, lemonGreen, n2 * 0.5 + 0.5);

    float edgeX = smoothstep(0.0, 0.2, uv.x) * smoothstep(1.0, 0.8, uv.x);
    float edgeY = smoothstep(0.0, 0.2, uv.y) * smoothstep(1.0, 0.8, uv.y);
    float alpha = edgeX * edgeY;

    fragColor = vec4(color, alpha);
}
