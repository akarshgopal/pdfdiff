import { useEffect, useState } from "react";
import { DEFAULT_OVERLAY, toHex } from "./overlaySettings";
import { styles, cx } from "./styles";

/**
 * A hand-drawn stand-in for a real comparison, not a screenshot: it renders in
 * both themes, animates, and stays a few kilobytes. The geometry is split into
 * what both revisions share and what only one of them has — the same split the
 * real overlay makes per pixel.
 */

const REMOVED = toHex(DEFAULT_OVERLAY.removedColor);
const ADDED = toHex(DEFAULT_OVERLAY.addedColor);

const MODES = ["overlay", "split", "swipe", "text"] as const;
type Mode = (typeof MODES)[number];

const MODE_LABEL: Record<Mode, string> = { overlay: "Overlay", split: "Split", swipe: "Swipe", text: "Text" };
const MODE_CAPTION: Record<Mode, string> = {
  overlay: "Removed content in red, added in teal, modified in purple.",
  split: "Matched pages side by side, changed regions boxed.",
  swipe: "Drag the divider to reveal one revision under the other.",
  text: "Added and removed wording highlighted in place.",
};

/** Body copy as bars; the two entries that differ carry the revision that owns them. */
const LINES: { y: number; width: number; only?: "earlier" | "newer" }[] = [
  { y: 232, width: 196 },
  { y: 246, width: 214 },
  { y: 260, width: 150, only: "earlier" },
  { y: 260, width: 178, only: "newer" },
  { y: 274, width: 206 },
  { y: 288, width: 120 },
  { y: 302, width: 188, only: "newer" },
];

function Shared() {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={1.4}>
      <rect x={28} y={26} width={244} height={180} rx={2} opacity={0.35} />
      <path d="M56 172h60l24-44h56" />
      <circle cx={196} cy={128} r={14} />
      <path d="M196 114v-22M196 142v24" />
      <rect x={44} y={44} width={54} height={30} rx={2} />
      <path d="M44 88h54M44 96h38" opacity={0.5} />
      <path d="M120 44h60l16 22h56" />
      <path d="M240 66v40" strokeDasharray="4 3" opacity={0.6} />
      <path d="M56 106h34v34H56z" opacity={0.5} />
      <path d="M56 106l34 34M90 106l-34 34" opacity={0.25} />
      <path d="M28 196h244" opacity={0.2} />
      <path d="M28 340h244M28 366h244" opacity={0.35} />
      <text x={30} y={358} fontSize={9} fill="currentColor" stroke="none" opacity={0.6}>
        ASSY-4471 · SHEET 1 OF 3
      </text>
    </g>
  );
}

function Only({ side }: { side: "earlier" | "newer" }) {
  const earlier = side === "earlier";
  return (
    <g stroke="currentColor" fill="none" strokeWidth={1.4}>
      <rect x={earlier ? 116 : 134} y={146} width={40} height={34} rx={2} />
      <text x={earlier ? 108 : 152} y={196} fontSize={10} fill="currentColor" stroke="none">
        {earlier ? "24.0" : "26.5"}
      </text>
      {earlier ? null : <circle cx={84} cy={59} r={6} />}
      <text x={earlier ? 196 : 232} y={358} fontSize={9} fill="currentColor" stroke="none">
        REV {earlier ? "A" : "B"}
      </text>
    </g>
  );
}

/** Without `all`, only the lines that belong to exactly one side (or to neither). */
function Lines({ side, all }: { side?: "earlier" | "newer"; all?: boolean }) {
  const keep = (line: (typeof LINES)[number]) =>
    all ? !line.only || line.only === side : side ? line.only === side : !line.only;
  return (
    <g fill="currentColor" opacity={0.55}>
      {LINES.filter(keep).map((line, index) => (
        <rect key={index} x={28} y={line.y} width={line.width} height={6} rx={3} />
      ))}
    </g>
  );
}

