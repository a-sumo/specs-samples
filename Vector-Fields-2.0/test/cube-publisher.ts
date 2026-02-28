/**
 * cube-publisher.ts
 *
 * Minimal test publisher: renders a wireframe cube with Three.js,
 * streams RGBA frames to ws-relay. The ExplanatoryPanel on Spectacles
 * receives these frames and displays them on a quad.
 *
 * The cube's camera tracks transform state sent by ExplanatoryPanel,
 * so the rendered cube should visually align with a real cube in LS.
 *
 * Usage:
 *   npx tsx test/cube-publisher.ts [--relay wss://relay.curvilinear.space] [--channel vector-field]
 *
 * Dependencies:
 *   npm install three @types/three ws gl
 */

import * as THREE from "three";
import WebSocket from "ws";
import createContext from "gl";

// ========================================
// CONFIG
// ========================================

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const RELAY_URL = getArg("relay", "ws://localhost:8766");
const CHANNEL = getArg("channel", "vector-field");
const WIDTH = parseInt(getArg("width", "512"));
const HEIGHT = parseInt(getArg("height", "512"));
const FPS = parseInt(getArg("fps", "30"));

// ========================================
// HEADLESS GL + THREE.JS SETUP
// ========================================

// Create headless OpenGL context
const glContext = createContext(WIDTH, HEIGHT, { preserveDrawingBuffer: true });

const renderer = new THREE.WebGLRenderer({
  context: glContext as any,
  antialias: true,
});
renderer.setSize(WIDTH, HEIGHT);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

// Camera: match Spectacles FOV (63.5 degrees)
const camera = new THREE.PerspectiveCamera(63.5, WIDTH / HEIGHT, 0.1, 1000);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

// Wireframe cube at the same position as the LS cube
const cubeGeometry = new THREE.BoxGeometry(10, 10, 10);
const cubeMaterial = new THREE.MeshBasicMaterial({
  color: 0x60a5fa,
  wireframe: true,
  wireframeLinewidth: 2,
});
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.set(0, 0, -40);
scene.add(cube);

// Add subtle grid for spatial reference
const gridHelper = new THREE.GridHelper(100, 20, 0x333333, 0x222222);
gridHelper.position.y = -20;
scene.add(gridHelper);

// Pixel buffer for reading frames
const pixelBuffer = new Uint8Array(WIDTH * HEIGHT * 4);

// ========================================
// RELAY CONNECTION
// ========================================

let ws: WebSocket | null = null;
let connected = false;

function connectRelay() {
  const url = `${RELAY_URL}?channel=${encodeURIComponent(CHANNEL)}`;
  console.log(`Connecting to relay: ${url}`);

  ws = new WebSocket(url);

  ws.on("open", () => {
    connected = true;
    console.log("Connected to relay as publisher");
    // Publishers are auto-detected (no role message needed, just start sending)
  });

  ws.on("message", (data: WebSocket.Data) => {
    // Handle interact messages from subscriber (ExplanatoryPanel)
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === "interact" && msg.payload) {
        handleInteraction(msg.payload);
      }
    } catch {
      // Binary or unparseable - ignore
    }
  });

  ws.on("close", () => {
    connected = false;
    console.log("Disconnected, reconnecting in 2s...");
    setTimeout(connectRelay, 2000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

// ========================================
// STATE SYNC (receive from ExplanatoryPanel)
// ========================================

function handleInteraction(payload: any) {
  if (payload.type === "camera_state") {
    // Apply camera transform from Spectacles
    const [px, py, pz] = payload.position;
    const [qx, qy, qz, qw] = payload.rotation;

    camera.position.set(px, py, pz);
    camera.quaternion.set(qx, qy, qz, qw);

    // Note: LS uses left-handed coordinates, Three.js uses right-handed.
    // May need to negate Z or flip quaternion depending on alignment testing.
  } else if (payload.type === "field_state") {
    console.log(`Field state: preset=${payload.preset} mode=${payload.mode}`);
  }
}

// ========================================
// FRAME ENCODING (binary protocol matching ws-relay)
// ========================================

function encodeFrame(pixels: Uint8Array, w: number, h: number): Buffer {
  // Binary frame type 0x01 (full frame), RGBA format
  const id = "panel";
  const idLen = id.length;
  const headerSize = 11 + idLen;
  const buf = Buffer.alloc(headerSize + pixels.length);

  buf.writeUInt8(0x01, 0);              // type: full frame
  buf.writeUInt16LE(w, 1);              // width
  buf.writeUInt16LE(h, 3);              // height
  buf.writeUInt32LE(Date.now() >>> 0, 5); // timestamp
  buf.writeUInt8(1, 9);                 // format: 1 = RGBA
  buf.writeUInt8(idLen, 10);            // id length
  buf.write(id, 11, "ascii");           // id
  pixels.copy ? (pixels as any).copy(buf, headerSize) : buf.set(pixels, headerSize);

  return buf;
}

// ========================================
// RENDER LOOP
// ========================================

function renderAndSend() {
  if (!connected || !ws) return;

  // Render scene
  renderer.render(scene, camera);

  // Read pixels from GL context
  glContext.readPixels(0, 0, WIDTH, HEIGHT, glContext.RGBA, glContext.UNSIGNED_BYTE, pixelBuffer);

  // GL readPixels is bottom-up, but the relay protocol + ExplanatoryPanel
  // handles the flip, so send as-is
  const frame = encodeFrame(pixelBuffer, WIDTH, HEIGHT);

  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame);
    }
  } catch (e) {
    // Skip frame on error
  }
}

// Slow rotation for visual verification when no camera sync is active
let autoRotate = true;
function animate() {
  if (autoRotate) {
    cube.rotation.y += 0.01;
    cube.rotation.x += 0.005;
  }
  renderAndSend();
}

// ========================================
// START
// ========================================

connectRelay();

const interval = setInterval(animate, 1000 / FPS);

console.log(`Cube publisher running: ${WIDTH}x${HEIGHT} @ ${FPS}fps`);
console.log(`Relay: ${RELAY_URL}, Channel: ${CHANNEL}`);
console.log("Rendering wireframe cube at [0, 0, -40]");
console.log("Press Ctrl+C to stop");

process.on("SIGINT", () => {
  clearInterval(interval);
  ws?.close();
  console.log("Stopped");
  process.exit(0);
});
