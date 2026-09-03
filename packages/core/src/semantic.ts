import { throwIfAborted } from "./errors.js";
import { isDecodableText } from "./text-quality.js";
import { measure } from "./instrumentation.js";
import type { DiffMetricSink } from "./instrumentation.js";
import type { AbortSignalLike, PageText, TextQuad } from "./types.js";

export type SemanticRunKind = "same" | "added" | "removed" | "changed";
export type SemanticChangeKind = Exclude<SemanticRunKind, "same">;

export interface SemanticTextRun {
  readonly id: string;
  readonly text: string;
  readonly kind: SemanticRunKind;
}

export interface SemanticTextChange {
  readonly id: string;
  readonly kind: SemanticChangeKind;
  readonly before: string;
  readonly after: string;
}

export interface SemanticTextDiff {
  /** True when a side carried text that could not be decoded to real characters. */
  readonly textUndecodable?: boolean;
  readonly before: readonly SemanticTextRun[];
  readonly after: readonly SemanticTextRun[];
  readonly changes: readonly SemanticTextChange[];
  readonly beforeTokenCount: number;
  readonly afterTokenCount: number;
  readonly hasBeforeText: boolean;
  readonly hasAfterText: boolean;
}

export interface SemanticTextOverlay {
  readonly id: string;
  readonly kind: SemanticChangeKind;
  readonly text: string;
  readonly quads: readonly TextQuad[];
}

export interface SemanticPageDiff extends SemanticTextDiff {
  readonly beforeOverlays: readonly SemanticTextOverlay[];
  readonly afterOverlays: readonly SemanticTextOverlay[];
  /** Lines whose text is identical on both sides, with where each side drew them. */
  readonly unchangedLines?: readonly UnchangedTextLine[];
}

/**
 * An unchanged line that moved still repaints every pixel it touches. Keeping
 * both positions lets a caller tell a genuine edit from text pushed down the
 * page by an edit somewhere above it.
 */
export interface UnchangedTextLine {
  readonly text: string;
  readonly beforeQuads: readonly TextQuad[];
  readonly afterQuads: readonly TextQuad[];
  readonly shifted: boolean;
}

type Token = { value: string; start: number; end: number };
type PrimitiveEdit =
  | { kind: "same"; token: Token }
  | { kind: "added"; token: Token }
  | { kind: "removed"; token: Token };

interface PrimitiveDiffResult {
  edits: PrimitiveEdit[];
  exact: boolean;
}

const WORD_OR_PUNCTUATION = /[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(WORD_OR_PUNCTUATION), (match) => {
    const value = match[0] ?? "";
    const start = match.index ?? 0;
    return { value, start, end: start + value.length };
  });
}

function isOpeningPunctuation(value: string): boolean {
  return /^[([{"'$/]$/.test(value);
}

function isClosingPunctuation(value: string): boolean {
  return /^[\],.!?:;%)}"'’]$/.test(value);
}

function joinTokens(tokens: readonly Token[]): string {
  let result = "";
  for (const token of tokens) {
    if (!result) {
      result = token.value;
      continue;
    }
    const previous = result[result.length - 1] ?? "";
    if (!isClosingPunctuation(token.value) && !isOpeningPunctuation(previous)) result += " ";
    result += token.value;
  }
  return result;
}

function movesDown(k: number, distance: number, frontier: Map<number, number>): boolean {
  if (k === -distance) return true;
  if (k === distance) return false;
  return (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1);
}

function nextHorizontalPosition(down: boolean, k: number, frontier: Map<number, number>): number {
  if (down) return frontier.get(k + 1) ?? 0;
  return (frontier.get(k - 1) ?? 0) + 1;
}

function reachedDiffEnd(x: number, y: number, before: readonly Token[], after: readonly Token[]): boolean {
  return x >= before.length && y >= after.length;
}

function extendDiagonal(before: readonly Token[], after: readonly Token[], startX: number, startY: number, work: { value: number; limit: number }, signal?: AbortSignalLike): { x: number; y: number; exhausted: boolean } {
  let x = startX;
  let y = startY;
  while (x < before.length && y < after.length && before[x]!.value === after[y]!.value) {
    x += 1;
    y += 1;
    work.value += 1;
    if ((work.value & 0x1fff) === 0) throwIfAborted(signal);
    if (work.value > work.limit) return { x, y, exhausted: true };
  }
  return { x, y, exhausted: false };
}

function findDiffTrace(before: readonly Token[], after: readonly Token[], signal?: AbortSignalLike): Array<Map<number, number>> | null {
  const max = before.length + after.length;
  const work = { value: 0, limit: Math.max(250_000, Math.min(4_000_000, max * 240)) };
  const v = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];

  for (let distance = 0; distance <= max; distance += 1) {
    throwIfAborted(signal);
    trace.push(new Map(v));
    for (let k = -distance; k <= distance; k += 2) {
      work.value += 1;
      if (work.value > work.limit) return null;
      const down = movesDown(k, distance, v);
      let x = nextHorizontalPosition(down, k, v);
      let y = x - k;
      const diagonal = extendDiagonal(before, after, x, y, work, signal);
      if (diagonal.exhausted) return null;
      ({ x, y } = diagonal);
      v.set(k, x);
      if (reachedDiffEnd(x, y, before, after)) return trace;
    }
  }
  return null;
}

function appendMatchingEdits(edits: PrimitiveEdit[], before: readonly Token[], x: number, y: number, previousX: number, previousY: number): { x: number; y: number } {
  while (x > previousX && y > previousY) {
    edits.push({ kind: "same", token: before[x - 1]! });
    x -= 1;
    y -= 1;
  }
  return { x, y };
}

function appendLeadingEdits(edits: PrimitiveEdit[], before: readonly Token[], after: readonly Token[], x: number, y: number): void {
  while (x > 0 && y > 0) {
    edits.push({ kind: "same", token: before[x - 1]! });
    x -= 1;
    y -= 1;
  }
  while (x > 0) edits.push({ kind: "removed", token: before[--x]! });
  while (y > 0) edits.push({ kind: "added", token: after[--y]! });
}

function backtrackEdits(before: readonly Token[], after: readonly Token[], trace: Array<Map<number, number>>, signal?: AbortSignalLike): PrimitiveEdit[] {
  const edits: PrimitiveEdit[] = [];
  let x = before.length;
  let y = after.length;
  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    throwIfAborted(signal);
    const previousV = trace[distance]!;
    const k = x - y;
    const down = movesDown(k, distance, previousV);
    const previousK = down ? k + 1 : k - 1;
    const previousX = previousV.get(previousK) ?? 0;
    const previousY = previousX - previousK;
    ({ x, y } = appendMatchingEdits(edits, before, x, y, previousX, previousY));
    if (x === previousX) {
      edits.push({ kind: "added", token: after[y - 1]! });
      y -= 1;
    } else {
      edits.push({ kind: "removed", token: before[x - 1]! });
      x -= 1;
    }
  }
  appendLeadingEdits(edits, before, after, x, y);
  return edits.reverse();
}

