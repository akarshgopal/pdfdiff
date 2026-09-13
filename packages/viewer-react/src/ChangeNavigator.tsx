import { styles, ui } from "./styles.js";
import type { DiffPage, DiffViewMode } from "./types.js";
import { changeWalkerLabel, pageChanges, type TextChangeFilter } from "./viewer-utils.js";

export function ChangeNavigator({
  page,
  mode,
  textFilter,
  selected,
  onSelect,
}: {
  page: DiffPage;
  mode: DiffViewMode;
  textFilter: TextChangeFilter;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const changes = pageChanges(page, mode, textFilter);
  const index = changes.findIndex((change) => change.id === selected);
  // Only pixel regions carry geometry, so the close-up is offered when the
  // selected change happens to be one.
  const region = page.regions?.find((item) => item.id === selected);
  if (!changes.length) return null;
  const width = page.width ?? 100,
    height = page.height ?? 100;
  const x = region ? (Math.max(0, region.x - 2) * width) / 100 : 0;
  const y = region ? (Math.max(0, region.y - 2) * height) / 100 : 0;
  const cropWidth = region ? Math.min(width - x, ((region.width + 4) * width) / 100) : width;
  const cropHeight = region ? Math.min(height - y, ((region.height + 4) * height) / 100) : height;
  return (
    <section className={styles.changeBar} aria-label="Change navigation">
      <button
        className={styles.primaryButton}
        type="button"
        disabled={index <= 0}
        onClick={() => onSelect(changes[index - 1]!.id)}
      >
        ← Previous change
      </button>
      <span className={styles.changeCount} aria-live="polite">
        {changeWalkerLabel(changes.length, index, mode)}
      </span>
      <button
        className={styles.primaryButton}
        type="button"
        disabled={index >= changes.length - 1}
        onClick={() => onSelect(changes[index + 1]!.id)}
      >
        Next change →
      </button>
      {index >= 0 ? (
        <button className={styles.quietButton} type="button" onClick={() => onSelect(null)}>
          Clear selection
        </button>
      ) : null}
      {region ? (
        <div className={styles.changeCrops}>
          {(
            [
              ["Earlier", page.beforeSrc],
              ["Newer", page.afterSrc],
            ] as const
          ).map(([label, source]) => (
            <figure key={label} className="min-w-0">
              <figcaption className={`${ui.caps} mb-1`}>{label}</figcaption>
              {source ? (
                <svg
                  className="h-32 w-full rounded-lg border border-border bg-background"
                  viewBox={`${x} ${y} ${cropWidth} ${cropHeight}`}
                  role="img"
                  aria-label={`${label} selected area`}
                >
                  <image href={source} width={width} height={height} />
                </svg>
              ) : (
                <p className="text-xs text-muted-foreground">No {label.toLowerCase()} page</p>
              )}
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
