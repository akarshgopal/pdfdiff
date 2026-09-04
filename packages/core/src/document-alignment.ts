import { throwIfAborted } from "./errors.js";
import { measure } from "./instrumentation.js";
import type { DiffMetricSink } from "./instrumentation.js";
import type { AbortSignalLike } from "./types.js";

/**
 * Pairing page N with page N breaks the moment a revision inserts or removes a
 * page: every later page reads as wholly rewritten. Aligning the two page
 * sequences by content first means the visual diff always compares the pages a
 * reader would consider the same page.
 */

const DEFAULT_MATCH_THRESHOLD = 0.55;
/** Pages rarely travel far, so only consider partners inside a moving window. */
const DEFAULT_BAND = 12;
const GAP_PENALTY = -0.3;
const MIN_MOVE_SIMILARITY = 0.75;

export interface PageFingerprint {
  readonly pageNumber: number;
  readonly tokens: ReadonlySet<string>;
  readonly tokenCount: number;
}

export type PageAlignmentKind = "matched" | "added" | "removed" | "moved";

export interface AlignedPagePair {
  readonly earlierPageNumber?: number;
  readonly newerPageNumber?: number;
  readonly kind: PageAlignmentKind;
  /** Jaccard overlap of the two pages' token sets, 0 when one side is absent. */
  readonly similarity: number;
}

export interface PageAlignmentOptions {
  readonly matchThreshold?: number;
  readonly band?: number;
  readonly detectMoves?: boolean;
  /** Skip content matching and pair pages by position instead. */
  readonly sequential?: boolean;
  readonly signal?: AbortSignalLike;
  readonly metrics?: DiffMetricSink;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.\-/]*/gu;
/**
 * A run of dots is a table-of-contents leader, not part of the word in front of
 * it. Left joined, every leader length makes its own token, so two revisions of
 * one contents page share almost nothing and align as unrelated pages. A single
 * dot stays word-internal, because "3.3" and "5.1" are words here.
 */
