"use client";

import { useEffect, useId, useState } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import type { UxCopy } from "@/lib/ux-copy";
import {
  TOKEN_ICON_ACCEPT,
  validateTokenIcon,
  type TokenIconError,
} from "@/lib/token-icon-rules";

type Props = {
  copy: UxCopy;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  /** Existing icon (ipfs:// or https://), shown while no new file is picked. */
  currentImage?: string;
};

function errorLabel(copy: UxCopy, error: TokenIconError): string {
  switch (error) {
    case "type":
      return copy.tokenIconErrType;
    case "size":
      return copy.tokenIconErrSize;
    case "dimensions":
      return copy.tokenIconErrDimensions;
    default:
      return copy.tokenIconErrRead;
  }
}

function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (value: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => finish(null);
    image.src = url;
  });
}

/**
 * Shared icon picker for the token-launch form and the token page's "Change icon" panel.
 * It validates the file before handing it to the parent, so an invalid file never reaches the
 * upload route or a signed message.
 */
export function TokenIconUpload({ copy, file, onFile, disabled = false, currentImage }: Props) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<TokenIconError | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!next) return;
    const basic = validateTokenIcon({ type: next.type, size: next.size });
    if (!basic.ok) {
      setError(basic.error);
      onFile(null);
      return;
    }
    const dimensions = await readDimensions(next);
    if (!dimensions) {
      setError("read");
      onFile(null);
      return;
    }
    const full = validateTokenIcon({
      type: next.type,
      size: next.size,
      width: dimensions.width,
      height: dimensions.height,
    });
    if (!full.ok) {
      setError(full.error);
      onFile(null);
      return;
    }
    setError(null);
    onFile(next);
  };

  const shownImage = preview ?? currentImage ?? null;

  return (
    <div className="rounded-xl border border-line p-3" data-testid="token-icon-upload">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {preview ? (
            // Local object URL; AssetImage only accepts permanent http(s)/ipfs addresses.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-16 w-16 rounded-full border border-line object-cover" />
          ) : shownImage ? (
            <AssetImage src={shownImage} name={copy.tokenIconTitle} className="h-16 w-16" />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line bg-surface-2 text-xs text-ink-3">
              {copy.tokenIconTitle}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{copy.tokenIconTitle}</p>
          <p className="mt-1 text-xs text-ink-3">{copy.tokenIconHint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={`cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand hover:bg-surface-2 ${disabled ? "pointer-events-none opacity-40" : ""}`}
            >
              {file || currentImage ? copy.tokenIconChangeFile : copy.tokenIconChoose}
            </label>
            <input
              id={inputId}
              type="file"
              accept={TOKEN_ICON_ACCEPT}
              disabled={disabled}
              onChange={(event) => void pick(event)}
              className="sr-only"
              data-testid="token-icon-input"
            />
            {file ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  onFile(null);
                }}
                className="text-xs text-ink-3 underline disabled:opacity-40"
              >
                {copy.tokenIconRemove}
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-warm">
              {errorLabel(copy, error)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
