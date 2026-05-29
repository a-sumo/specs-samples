#!/usr/bin/env node
// Bring the Lens Studio instance that owns this project to the front and send
// Cmd+Shift+R. Lens uses that shortcut to reload the project from disk, which
// is the fastest way to make externally repaired .ss_graph files beat stale
// in-memory shader state.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : "";
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function openAccessibilitySettings() {
  spawnSync("open", [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  ]);
}

function lensPidFromProjectLock() {
  const explicit = argValue("--pid");
  if (explicit) return explicit;

  let locks = "";
  try {
    locks = run("find", [projectRoot, "-maxdepth", "1", "-name", "*.esproj.*.lock", "-print"]);
  } catch (e) {}

  const lockList = locks.split("\n").filter(Boolean);
  for (const lock of lockList) {
    try {
      const pids = run("lsof", ["-t", lock]).split("\n").filter(Boolean);
      if (pids.length > 0) return pids[pids.length - 1];
    } catch (e) {}
  }

  try {
    const ps = run("pgrep", ["-f", "/Applications/Lens Studio_.*Contents/MacOS/Lens Studio"]);
    const pids = ps.split("\n").filter(Boolean);
    return pids[pids.length - 1] || "";
  } catch (e) {
    return "";
  }
}

function reloadLens(pid) {
  const script = `
tell application "System Events"
  set targetProcess to first process whose unix id is ${Number(pid)}
  set frontmost of targetProcess to true
  delay 0.25
  keystroke "r" using {command down, shift down}
end tell
`;
  return spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const pid = lensPidFromProjectLock();
if (!pid) {
  console.error("Could not find a running Lens Studio process for this project.");
  process.exit(1);
}

console.log(`Reloading Lens Studio project via Cmd+Shift+R (pid ${pid})...`);
const result = reloadLens(pid);

if (result.status === 0) {
  console.log("Reload shortcut sent.");
  process.exit(0);
}

const message = `${result.stderr || result.stdout || ""}`.trim();
console.error(message || "Lens reload shortcut failed.");
if (message.includes("not allowed to send keystrokes") || message.includes("1002")) {
  console.error("");
  console.error("macOS Accessibility permission is needed for scripted Lens reloads.");
  console.error("Enable osascript, Visual Studio Code, Codex, or your terminal in:");
  console.error("System Settings -> Privacy & Security -> Accessibility");
  console.error("Then run: npm run reload:lens");
  openAccessibilitySettings();
}
process.exit(result.status || 1);