function primitiveDiff(before: readonly Token[], after: readonly Token[], signal?: AbortSignalLike): PrimitiveDiffResult {
  if (!before.length && !after.length) return { edits: [], exact: true };
  if (!before.length) return { edits: after.map((token) => ({ kind: "added", token })), exact: true };
  if (!after.length) return { edits: before.map((token) => ({ kind: "removed", token })), exact: true };
  const trace = findDiffTrace(before, after, signal);
  return trace ? { edits: backtrackEdits(before, after, trace, signal), exact: true } : {
    edits: [
      ...before.map((token) => ({ kind: "removed" as const, token })),
      ...after.map((token) => ({ kind: "added" as const, token })),
    ],
    exact: false,
  };
}

interface Segment {
  kind: SemanticRunKind;
  before: Token[];
  after: Token[];
}

interface SemanticChangeRange {
  id: string;
  kind: SemanticChangeKind;
  before: string;
  after: string;
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
}

interface SemanticDiffBuild {
  diff: SemanticTextDiff;
  ranges: readonly SemanticChangeRange[];
}

function appendSegment(segments: Segment[], segment: Segment): void {
  const previous = segments[segments.length - 1];
  if (previous?.kind === "same" && segment.kind === "same") {
    previous.before.push(...segment.before);
    previous.after.push(...segment.after);
  } else {
    segments.push(segment);
  }
}

function changedTokens(edits: readonly PrimitiveEdit[], start: number): { before: Token[]; after: Token[]; next: number } {
  const before: Token[] = [];
  const after: Token[] = [];
  let next = start;
  while (next < edits.length && edits[next]!.kind !== "same") {
    const edit = edits[next]!;
    if (edit.kind === "removed") before.push(edit.token);
    else after.push(edit.token);
    next += 1;
  }
  return { before, after, next };
}

function changeKind(before: readonly Token[], after: readonly Token[]): SemanticChangeKind {
  if (before.length && after.length) return "changed";
  return before.length ? "removed" : "added";
}

function segmentsFromEdits(edits: readonly PrimitiveEdit[], combineReplacements: boolean): Segment[] {
  const segments: Segment[] = [];
  let index = 0;
  while (index < edits.length) {
    const edit = edits[index]!;
    if (edit.kind === "same") {
      appendSegment(segments, { kind: "same", before: [edit.token], after: [edit.token] });
      index += 1;
      continue;
    }
    const changed = changedTokens(edits, index);
    index = changed.next;
    const { before, after } = changed;
    if (!combineReplacements && before.length && after.length) {
      appendSegment(segments, { kind: "removed", before, after: [] });
      appendSegment(segments, { kind: "added", before: [], after });
    } else {
      appendSegment(segments, { kind: changeKind(before, after), before, after });
    }
  }
  return segments;
}

interface SemanticDiffOptions {
  signal?: AbortSignalLike;
  metrics?: DiffMetricSink;
}

