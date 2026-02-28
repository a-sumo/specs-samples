// ExplanatoryPanel.ts
// Receives rendered frames from a remote Manim renderer via ws-relay
// and displays them on a self-built quad. Sends field state (preset, mode, camera)
// back through the relay so the renderer can match the AR scene.
//
// Architecture:
//   [Modal/ManimGL] → ws-relay → [this script] → ProceduralTexture on quad
//   [this script] → ws-relay → [Modal/ManimGL] (state: preset, camera transforms)
//
// Copied from eywa-private TilePanel: builds its own mesh, clones material, proven pipeline.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

@component
export class ExplanatoryPanel extends BaseScriptComponent {

    @input
    @hint("WebSocket relay URL")
    relayUrl: string = "ws://localhost:8766";

    @input
    @hint("Channel name for relay routing")
    channel: string = "vector-field";

    @input
    @hint("Device ID (leave empty to auto-generate)")
    deviceId: string = "";

    @input
    @hint("Unlit material template (must have baseTex property). Will be cloned.")
    material: Material;

    @input
    @hint("Panel width in cm")
    panelWidth: number = 30;

    @input
    @hint("Panel height in cm")
    panelHeight: number = 30;

    @input
    @hint("FieldController to read active field state from")
    fieldController: ScriptComponent;

    @input
    @hint("Scene object whose world transform is sent for camera sync")
    cameraSource: SceneObject;

    @input
    @hint("Optional connect button. Tap to toggle WS connection. If not set, connects automatically on start.")
    connectButton: SceneObject;

    private internetModule: InternetModule;
    private wsSocket: WebSocket;
    private resolvedDeviceId: string;

    private sharedMesh: RenderMesh;
    private quadObj: SceneObject;
    private quadMat: Material;

    private proceduralTex: Texture;
    private procProvider: ProceduralTextureProvider;
    private procW: number = 0;
    private procH: number = 0;
    private flipBuffer: Uint8Array;  // reused across frames to avoid 1MB alloc per frame

    private lastPreset: number = -1;
    private lastMode: number = -1;
    private stateSendInterval: number = 0.1;
    private stateSendTimer: number = 0;

    private connectBtnText: Text | null = null;
    private connectBtnUnsub: (() => void) | null = null;

    onAwake(): void {
        try {
            this.internetModule = require("LensStudio:InternetModule") as InternetModule;
        } catch (e) {
            print("[ExplanatoryPanel] InternetModule not available");
            return;
        }

        if (!this.material) {
            print("[ExplanatoryPanel] ERROR: No material template assigned! Assign an Unlit material in the Inspector.");
            return;
        }

        this.resolvedDeviceId = this.deviceId || ("specs-" + Math.floor(Math.random() * 10000).toString());

        // Build mesh + quad like TilePanel does
        this.sharedMesh = this.buildUnitQuadMesh();
        this.buildQuad();

        this.createEvent("OnStartEvent").bind(() => {
            if (this.connectButton) {
                this.setupConnectButton();
                print("[ExplanatoryPanel] Tap connect button to start");
            } else {
                this.startWsRelay();
            }
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("[ExplanatoryPanel] Initialized, device=" + this.resolvedDeviceId);
    }

    // ========================================
    // MESH + QUAD (copied from TilePanel)
    // ========================================

    /**
     * Build a unit square mesh ((-0.5,-0.5) to (0.5,0.5), UVs (0,0) to (1,1)).
     * Vertices, normals, UVs — exactly like TilePanel.buildUnitQuadMesh.
     */
    private buildUnitQuadMesh(): RenderMesh {
        var builder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal", components: 3 },
            { name: "texture0", components: 2 }
        ]);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;

        // Front face: normal pointing +Z (toward camera when camera looks -Z)
        builder.appendVerticesInterleaved([-0.5, -0.5, 0,  0, 0, 1,  0, 0]);
        builder.appendVerticesInterleaved([ 0.5, -0.5, 0,  0, 0, 1,  1, 0]);
        builder.appendVerticesInterleaved([ 0.5,  0.5, 0,  0, 0, 1,  1, 1]);
        builder.appendVerticesInterleaved([-0.5,  0.5, 0,  0, 0, 1,  0, 1]);
        builder.appendIndices([0, 1, 2, 0, 2, 3]);

        var mesh = builder.getMesh();
        builder.updateMesh();
        return mesh;
    }

