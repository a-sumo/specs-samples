// Clone Assets/Materials/VectorField.ss_graph into a new material with our
// own embedded GLSL. Patches the length-prefixed shader string in-place.
//
// LS .ss_graph binary layout (per record):
//   <u32_le nameLen><name UTF-8>
//   <u32_le typeId>
//   <u32_le dataLen>
//   <data bytes>
//   ... next record ...
//
// The shader source lives in a record named "Data" of type 7 (string). The
// file may contain multiple copies (source + compiled with N0_ prefixes) --
// patching the first one is enough; LS recompiles on import.

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ROOT = "/Users/armand/Documents/specs-samples/Vector-Fields";
const SOURCE_GRAPH = `${ROOT}/Assets/Materials/VectorField.ss_graph`;
const DEST_NAME = "WindStreamFlow";

const NEW_SHADER = `// WindStreamFlow -- per-vertex flow + matplotlib turbo + optional displacement.
//
// Consumes packed UVs from WindStreamlines.ts:
//   texture0 = (pathT, templatePhase)
//   texture1 = (speedNorm, _)   speedNorm = clamp(speed_mps / 70, 0, 1)
//
// Color comes from matplotlib's turbo colormap via Mikhailov's polynomial fit
// (Google AI Blog 2019). Matches the web view's wind-speed visualisation.

input_float Time;
input_float PhaseSpeed;
input_float Displace;

output_vec3 transformedPosition;
output_vec4 vertexColor;

vec3 turbo(float x) {
    const vec4 kRedVec4   = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
    const vec4 kGreenVec4 = vec4(0.09140261, 2.19418839,   4.84296658, -14.18503333);
    const vec4 kBlueVec4  = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
    const vec2 kRedVec2   = vec2(-152.94239396, 59.28637943);
    const vec2 kGreenVec2 = vec2(   4.27729857,  2.82956604);
    const vec2 kBlueVec2  = vec2( -89.90310912, 27.34824973);
    float t = clamp(x, 0.0, 1.0);
    vec4 v4 = vec4(1.0, t, t * t, t * t * t);
    vec2 v2 = vec2(v4.z, v4.w) * v4.z;
    return clamp(vec3(
        dot(v4, kRedVec4)   + dot(v2, kRedVec2),
        dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
        dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
    ), 0.0, 1.0);
}

void main() {
    vec3 pos = system.getSurfacePositionObjectSpace();
    vec2 uv0 = system.getSurfaceUVCoord0();
    vec2 uv1 = system.getSurfaceUVCoord1();

    float pathT = uv0.x;
    float templatePhase = uv0.y;
    float speedNorm = uv1.x;

    // Moving bright head along the dash, wrapping 0..1.
    float phase = fract(Time * PhaseSpeed + templatePhase);
    float d = pathT - phase;
    if (d < -0.5) d += 1.0;
    if (d > 0.5)  d -= 1.0;
    float head = clamp(1.0 - abs(d) * 3.5, 0.0, 1.0);
    head = head * head * (3.0 - 2.0 * head);

    // Turbo lookup at the baked wind-speed magnitude.
    vec3 color = turbo(speedNorm);

    // Optional vertex displacement perpendicular to the surface -- ribbons
    // ride the streamline path but breathe in/out by speed. Globe center is at
    // the origin of this SceneObject's local frame (see WindStreamlines.ts).
    vec3 nrm = normalize(pos);
    float wave = sin(Time * 1.2 + templatePhase * 6.2831) * head;
    pos += nrm * (wave * Displace * (0.4 + 0.6 * speedNorm));

    transformedPosition = pos;
    // PremultipliedAlpha blend: RGB pre-scaled by alpha. We boost the alpha at
    // the head so the brightest sliver dominates each dash.
    float a = head;
    vertexColor = vec4(color * a, a);
}
`;

