#!/usr/bin/env node
/**
 * Publish @pdfdiff/core → @pdfdiff/pdfjs-text → @pdfdiff/cli when the version
 * in package.json is not yet on the npm registry. Skips versions that already
 * exist (so a README-only touch of package.json is a no-op if unchanged).
 *
 * Auth: npm trusted publishing (OIDC). Do not set NPM_TOKEN.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Dependency order for first-time and workspace consumers. */
const PACKAGES = ["packages/core/package.json", "packages/pdfjs-text/package.json", "packages/pdfdiff/package.json"];

function readPkg(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function versionExists(name, version) {
  try {
    execSync(`npm view ${name}@${version} version`, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

function publish(name) {
  console.log(`Publishing ${name}…`);
  execSync(`pnpm --filter ${name} publish --access public --no-git-checks`, {
    cwd: root,
    stdio: "inherit",
  });
}

let published = 0;
for (const rel of PACKAGES) {
  const { name, version } = readPkg(rel);
  if (versionExists(name, version)) {
    console.log(`skip ${name}@${version} (already on npm)`);
    continue;
  }
  console.log(`new ${name}@${version}`);
  publish(name);
  published += 1;
}

if (published === 0) {
  console.log("Nothing to publish.");
} else {
  console.log(`Published ${published} package(s).`);
}
