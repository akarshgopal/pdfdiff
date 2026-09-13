import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { styles, cx, type TailwindClass } from "./styles.js";
import type { DiffPage, DiffRegion, DiffSemanticOverlay, DiffViewMode, OverlayStyle, SourceSide } from "./types.js";
import { OverlayLayerStack } from "./OverlayLayers.js";
import {
  filterTextChanges,
  missingSelectableTextNotice,
  missingSideLabel,
  semanticSummary,
  textChangeMatchesFilter,
  textFilterShowsSide,
  type TextChangeFilter,
} from "./viewer-utils.js";

function getRegionStyle(region: DiffRegion): CSSProperties {
  return {
    left: `${Math.max(0, Math.min(100, region.x))}%`,
    top: `${Math.max(0, Math.min(100, region.y))}%`,
    width: `${Math.max(0.5, Math.min(100, region.width))}%`,
    height: `${Math.max(0.5, Math.min(100, region.height))}%`,
  };
}

/** A label means the page is genuinely absent; without one the page is still rendering. */
function PaperFallback({ label }: { label?: string }) {
  if (label) return <div className={styles.paperEmpty}>{label}</div>;
  return (
    <div className={styles.paperEmpty} role="status" aria-label="Preview is still rendering">
      <div className={styles.paperSkeleton} aria-hidden="true">
        <span className={styles.paperSkeletonLine} />
        <span className={cx(styles.paperSkeletonLine, styles.paperSkeletonLineShort)} />
        <span className={styles.paperSkeletonBlock} />
        <span className={styles.paperSkeletonLine} />
        <span className={cx(styles.paperSkeletonLine, styles.paperSkeletonLineShort)} />
      </div>
    </div>
  );
}

function CanvasNotice({ pending, error }: { pending: boolean; error: string | null }) {
  if (!pending && !error) return null;
  return (
    <div
      className={cx(styles.canvasNotice, Boolean(error) && styles.canvasNoticeError)}
      role="status"
      aria-live="polite"
    >
      {error ?? "Comparing…"}
    </div>
  );
}

function PageImage({
  source,
  alt,
  imageStyle = styles.pageImage,
  missingLabel,
}: {
  source?: string;
  alt: string;
  imageStyle?: TailwindClass;
  missingLabel?: string;
}) {
  return source ? (
    <img className={cx(imageStyle)} src={source} alt={alt} draggable={false} />
  ) : (
    <PaperFallback label={missingLabel} />
  );
}

function semanticPolygonPoints(quad: ReadonlyArray<{ x: number; y: number }>): string {
  return quad.map((point) => `${point.x},${point.y}`).join(" ");
}