    /**
     * Build the display quad as a child of this SceneObject.
     * Clones the material template for independent texture assignment.
     */
    private buildQuad(): void {
        this.quadObj = global.scene.createSceneObject("ExplanatoryQuad");
        this.quadObj.setParent(this.sceneObject);
        this.quadObj.layer = this.sceneObject.layer;

        var rmv = this.quadObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mesh = this.sharedMesh;

        // Clone material for independent texture (exactly like TilePanel)
        this.quadMat = this.material.clone();
        this.quadMat.mainPass.blendMode = BlendMode.Normal;
        rmv.mainMaterial = this.quadMat;

        // Scale to panel size
        this.quadObj.getTransform().setLocalScale(new vec3(this.panelWidth, this.panelHeight, 1));
        this.quadObj.getTransform().setLocalPosition(vec3.zero());

        print("[ExplanatoryPanel] Built quad " + this.panelWidth + "x" + this.panelHeight + "cm");
    }

    // ========================================
    // CONNECT BUTTON (copied from TilePanel)
    // ========================================

    private setConnectBtnText(label: string): void {
        if (!this.connectBtnText && this.connectButton) {
            var childCount = this.connectButton.getChildrenCount();
            for (var ci = 0; ci < childCount; ci++) {
                var child = this.connectButton.getChild(ci);
                var textComp = child.getComponent("Component.Text") as Text;
                if (textComp) { this.connectBtnText = textComp; break; }
            }
        }
        if (this.connectBtnText) this.connectBtnText.text = label;
    }

    private setupConnectButton(): void {
        var btn = this.connectButton;
        if (!btn) return;
        if (this.connectBtnUnsub) return;

        this.setConnectBtnText("Connect");

        var collider = btn.getComponent("Physics.ColliderComponent") as ColliderComponent;
        if (!collider) {
            collider = btn.createComponent("Physics.ColliderComponent") as ColliderComponent;
            var shape = Shape.createBoxShape();
            shape.size = new vec3(10, 10, 2);
            collider.shape = shape;
        }

        var interactable = btn.getComponent(Interactable.getTypeName()) as Interactable;
        if (!interactable) {
            interactable = btn.createComponent(Interactable.getTypeName()) as Interactable;
        }

        var self = this;
        this.connectBtnUnsub = interactable.onTriggerStart(function(_e: InteractorEvent) {
            if (self.wsSocket) {
                print("[ExplanatoryPanel] Disconnect tapped");
                self.setConnectBtnText("Connect");
                try { self.wsSocket.close(); } catch (e) {}
                self.wsSocket = null;
                return;
            }
            print("[ExplanatoryPanel] Connect tapped");
            self.setConnectBtnText("Connecting...");
            self.startWsRelay();
        });
    }

    // ========================================
    // WS RELAY (copied from TilePanel.startWsRelay)
    // ========================================