const LEADER = /\.{2,}/gu;
/** Sentence and list punctuation that ends a word without belonging to it. */
const TRAILING = /[.\-/'’]+$/u;

/**
 * Pages are compared as bags of distinct words. Dropping order and repetition
 * keeps the score stable when a paragraph is rewritten in place, which is what
 * separates an edited page from a different page.
 */
export function fingerprintPage(text: string, pageNumber: number): PageFingerprint {
  const tokens = new Set<string>();
  for (const match of text.toLowerCase().replace(LEADER, " ").matchAll(WORD)) {
    const token = match[0].replace(TRAILING, "");
    if (token) tokens.add(token);
  }
  return { pageNumber, tokens, tokenCount: tokens.size };
}

export function pageSimilarity(earlier: PageFingerprint, newer: PageFingerprint): number {
  if (earlier.tokenCount === 0 && newer.tokenCount === 0) return 1;
  if (earlier.tokenCount === 0 || newer.tokenCount === 0) return 0;
  const [small, large] = earlier.tokenCount <= newer.tokenCount ? [earlier.tokens, newer.tokens] : [newer.tokens, earlier.tokens];
  let shared = 0;
  for (const token of small) if (large.has(token)) shared += 1;
  return shared / (earlier.tokenCount + newer.tokenCount - shared);
}

function bandFor(earlierCount: number, newerCount: number, band: number): number {
  return Math.max(band, Math.abs(earlierCount - newerCount) + 1);
}

function withinBand(row: number, column: number, band: number, drift: number): boolean {
  return Math.abs(row - column * drift) <= band;
}

interface ScoreCell {
  readonly score: number;
  readonly step: "diagonal" | "up" | "left";
}

const NEGATIVE = Number.NEGATIVE_INFINITY;

function cellAt(grid: ReadonlyArray<Array<ScoreCell | undefined>>, row: number, column: number): ScoreCell | undefined {
  return grid[row]?.[column];
}

function scoreOf(grid: ReadonlyArray<Array<ScoreCell | undefined>>, row: number, column: number): number {
  return cellAt(grid, row, column)?.score ?? NEGATIVE;
}

function bestStep(diagonal: number, up: number, left: number): ScoreCell {
  if (diagonal >= up && diagonal >= left) return { score: diagonal, step: "diagonal" };
  return up >= left ? { score: up, step: "up" } : { score: left, step: "left" };
}

function buildScoreGrid(
  earlier: readonly PageFingerprint[],
  newer: readonly PageFingerprint[],
  matchThreshold: number,
  band: number,
  signal: AbortSignalLike | undefined,
): Array<Array<ScoreCell | undefined>> {
  const drift = earlier.length && newer.length ? earlier.length / newer.length : 1;
  const grid: Array<Array<ScoreCell | undefined>> = Array.from({ length: earlier.length + 1 }, () => []);
  grid[0]![0] = { score: 0, step: "diagonal" };
  for (let row = 1; row <= earlier.length; row += 1) grid[row]![0] = { score: row * GAP_PENALTY, step: "up" };
  for (let column = 1; column <= newer.length; column += 1) grid[0]![column] = { score: column * GAP_PENALTY, step: "left" };

  for (let row = 1; row <= earlier.length; row += 1) {
    throwIfAborted(signal);
    for (let column = 1; column <= newer.length; column += 1) {
      if (!withinBand(row, column, band, drift)) continue;
      const similarity = pageSimilarity(earlier[row - 1]!, newer[column - 1]!);
      const diagonal = scoreOf(grid, row - 1, column - 1) + similarity - matchThreshold;
      grid[row]![column] = bestStep(diagonal, scoreOf(grid, row - 1, column) + GAP_PENALTY, scoreOf(grid, row, column - 1) + GAP_PENALTY);
    }
  }
  return grid;
}

function tracebackPairs(
  grid: ReadonlyArray<Array<ScoreCell | undefined>>,
  earlier: readonly PageFingerprint[],
  newer: readonly PageFingerprint[],
): AlignedPagePair[] {
  const pairs: AlignedPagePair[] = [];
  let row = earlier.length;
  let column = newer.length;
  while (row > 0 || column > 0) {
    const step = cellAt(grid, row, column)?.step ?? (row > 0 ? "up" : "left");
    if (step === "diagonal" && row > 0 && column > 0) {
      pairs.push({
        earlierPageNumber: earlier[row - 1]!.pageNumber,
        newerPageNumber: newer[column - 1]!.pageNumber,
        kind: "matched",
        similarity: pageSimilarity(earlier[row - 1]!, newer[column - 1]!),
      });
      row -= 1;
      column -= 1;
    } else if (step === "up" && row > 0) {
      pairs.push({ earlierPageNumber: earlier[row - 1]!.pageNumber, kind: "removed", similarity: 0 });
      row -= 1;
    } else {
      pairs.push({ newerPageNumber: newer[column - 1]!.pageNumber, kind: "added", similarity: 0 });
      column -= 1;
    }
  }
  return pairs.reverse();
}

/**
 * A page lifted from one place in the document and dropped in another shows up
 * as an unrelated removal and addition. Re-pairing the strong matches among
 * them recovers the move, which reads very differently to a reviewer.
 */
function detectMoves(pairs: readonly AlignedPagePair[], earlier: readonly PageFingerprint[], newer: readonly PageFingerprint[]): AlignedPagePair[] {
  const byEarlier = new Map(earlier.map((page) => [page.pageNumber, page]));
  const byNewer = new Map(newer.map((page) => [page.pageNumber, page]));
  const removed = pairs.filter((pair) => pair.kind === "removed");
  const added = pairs.filter((pair) => pair.kind === "added");
  if (removed.length === 0 || added.length === 0) return [...pairs];

  const moves = new Map<AlignedPagePair, AlignedPagePair>();
  const claimed = new Set<AlignedPagePair>();
  for (const removal of removed) {
    const source = byEarlier.get(removal.earlierPageNumber!)!;
    let best: AlignedPagePair | null = null;
    let bestSimilarity = MIN_MOVE_SIMILARITY;
    for (const addition of added) {
      if (claimed.has(addition)) continue;
      const similarity = pageSimilarity(source, byNewer.get(addition.newerPageNumber!)!);
      if (similarity > bestSimilarity) {
        best = addition;
        bestSimilarity = similarity;
      }
    }
    if (!best) continue;
    claimed.add(best);
    moves.set(removal, { earlierPageNumber: removal.earlierPageNumber, newerPageNumber: best.newerPageNumber, kind: "moved", similarity: bestSimilarity });
    moves.set(best, { earlierPageNumber: removal.earlierPageNumber, newerPageNumber: best.newerPageNumber, kind: "moved", similarity: bestSimilarity });
  }

  const emitted = new Set<string>();
  return pairs.flatMap((pair) => {
    const move = moves.get(pair);
    if (!move) return [pair];
    const key = `${move.earlierPageNumber}:${move.newerPageNumber}`;
    if (emitted.has(key)) return [];
    emitted.add(key);
    return [move];
  });
}

/** Pair pages by position: page 1 with page 1, and so on. */
function sequentialPairs(earlier: readonly PageFingerprint[], newer: readonly PageFingerprint[]): AlignedPagePair[] {
  const pairs: AlignedPagePair[] = [];
  for (let index = 0; index < Math.max(earlier.length, newer.length); index += 1) {
    const before = earlier[index];
    const after = newer[index];
    if (before && after) pairs.push({ earlierPageNumber: before.pageNumber, newerPageNumber: after.pageNumber, kind: "matched", similarity: pageSimilarity(before, after) });
    else if (before) pairs.push({ earlierPageNumber: before.pageNumber, kind: "removed", similarity: 0 });
    else if (after) pairs.push({ newerPageNumber: after.pageNumber, kind: "added", similarity: 0 });
  }
  return pairs;
}

/** Align two page sequences by content so later pages survive an insertion. */
export function alignPages(earlier: readonly PageFingerprint[], newer: readonly PageFingerprint[], options: PageAlignmentOptions = {}): AlignedPagePair[] {
  return measure(options.metrics, "core.align.pages", () => {
    if (options.sequential) return sequentialPairs(earlier, newer);
    if (earlier.length === 0) return newer.map((page) => ({ newerPageNumber: page.pageNumber, kind: "added" as const, similarity: 0 }));
    if (newer.length === 0) return earlier.map((page) => ({ earlierPageNumber: page.pageNumber, kind: "removed" as const, similarity: 0 }));
    const matchThreshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
    const band = bandFor(earlier.length, newer.length, options.band ?? DEFAULT_BAND);
    const grid = buildScoreGrid(earlier, newer, matchThreshold, band, options.signal);
    const pairs = tracebackPairs(grid, earlier, newer);
    return options.detectMoves === false ? pairs : detectMoves(pairs, earlier, newer);
  }, { earlierPages: earlier.length, newerPages: newer.length });
}
