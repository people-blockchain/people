"use client";

/**
 * Shared primitives for the light, warm public pages in the /founders visual
 * language: the warm palette scope, sentence-case section heads, cards,
 * count-up counters and the decorative people illustrations.
 *
 * /founders imports these through `founders-ui`; the homepage and
 * /how-it-works import them directly. Nothing here invents numbers — every
 * counter is fed by a caller that read real data, or is not rendered at all.
 */

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animated number for live counters.
 *
 * The final value is the server-rendered text, so the number is correct with JS
 * disabled, before hydration and before any observer fires. The count-up is a
 * decoration layered on top: it starts only once the element is actually in
 * view, and never replaces a real figure with a placeholder zero otherwise.
 * Reduced motion keeps the final value.
 */
export function CountUpNumber({
  value,
  lang,
  className = "",
  duration = 1100,
}: {
  value: number;
  lang: string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  /** Start of the next animation; null until the first one has been scheduled. */
  const fromRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const animate = (from: number) => {
      fromRef.current = from;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(from + (value - from) * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
        else fromRef.current = value;
      };
      frame = requestAnimationFrame(tick);
    };

    // A value that changed after the first run animates from where it stopped.
    if (fromRef.current !== null) {
      animate(fromRef.current);
      return () => cancelAnimationFrame(frame);
    }

    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // No observer, no animation: leave the real number in place.
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        animate(0);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={nodeRef} className={`tabular-nums ${className}`}>
      {display.toLocaleString(lang)}
    </span>
  );
}

const CONFETTI_COLORS = ["#0369a1", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];

/** Small confetti burst from an element. No-op under reduced motion. */
export function fireConfetti(origin: HTMLElement | null) {
  if (!origin || prefersReducedMotion() || typeof document === "undefined") return;
  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let i = 0; i < 28; i += 1) {
    const piece = document.createElement("span");
    piece.className = "founders-confetti";
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    document.body.appendChild(piece);
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 90;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    const anim = piece.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 90}px)) rotate(${360 + Math.random() * 360}deg)`,
          opacity: 0,
        },
      ],
      { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    anim.onfinish = () => piece.remove();
  }
}

/** PEOPLE lockup cut from the approved artwork. `tone` picks the raster, not the site theme. */
export function PeopleWordmark({
  tone,
  className = "h-8",
}: {
  tone: "navy" | "white";
  className?: string;
}) {
  const file = tone === "navy" ? "people-lockup-light" : "people-lockup-dark";
  return (
    <img
      src={`/brand/${file}.png`}
      srcSet={`/brand/${file}.png 1x, /brand/${file}-2x.png 2x, /brand/${file}-3x.png 3x`}
      width={149}
      height={40}
      alt="PEOPLE"
      draggable={false}
      data-testid="founders-wordmark"
      className={`w-auto max-w-none shrink-0 select-none ${className}`}
    />
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  center = false,
  as: Tag = "h2",
  titleId,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  center?: boolean;
  /** Heading level; the hero uses h1, every following section h2. */
  as?: "h1" | "h2";
  /** Lets the enclosing <section aria-labelledby> point at the real heading. */
  titleId?: string;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{eyebrow}</p>
      <Tag id={titleId} className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-3xl">
        {title}
      </Tag>
      {lead ? <p className="mt-3 text-sm text-ink-2 sm:text-base">{lead}</p> : null}
    </div>
  );
}

/** Standard horizontal rhythm for the warm marketing sections. */
export const WARM_SECTION = "mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8";

export function WarmSection({
  id,
  eyebrow,
  title,
  lead,
  center = false,
  children,
  testId,
  className = "",
  tone = "canvas",
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  center?: boolean;
  children?: ReactNode;
  testId?: string;
  className?: string;
  /** Alternating background band, matching the /founders canvas rhythm. */
  tone?: "canvas" | "canvas-2";
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={`${tone === "canvas-2" ? "bg-canvas-2" : ""} ${className}`}
    >
      <div className={WARM_SECTION}>
        <SectionHead eyebrow={eyebrow} title={title} lead={lead} center={center} titleId={id ? `${id}-title` : undefined} />
        {children}
      </div>
    </section>
  );
}

/** Elevation-1 warm card, the base surface of every section in this language. */
export function WarmCard({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)] ${className}`}
    >
      {children}
    </div>
  );
}

const PEOPLE = [
  { skin: "#f1c7a3", hair: "#3b2a1e", bg: "#fde68a" },
  { skin: "#8d5a3b", hair: "#1c1410", bg: "#bae6fd" },
  { skin: "#e0ac7e", hair: "#6b3f1f", bg: "#fecaca" },
  { skin: "#5c3a25", hair: "#0f0b08", bg: "#bbf7d0" },
  { skin: "#f6d5b8", hair: "#c58b3a", bg: "#ddd6fe" },
  { skin: "#b07850", hair: "#2a1b12", bg: "#fbcfe8" },
] as const;

/** Decorative person illustration (no real data). */
export function PersonAvatar({ index, className = "h-10 w-10" }: { index: number; className?: string }) {
  const p = PEOPLE[index % PEOPLE.length];
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill={p.bg} />
      <path d="M7 38c1.5-7 6.5-11 13-11s11.5 4 13 11a20 20 0 0 1-26 0Z" fill={p.hair} opacity="0.85" />
      <circle cx="20" cy="17" r="7.5" fill={p.skin} />
      <path d={index % 2 ? "M12.5 15.5a7.5 7.5 0 0 1 15 0c-3-2.6-11.5-2.6-15 0Z" : "M12.2 17a7.8 7.8 0 0 1 15.6-1.5c-2.4-1-5-3.6-7.8-3.6S14.5 15 12.2 17Z"} fill={p.hair} />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

/** Primary pill button in the warm language. */
export const WARM_PRIMARY_BTN =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink shadow-[0_10px_30px_-12px_rgba(3,105,161,0.7)] transition hover:brightness-110";

/**
 * Hero-level primary pill: one step larger than `WARM_PRIMARY_BTN` for the one
 * action a page is actually asking for. Kept as its own constant because
 * competing `min-h-*` / `text-*` classes do not resolve by attribute order.
 */
export const WARM_HERO_BTN =
  "inline-flex min-h-14 w-full items-center justify-center rounded-full bg-brand px-8 text-lg font-semibold text-brand-ink shadow-[0_14px_36px_-14px_rgba(3,105,161,0.75)] transition hover:brightness-110 sm:w-auto";

/** Secondary pill button in the warm language. */
export const WARM_SECONDARY_BTN =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand hover:text-brand";

export function WarmCtaLink({
  href,
  children,
  variant = "secondary",
  className = "",
  testId,
  style,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      style={style}
      className={`${variant === "primary" ? WARM_PRIMARY_BTN : WARM_SECONDARY_BTN} ${className}`}
    >
      {children}
    </Link>
  );
}
