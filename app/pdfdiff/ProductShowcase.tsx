import { useRef, useState } from "react";
import { useThemeMode } from "../../components/ui/theme-toggle";
import { showcaseViews, type ShowcaseView } from "./landing-content";
import { styles, styleProps } from "./styles";

/** Captured at 2x from a 1440x900 window, then cropped and scaled (tools/capture-screenshots.mjs). */
const SHOT_WIDTH = 2000;
const SHOT_HEIGHT = 1167;

function shotSource(view: ShowcaseView["id"], theme: "light" | "dark"): string {
  return `/shots/${view}-${theme}.webp`;
}

export function ProductShowcase() {
  const [active, setActive] = useState<ShowcaseView["id"]>("overlay");
  const theme = useThemeMode();
  const tabRefs = useRef(new Map<ShowcaseView["id"], HTMLButtonElement>());
  const view = showcaseViews.find((item) => item.id === active) ?? showcaseViews[0];

  const focusTab = (index: number) => {
    const next = showcaseViews[(index + showcaseViews.length) % showcaseViews.length];
    setActive(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <section {...styleProps(styles.showcase)} aria-labelledby="showcase-heading">
      <div {...styleProps(styles.sectionHeader)}>
        <p {...styleProps(styles.eyebrow)}>Inside the comparison</p>
        <h2 id="showcase-heading" {...styleProps(styles.sectionTitle)}>Review changes your way.</h2>
        <p {...styleProps(styles.sectionCopy)}>Switch between four views without losing your place.</p>
      </div>

      <div {...styleProps(styles.showcaseTabs)} role="tablist" aria-label="Comparison views">
        {showcaseViews.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              if (node) tabRefs.current.set(item.id, node);
              else tabRefs.current.delete(item.id);
            }}
            {...styleProps(styles.showcaseTab, item.id === active && styles.showcaseTabCurrent)}
            type="button"
            role="tab"
            id={`showcase-tab-${item.id}`}
            aria-selected={item.id === active}
            aria-controls={`showcase-panel-${item.id}`}
            tabIndex={item.id === active ? 0 : -1}
            onClick={() => setActive(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") focusTab(index + 1);
              else if (event.key === "ArrowLeft") focusTab(index - 1);
              else return;
              event.preventDefault();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <figure
        {...styleProps(styles.showcasePanel)}
        role="tabpanel"
        id={`showcase-panel-${view.id}`}
        aria-labelledby={`showcase-tab-${view.id}`}
        tabIndex={-1}
      >
        <div {...styleProps(styles.showcaseFrame)}>
          <img
            {...styleProps(styles.showcaseImage)}
            src={shotSource(view.id, theme)}
            width={SHOT_WIDTH}
            height={SHOT_HEIGHT}
            loading="lazy"
            decoding="async"
            alt={`${view.label} view of a PDF comparison in pdfdiff: ${view.source}.`}
          />
        </div>
        <figcaption {...styleProps(styles.showcaseCaption)}>
          <h3 {...styleProps(styles.showcaseCaptionTitle)}>{view.title}</h3>
          <p {...styleProps(styles.showcaseCaptionCopy)}>{view.copy}</p>
          <p {...styleProps(styles.showcaseCaptionSource)}>{view.source}</p>
        </figcaption>
      </figure>
    </section>
  );
}
