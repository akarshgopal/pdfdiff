import { CloudUpload, FileText, X } from "lucide-react";
import type { DragEvent } from "react";
import { Button } from "./button";
import { styleProps, ui } from "@pdfdiff/viewer-react/ui";
import { formatFileSize, middleTruncate } from "../../lib/format";

type FileDropzoneProps = {
  label: string;
  /** The newer file carries the accent, so which side is which reads at a glance. */
  accent?: boolean;
  file: File | null;
  active: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onActive: (active: boolean) => void;
};

function DropzonePrompt({ file }: Pick<FileDropzoneProps, "file">) {
  if (file)
    return (
      <>
        <FileText className="size-5" strokeWidth={1.8} aria-hidden="true" />
        <span className="sr-only">Selected file</span>
      </>
    );
  return (
    <>
      <CloudUpload className="size-5" strokeWidth={1.8} aria-hidden="true" />
      <span className="sr-only">Upload file</span>
    </>
  );
}

function FileDetails({ file }: Pick<FileDropzoneProps, "file">) {
  if (!file)
    return (
      <>
        <span className="mt-2 text-sm font-semibold text-primary">Drop here or browse</span>
        <span className="mt-1 text-xs text-muted-foreground">PDF · up to 150 MB</span>
      </>
    );
  return (
    <>
      <span className="mt-2 w-full truncate text-base font-semibold tracking-tight text-foreground" title={file.name}>
        {middleTruncate(file.name)}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
    </>
  );
}

function SelectedFileActions({
  file,
  label,
  onRemove,
  onChoose,
}: Pick<FileDropzoneProps, "file" | "label" | "onRemove" | "onChoose">) {
  if (!file) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 z-10 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={`Remove ${label.toLowerCase()} file`}
        onClick={onRemove}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <button
        type="button"
        className={
          styleProps(
            "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-sm text-xs font-semibold text-primary hover:underline",
            ui.focus,
          ).className
        }
        onClick={onChoose}
      >
        Replace file
      </button>
    </>
  );
}

export function FileDropzone({ label, accent, file, active, onChoose, onRemove, onDrop, onActive }: FileDropzoneProps) {
  return (
    <div
      className={
        styleProps(
          "relative flex min-h-[184px] min-w-0 flex-col rounded-xl border border-dashed border-input bg-card p-3 transition-colors duration-150",
          "hover:border-foreground/30 hover:bg-background",
          active && "border-primary bg-accent",
          file && (accent ? "border-solid border-primary/60 bg-primary/5" : "border-solid border-border bg-card"),
        ).className
      }
      role="group"
      aria-label={`${label} PDF${file ? `: ${file.name}` : ""}`}
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
        className={
          styleProps(
            "flex min-h-[160px] w-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-0 bg-transparent px-5 py-6 text-center",
            ui.focus,
          ).className
        }
        onClick={onChoose}
      >
        <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full border border-border bg-muted text-primary">
          <DropzonePrompt file={file} />
        </span>
        <span className={styleProps(ui.caps, accent && "text-primary").className}>{label}</span>
        <FileDetails file={file} />
      </button>
      <SelectedFileActions file={file} label={label} onRemove={onRemove} onChoose={onChoose} />
    </div>
  );
}