interface SegmentArtifacts {
  before: SemanticTextRun[];
  after: SemanticTextRun[];
  change?: SemanticTextChange;
  range?: SemanticChangeRange;
}

function segmentRange(tokens: readonly Token[], fallback: number): { start: number; end: number } {
  if (tokens.length === 0) return { start: fallback, end: fallback };
  return { start: tokens[0]!.start, end: tokens[tokens.length - 1]!.end };
}

function artifactsForSegment(segment: Segment, index: number, beforeTextLength: number, afterTextLength: number): SegmentArtifacts {
  const beforeValue = joinTokens(segment.before);
  const afterValue = joinTokens(segment.after);
  const runId = `semantic-${index + 1}`;
  if (segment.kind === "same") {
    return {
      before: [{ id: `${runId}-before`, text: beforeValue, kind: "same" }],
      after: [{ id: `${runId}-after`, text: afterValue, kind: "same" }],
    };
  }
  const change = { id: runId, kind: segment.kind, before: beforeValue, after: afterValue };
  const beforeRange = segmentRange(segment.before, beforeTextLength);
  const afterRange = segmentRange(segment.after, afterTextLength);
  return {
    before: beforeValue ? [{ id: `${runId}-before`, text: beforeValue, kind: segment.kind }] : [],
    after: afterValue ? [{ id: `${runId}-after`, text: afterValue, kind: segment.kind }] : [],
    change,
    range: {
      ...change,
      beforeStart: beforeRange.start,
      beforeEnd: beforeRange.end,
      afterStart: afterRange.start,
      afterEnd: afterRange.end,
    },
  };
}

function buildSemanticDiff(beforeText: string, afterText: string, options: SemanticDiffOptions = {}): SemanticDiffBuild {
  const beforeTokens = tokenize(beforeText);
  const afterTokens = tokenize(afterText);
  const primitive = measure(options.metrics, "core.semantic.token-diff", () => primitiveDiff(beforeTokens, afterTokens, options.signal), {
    beforeTokens: beforeTokens.length,
    afterTokens: afterTokens.length,
  });
  const segments = segmentsFromEdits(primitive.edits, primitive.exact);
  const before: SemanticTextRun[] = [];
  const after: SemanticTextRun[] = [];
  const changes: SemanticTextChange[] = [];
  const ranges: SemanticChangeRange[] = [];
  for (const [index, segment] of segments.entries()) {
    const artifacts = artifactsForSegment(segment, index, beforeText.length, afterText.length);
    before.push(...artifacts.before);
    after.push(...artifacts.after);
    if (artifacts.change) changes.push(artifacts.change);
    if (artifacts.range) ranges.push(artifacts.range);
  }

  return {
    diff: {
      before,
      after,
      changes,
      beforeTokenCount: beforeTokens.length,
      afterTokenCount: afterTokens.length,
      hasBeforeText: beforeTokens.length > 0,
      hasAfterText: afterTokens.length > 0,
    },
    ranges,
  };
}

export function diffSemanticText(beforeText: string, afterText: string, options: SemanticDiffOptions = {}): SemanticTextDiff {
  return measure(options.metrics, "core.semantic.text", () => buildSemanticDiff(beforeText, afterText, options).diff, {
    beforeCharacters: beforeText.length,
    afterCharacters: afterText.length,
  });
}

function interpolate(start: { x: number; y: number }, end: { x: number; y: number }, amount: number) {
  return { x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount };
}

function subQuad(quad: TextQuad, startRatio: number, endRatio: number): TextQuad {
  const topStart = interpolate(quad[0], quad[1], startRatio);
  const topEnd = interpolate(quad[0], quad[1], endRatio);
  const bottomEnd = interpolate(quad[3], quad[2], endRatio);
  const bottomStart = interpolate(quad[3], quad[2], startRatio);
  return [topStart, topEnd, bottomEnd, bottomStart];
}

function quadsForTextRange(page: PageText, start: number, end: number): TextQuad[] {
  if (start >= end) return [];
  const quads: TextQuad[] = [];
  for (const item of page.items) {
    if (!item.str || item.textEnd <= start || item.textStart >= end) continue;
    const overlapStart = Math.max(start, item.textStart);
    const overlapEnd = Math.min(end, item.textEnd);
    if (overlapStart >= overlapEnd) continue;
    const length = Math.max(1, item.textEnd - item.textStart);
    quads.push(subQuad(item.quad, (overlapStart - item.textStart) / length, (overlapEnd - item.textStart) / length));
  }
  return quads;
}

