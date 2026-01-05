// DetectionOverlay Custom Code Node
// Draws bounding boxes and pose axes over input texture
// Each Det mat4 packs: row0=bbox(x1,y1,x2,y2), row1=rotA(r0,r1,r2,_), row2=rotB(r3,r4,r5,_), row3=color

input_texture_2d InputTexture;
input_mat4 Det0;
input_mat4 Det1;
input_mat4 Det2;
input_float NumDetections;
input_float BorderWidth;
input_float ArrowLength;
input_float ArrowWidth;
output_vec4 Output;

float drawArrow(vec2 uv, vec2 start, vec2 dir, float len, float width)
{
    vec2 toPoint = uv - start;
    float along = dot(toPoint, dir);
    float perp = abs(dot(toPoint, vec2(-dir.y, dir.x)));

    float shaftLen = len * 0.75;
    float onArrow = 0.0;

    if (along >= 0.0 && along <= shaftLen && perp <= width * 0.5)
    {
        onArrow = 1.0;
    }

    float headProgress = (along - shaftLen) / (len * 0.25);
    if (along > shaftLen && along <= len)
    {
        float headWidth = width * 1.5 * (1.0 - headProgress);
        if (perp <= headWidth)
        {
            onArrow = 1.0;
        }
    }

    return onArrow;
}

vec4 processDet(vec2 uv, mat4 det, float bw, float arrowLen, float arrowW)
{
    vec4 box = det[0];
    vec3 rotA = det[1].xyz;
    vec3 rotB = det[2].xyz;
    vec4 color = det[3];

    float x1 = box.x;
    float y1 = box.y;
    float x2 = box.z;
    float y2 = box.w;

    if (x2 <= x1 || y2 <= y1)
    {
        return vec4(0.0);
    }

    vec2 center = vec2((x1 + x2) * 0.5, (y1 + y2) * 0.5);

    bool inBoxX = uv.x >= x1 - bw && uv.x <= x2 + bw;
    bool inBoxY = uv.y >= y1 - bw && uv.y <= y2 + bw;
    bool onBorder = (uv.x >= x1 - bw && uv.x <= x1 + bw && inBoxY) ||
                    (uv.x >= x2 - bw && uv.x <= x2 + bw && inBoxY) ||
                    (uv.y >= y2 - bw && uv.y <= y2 + bw && inBoxX) ||
                    (uv.y >= y1 - bw && uv.y <= y1 + bw && inBoxX);

    if (onBorder)
    {
        return color;
    }

    vec3 colA = normalize(rotA);
    vec3 colB = normalize(rotB - dot(rotB, colA) * colA);
    vec3 colC = cross(colA, colB);

    vec2 xDir = normalize(vec2(colA.x, -colA.y));
    vec2 yDir = normalize(vec2(colB.x, -colB.y));
    vec2 zDir = normalize(vec2(colC.x, -colC.y));

    if (drawArrow(uv, center, xDir, arrowLen, arrowW) > 0.5)
    {
        return vec4(1.0, 0.2, 0.2, 1.0);
    }
    if (drawArrow(uv, center, yDir, arrowLen, arrowW) > 0.5)
    {
        return vec4(0.2, 1.0, 0.2, 1.0);
    }
    if (drawArrow(uv, center, zDir, arrowLen, arrowW) > 0.5)
    {
        return vec4(0.3, 0.3, 1.0, 1.0);
    }

    return vec4(0.0);
}

void main()
{
    vec2 uv = system.getSurfaceUVCoord0();
    vec4 texColor = InputTexture.sample(uv);

    int numDet = int(NumDetections);
    float bw = BorderWidth;
    float arrowLen = ArrowLength;
    float arrowW = ArrowWidth;

    vec4 overlay = vec4(0.0);

    if (numDet >= 1)
    {
        vec4 c = processDet(uv, Det0, bw, arrowLen, arrowW);
        if (c.a > 0.0) overlay = c;
    }
    if (numDet >= 2)
    {
        vec4 c = processDet(uv, Det1, bw, arrowLen, arrowW);
        if (c.a > 0.0) overlay = c;
    }
    if (numDet >= 3)
    {
        vec4 c = processDet(uv, Det2, bw, arrowLen, arrowW);
        if (c.a > 0.0) overlay = c;
    }

    Output = mix(texColor, overlay, overlay.a);
}
