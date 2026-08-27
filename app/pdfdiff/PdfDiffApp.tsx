"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

// The StyleX Vite plugin injects the development runtime through this virtual
// module; the declaration lives beside this component for TypeScript builds.
if (process.env.NODE_ENV !== "production") {
  void import("virtual:stylex:runtime").catch(() => undefined);
}

/**
 * The UI deliberately depends on this small boundary instead of knowing how
 * PDF.js, workers, or a future WebGPU backend are wired. The parent can pass
 * an implementation from ../../lib/pdfdiff as `engine`.
 */
export type DiffViewMode =
  | "diff"
  | "side-by-side"
  | "swipe"
  | "blink"
  | "earlier"
  | "newer";

export type AlignmentMode = "none" | "translation";

export type DiffRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "added" | "removed" | "changed";
  label?: string;
};

export type DiffTextChange = {
  id: string;
  text: string;
  kind: "added" | "removed" | "changed";
  pageX?: number;
  pageY?: number;
};

export type DiffPage = {
  index: number;
  width?: number;
  height?: number;
  status?: "same" | "changed" | "added" | "removed" | "processing" | "error";
  beforeSrc?: string;
  afterSrc?: string;
  diffSrc?: string;
  changedPixels?: number;
  changedPercent?: number;
  regions?: DiffRegion[];
  textChanges?: DiffTextChange[];
  error?: string;
};

export type DiffComparison = {
  earlierName: string;
  newerName: string;
  pages: DiffPage[];
  elapsedMs?: number;
};

export type DiffOptions = {
  sensitivity: number;
  alignment: AlignmentMode;
};

export type PdfDiffEngine = {
  compare: (request: {
    earlier: File;
    newer: File;
    options: DiffOptions;
    signal: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
  }) => Promise<DiffComparison>;
};

export type PdfDiffAnalyticsEvent =
  | { name: "comparison_started"; earlierSizeBucket: string; newerSizeBucket: string }
  | { name: "comparison_completed"; pageCount: number; changedPageCount: number }
  | { name: "comparison_failed"; errorCode: string }
  | { name: "view_mode_used"; mode: DiffViewMode };

export type PdfDiffAppProps = {
  engine?: PdfDiffEngine;
  initialComparison?: DiffComparison;
  onAnalytics?: (event: PdfDiffAnalyticsEvent) => void;
};

const lazyBrowserEngine: PdfDiffEngine = {
  async compare(request) {
    const { browserPdfDiffEngine } = await import("../PdfDiffEngine");
    return browserPdfDiffEngine.compare(request);
  },
};

const MAX_FILE_SIZE = 150 * 1024 * 1024;
const viewModes: Array<{ id: DiffViewMode; label: string; shortcut: string }> = [
  { id: "diff", label: "Diff", shortcut: "1" },
  { id: "side-by-side", label: "Side by side", shortcut: "2" },
  { id: "swipe", label: "Swipe", shortcut: "3" },
  { id: "blink", label: "Blink", shortcut: "4" },
  { id: "earlier", label: "Earlier", shortcut: "5" },
  { id: "newer", label: "Newer", shortcut: "6" },
];

const zoomLevels = [50, 75, 100, 125, 150, 200] as const;

