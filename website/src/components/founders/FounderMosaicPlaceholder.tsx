"use client";

import type { FoundersLandingCopy } from "@/lib/founders-landing-content";
import { PersonAvatar } from "./founders-ui";

const TILES = 48;

/** Visual placeholder for the genesis founder-name mosaic; search is disabled until sealing. */
export function FounderMosaicPlaceholder({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-surface-2 p-3 sm:p-4" data-testid="founders-mosaic">
      <div
        className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 sm:gap-2 md:grid-cols-10 lg:grid-cols-12"
        aria-hidden="true"
      >
        {Array.from({ length: TILES }, (_, i) => (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-lg border border-line/60 bg-surface/80 shadow-[var(--elev-1)]"
          >
            <PersonAvatar index={i} className="h-6 w-6 opacity-80 sm:h-7 sm:w-7" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface/90 px-4 py-3">
        <label className="text-xs font-semibold text-ink-3" htmlFor="founders-mosaic-search">
          {copy.mosaicSearchLabel}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="founders-mosaic-search"
            type="search"
            disabled
            placeholder={copy.mosaicSearchPlaceholder}
            className="w-full cursor-not-allowed rounded-xl border border-line bg-canvas-2 px-3 py-2.5 text-sm text-ink-3 opacity-70"
            aria-describedby="founders-mosaic-search-hint"
          />
          <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-ink-3">{copy.mosaicSoon}</span>
        </div>
        <p id="founders-mosaic-search-hint" className="mt-2 text-xs text-ink-3">
          {copy.mosaicSearchHint}
        </p>
      </div>
    </div>
  );
}
