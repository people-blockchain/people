# PPL sale page (`/buy`) — translation status

Last updated: 2026-10-16.

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

- `{curly}` placeholders are filled at render time from
  `website/src/lib/sale/config.ts` (prices, limits, durations, shares). Keep the
  placeholder names exactly as they appear in EN — never translate them and
  never hard-code the number in its place.
- `transparency.auditLine` is the exact public line (EN/RU) naming the three
  models in `AI_AUDITS` (`config.ts`). Keep it in sync when that list changes.
  `transparency.auditBounty` is a short bug-bounty mention on the next line.
- `faq.items[2]` is the "add the PEOPLE network to your wallet" question; it is
  the one that renders the add-network button underneath.
- `faq.pumpCols` must stay a 3-item array, matching `faq.pumpRows`
  (`problem` / `what` / `ours`).
- `footnote.notes` is the page's small print (all risk and legal wording lives
  there and nowhere else). Translate `text`, but leave each `marker` exactly as
  it is — `*`, `**`, `***` are matched against the `FootnoteRef` markers in the
  components, so a translated or re-ordered marker breaks the link.
- Locale number formatting (`$0,0050` in RU vs `$0.0050` in EN) is handled in
  `website/src/lib/sale/format.ts`, not in the JSON.
- `ar` is right-to-left; the sale page has not been reviewed for RTL layout yet.
  Check it when the Arabic translation lands.
- Source prose for the page is kept at `website/docs/ppl-sale-page-en.md` and
  `website/docs/ppl-sale-page-ru.md`. RU is the owner's source of truth; EN is
  kept in step with it.
