"use client";

import { V2_PHASE_NAMES } from "@/lib/sale/v2/constants";
import type { V2PhaseView } from "@/lib/sale/v2/logic";
import type { BuyCopy } from "@/lib/buy-content";

export function V2PhaseBanner({
  view,
  copy,
}: {
  view: V2PhaseView;
  copy: BuyCopy["v2"]["banner"];
}) {
  // Launch week and the open sale have the same rules (verified buyers only), so they share copy.
  const key =
    V2_PHASE_NAMES[view.phase] === "whitelist"
      ? "open"
      : V2_PHASE_NAMES[view.phase];
  const title =
    key === "open"
      ? copy.openTitle
      : key === "expired"
        ? copy.expiredTitle
        : key === "graduated"
          ? copy.graduatedTitle
          : copy.notOpenTitle;
  const body =
    key === "open"
      ? copy.openBody
      : key === "not-open"
        ? copy.notOpenBody
        : copy.closedBody;

  return (
    <div
      className="rounded-2xl border border-brand/40 bg-brand/5 px-4 py-3 text-sm text-ink"
      data-testid="v2-phase-banner"
      data-phase={key}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}
