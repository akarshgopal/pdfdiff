import { CloudUpload, FileText, X } from "lucide-react";
import type { DragEvent } from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";
import { formatFileSize } from "../../lib/format";

type FileDropzoneProps = {
  label: string;
  description: string;
  file: File | null;
  active: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onActive: (active: boolean) => void;
};

function DropzonePrompt({ file }: Pick<FileDropzoneProps, "file">) {
  if (file) return <><FileText className="size-5" strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Selected file</span></>;
  return <><CloudUpload className="size-5" strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Upload file</span></>;
}

function FileDetails({ file, description }: Pick<FileDropzoneProps, "file" | "description">) {
  return <><span className="mt-2 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold tracking-[-0.02em] text-foreground" title={file?.name}>{file ? file.name : description}</span>{file ? <span className="mt-1 text-xs text-muted-foreground">{formatFileSize(file.size)} · PDF</span> : <><span className="mt-2 text-sm font-medium text-primary">Drop here or browse</span><span className="mt-1 text-xs text-muted-foreground">PDF only · up to 150 MB</span></>}</>;
}

function SelectedFileActions({ file, label, onRemove, onChoose }: Pick<FileDropzoneProps, "file" | "label" | "onRemove" | "onChoose">) {
  if (!file) return null;
  return <><Button variant="ghost" size="icon" className="absolute right-3 top-3 z-10 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Remove ${label.toLowerCase()} file`} onClick={onRemove}><X className="size-4" aria-hidden="true" /></Button><button type="button" className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-xs font-semibold text-primary hover:underline" onClick={onChoose}>Replace file</button></>;
}

export function FileDropzone({
  label,
  description,
  file,
  active,
  onChoose,
  onRemove,
  onDrop,
  onActive,
}: FileDropzoneProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-[248px] flex-col rounded-xl border border-dashed border-input bg-card p-3 transition-[border-color,background-color,box-shadow] duration-150",
        "hover:border-foreground/30 hover:bg-background",
        active && "border-primary bg-accent shadow-[0_0_0_4px_hsl(var(--primary)/.1)]",
        file && "border-solid border-success/60 bg-success/5",
      )}
      role="group"
      aria-label={`${label}: ${file ? file.name : description}`}
      onDragEnter={(event) => {
        event.preventDefault();
        onActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => onActive(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-0 bg-transparent px-5 py-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={onChoose}
      >
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full border border-border bg-muted text-primary">
          <DropzonePrompt file={file} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <FileDetails file={file} description={description} />
      </button>
      <SelectedFileActions file={file} label={label} onRemove={onRemove} onChoose={onChoose} />
    </div>
  );
}