interface SpatialTextLine {
  readonly text: string;
  readonly identity: string;
  readonly canonical: string;
  readonly quads: readonly TextQuad[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SpatialLineMatch {
  before?: SpatialTextLine;
  after?: SpatialTextLine;
  kind: SemanticRunKind;
}

interface SpatialCandidate {
  before: SpatialTextLine;
  after: SpatialTextLine;
  score: number;
}

type SpatialTextItem = PageText["items"][number];

function canonicalSemanticText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[‐‑‒–—−]/gu, "-")
    .replace(/(\d)\s*-\s*([a-z])\b/gu, "$1$2")
    .replace(/(\d)\s+(v|ma|a|ns|ms|mm|cm|°c)\b/gu, "$1$2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/** Formatting-normalized text that is still strict enough for technical labels. */
function identitySemanticText(text: string): string {
  const source = text.normalize("NFKC").replace(/[‐‑‒–—−]/gu, "-");
  const technical = source === source.toLocaleUpperCase("en") || /[\d/_+#]/u.test(source);
  const normalized = source
    .toLocaleLowerCase("en")
    .replace(/(\d)\s*-\s*([a-z])\b/gu, "$1$2")
    .replace(/(\d)\s+(v|ma|a|ns|ms|mm|cm|°c)\b/gu, "$1$2");
  const compact = technical
    ? normalized.replace(/(?<=\p{L})\s+(?=\p{L})/gu, "")
    : normalized;
  return compact
    .replace(/\s*([,;:/()[\]{}])\s*/gu, "$1")
    .trim()
    .replace(/\s+/gu, " ");
}

function verticalLineMatch(first: SpatialTextItem, second: SpatialTextItem): boolean {
  const firstBottom = first.bounds.y + first.bounds.height;
  const secondBottom = second.bounds.y + second.bounds.height;
  const overlap = Math.min(firstBottom, secondBottom) - Math.max(first.bounds.y, second.bounds.y);
  const minHeight = Math.max(0.01, Math.min(first.bounds.height, second.bounds.height));
  const firstCenter = first.bounds.y + first.bounds.height / 2;
  const secondCenter = second.bounds.y + second.bounds.height / 2;
  return overlap >= minHeight * 0.3 || Math.abs(firstCenter - secondCenter) <= Math.max(first.fontSize, second.fontSize) * 0.5;
}

function joinSpatialItems(items: readonly SpatialTextItem[]): string {
  let text = "";
  let previous: SpatialTextItem | undefined;
  for (const item of items) {
    if (previous && text && !/\s$/u.test(text) && !/^\s/u.test(item.str)) {
      const previousCharacterWidth = previous.bounds.width / Math.max(1, previous.str.length);
      const currentCharacterWidth = item.bounds.width / Math.max(1, item.str.length);
      const gap = item.bounds.x - (previous.bounds.x + previous.bounds.width);
      if (gap > Math.max(1, (previousCharacterWidth + currentCharacterWidth) * 0.09)) text += " ";
    }
    text += item.str;
    previous = item;
  }
  return text.trim().replace(/\s+/gu, " ");
}

/**
 * Ordering has to be transitive or `sort` is free to return anything, and a
 * per-pair line test is not: with a threshold that depends on both items, a can
 * tie b and b tie c while a and c differ. One page-level band fixes the key per
 * item, so the order is well defined and stable at any page length.
 */
function orderedSpatialItems(page: PageText): SpatialTextItem[] {
  const items = page.items.filter((item) => item.str.trim());
  if (items.length === 0) return [];
  const sizes = items.map((item) => item.fontSize).sort((first, second) => first - second);
  const band = Math.max(0.5, sizes[sizes.length >> 1]! * 0.35);
  return items.slice().sort((first, second) =>
    Math.round(first.bounds.y / band) - Math.round(second.bounds.y / band) || first.bounds.x - second.bounds.x);
}

function closestSpatialRow(rows: readonly SpatialTextItem[][], item: SpatialTextItem): SpatialTextItem[] | undefined {
  let bestRow: SpatialTextItem[] | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    const anchor = row[0]!;
    const distance = Math.abs((anchor.bounds.y + anchor.bounds.height / 2) - (item.bounds.y + item.bounds.height / 2));
    if (distance > Math.max(anchor.fontSize, item.fontSize) * 1.2) break;
    if (verticalLineMatch(anchor, item) && distance < bestDistance) {
      bestRow = row;
      bestDistance = distance;
    }
  }
  return bestRow;
}

function groupSpatialRows(ordered: readonly SpatialTextItem[]): SpatialTextItem[][] {
  const rows: SpatialTextItem[][] = [];
  for (const item of ordered) {
    const bestRow = closestSpatialRow(rows, item);
    if (bestRow) bestRow.push(item);
    else rows.push([item]);
  }
  return rows;
}

function shouldStartSpatialGroup(previous: SpatialTextItem, item: SpatialTextItem, pageWidth: number): boolean {
  const previousCharacterWidth = previous.bounds.width / Math.max(1, previous.str.length);
  const currentCharacterWidth = item.bounds.width / Math.max(1, item.str.length);
  const columnGap = item.bounds.x - (previous.bounds.x + previous.bounds.width);
  return columnGap > Math.max(pageWidth * 0.018, (previousCharacterWidth + currentCharacterWidth) * 1.15);
}

function groupSpatialColumns(row: readonly SpatialTextItem[], pageWidth: number): SpatialTextItem[][] {
  const groups: SpatialTextItem[][] = [];
  for (const item of row.slice().sort((first, second) => first.bounds.x - second.bounds.x)) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (!group || !previous || shouldStartSpatialGroup(previous, item, pageWidth)) groups.push([item]);
    else group.push(item);
  }
  return groups;
}

function isHorizontal(item: SpatialTextItem): boolean {
  const advanceX = item.quad[1].x - item.quad[0].x;
  const advanceY = item.quad[1].y - item.quad[0].y;
  return Math.abs(advanceX) >= Math.abs(advanceY);
}

function spatialLine(group: readonly SpatialTextItem[]): SpatialTextLine | null {
  const text = joinSpatialItems(group);
  const identity = identitySemanticText(text);
  const canonical = canonicalSemanticText(text);
  if (!canonical) return null;
  const left = Math.min(...group.map((item) => item.bounds.x));
  const top = Math.min(...group.map((item) => item.bounds.y));
  const right = Math.max(...group.map((item) => item.bounds.x + item.bounds.width));
  const bottom = Math.max(...group.map((item) => item.bounds.y + item.bounds.height));
  return { text, identity, canonical, quads: group.map((item) => item.quad), x: left, y: top, width: right - left, height: bottom - top };
}

function keepItemsAtomic(items: readonly SpatialTextItem[]): boolean {
  if (items.length === 0) return false;
  const short = items.reduce((count, item) => count + (item.str.trim().length <= 12 ? 1 : 0), 0);
  return short / items.length >= 0.7;
}

function spatialLines(page: PageText): SpatialTextLine[] {
  const items = orderedSpatialItems(page);
  if (keepItemsAtomic(items)) {
    return items.map((item) => spatialLine([item])).filter((line): line is SpatialTextLine => line !== null);
  }
  const horizontal = items.filter(isHorizontal);
  const rotated = items.filter((item) => !isHorizontal(item));
  return [
    ...groupSpatialRows(horizontal)
    .flatMap((row) => groupSpatialColumns(row, page.width))
    .map(spatialLine)
    .filter((line): line is SpatialTextLine => line !== null),
    ...rotated.map((item) => spatialLine([item])).filter((line): line is SpatialTextLine => line !== null),
  ]
    .sort((first, second) => first.y - second.y || first.x - second.x);
}

/**
 * Line pairing compares every unmatched line against every other, so anything
 * derived from a single line is computed once here rather than per pair.
 */
interface LineIndex {
  readonly tokens: readonly Token[];
  /** Token occurrence counts, for the cheap upper bound on token similarity. */
  readonly bag: ReadonlyMap<string, number>;
  readonly grams: ReadonlyMap<string, number>;
  readonly gramCount: number;
  readonly wordCount: number;
}

function countedGrams(value: string): { grams: Map<string, number>; total: number } {
  const compact = value.replace(/\s+/gu, " ");
  const grams = new Map<string, number>();
  const size = compact.length < 3 ? 1 : 3;
  let total = 0;
  for (let index = 0; index <= compact.length - size; index += 1) {
    const gram = compact.slice(index, index + size);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
    total += 1;
  }
  return { grams, total };
}

const lineIndexes = new WeakMap<SpatialTextLine, LineIndex>();

function lineIndex(line: SpatialTextLine): LineIndex {
  const cached = lineIndexes.get(line);
  if (cached) return cached;
  const tokens = tokenize(line.canonical);
  const bag = new Map<string, number>();
  for (const token of tokens) bag.set(token.value, (bag.get(token.value) ?? 0) + 1);
  const { grams, total } = countedGrams(line.canonical);
  const index: LineIndex = { tokens, bag, grams, gramCount: total, wordCount: line.canonical.split(" ").length };
  lineIndexes.set(line, index);
  return index;
}

function overlapCount(first: ReadonlyMap<string, number>, second: ReadonlyMap<string, number>): number {
  const [small, large] = first.size <= second.size ? [first, second] : [second, first];
  let shared = 0;
  for (const [key, count] of small) shared += Math.min(count, large.get(key) ?? 0);
  return shared;
}

function ngramSimilarity(first: LineIndex, second: LineIndex): number {
  if (!first.gramCount || !second.gramCount) return 0;
  return (overlapCount(first.grams, second.grams) * 2) / (first.gramCount + second.gramCount);
}

/**
 * A common subsequence can never use a token more often than both sides carry
 * it, so the token-bag overlap bounds the token similarity from above. That
 * makes this a safe filter: a pair it rejects could not have passed anyway.
 */
function similarityCeiling(first: LineIndex, second: LineIndex): number {
  if (!first.tokens.length || !second.tokens.length) return 0;
  const bound = (overlapCount(first.bag, second.bag) * 2) / (first.tokens.length + second.tokens.length);
  return Math.max(bound, ngramSimilarity(first, second) * 0.94);
}

function lineSimilarity(first: SpatialTextLine, second: SpatialTextLine, signal?: AbortSignalLike): number {
  const firstIndex = lineIndex(first);
  const secondIndex = lineIndex(second);
  if (!firstIndex.tokens.length || !secondIndex.tokens.length) return 0;
  const result = primitiveDiff(firstIndex.tokens, secondIndex.tokens, signal);
  if (!result.exact) return 0;
  const same = result.edits.reduce((count, edit) => count + (edit.kind === "same" ? 1 : 0), 0);
  const tokenSimilarity = (same * 2) / (firstIndex.tokens.length + secondIndex.tokens.length);
  return Math.max(tokenSimilarity, ngramSimilarity(firstIndex, secondIndex) * 0.94);
}

function spatialDistance(first: SpatialTextLine, second: SpatialTextLine, beforePage: PageText, afterPage: PageText): number {
  const firstX = (first.x + first.width / 2) / Math.max(1, beforePage.width);
  const firstY = (first.y + first.height / 2) / Math.max(1, beforePage.height);
  const secondX = (second.x + second.width / 2) / Math.max(1, afterPage.width);
  const secondY = (second.y + second.height / 2) / Math.max(1, afterPage.height);
  return Math.hypot(firstX - secondX, firstY - secondY);
}

function closestExactLine(before: SpatialTextLine, sameText: readonly SpatialTextLine[] | undefined, matchedAfter: ReadonlySet<SpatialTextLine>, beforePage: PageText, afterPage: PageText): SpatialTextLine | undefined {
  let best: SpatialTextLine | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const after of sameText ?? []) {
    if (matchedAfter.has(after)) continue;
    const distance = spatialDistance(before, after, beforePage, afterPage);
    if (distance < bestDistance) {
      best = after;
      bestDistance = distance;
    }
  }
  return best;
}

