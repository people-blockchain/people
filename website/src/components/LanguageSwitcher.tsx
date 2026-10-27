"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe, X } from "lucide-react";
import type { Language } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { CATALOGUE, getLanguageOption } from "@/lib/languages";

interface LanguageSwitcherProps {
  /** Currently active locale. */
  value: Language;
  onChange: (next: Language) => void;
  /** `menu` = compact dropdown trigger (desktop bar). `inline` = full list (mobile sheet). */
  variant?: "menu" | "inline";
  /** `touch` = legacy 44px; `compact` = 36px mobile header utilities. */
  size?: "default" | "touch" | "compact";
  /** Accessible name for the control, e.g. "Language" / "Язык". */
  label: string;
  className?: string;
}

const ROW_BASE =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors";
const ROW_ACTIVE = "bg-brand/12 font-semibold text-brand";
const ROW_IDLE = "text-ink-2 hover:bg-surface-2 hover:text-ink";

/**
 * Adaptive locale switcher.
 *
 * The site is expected to ship many locales, so the control never renders one
 * button per language in the bar:
 *  - `menu` (desktop): a single trigger showing the active locale, opening a
 *    scrollable dropdown — stays the same width with 2 or 40 languages;
 *  - `inline` (mobile sheet): a collapsible list with the active locale on the
 *    trigger, so the sheet stays short until the visitor asks for the list.
 *
 * Shared contract: the trigger exposes `aria-expanded`, Enter/Space/ArrowDown
 * opens it, Escape closes it and restores focus to the trigger, and a
 * transparent backdrop catches presses outside the desktop popover.
 */
export function LanguageSwitcher({
  value,
  onChange,
  variant = "menu",
  size = "default",
  label,
  className,
}: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = getLanguageOption(value);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const renderRow = (option: (typeof CATALOGUE)[number]) => {
    const isActive = option.code === value;
    return (
      <button
        type="button"
        data-testid={`lang-option-${option.code}`}
        onClick={() => {
          onChange(option.code as Language);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        aria-current={isActive ? "true" : undefined}
        className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_IDLE}`}
      >
        <span className="shrink-0 font-mono text-[11px] font-bold uppercase text-ink-3">
          {option.short}
        </span>
        <span className="min-w-0 flex-1 truncate">{option.endonym}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {option.english}
        </span>
        <Check
          className={`h-3.5 w-3.5 shrink-0 ${isActive ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
      </button>
    );
  };

  if (variant === "inline") {
    return (
      <div className={className}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((state) => !state)}
          onKeyDown={onTriggerKeyDown}
          aria-expanded={open}
          aria-label={label}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong active:scale-[0.99]"
        >
          <Globe className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="mono-label block text-ink-3">{label}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-ink">
              {current ? `${current.endonym} (${current.short})` : value.toUpperCase()}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {open && (
          <ul
            aria-label={label}
            className="mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2/60 p-2 shadow-inner backdrop-blur-sm [scrollbar-width:thin] focus:outline-none"
          >
            {CATALOGUE.map((option) => (
              <li key={option.code} className="py-0.5">
                {renderRow(option)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const menuTriggerClass =
    size === "compact"
      ? "flex h-9 min-h-9 min-w-9 items-center justify-center gap-0.5 rounded-lg border border-line bg-surface-2 px-1.5 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      : size === "touch"
        ? "flex h-11 min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 px-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        : "flex h-11 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-ink-2 transition-colors hover:border-line-strong hover:text-ink xl:gap-1.5";

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="lang-switcher-trigger"
        onClick={() => setOpen((state) => !state)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={menuTriggerClass}
      >
        <Globe
          className={`${size === "touch" || size === "compact" ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} shrink-0 text-ink-3 ${size === "compact" ? "hidden" : ""}`}
          aria-hidden="true"
        />
        <span
          className={`font-mono font-semibold uppercase leading-none ${
            size === "touch" || size === "compact" ? "text-[11px]" : "text-xs"
          }`}
        >
          {current?.short ?? value}
        </span>
        {size !== "touch" && size !== "compact" && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-ink-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <>
          {/* Outside-press catcher; dims on mobile and keeps dropdown dismissible like the sheet. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[2px] transition-opacity sm:bg-transparent sm:backdrop-blur-none"
          />
          <div
            className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[calc(100dvh-5.5rem)] flex-col rounded-2xl border border-line bg-canvas-2 shadow-[var(--elev-2)] backdrop-blur-xl focus:outline-none sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:max-h-[min(28rem,75vh)] sm:w-72 sm:max-w-[calc(100vw-2rem)]"
          >
            {/* Mobile header with title and close button */}
            <div className="flex shrink-0 items-center justify-between border-b border-line px-3.5 py-2.5 sm:hidden">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                  {label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={content[value].nav.closeLabel}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <ul
              aria-label={label}
              className="flex-1 overflow-y-auto overscroll-contain p-2 pb-4 [scrollbar-width:thin] focus:outline-none"
            >
              {CATALOGUE.map((option) => (
                <li key={option.code} className="py-0.5">
                  {renderRow(option)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
