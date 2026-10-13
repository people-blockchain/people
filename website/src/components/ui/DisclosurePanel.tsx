import type { ReactNode } from "react";

/**
 * Native disclosure so accordion copy stays in the HTML for crawlers and
 * works with keyboard without a client open-state gate.
 */
export function DisclosurePanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={`group overflow-hidden rounded-xl border border-line bg-surface ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span
          className="mono-label shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-2">
        {children}
      </div>
    </details>
  );
}