function SemanticNativePane({
  side,
  source,
  overlays,
  selectedRegion,
  showHighlights,
  onSelectChange,
  missingLabel,
}: {
  side: SourceSide;
  source?: string;
  overlays: readonly DiffSemanticOverlay[];
  selectedRegion: string | null;
  showHighlights: boolean;
  onSelectChange: (id: string) => void;
  missingLabel?: string;
}) {
  const label = side === "earlier" ? "Earlier" : "Newer";
  return (
    <article className={styles.semanticColumn} aria-label={`${label} native PDF page`}>
      <header className={styles.semanticHeader}>
        <span>{label}</span>
      </header>
      <div className={styles.semanticViewport}>
        {source ? (
          <img
            className={styles.semanticPageImage}
            src={source}
            alt={`${label} version of this page`}
            draggable={false}
          />
        ) : (
          <PaperFallback label={missingLabel} />
        )}
        {source && showHighlights && overlays.length ? (
          <svg
            className={styles.semanticOverlay}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label={`${label} semantic text changes`}
          >
            {overlays.flatMap((overlay) =>
              overlay.quads.map((quad, index) => (
                <polygon
                  key={`${overlay.id}-${index}`}
                  className={cx(
                    styles.semanticOverlayPolygon,
                    overlay.kind === "added" && styles.semanticOverlayAdded,
                    overlay.kind === "removed" && styles.semanticOverlayRemoved,
                    overlay.kind === "changed" && styles.semanticOverlayChanged,
                    selectedRegion === overlay.id && styles.semanticOverlayCurrent,
                  )}
                  points={semanticPolygonPoints(quad)}
                  data-semantic-change-id={overlay.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${overlay.kind} text: ${overlay.text}`}
                  onClick={() => onSelectChange(overlay.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectChange(overlay.id);
                    }
                  }}
                >
                  <title>{overlay.text}</title>
                </polygon>
              )),
            )}
          </svg>
        ) : null}
      </div>
    </article>
  );
}

const semanticLegendKeys = [
  { kind: "removed" as const, label: "Removed", dot: styles.semanticLegendRemoved },
  { kind: "added" as const, label: "Added", dot: styles.semanticLegendAdded },
  { kind: "changed" as const, label: "Changed", dot: styles.semanticLegendChanged },
];

function SemanticPdfPreview({
  page,
  pending,
  error,
  selectedRegion,
  showHighlights,
  textFilter,
  onSelectChange,
}: {
  page: DiffPage;
  pending: boolean;
  error: string | null;
  selectedRegion: string | null;
  showHighlights: boolean;
  textFilter: TextChangeFilter;
  onSelectChange: (id: string) => void;
}) {
  const summary = semanticSummary(page.semantic, textFilter);
  const missingText = missingSelectableTextNotice(page);
  const waiting = pending || Boolean(error);
  const beforeOverlays = filterTextChanges(page.semanticBeforeOverlays ?? [], textFilter);
  const afterOverlays = filterTextChanges(page.semanticAfterOverlays ?? [], textFilter);
  const showEarlier = textFilterShowsSide(textFilter, "earlier");
  const showNewer = textFilterShowsSide(textFilter, "newer");
  const bothSides = showEarlier && showNewer;
  const legendKeys = semanticLegendKeys.filter((item) => textChangeMatchesFilter(item.kind, textFilter));
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRegion || !showHighlights) return;
    const escapedId =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedRegion) : selectedRegion.replace(/"/g, '\\"');
    previewRef.current
      ?.querySelector<SVGPolygonElement>(`[data-semantic-change-id="${escapedId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [selectedRegion, showHighlights]);

  return (
    <div ref={previewRef} className={cx(styles.paper, bothSides && styles.paperTwoUp, styles.semanticPaper)}>
      <CanvasNotice pending={pending} error={error} />
      {!waiting ? (
        <>
          {summary.status || summary.detail ? (
            <div className={styles.semanticSummary}>
              {summary.status ? <span>{summary.status}</span> : null}
              {summary.detail ? <span>{summary.detail}</span> : null}
            </div>
          ) : null}
          <div className={styles.semanticLegend}>
            {legendKeys.map((item) => (
              <span key={item.kind}>
                <i className={cx(styles.semanticLegendDot, item.dot)} />
                {item.label}
              </span>
            ))}
            {textFilter === "all" ? (
              <span className={styles.semanticLegendNote}>Original PDF rendering · anchored highlights</span>
            ) : null}
          </div>
        </>
      ) : null}
      <div className={cx(styles.semanticGrid, !bothSides && styles.semanticGridSingle)}>
        {showEarlier ? (
          <SemanticNativePane
            side="earlier"
            source={page.beforeSrc}
            overlays={beforeOverlays}
            selectedRegion={selectedRegion}
            showHighlights={showHighlights}
            onSelectChange={onSelectChange}
            missingLabel={missingSideLabel(page, "earlier")}
          />
        ) : null}
        {showNewer ? (
          <SemanticNativePane
            side="newer"
            source={page.afterSrc}
            overlays={afterOverlays}
            selectedRegion={selectedRegion}
            showHighlights={showHighlights}
            onSelectChange={onSelectChange}
            missingLabel={missingSideLabel(page, "newer")}
          />
        ) : null}
      </div>
      {missingText ? (
        <div className={styles.semanticNoText}>
          <strong>{missingText.title}. </strong>
          <span>{missingText.detail}</span>
        </div>
      ) : null}
    </div>
  );
}

function SwipePreview({
  before,
  after,
  swipe,
  onSwipeChange,
  pending,
  error,
}: {
  before?: string;
  after?: string;
  swipe: number;
  onSwipeChange: (value: number) => void;
  pending: boolean;
  error: string | null;
}) {
  const setSwipeFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const paper = event.currentTarget.parentElement;
    if (!paper) return;
    const bounds = paper.getBoundingClientRect();
    onSwipeChange(Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))));
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSwipeFromPointer(event);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    setSwipeFromPointer(event);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, swipe - step)
        : event.key === "ArrowRight"
          ? Math.min(100, swipe + step)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 100
              : null;
    if (next === null) return;
    event.preventDefault();
    onSwipeChange(next);
  };
  const sizingSource = before ?? after;
  return (
    <div className={cx(styles.paper, styles.swipeWrap)}>
      {sizingSource ? (
        <img className={styles.swipeSizer} src={sizingSource} alt="" aria-hidden="true" draggable={false} />
      ) : (
        <PaperFallback />
      )}
      {before ? (
        <div className={styles.swipeLayer} style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
          <img className={styles.swipeLayerImage} src={before} alt="Earlier version of this page" draggable={false} />
        </div>
      ) : null}
      {after ? (
        <div className={styles.swipeLayer} style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}>
          <img className={styles.swipeLayerImage} src={after} alt="Newer version of this page" draggable={false} />
        </div>
      ) : null}
      <div
        className={styles.swipeHandle}
        style={{ left: `${swipe}%` }}
        role="slider"
        aria-label="Swipe position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={swipe}
        aria-valuetext={`${swipe}%`}
        aria-disabled={pending || Boolean(error)}
        tabIndex={pending || error ? -1 : 0}
        onKeyDown={handleKeyDown}
        onPointerDown={pending || error ? undefined : handlePointerDown}
        onPointerMove={pending || error ? undefined : handlePointerMove}
        onPointerUp={pending || error ? undefined : handlePointerEnd}
        onPointerCancel={pending || error ? undefined : handlePointerEnd}
      >
        <span className={styles.swipeDivider} aria-hidden="true" />
      </div>
      <CanvasNotice pending={pending} error={error} />
    </div>
  );
}

export function PagePreview({
  page,
  mode,
  swipe,
  overlay,
  showBoundingBoxes,
  textFilter,
  selectedRegion,
  onRegionClick,
  onSelectChange,
  onSwipeChange,
  pairComparisonPending,
  pairError,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  swipe: number;
  overlay: OverlayStyle;
  showBoundingBoxes: boolean;
  textFilter: TextChangeFilter;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
  onSelectChange: (id: string) => void;
  onSwipeChange: (value: number) => void;
  pairComparisonPending: boolean;
  pairError: string | null;
}) {
  const before = page.beforeSrc;
  const after = page.afterSrc;
  const diff = page.diffSrc;
  if (mode === "semantic-text")
    return (
      <SemanticPdfPreview
        page={page}
        pending={pairComparisonPending}
        error={pairError}
        selectedRegion={selectedRegion}
        showHighlights
        textFilter={textFilter}
        onSelectChange={onSelectChange}
      />
    );

  if (mode === "side-by-side")
    return (
      <div className={cx(styles.paper, styles.paperTwoUp)}>
        <CanvasNotice pending={pairComparisonPending} error={pairError} />
        <div className={styles.sideBySide}>
          <div className={styles.sidePanel}>
            <PageImage
              source={before}
              alt="Earlier version of this page"
              missingLabel={missingSideLabel(page, "earlier")}
            />
          </div>
          <div className={styles.sidePanel}>
            <PageImage source={after} alt="Newer version of this page" missingLabel={missingSideLabel(page, "newer")} />
          </div>
        </div>
      </div>
    );
  if (mode === "swipe")
    return (
      <SwipePreview
        before={before}
        after={after}
        swipe={swipe}
        onSwipeChange={onSwipeChange}
        pending={pairComparisonPending}
        error={pairError}
      />
    );
  return (
    <DiffPreview
      page={page}
      source={diff ?? before}
      hasDiff={Boolean(diff)}
      overlay={overlay}
      showBoundingBoxes={showBoundingBoxes}
      selectedRegion={selectedRegion}
      onRegionClick={onRegionClick}
      pending={pairComparisonPending}
      error={pairError}
    />
  );
}

function DiffPreview({
  page,
  source,
  hasDiff,
  overlay,
  showBoundingBoxes,
  selectedRegion,
  onRegionClick,
  pending,
  error,
}: {
  page: DiffPage;
  source?: string;
  hasDiff: boolean;
  overlay: OverlayStyle;
  showBoundingBoxes: boolean;
  selectedRegion: string | null;
  onRegionClick: (region: DiffRegion) => void;
  pending: boolean;
  error: string | null;
}) {
  const regions = (page.regions ?? []).filter((region) => showBoundingBoxes || region.id === selectedRegion);
  return (
    <div className={styles.paper}>
      {page.layers ? (
        <OverlayLayerStack page={page} overlay={overlay} alt="Visual diff of this page" />
      ) : (
        <PageImage
          source={source}
          alt={hasDiff ? "Visual diff of this page" : "Earlier version of this page"}
          imageStyle={hasDiff ? styles.diffImage : styles.pageImage}
        />
      )}
      <CanvasNotice pending={pending} error={error} />
      {page.status === "changed" ? (
        <div className={styles.changeOverlayLegend} aria-label="Overlay colours">
          <span className={styles.changeOverlayKey}>
            <i className={styles.changeOverlayDot} style={{ backgroundColor: overlay.addedColor }} />
            Added
          </span>
          <span className={styles.changeOverlayKey}>
            <i className={styles.changeOverlayDot} style={{ backgroundColor: overlay.removedColor }} />
            Removed
          </span>
          <span className={styles.changeOverlayKey}>
            <i className={styles.changeOverlayDot} style={{ backgroundColor: overlay.modifiedColor }} />
            Modified
          </span>
        </div>
      ) : null}
      {regions.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-label={region.label ?? `${region.kind ?? "changed"} region`}
          title={region.label}
          className={cx(
            styles.changeOverlay,
            region.kind === "added" && styles.changeOverlayAdded,
            region.kind === "removed" && styles.changeOverlayRemoved,
            selectedRegion === region.id && styles.changeOverlayCurrent,
          )}
          onClick={() => onRegionClick(region)}
          style={getRegionStyle(region)}
        />
      ))}
    </div>
  );
}