function uuid() {
  const b = randomBytes(16);
  // Mark v4 + RFC 4122 variant.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// IMPORTANT: LS .ss_graph contains nested records whose outer sizes include
// the embedded shader length. Changing the file length corrupts those outer
// sizes ("String size mismatch" on load). To stay safe we PAD the new shader
// with a trailing comment block so the patched record occupies the SAME byte
// count as the original. Every other offset/size in the file is untouched.
function patchShader(buf) {
  const marker = Buffer.from("// VectorFieldTubesShader");
  const start = buf.indexOf(marker);
  if (start < 0) throw new Error("Couldn't locate shader text start");

  let realStart = start;
  while (realStart > 0 && buf[realStart - 1] >= 0x09 && buf[realStart - 1] < 0x80) realStart--;
  let realEnd = start;
  while (realEnd < buf.length && buf[realEnd] >= 0x09 && buf[realEnd] < 0x80) realEnd++;

  const lenPrefixOffset = realStart - 4;
  const oldLen = buf.readUInt32LE(lenPrefixOffset);
  if (oldLen !== realEnd - realStart) {
    throw new Error(`Shader length prefix mismatch: prefix=${oldLen}, scanned=${realEnd - realStart}`);
  }

  let newBytes = Buffer.from(NEW_SHADER, "utf8");
  if (newBytes.length > oldLen) {
    throw new Error(
      `New shader (${newBytes.length} B) is larger than the original slot (${oldLen} B). ` +
      `Either trim the shader, or pick a larger source .ss_graph to clone.`
    );
  }
  if (newBytes.length < oldLen) {
    // Pad with a trailing comment block of EXACTLY the missing length. Build
    // greedily then trim to fit.
    const padLen = oldLen - newBytes.length;
    let padding = "\n// --- padding to preserve .ss_graph record size ---\n";
    while (padding.length < padLen) padding += "// ............\n";
    padding = padding.slice(0, padLen);
    // If the trim cut mid-comment, replace the tail with spaces (still valid GLSL).
    if (padding.endsWith("\n") === false && padding.indexOf("//") !== -1) {
      // safe -- any trailing fragment will be interpreted as part of the previous comment
    }
    if (padding.length !== padLen) {
      throw new Error(`Padding length mismatch: wanted ${padLen}, got ${padding.length}`);
    }
    newBytes = Buffer.concat([newBytes, Buffer.from(padding, "utf8")]);
  }
  if (newBytes.length !== oldLen) {
    throw new Error(`Padded shader (${newBytes.length} B) != original (${oldLen} B)`);
  }

  // The length prefix is identical to the original -- but rewrite anyway as a
  // defensive no-op so any future format check still passes.
  const out = Buffer.from(buf);
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(newBytes.length);
  lenBuf.copy(out, lenPrefixOffset);
  newBytes.copy(out, realStart);
  console.log(`Patched shader in place: ${oldLen} bytes (real shader ${Buffer.from(NEW_SHADER).length} B + ${oldLen - Buffer.from(NEW_SHADER).length} B padding)`);
  return out;
}

// 1) Patch the .ss_graph
const srcGraph = readFileSync(SOURCE_GRAPH);
const patchedGraph = patchShader(srcGraph);
const destGraph = `${ROOT}/Assets/Materials/${DEST_NAME}.ss_graph`;
writeFileSync(destGraph, patchedGraph);
console.log(`Wrote ${destGraph} (${patchedGraph.length} bytes)`);

// 2) Generate fresh UUIDs for the .ss_graph.meta and .mat
const graphAssetId = uuid();
const graphPrimaryId = uuid();
const matId = uuid();
const matPassId = uuid();

// 3) .ss_graph.meta
const graphMeta = `- !<AssetImportMetadata/${graphAssetId}>
  ImportedAssetIds:
    ShaderGraph: !<reference> ${graphPrimaryId}
  ImporterName: ShaderGraphPassImporter
  PrimaryAsset: !<reference> ${graphPrimaryId}
  PackageType: NotAPackage
  LegacyPackagePolicy: ~
  ExtraData:
    {}
  AssetDataMap:
    {}
  DependentFiles:
    []
  ImporterSettings: !<AssetImporterSettings>
    {}
  CompressionSettings: !<own> 00000000-0000-0000-0000-000000000000
`;
writeFileSync(`${ROOT}/Assets/Materials/${DEST_NAME}.ss_graph.meta`, graphMeta);
console.log(`Wrote .ss_graph.meta (PrimaryAsset=${graphPrimaryId})`);

// 4) Minimal .mat that references the new graph's Pass UUID
const matYaml = `- !<Material/${matId}>
  PackagePath: ""
  PassesInfo:
    - !<own> ${matPassId}
- !<PassInfo/${matPassId}>
  CachedProperties:
    []
  DepthWrite: false
  DepthTest: true
  DepthFunction: LessEqual
  TwoSided: true
  ColorMask: {x: true, y: true, z: true, w: true}
  CullMode: None
  PolygonOffset: {x: 0.000000, y: 0.000000}
  FrustumCulling: Auto
  FrustumCullPad: 0.000000
  InstanceCount: 1
  Defines:
    []
  BlendMode: PremultipliedAlpha
  Properties:
    Time:
      typeIdx: 1
      value: 0.000000
    PhaseSpeed:
      typeIdx: 1
      value: 0.450000
    Displace:
      typeIdx: 1
      value: 0.000000
    PreviewEnabled:
      typeIdx: 0
      value: 0
  Pass: !<reference> ${graphPrimaryId}
`;
writeFileSync(`${ROOT}/Assets/Materials/${DEST_NAME}.mat`, matYaml);
console.log(`Wrote .mat (Material=${matId}, Pass→${graphPrimaryId})`);

// 5) .mat.meta
const matMeta = `- !<AssetImportMetadata/${uuid()}>
  ImportedAssetIds:
    Material: !<reference> ${matId}
  ImporterName: MaterialImporter
  PrimaryAsset: !<reference> ${matId}
  PackageType: NotAPackage
  LegacyPackagePolicy: ~
  ExtraData:
    {}
  AssetDataMap:
    {}
  DependentFiles:
    []
  ImporterSettings: !<AssetImporterSettings>
    {}
  CompressionSettings: !<own> 00000000-0000-0000-0000-000000000000
`;
writeFileSync(`${ROOT}/Assets/Materials/${DEST_NAME}.mat.meta`, matMeta);

console.log("\nIDs to wire on the WindStreamlines script's material @input:");
console.log("  Material UUID:", matId);
