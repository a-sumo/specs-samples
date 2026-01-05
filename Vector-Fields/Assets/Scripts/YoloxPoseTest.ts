// YoloxPoseTest.ts
// Test script for yolox_s_object_pose_lens.onnx model
// Runs inference on a static image and decodes detections

@component
export class YoloxPoseTest extends BaseScriptComponent {

    // ============ INPUTS ============

    @input
    @hint("The yolox_s_object_pose_lens.onnx model asset")
    model: MLAsset;

    @input
    @hint("Static image texture to run inference on (640x480 recommended)")
    inputTexture: Texture;

    @input
    @hint("Run inference continuously on update")
    continuous: boolean = false;

    // ============ THRESHOLDS ============

    @input
    @widget(new SliderWidget(0.1, 0.9, 0.05))
    @hint("Minimum objectness score to consider a detection")
    scoreThreshold: number = 0.3;

    @input
    @widget(new SliderWidget(0.1, 0.9, 0.05))
    @hint("IoU threshold for NMS")
    iouThreshold: number = 0.5;

    @input
    @widget(new SliderWidget(1, 20, 1))
    @hint("Maximum detections to return after NMS")
    maxDetections: number = 5;

    // ============ VISUALIZATION ============

    @input
    @hint("Material with DetectionOverlay shader for drawing boxes and poses")
    overlayMaterial: Material;

    // ============ EVENTS ============

    /** Callbacks for detection results */
    private detectionCallbacks: ((detections: Detection[]) => void)[] = [];

    /** Subscribe to receive detection results */
    public onDetections = {
        add: (callback: (detections: Detection[]) => void) => {
            this.detectionCallbacks.push(callback);
        },
        remove: (callback: (detections: Detection[]) => void) => {
            const idx = this.detectionCallbacks.indexOf(callback);
            if (idx >= 0) this.detectionCallbacks.splice(idx, 1);
        }
    };

    /** Last detections (for polling) */
    public lastDetections: Detection[] = [];

    // ============ PRIVATE ============

    private mlComponent: MLComponent;
    private inputs: InputPlaceholder[];
    private outputs: OutputPlaceholder[];
    private isInitialized: boolean = false;
    private isRunning: boolean = false;


    // Model constants
    private readonly INPUT_WIDTH = 640;
    private readonly INPUT_HEIGHT = 480;
    private readonly NUM_CLASSES = 21;

    // Stride -> grid size mapping (grid is INPUT_HEIGHT/stride x INPUT_WIDTH/stride)
    private readonly STRIDE_CONFIG: { [key: number]: [number, number] } = {
        8: [60, 80],   // 480/8=60, 640/8=80
        16: [30, 40],  // 480/16=30, 640/16=40
        32: [15, 20]   // 480/32=15, 640/32=20
    };

    // YCB-Video class names
    private readonly CLASS_NAMES = [
        "master_chef_can", "cracker_box", "sugar_box", "tomato_soup_can",
        "mustard_bottle", "tuna_fish_can", "pudding_box", "gelatin_box",
        "potted_meat_can", "banana", "pitcher_base", "bleach_cleanser",
        "bowl", "mug", "power_drill", "wood_block", "scissors",
        "large_marker", "large_clamp", "extra_large_clamp", "foam_brick"
    ];

    // Box colors per class
    private readonly BOX_COLORS: vec4[] = [
        new vec4(1, 0.3, 0.3, 1), new vec4(0.3, 1, 0.3, 1), new vec4(0.3, 0.3, 1, 1),
        new vec4(1, 1, 0.3, 1), new vec4(1, 0.3, 1, 1), new vec4(0.3, 1, 1, 1),
        new vec4(1, 0.6, 0.3, 1), new vec4(0.6, 0.3, 1, 1)
    ];

    onAwake(): void {
        this.initML();
    }

