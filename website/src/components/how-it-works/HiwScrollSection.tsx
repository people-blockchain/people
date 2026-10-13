"use client";

import type { ReactNode } from "react";
import { useInView } from "@/components/motion/useInView";

/** Wraps a /how-it-works block so child motion only runs after ~30% is visible. */
export function HiwScrollSection({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.3, once: false });
  return (
    <section
      ref={ref}
      id={id}
      className={`${className} ${inView ? "hiw-in-view" : ""}`}
      data-in-view={inView ? "true" : "false"}
    >
      {children}
    </section>
  );
}