    private startWsRelay(): void {
        var url = this.relayUrl.trim();
        if (url.indexOf("channel=") === -1) {
            url += (url.indexOf("?") >= 0 ? "&" : "?") + "channel=" + encodeURIComponent(this.channel);
        }
        print("[ExplanatoryPanel] Connecting to WS relay: " + url);

        var ws = this.internetModule.createWebSocket(url);
        this.wsSocket = ws;
        var self = this;

        ws.addEventListener("open", function() {
            print("[ExplanatoryPanel] WS relay connected to " + url);
            self.setConnectBtnText("Connected");
            // Identify as subscriber
            ws.send(JSON.stringify({ role: "sub", deviceId: self.resolvedDeviceId }));
            print("[ExplanatoryPanel] Sent role:sub, waiting for stream...");

            // Timeout warning
            (self as any)._wsDataReceived = false;
            var checkDelay = self.createEvent("DelayedCallbackEvent");
            checkDelay.bind(function() {
                if (!(self as any)._wsDataReceived) {
                    print("[ExplanatoryPanel] WARNING: No stream data after 3s. Check relay status above.");
                }
            });
            checkDelay.reset(3.0);
        });

        ws.addEventListener("message", function(event: any) {
            var data = event.data;
            if (typeof data === "string") {
                // Handle relay status
                try {
                    var statusCheck = JSON.parse(data);
                    if (statusCheck.event === "relay_status") {
                        print("[ExplanatoryPanel] Relay status: " + statusCheck.pubs + " pub(s), " + statusCheck.subs + " sub(s)");
                        if (statusCheck.pubs === 0) {
                            self.setConnectBtnText("No Publisher");
                        }
                        return;
                    }
                } catch (e) {}
            }

            // Track first real data
            if (!(self as any)._wsDataReceived) {
                (self as any)._wsDataReceived = true;
                print("[ExplanatoryPanel] First stream data received");
            }

            // Binary frame (copied from TilePanel line 2097-2293)
            if (typeof data !== "string" && data && typeof data.bytes === "function") {
                (data as any).bytes().then(function(bytes: Uint8Array) {
                    if (bytes.length < 11) return;
                    var msgType = bytes[0];
                    if (msgType !== 1 && msgType !== 4) return; // 1=full, 4=delta

                    var isDelta = msgType === 4;
                    var w = bytes[1] | (bytes[2] << 8);
                    var h = bytes[3] | (bytes[4] << 8);
                    var fmt = bytes[9]; // 0=r8, 1=rgba
                    var idLen = bytes[10];
                    var baseHeader = 11 + idLen;
                    if (bytes.length < baseHeader) return;

                    if (!(self as any)._frameLogCount || (self as any)._frameLogCount < 3) {
                        (self as any)._frameLogCount = ((self as any)._frameLogCount || 0) + 1;
                        print("[ExplanatoryPanel] Frame " + w + "x" + h + " fmt=" + fmt + " len=" + bytes.length);
                    }

                    // Delta frames have 8 extra bytes: rx(2) ry(2) rw(2) rh(2)
                    var rx = 0, ry = 0, rw = w, rh = h;
                    var headerSize = baseHeader;
                    if (isDelta) {
                        rx = bytes[baseHeader] | (bytes[baseHeader + 1] << 8);
                        ry = bytes[baseHeader + 2] | (bytes[baseHeader + 3] << 8);
                        rw = bytes[baseHeader + 4] | (bytes[baseHeader + 5] << 8);
                        rh = bytes[baseHeader + 6] | (bytes[baseHeader + 7] << 8);
                        headerSize = baseHeader + 8;
                    }
                    var pixelData = bytes.subarray(headerSize);

                    // Ensure ProceduralTexture (exactly like TilePanel)
                    if (!self.proceduralTex || self.procW !== w || self.procH !== h) {
                        self.proceduralTex = ProceduralTextureProvider.createWithFormat(w, h, TextureFormat.RGBA8Unorm);
                        self.procProvider = self.proceduralTex.control as ProceduralTextureProvider;
                        self.procW = w;
                        self.procH = h;
                        self.flipBuffer = new Uint8Array(w * h * 4); // allocate once, reuse every frame
                        self.quadMat.mainPass["baseTex"] = self.proceduralTex;
                        print("[ExplanatoryPanel] Tex created " + w + "x" + h + ", assigned to cloned material");
                    }

                    if (isDelta && rw > 0 && rh > 0) {
                        var flippedY = h - ry - rh;
                        if (fmt === 0) {
                            var regionRGBA = new Uint8Array(rw * rh * 4);
                            for (var y = 0; y < rh; y++) {
                                var srcRow = y * rw;
                                var dstRow = (rh - 1 - y) * rw * 4;
                                for (var x = 0; x < rw; x++) {
                                    var g = pixelData[srcRow + x];
                                    var o = dstRow + x * 4;
                                    regionRGBA[o] = g; regionRGBA[o + 1] = g; regionRGBA[o + 2] = g; regionRGBA[o + 3] = 255;
                                }
                            }
                            self.procProvider.setPixels(rx, flippedY, rw, rh, regionRGBA);
                        } else {
                            var flippedRegion = new Uint8Array(rw * rh * 4);
                            var rowB = rw * 4;
                            for (var y = 0; y < rh; y++) {
                                var sOff = y * rowB;
                                var dOff = (rh - 1 - y) * rowB;
                                for (var i = 0; i < rowB; i++) { flippedRegion[dOff + i] = pixelData[sOff + i]; }
                            }
                            self.procProvider.setPixels(rx, flippedY, rw, rh, flippedRegion);
                        }
                        return;
                    }

                    // Full frame - reuse flipBuffer to avoid 1MB alloc per frame
                    var fb = self.flipBuffer;
                    if (fmt === 0) {
                        // R8→RGBA with flip
                        for (var y = 0; y < h; y++) {
                            var srcRow = y * w;
                            var dstRow = (h - 1 - y) * w * 4;
                            for (var x = 0; x < w; x++) {
                                var g = pixelData[srcRow + x];
                                var o = dstRow + x * 4;
                                fb[o] = g; fb[o + 1] = g; fb[o + 2] = g; fb[o + 3] = 255;
                            }
                        }
                    } else {
                        // RGBA: flip vertically into reused buffer
                        var rowBytes = w * 4;
                        for (var y = 0; y < h; y++) {
                            var srcOff = y * rowBytes;
                            var dstOff = (h - 1 - y) * rowBytes;
                            for (var i = 0; i < rowBytes; i++) {
                                fb[dstOff + i] = pixelData[srcOff + i];
                            }
                        }
                    }
                    self.procProvider.setPixels(0, 0, w, h, fb);
                });
                return;
            }

            // Text messages (non-status)
            if (typeof data === "string") {
                try {
                    var msg = JSON.parse(data);
                    if (msg.event === "frame" && msg.png) {
                        // PNG path: Base64.decodeTextureAsync is native LS, fast, no manual pixels
                        Base64.decodeTextureAsync(msg.png, function(tex: Texture) {
                            self.quadMat.mainPass["baseTex"] = tex;
                            if (!(self as any)._pngLogCount || (self as any)._pngLogCount < 3) {
                                (self as any)._pngLogCount = ((self as any)._pngLogCount || 0) + 1;
                                print("[ExplanatoryPanel] PNG frame decoded");
                            }
                        }, function() {
                            print("[ExplanatoryPanel] PNG decode failed");
                        });
                    } else if (msg.event === "tex" && msg.payload) {
                        self.handleTexMessage(msg.payload);
                    }
                } catch (e) {}
            }
        });

        ws.addEventListener("close", function() {
            self.wsSocket = null;
            self.setConnectBtnText("Connect");
            if (self.connectButton) {
                print("[ExplanatoryPanel] Disconnected. Tap connect to reconnect.");
            } else {
                print("[ExplanatoryPanel] Disconnected, reconnecting in 3s...");
                var reconnect = self.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                reconnect.bind(function() {
                    self.startWsRelay();
                });
                reconnect.reset(3.0);
            }
        });

        ws.addEventListener("error", function(event: any) {
            if (self.wsSocket === ws) {
                self.wsSocket = null;
                self.setConnectBtnText("Connect");
                try { ws.close(); } catch (e) {}
                if (self.connectButton) {
                    print("[ExplanatoryPanel] WS error. Tap connect to retry.");
                } else {
                    print("[ExplanatoryPanel] WS error, reconnecting in 3s...");
                    var reconnect = self.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
                    reconnect.bind(function() {
                        self.startWsRelay();
                    });
                    reconnect.reset(3.0);
                }
            }
        });
    }

