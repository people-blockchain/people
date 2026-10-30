"use client";

import { useState } from "react";
import { formatPplExact, formatPplLabeled, PPL_DUST_LABEL } from "@/lib/asset-amounts";

/**
 * Compact PPL amount. The exact unrounded value is on the title and replaces
 * the compact text after a tap or click. Transaction details pass `exact`.
 */
export function PplAmount({
  wei,
  exact = false,
  dustLabel = PPL_DUST_LABEL,
  className,
}: {
  wei: bigint;
  exact?: boolean;
  dustLabel?: string;
  className?: string;
}) {
  const full = `${formatPplExact(wei)} PPL`;
  const compact = formatPplLabeled(wei, dustLabel);
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      title={full}
      onClick={() => setOpen((value) => !value)}
      className={className ?? "inline cursor-pointer border-0 bg-transparent p-0 text-inherit"}
    >
      {exact || open ? full : compact}
    </button>
  );
}