function byIdentityText(lines: readonly SpatialTextLine[]): Map<string, SpatialTextLine[]> {
  const groups = new Map<string, SpatialTextLine[]>();
  for (const line of lines) {
    const group = groups.get(line.identity);
    if (group) group.push(line);
    else groups.set(line.identity, [line]);
  }
  return groups;
}

function exactLineMatches(beforeLines: readonly SpatialTextLine[], afterLines: readonly SpatialTextLine[], beforePage: PageText, afterPage: PageText, matchedBefore: Set<SpatialTextLine>, matchedAfter: Set<SpatialTextLine>, signal?: AbortSignalLike): SpatialLineMatch[] {
  const matches: SpatialLineMatch[] = [];
  const afterByText = byIdentityText(afterLines);
  for (const before of beforeLines) {
    throwIfAborted(signal);
    const after = closestExactLine(before, afterByText.get(before.identity), matchedAfter, beforePage, afterPage);
    if (!after) continue;
    matchedBefore.add(before);
    matchedAfter.add(after);
    matches.push({ before, after, kind: "same" });
  }
  return matches;
}

function minimumLineSimilarity(before: LineIndex, after: LineIndex): number {
  return Math.min(before.wordCount, after.wordCount) <= 2 ? 0.72 : 0.52;
}