const styles = stylex.create({
  root: {
    minHeight: "100vh",
    backgroundColor: "#f5f3ed",
    color: "#15242d",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    letterSpacing: "-0.01em",
  },
  shell: {
    width: "min(1440px, 100%)",
    marginInline: "auto",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    minHeight: 72,
    paddingInline: { default: 32, "@media (max-width: 820px)": 18 },
    borderBottom: "1px solid #d9d9d1",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    backgroundColor: "#f8f7f2",
  },
  logo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 16,
    fontWeight: 720,
    letterSpacing: "-0.04em",
    whiteSpace: "nowrap",
  },
  logoMark: {
    width: 26,
    height: 26,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    backgroundColor: "#ed5f45",
    color: "#fff9f2",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.08em",
  },
  privacyPill: {
    display: { default: "inline-flex", "@media (max-width: 520px)": "none" },
    alignItems: "center",
    gap: 7,
    color: "#60716f",
    fontSize: 12,
    fontWeight: 590,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  },
  privacyDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#4fa58a",
    boxShadow: "0 0 0 3px rgba(79, 165, 138, 0.13)",
  },
  intro: {
    width: "min(1060px, 100%)",
    marginInline: "auto",
    padding: { default: "clamp(54px, 9vw, 116px) 32px 64px", "@media (max-width: 820px)": "54px 18px 50px" },
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  eyebrow: {
    margin: 0,
    color: "#e25c43",
    fontSize: 11,
    fontWeight: 760,
    letterSpacing: "0.17em",
    textTransform: "uppercase",
  },
  headline: {
    maxWidth: 720,
    margin: "16px 0 0",
    fontSize: "clamp(38px, 6vw, 72px)",
    lineHeight: 0.98,
    fontWeight: 730,
    letterSpacing: "-0.075em",
  },
  introCopy: {
    maxWidth: 540,
    margin: "22px 0 0",
    color: "#687773",
    fontSize: 16,
    lineHeight: 1.55,
  },
  uploadGrid: {
    width: "100%",
    marginTop: 42,
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", "@media (max-width: 820px)": "1fr" },
    gap: 14,
  },
  uploadCard: {
    minHeight: 222,
    padding: 22,
    border: "1px solid #d6d7cf",
    borderRadius: 18,
    backgroundColor: "#fbfaf6",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    textAlign: "left",
    transition: "border-color 150ms ease, background-color 150ms ease, transform 150ms ease",
    cursor: "pointer",
    ":hover": {
      borderColor: "#b8bbb1",
      backgroundColor: "#fffefa",
      transform: "translateY(-2px)",
    },
    ":focus-visible": {
      outline: "3px solid rgba(237, 95, 69, 0.3)",
      outlineOffset: 3,
    },
  },
  uploadCardActive: {
    borderColor: "#ed5f45",
    backgroundColor: "#fff6ef",
  },
  uploadCardFilled: {
    borderColor: "#8dbbab",
    backgroundColor: "#f5faf4",
  },
  uploadTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  uploadLabel: {
    display: "block",
    color: "#687773",
    fontSize: 11,
    fontWeight: 760,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  uploadTitle: {
    margin: "8px 0 0",
    fontSize: 19,
    lineHeight: 1.1,
    fontWeight: 680,
    letterSpacing: "-0.035em",
  },
  uploadIcon: {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    border: "1px solid #d9d9d1",
    borderRadius: 10,
    color: "#e25c43",
    fontSize: 18,
    fontWeight: 650,
  },
  uploadHint: {
    margin: "14px 0 0",
    color: "#76827d",
    fontSize: 13,
    lineHeight: 1.45,
  },
  uploadAction: {
    marginTop: 20,
    color: "#e25c43",
    fontSize: 13,
    fontWeight: 650,
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  fileGlyph: {
    flex: "0 0 auto",
    width: 30,
    height: 34,
    display: "grid",
    placeItems: "center",
    border: "1px solid #b6d1c1",
    borderRadius: 7,
    color: "#40856c",
    fontSize: 10,
    fontWeight: 780,
    letterSpacing: "0.03em",
  },
  fileDetails: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  fileName: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 14,
    fontWeight: 650,
  },
  fileMeta: {
    color: "#7c8881",
    fontSize: 11,
  },
  fileRemove: {
    marginLeft: "auto",
    flex: "0 0 auto",
    width: 26,
    height: 26,
    border: 0,
    borderRadius: 7,
    backgroundColor: "transparent",
    color: "#7a8581",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    ":hover": { backgroundColor: "#e8ebe4", color: "#15242d" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
  },
  swapUpload: {
    width: 42,
    height: 42,
    alignSelf: "center",
    marginInline: -6,
    marginTop: 80,
    zIndex: 1,
    border: "1px solid #cfd1c8",
    borderRadius: "50%",
    backgroundColor: "#f5f3ed",
    color: "#e25c43",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 700,
    transition: "transform 150ms ease, background-color 150ms ease",
    ":hover": { backgroundColor: "#fff8ef", transform: "rotate(180deg)" },
    ":focus-visible": { outline: "3px solid rgba(237, 95, 69, 0.3)", outlineOffset: 2 },
  },
  compareButton: {
    minHeight: 50,
    marginTop: 30,
    paddingInline: 24,
    border: 0,
    borderRadius: 11,
    backgroundColor: "#ed5f45",
    color: "#fffaf3",
    fontSize: 14,
    fontWeight: 710,
    cursor: "pointer",
    boxShadow: "0 7px 16px rgba(201, 76, 55, 0.18)",
    transition: "background-color 150ms ease, transform 150ms ease, opacity 150ms ease",
    ":hover": { backgroundColor: "#d9513a", transform: "translateY(-1px)" },
    ":focus-visible": { outline: "3px solid rgba(237, 95, 69, 0.3)", outlineOffset: 3 },
    ":disabled": { cursor: "not-allowed", opacity: 0.44, boxShadow: "none", transform: "none" },
  },
  uploadFooter: {
    marginTop: 29,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    color: "#89918b",
    fontSize: 11,
  },
  footerShield: {
    color: "#4fa58a",
    fontSize: 13,
  },
  errorBox: {
    width: "100%",
    marginTop: 18,
    padding: "12px 14px",
    border: "1px solid #efc7bb",
    borderRadius: 10,
    backgroundColor: "#fff4f0",
    color: "#a74331",
    fontSize: 13,
    lineHeight: 1.4,
    textAlign: "left",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  workspace: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  workspaceBar: {
    minHeight: 68,
    padding: "12px 28px",
    borderBottom: "1px solid #d9d9d1",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    backgroundColor: "#f8f7f2",
  },
  documentPair: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 11,
  },
  documentChip: {
    minWidth: 0,
    maxWidth: 230,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    border: "1px solid #dedfd7",
    borderRadius: 8,
    backgroundColor: "#fbfaf6",
    fontSize: 12,
    fontWeight: 620,
  },
  documentChipLabel: {
    color: "#9b5b48",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.08em",
  },
  documentChipName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pairArrow: {
    color: "#e25c43",
    fontSize: 17,
    fontWeight: 700,
  },
  workspaceActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  quietButton: {
    minHeight: 32,
    paddingInline: 11,
    border: "1px solid #d6d7cf",
    borderRadius: 7,
    backgroundColor: "transparent",
    color: "#61706b",
    fontSize: 12,
    fontWeight: 620,
    cursor: "pointer",
    ":hover": { borderColor: "#aeb3a8", color: "#15242d", backgroundColor: "#fffefa" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
  },
  workspaceMain: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "112px minmax(0, 1fr) 264px",
      "@media (max-width: 1100px)": "96px minmax(0, 1fr) 232px",
      "@media (max-width: 820px)": "76px minmax(0, 1fr)",
    },
  },
  pageRail: {
    minHeight: 0,
    padding: "19px 14px",
    borderRight: "1px solid #d9d9d1",
    overflowY: "auto",
    backgroundColor: "#f0eee7",
  },
  railHeading: {
    margin: "0 2px 13px",
    color: "#7b8580",
    fontSize: 10,
    fontWeight: 760,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  pageButton: {
    width: "100%",
    padding: 5,
    marginBottom: 10,
    border: "1px solid transparent",
    borderRadius: 8,
    backgroundColor: "transparent",
    color: "#63716d",
    textAlign: "left",
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease",
    ":hover": { backgroundColor: "#faf9f4" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
  },
  pageButtonCurrent: {
    borderColor: "#ed5f45",
    backgroundColor: "#fff9f1",
  },
  pageThumb: {
    position: "relative",
    aspectRatio: "0.71",
    overflow: "hidden",
    border: "1px solid #d6d7cf",
    borderRadius: 4,
    backgroundColor: "#fffefa",
    boxShadow: "0 2px 4px rgba(25, 41, 44, 0.05)",
  },
  pageThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 7,
    backgroundColor: "#fcfbf7",
  },
  thumbLine: {
    height: 2,
    borderRadius: 3,
    backgroundColor: "#c6d8ce",
  },
  thumbLineShort: { width: "62%" },
  thumbDiagram: {
    flex: 1,
    marginTop: 2,
    border: "1px solid #dce8df",
    backgroundColor: "#f3f8f2",
  },
  pageNumber: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    marginTop: 5,
    paddingInline: 2,
    fontSize: 10,
    fontWeight: 680,
  },
  pageStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: "#4b9a7f",
    fontSize: 9,
  },
  pageStatusChanged: { color: "#e25c43" },
  pageStatusAdded: { color: "#3d8c79" },
  pageStatusRemoved: { color: "#b56862" },
  canvasColumn: {
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#deddd6",
  },
  toolbar: {
    minHeight: 58,
    padding: "10px 16px",
    borderBottom: "1px solid #cecec6",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#f3f2ec",
    flexWrap: { default: "nowrap", "@media (max-width: 820px)": "wrap" },
  },
  toolbarGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  modeGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    border: "1px solid #d5d6ce",
    borderRadius: 8,
    backgroundColor: "#e8e7df",
  },
  modeButton: {
    minHeight: 28,
    paddingInline: 9,
    border: 0,
    borderRadius: 6,
    backgroundColor: "transparent",
    color: "#71807a",
    fontSize: 11,
    fontWeight: 650,
    cursor: "pointer",
    whiteSpace: "nowrap",
    ":hover": { color: "#15242d" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 1 },
  },
  modeButtonCurrent: {
    backgroundColor: "#fffefa",
    color: "#15242d",
    boxShadow: "0 1px 3px rgba(20, 31, 34, 0.11)",
  },
  iconButton: {
    width: 30,
    height: 30,
    border: "1px solid #d5d6ce",
    borderRadius: 7,
    backgroundColor: "#f8f7f2",
    color: "#65736d",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 620,
    lineHeight: 1,
    ":hover": { color: "#15242d", borderColor: "#aeb3a8" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
    ":disabled": { opacity: 0.38, cursor: "not-allowed" },
  },
  zoomLabel: {
    minWidth: 45,
    color: "#687773",
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
  },
  stage: {
    position: "relative",
    flex: 1,
    minHeight: 300,
    overflow: "auto",
    padding: "clamp(26px, 5vw, 58px)",
    backgroundColor: "#d9d8d1",
    backgroundImage: "radial-gradient(#c6c7bf 0.7px, transparent 0.7px)",
    backgroundSize: "15px 15px",
  },
  stageCenter: {
    minWidth: "100%",
    minHeight: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  paper: {
    position: "relative",
    width: "min(780px, 100%)",
    minHeight: 520,
    overflow: "hidden",
    backgroundColor: "#fffefa",
    boxShadow: "0 18px 36px rgba(39, 49, 48, 0.17), 0 3px 7px rgba(39, 49, 48, 0.09)",
    transformOrigin: "top center",
    transition: "transform 180ms ease",
  },
  paperZoom50: { transform: "scale(0.5)" },
  paperZoom75: { transform: "scale(0.75)" },
  paperZoom100: { transform: "scale(1)" },
  paperZoom125: { transform: "scale(1.25)" },
  paperZoom150: { transform: "scale(1.5)" },
  paperZoom200: { transform: "scale(2)" },
  pageImage: {
    width: "100%",
    height: "auto",
    minHeight: 520,
    objectFit: "contain",
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
  },
  diffImage: {
    width: "100%",
    height: "100%",
    minHeight: 520,
    objectFit: "contain",
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
  },
  sideBySide: {
    minHeight: 520,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 1,
    backgroundColor: "#d9d8d1",
  },
  sidePanel: {
    minWidth: 0,
    overflow: "hidden",
    backgroundColor: "#fffefa",
  },
  paperEmpty: {
    minHeight: 520,
    display: "grid",
    placeItems: "center",
    padding: 30,
    color: "#8a958e",
    fontSize: 13,
    textAlign: "center",
  },
  placeholderArt: {
    position: "absolute",
    inset: 0,
    padding: "14% 12%",
    display: "flex",
    flexDirection: "column",
    gap: 13,
    opacity: 0.72,
  },
  placeholderTitle: {
    width: "42%",
    height: 7,
    marginBottom: 8,
    borderRadius: 4,
    backgroundColor: "#b9d0c4",
  },
  placeholderRule: { height: 2, width: "100%", backgroundColor: "#d7e4da" },
  placeholderRuleShort: { width: "67%" },
  placeholderBoxGrid: {
    flex: 1,
    minHeight: 170,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 15,
  },
  placeholderBox: { border: "1px solid #cbded1", backgroundColor: "#f5f9f3" },
  placeholderFooter: {
    width: "75%",
    height: 3,
    marginTop: 15,
    borderRadius: 3,
    backgroundColor: "#d7e4da",
  },
  changeOverlay: {
    position: "absolute",
    border: "2px solid #ed5f45",
    backgroundColor: "rgba(237, 95, 69, 0.11)",
    pointerEvents: "none",
  },
  changeOverlayAdded: { borderColor: "#2caa88", backgroundColor: "rgba(44, 170, 136, 0.12)" },
  changeOverlayRemoved: { borderColor: "#d37069", backgroundColor: "rgba(211, 112, 105, 0.12)" },
  changeOverlayCurrent: { boxShadow: "0 0 0 3px rgba(237, 95, 69, 0.2)" },
  swipeWrap: { position: "relative", overflow: "hidden" },
  swipeNewer: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
  },
  swipe50: { clipPath: "inset(0 50% 0 0)" },
  swipe60: { clipPath: "inset(0 40% 0 0)" },
  swipe70: { clipPath: "inset(0 30% 0 0)" },
  swipe80: { clipPath: "inset(0 20% 0 0)" },
  swipe90: { clipPath: "inset(0 10% 0 0)" },
  swipe100: { clipPath: "inset(0 0 0 0)" },
  swipe10: { clipPath: "inset(0 90% 0 0)" },
  swipe20: { clipPath: "inset(0 80% 0 0)" },
  swipe30: { clipPath: "inset(0 70% 0 0)" },
  swipe40: { clipPath: "inset(0 60% 0 0)" },
  swipeDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#ed5f45",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.55)",
    pointerEvents: "none",
  },
  blinkBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    padding: "5px 8px",
    borderRadius: 6,
    backgroundColor: "rgba(21, 36, 45, 0.76)",
    color: "#fffefa",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  canvasCaption: {
    position: "absolute",
    left: 17,
    bottom: 15,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 9px",
    border: "1px solid rgba(188, 190, 182, 0.8)",
    borderRadius: 6,
    backgroundColor: "rgba(248,247,242,0.86)",
    color: "#697670",
    fontSize: 10,
    fontWeight: 600,
  },
  captionDotAdded: { width: 7, height: 7, borderRadius: "50%", backgroundColor: "#2caa88" },
  captionDotRemoved: { width: 7, height: 7, borderRadius: "50%", backgroundColor: "#d37069" },
  inspector: {
    display: { default: "block", "@media (max-width: 820px)": "none" },
    minHeight: 0,
    padding: "21px 18px",
    borderLeft: "1px solid #d9d9d1",
    overflowY: "auto",
    backgroundColor: "#f5f4ee",
  },
  inspectorHeading: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  inspectorSubheading: {
    margin: "5px 0 18px",
    color: "#7b8580",
    fontSize: 11,
    lineHeight: 1.4,
  },
  changeSummary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 7,
    marginBottom: 22,
  },
  statCard: {
    padding: "10px 11px",
    border: "1px solid #dbdcd4",
    borderRadius: 8,
    backgroundColor: "#fbfaf6",
  },
  statLabel: { color: "#89938d", fontSize: 10, fontWeight: 620 },
  statValue: {
    display: "block",
    marginTop: 4,
    color: "#1f4c43",
    fontSize: 18,
    fontWeight: 720,
    fontVariantNumeric: "tabular-nums",
  },
  statValueWarm: { color: "#d35c45" },
  inspectorSection: {
    paddingTop: 17,
    marginTop: 17,
    borderTop: "1px solid #deded6",
  },
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    color: "#7b8580",
    fontSize: 10,
    fontWeight: 760,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  changeList: { display: "flex", flexDirection: "column", gap: 6 },
  changeButton: {
    width: "100%",
    padding: "9px 10px",
    border: "1px solid #deded6",
    borderRadius: 7,
    backgroundColor: "#fbfaf6",
    color: "#445650",
    display: "flex",
    alignItems: "center",
    gap: 8,
    textAlign: "left",
    cursor: "pointer",
    ":hover": { borderColor: "#ed9c8d", backgroundColor: "#fff8f1" },
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
  },
  changeButtonCurrent: { borderColor: "#ed5f45", backgroundColor: "#fff8f1" },
  changeDot: { width: 7, height: 7, flex: "0 0 auto", borderRadius: "50%", backgroundColor: "#ed5f45" },
  changeDotAdded: { backgroundColor: "#2caa88" },
  changeDotRemoved: { backgroundColor: "#d37069" },
  changeText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 620 },
  changeCount: { marginLeft: "auto", color: "#9ba19b", fontSize: 10, fontVariantNumeric: "tabular-nums" },
  emptyChanges: {
    padding: "16px 10px",
    border: "1px dashed #d1d5cc",
    borderRadius: 8,
    color: "#87928b",
    fontSize: 11,
    lineHeight: 1.45,
  },
  controlRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  controlName: { color: "#66756f", fontSize: 11, fontWeight: 620 },
  controlValue: { color: "#253c38", fontSize: 11, fontWeight: 720, fontVariantNumeric: "tabular-nums" },
  select: {
    minHeight: 30,
    maxWidth: 135,
    padding: "0 8px",
    border: "1px solid #d5d6ce",
    borderRadius: 6,
    backgroundColor: "#fbfaf6",
    color: "#344941",
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 620,
    cursor: "pointer",
    ":focus-visible": { outline: "2px solid #ed5f45", outlineOffset: 2 },
  },
  range: {
    width: 120,
    accentColor: "#ed5f45",
    cursor: "pointer",
  },
  statusFooter: {
    minHeight: 36,
    padding: "0 18px",
    borderTop: "1px solid #cecec6",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#f3f2ec",
    color: "#7c8781",
    fontSize: 10,
    fontWeight: 570,
  },
  statusAccent: { color: "#40856c" },
  loading: {
    flex: 1,
    minHeight: 440,
    display: "grid",
    placeItems: "center",
    padding: 30,
  },
  loadingCard: {
    width: "min(390px, 100%)",
    padding: 25,
    border: "1px solid #d7d8d0",
    borderRadius: 14,
    backgroundColor: "#fbfaf6",
    boxShadow: "0 12px 25px rgba(37, 51, 49, 0.08)",
    textAlign: "center",
  },
  loadingMark: {
    width: 42,
    height: 42,
    marginInline: "auto",
    display: "grid",
    placeItems: "center",
    border: "2px solid #f1c1b4",
    borderTopColor: "#ed5f45",
    borderRadius: "50%",
    color: "#ed5f45",
    fontSize: 15,
    animationName: "pdfdiff-spin",
    animationDuration: "900ms",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  loadingTitle: { margin: "17px 0 0", fontSize: 17, fontWeight: 700 },
  loadingCopy: { margin: "7px 0 0", color: "#78847e", fontSize: 12, lineHeight: 1.5 },
  progressTrack: { height: 5, marginTop: 18, overflow: "hidden", borderRadius: 5, backgroundColor: "#e8e9e2" },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: "#ed5f45", transition: "width 180ms ease" },
  busyBar: { minHeight: 4, backgroundColor: "#e4e5dd" },
  busyBarFill: { height: "100%", backgroundColor: "#ed5f45", transition: "width 180ms ease" },
  mobileOnly: { display: { default: "none", "@media (max-width: 820px)": "inline" } },
  desktopOnly: { display: { default: "inline", "@media (max-width: 820px)": "none" } },
});