/** One full page in a single ink colour: everything that revision contains. */
function Page({ side }: { side: "earlier" | "newer" }) {
  return (
    <svg viewBox="0 0 300 400" className={cx(styles.demoPage)} role="presentation">
      <rect x={0} y={0} width={300} height={400} className="fill-background" />
      <g className="text-foreground">
        <Shared />
        <Only side={side} />
        <Lines side={side} all />
      </g>
    </svg>
  );
}

function OverlayPage() {
  return (
    <svg viewBox="0 0 300 400" className={cx(styles.demoPage)} role="presentation">
      <rect x={0} y={0} width={300} height={400} className="fill-background" />
      <g className="text-foreground" opacity={DEFAULT_OVERLAY.unchangedOpacity}>
        <Shared />
        <Lines />
      </g>
      <g color={REMOVED}>
        <Only side="earlier" />
        <Lines side="earlier" />
      </g>
      <g color={ADDED}>
        <Only side="newer" />
        <Lines side="newer" />
      </g>
    </svg>
  );
}

function TextPage() {
  return (
    <svg viewBox="0 0 300 400" className={cx(styles.demoPage)} role="presentation">
      <rect x={0} y={0} width={300} height={400} className="fill-background" />
      <g className="text-foreground">
        {LINES.map((line, index) => {
          const y = 230 + index * 14;
          return (
            <g key={index}>
              {line.only ? (
                <rect
                  x={25}
                  y={y - 4}
                  width={line.width + 6}
                  height={14}
                  rx={3}
                  fill={line.only === "earlier" ? REMOVED : ADDED}
                  opacity={0.16}
                />
              ) : null}
              <rect
                x={28}
                y={y}
                width={line.width}
                height={6}
                rx={3}
                fill="currentColor"
                opacity={line.only === "earlier" ? 0.3 : 0.5}
              />
              {line.only === "earlier" ? (
                <path d={`M28 ${y + 3}h${line.width}`} stroke={REMOVED} strokeWidth={1.2} />
              ) : null}
            </g>
          );
        })}
        <g opacity={0.3}>
          <Shared />
        </g>
      </g>
    </svg>
  );
}

export function HeroDemo() {
  const [mode, setMode] = useState<Mode>("overlay");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setMode((current) => MODES[(MODES.indexOf(current) + 1) % MODES.length]!), 4200);
    return () => clearInterval(timer);
  }, [auto]);

  const pick = (next: Mode) => {
    setAuto(false);
    setMode(next);
  };

  return (
    <div className={cx(styles.demo)}>
      <div className={cx(styles.demoBar)}>
        <span className={cx(styles.demoChip)}>assy-4471-revA.pdf</span>
        <span className={cx(styles.demoArrow)} aria-hidden="true">
          →
        </span>
        <span className={cx(styles.demoChip)}>assy-4471-revB.pdf</span>
        <span className={cx(styles.demoCount)}>3 changes on this page</span>
      </div>
      <div className={cx(styles.demoStage)}>
        {mode === "overlay" ? <OverlayPage /> : null}
        {mode === "text" ? <TextPage /> : null}
        {mode === "split" ? (
          <div className={cx(styles.demoSplit)}>
            <Page side="earlier" />
            <Page side="newer" />
          </div>
        ) : null}
        {mode === "swipe" ? (
          <div className={cx(styles.demoSwipe)}>
            <Page side="earlier" />
            <div className={cx(styles.demoSwipeTop)}>
              <Page side="newer" />
            </div>
            <div className={cx(styles.demoSwipeHandle)} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className={cx(styles.demoFoot)}>
        <div className={cx(styles.demoTabs)} role="group" aria-label="Demo comparison views">
          {MODES.map((item) => (
            <button
              key={item}
              className={cx(styles.demoTab, item === mode && styles.demoTabCurrent)}
              type="button"
              aria-pressed={item === mode}
              onClick={() => pick(item)}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </div>
        <p className={cx(styles.demoCaption)}>{MODE_CAPTION[mode]}</p>
      </div>
    </div>
  );
}
