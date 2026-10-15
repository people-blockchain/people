"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";

/**
 * The page's risk and legal statements, lawyer style: one small-print block at
 * the very bottom, and asterisk markers at the places that reference it.
 *
 * Owner decision 2026-10-16: no risk or legal wording above the fold or inside
 * the main blocks. Anything of that kind belongs in `footnote.notes` here, with
 * a `FootnoteRef` where the claim is made.
 */
export const SMALL_PRINT_ID = "small-print";

/**
 * A superscript marker that jumps to the matching note. `marker` is the note's
 * own `marker` string, so the two can never drift apart.
 */
export function FootnoteRef({ marker }: { marker: string }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const note = t.footnote.notes.find((candidate) => candidate.marker === marker);

  return (
    <a
      href={`#${SMALL_PRINT_ID}`}
      aria-label={note ? `${t.footnote.title}: ${note.text}` : t.footnote.title}
      className="ms-0.5 align-super text-[0.7em] font-semibold text-ink-3 transition-colors hover:text-brand"
    >
      {marker}
    </a>
  );
}

/** The small print itself. Rendered once, last thing on the page. */
export function SmallPrint() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];

  return (
    <aside id={SMALL_PRINT_ID} className="scroll-mt-20 border-t border-line pt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {t.footnote.title}
      </h2>
      <dl className="mt-3 max-w-4xl space-y-2">
        {t.footnote.notes.map((note) => (
          <div key={note.marker} className="flex gap-2">
            <dt className="shrink-0 font-mono text-[11px] leading-relaxed text-ink-3">
              {note.marker}
            </dt>
            <dd className="text-[11px] leading-relaxed text-ink-3">{note.text}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
