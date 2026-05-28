// FieldLines.js — DEBUG: hardcoded single tube to isolate the render pipeline.
// Ignores all uniforms; renders a straight orange tube 20cm tall at world z=-50.
// If you see this, mesh + material + Transform Vector wiring all work, and the
// "no geo" symptom is in the integration/uniforms (not in the pipeline).

input_vec3 ChargeAPos;
input_vec3 ChargeBPos;
input_float StrengthA;
input_float StrengthB;
input_float SeedRadius;
input_float StepSize;
input_float TubeRadius;
input_float MaxSteps;

output_vec3 transformedPosition;
output_vec3 transformedNormal;
output_vec4 vertexColor;

void main() {
    vec2 inUV0 = system.getSurfaceUVCoord0();
    vec2 inUV1 = system.getSurfaceUVCoord1();

    float cosT = inUV0.x;
    float sinT = inUV0.y;
    float t    = inUV1.x;

    // Hardcoded straight tube: 20cm tall, centered at (0, 0, -50), radius 1cm.
    vec3 center   = vec3(0.0, t * 20.0 - 10.0, -50.0);
    vec3 normal   = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 radial   = cosT * normal + sinT * binormal;
    vec3 finalPos = center + radial * 1.0;

    transformedPosition = finalPos;
    transformedNormal   = normalize(radial);
    vertexColor         = vec4(1.0, 0.5, 0.1, 1.0);
}
