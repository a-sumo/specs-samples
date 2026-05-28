// In-place patch of the WindStreamFlow.ss_graph binary. Replaces only the
// embedded Code Node source and pads to the original record length so LS's
// surrounding binary string sizes stay intact. .meta and .mat are left
// untouched so existing scene material references remain stable.

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = "/Users/armand/Documents/specs-samples/Vector-Fields";
const GRAPH = `${ROOT}/Assets/Materials/WindStreamFlow.ss_graph`;
const VF_SRC = `${ROOT}/Assets/Materials/VectorField.ss_graph`;
const SHADER_SRC = `${ROOT}/Assets/Shaders/WindStreamFlow.js`;

const NEW_SHADER = `${readFileSync(SHADER_SRC, "utf8").trimEnd()}\n`;

function findShaderRecord(buf) {
  const markers = [
    Buffer.from("// WindStreamFlow"),
    Buffer.from("// VectorFieldTubesShader"),
  ];
  let start = -1;
  for (const marker of markers) {
    start = buf.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error("Couldn't locate shader text marker");

  let realStart = start;
  while (realStart > 0 && buf[realStart - 1] >= 0x09 && buf[realStart - 1] < 0x80) {
    realStart--;
  }

  let realEnd = start;
  while (realEnd < buf.length && buf[realEnd] >= 0x09 && buf[realEnd] < 0x80) {
    realEnd++;
  }

  const lenPrefix = realStart - 4;
  const expected = buf.readUInt32LE(lenPrefix);
  if (expected !== realEnd - realStart) {
    throw new Error(`Length prefix mismatch: prefix=${expected}, scanned=${realEnd - realStart}`);
  }
  return { lenPrefix, realStart, realEnd, length: expected };
}

let buf = readFileSync(GRAPH);
let rec;
try {
  rec = findShaderRecord(buf);
} catch (e) {
  console.warn("Could not patch current graph, falling back to a fresh VectorField clone. Reason:", e.message);
  buf = readFileSync(VF_SRC);
  rec = findShaderRecord(buf);
}

const newBytes = Buffer.from(NEW_SHADER, "utf8");
if (newBytes.length > rec.length) {
  throw new Error(`New shader (${newBytes.length} B) larger than slot (${rec.length} B). Shrink the shader.`);
}

let padding = "\n// padding to preserve .ss_graph record size\n";
while (padding.length + newBytes.length < rec.length) {
  padding += "// ............\n";
}
padding = padding.slice(0, rec.length - newBytes.length);

const out = Buffer.from(buf);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(rec.length);
lenBuf.copy(out, rec.lenPrefix);
Buffer.concat([newBytes, Buffer.from(padding, "utf8")]).copy(out, rec.realStart);

writeFileSync(GRAPH, out);
console.log(`patched ${GRAPH}: shader=${newBytes.length} B + ${padding.length} B padding = ${rec.length} B record. .meta and .mat untouched.`);