    private updateVisualization(detections: Detection[]): void {
        if (!this.overlayMaterial) return;

        const pass = this.overlayMaterial.mainPass;
        const count = Math.min(detections.length, 3);  // Shader supports max 3

        pass.NumDetections = count;
        pass.BorderWidth = 4.0 / this.INPUT_WIDTH;
        pass.ArrowLength = 0.08;
        pass.ArrowWidth = 0.008;

        // Pack each detection into a mat4
        for (let i = 0; i < 3; i++) {
            const detMat = this.packDetection(i < count ? detections[i] : null);
            pass[`Det${i}`] = detMat;
        }

        // Only log occasionally in continuous mode
        if (!this.continuous || Math.random() < 0.02) {
            print(`YoloxPoseTest: ${count} detections`);
        }
    }

    private packDetection(det: Detection | null): mat4 {
        if (!det) {
            return new mat4();  // Zero matrix - invalid bbox will be skipped
        }

        // Convert pixel coords to UV (0-1), flip Y
        const x1 = det.x1 / this.INPUT_WIDTH;
        const y1 = 1.0 - det.y2 / this.INPUT_HEIGHT;
        const x2 = det.x2 / this.INPUT_WIDTH;
        const y2 = 1.0 - det.y1 / this.INPUT_HEIGHT;

        const r = det.rotation || [1, 0, 0, 0, 1, 0];
        const color = this.BOX_COLORS[det.classId % this.BOX_COLORS.length];

        // Shader reads: det[0]=bbox, det[1]=rotA, det[2]=rotB, det[3]=color
        // mat4.fromColumns(col0, col1, col2, col3)
        return mat4.fromColumns(
            new vec4(x1, y1, x2, y2),           // col0 = bbox
            new vec4(r[0], r[1], r[2], 0),     // col1 = rotA
            new vec4(r[3], r[4], r[5], 0),     // col2 = rotB
            color                               // col3 = color
        );
    }

    private initML(): void {
        if (!this.model) {
            print("YoloxPoseTest: ERROR - No ML model assigned!");
            return;
        }
        if (!this.inputTexture) {
            print("YoloxPoseTest: ERROR - No input texture assigned!");
            return;
        }

        print("YoloxPoseTest: Initializing ML component...");

        this.mlComponent = this.sceneObject.createComponent("MLComponent");
        this.mlComponent.model = this.model;
        this.mlComponent.onLoadingFinished = () => this.onModelLoaded();
        this.mlComponent.inferenceMode = MachineLearning.InferenceMode.Accelerator;
        this.mlComponent.build([]);
    }

    private onModelLoaded(): void {
        print("YoloxPoseTest: Model loaded successfully!");

        this.inputs = this.mlComponent.getInputs();
        this.outputs = this.mlComponent.getOutputs();

        print(`YoloxPoseTest: Found ${this.inputs.length} inputs, ${this.outputs.length} outputs`);

        // Log input/output info
        for (let i = 0; i < this.inputs.length; i++) {
            print(`  Input ${i}: ${this.inputs[i].name}`);
        }
        for (let i = 0; i < this.outputs.length; i++) {
            print(`  Output ${i}: ${this.outputs[i].name}`);
        }

        // Assign input texture
        this.inputs[0].texture = this.inputTexture;
        print(`YoloxPoseTest: Assigned input texture`);

        this.isInitialized = true;

        if (this.continuous) {
            // Run continuously
            this.mlComponent.onRunningFinished = () => this.onInferenceComplete();
            this.mlComponent.runScheduled(
                true,
                MachineLearning.FrameTiming.Update,
                MachineLearning.FrameTiming.Update
            );
            print("YoloxPoseTest: Running in continuous mode");
        } else {
            // Run once
            this.runInference();
        }
    }

    public runInference(): void {
        if (!this.isInitialized) {
            print("YoloxPoseTest: Not initialized yet!");
            return;
        }
        if (this.isRunning) {
            print("YoloxPoseTest: Already running!");
            return;
        }

        this.isRunning = true;
        print("YoloxPoseTest: Running inference...");

        this.mlComponent.onRunningFinished = () => this.onInferenceComplete();
        this.mlComponent.runImmediate(false);
    }

