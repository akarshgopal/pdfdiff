import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, "packages/pdfdiff/dist/cli.js"))) process.exit(0);

execSync(
  "pnpm --filter @pdfdiff/core build && pnpm --filter @pdfdiff/pdfjs-text build && pnpm --filter @pdfdiff/cli build",
  { cwd: root, stdio: "inherit" },
);
