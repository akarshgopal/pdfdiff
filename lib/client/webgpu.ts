/** Minimal structural types keep WebGPU optional for browsers and TypeScript libs. */
export interface WebGpuDeviceLike {
  destroy?: () => void;
}

export interface WebGpuAdapterLike {
  requestDevice?: (descriptor?: unknown) => Promise<WebGpuDeviceLike>;
}

export interface WebGpuLike {
  requestAdapter: (options?: unknown) => Promise<WebGpuAdapterLike | null>;
}

export type WebGpuProbeReason =
  | "supported"
  | "unavailable"
  | "adapter-unavailable"
  | "device-unavailable"
  | "probe-failed";

export interface WebGpuCapability {
  readonly supported: boolean;
  /** True only when requestDevice also succeeded (if requested). */
  readonly usable: boolean;
  readonly reason: WebGpuProbeReason;
}

export interface WebGpuProbeOptions {
  /** Request a logical device to verify actual use, at a small setup cost. */
  readonly requestDevice?: boolean;
  /** Dependency injection for tests; browser callers normally omit this. */
  readonly gpu?: WebGpuLike;
}

function browserGpu(): WebGpuLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidate = (navigator as Navigator & { gpu?: WebGpuLike }).gpu;
  return candidate;
}

/**
 * Probe WebGPU without exposing adapter/vendor details or allocating a device
 * unless explicitly requested. Failure is represented as data so callers can
 * quietly fall back to the CPU worker.
 */
export async function probeWebGpu(options: WebGpuProbeOptions = {}): Promise<WebGpuCapability> {
  const gpu = options.gpu ?? browserGpu();
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return { supported: false, usable: false, reason: "unavailable" };
  }

  let adapter: WebGpuAdapterLike | null;
  try {
    adapter = await gpu.requestAdapter();
  } catch {
    return { supported: false, usable: false, reason: "probe-failed" };
  }
  if (!adapter) return { supported: false, usable: false, reason: "adapter-unavailable" };
  if (!options.requestDevice) return { supported: true, usable: true, reason: "supported" };
  if (typeof adapter.requestDevice !== "function") {
    return { supported: true, usable: false, reason: "device-unavailable" };
  }

  try {
    const device = await adapter.requestDevice();
    device?.destroy?.();
    return { supported: true, usable: true, reason: "supported" };
  } catch {
    return { supported: true, usable: false, reason: "device-unavailable" };
  }
}

export function isWebGpuSupported(capability: WebGpuCapability): boolean {
  return capability.supported && capability.usable;
}
