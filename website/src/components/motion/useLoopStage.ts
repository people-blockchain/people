"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "./useActiveStep";
import { useInView } from "./useInView";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/**
 * Reactive `prefers-reduced-motion`, built on `useSyncExternalStore` so the
 * server snapshot is always `false` (deterministic hydration) and live OS
 * changes are picked up without a state-syncing effect.
 */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

/**
 * Drives a looping, self-advancing narration: the caller renders one short beat
 * per index and this hook says which beat is current.
 *
 * - only runs while the visual is actually on screen (no off-screen timers)
 * - never advances under `prefers-reduced-motion`, so the caller can render the
 *   whole sequence statically instead
 * - exposes `paused` / `togglePaused` so the automatic progression always has a
 *   visible pause control (WCAG 2.2.2 — moving content must be pausable)
 *
 * The initial index is always 0 on both server and client, so the first render
 * matches; the motion preference is read from its external store afterwards.
 */
export function useLoopStage(count: number, intervalMs = 2500) {
  const { ref, inView } = useInView<HTMLDivElement>({
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px",
    once: false,
  });
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || paused || !inView || count < 2) return;

    const timer = window.setInterval(() => {
      setStage((value) => (value + 1) % count);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [reducedMotion, paused, inView, count, intervalMs]);

  const goTo = useCallback(
    (index: number) => setStage(((index % count) + count) % count),
    [count]
  );

  const togglePaused = useCallback(() => setPaused((value) => !value), []);

  return { ref, stage, reducedMotion, paused, goTo, togglePaused } as const;
}
