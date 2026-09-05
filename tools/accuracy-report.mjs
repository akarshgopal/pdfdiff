import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { comparePdfText } from "../packages/node/dist/index.js";

const input = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const corpusPath = resolve(input ?? "benchmarks/accuracy/corpus.json");
const check = process.argv.includes("--check");

const ratio = (found, total) => (total ? found / total : 1);
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const pairKey = (pair) =>
  `${pair.earlier ?? pair.earlierPageNumber ?? "-"}:${pair.newer ?? pair.newerPageNumber ?? "-"}:${pair.kind}`;
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en");
const includes = (value, expected) => expected === undefined || normalize(value).includes(normalize(expected));

function validateCorpus(corpus) {
  if (corpus?.schemaVersion !== 1 || !Array.isArray(corpus.cases))
    throw new Error("Accuracy corpus must use schemaVersion 1 and contain cases.");
  for (const entry of corpus.cases) {
    if (!entry.id || !entry.earlier || !entry.newer || !Array.isArray(entry.pages))
      throw new Error("Every accuracy case needs id, earlier, newer, and pages.");
    for (const page of entry.visualPages ?? []) {
      if (
        !Number.isInteger(page.earlier) ||
        !Number.isInteger(page.newer) ||
        !["same", "changed", "added", "removed"].includes(page.status)
      ) {
        throw new Error(`${entry.id} has an invalid visual page expectation.`);
      }
      for (const region of page.regions ?? []) {
        if (
          !region.label ||
          !Array.isArray(region.box) ||
          region.box.length !== 4 ||
          region.box.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
          region.box[0] >= region.box[2] ||
          region.box[1] >= region.box[3]
        ) {
          throw new Error(`${entry.id} has an invalid normalized visual box.`);
        }
      }
    }
  }
}

function scoreAlignment(entry, comparison) {
  const expected = new Set(entry.pages.map(pairKey));
  const actual = new Set(comparison.alignment.map(pairKey));
  const missing = [...expected].filter((key) => !actual.has(key));
  const unexpected = entry.alignmentCoverage === "complete" ? [...actual].filter((key) => !expected.has(key)) : [];
  const found = expected.size - missing.length;
  const statusMisses = entry.pages.filter(
    (page) =>
      page.status &&
      !comparison.report.pages.some(
        (actualPage) =>
          actualPage.earlierPage === page.earlier &&
          actualPage.newerPage === page.newer &&
          actualPage.status === page.status,
      ),
  );
  return {
    found,
    total: expected.size,
    recall: ratio(found, expected.size),
    precision: entry.alignmentCoverage === "complete" ? ratio(found, actual.size) : undefined,
    missing,
    unexpected,
    statusMisses,
  };
}

function scoreText(entry, report) {
  const actual = report.pages.flatMap((page) => page.textChanges.map((change) => ({ page, change })));
  const used = new Set();
  const missing = [];
  for (const anchor of entry.textAnchors ?? []) {
    const index = actual.findIndex(
      ({ page, change }, candidate) =>
        !used.has(candidate) &&
        page.earlierPage === anchor.earlier &&
        page.newerPage === anchor.newer &&
        change.kind === anchor.kind &&
        includes(change.before, anchor.beforeIncludes) &&
        includes(change.after, anchor.afterIncludes),
    );
    if (index < 0) missing.push(anchor.id);
    else used.add(index);
  }
  const forbidden = (entry.forbiddenFragments ?? []).filter((fragment) =>
    actual.some(({ change }) => includes(`${change.before} ${change.after}`, fragment)),
  );
  return { found: used.size, total: (entry.textAnchors ?? []).length, missing, forbidden };
}

async function scoreCase(entry) {
  const comparison = await comparePdfText(resolve(entry.earlier), resolve(entry.newer));
  const alignment = scoreAlignment(entry, comparison);
  const text = scoreText(entry, comparison.report);
  const trust = comparison.report.totals.pagesWithUnreadableText === entry.trust.unreadablePages;
  let self = true;
  if (entry.selfCheck) {
    const controls = await Promise.all([
      comparePdfText(resolve(entry.earlier), resolve(entry.earlier)),
      comparePdfText(resolve(entry.newer), resolve(entry.newer)),
    ]);
    self = controls.every(
      ({ report }) =>
        report.totals.changedPages === 0 &&
        report.totals.addedPages === 0 &&
        report.totals.removedPages === 0 &&
        report.totals.textChanges === 0,
    );
  }
  const passed =
    alignment.recall === 1 &&
    (alignment.precision === undefined || alignment.precision === 1) &&
    alignment.statusMisses.length === 0 &&
    text.missing.length === 0 &&
    text.forbidden.length === 0 &&
    trust &&
    self;
  return { entry, alignment, text, trust, self, passed };
}

const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
validateCorpus(corpus);
const results = [];
for (const entry of corpus.cases) results.push(await scoreCase(entry));

console.table(
  results.map(({ entry, alignment, text, trust, self, passed }) => ({
    case: entry.id,
    alignment:
      alignment.precision === undefined
        ? `${alignment.found}/${alignment.total} anchors`
        : `${percent(alignment.precision)} P / ${percent(alignment.recall)} R`,
    semantic: `${text.found}/${text.total} anchors`,
    forbidden: text.forbidden.length,
    trust: trust ? "pass" : "FAIL",
    self: self ? "pass" : "FAIL",
    result: passed ? "pass" : "FAIL",
  })),
);

for (const result of results.filter(({ passed }) => !passed)) {
  const details = [
    result.alignment.missing.length ? `missing page pairs: ${result.alignment.missing.join(", ")}` : "",
    result.alignment.unexpected.length ? `unexpected page pairs: ${result.alignment.unexpected.join(", ")}` : "",
    result.alignment.statusMisses.length
      ? `wrong page status: ${result.alignment.statusMisses.map(pairKey).join(", ")}`
      : "",
    result.text.missing.length ? `missing text anchors: ${result.text.missing.join(", ")}` : "",
    result.text.forbidden.length ? `forbidden extraction artifacts: ${result.text.forbidden.join(", ")}` : "",
    !result.trust ? "text trust mismatch" : "",
    !result.self ? "self-comparison produced changes" : "",
  ].filter(Boolean);
  console.log(`${result.entry.id}: ${details.join("; ")}`);
}

const visualAnnotations = corpus.cases.reduce(
  (total, entry) => total + (entry.visualPages ?? []).reduce((pages, page) => pages + (page.regions?.length ?? 0), 0),
  0,
);
console.log(
  `${results.filter(({ passed }) => passed).length}/${results.length} cases pass; ${visualAnnotations} visual regions annotated but not yet scored by the text-only runner.`,
);
if (check && results.some(({ passed }) => !passed)) process.exitCode = 1;
