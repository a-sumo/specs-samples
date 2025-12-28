input_texture_2d spriteSheet;
input_int columns;
input_int rows;
input_int totalFrames;
input_float fps;
output_vec4 fragColor;

// Default values for color_cloud_sprite.png:
// columns: 12, rows: 10, totalFrames: 120, fps: 12

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

    vec2 frameUV = vec2(
        (float(col) + uv.x) * cellWidth,
        1.0 - (float(row) + (1.0 - uv.y)) * cellHeight
    );

    fragColor = spriteSheet.sample(frameUV);
}