    // ========================================
    // JSON TEX (base64 fallback path)
    // ========================================

    private handleTexMessage(payload: any): void {
        if (!payload.image && !payload.rgba && !payload.r8) return;
        var w = payload.w || 512;
        var h = payload.h || 512;

        var decoded: Uint8Array;
        if (payload.rgba) {
            decoded = this.base64ToUint8(payload.rgba);
        } else if (payload.r8) {
            var gray = this.base64ToUint8(payload.r8);
            decoded = new Uint8Array(gray.length * 4);
            for (var i = 0; i < gray.length; i++) {
                decoded[i * 4] = gray[i];
                decoded[i * 4 + 1] = gray[i];
                decoded[i * 4 + 2] = gray[i];
                decoded[i * 4 + 3] = 255;
            }
        } else {
            return;
        }

        this.applyPixelsFull(w, h, decoded);
    }

    private applyPixelsFull(w: number, h: number, rgba: Uint8Array): void {
        if (!this.proceduralTex || this.procW !== w || this.procH !== h) {
            this.proceduralTex = ProceduralTextureProvider.createWithFormat(w, h, TextureFormat.RGBA8Unorm);
            this.procProvider = this.proceduralTex.control as ProceduralTextureProvider;
            this.procW = w;
            this.procH = h;
            this.flipBuffer = new Uint8Array(w * h * 4);
            this.quadMat.mainPass["baseTex"] = this.proceduralTex;
        }

        // Flip vertically for LS using reused buffer
        var rowBytes = w * 4;
        var fb = this.flipBuffer;
        for (var y = 0; y < h; y++) {
            var srcOff = y * rowBytes;
            var dstOff = (h - 1 - y) * rowBytes;
            for (var i = 0; i < rowBytes; i++) {
                fb[dstOff + i] = rgba[srcOff + i];
            }
        }
        this.procProvider.setPixels(0, 0, w, h, fb);
    }

