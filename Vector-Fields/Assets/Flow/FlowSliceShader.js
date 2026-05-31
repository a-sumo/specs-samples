// FlowSliceShader.js — field-line streamlines of one baked slice.
// DATA-BASED: samples the baked 3D field atlas (FieldTex) at the current Z slice,
// decodes the velocity vector, and draws procedural lines spaced perpendicular to
// the flow (so they run ALONG it) with comet dashes travelling downstream.
// Coloured on the vivid Earth-wind-map speed ramp.

// baked field atlas (RG=velocity, B=speed)
input_texture_2d FieldTex;
// 0..1 -> which Z slice
input_float SliceT;
input_float Time;
// stripe travel rate
input_float FlowSpeed;
// streamline density
input_float Density;
input_float Brightness;

output_vec3 transformedPosition;
output_vec4 vertexColor;

const float NZ = 54.0;
const float TX = 8.0;
const float TY = 7.0;
const float VSCALE = 2.0;

vec3 ramp(float s){
    vec3 slow = vec3(0.169, 0.824, 0.290);
    vec3 fast = vec3(0.133, 0.867, 1.000);
    return mix(slow, fast, clamp((s - 0.80)/0.45, 0.0, 1.0));
}
vec2 slotUV(vec2 p, float col, float row){
    return vec2((col + clamp(p.x,0.0,1.0)) / TX, (row + (1.0 - clamp(p.y,0.0,1.0))) / TY);
}

void main(){
    vec2 uv = system.getSurfaceUVCoord0();
    float k = clamp(floor(SliceT * (NZ - 1.0) + 0.5), 0.0, NZ - 1.0);
    float col = mod(k, TX);
    float row = floor(k / TX);

    vec4 fs = FieldTex.sample(slotUV(uv, col, row));
    vec2 vel = vec2((fs.r - 0.5) * 2.0 * VSCALE, (fs.g - 0.5) * 2.0 * VSCALE);
    float speed = fs.b * VSCALE;
    float mag = length(vel);
    vec2 dir = (mag > 0.001) ? vel / mag : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);

    // streamlines: evenly spaced bands measured perpendicular to the flow,
    // so the visible strokes follow the flow direction (GravityFieldPlane trick).
    float linePhase = dot(uv, perp) * Density;
    float lineDist = abs(fract(linePhase) - 0.5) * 2.0;
    float lineW = 0.16;
    float lineMask = (1.0 - smoothstep(lineW, lineW + 0.08, lineDist)) * smoothstep(0.03, 0.30, mag);

    // travelling dashes along the flow -> motion
    float flowParam = dot(uv, dir) * (Density * 0.6) - Time * FlowSpeed * 2.0;
    float flowDist = abs(fract(flowParam) - 0.5) * 2.0;
    float dash = 0.40 + 0.60 * smoothstep(0.40, 0.62, flowDist);

    float intensity = lineMask * dash * Brightness;
    vec3 col3 = ramp(speed) * intensity;
    vertexColor = vec4(col3, intensity);

    transformedPosition = system.getSurfacePositionObjectSpace();
}
