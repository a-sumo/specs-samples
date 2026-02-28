/**
 * cube-publisher-canvas.ts
 *
 * Zero-dependency test publisher: renders a wireframe cube with pure math
 * and direct pixel manipulation, streams frames to ws-relay.
 *
 * Usage:
 *   npx tsx test/cube-publisher-canvas.ts [--relay ws://localhost:8766] [--channel vector-field]
 *
 * Dependencies:
 *   npm install ws
 */

import WebSocket from "ws";

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
const WIDTH = parseInt(getArg("width", "256"));
const HEIGHT = parseInt(getArg("height", "256"));
const FPS = parseInt(getArg("fps", "15"));

// ========================================
// SOFTWARE FRAMEBUFFER
// ========================================

const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

function clear(r: number, g: number, b: number, a: number) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
}

function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= WIDTH || iy < 0 || iy >= HEIGHT) return;
  const off = (iy * WIDTH + ix) * 4;
  pixels[off] = r;
  pixels[off + 1] = g;
  pixels[off + 2] = b;
  pixels[off + 3] = a;
}

function drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) {
  // Bresenham with thickness via drawing adjacent pixels
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // 2px thick: draw a small cross at each point
    setPixel(x0, y0, r, g, b, 255);
    setPixel(x0 + 1, y0, r, g, b, 255);
    setPixel(x0, y0 + 1, r, g, b, 255);
    setPixel(x0 + 1, y0 + 1, r, g, b, 255);

    if (Math.abs(x0 - x1) < 1 && Math.abs(y0 - y1) < 1) break;
    let e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function drawCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number) {
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    setPixel(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, r, g, b, 255);
    setPixel(cx + Math.cos(a) * radius + 1, cy + Math.sin(a) * radius, r, g, b, 255);
  }
}

// ========================================
// 3D MATH
// ========================================

let S = 15; // half-size: 30 unit cube matches LS field collider (15x15x15 box * 2x child scale)
let cubePos = [0, 0, -50]; // LS field collider center in world space
// Default camera behind the cube looking along +Z (LS left-handed).
// Overridden once LS sends camera state.
let camPos = [0, 0, -120];
let camQuat = [0, 0, 0, 1];

function buildCubeVerts(half: number): number[][] {
  return [
    [-half, -half, -half], [half, -half, -half], [half, half, -half], [-half, half, -half],
    [-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half],
  ];
}

let cubeVerts = buildCubeVerts(S);
const cubeEdges = [
  [0, 1], [1, 2], [2, 3], [3, 0], // front
  [4, 5], [5, 6], [6, 7], [7, 4], // back
  [0, 4], [1, 5], [2, 6], [3, 7], // sides
];

function quatToMatrix(q: number[]): number[][] {
  const [x, y, z, w] = q;
  return [
    [1 - 2*(y*y + z*z), 2*(x*y - z*w),     2*(x*z + y*w)],
    [2*(x*y + z*w),     1 - 2*(x*x + z*z), 2*(y*z - x*w)],
    [2*(x*z - y*w),     2*(y*z + x*w),     1 - 2*(x*x + y*y)],
  ];
}

function project(vx: number, vy: number, vz: number): [number, number] | null {
  // World-space vector from camera to vertex
  const wx = vx + cubePos[0] - camPos[0];
  const wy = vy + cubePos[1] - camPos[1];
  const wz = vz + cubePos[2] - camPos[2];

  // Transform to camera-local space via inverse rotation (R^T * v)
  const m = quatToMatrix(camQuat);
  const cx = m[0][0]*wx + m[1][0]*wy + m[2][0]*wz;
  const cy = m[0][1]*wx + m[1][1]*wy + m[2][1]*wz;
  const cz = m[0][2]*wx + m[1][2]*wy + m[2][2]*wz;

  // LS is left-handed: camera forward is +Z, visible objects have cz > 0
  if (cz <= 0.1) return null;

  const fov = 63.5 * Math.PI / 180;
  const f = 1 / Math.tan(fov / 2);
  const aspect = WIDTH / HEIGHT;

  // Left-handed perspective: divide by +cz (not -cz)
  const sx = (cx * f / cz) / aspect;
  const sy = (cy * f / cz);

  const px = (sx * 0.5 + 0.5) * WIDTH;
  const py = (0.5 - sy * 0.5) * HEIGHT;

  return [px, py];
}

function render() {
  // Dark grey background (not pure black so we can confirm frames arrive)
  clear(13, 17, 23, 255);

  // No rotation: cube is axis-aligned to match LS field collider.
  // Camera state (camPos, camQuat) received from LS drives the viewpoint.
  const projected = cubeVerts.map(([x, y, z]) => project(x, y, z));

  // Draw edges (#60a5fa = 96, 165, 250)
  for (const [a, b] of cubeEdges) {
    const pa = projected[a];
    const pb = projected[b];
    if (!pa || !pb) continue;
    drawLine(pa[0], pa[1], pb[0], pb[1], 96, 165, 250);
  }

  // Draw vertices as circles (#93c5fd = 147, 197, 253)
  for (const p of projected) {
    if (!p) continue;
    drawCircle(p[0], p[1], 4, 147, 197, 253);
  }
}

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
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === "interact" && msg.payload) {
        if (msg.payload.type === "camera_state") {
          camPos = msg.payload.position;
          camQuat = msg.payload.rotation;
        } else if (msg.payload.type === "field_state") {
          console.log(`Field: preset=${msg.payload.preset} mode=${msg.payload.mode}`);
          // Update cube bounds if collider info is present
          if (msg.payload.collider) {
            const c = msg.payload.collider;
            if (c.center) cubePos = c.center;
            if (c.halfSize !== undefined) {
              S = c.halfSize;
              cubeVerts = buildCubeVerts(S);
            }
          }
        }
      }
    } catch {}
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
// FRAME ENCODING
// ========================================

function sendFrame() {
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

  render();

  const id = "panel";
  const headerSize = 11 + id.length;
  const buf = Buffer.alloc(headerSize + pixels.length);

  buf.writeUInt8(0x01, 0);
  buf.writeUInt16LE(WIDTH, 1);
  buf.writeUInt16LE(HEIGHT, 3);
  buf.writeUInt32LE(Date.now() >>> 0, 5);
  buf.writeUInt8(1, 9);  // RGBA
  buf.writeUInt8(id.length, 10);
  buf.write(id, 11, "ascii");
  buf.set(pixels, headerSize);

  try {
    ws.send(buf);
  } catch {}
}

// ========================================
// START
// ========================================

connectRelay();
const interval = setInterval(sendFrame, 1000 / FPS);

console.log(`Cube publisher (software): ${WIDTH}x${HEIGHT} @ ${FPS}fps`);
console.log(`Relay: ${RELAY_URL}, Channel: ${CHANNEL}`);
console.log(`Cube at [${cubePos}], half-size=${S} (matches LS field collider)`);
console.log("Camera driven by LS state (no auto-rotation)");
console.log("Ctrl+C to stop");

process.on("SIGINT", () => {
  clearInterval(interval);
  ws?.close();
  process.exit(0);
});
