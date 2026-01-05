// DetectionOverlay Custom Code Node
// Draws bounding boxes over input texture based on detection UVs
// Pass detection data via Box0-Box4 (vec4: x1, y1, x2, y2 in UV coords 0-1)
// Pass colors via Color0-Color4

input_texture_2d InputTexture;
input_vec4 Box0;
input_vec4 Box1;
input_vec4 Box2;
input_vec4 Box3;
input_vec4 Box4;
input_vec4 Color0;
input_vec4 Color1;
input_vec4 Color2;
input_vec4 Color3;
input_vec4 Color4;
input_float BorderWidth;
input_float NumDetections;
output_vec4 Output;

void main()
{
    vec2 uv = system.getSurfaceUVCoord0();

    vec4 texColor = InputTexture.sample(uv);
    vec4 boxColor = vec4(0.0);
    float onBorder = 0.0;

    float bw = BorderWidth;

    vec4 boxes[5];
    boxes[0] = Box0;
    boxes[1] = Box1;
    boxes[2] = Box2;
    boxes[3] = Box3;
    boxes[4] = Box4;

    vec4 colors[5];
    colors[0] = Color0;
    colors[1] = Color1;
    colors[2] = Color2;
    colors[3] = Color3;
    colors[4] = Color4;

    int numDet = int(NumDetections);

    for (int i = 0; i < 5; i++)
    {
        if (i >= numDet)
        {
            break;
        }

        vec4 box = boxes[i];
        float x1 = box.x;
        float y1 = box.y;
        float x2 = box.z;
        float y2 = box.w;

        bool inBoxX = uv.x >= x1 - bw && uv.x <= x2 + bw;
        bool inBoxY = uv.y >= y1 - bw && uv.y <= y2 + bw;

        bool onLeft = uv.x >= x1 - bw && uv.x <= x1 + bw && inBoxY;
        bool onRight = uv.x >= x2 - bw && uv.x <= x2 + bw && inBoxY;
        bool onTop = uv.y >= y1 - bw && uv.y <= y1 + bw && inBoxX;
        bool onBottom = uv.y >= y2 - bw && uv.y <= y2 + bw && inBoxX;

        if (onLeft || onRight || onTop || onBottom)
        {
            boxColor = colors[i];
            onBorder = 1.0;
        }
    }

    Output = mix(texColor, boxColor, onBorder * boxColor.a);
}
