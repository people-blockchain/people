"use client";

import type { NftMediaCopy } from "@/lib/nft-media-copy";
import type { StageId, StageRow } from "./saveNftFiles";

const LABEL: Record<StageId, keyof NftMediaCopy> = {
  image: "stageUploadingImage",
  cover: "stageUploadingCover",
  video: "stageUploadingVideo",
  verify: "stageVerifyingVideo",
  metadata: "stageSavingMetadata",
};

const MARK = { pending: "○", active: "◔", done: "✓", failed: "✗" } as const;

/** Progress list for saving files; announced politely to assistive tech. */
export function NftStages({ copy, rows }: { copy: NftMediaCopy; rows: StageRow[] }) {
  if (rows.length === 0) return null;
  const statusText = { pending: copy.statusPending, active: copy.statusActive, done: copy.statusDone, failed: copy.statusFailed };
  return (
    <div data-testid="nft-stages" aria-live="polite" aria-label={copy.stageListLabel}>
      <ul className="space-y-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.id} data-status={row.status} className="flex items-start gap-2">
            <span aria-hidden className={row.status === "failed" ? "text-warm" : row.status === "done" ? "text-value" : "text-ink-3"}>
              {MARK[row.status]}
            </span>
            <span className="min-w-0 break-words text-ink-2">
              {String(copy[LABEL[row.id]])}
              {row.status === "active" && typeof row.percent === "number" ? ` ${row.percent}%` : ""}
              <span className="sr-only"> — {statusText[row.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
