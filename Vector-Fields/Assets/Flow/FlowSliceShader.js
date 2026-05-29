// FlowSliceShader.js — animated flow-map of one baked field slice.
// Samples the velocity atlas (RG=vel, B=speed) at slice SliceT, advects a
// speckle pattern along the velocity (two-phase flow map), colors by speed.
// Direct color out (no PBR). Dark = transparent on Spectacles additive display.

input_texture_2d FieldTex;     // baked field atlas
input_float SliceT;            // 0..1 -> which Z slice
input_float Time;
input_float FlowSpeed;         // streak travel rate
input_float Density;           // speckle frequency
input_float Brightness;

output_vec4 vertexColor;

// atlas layout (must match export meta)
const float NZ = 54.0;
const float TX = 8.0;
const float TY = 7.0;
const float VSCALE = 2.0;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
    float a = hash21(i), b = hash21(i+vec2(1.0,0.0)), c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
vec3 ramp(float s){
    vec3 slow = vec3(0.169, 0.824, 0.290);   // green
    vec3 fast = vec3(0.133, 0.867, 1.000);   // cyan
    return mix(slow, fast, clamp((s - 0.80)/0.45, 0.0, 1.0));
}

void main(){
    vec2 uv = system.getSurfaceUVCoord0();          // in-plane (X,Y) of the slice, 0..1

    // pick the slice tile in the atlas
    float k = clamp(floor(SliceT * (NZ - 1.0) + 0.5), 0.0, NZ - 1.0);
    float col = mod(k, TX);
    float row = floor(k / TX);
    vec2 atlasUV = vec2((col + uv.x) / TX, (row + (1.0 - uv.y)) / TY);

    vec4 fs = FieldTex.sample(atlasUV);
    vec2 vel = vec2((fs.r - 0.5) * 2.0 * VSCALE, (fs.g - 0.5) * 2.0 * VSCALE);
    float speed = fs.b * VSCALE;

    // two-phase flow map: advect a speckle field along velocity, blend to avoid stretching
    float ph = Time * FlowSpeed;
    float p1 = fract(ph);
    float p2 = fract(ph + 0.5);
    float scroll = 0.16;
    float a = vnoise(uv * Density - vel * (p1 * scroll) * Density);
    float b = vnoise(uv * Density - vel * (p2 * scroll) * Density);
    float w = abs(2.0 * p1 - 1.0);
    float n = mix(a, b, w);

    // sparse bright streaks; fade where flow is slow (so the wake reads darker)
    float streak = pow(clamp(n, 0.0, 1.0), 3.0);
    float intensity = streak * Brightness * clamp(speed * 1.1, 0.05, 1.4);

    vec3 col3 = ramp(speed) * intensity;
    vertexColor = vec4(col3, intensity);
}
