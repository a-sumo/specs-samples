input_texture_2d BaseTex;
input_float FadeStart;
input_float FadeEnd;
input_float Brightness;
input_float MaxAlpha;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec2 uv = system.getSurfaceUVCoord0();
    vec4 tex = BaseTex.sample(uv);

    float fade = smoothstep(FadeStart, FadeEnd, uv.x);
    float alpha = clamp(tex.a * fade * MaxAlpha, 0.0, 1.0);

    vec3 color = clamp(tex.rgb * Brightness, 0.0, 1.0);

    transformedPosition = system.getSurfacePositionObjectSpace();
    vertexColor = vec4(color * alpha, alpha);
}
Ï