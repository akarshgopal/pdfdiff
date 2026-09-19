import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CLI = "packages/pdfdiff/dist/cli.js";
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
const SHEET_A = "examples/pdf-fixtures/datasheets/ti-sn74lv126a-rev-i.pdf";
const SHEET_B = "examples/pdf-fixtures/datasheets/ti-sn74lv126a-rev-j.pdf";
const PCB_A = "examples/pdf-fixtures/pcb/olimexino-stm32-rev-a.pdf";
const PCB_B = "examples/pdf-fixtures/pcb/olimexino-stm32-rev-b.pdf";

test("the CLI compares two PDFs without a browser", async () => {
  const { code, stdout } = await cli(EARLIER, NEWER, "--text-only");
  assert.equal(code, 0);
  assert.match(stdout, /work-order-original\.pdf → work-order-amended\.pdf/);
  assert.match(stdout, /of 1 pages/);
});

test("--report json emits a parseable report", async () => {
  const { stdout } = await cli(EARLIER, NEWER, "--text-only", "--report", "json");
  const report = JSON.parse(stdout);
  assert.equal(report.version, 1);
  assert.equal(report.pages.length, 1);
  assert.ok(report.totals.textChanges > 0);
});

test("--report csv emits a header and one row per change", async () => {
  const { stdout } = await cli(EARLIER, NEWER, "--text-only", "--report", "csv");
  const rows = stdout.trim().split("\n");
  assert.equal(rows[0], "earlier_page,newer_page,alignment,status,change_kind,before,after");
  assert.ok(rows.length > 1);
});