type StyleXArg = StyleXStyles;

const styleProps = (...stylesToApply: Array<StyleXArg>) =>
  stylex.props(...stylesToApply.filter(Boolean));

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function sizeBucket(bytes: number): string {
  if (bytes < 2 * 1024 * 1024) return "small";
  if (bytes < 20 * 1024 * 1024) return "medium";
  if (bytes < 80 * 1024 * 1024) return "large";
  return "very_large";
}

function pageStatus(page: DiffPage): NonNullable<DiffPage["status"]> {
  if (page.status) return page.status;
  if (page.beforeSrc && page.afterSrc && page.diffSrc) return "changed";
  return "processing";
}

function statusSymbol(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "✓";
  if (status === "added") return "+";
  if (status === "removed") return "−";
  if (status === "error") return "!";
  return "•";
}

function statusLabel(status: NonNullable<DiffPage["status"]>): string {
  if (status === "same") return "No changes";
  if (status === "added") return "Added page";
  if (status === "removed") return "Removed page";
  if (status === "error") return "Error";
  if (status === "processing") return "Processing";
  return "Changes found";
}

function zoomStyle(zoom: number) {
  return styles[`paperZoom${zoom}` as keyof typeof styles] as StyleXArg;
}

function swipeStyle(value: number) {
  const rounded = Math.min(100, Math.max(10, Math.round(value / 10) * 10));
  return styles[`swipe${rounded}` as keyof typeof styles] as StyleXArg;
}