function changedLineCandidates(beforeLines: readonly SpatialTextLine[], afterLines: readonly SpatialTextLine[], beforePage: PageText, afterPage: PageText, matchedBefore: ReadonlySet<SpatialTextLine>, matchedAfter: ReadonlySet<SpatialTextLine>, signal?: AbortSignalLike): SpatialCandidate[] {
  const candidates: SpatialCandidate[] = [];
  for (const before of beforeLines) {
    if (matchedBefore.has(before)) continue;
    const beforeIndex = lineIndex(before);
    for (const after of afterLines) {
      if (matchedAfter.has(after)) continue;
      const afterIndex = lineIndex(after);
      const floor = minimumLineSimilarity(beforeIndex, afterIndex);
      // Skip the token diff outright when no possible score could clear the floor.
      if (similarityCeiling(beforeIndex, afterIndex) < floor) continue;
      const similarity = lineSimilarity(before, after, signal);
      if (similarity < floor) continue;
      const beforeCenterX = (before.x + before.width / 2) / Math.max(1, beforePage.width);
      const afterCenterX = (after.x + after.width / 2) / Math.max(1, afterPage.width);
      if (Math.abs(beforeCenterX - afterCenterX) > 0.24 && similarity < 0.9) continue;
      const lengthRatio = Math.min(before.canonical.length, after.canonical.length) / Math.max(before.canonical.length, after.canonical.length);
      const score = similarity * 0.82 + lengthRatio * 0.18 - spatialDistance(before, after, beforePage, afterPage) * 0.3;
      candidates.push({ before, after, score });
    }
  }
  return candidates.sort((first, second) => second.score - first.score);
}

function acceptChangedLines(candidates: readonly SpatialCandidate[], matchedBefore: Set<SpatialTextLine>, matchedAfter: Set<SpatialTextLine>): SpatialLineMatch[] {
  const matches: SpatialLineMatch[] = [];
  for (const candidate of candidates) {
    if (matchedBefore.has(candidate.before) || matchedAfter.has(candidate.after)) continue;
    matchedBefore.add(candidate.before);
    matchedAfter.add(candidate.after);
    matches.push({ before: candidate.before, after: candidate.after, kind: "changed" });
  }
  return matches;
}

