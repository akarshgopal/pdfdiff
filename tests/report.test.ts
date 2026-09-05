import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReport,
  hasSubstantiveChanges,
  hasUnreadableText,
  reportToCsv,
  reportToJson,
  reportToText,
  type ComparisonPage,
} from "@pdfdiff/core";

function page(overrides: Partial<ComparisonPage> & { index: number }): ComparisonPage {
  return {
    status: "same",
    changeClasses: { content: 0, reflow: 0, formatting: 0, graphic: 0 },
    noticeable: true,
    ...overrides,
  };
}

function semantic(
  changes: ReadonlyArray<{ id: string; kind: "added" | "removed" | "changed"; before: string; after: string }>,
) {
  return {
    before: [],
    after: [],
    changes,
    beforeTokenCount: 0,
    afterTokenCount: 0,
    hasBeforeText: true,
    hasAfterText: true,
    beforeOverlays: [],
    afterOverlays: [],
  };
}

const REPORT = buildReport({
  earlierName: "spec-v1.pdf",
  newerName: "spec-v2.pdf",
  generatedAt: new Date("2026-08-30T12:00:00Z"),
  pages: [
    page({
      index: 0,
      earlierPageNumber: 1,
      newerPageNumber: 1,
      alignment: "matched",
      status: "changed",
      changeClasses: { content: 2, reflow: 4, formatting: 0, graphic: 1 },
      semantic: semantic([{ id: "c1", kind: "changed", before: "30 days", after: "60 days" }]),
    }),
    page({
      index: 1,
      newerPageNumber: 2,
      alignment: "added",
      status: "added",
      semantic: semantic([{ id: "c2", kind: "added", before: "", after: "New schedule" }]),
    }),
    page({
      index: 2,
      earlierPageNumber: 2,
      newerPageNumber: 3,
      alignment: "matched",
      status: "changed",
      noticeable: false,
      changeClasses: { content: 0, reflow: 7, formatting: 0, graphic: 0 },
      semantic: semantic([]),
    }),
    page({
      index: 3,
      earlierPageNumber: 3,
      newerPageNumber: 4,
      alignment: "moved",
      status: "same",
      semantic: semantic([]),
    }),
  ],
});

test("totals count every changed page including possible reflow", () => {
  assert.deepEqual(REPORT.totals, {
    pages: 4,
    changedPages: 2,
    addedPages: 1,
    removedPages: 0,
    movedPages: 1,
    noisePages: 1,
    textChanges: 2,
    classes: { content: 2, reflow: 11, formatting: 0, graphic: 1 },
    pagesWithoutText: 0,
    pagesWithUnreadableText: 0,
  });
});

test("the report is stable, serializable JSON", () => {
  const parsed = JSON.parse(reportToJson(REPORT));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.generatedAt, "2026-08-30T12:00:00.000Z");
  assert.equal(parsed.pages[0].textChanges[0].after, "60 days");
});

test("CSV carries one row per text change with quoted fields", () => {
  const rows = reportToCsv(REPORT).trim().split("\n");
  assert.equal(rows[0], "earlier_page,newer_page,alignment,status,change_kind,before,after");
  assert.equal(rows[1], "1,1,matched,changed,changed,30 days,60 days");
  assert.equal(rows[2], ",2,added,added,added,,New schedule");
  assert.equal(rows.length, 5, "possible reflow and page movement remain in the export");
});

test("CSV escapes separators inside change text", () => {
  const tricky = buildReport({
    earlierName: "a.pdf",
    newerName: "b.pdf",
    pages: [
      page({
        index: 0,
        earlierPageNumber: 1,
        newerPageNumber: 1,
        status: "changed",
        semantic: semantic([{ id: "c1", kind: "changed", before: 'x, "y"', after: "line\nbreak" }]),
      }),
    ],
  });
  // Not split on newlines: the escaped field deliberately contains one.
  const csv = reportToCsv(tricky);
  assert.ok(csv.includes('"x, ""y"""'), "quotes and commas are escaped");
  assert.ok(csv.includes('"line\nbreak"'), "a newline stays inside its quoted field");
});

test("a page that changed visually but has no text still appears in CSV", () => {
  const visual = buildReport({
    earlierName: "a.pdf",
    newerName: "b.pdf",
    pages: [
      page({
        index: 0,
        earlierPageNumber: 1,
        newerPageNumber: 1,
        status: "changed",
        changeClasses: { content: 0, reflow: 0, formatting: 0, graphic: 3 },
      }),
    ],
  });
  assert.match(reportToCsv(visual), /1,1,matched,changed,visual,,/);
});

test("the text report includes possible reflow by default", () => {
  const quiet = reportToText(REPORT);
  assert.match(quiet, /2 changed · 1 added · 0 removed · 1 moved of 4 pages/);
  assert.match(quiet, /~ 30 days → 60 days/);
  assert.match(quiet, /\+ New schedule/);
  assert.match(quiet, /1 pages may include reflow or formatting/);
  assert.match(quiet, /A 2 → B 3/);

  assert.match(reportToText(REPORT, { includeNoise: true }), /A 2 → B 3/);
});

test("change detection includes possible reflow", () => {
  assert.equal(hasSubstantiveChanges(REPORT), true);
  const noiseOnly = buildReport({
    earlierName: "a.pdf",
    newerName: "b.pdf",
    pages: [
      page({
        index: 0,
        earlierPageNumber: 1,
        newerPageNumber: 1,
        status: "changed",
        noticeable: false,
        changeClasses: { content: 0, reflow: 5, formatting: 0, graphic: 0 },
        semantic: semantic([]),
      }),
    ],
  });
  assert.equal(hasSubstantiveChanges(noiseOnly), true);
});

test("a page whose text could not be decoded is called out, not reported as clean", () => {
  const undecodable = buildReport({
    earlierName: "drawing-a.pdf",
    newerName: "drawing-b.pdf",
    pages: [
      page({
        index: 0,
        earlierPageNumber: 1,
        newerPageNumber: 1,
        status: "changed",
        changeClasses: { content: 0, reflow: 0, formatting: 0, graphic: 80 },
        semantic: { ...semantic([]), hasBeforeText: false, hasAfterText: false, textUndecodable: true },
      }),
    ],
  });
  assert.equal(undecodable.totals.pagesWithUnreadableText, 1);
  assert.equal(undecodable.pages[0]!.textUnreadable, true);
  assert.equal(hasUnreadableText(undecodable), true);
  assert.match(reportToText(undecodable), /WARNING: 1 pages embed fonts with no Unicode mapping/);
});

test("a readable comparison is not flagged as unreadable", () => {
  assert.equal(hasUnreadableText(REPORT), false);
});

test("pages without extractable text are counted for the trust warning", () => {
  const scanned = buildReport({
    earlierName: "a.pdf",
    newerName: "b.pdf",
    pages: [page({ index: 0, earlierPageNumber: 1, newerPageNumber: 1 })],
  });
  assert.equal(scanned.totals.pagesWithoutText, 1);
  assert.match(reportToText(scanned), /1 pages have no selectable text/);
});
