# Premium visual audit — peopleblockchain.network

Method: ran the site locally (`next dev`, Node 22), captured every public route at
390 and 1280px, dark and light, with `prefers-reduced-motion: reduce` forced in
the browser context (see "Screenshot method notes" below). Both themes were
reviewed; the dark set (390 + 1280, 40 files) is kept under
`website/docs/screenshots/premium/audit-before/` as evidence — light-theme
shots were spot-checked for contrast/parity but not persisted, to keep this
"before" baseline small (the full before/after verification matrix at
360/390/1280 × both themes is captured separately at the end, see the PR
summary). `/founders` is the quality bar this audit measures everything else
against.

## Screenshot method notes

Two things in this sandbox would otherwise give a false reading:

- **No real backend/chain data locally.** Pages that read live chain/API state
  (`/explorer`, `/discover`, parts of `/transparency`, `/wallet`, `/partner`)
  render mostly-empty loading states here. That's a dev-environment gap, not a
  design defect — treat emptiness on those pages as "untested", not "cheap".
- **Scroll-reveal content needs `prefers-reduced-motion`.** Most sections fade
  in via `Reveal`/`useInView` (`IntersectionObserver`, gated behind an
  `html.js-motion` class). A plain Playwright `fullPage` screenshot does not
  scroll the real viewport, so the observer's root never grows and most
  below-the-fold content is captured mid-"not yet visible" (large blank gaps,
  worst on `/how-it-works`). Forcing reduced motion makes the CSS always show
  the final state, which is what real visitors who scroll (or who have motion
  reduced) actually see. Final verification screenshots should keep doing this
  for the same reason.

## Findings and fixes

### Confirmed bugs (fixed in this branch)

1. **`/buy` had no site chrome at all.** `src/app/buy/page.tsx` rendered the
   checkout card directly with no `Navbar`/`Footer` and no page eyebrow — a
   floating card on a blank page, next to `/swap`, `/create`, `/fees` etc.
   which all use the shared header pattern. Fixed: wrapped in `SiteChrome`
   plus an eyebrow + "Testnet" chip row consistent with the rest of the site.

2. **`/agents` and `/roadmap` page titles were silently unstyled.** Both
   (`AgentsPublic.tsx`, `RoadmapPublic.tsx`, and the unused
   `HowItWorksPublic.tsx`) used a `text-h1` Tailwind class that was never
   defined as a design token (only `--text-display` and `--text-h2` exist in
   `globals.css`'s `@theme` block). Tailwind silently drops unknown
   utilities, and the Preflight reset makes headings inherit their parent's
   font-size — so the `<h1>` rendered at body-text size, just bold. Every
   other standalone page (`/fees`, `/tokenomics`, `/swap`, `/explorer`,
   `/create`, `/discover`, `/partner`, `/wallet`...) already uses `text-h2`
   for its page title. Fixed by switching these three to `text-h2` to match
   the established convention — no new token needed for this one.

3. **Sub-section headings on `/tokenomics`, `/roadmap`, `/agents` had the same
   bug with `text-h3`** (10+ call sites), which also was never defined. Unlike
   the h1 case there was no existing fallback size in use elsewhere worth
   matching, so this one got an actual token: added
   `--text-h3: clamp(1.25rem, 1.8vw, 1.5rem)` to the `@theme` block in
   `globals.css`. This instantly restores real visual hierarchy on all three
   pages (e.g. tokenomics' "Fixed supply", "Genesis allocation", "Circulating
   supply" headers) without touching any markup.

4. **Hero scroll jank, root cause found.** `useHeroHeadlineFit`'s
   `ResizeObserver` re-ran the whole font-fit measurement loop (several
   forced `getBoundingClientRect`/`scrollWidth` reads per pass) on *any*
   resize of the hero column — including height-only changes. Mobile browsers
   fire exactly that kind of resize when the address bar collapses/expands
   while scrolling, so every scroll on the homepage was retriggering a layout
   thrash loop. Fixed by only re-running the fit when the column's
   `clientWidth` actually changes (file: `src/hooks/useHeroHeadlineFit.ts`).

### Hero (`/`), re-assessed against the brief

The homepage hero (`HomeWarmHero.tsx` + `PhoneMock.tsx`, introduced in prior
PRs #188/#189) was already largely built to the brief before this pass:

- No `<img>`/`<video>` at all — the phone mock is pure CSS/SVG/Tailwind.
- Every animation (`warm-phone-stage`, `warm-pulse-ring`, `warm-coin-pop`,
  `node-pulse`, `Reveal`'s rise) only animates `transform`/`opacity`
  (compositor-only, no layout or paint-triggering properties).
- `prefers-reduced-motion` is respected end-to-end: `Reveal` and
  `useLoopStage` both check it and render the full static sequence instead of
  animating.
- The autoplay loop (`useLoopStage`) only runs a `setInterval` while the mock
  is actually in view (`IntersectionObserver`), and exposes a pause control
  (WCAG 2.2.2).
- The headline uses a CSS `clamp()` + container-query (`cqi`) formula to get
  an SSR-correct size on first paint, with the JS fit hook only doing a small
  refinement pass afterward — not a from-scratch client computation.

So this was not rebuilt from scratch; the one real defect (the ResizeObserver
over-triggering on scroll, above) is fixed, which should remove the reported
scroll jank. No other LCP/CLS risk found in the hero markup.

### Pages already at the `/founders` bar — no changes needed

`/`, `/founders`, `/how-it-works`, `/fees`, `/swap`, `/create`, `/discover`,
`/transparency`, `/privacy`, `/terms`, `/login`, `/wallet` all already use the
shared primitives (`Eyebrow`, `Chip`, `SectionIntro`, `text-h2`/`text-lead`
tokens, `rounded-2xl`/`rounded-3xl` cards on `border-line`/`bg-surface`) and
read as one consistent system in both themes at both widths.

### Lower-priority / out of scope for this pass

- `/explorer` and `/discover`'s empty/loading states (single spinner + a lot
  of blank space below) could get real skeleton rows instead, but this is a
  data-presentation nicety, not a design-system inconsistency, and the pages
  could not be meaningfully exercised against live data in this sandbox.
  Flagging for a follow-up rather than guessing at a fix blind.
- `/docs` is a long, dense reference page; it already uses the site's heading
  scale (`text-5xl`/`text-6xl` for its own `<h1>`) and is intentionally denser
  than the marketing pages. Left as-is.
