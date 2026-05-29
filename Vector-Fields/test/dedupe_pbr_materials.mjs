import fs from "node:fs";
import path from "node:path";

const root = path.resolve("Assets");
const targetMaterialPath = path.join(root, "Materials", "FlatMaterial.mat");
const targetMaterial = readMaterialId(targetMaterialPath);

const pbrFiles = walk(root).filter((file) => /^PBR( \d+)?\.mat$/.test(path.basename(file)));
const pbrMaterialIds = [];

for (const file of pbrFiles) {
  const id = readMaterialId(file);
  if (id) pbrMaterialIds.push(id);
}

if (pbrMaterialIds.length === 0) {
  console.log("No generated PBR materials found.");
  process.exit(0);
}

const pbrIdPattern = new RegExp(pbrMaterialIds.join("|"), "g");
const changedFiles = [];

for (const file of walk(root)) {
  if (!isTextAsset(file)) continue;
  if (/\/PBR( \d+)?\.mat(\.meta)?$/.test(file)) continue;

  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(pbrIdPattern, targetMaterial);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changedFiles.push(path.relative(root, file));
  }
}

for (const file of pbrFiles) {
  removeIfExists(file);
  removeIfExists(file + ".meta");
}

console.log(`Repointed ${pbrMaterialIds.length} generated PBR material ids to FlatMaterial.`);
console.log(`Updated ${changedFiles.length} files.`);
for (const file of changedFiles) {
  console.log(`  ${file}`);
}

function readMaterialId(file) {
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8");
  return text.match(/!<Material\/([0-9a-f-]+)>/)?.[1] || "";
}

function removeIfExists(file) {
  if (fs.existsSync(file)) fs.rmSync(file);
}

function isTextAsset(file) {
  return /\.(scene|prefab|mat|meta|ts|js|json|yaml|yml)$/.test(file);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file, out);
    } else {
      out.push(file);
    }
  }
  return out;
}
