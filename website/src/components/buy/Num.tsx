import type { ReactNode } from "react";

/** Keeps amounts and prices left-to-right and unbroken inside right-to-left text. */
export function Num({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="whitespace-nowrap">
      {children}
    </bdi>
  );
}