function unmatchedLines(lines: readonly SpatialTextLine[], matched: ReadonlySet<SpatialTextLine>, side: "before" | "after"): SpatialLineMatch[] {
  return lines.filter((line) => !matched.has(line)).map((line) => side === "before" ? { before: line, kind: "removed" } : { after: line, kind: "added" });
}

function matchSpatialLines(beforePage: PageText, afterPage: PageText, signal?: AbortSignalLike): SpatialLineMatch[] {
  const beforeLines = spatialLines(beforePage);
  const afterLines = spatialLines(afterPage);
  const matchedBefore = new Set<SpatialTextLine>();
  const matchedAfter = new Set<SpatialTextLine>();
  const exact = exactLineMatches(beforeLines, afterLines, beforePage, afterPage, matchedBefore, matchedAfter, signal);
  const candidates = changedLineCandidates(beforeLines, afterLines, beforePage, afterPage, matchedBefore, matchedAfter, signal);
  const changed = acceptChangedLines(candidates, matchedBefore, matchedAfter);
  return [...exact, ...changed, ...unmatchedLines(beforeLines, matchedBefore, "before"), ...unmatchedLines(afterLines, matchedAfter, "after")];
}

function conciseChangedText(before: string, after: string, options: SemanticDiffOptions): { before: string; after: string } {
  const local = buildSemanticDiff(before, after, options).diff.changes;
  return local.length === 1 ? { before: local[0]!.before, after: local[0]!.after } : { before, after };
}

function lineForSide(match: SpatialLineMatch, side: "before" | "after"): SpatialTextLine | undefined {
  return side === "before" ? match.before : match.after;
}

function matchCoordinate(match: SpatialLineMatch, axis: "x" | "y"): number {
  const line = match.before ?? match.after;
  return line ? line[axis] : 0;
}

function compareSpatialMatches(first: SpatialLineMatch, second: SpatialLineMatch): number {
  return matchCoordinate(first, "y") - matchCoordinate(second, "y") || matchCoordinate(first, "x") - matchCoordinate(second, "x");
}

/**
 * Narrowing a changed line to the words that actually differ costs a token diff,
 * and the change list plus both overlays all want the same answer, so it is
 * computed once per match and looked up afterwards.
 */
function conciseTextByMatch(matches: readonly SpatialLineMatch[], options: SemanticDiffOptions): Map<SpatialLineMatch, { before: string; after: string }> {
  const concise = new Map<SpatialLineMatch, { before: string; after: string }>();
  for (const match of matches) {
    if (match.kind !== "changed" || !match.before || !match.after) continue;
    concise.set(match, conciseChangedText(match.before.text, match.after.text, options));
  }
  return concise;
}

function spatialChange(match: SpatialLineMatch, id: string, concise: ReadonlyMap<SpatialLineMatch, { before: string; after: string }>): SemanticTextChange {
  const before = match.before ? match.before.text : "";
  const after = match.after ? match.after.text : "";
  const text = concise.get(match) ?? { before, after };
  return { id, kind: match.kind as SemanticChangeKind, before: text.before, after: text.after };
}

function spatialRuns(lines: readonly SpatialTextLine[], lookup: ReadonlyMap<SpatialTextLine, SpatialLineMatch>, changeIds: ReadonlyMap<SpatialLineMatch, string>, side: "before" | "after"): SemanticTextRun[] {
  return lines.map((line, index) => {
    const match = lookup.get(line)!;
    const id = changeIds.get(match) ?? `semantic-same-${side}-${index + 1}`;
    return { id: `${id}-${side}`, text: line.text, kind: match.kind };
  });
}

function highlightedSpatialQuads(line: SpatialTextLine, text: string): readonly TextQuad[] {
  if (line.quads.length !== 1 || !text || text === line.text) return line.quads;
  const start = line.text.indexOf(text);
  if (start < 0) return line.quads;
  return [subQuad(line.quads[0]!, start / line.text.length, (start + text.length) / line.text.length)];
}

function spatialOverlays(matches: readonly SpatialLineMatch[], changeIds: ReadonlyMap<SpatialLineMatch, string>, side: "before" | "after", concise: ReadonlyMap<SpatialLineMatch, { before: string; after: string }>): SemanticTextOverlay[] {
  return matches.flatMap((match) => {
    const line = lineForSide(match, side);
    if (!line) return [];
    const text = concise.get(match)?.[side] ?? line.text;
    return [{ id: changeIds.get(match)!, kind: match.kind as SemanticChangeKind, text, quads: highlightedSpatialQuads(line, text) }];
  });
}

/** A line counts as moved once it leaves the sub-point wobble of identical typesetting. */
const SHIFT_TOLERANCE = 1.5;

