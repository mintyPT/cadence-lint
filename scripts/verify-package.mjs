#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packJsonPath = process.argv[2];

if (!packJsonPath) {
  fail("Usage: node scripts/verify-package.mjs <npm-pack-json>");
}

const packJson = JSON.parse(readFileSync(packJsonPath, "utf8"));
const packResult = Array.isArray(packJson) ? packJson[0] : packJson[packageJson.name];

if (!packResult) {
  fail(`Package dry-run did not include ${packageJson.name}.`);
}

const files = new Set(packResult.files.map((file) => file.path));
const binEntries = Object.values(packageJson.bin ?? {}).map((value) => value.replace(/^\.\//, ""));

const requiredFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.d.ts",
  ...binEntries,
];

const missing = requiredFiles.filter((file) => !files.has(file));
if (missing.length > 0) {
  fail(`Package dry-run is missing required files: ${missing.join(", ")}`);
}

for (const binPath of binEntries) {
  const cli = readFileSync(binPath, "utf8");
  if (!cli.startsWith("#!/usr/bin/env node")) {
    fail(`${binPath} must start with the node shebang.`);
  }

  const mode = statSync(binPath).mode;
  if ((mode & 0o111) === 0) {
    fail(`${binPath} is not executable in the built output.`);
  }
}

console.log(`Verified ${packageJson.name}@${packageJson.version} package dry-run (${packResult.files.length} files).`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
