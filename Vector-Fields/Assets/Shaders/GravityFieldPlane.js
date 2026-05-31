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
input_vec4 FieldLineColor;
input_vec4 ArrowColor;
input_float FieldLineDensity;
input_float FieldLineWidth;
input_float ArrowSpacing;
input_float ArrowScale;

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
    // while preserving the Moon's smaller field. The low end is widened so the
    // tint reaches across the whole plane instead of clustering at the cores.
    float logPotential = log(1.0 + potential * 0.6);
    float intensity = smoothstep(0.18, 2.45, logPotential);
    intensity = pow(clamp(intensity, 0.0, 1.0), 1.2);
    vec3 baseColor = mix(ColorLow.rgb, ColorHigh.rgb, intensity);

    // Iso-potential contour lines. Spacing on the reciprocal of the potential
    // makes the rings roughly evenly spaced in distance, so they keep filling
    // the plane out to the edge instead of bunching up near the masses.
    float isoMetric = 1.0 / (0.35 + potential);
    float isoPhase = isoMetric * ContourCount * 1.4;
    float isoDist = abs(fract(isoPhase) - 0.5) * 2.0;
    float isoWidth = clamp(ContourThickness, 0.01, 0.45);
    float isoCore = 1.0 - smoothstep(0.0, isoWidth, isoDist);
    float isoHalo = 1.0 - smoothstep(isoWidth, min(1.0, isoWidth * 2.8), isoDist);
    float contourMask = clamp(isoCore + isoHalo * 0.32, 0.0, 1.0) * ContourColor.a;

    // Normalized field strength, used to scale (not hide) the overlays so they
    // stay visible far from the masses where the raw magnitude is tiny.
    float fieldStrength = fieldMag / (fieldMag + 0.05);

    // Field lines: a procedural tangent-line overlay. The local line coordinate
    // is measured perpendicular to the gravity vector, so the visible strokes
    // follow the pull direction while staying separate from the iso-potential rings.
    vec2 fieldPerp = vec2(-fieldDir.y, fieldDir.x);
    float fieldLinePhase = dot(vec2(sampleP.x, sampleP.z), fieldPerp) * max(FieldLineDensity, 0.05);
    float fieldLineDist = abs(fract(fieldLinePhase) - 0.5) * 2.0;
    float fieldLineWidth = clamp(FieldLineWidth, 0.005, 0.45);
    float fieldLineMask = (1.0 - smoothstep(fieldLineWidth, fieldLineWidth + 0.055, fieldLineDist))
                        * FieldLineColor.a
                        * mix(0.55, 1.0, fieldStrength);

    // Arrow glyphs sampled on a grid. Each cell reads the gravity field at
    // its center, then draws a small shaft + triangular head in that direction.
    float spacing = max(ArrowSpacing, 0.9);
    vec2 planeP = vec2(sampleP.x, sampleP.z);
    vec2 cellCenter = (floor(planeP / spacing) + vec2(0.5)) * spacing;
    vec3 cellP = vec3(cellCenter.x, 0.0, cellCenter.y);
    vec3 cdE = cellP - EarthPos;
    vec3 cdM = cellP - MoonPos;
    float crE = sqrt(dot(cdE, cdE) + softE2);
    float crM = sqrt(dot(cdM, cdM) + softM2);
    vec2 cellField = vec2(EarthPos.x - cellP.x, EarthPos.z - cellP.z) * EarthMass / (crE * crE * crE)
                   + vec2(MoonPos.x - cellP.x,  MoonPos.z  - cellP.z) * MoonMass  / (crM * crM * crM);
    float cellMag = length(cellField);
    vec2 arrowDir = (cellMag > 0.0001) ? cellField / cellMag : vec2(1.0, 0.0);
    vec2 arrowPerp = vec2(-arrowDir.y, arrowDir.x);
    vec2 rel = planeP - cellCenter;
    // Scale each glyph by a normalized strength so near-mass arrows read long
    // and far-field arrows stay short but visible — never gated fully off.
    float cellStrength = cellMag / (cellMag + 0.06);
    float arrowLen = spacing * clamp(ArrowScale, 0.1, 1.2) * mix(0.5, 1.0, cellStrength);
    float u = dot(rel, arrowDir);
    float v = dot(rel, arrowPerp);
    float tail = -0.34 * arrowLen;
    float headBase = 0.10 * arrowLen;
    float tip = 0.36 * arrowLen;
    float shaftWidth = 0.040 * arrowLen + 0.020;
    float headWidth = 0.155 * arrowLen + 0.025;
    float arrowAA = max(0.018, spacing * 0.025);
    float shaftMask = (1.0 - smoothstep(shaftWidth, shaftWidth + arrowAA, abs(v)))
                    * step(tail, u) * step(u, headBase);
    float headT = clamp((tip - u) / max(tip - headBase, 0.001), 0.0, 1.0);
    float headMask = (1.0 - smoothstep(headWidth * headT, headWidth * headT + arrowAA, abs(v)))
                   * step(headBase, u) * step(u, tip);
    float bodyFade = smoothstep(0.50, 1.25, min(crE, crM));
    float arrowMask = max(shaftMask, headMask)
                    * ArrowColor.a
                    * bodyFade;

    // Flow stripes: animate along field direction so the field "moves."
    float flowParam = dot(vec2(sampleP.x, sampleP.z), fieldDir) * FlowScale
                    + system.getTimeElapsed() * FlowSpeed;
    float flowDist = abs(fract(flowParam) - 0.5) * 2.0;
    float flowStripe = smoothstep(0.45, 0.7, flowDist);
    float flowMask = flowStripe * smoothstep(0.05, 0.6, fieldMag) * 0.22;

    vec3 finalColor = baseColor;
    finalColor = mix(finalColor, ContourColor.rgb, contourMask);
    finalColor = mix(finalColor, FieldLineColor.rgb, fieldLineMask);
    finalColor = mix(finalColor, ArrowColor.rgb, arrowMask);
    finalColor = finalColor + ContourColor.rgb * (flowMask * 0.28 + isoHalo * 0.10);
    finalColor = clamp(finalColor * 1.15, 0.0, 1.0);

    float overlayAlpha = max(max(contourMask * 0.95, fieldLineMask * 0.82), arrowMask);
    float alpha = max(clamp(intensity * 0.82 + 0.26, 0.0, 1.0), overlayAlpha) * OpacityScale;
    vertexColor = vec4(finalColor * alpha, alpha);
}
