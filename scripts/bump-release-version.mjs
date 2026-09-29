import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJsonPath = path.join(projectRoot, "package.json");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const [major, minor, patch = 0] = String(pkg.version ?? "0.0.0")
  .split(".")
  .map((part) => Number.parseInt(part, 10) || 0);

const nextVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = nextVersion;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

console.log(`Release version bumped to ${nextVersion}`);
