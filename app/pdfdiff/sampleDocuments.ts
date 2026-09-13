const SAMPLE_PUBLIC_PREFIX = "/samples/";

export const SAMPLE_DOCUMENTS = [
  {
    id: "cad",
    label: "CAD",
    title: "Wheel hub drawing, rev A → B",
    earlier: { source: "cad/wheel-hub-rev-a.pdf", name: "wheel-hub-rev-a.pdf" },
    newer: { source: "cad/wheel-hub-rev-b.pdf", name: "wheel-hub-rev-b.pdf" },
  },
  {
    id: "contract",
    label: "Contract",
    title: "Work order, original → amended",
    earlier: { source: "contracts/work-order-original.pdf", name: "work-order-original.pdf" },
    newer: { source: "contracts/work-order-amended.pdf", name: "work-order-amended.pdf" },
  },
  {
    id: "datasheet",
    label: "Datasheet",
    title: "TI SN74LV126A, rev I → J",
    earlier: { source: "datasheets/ti-sn74lv126a-rev-i.pdf", name: "ti-sn74lv126a-rev-i.pdf" },
    newer: { source: "datasheets/ti-sn74lv126a-rev-j.pdf", name: "ti-sn74lv126a-rev-j.pdf" },
  },
] as const;

export type SampleId = (typeof SAMPLE_DOCUMENTS)[number]["id"];

export function samplePublicPath(source: string): string {
  return `${SAMPLE_PUBLIC_PREFIX}${source}`;
}

export function sampleDocument(id: SampleId) {
  const sample = SAMPLE_DOCUMENTS.find((item) => item.id === id);
  if (!sample) throw new Error(`Unknown sample: ${id}`);
  return sample;
}

function looksLikePdf(type: string, bytes: ArrayBuffer): boolean {
  if (/pdf/i.test(type)) return true;
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

async function fetchSampleFile(entry: { source: string; name: string }, signal?: AbortSignal): Promise<File> {
  const response = await fetch(samplePublicPath(entry.source), { signal });
  if (!response.ok) throw new Error(`Failed to load ${entry.name}`);
  const bytes = await response.arrayBuffer();
  if (!looksLikePdf(response.headers.get("content-type") ?? "", bytes)) {
    throw new Error(`Failed to load ${entry.name}`);
  }
  return new File([bytes], entry.name, { type: "application/pdf" });
}

export async function loadSamplePair(id: SampleId, signal?: AbortSignal): Promise<{ earlier: File; newer: File }> {
  const sample = sampleDocument(id);
  const [earlier, newer] = await Promise.all([
    fetchSampleFile(sample.earlier, signal),
    fetchSampleFile(sample.newer, signal),
  ]);
  return { earlier, newer };
}
