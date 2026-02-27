input_texture_2d expansionSheet;
input_texture_2d contractionSheet;
input_texture_2d circulationSheet;
input_texture_2d wavesSheet;
input_texture_2d vortexSheet;
input_texture_2d magneticSheet;

input_int preset;
input_int prevPreset;
input_float blendAmount;
input_int columns;
input_int rows;
input_int totalFrames;
input_float fps;

output_vec4 fragColor;

vec4 samplePreset(int p, vec2 frameUV) {
    if (p == 0) {
        return expansionSheet.sample(frameUV);
    }
    if (p == 1) {
        return contractionSheet.sample(frameUV);
    }
    if (p == 2) {
        return circulationSheet.sample(frameUV);
    }
    if (p == 3) {
        return wavesSheet.sample(frameUV);
    }
    if (p == 4) {
        return vortexSheet.sample(frameUV);
    }
    if (p == 5) {
        return magneticSheet.sample(frameUV);
    }
    return vec4(0.0);
}

void main()
{
    vec2 uv = system.getSurfaceUVCoord0();
    float time = system.getTimeElapsed();

    float frameDuration = 1.0 / fps;
    float totalDuration = float(totalFrames) * frameDuration;
    float loopedTime = mod(time, totalDuration);
    int frameIndex = int(floor(loopedTime / frameDuration));

    int col = frameIndex - (frameIndex / columns) * columns;
    int row = frameIndex / columns;

    float cellWidth = 1.0 / float(columns);
    float cellHeight = 1.0 / float(rows);

    float cellLeft = float(col) * cellWidth;
    float cellTop = 1.0 - float(row) * cellHeight;
    float cellBottom = cellTop - cellHeight;

    vec2 frameUV = vec2(
        cellLeft + uv.x * cellWidth,
        mix(cellBottom, cellTop, uv.y)
    );

    vec4 fromColor = samplePreset(prevPreset, frameUV);
    vec4 toColor = samplePreset(preset, frameUV);

    float t = clamp(blendAmount, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);

    fragColor = mix(fromColor, toColor, t);
}
