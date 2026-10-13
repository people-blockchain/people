"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Lock } from "lucide-react";

/**
 * Progressive disclosure for technical detail. Keeps the narrative readable
 * while leaving the formal specification available on demand.
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="mono-label inline-flex items-center gap-2 text-ink-2">
          <Lock className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-5 py-5">
          {children}
        </div>
      )}
    </div>
  );
}
