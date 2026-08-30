import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CLI = "packages/node/dist/cli.js";
const EARLIER = "examples/pdf-fixtures/contracts/work-order-original.pdf";
const NEWER = "examples/pdf-fixtures/contracts/work-order-amended.pdf";

interface CliResult {
  readonly code: number;
  readonly stdout: string;
}

interface CliRun extends CliResult {
  readonly stderr: string;
}

async function cli(...args: readonly string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await run("node", [CLI, ...args], { maxBuffer: 32 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

const CAD_A = "examples/pdf-fixtures/cad/wheel-hub-rev-a.pdf";
const CAD_B = "examples/pdf-fixtures/cad/wheel-hub-rev-b.pdf";

test("the CLI compares two PDFs without a browser or a canvas", async () => {
  const { code, stdout } = await cli(EARLIER, NEWER);
  assert.equal(code, 0);
  assert.match(stdout, /work-order-original\.pdf → work-order-amended\.pdf/);
  assert.match(stdout, /of 1 pages/);
});

test("--report json emits a parseable report", async () => {
  const { stdout } = await cli(EARLIER, NEWER, "--report", "json");
  const report = JSON.parse(stdout);
  assert.equal(report.version, 1);
  assert.equal(report.pages.length, 1);
  assert.ok(report.totals.textChanges > 0);
});

test("--report csv emits a header and one row per change", async () => {
  const { stdout } = await cli(EARLIER, NEWER, "--report", "csv");
  const rows = stdout.trim().split("\n");
  assert.equal(rows[0], "earlier_page,newer_page,alignment,status,change_kind,before,after");
  assert.ok(rows.length > 1);
});

test("--fail-on-change exits non-zero only when something changed", async () => {
  assert.equal((await cli(EARLIER, NEWER, "--fail-on-change", "--report", "json")).code, 1);
  assert.equal((await cli(EARLIER, EARLIER, "--fail-on-change", "--report", "json")).code, 0);
});

test("comparing a document with itself reports no changes", async () => {
  const { stdout } = await cli(EARLIER, EARLIER);
  assert.match(stdout, /0 changed · 0 added · 0 removed/);
});

test("bad usage exits 2 and prints the usage text", async () => {
  const missing = await cli(EARLIER);
  assert.equal(missing.code, 2);
  const badFormat = await cli(EARLIER, NEWER, "--report", "xml");
  assert.equal(badFormat.code, 2);
});

test("--help exits 0 and documents the options", async () => {
  const { code, stdout } = await cli("--help");
  assert.equal(code, 0);
  assert.match(stdout, /--fail-on-change/);
  assert.match(stdout, /--report <text\|json\|csv>/);
});

test("a drawing whose fonts carry no Unicode map warns instead of reporting a clean run", async () => {
  const { stdout, stderr } = await cli(CAD_A, CAD_B);
  assert.match(stdout, /WARNING: 1 pages embed fonts with no Unicode mapping/);
  assert.match(stderr, /text changes on those pages cannot be detected/);
});

test("--fail-on-unreadable turns undecodable text into a non-zero exit", async () => {
  assert.equal((await cli(CAD_A, CAD_B, "--fail-on-unreadable")).code, 1);
  assert.equal((await cli(EARLIER, NEWER, "--fail-on-unreadable", "--report", "json")).code, 0);
});

test("the unreadable count reaches the JSON report", async () => {
  const { stdout } = await cli(CAD_A, CAD_B, "--report", "json");
  const report = JSON.parse(stdout);
  assert.equal(report.totals.pagesWithUnreadableText, 1);
  assert.equal(report.pages[0].textUnreadable, true);
});
