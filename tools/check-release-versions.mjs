#!/usr/bin/env node
/**
 * Ensure the three publishable packages share a version that matches the
 * pushed tag (vX.Y.Z → X.Y.Z). Fail the release job early otherwise.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.env.GITHUB_REF ?? "";
const tag = ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : process.env.RELEASE_TAG ?? "";

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(`Expected tag like v1.2.3, got: ${tag || "(empty)"}`);
  process.exit(1);
}

const expected = tag.slice(1);
const packages = [
  "packages/core/package.json",
  "packages/pdfjs-text/package.json",
  "packages/pdfdiff/package.json",
];

let failed = false;
for (const rel of packages) {
  const pkg = JSON.parse(readFileSync(join(root, rel), "utf8"));
  const ok = pkg.version === expected;
  console.log(`${pkg.name}: ${pkg.version}${ok ? "" : ` (expected ${expected})`}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error(`\nBump all three package versions to ${expected} on main before tagging ${tag}.`);
  process.exit(1);
}

console.log(`OK — all packages at ${expected} for ${tag}`);
