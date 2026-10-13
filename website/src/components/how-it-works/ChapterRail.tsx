"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";

interface ChapterRailProps {
  activeId: string;
  progress: number;
}

/**
 * Persistent progression indicator. Solid background (never transparent) so
 * chapter labels stay readable while content scrolls beneath it.
 *
 * The rail holds ten chapters and is wider than the viewport at every
 * breakpoint, so it scrolls horizontally. The scrollbar is intentionally
 * hidden; discoverability is provided by edge fades that appear only on the
 * side(s) with hidden content. The active chapter is kept scrolled into view
 * on click, on deep-link, and whenever the active chapter changes while
 * scrolling.
 */
export function ChapterRail({ activeId, progress }: ChapterRailProps) {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks;
  const chapters = t.chapters;

  const listRef = useRef<HTMLOListElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  /** Recompute which sides have off-screen chapters. */
  const syncEdges = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    // 2px tolerance absorbs sub-pixel scroll widths
    const next = { start: list.scrollLeft > 2, end: list.scrollLeft < max - 2 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  /** Bring the active chapter into view with the minimum scroll required. */
  const revealActive = useCallback((behavior: ScrollBehavior) => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>('[aria-current="true"]');
    if (!item) return;

    const padding = 16;
    const itemLeft = item.offsetLeft - padding;
    const itemRight = item.offsetLeft + item.offsetWidth + padding;
    const viewLeft = list.scrollLeft;
    const viewRight = viewLeft + list.clientWidth;

    let target = list.scrollLeft;
    if (itemLeft < viewLeft) target = itemLeft;
    else if (itemRight > viewRight) target = itemRight - list.clientWidth;

    const max = list.scrollWidth - list.clientWidth;
    target = Math.max(0, Math.min(target, max));

    if (Math.abs(target - list.scrollLeft) < 1) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ left: target, behavior });
    } else {
      list.scrollLeft = target;
    }
  }, []);

  // Deep-link support: on mount and on any hash change, reveal the active item
  // immediately (no smooth animation, so a late chapter is visible at once).
  useLayoutEffect(() => {
    revealActive("auto");
    syncEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The active chapter changes as the reader scrolls (or clicks a chapter).
  useEffect(() => {
    revealActive("smooth");
    // Wait for the smooth scroll to settle before re-measuring the edges.
    const timer = window.setTimeout(syncEdges, 420);
    return () => window.clearTimeout(timer);
  }, [activeId, revealActive, syncEdges]);

  // Re-measure on resize / language switch / late font metrics.
  useEffect(() => {
    syncEdges();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncEdges());
    observer.observe(list);
    return () => observer.disconnect();
  }, [syncEdges, lang]);

  useEffect(() => {
    const onHashChange = () => revealActive("auto");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [revealActive]);

  return (
    <div className="sticky top-16 z-40 border-b border-line bg-canvas">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav aria-label={t.hero.railLabel} className="flex items-center gap-3">
          <span className="mono-label hidden shrink-0 text-ink-3 lg:block">
            {t.hero.railLabel}
          </span>

          {/* Fade wrapper — cues that chapters continue past each edge. */}
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden="true"
              data-visible={edges.start}
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-canvas to-transparent opacity-0 transition-opacity duration-300 data-[visible=true]:opacity-100"
            />
            <span
              aria-hidden="true"
              data-visible={edges.end}
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-canvas to-transparent opacity-0 transition-opacity duration-300 data-[visible=true]:opacity-100"
            />

            <ol
              ref={listRef}
              onScroll={syncEdges}
              className="no-scrollbar flex items-stretch gap-0.5 overflow-x-auto py-2"
            >
              {chapters.map((chapter) => {
                const isActive = chapter.id === activeId;
                return (
                  <li key={chapter.id} className="shrink-0">
                    <a
                      href={`#${chapter.id}`}
                      onClick={() => revealActive("smooth")}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? "bg-brand/12 text-brand"
                          : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      <span
                        className={`font-mono text-[10.5px] font-bold ${
                          isActive ? "text-brand" : "text-ink-3"
                        }`}
                      >
                        {chapter.num}
                      </span>
                      <span className={isActive ? "inline" : "hidden sm:inline"}>{chapter.short}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      </div>

      {/* Story progress */}
      <div className="h-px w-full bg-line" aria-hidden="true">
        <div
          className="h-px origin-left bg-gradient-to-r from-brand via-violet to-value transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${Math.max(progress, 0.02)})` }}
        />
      </div>
    </div>
  );
}
