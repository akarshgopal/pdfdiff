export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

/** Revision-coded PDF names differ at the end, so keep both ends of a long one visible. */
export function middleTruncate(text: string, max = 30): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
}
