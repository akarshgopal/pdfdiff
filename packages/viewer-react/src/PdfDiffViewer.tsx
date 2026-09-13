import { useMemo } from "react";
import { styles, cx } from "./styles.js";
import type { PdfDiffViewerProps } from "./types.js";
import {
  HelpDialog,
  PageRail,
  PairingControls,
  PairingDialog,
  SettingsDialog,
  StatusFooter,
  ViewerToolbar,
  WorkspaceHeader,
} from "./ViewerChrome.js";
import { comparisonProgress } from "./summary.js";
import { canDownloadPageImage, downloadPageImage, downloadReport, reportForComparison } from "./export.js";
import { temporaryPairCue, toggleFullscreen } from "./viewer-utils.js";
import { DEFAULT_OVERLAY_STYLE, useViewerState } from "./useViewerState.js";
import { PagePreview } from "./PagePreviews.js";
import { PanZoomStage } from "./PanZoomStage.js";
import { ChangeNavigator } from "./ChangeNavigator.js";

export { DEFAULT_OVERLAY_STYLE };

export function PdfDiffViewer({
  comparison,
  processingProgress,
  headerActions,
  onNewComparison,
  defaultOverlay,
  onOverlayChange,
  matchPages,
  onMatchPagesChange,
}: PdfDiffViewerProps) {
  const viewer = useViewerState({ comparison, defaultOverlay, onOverlayChange });
  const {
    pages,
    pageIndex,
    mode,
    zoom,
    swipe,
    selectedRegion,
    overlay,
    settings,
    textFilter,
    modal,
    railCollapsed,
    isFullscreen,
    earlierPageCount,
    newerPageCount,
    pairComparisonPending,
    pairError,
    currentPage,
    previewPage,
    pair,
    pairKey,
    manualPair,
    changePair,
    hasPreviousPage,
    hasNextPage,
    selectPage,
    stepPage,
    changeMode,
    setZoom,
    setSwipe,
    setSelectedRegion,
    changeOverlay,
    setSettings,
    changeTextFilter,
    setModal,
    setRailCollapsed,
  } = viewer;
  const summary = useMemo(() => reportForComparison(comparison).totals, [comparison]);
  const progress = comparisonProgress(comparison.pages, processingProgress);
  if (!currentPage || !previewPage) return null;
  return (
    <section className={styles.viewerRoot} aria-label="PDF comparison workspace">
      <WorkspaceHeader
        comparison={comparison}
        summary={summary}
        processingProgress={progress}
        onNewComparison={onNewComparison}
        headerActions={headerActions}
      />
      <div
        className={cx(
          styles.workspaceMain,
          railCollapsed && styles.workspaceMainRailCollapsed,
          pages.length <= 1 && styles.workspaceMainSinglePage,
        )}
      >
        <PageRail
          onlyChanged={settings.onlyChanged}
          pages={pages}
          pageIndex={pageIndex}
          mode={mode}
          textFilter={textFilter}
          onSelectPage={selectPage}
          onOnlyChanged={(onlyChanged) => setSettings((current) => ({ ...current, onlyChanged }))}
          collapsed={railCollapsed}
          onCollapsedChange={setRailCollapsed}
        />
        <section className={styles.canvasColumn} aria-label="PDF comparison">
          <ViewerToolbar
            mode={mode}
            onModeChange={changeMode}
            textFilter={textFilter}
            onTextFilterChange={changeTextFilter}
            zoom={zoom}
            onZoomChange={setZoom}
            textUnavailable={previewPage.semantic?.textUndecodable}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onSettings={() => setModal("settings")}
            onHelp={() => setModal("help")}
            canExportImage={canDownloadPageImage(previewPage)}
            onExport={(choice) => {
              if (choice === "page-image") void downloadPageImage(comparison, previewPage, overlay);
              else downloadReport(comparison, choice);
            }}
            navigation={
              <div className={styles.toolbarNavigation} aria-label="Page navigation">
                <button
                  className={styles.quietButton}
                  type="button"
                  disabled={!hasPreviousPage}
                  onClick={() => stepPage(-1)}
                >
                  ← Previous page
                </button>
                <PairingControls
                  page={previewPage}
                  pageIndex={pageIndex}
                  manual={Boolean(manualPair)}
                  cue={manualPair && !pairComparisonPending ? temporaryPairCue(previewPage, pages) : null}
                  canChangePair={Boolean(comparison.comparePagePair)}
                  onChangePair={() => setModal("pairing")}
                  onReturnToDocument={() => selectPage(pageIndex)}
                />
                <button
                  className={styles.quietButton}
                  type="button"
                  disabled={!hasNextPage}
                  onClick={() => stepPage(1)}
                >
                  Next page →
                </button>
              </div>
            }
          />
          <PanZoomStage zoom={zoom} onZoomChange={setZoom} resetKey={`${mode}:${pairKey}`}>
            <PagePreview
              page={previewPage}
              mode={mode}
              swipe={swipe}
              overlay={overlay}
              showBoundingBoxes={settings.showBoundingBoxes}
              textFilter={textFilter}
              selectedRegion={selectedRegion}
              onRegionClick={(region) => setSelectedRegion(region.id)}
              onSelectChange={setSelectedRegion}
              onSwipeChange={setSwipe}
              pairComparisonPending={pairComparisonPending}
              pairError={pairError}
            />
          </PanZoomStage>
          <ChangeNavigator
            page={previewPage}
            mode={mode}
            textFilter={textFilter}
            selected={selectedRegion}
            onSelect={setSelectedRegion}
          />
          <StatusFooter processingProgress={progress} />
        </section>
      </div>
      {modal === "pairing" ? (
        <PairingDialog
          earlier={pair.earlier}
          newer={pair.newer}
          earlierCount={earlierPageCount}
          newerCount={newerPageCount}
          onApply={changePair}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === "settings" ? (
        <SettingsDialog
          overlay={overlay}
          onOverlayChange={changeOverlay}
          settings={settings}
          onSettingsChange={setSettings}
          matchPages={matchPages}
          onMatchPagesChange={onMatchPagesChange}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === "help" ? <HelpDialog onClose={() => setModal(null)} /> : null}
    </section>
  );
}
