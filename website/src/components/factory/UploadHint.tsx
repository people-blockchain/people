import type { UploadCopy } from "@/lib/upload-response";

/** One line under an image file input: supported formats and the size limit. */
export function UploadHint({ copy }: { copy: Pick<UploadCopy, "hint"> }) {
  return (
    <p className="text-xs text-ink-3" data-testid="upload-hint">
      {copy.hint}
    </p>
  );
}
