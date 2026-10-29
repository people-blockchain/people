"use client";

import type { NftMediaCopy } from "@/lib/nft-media-copy";
import type { NftKind } from "./saveNftFiles";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
const VIDEO_ACCEPT = "video/mp4,video/webm,.mp4,.webm";

const segment = (active: boolean) =>
  `flex-1 rounded-xl px-3 py-2 text-sm sm:flex-none ${active ? "bg-brand text-brand-ink" : "bg-surface-2"}`;

const fileBox =
  "mt-1 flex w-full min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand";

/** Visually hidden native input (keeps keyboard and screen-reader behaviour) with a localized button and file name. */
function FilePick({
  testId,
  accept,
  disabled,
  onChange,
  buttonLabel,
  fileName,
  emptyLabel,
}: {
  testId: string;
  accept: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  buttonLabel: string;
  fileName: string | null;
  emptyLabel: string;
}) {
  return (
    <span className={`${fileBox} ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="file" accept={accept} data-testid={testId} disabled={disabled} onChange={onChange} className="sr-only" />
      <span className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 font-medium text-ink">{buttonLabel}</span>
      <span className="min-w-0 break-all text-xs font-normal text-ink-3" dir="auto">
        {fileName ?? emptyLabel}
      </span>
    </span>
  );
}

type Props = {
  copy: NftMediaCopy;
  kind: NftKind;
  onKind: (kind: NftKind) => void;
  disabled: boolean;
  imageName: string | null;
  coverName: string | null;
  videoName: string | null;
  onImage: (file: File | null) => void;
  onCover: (file: File | null) => void;
  onVideo: (file: File | null) => void;
  imageUrl: string;
  onImageUrl: (value: string) => void;
};

/** Image/video switch and the file inputs for the chosen type. */
export function NftMediaPicker({
  copy,
  kind,
  onKind,
  disabled,
  imageName,
  coverName,
  videoName,
  onImage,
  onCover,
  onVideo,
  imageUrl,
  onImageUrl,
}: Props) {
  const pick = (handler: (file: File | null) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    handler(event.target.files?.[0] ?? null);
    // Allow choosing the same file again after an error.
    event.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div>
        <p id="nft-kind-label" className="text-sm font-medium text-ink">
          {copy.typeLabel}
        </p>
        <div role="radiogroup" aria-labelledby="nft-kind-label" className="mt-1 flex gap-2">
          {(["image", "video"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              data-testid={`nft-kind-${value}`}
              disabled={disabled}
              onClick={() => onKind(value)}
              className={`${segment(kind === value)} disabled:opacity-60`}
            >
              {value === "image" ? copy.typeImage : copy.typeVideo}
            </button>
          ))}
        </div>
      </div>

      {kind === "image" ? (
        <>
          <label className="block text-sm font-medium text-ink">
            {copy.imageFile}
            <FilePick testId="nft-image-input" accept={IMAGE_ACCEPT} disabled={disabled} onChange={pick(onImage)} buttonLabel={copy.chooseFile} fileName={imageName} emptyLabel={copy.noFile} />
            <span className="mt-1 block text-xs font-normal text-ink-3">{copy.imageFileHint}</span>
          </label>
          <label className="block text-sm font-medium text-ink">
            {copy.imageUrlLabel}
            <input
              value={imageUrl}
              onChange={(event) => onImageUrl(event.target.value)}
              disabled={disabled}
              dir="ltr"
              placeholder="https://… / ipfs://…"
              data-testid="nft-image-url"
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
            <span className="mt-1 block text-xs font-normal text-ink-3">{copy.imageUrlNote}</span>
          </label>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-ink">
            {copy.videoFile}
            <FilePick testId="nft-video-input" accept={VIDEO_ACCEPT} disabled={disabled} onChange={pick(onVideo)} buttonLabel={copy.chooseFile} fileName={videoName} emptyLabel={copy.noFile} />
            <span className="mt-1 block text-xs font-normal text-ink-3">{copy.videoFileHint}</span>
          </label>
          <label className="block text-sm font-medium text-ink">
            {copy.coverFile}
            <FilePick testId="nft-cover-input" accept={IMAGE_ACCEPT} disabled={disabled} onChange={pick(onCover)} buttonLabel={copy.chooseFile} fileName={coverName} emptyLabel={copy.noFile} />
            <span className="mt-1 block text-xs font-normal text-ink-3">{copy.coverHint}</span>
          </label>
        </>
      )}
    </div>
  );
}
