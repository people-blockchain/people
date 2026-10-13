import type { ReactNode } from "react";

export type Tone = "brand" | "value" | "warm" | "violet" | "neutral";

const toneDot: Record<Tone, string> = {
  brand: "bg-brand",
  value: "bg-value",
  warm: "bg-warm",
  violet: "bg-violet",
  neutral: "bg-ink-3",
};

const toneText: Record<Tone, string> = {
  brand: "text-brand",
  value: "text-value",
  warm: "text-warm",
  violet: "text-violet",
  neutral: "text-ink-3",
};

/** Small uppercase technical label. Used for chapter numbers and eyebrow tags. */
export function Eyebrow({
  children,
  tone = "brand",
  className = "",
  withDot = true,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  withDot?: boolean;
}) {
  return (
    <span
      className={`mono-label inline-flex items-center gap-2 ${toneText[tone]} ${className}`}
    >
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Section intro. Deliberately unstyled as a container — sections choose their
 * own composition (split, centred, full-bleed) and only share the type scale.
 */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  tone = "brand",
  align = "left",
  className = "",
  titleClassName = "",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  tone?: Tone;
  align?: "left" | "center";
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div
      className={`${align === "center" ? "mx-auto text-center items-center" : ""} flex flex-col gap-4 ${className}`}
    >
      {eyebrow && (
        <Eyebrow tone={tone} className={align === "center" ? "justify-center" : ""}>
          {eyebrow}
        </Eyebrow>
      )}
      <h2
        className={`text-h2 font-bold tracking-tight text-ink text-balance ${titleClassName}`}
      >
        {title}
      </h2>
      {lead && (
        <p className={`text-lead text-ink-2 prose-measure text-pretty ${align === "center" ? "mx-auto" : ""}`}>
          {lead}
        </p>
      )}
    </div>
  );
}

/** Large single statement — used where a section deserves a billboard moment. */
export function Statement({
  children,
  tone = "brand",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <p
      className={`border-l-2 pl-5 sm:pl-7 text-xl sm:text-2xl lg:text-3xl font-semibold leading-snug text-ink text-pretty ${
        tone === "value"
          ? "border-value"
          : tone === "warm"
          ? "border-warm"
          : tone === "violet"
          ? "border-violet"
          : tone === "neutral"
          ? "border-line-strong"
          : "border-brand"
      } ${className}`}
    >
      {children}
    </p>
  );
}

/** Compact inline tag/pill for factual technical labels. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    brand: "border-brand/35 bg-brand/10 text-brand",
    value: "border-value/35 bg-value/10 text-value",
    warm: "border-warm/35 bg-warm/10 text-warm",
    violet: "border-violet/35 bg-violet/10 text-violet",
    neutral: "border-line bg-surface-2 text-ink-2",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold leading-5 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Full-width labelled divider that keeps long pages scannable. */
export function Rule({ label, tone = "neutral" }: { label?: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-line" />
      {label && <span className={`mono-label ${toneText[tone]}`}>{label}</span>}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
