import type {
  DurationBucket,
  FileSizeBucket,
  PageCountBucket,
} from "./document-metadata";

export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export type ViewMode = "overlay" | "side-by-side" | "swipe" | "blink" | "earlier" | "newer";

export type AnalyticsErrorCode =
  | "cancelled"
  | "password-required"
  | "unsupported"
  | "file-too-large"
  | "memory-limit"
  | "render"
  | "comparison"
  | "unknown";

/**
 * Fixed-schema events. No event carries document names, text, hashes, pixels,
 * exact sizes, exact page counts, or a user/session identifier.
 */
export type AnalyticsEvent =
  | { name: "app_loaded" }
  | { name: "comparison_started"; pageBucket: PageCountBucket; sizeBucket: FileSizeBucket }
  | { name: "comparison_completed"; durationBucket: DurationBucket; pageBucket: PageCountBucket }
  | { name: "view_mode_used"; mode: ViewMode }
  | { name: "comparison_failed"; errorCode: AnalyticsErrorCode };

export interface AnalyticsBatch {
  readonly v: typeof ANALYTICS_SCHEMA_VERSION;
  readonly events: readonly AnalyticsEvent[];
}

export type AnalyticsTransport = (endpoint: string, body: string) => Promise<void>;

export interface PrivacyAnalyticsOptions {
  /** Explicit opt-in. Defaults to false, even if an endpoint is supplied. */
  enabled?: boolean;
  /** No endpoint is configured by default, making the helper a no-op. */
  endpoint?: string;
  /** Keep the in-memory queue bounded while a network request is pending. */
  maxQueueSize?: number;
  /** Flush after each event. Defaults to true once analytics is explicitly enabled. */
  autoFlush?: boolean;
  /** Respect the browser's Do Not Track preference. Defaults to true. */
  respectDoNotTrack?: boolean;
  /** Injectable transport for tests or a platform-specific beacon implementation. */
  transport?: AnalyticsTransport;
}

export interface PrivacyAnalytics {
  readonly enabled: boolean;
  readonly endpoint: string | undefined;
  readonly queueSize: number;
  track(event: AnalyticsEvent): boolean;
  flush(): Promise<void>;
  clear(): void;
}

const VIEW_MODES: readonly ViewMode[] = ["overlay", "side-by-side", "swipe", "blink", "earlier", "newer"];
const ERROR_CODES: readonly AnalyticsErrorCode[] = [
  "cancelled",
  "password-required",
  "unsupported",
  "file-too-large",
  "memory-limit",
  "render",
  "comparison",
  "unknown",
];
const PAGE_BUCKETS: readonly PageCountBucket[] = ["0", "1-5", "6-20", "21-50", "51-100", "101+"];
const SIZE_BUCKETS: readonly FileSizeBucket[] = ["0-1mb", "1-10mb", "10-50mb", "50-100mb", "100mb+"];
const DURATION_BUCKETS: readonly DurationBucket[] = ["under-1s", "1-5s", "5-15s", "15-60s", "60s+"];

function isStringIn<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/**
 * Rebuild an event from its allowlisted fields. This protects the endpoint
 * even when an event originated in JavaScript rather than typed TypeScript.
 */
export function sanitizeAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  switch (record.name) {
    case "app_loaded":
      return { name: "app_loaded" };
    case "comparison_started":
      return isStringIn(record.pageBucket, PAGE_BUCKETS) && isStringIn(record.sizeBucket, SIZE_BUCKETS)
        ? { name: "comparison_started", pageBucket: record.pageBucket, sizeBucket: record.sizeBucket }
        : null;
    case "comparison_completed":
      return isStringIn(record.durationBucket, DURATION_BUCKETS) && isStringIn(record.pageBucket, PAGE_BUCKETS)
        ? { name: "comparison_completed", durationBucket: record.durationBucket, pageBucket: record.pageBucket }
        : null;
    case "view_mode_used":
      return isStringIn(record.mode, VIEW_MODES) ? { name: "view_mode_used", mode: record.mode } : null;
    case "comparison_failed":
      return isStringIn(record.errorCode, ERROR_CODES)
        ? { name: "comparison_failed", errorCode: record.errorCode }
        : null;
    default:
      return null;
  }
}

function hasDoNotTrackPreference(): boolean {
  if (typeof navigator === "undefined") return false;
  const value = navigator.doNotTrack;
  return value === "1" || value === "yes" || value === "true";
}

function normalizeEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint?.trim()) return undefined;
  try {
    const base = typeof location === "undefined" ? "http://localhost" : location.origin;
    const parsed = new URL(endpoint, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function sendWithFetch(endpoint: string, body: string): Promise<void> {
  if (typeof fetch !== "function") throw new Error("Fetch is unavailable.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "omit",
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}.`);
}

/**
 * Create an opt-in, memory-only analytics queue. The default instance does
 * nothing: no endpoint, no persistence, no cookies, and no network request.
 */
export function createPrivacyAnalytics(options: PrivacyAnalyticsOptions = {}): PrivacyAnalytics {
  const endpoint = normalizeEndpoint(options.endpoint);
  const respectsDoNotTrack = options.respectDoNotTrack !== false;
  const enabled = options.enabled === true && !!endpoint && !(respectsDoNotTrack && hasDoNotTrackPreference());
  const maxQueueSize = Math.max(1, Math.min(100, Math.floor(options.maxQueueSize ?? 20)));
  const autoFlush = options.autoFlush ?? true;
  const transport = options.transport ?? sendWithFetch;
  const queue: AnalyticsEvent[] = [];
  let inFlight: Promise<void> | undefined;

  const flush = async (): Promise<void> => {
    if (!enabled || queue.length === 0) return;
    if (inFlight) return inFlight;

    const events = queue.splice(0, queue.length);
    const body = JSON.stringify({ v: ANALYTICS_SCHEMA_VERSION, events } satisfies AnalyticsBatch);
    inFlight = transport(endpoint as string, body)
      .catch((error: unknown) => {
        queue.unshift(...events.slice(-maxQueueSize));
        throw error;
      })
      .finally(() => {
        inFlight = undefined;
        if (autoFlush && queue.length > 0) void flush().catch(() => undefined);
      });

    return inFlight;
  };

  return {
    get enabled() {
      return enabled;
    },
    endpoint,
    get queueSize() {
      return queue.length;
    },
    track(event: AnalyticsEvent): boolean {
      if (!enabled) return false;
      const safeEvent = sanitizeAnalyticsEvent(event);
      if (!safeEvent) return false;
      if (queue.length >= maxQueueSize) queue.shift();
      queue.push(safeEvent);
      if (autoFlush) void flush().catch(() => undefined);
      return true;
    },
    flush,
    clear() {
      queue.length = 0;
    },
  };
}