test("--report markdown emits a heading and quoted edits", async () => {
  const { stdout } = await cli(EARLIER, NEWER, "--text-only", "--report", "markdown");
  assert.match(stdout, /^# work-order-original\.pdf → work-order-amended\.pdf/m);
  assert.match(stdout, /^## /m);
});

test("--fail-on-change exits non-zero only when something changed", async () => {
  assert.equal((await cli(EARLIER, NEWER, "--text-only", "--fail-on-change", "--report", "json")).code, 1);
  assert.equal((await cli(EARLIER, EARLIER, "--text-only", "--fail-on-change", "--report", "json")).code, 0);
});

test("comparing a document with itself reports no changes", async () => {
  const { stdout } = await cli(EARLIER, EARLIER, "--text-only");
  assert.match(stdout, /0 changed · 0 added · 0 removed/);
});

test("no arguments prints usage to stderr and exits 2", async () => {
  const { code, stdout, stderr } = await cli();
  assert.equal(code, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /Usage:/);
  assert.match(stderr, /Exit codes:/);
});

test("bad usage exits 2 and prints the usage text", async () => {
  const missing = await cli(EARLIER);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /Usage:/);
  const badFormat = await cli(EARLIER, NEWER, "--report", "xml");
  assert.equal(badFormat.code, 2);
});

test("--help and -h exit 0 and document the options", async () => {
  for (const flag of ["--help", "-h"]) {
    const { code, stdout } = await cli(flag);
    assert.equal(code, 0, flag);
    assert.match(stdout, /--fail-on-change/);
    assert.match(stdout, /--report <text\|json\|csv\|markdown>/);
    assert.match(stdout, /--text-only/);
    assert.match(stdout, /--images/);
    assert.match(stdout, /Exit codes:/);
    assert.match(stdout, /Suppress progress and warnings \(report still prints\)/);
  }
});

test("--quiet still prints the report and omits the stderr warning", async () => {
  const { code, stdout, stderr } = await cli(CAD_A, CAD_B, "--text-only", "--quiet");
  assert.equal(code, 0);
  assert.match(stdout, /WARNING: 1 pages embed fonts with no Unicode mapping/);
  assert.doesNotMatch(stderr, /text changes on those pages cannot be detected/);
  assert.doesNotMatch(stderr, /Comparing page/);
});

test("--version prints the package version", async () => {
  const { code, stdout } = await cli("--version");
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("a drawing whose fonts carry no Unicode map warns instead of reporting a clean run", async () => {
  const { stdout, stderr } = await cli(CAD_A, CAD_B, "--text-only");
  assert.match(stdout, /WARNING: 1 pages embed fonts with no Unicode mapping/);
  assert.match(stderr, /text changes on those pages cannot be detected/);
});

test("--fail-on-unreadable turns undecodable text into a non-zero exit", async () => {
  assert.equal((await cli(CAD_A, CAD_B, "--text-only", "--fail-on-unreadable")).code, 1);
  assert.equal((await cli(EARLIER, NEWER, "--text-only", "--fail-on-unreadable", "--report", "json")).code, 0);
});

test("the unreadable count reaches the JSON report", async () => {
  const { stdout } = await cli(CAD_A, CAD_B, "--text-only", "--report", "json");
  const report = JSON.parse(stdout);
  assert.equal(report.totals.pagesWithUnreadableText, 1);
  assert.equal(report.pages[0].textUnreadable, true);
});

test("the PCB fixture does not promote text extraction spacing to semantic changes", async () => {
  const { stdout } = await cli(PCB_A, PCB_B, "--text-only", "--report", "json");
  const report = JSON.parse(stdout);
  const changes = report.pages[0].textChanges as Array<{ before: string; after: string }>;
  assert.ok(changes.length <= 30, `expected at most 30 meaningful changes, got ${changes.length}`);
  assert.doesNotMatch(
    changes.map(({ before, after }) => `${before} → ${after}`).join("\n"),
    /PO W ER|ANALO G|DIG ITAL|T RST|T DI|T DO/,
  );
});

test("every documented flag is accepted, including --no-detect-moves", async () => {
  const { code, stderr } = await cli(
    EARLIER,
    NEWER,
    "--text-only",
    "--no-detect-moves",
    "--threshold",
    "0.6",
    "--report",
    "json",
  );
  assert.equal(code, 0, stderr);
});

test("an unknown flag exits with the usage code", async () => {
  assert.equal((await cli(EARLIER, NEWER, "--nope")).code, 2);
});

test("a visual self-comparison reports no changes", { timeout: 120_000 }, async () => {
  const { code, stdout } = await cli(EARLIER, EARLIER, "--report", "json", "--quiet");
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.totals.changedPages, 0);
  assert.equal(report.totals.textChanges, 0);
});

test("visual comparison of a drawing reports pixel changes", { timeout: 120_000 }, async () => {
  const { code, stdout } = await cli(CAD_A, CAD_B, "--report", "json", "--quiet");
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.ok(report.pages[0].changedPercent > 0);
  assert.ok(report.totals.classes.graphic + report.totals.classes.content > 0);
});

test("--images writes a PNG overlay for a changed page", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "pdfdiff-"));
  const { code, stderr } = await cli(CAD_A, CAD_B, "--images", dir, "--report", "json", "--quiet");
  assert.equal(code, 0, stderr);
  const files = await readdir(dir);
  const png = files.find((name) => name.endsWith(".png"));
  assert.ok(png, `expected a PNG in ${dir}, got ${files.join(", ")}`);
  const buf = await readFile(join(dir, png));
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("--images is rejected with --text-only", async () => {
  const { code, stderr } = await cli(EARLIER, NEWER, "--text-only", "--images", "/tmp/unused");
  assert.equal(code, 2);
  assert.match(stderr, /--images requires a visual comparison/);
});

// The datasheet pair, and JSON: the report has to be bigger than the 64KB pipe buffer,
// or the whole thing lands in the buffer and the write never fails.
test("a reader that closes the pipe early is not a crash", { timeout: 180_000 }, async () => {
  const command = `node ${CLI} ${SHEET_A} ${SHEET_B} --text-only --report json --fail-on-change --quiet | head -c 200 > /dev/null`;
  const { stdout, stderr } = await run("bash", ["-c", `${command}; echo "EXIT:\${PIPESTATUS[0]}"`]);
  assert.doesNotMatch(stderr, /EPIPE|Unhandled|node:internal/, stderr);
  // Closing the pipe must not swallow --fail-on-change either.
  assert.match(stdout, /EXIT:1/);
});
