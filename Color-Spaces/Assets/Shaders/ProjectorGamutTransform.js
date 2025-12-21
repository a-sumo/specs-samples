// ProjectorGamutTransform - Vertex position modifier for gamut projection visualization
//
// Similar to ColorSpaceTransform but with projection blend:
// 1. Reads input RGB and projected RGB from texture coords
// 2. Blends between input and projected based on projectionBlend
// 3. Transforms blended result to target color space
//
// texture0.xy = input r, g
// texture1.xy = input b, projected r
// texture2.xy = projected g, projected b

input_float cubeSize;
input_int colorSpaceFrom;
input_int colorSpaceTo;
input_float blend;
input_float projectionBlend;

output_vec3 transformedPosition;
output_vec4 vertexColor;

// D65 white point
const float D65_X = 0.95047;
const float D65_Y = 1.0;
const float D65_Z = 1.08883;

float srgbToLinear(float c) {
    return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

vec3 linearRgbToXyz(float r, float g, float b) {
    return vec3(
        r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
        r * 0.2126729 + g * 0.7151522 + b * 0.072175,
        r * 0.0193339 + g * 0.119192 + b * 0.9503041
    );
}

float labF(float t) {
    float delta = 6.0 / 29.0;
    float delta3 = delta * delta * delta;
    return t > delta3 ? pow(t, 1.0 / 3.0) : t / (3.0 * delta * delta) + 4.0 / 29.0;
}

vec3 xyzToLab(vec3 xyz) {
    float fx = labF(xyz.x / D65_X);
    float fy = labF(xyz.y / D65_Y);
    float fz = labF(xyz.z / D65_Z);
    return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

vec3 xyzToLuv(vec3 xyz) {
    float yr = xyz.y / D65_Y;
    float delta = 6.0 / 29.0;
    float delta3 = delta * delta * delta;
    float L = yr > delta3 ? 116.0 * pow(yr, 1.0 / 3.0) - 16.0 : pow(29.0 / 3.0, 3.0) * yr;

    float denom = xyz.x + 15.0 * xyz.y + 3.0 * xyz.z;
    if (denom < 0.0001) return vec3(L, 0.0, 0.0);

    float u1 = (4.0 * xyz.x) / denom;
    float v1 = (9.0 * xyz.y) / denom;
    float denomR = D65_X + 15.0 * D65_Y + 3.0 * D65_Z;
    float u1r = (4.0 * D65_X) / denomR;
    float v1r = (9.0 * D65_Y) / denomR;

    return vec3(L, 13.0 * L * (u1 - u1r), 13.0 * L * (v1 - v1r));
}

vec3 linearRgbToOklab(float r, float g, float b) {
    float l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    float m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    float s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);

    return vec3(
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
    );
}

// RGB space position (base position, mesh is generated in this space)
vec3 rgbSpacePosition(float r, float g, float b, float size) {
    return vec3((r - 0.5) * size, (b - 0.5) * size, (g - 0.5) * size);
}

// Color space indices:
// 0 = RGB
// 1 = CIELAB
// 2 = CIEXYZ
// 3 = Oklab
// 4 = CIELUV

vec3 colorSpacePosition(float r, float g, float b, int space, float size) {
    if (space == 0) {
        return rgbSpacePosition(r, g, b, size);
    }

    float lr = srgbToLinear(r);
    float lg = srgbToLinear(g);
    float lb = srgbToLinear(b);

    if (space == 1) {
        // CIELAB
        vec3 xyz = linearRgbToXyz(lr, lg, lb);
        vec3 lab = xyzToLab(xyz);
        return vec3(
            (lab.y / 128.0) * size * 0.5,
            (lab.x / 100.0 - 0.5) * size,
            (lab.z / 128.0) * size * 0.5
        );
    }

    if (space == 2) {
        // CIEXYZ
        vec3 xyz = linearRgbToXyz(lr, lg, lb);
        return vec3(
            (xyz.x - 0.5) * size,
            (xyz.y - 0.5) * size,
            (xyz.z - 0.5) * size
        );
    }

    if (space == 3) {
        // Oklab
        vec3 oklab = linearRgbToOklab(lr, lg, lb);
        return vec3(
            (oklab.y / 0.4) * size * 0.5,
            (oklab.x - 0.5) * size,
            (oklab.z / 0.4) * size * 0.5
        );
    }

    if (space == 4) {
        // CIELUV
        vec3 xyz = linearRgbToXyz(lr, lg, lb);
        vec3 luv = xyzToLuv(xyz);
        return vec3(
            (luv.y / 200.0) * size * 0.5,
            (luv.x / 100.0 - 0.5) * size,
            (luv.z / 200.0) * size * 0.5
        );
    }

    return rgbSpacePosition(r, g, b, size);
}

void main() {
    // Get input and projected RGB from texture coordinates
    vec2 uv0 = system.getSurfaceUVCoord0();
    vec2 uv1 = system.getSurfaceUVCoord1();
    vec2 uv2 = system.getSurfaceUVCoord2();

    // Input RGB
    float inR = uv0.x;
    float inG = uv0.y;
    float inB = uv1.x;

    // Projected RGB
    float prR = uv1.y;
    float prG = uv2.x;
    float prB = uv2.y;

    // Blend between input and projected based on projectionBlend
    float pb = clamp(projectionBlend, 0.0, 1.0);
    float r = mix(inR, prR, pb);
    float g = mix(inG, prG, pb);
    float b = mix(inB, prB, pb);

    // Current vertex position (object space, generated in RGB space using input colors)
    vec3 vertexPos = system.getSurfacePositionObjectSpace();

    // Where the input RGB center is in RGB space (mesh was generated here)
    vec3 rgbCenter = rgbSpacePosition(inR, inG, inB, cubeSize);

    // Calculate positions for blended color in both color spaces
    vec3 fromCenter = colorSpacePosition(r, g, b, colorSpaceFrom, cubeSize);
    vec3 toCenter = colorSpacePosition(r, g, b, colorSpaceTo, cubeSize);

    // Interpolate between the two color spaces
    float t = clamp(blend, 0.0, 1.0);
    vec3 targetCenter = mix(fromCenter, toCenter, t);

    // Vertex offset from center (cube half-size, etc.)
    vec3 offset = vertexPos - rgbCenter;

    // Final position: target center + preserved offset
    transformedPosition = targetCenter + offset;

    // Output RGBA color (blended between input and projected)
    vertexColor = vec4(r, g, b, 1.0);
}
