export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function luminance(data: Uint8ClampedArray, offset: number): number {
  return data[offset]! * 0.299 + data[offset + 1]! * 0.587 + data[offset + 2]! * 0.114;
}
