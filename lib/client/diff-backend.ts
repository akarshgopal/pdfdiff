/** A compact RGBA image representation shared by CPU and GPU backends. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface DiffBackendOptions {
  /** Color-distance threshold in the range 0..1. */
  readonly threshold?: number;
  /** Whether antialiased pixels should be included. */
  readonly includeAA?: boolean;
  readonly signal?: AbortSignal;
}

export interface DiffBackendResult {
  readonly width: number;
  readonly height: number;
  readonly changedPixels: number;
  /** One byte per pixel: 1 for changed, 0 for unchanged. */
  readonly changedMask: Uint8Array;
  /** RGBA overlay pixels. */
  readonly overlay: Uint8Array | Uint8ClampedArray;
}

/**
 * Backend-neutral contract. The first implementation can be pixelmatch in a
 * worker; a WebGPU implementation can satisfy the same contract later.
 */
export interface VisualDiffBackend {
  readonly kind: "cpu" | "webgpu";
  compare(
    earlier: RgbaImage,
    newer: RgbaImage,
    options?: DiffBackendOptions,
  ): Promise<DiffBackendResult>;
}
