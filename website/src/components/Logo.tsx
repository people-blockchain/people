/**
 * PEOPLE logo — approved PNG artwork, no SVG.
 *
 * The raster lockups in `public/brand/` are direct crops of the approved
 * logo PNG (`brand/people-logo-approved.png`); see
 * `scripts/generate-brand-assets.py`. Nothing here redraws, traces or
 * restyles the mark, so the rendered result cannot drift from the artwork.
 *
 * Two lockups exist, both cut from the same artwork:
 *
 *   compact — symbol + PEOPLE. The site header. The approved tagline raster is
 *             too fine at header scale; the header renders "PEOPLE Blockchain"
 *             as CSS text aligned with the PEOPLE column (see globals.css).
 *   full    — symbol + PEOPLE + "PEOPLE Blockchain". Footer and social
 *             cards, where it is rendered large enough to stay legible.
 *
 * Theme handling: the site theme is a class on <html> applied before first
 * paint by the boot script, *not* `prefers-color-scheme`. A `<picture>` with a
 * colour-scheme media query would therefore desync whenever a visitor
 * overrides their system theme, so the swap is done in CSS (`dark:` variant)
 * and each density is served through `srcSet` — one request, correct raster
 * for the display.
 *
 * Plain <img> is deliberate rather than next/image: the 1x/2x/3x rasters are
 * already exact crops of the approved artwork, and the optimiser would
 * re-encode them (default quality 75), which softens logo edges.
 */
/* eslint-disable @next/next/no-img-element */

const INTRINSIC = {
  compact: { w: 149, h: 40, file: "people-lockup" },
  full: { w: 221, h: 40, file: "people-lockup-full" },
  symbol: { w: 40, h: 40, file: "icon-48" },
} as const;

export type LogoVariant = keyof typeof INTRINSIC;

const srcSet = (file: string, variant: "light" | "dark") =>
  [
    `/brand/${file}-${variant}.png 1x`,
    `/brand/${file}-${variant}-2x.png 2x`,
    `/brand/${file}-${variant}-3x.png 3x`,
  ].join(", ");

export function Logo({
  className = "h-10",
  variant = "compact",
  alt = "PEOPLE Blockchain",
}: {
  /** Sizing utilities only — e.g. `h-10`, `h-9 sm:h-12`. */
  className?: string;
  variant?: LogoVariant;
  alt?: string;
}) {
  const { w, h, file } = INTRINSIC[variant];
  const shared = `w-auto max-w-none shrink-0 select-none ${className}`;

  if (variant === "symbol") {
    return (
      <img
        src={`/brand/${file}.png`}
        srcSet={`/brand/${file}.png 1x, /brand/icon-192.png 2x, /brand/icon-512.png 3x`}
        width={w}
        height={h}
        alt={alt}
        draggable={false}
        className={shared}
      />
    );
  }

  return (
    <>
      {/* Dark/navy wordmark — light theme */}
      <img
        src={`/brand/${file}-light.png`}
        srcSet={srcSet(file, "light")}
        width={w}
        height={h}
        alt={alt}
        draggable={false}
        className={`${shared} header-lockup-theme header-lockup-theme-light`}
      />
      {/* White wordmark — dark theme. Same symbol and geometry throughout. */}
      <img
        src={`/brand/${file}-dark.png`}
        srcSet={srcSet(file, "dark")}
        width={w}
        height={h}
        alt={alt}
        draggable={false}
        className={`${shared} header-lockup-theme header-lockup-theme-dark`}
      />
    </>
  );
}