    // ========================================
    // STATE SYNC (LS → Relay → Manim renderer)
    // ========================================

    private onUpdate(): void {
        if (!this.wsSocket) return;

        this.stateSendTimer += getDeltaTime();
        if (this.stateSendTimer < this.stateSendInterval) return;
        this.stateSendTimer = 0;

        this.sendFieldState();
        this.sendCameraState();
    }

    private sendFieldState(): void {
        if (!this.fieldController || !this.wsSocket) return;

        var controller = this.fieldController as any;
        var preset = controller.activeField !== undefined ? controller.activeField : 0;
        var mode = 0;

        if (controller.getVectorFieldComponent) {
            var vf = controller.getVectorFieldComponent();
            if (vf && vf.preset !== undefined) {
                preset = vf.preset;
            }
        }

        mode = controller.activeField !== undefined ? controller.activeField : 0;

        if (preset === this.lastPreset && mode === this.lastMode) return;

        this.lastPreset = preset;
        this.lastMode = mode;

        // Build collider bounds from vectorFieldRoot if available
        var collider: any = null;
        if (controller.vectorFieldRoot) {
            var rootPos = controller.vectorFieldRoot.getTransform().getWorldPosition();
            // Effective half-size: box shape size / 2 * child scale
            // Default: 15x15x15 box, VectorField child at 2x scale = 30 unit effective cube, halfSize=15
            var halfSize = 15;
            try {
                // Try to read actual collider shape from the VectorField child
                for (var ci = 0; ci < controller.vectorFieldRoot.getChildrenCount(); ci++) {
                    var child = controller.vectorFieldRoot.getChild(ci);
                    var col = child.getComponent("Physics.ColliderComponent") as ColliderComponent;
                    if (col && col.shape) {
                        var boxShape = col.shape as BoxShape;
                        if (boxShape.size) {
                            var childScale = child.getTransform().getWorldScale();
                            halfSize = (boxShape.size.x * childScale.x) / 2;
                        }
                        break;
                    }
                }
            } catch (e) {}
            collider = {
                center: [rootPos.x, rootPos.y, rootPos.z],
                halfSize: halfSize
            };
        }

        this.wsSocket.send(JSON.stringify({
            event: "interact",
            payload: {
                type: "field_state",
                preset: preset,
                mode: mode,
                collider: collider,
                timestamp: Date.now()
            }
        }));
    }

    private sendCameraState(): void {
        if (!this.cameraSource || !this.wsSocket) return;

        var transform = this.cameraSource.getTransform();
        var pos = transform.getWorldPosition();
        var rot = transform.getWorldRotation();

        this.wsSocket.send(JSON.stringify({
            event: "interact",
            payload: {
                type: "camera_state",
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z, rot.w],
                timestamp: Date.now()
            }
        }));
    }

    // ========================================
    // UTILITIES
    // ========================================

    private base64ToUint8(b64: string): Uint8Array {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var lookup = new Uint8Array(128);
        for (var c = 0; c < chars.length; c++) {
            lookup[chars.charCodeAt(c)] = c;
        }

        var len = b64.length;
        var padCount = (b64[len - 1] === "=" ? 1 : 0) + (b64[len - 2] === "=" ? 1 : 0);
        var outLen = (len * 3 / 4) - padCount;
        var out = new Uint8Array(outLen);

        var j = 0;
        for (var i = 0; i < len; i += 4) {
            var a = lookup[b64.charCodeAt(i)];
            var b = lookup[b64.charCodeAt(i + 1)];
            var c2 = lookup[b64.charCodeAt(i + 2)];
            var d = lookup[b64.charCodeAt(i + 3)];
            var bits = (a << 18) | (b << 12) | (c2 << 6) | d;
            if (j < outLen) out[j++] = (bits >> 16) & 0xff;
            if (j < outLen) out[j++] = (bits >> 8) & 0xff;
            if (j < outLen) out[j++] = bits & 0xff;
        }
        return out;
    }

    // ========================================
    // PUBLIC API
    // ========================================

    public sendMessage(event: string, payload: any): void {
        if (!this.wsSocket) return;
        this.wsSocket.send(JSON.stringify({ event: event, payload: payload }));
    }

    public get isConnected(): boolean {
        return !!this.wsSocket;
    }
}
