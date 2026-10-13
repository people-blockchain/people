"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HERO_HEADLINE_MAX_REM, HERO_HEADLINE_MIN_REM } from "@/lib/hero-headline-scale";

const FIT_SLACK_PX = 1;
const STEP_PX = 0.5;

function lineRefsReady(lineRefs: RefObject<(HTMLElement | null)[]>, expectedLines: number) {
  const nodes = lineRefs.current;
  if (!nodes || nodes.length < expectedLines) return false;
  return nodes.slice(0, expectedLines).every((node) => node != null);
}

function linesFitColumn(
  lines: HTMLElement[],
  column: HTMLElement,
  slack = FIT_SLACK_PX
): boolean {
  const columnRect = column.getBoundingClientRect();
  for (const line of lines) {
    if (line.scrollWidth > line.clientWidth + slack) return false;
    const range = document.createRange();
    range.selectNodeContents(line);
    // A block-level line's own scrollWidth never exceeds its clientWidth even
    // when its text has wrapped onto a second row (the box just grows
    // taller), so that check alone misses wrapping. A Range over the text
    // reports one ClientRect per visual row, which catches it.
    if (range.getClientRects().length > 1) return false;
    const textRect = range.getBoundingClientRect();
    if (textRect.right > columnRect.right + slack) return false;
    if (textRect.left < columnRect.left - slack) return false;
  }
  return true;
}

function activeLines(lineRefs: RefObject<(HTMLElement | null)[]>): HTMLElement[] {
  return (lineRefs.current ?? []).filter((node): node is HTMLElement => node != null);
}

export function useHeroHeadlineFit(
  columnRef: RefObject<HTMLElement | null>,
  headlineRef: RefObject<HTMLElement | null>,
  lineRefs: RefObject<(HTMLElement | null)[]>,
  remeasureKey: string,
  expectedLines = 2,
  maxRem = HERO_HEADLINE_MAX_REM
): { fitReady: boolean } {
  const [fitReady, setFitReady] = useState(false);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const column = columnRef.current;
    const headline = headlineRef.current;
    if (!column || !headline || !lineRefsReady(lineRefs, expectedLines)) {
      return;
    }

    let cancelled = false;

    const runFit = async () => {
      await document.fonts.ready;
      if (cancelled) return;

      const lines = activeLines(lineRefs);
      if (!lines.length || column.clientWidth <= 0) return;

      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const minPx = HERO_HEADLINE_MIN_REM * rootPx;
      const floorPx = minPx;
      const maxPx = maxRem * rootPx;

      const applySize = (px: number) => {
        const value = `${px}px`;
        headline.style.fontSize = value;
        for (const line of lines) {
          line.style.fontSize = value;
        }
      };

      headline.style.fontSize = "";
      for (const line of lines) {
        line.style.fontSize = "";
      }

      let size = parseFloat(getComputedStyle(headline).fontSize);
      if (!Number.isFinite(size) || size <= 0) size = minPx;

      while (size > floorPx && !linesFitColumn(lines, column)) {
        size = Math.max(floorPx, size - STEP_PX);
        applySize(size);
      }

      while (size < maxPx) {
        const next = Math.min(maxPx, size + STEP_PX);
        applySize(next);
        if (!linesFitColumn(lines, column)) {
          applySize(size);
          break;
        }
        size = next;
      }

      while (size > floorPx && !linesFitColumn(lines, column)) {
        size = Math.max(floorPx, size - STEP_PX);
        applySize(size);
      }

      if (!cancelled) {
        setFitReady(true);
        headline.dataset.heroFit = "ready";
      }
    };

    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setFitReady(false);
        if (headlineRef.current) {
          headlineRef.current.dataset.heroFit = "pending";
        }
        void runFit();
      });
    };

    schedule();

    // Mobile browsers fire resize/ResizeObserver events as the address bar
    // collapses while scrolling, which only changes viewport *height*. The
    // fit only depends on column width, so re-running the measurement loop
    // (several forced reflows) on a height-only change was the source of the
    // scroll jank — bail unless the inline size actually moved.
    let lastWidth = column.clientWidth;
    const ro = new ResizeObserver(() => {
      const width = column.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      schedule();
    });
    ro.observe(column);

    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [columnRef, headlineRef, lineRefs, remeasureKey, expectedLines, maxRem]);

  return { fitReady };
}