    private onInferenceComplete(): void {
        this.isRunning = false;

        // Gather raw detections from all scales
        const rawDetections: Detection[] = [];

        for (let s = 0; s < this.outputs.length; s++) {
            const out = this.outputs[s];
            const data = out.data;

            // Parse stride from output name (e.g., "output_stride16" -> 16)
            const strideMatch = out.name.match(/stride(\d+)/);
            if (!strideMatch) {
                print(`  WARNING: Could not parse stride from "${out.name}"`);
                continue;
            }
            const stride = parseInt(strideMatch[1]);
            const gridConfig = this.STRIDE_CONFIG[stride];
            if (!gridConfig) {
                print(`  WARNING: Unknown stride ${stride}`);
                continue;
            }
            const [gridH, gridW] = gridConfig;

            // Verify expected size
            const expectedSize = 35 * gridH * gridW;
            if (data.length !== expectedSize) continue;

            const scaleDetections = this.decodeScale(data, gridH, gridW, stride);
            rawDetections.push(...scaleDetections);
        }

        // Apply NMS
        const finalDetections = this.nms(rawDetections);

        // Only log details occasionally in continuous mode
        if (!this.continuous || Math.random() < 0.02) {
            print(`YoloxPoseTest: ${rawDetections.length} raw -> ${finalDetections.length} after NMS`);
            for (let i = 0; i < finalDetections.length; i++) {
                const d = finalDetections[i];
                print(`  [${i}] class=${d.classId}, score=${d.score.toFixed(2)}, bbox=[${d.x1.toFixed(0)},${d.y1.toFixed(0)},${d.x2.toFixed(0)},${d.y2.toFixed(0)}]`);
            }
        }

        // Store and emit detections
        this.lastDetections = finalDetections;
        for (const cb of this.detectionCallbacks) {
            cb(finalDetections);
        }

        // Update shader visualization
        this.updateVisualization(finalDetections);
    }

