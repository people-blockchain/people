/* eslint-disable @next/next/no-img-element -- previews are user-chosen files and stored gateway addresses */
"use client";

import type { NftMediaCopy } from "@/lib/nft-media-copy";
import type { NftKind } from "./saveNftFiles";

type Props = {
  copy: NftMediaCopy;
  kind: NftKind;
  /** Picture (image kind) or cover (video kind): a local object URL before saving, the stored copy after. */
  imageSrc: string | null;
  /** Video source: a local object URL before saving, the stored gateway address after. */
  videoSrc: string | null;
  stored: boolean;
  isSvg: boolean;
  name: string;
  description: string;
};

/**
 * Display-only preview. SVG is shown through `<img>` only (never inlined into the page), the
 * video has native controls and never autoplays. Name and description are plain text.
 */
export function NftPreview({ copy, kind, imageSrc, videoSrc, stored, isSvg, name, description }: Props) {
  const empty = !imageSrc && !videoSrc;
  return (
    <section aria-labelledby="nft-preview-title" className="rounded-2xl border border-line bg-surface p-4" data-testid="nft-preview">
      <h2 id="nft-preview-title" className="text-sm font-semibold text-ink">
        {copy.previewTitle}
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl bg-surface-2">
        {kind === "video" && videoSrc ? (
          <video
            key={videoSrc}
            controls
            playsInline
            preload={stored ? "none" : "metadata"}
            poster={imageSrc ?? undefined}
            src={videoSrc}
            data-testid="nft-preview-video"
            className="block max-h-[60vh] w-full"
          />
        ) : imageSrc ? (
          <img src={imageSrc} alt={name || copy.previewTitle} data-testid="nft-preview-image" className="mx-auto block max-h-[60vh] w-full object-contain" />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-ink-3">{copy.previewEmpty}</p>
        )}
      </div>
      {!empty ? (
        <div className="mt-3 space-y-1">
          {name ? <p className="break-words font-semibold text-ink">{name}</p> : null}
          {description ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{description}</p> : null}
          {stored ? <p className="text-xs text-ink-3">{copy.previewStored}</p> : null}
          {isSvg ? <p className="text-xs text-ink-3">{copy.svgCleanNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
