import type { ReactNode } from "react";

/** Desktop grid / tablet wrap / phone horizontal snap. */
export function HScroll({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="list"
      aria-label={label}
      className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 no-scrollbar sm:grid sm:overflow-visible sm:pb-0 ${className}`}
    >
      {children}
    </div>
  );
}

export function HScrollItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="listitem"
      className={`w-[min(18rem,calc(100vw-2.5rem))] shrink-0 snap-start sm:w-auto sm:min-w-0 ${className}`}
    >
      {children}
    </div>
  );
}