function getRegionStyle(region: DiffRegion): CSSProperties {
  const x = `${Math.max(0, Math.min(100, region.x))}%`;
  const y = `${Math.max(0, Math.min(100, region.y))}%`;
  const width = `${Math.max(0.5, Math.min(100, region.width))}%`;
  const height = `${Math.max(0.5, Math.min(100, region.height))}%`;
  // These CSS custom properties are intentionally the only dynamic visual
  // values; the containing visual treatment remains a StyleX class.
  return { left: x, top: y, width, height };
}

function FileGlyph() {
  return <span {...styleProps(styles.fileGlyph)} aria-hidden="true">PDF</span>;
}

function FileCard({
  side,
  file,
  active,
  onChoose,
  onRemove,
  onDrop,
  onActive,
}: {
  side: "earlier" | "newer";
  file: File | null;
  active: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onActive: (active: boolean) => void;
}) {
  const label = side === "earlier" ? "Earlier version" : "Newer version";
  const description = side === "earlier" ? "The baseline PDF" : "The PDF to compare against";

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChoose();
    }
  };

  return (
    <div
      {...styleProps(styles.uploadCard, active && styles.uploadCardActive, file && styles.uploadCardFilled)}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${file ? file.name : "choose a PDF"}`}
      onClick={onChoose}
      onKeyDown={handleKeyDown}
      onDragEnter={(event) => {
        event.preventDefault();
        onActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => onActive(false)}
      onDrop={onDrop}
    >
      <div>
        <div {...styleProps(styles.uploadTop)}>
          <div>
            <span {...styleProps(styles.uploadLabel)}>{label}</span>
            <h2 {...styleProps(styles.uploadTitle)}>{file ? "Ready to compare" : description}</h2>
          </div>
          <span {...styleProps(styles.uploadIcon)} aria-hidden="true">{file ? "✓" : "+"}</span>
        </div>
        {file ? (
          <div {...styleProps(styles.fileRow)}>
            <FileGlyph />
            <div {...styleProps(styles.fileDetails)}>
              <span {...styleProps(styles.fileName)} title={file.name}>{file.name}</span>
              <span {...styleProps(styles.fileMeta)}>{formatFileSize(file.size)} · PDF document</span>
            </div>
            <button
              {...styleProps(styles.fileRemove)}
              type="button"
              aria-label={`Remove ${label.toLowerCase()} file`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <p {...styleProps(styles.uploadHint)}>Drop a PDF here, or choose one from your device. Files never leave this browser.</p>
        )}
      </div>
      <span {...styleProps(styles.uploadAction)}>{file ? "Replace PDF" : "Choose PDF →"}</span>
    </div>
  );
}

function ThumbPlaceholder() {
  return (
    <div {...styleProps(styles.thumbPlaceholder)} aria-hidden="true">
      <span {...styleProps(styles.thumbLine)} />
      <span {...styleProps(styles.thumbLine, styles.thumbLineShort)} />
      <span {...styleProps(styles.thumbDiagram)} />
      <span {...styleProps(styles.thumbLine, styles.thumbLineShort)} />
    </div>
  );
}

function PaperFallback({ label }: { label: string }) {
  return (
    <div {...styleProps(styles.paperEmpty)}>
      <div>
        <span {...styleProps(styles.placeholderTitle)} aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}

function PagePreview({
  page,
  mode,
  zoom,
  swipe,
  blinkOn,
  selectedRegion,
  onRegionClick,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  zoom: number;
  swipe: number;
  blinkOn: boolean;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
}) {
  const before = page.beforeSrc;
  const after = page.afterSrc;
  const diff = page.diffSrc;
  const canShowImages = Boolean(before || after || diff);
  const renderImage = (source: string | undefined, alt: string, imageStyle: StyleXArg = styles.pageImage) =>
    source ? <img {...styleProps(imageStyle)} src={source} alt={alt} draggable={false} /> : <PaperFallback label="Preview is still rendering" />;

  const overlays = mode === "diff" && page.regions?.length ? (
    <>
      {page.regions.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-label={region.label ?? `${region.kind ?? "changed"} region`}
          title={region.label}
          {...styleProps(
            styles.changeOverlay,
            region.kind === "added" && styles.changeOverlayAdded,
            region.kind === "removed" && styles.changeOverlayRemoved,
            selectedRegion === region.id && styles.changeOverlayCurrent,
          )}
          onClick={() => onRegionClick(region)}
          style={getRegionStyle(region)}
        />
      ))}
    </>
  ) : null;

  if (!canShowImages) {
    return <div {...styleProps(styles.paper, zoomStyle(zoom))}><PaperFallback label={statusLabel(pageStatus(page))} /></div>;
  }

  if (mode === "side-by-side") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        <div {...styleProps(styles.sideBySide)}>
          <div {...styleProps(styles.sidePanel)}>{renderImage(before, "Earlier version of this page")}</div>
          <div {...styleProps(styles.sidePanel)}>{renderImage(after, "Newer version of this page")}</div>
        </div>
      </div>
    );
  }

  if (mode === "swipe") {
    return (
      <div {...styleProps(styles.paper, styles.swipeWrap, zoomStyle(zoom))}>
        {renderImage(before, "Earlier version of this page")}
        {after ? <img {...styleProps(styles.swipeNewer, swipeStyle(swipe))} src={after} alt="Newer version of this page" draggable={false} /> : null}
        <span {...styleProps(styles.swipeDivider)} style={{ left: `${swipe}%` }} aria-hidden="true" />
      </div>
    );
  }

  if (mode === "blink") {
    return (
      <div {...styleProps(styles.paper, zoomStyle(zoom))}>
        {renderImage(blinkOn ? after : before, blinkOn ? "Newer version of this page" : "Earlier version of this page")}
        <span {...styleProps(styles.blinkBadge)}>{blinkOn ? "Newer" : "Earlier"}</span>
      </div>
    );
  }

  if (mode === "earlier") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(before, "Earlier version of this page")}</div>;
  if (mode === "newer") return <div {...styleProps(styles.paper, zoomStyle(zoom))}>{renderImage(after, "Newer version of this page")}</div>;

  return (
    <div {...styleProps(styles.paper, zoomStyle(zoom))}>
      {diff ? renderImage(diff, "Visual diff of this page", styles.diffImage) : renderImage(before, "Earlier version of this page")}
      {!diff && page.status === "changed" ? (
        <div {...styleProps(styles.canvasCaption)}>
          <span {...styleProps(styles.captionDotAdded)} aria-hidden="true" />
          <span>Added</span>
          <span {...styleProps(styles.captionDotRemoved)} aria-hidden="true" />
          <span>Removed</span>
        </div>
      ) : null}
      {overlays}
    </div>
  );
}

function normalizeFile(file: File | undefined): File | null {
  if (!file) return null;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return file;
  return null;
}

export default function PdfDiffApp({ engine, initialComparison, onAnalytics }: PdfDiffAppProps) {
  const activeEngine = engine ?? lazyBrowserEngine;
  const [earlierFile, setEarlierFile] = useState<File | null>(null);
  const [newerFile, setNewerFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<DiffComparison | null>(initialComparison ?? null);
  const [phase, setPhase] = useState<"upload" | "loading" | "workspace">(initialComparison ? "workspace" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeDrop, setActiveDrop] = useState<"earlier" | "newer" | null>(null);
  const [mode, setMode] = useState<DiffViewMode>("diff");
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<number>(100);
  const [swipe, setSwipe] = useState(50);
  const [sensitivity, setSensitivity] = useState(28);
  const [alignment, setAlignment] = useState<AlignmentMode>("none");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [blinkOn, setBlinkOn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputEarlier = useRef<HTMLInputElement>(null);
  const inputNewer = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pages = useMemo(() => comparison?.pages ?? [], [comparison]);
  const currentPage = pages[pageIndex] ?? null;
  const changedPages = useMemo(() => pages.filter((page) => pageStatus(page) !== "same"), [pages]);
  const currentRegions = currentPage?.regions ?? [];
  const currentTextChanges = currentPage?.textChanges ?? [];
  const changedPercent = currentPage?.changedPercent ?? 0;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== "blink") return;
    const timer = window.setInterval(() => setBlinkOn((value) => !value), 720);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (phase !== "workspace") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.isContentEditable) return;
      const numberMode = viewModes.find((item) => item.shortcut === event.key);
      if (numberMode) {
        setMode(numberMode.id);
        onAnalytics?.({ name: "view_mode_used", mode: numberMode.id });
      } else if (event.key === "ArrowRight" || event.key === "j") {
        setPageIndex((index) => Math.min(index + 1, Math.max(0, pages.length - 1)));
      } else if (event.key === "ArrowLeft" || event.key === "k") {
        setPageIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Escape") {
        setSelectedRegion(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onAnalytics, pages.length, phase]);

  const setFile = useCallback((side: "earlier" | "newer", file: File | null) => {
    if (side === "earlier") setEarlierFile(file);
    else setNewerFile(file);
    setError(null);
    setComparison(null);
    setPhase("upload");
    setPageIndex(0);
  }, []);

  const chooseFile = (side: "earlier" | "newer") => {
    if (side === "earlier") inputEarlier.current?.click();
    else inputNewer.current?.click();
  };

  const handleInput = (side: "earlier" | "newer", event: ChangeEvent<HTMLInputElement>) => {
    const file = normalizeFile(event.target.files?.[0]);
    if (!file) {
      setError("Please choose a PDF file. Other file types are not supported.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF is over 150 MB. Try a smaller export to keep processing fast and private.");
      event.target.value = "";
      return;
    }
    setFile(side, file);
    event.target.value = "";
  };

  const handleDrop = (side: "earlier" | "newer", event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActiveDrop(null);
    const file = normalizeFile(event.dataTransfer.files?.[0]);
    if (!file) {
      setError("Please drop a PDF file. Other file types are not supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("That PDF is over 150 MB. Try a smaller export to keep processing fast and private.");
      return;
    }
    setFile(side, file);
  };

  const swapFiles = () => {
    setEarlierFile(newerFile);
    setNewerFile(earlierFile);
    if (comparison) {
      setComparison({ ...comparison, earlierName: comparison.newerName, newerName: comparison.earlierName });
    }
  };

  const runComparison = async () => {
    if (!earlierFile || !newerFile) return;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPhase("loading");
    setProgress(0);
    onAnalytics?.({ name: "comparison_started", earlierSizeBucket: sizeBucket(earlierFile.size), newerSizeBucket: sizeBucket(newerFile.size) });

    try {
      const result = await activeEngine.compare({
        earlier: earlierFile,
        newer: newerFile,
        options: { sensitivity, alignment },
        signal: abortController.signal,
        onProgress: ({ completed, total }) => setProgress(total ? Math.round((completed / total) * 100) : 0),
      });
      if (abortController.signal.aborted) return;
      setComparison(result);
      setPageIndex(0);
      setSelectedRegion(null);
      setPhase("workspace");
      setProgress(100);
      onAnalytics?.({ name: "comparison_completed", pageCount: result.pages.length, changedPageCount: result.pages.filter((page) => pageStatus(page) !== "same").length });
    } catch (comparisonError) {
      if (abortController.signal.aborted) return;
      const message = comparisonError instanceof Error ? comparisonError.message : "Unable to compare these PDFs.";
      setError(message);
      setPhase("upload");
      onAnalytics?.({ name: "comparison_failed", errorCode: "compare_failed" });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setEarlierFile(null);
    setNewerFile(null);
    setComparison(null);
    setError(null);
    setPhase("upload");
    setProgress(0);
    setPageIndex(0);
    setSelectedRegion(null);
  };

  const changeMode = (nextMode: DiffViewMode) => {
    setMode(nextMode);
    onAnalytics?.({ name: "view_mode_used", mode: nextMode });
  };

  const selectPage = (index: number) => {
    setPageIndex(index);
    setSelectedRegion(null);
  };

  const selectRegion = (region: DiffRegion) => setSelectedRegion(region.id);

  const goToNextChange = () => {
    if (!pages.length) return;
    const next = pages.findIndex((page, index) => index > pageIndex && pageStatus(page) !== "same");
    const fallback = pages.findIndex((page) => pageStatus(page) !== "same");
    setPageIndex(next >= 0 ? next : fallback >= 0 ? fallback : pageIndex);
    setSelectedRegion(null);
  };

  if (phase === "upload") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Runs locally in your browser</div>
          </header>
          <section {...styleProps(styles.intro)} aria-labelledby="upload-heading">
            <p {...styleProps(styles.eyebrow)}>Visual document comparison</p>
            <h1 id="upload-heading" {...styleProps(styles.headline)}>See every change.<br /><em>Miss nothing.</em></h1>
            <p {...styleProps(styles.introCopy)}>Compare drawings, schematics, and contracts page by page. Your files stay on this device from start to finish.</p>
            <div {...styleProps(styles.uploadGrid)}>
              <FileCard side="earlier" file={earlierFile} active={activeDrop === "earlier"} onChoose={() => chooseFile("earlier")} onRemove={() => setFile("earlier", null)} onActive={(active) => setActiveDrop(active ? "earlier" : null)} onDrop={(event) => handleDrop("earlier", event)} />
              <button {...styleProps(styles.swapUpload)} type="button" aria-label="Swap earlier and newer files" onClick={swapFiles}>↔</button>
              <FileCard side="newer" file={newerFile} active={activeDrop === "newer"} onChoose={() => chooseFile("newer")} onRemove={() => setFile("newer", null)} onActive={(active) => setActiveDrop(active ? "newer" : null)} onDrop={(event) => handleDrop("newer", event)} />
            </div>
            <input ref={inputEarlier} {...styleProps(styles.srOnly)} type="file" accept="application/pdf,.pdf" aria-label="Choose earlier PDF" onChange={(event) => handleInput("earlier", event)} />
            <input ref={inputNewer} {...styleProps(styles.srOnly)} type="file" accept="application/pdf,.pdf" aria-label="Choose newer PDF" onChange={(event) => handleInput("newer", event)} />
            <button {...styleProps(styles.compareButton)} type="button" disabled={!earlierFile || !newerFile} onClick={() => void runComparison()}>Compare PDFs <span aria-hidden="true">→</span></button>
            {error ? <div {...styleProps(styles.errorBox)} role="alert">{error}</div> : null}
            <p {...styleProps(styles.uploadFooter)}><span {...styleProps(styles.footerShield)} aria-hidden="true">♢</span> No uploads · no accounts · no document data collected</p>
          </section>
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main {...styleProps(styles.root)}>
        <div {...styleProps(styles.shell)}>
          <header {...styleProps(styles.topbar)}>
            <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
            <div {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Working locally</div>
          </header>
          <section {...styleProps(styles.loading)} aria-live="polite" aria-busy="true">
            <div {...styleProps(styles.loadingCard)}>
              <div {...styleProps(styles.loadingMark)} aria-hidden="true">◐</div>
              <h1 {...styleProps(styles.loadingTitle)}>Comparing your PDFs</h1>
              <p {...styleProps(styles.loadingCopy)}>Rendering pages and finding meaningful visual changes. Nothing is being uploaded.</p>
              <div {...styleProps(styles.progressTrack)}><div {...styleProps(styles.progressFill)} style={{ width: `${progress}%` }} /></div>
              <p {...styleProps(styles.fileMeta)}>{progress ? `${progress}% complete` : "Preparing pages…"}</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!comparison || !currentPage) return null;
  const status = pageStatus(currentPage);
  const pageCount = pages.length;
  const pageChangedCount = changedPages.length;

  return (
    <main {...styleProps(styles.root)}>
      <div {...styleProps(styles.shell)}>
        <header {...styleProps(styles.workspaceBar)}>
          <div {...styleProps(styles.logo)}><span {...styleProps(styles.logoMark)} aria-hidden="true">◐</span> pdfdiff</div>
          <div {...styleProps(styles.documentPair)} aria-label="Compared documents">
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>A</span><span {...styleProps(styles.documentChipName)} title={comparison.earlierName}>{comparison.earlierName}</span></div>
            <span {...styleProps(styles.pairArrow)} aria-hidden="true">↔</span>
            <div {...styleProps(styles.documentChip)}><span {...styleProps(styles.documentChipLabel)}>B</span><span {...styleProps(styles.documentChipName)} title={comparison.newerName}>{comparison.newerName}</span></div>
          </div>
          <div {...styleProps(styles.workspaceActions)}>
            <span {...styleProps(styles.privacyPill)}><span {...styleProps(styles.privacyDot)} aria-hidden="true" /> Local only</span>
            <button {...styleProps(styles.quietButton)} type="button" onClick={reset}>New comparison</button>
          </div>
        </header>
        <div {...styleProps(styles.busyBar)} aria-hidden="true"><div {...styleProps(styles.busyBarFill)} style={{ width: `${progress}%` }} /></div>
        <div {...styleProps(styles.workspaceMain)}>
          <aside {...styleProps(styles.pageRail)} aria-label="Pages">
            <h2 {...styleProps(styles.railHeading)}>Pages <span aria-hidden="true">·</span> {pageCount}</h2>
            {pages.map((page, index) => {
              const pageState = pageStatus(page);
              return (
                <button key={page.index ?? index} {...styleProps(styles.pageButton, index === pageIndex && styles.pageButtonCurrent)} type="button" aria-label={`Page ${index + 1}, ${statusLabel(pageState)}`} aria-current={index === pageIndex ? "page" : undefined} onClick={() => selectPage(index)}>
                  <div {...styleProps(styles.pageThumb)}>{page.beforeSrc || page.afterSrc ? <img {...styleProps(styles.pageThumbImage)} src={page.beforeSrc ?? page.afterSrc} alt="" draggable={false} /> : <ThumbPlaceholder />} </div>
                  <div {...styleProps(styles.pageNumber)}><span>{index + 1}</span><span {...styleProps(styles.pageStatus, pageState === "changed" && styles.pageStatusChanged, pageState === "added" && styles.pageStatusAdded, pageState === "removed" && styles.pageStatusRemoved)}>{statusSymbol(pageState)}</span></div>
                </button>
              );
            })}
          </aside>
          <section {...styleProps(styles.canvasColumn)} aria-label="PDF comparison">
            <div {...styleProps(styles.toolbar)}>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => selectPage(Math.max(0, pageIndex - 1))}>←</button>
                <span {...styleProps(styles.zoomLabel)}>{pageIndex + 1} / {pageCount}</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => selectPage(Math.min(pageCount - 1, pageIndex + 1))}>→</button>
              </div>
              <div {...styleProps(styles.modeGroup)} role="toolbar" aria-label="View mode">
                {viewModes.map((item) => <button key={item.id} {...styleProps(styles.modeButton, mode === item.id && styles.modeButtonCurrent)} type="button" aria-pressed={mode === item.id} title={`${item.label} (${item.shortcut})`} onClick={() => changeMode(item.id)}><span {...styleProps(styles.desktopOnly)}>{item.label}</span><span {...styleProps(styles.mobileOnly)}>{item.shortcut}</span></button>)}
              </div>
              <div {...styleProps(styles.toolbarGroup)}>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom out" disabled={zoom === zoomLevels[0]} onClick={() => setZoom((value) => zoomLevels[Math.max(0, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) - 1)] ?? 50)}>−</button>
                <span {...styleProps(styles.zoomLabel)}>{zoom}%</span>
                <button {...styleProps(styles.iconButton)} type="button" aria-label="Zoom in" disabled={zoom === zoomLevels[zoomLevels.length - 1]} onClick={() => setZoom((value) => zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(value as (typeof zoomLevels)[number]) + 1)] ?? 200)}>+</button>
              </div>
            </div>
            <div {...styleProps(styles.stage)}>
              <div {...styleProps(styles.stageCenter)}>
                <PagePreview page={currentPage} mode={mode} zoom={zoom} swipe={swipe} blinkOn={blinkOn} selectedRegion={selectedRegion} onRegionClick={selectRegion} />
              </div>
            </div>
            <div {...styleProps(styles.statusFooter)}>
              <span><span {...styleProps(styles.statusAccent)}>{status === "same" ? "No visual changes" : statusLabel(status)}</span> · page {pageIndex + 1}</span>
              <span>{alignment === "none" ? "Unaligned" : "Translation aligned"} · sensitivity {sensitivity}</span>
            </div>
          </section>
          <aside {...styleProps(styles.inspector)} aria-label="Change inspector">
            <h2 {...styleProps(styles.inspectorHeading)}>Change inspector</h2>
            <p {...styleProps(styles.inspectorSubheading)}>Review this page, then jump to the next changed page.</p>
            <div {...styleProps(styles.changeSummary)}>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed pages</span><strong {...styleProps(styles.statValue, pageChangedCount > 0 && styles.statValueWarm)}>{pageChangedCount}</strong></div>
              <div {...styleProps(styles.statCard)}><span {...styleProps(styles.statLabel)}>Changed area</span><strong {...styleProps(styles.statValue, changedPercent > 0 && styles.statValueWarm)}>{changedPercent ? `${changedPercent.toFixed(2)}%` : "—"}</strong></div>
            </div>
            <button {...styleProps(styles.compareButton)} type="button" onClick={goToNextChange}>Next changed page <span aria-hidden="true">→</span></button>
            <div {...styleProps(styles.inspectorSection)}>
              <div {...styleProps(styles.sectionLabel)}><span>Regions</span><span>{currentRegions.length}</span></div>
              {currentRegions.length ? (
                <div {...styleProps(styles.changeList)}>{currentRegions.map((region, index) => <button key={region.id} {...styleProps(styles.changeButton, selectedRegion === region.id && styles.changeButtonCurrent)} type="button" onClick={() => selectRegion(region)}><span {...styleProps(styles.changeDot, region.kind === "added" && styles.changeDotAdded, region.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{region.label ?? `${region.kind ?? "Changed"} region ${index + 1}`}</span><span {...styleProps(styles.changeCount)}>#{index + 1}</span></button>)}</div>
              ) : <div {...styleProps(styles.emptyChanges)}>{status === "same" ? "This page is identical at the current sensitivity." : "No grouped regions were returned for this page."}</div>}
            </div>
            {currentTextChanges.length ? <div {...styleProps(styles.inspectorSection)}><div {...styleProps(styles.sectionLabel)}><span>Text changes</span><span>{currentTextChanges.length}</span></div><div {...styleProps(styles.changeList)}>{currentTextChanges.slice(0, 6).map((change) => <button key={change.id} {...styleProps(styles.changeButton)} type="button" onClick={() => setSelectedRegion(change.id)}><span {...styleProps(styles.changeDot, change.kind === "added" && styles.changeDotAdded, change.kind === "removed" && styles.changeDotRemoved)} aria-hidden="true" /><span {...styleProps(styles.changeText)}>{change.text}</span></button>)}</div></div> : null}
            <div {...styleProps(styles.inspectorSection)}>
              <button {...styleProps(styles.quietButton)} type="button" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>{showSettings ? "Hide comparison settings" : "Comparison settings"}</button>
              {showSettings ? <div {...styleProps(styles.inspectorSection)}>
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="sensitivity">Sensitivity</label><span {...styleProps(styles.controlValue)}>{sensitivity}</span></div>
                <input id="sensitivity" {...styleProps(styles.range)} type="range" min="0" max="100" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
                <div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="alignment">Alignment</label><select id="alignment" {...styleProps(styles.select)} value={alignment} onChange={(event) => setAlignment(event.target.value as AlignmentMode)}><option value="none">None</option><option value="translation">Translation only</option></select></div>
                {mode === "swipe" ? <><div {...styleProps(styles.controlRow)}><label {...styleProps(styles.controlName)} htmlFor="swipe">Swipe position</label><span {...styleProps(styles.controlValue)}>{swipe}%</span></div><input id="swipe" {...styleProps(styles.range)} type="range" min="0" max="100" value={swipe} onChange={(event) => setSwipe(Number(event.target.value))} /></> : null}
              </div> : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export { PdfDiffApp };
