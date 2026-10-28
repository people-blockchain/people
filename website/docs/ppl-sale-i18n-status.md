# PPL sale page (`/buy`) — translation status

Last updated: 2026-10-28.

Copy for `/buy` lives in `website/src/lib/locales/surfaces/buy-<lang>.json` and is
assembled by `website/src/lib/buy-content.ts`.

## How the fallback works

`buy-content.ts` merges every locale over `buy-en.json`, the same way
`litepaper-content.ts` does. A locale with no file of its own renders English —
not `undefined`, not an empty string. Adding a translation is one step: drop
`buy-<lang>.json` next to the others and register it in the `rawByLanguage` map
in `buy-content.ts`.

`BUY_UNTRANSLATED_LOCALES`, exported from `buy-content.ts`, is derived from that
same map, so it cannot drift from reality.

## Status

| Locale | Language | `/buy` status |
|---|---|---|
| `en` | English | **Translated** (primary; source of truth for keys) |
| `ru` | Русский | **Translated** (full) |
| `es` | Español | **Translated** (full) |
| `pt` | Português (Brasil) | **Translated** (full) |
| `fr` | Français | **Translated** (full) |
| `de` | Deutsch | **Translated** (full) |
| `it` | Italiano | **Translated** (full) |
| `tr` | Türkçe | **Translated** (full) |
| `vi` | Tiếng Việt | **Translated** (full) |
| `id` | Bahasa Indonesia | **Translated** (full) |
| `zh` | 简体中文 | **Translated** (full) |
| `ar` | العربية | **Translated** (full) |

**All 12 locales are translated** on this surface.

Every other surface keeps its existing translations; nothing was removed.

## Notes for translators

- Page order (2026-10-28 rewrite): `hero` → `before` (before / with PEOPLE) →
  `ppl` (what PPL is) → `how` (three steps + the purchase widget, `form` / `v2`)
  → `rules` → `faq` → `finalCta`, then `footnote`. `stats` is still read by
  `src/lib/sale/v2/stats-copy.ts`.
- `{curly}` placeholders are filled at render time by `buyCopyVars()` in
  `website/src/lib/sale/buy-page.ts`, from `config.ts` and the V2 contract
  constants (`src/lib/sale/v2/constants.ts`). Keep the placeholder names exactly
  as they appear in EN — never translate them and never hard-code the number in
  their place (`scripts/sale-terms-copy.test.mjs` fails on a literal number in
  the rules and the sell-back FAQ answer).
- Day and month counts are fixed numbers today (7, 30, 6, 18, 24); write the noun
  in the form that fits those numbers.
- `rules.auditLine` is the exact public line naming the three AI models. Keep it
  in sync when that list changes. `rules.auditBounty` is the bug-bounty line.
- PEOPLE means the whole community, never "the PEOPLE team": write "PEOPLE does
  not set or raise the price", not "the PEOPLE team does not…".
- Jargon (bonding curve, treasury, multisig) belongs only in `ppl.details` and
  `rules.details`; the visible lines stay plain.
- `footnote.notes` is the page's small print. Translate `text`, but leave each
  `marker` exactly as it is — `*`, `**`, `***` are matched against the
  `FootnoteRef` markers in the components.
- Locale number formatting (`$0,0050` in RU vs `$0.0050` in EN) is handled in
  `website/src/lib/sale/format.ts`, not in the JSON.
- `ar` is right-to-left; the page sets `dir="rtl"` and the before/after arrow
  flips.
- `website/docs/ppl-sale-page-en.md` / `-ru.md` are the older v1 prose (180-day
  window, sell back at any time, $0.25 ceiling) and no longer match the page.
