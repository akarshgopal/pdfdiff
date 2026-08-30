/**
 * A PDF can carry text that cannot be read. Subset fonts exported without a
 * ToUnicode map — CAD and drawing tools do this routinely — hand back raw glyph
 * indices, so extraction "succeeds" and produces control characters instead of
 * words. Left undetected that is the worst possible outcome: the comparison
 * finds no text changes and states it with total confidence. Measuring how much
 * of the text actually decoded lets the tool say "I could not read this" rather
 * than "nothing changed".
 */

/** Control characters (excluding tab, newline, carriage return), private-use glyphs, and the replacement char. */
// eslint-disable-next-line no-control-regex -- matching unmapped glyph codes is the whole point
const UNDECODABLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF\uFFFD]/u;

const DEFAULT_MIN_DECODABLE = 0.5;

/** Share of non-whitespace characters that map to real text, 1 for empty input. */
export function decodableRatio(text: string): number {
  let total = 0;
  let undecodable = 0;
  for (const character of text) {
    if (/\s/.test(character)) continue;
    total += 1;
    if (UNDECODABLE.test(character)) undecodable += 1;
  }
  return total === 0 ? 1 : 1 - undecodable / total;
}

/**
 * Empty text is "decodable" — there is simply nothing there, which is a
 * different condition from text that came back as unreadable glyph codes.
 */
export function isDecodableText(text: string, minRatio: number = DEFAULT_MIN_DECODABLE): boolean {
  return decodableRatio(text) >= minRatio;
}

/** Drop unreadable glyph codes so they cannot be counted or diffed as words. */
export function stripUndecodable(text: string): string {
  return text.replace(new RegExp(UNDECODABLE.source, "gu"), "");
}
