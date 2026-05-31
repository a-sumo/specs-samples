// GuidePanelHover.js
// Full-panel texture material with UIKit-Frame-style cursor hover baked into
// the same surface. This avoids a separate hover decal fighting panel depth.

input_texture_2d baseTex;
input_vec4 HoverData;

output_vec4 vertexColor;

void main() {
    vec2 uv = system.getSurfaceUVCoord0();
    vec4 baseSample = baseTex.sample(uv);

    vec2 cursorUv = clamp(HoverData.xy, 0.0, 1.0);
    float hovered = clamp(HoverData.z, 0.0, 1.0);
    float press = clamp(HoverData.w, 0.0, 1.0);

    vec2 aspect = vec2(1.5, 1.0);
    vec2 d = (uv - cursorUv) * aspect;
    float r2 = dot(d, d);

    float core = exp(-r2 * 34.0);
    float halo = exp(-r2 * 7.0);
    float outer = exp(-r2 * 2.1);

    float luma = dot(baseSample.rgb, vec3(0.299, 0.587, 0.114));
    float backgroundMask = 1.0 - smoothstep(0.48, 0.86, luma);
    float alphaMask = smoothstep(0.05, 0.45, baseSample.a);
    float signal = hovered * backgroundMask * alphaMask;

    vec3 coolWash = vec3(0.62, 0.72, 0.86);
    vec3 warmCenter = vec3(1.0, 0.96, 0.82);
    vec3 hoverColor = coolWash * (outer * 0.10 + halo * 0.24) + warmCenter * core * (0.20 + press * 0.10);

    vec3 color = baseSample.rgb + hoverColor * signal;
    color = clamp(color, 0.0, 1.0);

    float alpha = clamp(baseSample.a + signal * (halo * 0.035 + core * 0.05), 0.0, 1.0);
    vertexColor = vec4(color * alpha, alpha);
}