function unchangedLines(matches: readonly SpatialLineMatch[], beforePage: PageText, afterPage: PageText): UnchangedTextLine[] {
  // The two pages need not share a size, so the newer position is expressed in
  // the earlier page's points before asking how far the line moved.
  const scaleX = beforePage.width / Math.max(1, afterPage.width);
  const scaleY = beforePage.height / Math.max(1, afterPage.height);
  return matches.flatMap((match) => {
    if (match.kind !== "same" || !match.before || !match.after) return [];
    const distance = Math.hypot(match.after.x * scaleX - match.before.x, match.after.y * scaleY - match.before.y);
    return [{
      text: match.before.text,
      beforeQuads: match.before.quads,
      afterQuads: match.after.quads,
      shifted: distance > SHIFT_TOLERANCE,
    }];
  });
}

function pageDecodable(page: PageText): boolean {
  return page.decodable ?? isDecodableText(page.text);
}

function spatialPageDiff(beforePage: PageText, afterPage: PageText, options: SemanticDiffOptions): SemanticPageDiff {
  const beforeDecodable = pageDecodable(beforePage);
  const afterDecodable = pageDecodable(afterPage);
  if (!beforeDecodable || !afterDecodable) {
    return {
      before: [], after: [], changes: [], beforeTokenCount: 0, afterTokenCount: 0,
      hasBeforeText: false, hasAfterText: false, textUndecodable: true,
      beforeOverlays: [], afterOverlays: [], unchangedLines: [],
    };
  }
  const matches = matchSpatialLines(beforePage, afterPage, options.signal);
  const changeMatches = matches.filter((match) => match.kind !== "same").sort(compareSpatialMatches);
  const changeIds = new Map<SpatialLineMatch, string>();
  changeMatches.forEach((match, index) => changeIds.set(match, `semantic-${index + 1}`));
  const beforeMatch = new Map(matches.filter((match) => match.before).map((match) => [match.before!, match]));
  const afterMatch = new Map(matches.filter((match) => match.after).map((match) => [match.after!, match]));
  const beforeLines = matches.flatMap((match) => match.before ? [match.before] : []).sort((first, second) => first.y - second.y || first.x - second.x);
  const afterLines = matches.flatMap((match) => match.after ? [match.after] : []).sort((first, second) => first.y - second.y || first.x - second.x);

  const concise = conciseTextByMatch(changeMatches, options);
  const changes = changeMatches.map((match) => spatialChange(match, changeIds.get(match)!, concise));
  return {
    before: spatialRuns(beforeLines, beforeMatch, changeIds, "before"),
    after: spatialRuns(afterLines, afterMatch, changeIds, "after"),
    changes,
    beforeTokenCount: beforeDecodable ? tokenize(beforePage.text).length : 0,
    afterTokenCount: afterDecodable ? tokenize(afterPage.text).length : 0,
    hasBeforeText: beforeDecodable && beforeLines.length > 0,
    hasAfterText: afterDecodable && afterLines.length > 0,
    textUndecodable: !beforeDecodable || !afterDecodable,
    beforeOverlays: spatialOverlays(changeMatches, changeIds, "before", concise),
    afterOverlays: spatialOverlays(changeMatches, changeIds, "after", concise),
    unchangedLines: unchangedLines(matches, beforePage, afterPage),
  };
}

/** Compare extracted page text while retaining native PDF locations. */
export function diffSemanticPages(beforePage: PageText, afterPage: PageText, options: SemanticDiffOptions = {}): SemanticPageDiff {
  return measure(options.metrics, "core.semantic.page", () => {
    if (beforePage.items.length || afterPage.items.length) return spatialPageDiff(beforePage, afterPage, options);
    const undecodable = !pageDecodable(beforePage) || !pageDecodable(afterPage);
    const built = buildSemanticDiff(beforePage.text, afterPage.text, options);
    return {
      ...built.diff,
      // Never let an unreadable page present itself as a page with no changes.
      hasBeforeText: built.diff.hasBeforeText && !undecodable,
      hasAfterText: built.diff.hasAfterText && !undecodable,
      beforeTokenCount: undecodable ? 0 : built.diff.beforeTokenCount,
      afterTokenCount: undecodable ? 0 : built.diff.afterTokenCount,
      textUndecodable: undecodable,
      beforeOverlays: built.ranges.filter((change) => change.before).map((change) => ({
        id: change.id,
        kind: change.kind,
        text: change.before,
        quads: quadsForTextRange(beforePage, change.beforeStart, change.beforeEnd),
      })),
      afterOverlays: built.ranges.filter((change) => change.after).map((change) => ({
        id: change.id,
        kind: change.kind,
        text: change.after,
        quads: quadsForTextRange(afterPage, change.afterStart, change.afterEnd),
      })),
    };
  }, {
    beforeCharacters: beforePage.text.length,
    afterCharacters: afterPage.text.length,
    beforeItems: beforePage.items.length,
    afterItems: afterPage.items.length,
  });
}
