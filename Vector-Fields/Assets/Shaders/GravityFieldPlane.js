// GravityFieldPlane.js
// GPU gravity field visualization on a flat XZ plane.
// All sampling, contour rendering, and well displacement run per-vertex on the GPU
// from two body uniforms. Body motion costs only a uniform write per frame.

input_vec3 EarthPos;
input_vec3 MoonPos;
input_float EarthMass;
input_float MoonMass;
input_float Softening;
input_float WellDepth;
input_float DepthScale;
input_float ContourCount;
input_float ContourThickness;
input_float FlowSpeed;
input_float FlowScale;
input_vec4 ContourColor;
input_vec4 ColorLow;
input_vec4 ColorHigh;
input_vec4 EarthTint;
input_vec4 MoonTint;
input_float OpacityScale;

output_vec3 transformedPosition;
output_vec4 vertexColor;

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec3 sampleP = vec3(pos.x, 0.0, pos.z);

    // Softening avoids 1/0 at the body center. Moon gets a tighter core so its
    // well stays sharp despite being far smaller than Earth's.
    float soft = max(Softening, 0.01);
    float softE2 = soft * soft;
    float softM2 = soft * soft * 0.45 * 0.45;

    vec3 dE = sampleP - EarthPos;
    vec3 dM = sampleP - MoonPos;
    float rE = sqrt(dot(dE, dE) + softE2);
    float rM = sqrt(dot(dM, dM) + softM2);

    float potE = EarthMass / rE;
    float potM = MoonMass / rM;
    float potential = potE + potM;

    // Vertical displacement = scaled potential. Negative Y dips down into the well.
    float displacement = -potential * WellDepth * DepthScale;
    transformedPosition = vec3(pos.x, displacement, pos.z);

    // Field vector for flow stripes (XZ only, force = sum of mass*(body-pos)/r^3).
    float invE3 = 1.0 / (rE * rE * rE);
    float invM3 = 1.0 / (rM * rM * rM);
    vec2 fieldXZ = vec2(EarthPos.x - sampleP.x, EarthPos.z - sampleP.z) * EarthMass * invE3
                 + vec2(MoonPos.x - sampleP.x,  MoonPos.z  - sampleP.z) * MoonMass  * invM3;
    float fieldMag = length(fieldXZ);
    vec2 fieldDir = (fieldMag > 0.0001) ? fieldXZ / fieldMag : vec2(1.0, 0.0);

    // Heatmap by potential intensity. The log keeps the Earth well readable
    // while preserving the Moon's smaller field.
    float logPotential = log(1.0 + potential * 0.6);
    float intensity = smoothstep(0.75, 2.65, logPotential);
    intensity = pow(clamp(intensity, 0.0, 1.0), 1.35);
    vec3 baseColor = mix(ColorLow.rgb, ColorHigh.rgb, intensity);

    // Iso-potential contour lines. Using log-potential spaces the isolines
    // evenly across the gravity well and keeps the density readable near masses.
    float isoPhase = logPotential * ContourCount;
    float isoDist = abs(fract(isoPhase) - 0.5) * 2.0;
    float isoWidth = clamp(ContourThickness, 0.01, 0.45);
    float isoCore = 1.0 - smoothstep(0.0, isoWidth, isoDist);
    float isoHalo = 1.0 - smoothstep(isoWidth, min(1.0, isoWidth * 2.8), isoDist);
    float contourMask = clamp(isoCore + isoHalo * 0.32, 0.0, 1.0) * ContourColor.a;

    // Flow stripes: animate along field direction so the field "moves."
    float flowParam = dot(vec2(sampleP.x, sampleP.z), fieldDir) * FlowScale
                    + system.getTimeElapsed() * FlowSpeed;
    float flowDist = abs(fract(flowParam) - 0.5) * 2.0;
    float flowStripe = smoothstep(0.45, 0.7, flowDist);
    float flowMask = flowStripe * smoothstep(0.05, 0.6, fieldMag) * 0.22;

    vec3 finalColor = baseColor;
    finalColor = mix(finalColor, ContourColor.rgb, contourMask);
    finalColor = finalColor + ContourColor.rgb * (flowMask * 0.28 + isoHalo * 0.10);

    float alpha = max(clamp(intensity * 0.85 + 0.18, 0.0, 1.0), contourMask * 0.95) * OpacityScale;
    vertexColor = vec4(finalColor * alpha, alpha);
}
