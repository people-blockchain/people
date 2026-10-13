import type { ReactNode } from "react";
import { Reveal } from "../motion/Reveal";
import { Eyebrow, type Tone } from "../ui/primitives";

interface ChapterProps {
  num: string;
  id: string;
  tag: string;
  title: string;
  lead?: string;
  tone?: Tone;
  children: ReactNode;
  /** Layout variant for the chapter body. */
  layout?: "wide" | "split";
}

const toneBorder: Record<Tone, string> = {
  brand: "border-brand/40 text-brand",
  value: "border-value/40 text-value",
  warm: "border-warm/40 text-warm",
  violet: "border-violet/40 text-violet",
  neutral: "border-line text-ink-3",
};

/**
 * One chapter of the single continuous economic story. Chapters share a spine
 * node and a type scale — never a repeated card container — so the page reads
 * as a narrative rather than ten documentation panels.
 */
export function Chapter({
  num,
  id,
  tag,
  title,
  lead,
  tone = "brand",
  children,
  layout = "wide",
}: ChapterProps) {
  return (
    <section id={id} className="anchor-offset relative lg:pl-24">
      {/* Spine node (desktop) */}
      <span
        className={`absolute left-0 top-1 hidden h-11 w-11 items-center justify-center rounded-2xl border bg-canvas font-mono text-[13px] font-bold lg:flex ${toneBorder[tone]}`}
        aria-hidden="true"
      >
        {num}
      </span>

      <Reveal>
        <header className={`max-w-3xl ${layout === "split" ? "lg:max-w-2xl" : ""}`}>
          {/* Chapter tags already carry their own "NN //" prefix in both
              locales, so only fall back to the passed `num` when a tag does
              not lead with a section number. */}
          <Eyebrow tone={tone}>{/^\d+\s*\/\//.test(tag) ? tag : `${num} — ${tag}`}</Eyebrow>
          <h3 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-ink text-balance sm:text-3xl lg:text-4xl">
            {title}
          </h3>
          {lead && <p className="mt-4 text-lead text-ink-2 text-pretty">{lead}</p>}
        </header>
      </Reveal>

      <div className="mt-10">{children}</div>
    </section>
  );
}
