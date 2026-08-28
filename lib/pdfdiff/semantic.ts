import { throwIfAborted } from "./errors.ts";
import type { PageText, TextQuad } from "./types.ts";

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
  /** Native PDF geometry for changed text on each source page. */
  readonly beforeOverlays: readonly SemanticTextOverlay[];
  readonly afterOverlays: readonly SemanticTextOverlay[];
}

type Token = { value: string; start: number; end: number };
type PrimitiveEdit =
  | { kind: "same"; token: Token }
  | { kind: "added"; token: Token }
  | { kind: "removed"; token: Token };

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

/** Render tokens naturally while deliberately ignoring source whitespace/reflow. */
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

function pushEdit(edits: PrimitiveEdit[], edit: PrimitiveEdit): void {
  const previous = edits[edits.length - 1];
  if (previous?.kind === edit.kind) {
    // Keeping edits as individual tokens makes the backtracking code simple;
    // this helper is intentionally only a readability wrapper for now.
  }
  edits.push(edit);
}

function primitiveDiff(
  before: readonly Token[],
  after: readonly Token[],
  signal?: AbortSignal,
): PrimitiveEdit[] {
  const n = before.length;
  const m = after.length;
  if (!n && !m) return [];
  if (!n) return after.map((token) => ({ kind: "added", token }));
  if (!m) return before.map((token) => ({ kind: "removed", token }));

  // Myers' algorithm is linear in the size of the edit path for normal
  // revisions. A work cap keeps a pathological page from monopolising the
  // browser; the caller still gets a useful whole-page changed result.
  const max = n + m;
  const maxWork = Math.max(250_000, Math.min(4_000_000, max * 240));
  let work = 0;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];
  let found = false;

  outer: for (let distance = 0; distance <= max; distance += 1) {
    throwIfAborted(signal);
    trace.push(new Map(v));
    for (let k = -distance; k <= distance; k += 2) {
      work += 1;
      if (work > maxWork) break outer;

      const down = k === -distance || (k !== distance && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      const previousX = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      const previousY = previousX - k;
      let x = previousX;
      let y = previousY;
      while (x < n && y < m && before[x]!.value === after[y]!.value) {
        x += 1;
        y += 1;
        work += 1;
        if ((work & 0x1fff) === 0) throwIfAborted(signal);
        if (work > maxWork) break outer;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        found = true;
        break outer;
      }
    }
  }

  if (!found) {
    return [
      ...before.map((token) => ({ kind: "removed" as const, token })),
      ...after.map((token) => ({ kind: "added" as const, token })),
    ];
  }

  const edits: PrimitiveEdit[] = [];
  let x = n;
  let y = m;
  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    throwIfAborted(signal);
    const previousV = trace[distance]!;
    const k = x - y;
    const down = k === -distance || (k !== distance && (previousV.get(k - 1) ?? -1) < (previousV.get(k + 1) ?? -1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = previousV.get(previousK) ?? 0;
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      pushEdit(edits, { kind: "same", token: before[x - 1]! });
      x -= 1;
      y -= 1;
    }
    if (x === previousX) {
      pushEdit(edits, { kind: "added", token: after[y - 1]! });
      y -= 1;
    } else {
      pushEdit(edits, { kind: "removed", token: before[x - 1]! });
      x -= 1;
    }
  }
  while (x > 0 && y > 0) {
    pushEdit(edits, { kind: "same", token: before[x - 1]! });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    pushEdit(edits, { kind: "removed", token: before[x - 1]! });
    x -= 1;
  }
  while (y > 0) {
    pushEdit(edits, { kind: "added", token: after[y - 1]! });
    y -= 1;
  }
  return edits.reverse();
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

function segmentsFromEdits(edits: readonly PrimitiveEdit[]): Segment[] {
  const segments: Segment[] = [];
  const append = (segment: Segment): void => {
    const previous = segments[segments.length - 1];
    if (previous?.kind === "same" && segment.kind === "same") {
      previous.before.push(...segment.before);
      previous.after.push(...segment.after);
      return;
    }
    segments.push(segment);
  };
  let index = 0;
  while (index < edits.length) {
    const edit = edits[index]!;
    if (edit.kind === "same") {
      append({ kind: "same", before: [edit.token], after: [edit.token] });
      index += 1;
      continue;
    }

    const before: Token[] = [];
    const after: Token[] = [];
    while (index < edits.length && edits[index]!.kind !== "same") {
      const current = edits[index]!;
      if (current.kind === "removed") before.push(current.token);
      else after.push(current.token);
      index += 1;
    }
    append({
      kind: before.length && after.length ? "changed" : before.length ? "removed" : "added",
      before,
      after,
    });
  }
  return segments;
}

/**
 * Compare extracted PDF text by words and punctuation. Whitespace is not a
 * token, so line wrapping, font reflow, and PDF text-item spacing do not turn
 * an otherwise identical paragraph into a large false positive.
 */
function buildSemanticDiff(
  beforeText: string,
  afterText: string,
  options: { signal?: AbortSignal } = {},
): SemanticDiffBuild {
  const beforeTokens = tokenize(beforeText);
  const afterTokens = tokenize(afterText);
  const edits = primitiveDiff(beforeTokens, afterTokens, options.signal);
  const segments = segmentsFromEdits(edits);
  const before: SemanticTextRun[] = [];
  const after: SemanticTextRun[] = [];
  const changes: SemanticTextChange[] = [];
  const ranges: SemanticChangeRange[] = [];
  let id = 1;

  for (const segment of segments) {
    const beforeValue = joinTokens(segment.before);
    const afterValue = joinTokens(segment.after);
    const runId = `semantic-${id}`;
    const beforeStart = segment.before[0]?.start ?? beforeText.length;
    const beforeEnd = segment.before.at(-1)?.end ?? beforeStart;
    const afterStart = segment.after[0]?.start ?? afterText.length;
    const afterEnd = segment.after.at(-1)?.end ?? afterStart;
    if (segment.kind === "same") {
      before.push({ id: `${runId}-before`, text: beforeValue, kind: "same" });
      after.push({ id: `${runId}-after`, text: afterValue, kind: "same" });
    } else {
      const change = { id: runId, kind: segment.kind, before: beforeValue, after: afterValue };
      changes.push(change);
      ranges.push({
        ...change,
        beforeStart,
        beforeEnd,
        afterStart,
        afterEnd,
      });
      if (beforeValue) before.push({ id: `${runId}-before`, text: beforeValue, kind: segment.kind });
      if (afterValue) after.push({ id: `${runId}-after`, text: afterValue, kind: segment.kind });
    }
    id += 1;
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
  options: { signal?: AbortSignal } = {},
): SemanticTextDiff {
  return buildSemanticDiff(beforeText, afterText, options).diff;
}

function interpolate(start: { x: number; y: number }, end: { x: number; y: number }, amount: number) {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
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
    const startRatio = (overlapStart - item.textStart) / length;
    const endRatio = (overlapEnd - item.textStart) / length;
    quads.push(subQuad(item.quad, startRatio, endRatio));
  }
  return quads;
}

/** Compare page text while retaining the native PDF locations of each change. */
export function diffSemanticPages(
  beforePage: PageText,
  afterPage: PageText,
  options: { signal?: AbortSignal } = {},
): SemanticPageDiff {
  const built = buildSemanticDiff(beforePage.text, afterPage.text, options);
  return {
    ...built.diff,
    beforeOverlays: built.ranges
      .filter((change) => change.before)
      .map((change) => ({
        id: change.id,
        kind: change.kind,
        text: change.before,
        quads: quadsForTextRange(beforePage, change.beforeStart, change.beforeEnd),
      })),
    afterOverlays: built.ranges
      .filter((change) => change.after)
      .map((change) => ({
        id: change.id,
        kind: change.kind,
        text: change.after,
        quads: quadsForTextRange(afterPage, change.afterStart, change.afterEnd),
      })),
  };
}
