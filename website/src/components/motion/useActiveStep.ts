"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which step of a sequence the visitor is currently reading.
 *
 * The reported index is monotonic while the sequence stays on screen, so a flow
 * diagram reads as causality: the active stage is emphasised, every earlier
 * stage remains visible, and nothing ever animates backwards.
 *
 * Under `prefers-reduced-motion` the observers still run (they are cheap) but
 * callers can render every step as already active via `prefersReducedMotion()`.
 */
export function useActiveStep(count: number, rootMargin = "-42% 0px -42% 0px") {
  const refs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const elements = refs.current.slice(0, count).filter(Boolean) as HTMLElement[];
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setActive(count - 1));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.stepIndex ?? 0);
          setActive((previous) => (index > previous ? index : previous));
        }
      },
      { rootMargin, threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [count, rootMargin]);

  const setStepRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      refs.current[index] = el;
    },
    []
  );

  return { active, setStepRef } as const;
}

/** Safe check for the user's motion preference (client only). */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