    private decodeScale(data: Float32Array, gridH: number, gridW: number, stride: number): Detection[] {
        const detections: Detection[] = [];
        const numChannels = 35;

        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                // Data is in [H, W, C] order (channels last)
                const baseIdx = (y * gridW + x) * numChannels;

                // Channel 4 = objectness (raw logit)
                const objRaw = data[baseIdx + 4];
                const objScore = this.sigmoid(objRaw);

                if (objScore < this.scoreThreshold) continue;

                // Decode center offset (channels 0, 1)
                const cxOffset = data[baseIdx + 0];
                const cyOffset = data[baseIdx + 1];

                // Decode size (channels 2, 3)
                const wRaw = data[baseIdx + 2];
                const hRaw = data[baseIdx + 3];

                // Apply grid position and stride
                const cx = (x + 0.5 + cxOffset) * stride;
                const cy = (y + 0.5 + cyOffset) * stride;
                const w = Math.exp(wRaw) * stride;
                const h = Math.exp(hRaw) * stride;

                // Find best class (channels 5-25)
                let maxClassScore = -Infinity;
                let maxClassId = 0;
                for (let c = 0; c < this.NUM_CLASSES; c++) {
                    const classRaw = data[baseIdx + 5 + c];
                    const classScore = this.sigmoid(classRaw);
                    if (classScore > maxClassScore) {
                        maxClassScore = classScore;
                        maxClassId = c;
                    }
                }

                const finalScore = objScore * maxClassScore;
                if (finalScore < this.scoreThreshold) continue;

                // Extract rotation 6D (channels 26-31)
                const rotation: number[] = [];
                for (let r = 0; r < 6; r++) {
                    rotation.push(data[baseIdx + 26 + r]);
                }

                // Extract translation (channels 32-34)
                const translation: number[] = [];
                translation.push(data[baseIdx + 32]); // x
                translation.push(data[baseIdx + 33]); // y
                translation.push(Math.exp(data[baseIdx + 34])); // z (exp)

                detections.push({
                    x1: cx - w / 2,
                    y1: cy - h / 2,
                    x2: cx + w / 2,
                    y2: cy + h / 2,
                    score: finalScore,
                    classId: maxClassId,
                    rotation: rotation,
                    translation: translation
                });
            }
        }

        return detections;
    }

    private nms(detections: Detection[]): Detection[] {
        // Sort by score descending
        detections.sort((a, b) => b.score - a.score);

        const kept: Detection[] = [];
        const suppressed = new Array(detections.length).fill(false);

        for (let i = 0; i < detections.length && kept.length < this.maxDetections; i++) {
            if (suppressed[i]) continue;

            kept.push(detections[i]);

            for (let j = i + 1; j < detections.length; j++) {
                if (suppressed[j]) continue;

                const iou = this.computeIoU(detections[i], detections[j]);
                if (iou > this.iouThreshold) {
                    suppressed[j] = true;
                }
            }
        }

        return kept;
    }

    private computeIoU(a: Detection, b: Detection): number {
        const x1 = Math.max(a.x1, b.x1);
        const y1 = Math.max(a.y1, b.y1);
        const x2 = Math.min(a.x2, b.x2);
        const y2 = Math.min(a.y2, b.y2);

        const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        const union = areaA + areaB - intersection;

        return union > 0 ? intersection / union : 0;
    }

    private sigmoid(x: number): number {
        return 1.0 / (1.0 + Math.exp(-x));
    }

    // ============ 6D ROTATION UTILITIES ============

    /**
     * Convert 6D rotation representation to 3x3 rotation matrix
     * Using Gram-Schmidt orthogonalization
     */
    public rotation6DToMatrix(r: number[]): number[] {
        // First 3D vector
        const a = [r[0], r[1], r[2]];
        // Second 3D vector
        const b = [r[3], r[4], r[5]];

        // Normalize first vector
        const aNorm = this.normalize3(a);

        // Gram-Schmidt: make b orthogonal to a
        const dot = aNorm[0] * b[0] + aNorm[1] * b[1] + aNorm[2] * b[2];
        const bOrth = [
            b[0] - dot * aNorm[0],
            b[1] - dot * aNorm[1],
            b[2] - dot * aNorm[2]
        ];
        const bNorm = this.normalize3(bOrth);

        // Third vector is cross product
        const c = this.cross3(aNorm, bNorm);

        // Return 3x3 rotation matrix (row-major)
        return [
            aNorm[0], bNorm[0], c[0],
            aNorm[1], bNorm[1], c[1],
            aNorm[2], bNorm[2], c[2]
        ];
    }

    private normalize3(v: number[]): number[] {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (len < 1e-8) return [1, 0, 0];
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    private cross3(a: number[], b: number[]): number[] {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    /**
     * Convert rotation matrix to quaternion for Lens Studio
     */
    public matrixToQuat(m: number[]): quat {
        // m is row-major [m00, m01, m02, m10, m11, m12, m20, m21, m22]
        const m00 = m[0], m01 = m[1], m02 = m[2];
        const m10 = m[3], m11 = m[4], m12 = m[5];
        const m20 = m[6], m21 = m[7], m22 = m[8];

        const trace = m00 + m11 + m22;
        let w: number, x: number, y: number, z: number;

        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1.0);
            w = 0.25 / s;
            x = (m21 - m12) * s;
            y = (m02 - m20) * s;
            z = (m10 - m01) * s;
        } else if (m00 > m11 && m00 > m22) {
            const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
            w = (m21 - m12) / s;
            x = 0.25 * s;
            y = (m01 + m10) / s;
            z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
            w = (m02 - m20) / s;
            x = (m01 + m10) / s;
            y = 0.25 * s;
            z = (m12 + m21) / s;
        } else {
            const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }

        return new quat(w, x, y, z);
    }
}

// Detection interface - exported for use by other scripts
export interface Detection {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    score: number;
    classId: number;
    rotation?: number[];
    translation?: number[];
}
