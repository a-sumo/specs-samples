# ONNX Model Compatibility for Lens Studio & Spectacles

This document details the modifications required to make ONNX models compatible with Lens Studio/SnapML, specifically for deployment on Spectacles.

---

## Table of Contents
1. [Models Modified](#models-modified)
2. [Unsupported ONNX Operations](#unsupported-onnx-operations)
3. [Modifications Made](#modifications-made)
4. [Lens Studio / SnapML Limitations](#lens-studio--snapml-limitations)
5. [Model Specifications](#model-specifications)
6. [Post-Processing in JavaScript](#post-processing-in-javascript)
7. [References](#references)

---

## Models Modified

### 1. CenterSnapAE_sim.onnx
**Original Error:** `"shape is invalid for the inputs"`

**Issue:** This is an AutoEncoder decoder model that expects a 128-dimensional latent vector input, not an image. Lens Studio was likely trying to feed it a camera texture.

| | Original | Notes |
|---|---|---|
| Input | `input.1: [1, 128]` | 128-dim latent vector (float32) |
| Output | `30: [1, 128]` | Reconstructed latent |
| Output | `29: [1, 2048, 3]` | Point cloud (2048 points × 3D) |

**Resolution:** This model requires a latent vector input, not an image. You need to either:
- Feed it output from an encoder model, or
- Provide latent codes via JavaScript `Float32Array`

### 2. yolox_s_object_pose.onnx
**Original Error:** `"Exception at layer '/1/Gather_8': The ONNX model's embedding layer second input must be indices"`

**Issue:** The model contained post-processing operations with dynamic shapes that Lens Studio cannot handle.

**Resolution:** Created `yolox_s_object_pose_lens.onnx` with post-processing removed. See [Modifications Made](#modifications-made).

---

## Unsupported ONNX Operations

Based on testing and research, the following ONNX operations are **NOT supported** in Lens Studio/SnapML:

| Operation | Why It's Used | Workaround |
|-----------|--------------|------------|
| `ScatterND` | In-place tensor updates, rotation normalization | Remove from model, implement in JS |
| `GatherND` | Dynamic index gathering for NMS results | Remove from model, implement in JS |
| `NonMaxSuppression` | Filtering overlapping detections | Remove from model, implement in JS |
| `NonZero` | Finding non-zero indices for filtering | Remove from model, implement in JS |
| Dynamic `Gather` | Gathering with runtime-determined indices | Use static indices or implement in JS |

### Additional Limitations
- **Dynamic shapes**: Operations that produce variable-sized outputs are not supported
- **Model size**: Maximum 10MB recommended for SnapML assets
- **Simultaneous detections**: Recommend limiting to 3-5 objects (max ~10) for performance

---

## Modifications Made

### yolox_s_object_pose.onnx → yolox_s_object_pose_lens.onnx

**Nodes removed:** 129 (460 → 331 nodes)
**Size reduced:** 51.69 MB → 44.31 MB

#### What Was Removed

1. **Rotation normalization via ScatterND** (6 operations)
   - The original model normalized 6D rotation vectors using ScatterND
   - Now outputs raw rotation predictions

2. **Bounding box decoding via ScatterND** (4 operations)
   - Grid offset addition and stride scaling
   - Now outputs raw regression values

3. **NonMaxSuppression pipeline** (all NMS-related nodes)
   - `NonZero` - finding valid detections
   - `NonMaxSuppression` - filtering overlapping boxes
   - `GatherND` - collecting NMS results
   - `Gather` with dynamic indices - final output selection

#### Original vs Modified Output Comparison

| Aspect | Original Model | Modified Model |
|--------|---------------|----------------|
| Outputs | 1 (`detections`) | 3 (per FPN scale) |
| Shape | `[1, N, 35]` (dynamic N) | Fixed shapes (see below) |
| Bbox format | Decoded (x1,y1,x2,y2 pixels) | Raw offsets (need decoding) |
| Objectness | Sigmoid applied | Raw logits |
| Class scores | Sigmoid applied | Raw logits |
| Rotation | Normalized vectors | Raw 6D values |
| Translation | Fully decoded | Partially decoded |

---

## Lens Studio / SnapML Limitations

### General Constraints

1. **Model Format**: Only `.onnx` and `.tflite` supported
2. **Model Size**: Up to 10MB (smaller is better for loading times)
3. **Input**: Typically camera texture, but can be custom data
4. **Output**: Tensors with ≤4 channels can auto-generate textures

### Operation Support

Lens Studio converts ONNX to internal `.dnn` format. During import:
- A compatibility table shows which ops work on CPU/GPU/NPU
- Unsupported ops will show warning icons (hover for details)
- Some ops may work on CPU but not GPU

### Spectacles-Specific Notes

- Recommend YOLOv7-tiny or similar lightweight models
- Input resolution 224×224 suggested for real-time performance
- NMS should be excluded from graph and implemented in JavaScript
- Test with "No Simulation" preview mode before device deployment

### Known ONNX Export Issues

PyTorch/TensorFlow → ONNX conversion can produce complex patterns:
- Single ops may become `Gather` + `Transpose` chains
- Patterns vary across ONNX opset versions
- Snap's converter may fail with upstream framework changes

---

## Model Specifications

### yolox_s_object_pose_lens.onnx

**Input:**
```
images: [1, 3, 480, 640] (float32, RGB, normalized 0-1)
```

**Outputs:**
```
output_stride8:  [1, 35, 60, 80]  → 4800 anchors (stride 8, small objects)
output_stride16: [1, 35, 30, 40]  → 1200 anchors (stride 16, medium objects)
output_stride32: [1, 35, 15, 20]  →  300 anchors (stride 32, large objects)
                                    ─────
                                    6300 total anchors
```

**35 Channels per Anchor:**
```
Index   | Content              | Post-processing needed
--------|----------------------|------------------------
[0:2]   | Center offset (x,y)  | Add grid position, multiply by stride
[2:4]   | Size (w,h)           | Apply exp(), multiply by stride
[4]     | Objectness           | Apply sigmoid
[5:26]  | Class scores (21)    | Apply sigmoid, find argmax
[26:32] | Rotation 6D          | Normalize to rotation matrix
[32:34] | Translation (x,y)    | Decode with camera intrinsics
[34]    | Translation (z)      | Apply exp(), scale appropriately
```

### Anchor Grid Positions

The model uses anchor-free detection with grid positions:

| Scale | Stride | Grid Size | Anchors | Grid Positions |
|-------|--------|-----------|---------|----------------|
| 0 | 8 | 60×80 | 4800 | (0.5, 0.5) to (79.5, 59.5) × 8 |
| 1 | 16 | 30×40 | 1200 | (0.5, 0.5) to (39.5, 29.5) × 16 |
| 2 | 32 | 15×20 | 300 | (0.5, 0.5) to (19.5, 14.5) × 32 |

---

## Post-Processing in JavaScript

Since NMS and decoding were removed, implement them in Lens Studio:

### 1. Decode Bounding Boxes

```javascript
function decodeBoxes(output, stride, gridW, gridH) {
    var boxes = [];
    var idx = 0;

    for (var y = 0; y < gridH; y++) {
        for (var x = 0; x < gridW; x++) {
            // Get raw values (channels are first dimension: [1, 35, H, W])
            var cx_offset = output[0 * gridH * gridW + y * gridW + x];
            var cy_offset = output[1 * gridH * gridW + y * gridW + x];
            var w_raw = output[2 * gridH * gridW + y * gridW + x];
            var h_raw = output[3 * gridH * gridW + y * gridW + x];
            var obj_raw = output[4 * gridH * gridW + y * gridW + x];

            // Decode center
            var cx = (x + 0.5 + cx_offset) * stride;
            var cy = (y + 0.5 + cy_offset) * stride;

            // Decode size
            var w = Math.exp(w_raw) * stride;
            var h = Math.exp(h_raw) * stride;

            // Objectness score
            var objScore = 1.0 / (1.0 + Math.exp(-obj_raw)); // sigmoid

            if (objScore > 0.5) { // threshold
                // Get class scores
                var maxClass = 0;
                var maxScore = -Infinity;
                for (var c = 0; c < 21; c++) {
                    var score_raw = output[(5 + c) * gridH * gridW + y * gridW + x];
                    var score = 1.0 / (1.0 + Math.exp(-score_raw));
                    if (score > maxScore) {
                        maxScore = score;
                        maxClass = c;
                    }
                }

                boxes.push({
                    x1: cx - w/2,
                    y1: cy - h/2,
                    x2: cx + w/2,
                    y2: cy + h/2,
                    score: objScore * maxScore,
                    classId: maxClass,
                    // Include rotation and translation data as needed
                });
            }
        }
    }
    return boxes;
}
```

### 2. Non-Maximum Suppression

```javascript
function nms(boxes, iouThreshold) {
    // Sort by score descending
    boxes.sort(function(a, b) { return b.score - a.score; });

    var kept = [];
    var suppressed = new Array(boxes.length).fill(false);

    for (var i = 0; i < boxes.length; i++) {
        if (suppressed[i]) continue;
        kept.push(boxes[i]);

        for (var j = i + 1; j < boxes.length; j++) {
            if (suppressed[j]) continue;
            if (boxes[i].classId !== boxes[j].classId) continue;

            var iou = computeIoU(boxes[i], boxes[j]);
            if (iou > iouThreshold) {
                suppressed[j] = true;
            }
        }
    }
    return kept;
}

function computeIoU(a, b) {
    var x1 = Math.max(a.x1, b.x1);
    var y1 = Math.max(a.y1, b.y1);
    var x2 = Math.min(a.x2, b.x2);
    var y2 = Math.min(a.y2, b.y2);

    var intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    var areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    var areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    var union = areaA + areaB - intersection;

    return intersection / union;
}
```

### 3. 6D Rotation to Matrix

```javascript
function rotation6DToMatrix(r) {
    // r is array of 6 values: [a1, a2, a3, b1, b2, b3]
    // First 3D vector
    var a = [r[0], r[1], r[2]];
    // Second 3D vector
    var b = [r[3], r[4], r[5]];

    // Normalize first vector
    var a_norm = normalize3(a);

    // Gram-Schmidt: make b orthogonal to a
    var dot = a_norm[0]*b[0] + a_norm[1]*b[1] + a_norm[2]*b[2];
    var b_orth = [b[0] - dot*a_norm[0], b[1] - dot*a_norm[1], b[2] - dot*a_norm[2]];
    var b_norm = normalize3(b_orth);

    // Third vector is cross product
    var c = cross3(a_norm, b_norm);

    // Return 3x3 rotation matrix (column-major or row-major as needed)
    return [
        a_norm[0], b_norm[0], c[0],
        a_norm[1], b_norm[1], c[1],
        a_norm[2], b_norm[2], c[2]
    ];
}
```

---

## References

### Model Documentation
- [EdgeAI-YOLOX 6D Pose README](https://github.com/TexasInstruments/edgeai-yolox/blob/main/README_6d_pose.md)
  - Model architecture details
  - Training datasets (YCB-V, LM-O)
  - 6D rotation representation explanation

### Lens Studio / SnapML
- [SnapML Overview](https://developers.snap.com/lens-studio/features/snap-ml/ml-overview)
- [SnapML on Spectacles](https://developers.snap.com/spectacles/about-spectacles-features/snapML)
- [SnapML Starter Sample](https://github.com/Snapchat/Spectacles-Sample/tree/main/SnapML%20Starter)
  - Complete example with YOLOv7-tiny
  - Depth-based 3D positioning
  - NMS implementation reference

### ONNX Operation Support Issues
- ScatterND and similar ops are unsupported across many edge inference engines
- [TensorRT ScatterND Issue](https://github.com/onnx/onnx-tensorrt/issues/618)
- [ST Edge AI ScatterND Issue](https://community.st.com/t5/edge-ai/a-problem-during-optimization-unsupported-layer-types-scatternd/td-p/717685)

---

## Files

| File | Description |
|------|-------------|
| `yolox_s_object_pose.onnx` | Original model (51.69 MB) - NOT compatible |
| `yolox_s_object_pose_lens.onnx` | Modified model (44.31 MB) - Compatible |
| `yolox_s_object_pose_no_nms.onnx` | Intermediate attempt - NOT compatible (has ScatterND) |
| `CenterSnapAE_sim.onnx` | Decoder model - Requires latent vector input, not camera |

---

*Document generated: 2025-01-05*
*Models tested with: Lens Studio (SnapML), Spectacles target*
