import { throwIfAborted } from "./errors.js";
import { measure } from "./instrumentation.js";
import type { DiffMetricSink } from "./instrumentation.js";
import type {
  SemanticChangeKind,
  SemanticRunKind,
  SemanticTextChange,
  SemanticTextDiff,
  SemanticTextRun,
} from "./semantic-types.js";

export type Token = { value: string; start: number; end: number };
type PrimitiveEdit =
  { kind: "same"; token: Token } | { kind: "added"; token: Token } | { kind: "removed"; token: Token };

interface PrimitiveDiffResult {
  edits: PrimitiveEdit[];
  exact: boolean;
}

const WORD_OR_PUNCTUATION = /[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

export function tokenize(text: string): Token[] {
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

function extendDiagonal(
  before: readonly Token[],
  after: readonly Token[],
  startX: number,
  startY: number,
  work: { value: number; limit: number },
  signal?: AbortSignal,
): { x: number; y: number; exhausted: boolean } {
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

function findDiffTrace(
  before: readonly Token[],
  after: readonly Token[],
  signal?: AbortSignal,
): Array<Map<number, number>> | null {
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

function appendMatchingEdits(
  edits: PrimitiveEdit[],
  before: readonly Token[],
  x: number,
  y: number,
  previousX: number,
  previousY: number,
): { x: number; y: number } {
  while (x > previousX && y > previousY) {
    edits.push({ kind: "same", token: before[x - 1]! });
    x -= 1;
    y -= 1;
  }
  return { x, y };
}

function appendLeadingEdits(
  edits: PrimitiveEdit[],
  before: readonly Token[],
  after: readonly Token[],
  x: number,
  y: number,
): void {
  while (x > 0 && y > 0) {
    edits.push({ kind: "same", token: before[x - 1]! });
    x -= 1;
    y -= 1;
  }
  while (x > 0) edits.push({ kind: "removed", token: before[--x]! });
  while (y > 0) edits.push({ kind: "added", token: after[--y]! });
}

function backtrackEdits(
  before: readonly Token[],
  after: readonly Token[],
  trace: Array<Map<number, number>>,
  signal?: AbortSignal,
): PrimitiveEdit[] {
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

export function primitiveDiff(
  before: readonly Token[],
  after: readonly Token[],
  signal?: AbortSignal,
): PrimitiveDiffResult {
  if (!before.length && !after.length) return { edits: [], exact: true };
  if (!before.length) return { edits: after.map((token) => ({ kind: "added", token })), exact: true };
  if (!after.length) return { edits: before.map((token) => ({ kind: "removed", token })), exact: true };
  const trace = findDiffTrace(before, after, signal);
  return trace
    ? { edits: backtrackEdits(before, after, trace, signal), exact: true }
    : {
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

function changedTokens(
  edits: readonly PrimitiveEdit[],
  start: number,
): { before: Token[]; after: Token[]; next: number } {
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

export interface SemanticDiffOptions {
  signal?: AbortSignal;
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

function artifactsForSegment(
  segment: Segment,
  index: number,
  beforeTextLength: number,
  afterTextLength: number,
): SegmentArtifacts {
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

export function buildSemanticDiff(
  beforeText: string,
  afterText: string,
  options: SemanticDiffOptions = {},
): SemanticDiffBuild {
  const beforeTokens = tokenize(beforeText);
  const afterTokens = tokenize(afterText);
  const primitive = measure(
    options.metrics,
    "core.semantic.token-diff",
    () => primitiveDiff(beforeTokens, afterTokens, options.signal),
    {
      beforeTokens: beforeTokens.length,
      afterTokens: afterTokens.length,
    },
  );
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

export function diffSemanticText(
  beforeText: string,
  afterText: string,
  options: SemanticDiffOptions = {},
): SemanticTextDiff {
  return measure(options.metrics, "core.semantic.text", () => buildSemanticDiff(beforeText, afterText, options).diff, {
    beforeCharacters: beforeText.length,
    afterCharacters: afterText.length,
  });
}
