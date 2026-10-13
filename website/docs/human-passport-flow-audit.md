# Human Passport verification flow — audit

Audit of every Human Passport entry point on the site, the windows/modals/redirects each one
opens and in what order, and the branches that make the flow confusing today. The fix that
follows this audit is tracked in the same PR (`fix(founders): linear Human Passport verification
flow`).

Scope: `website/src` on branch `fix/human-passport-linear-flow` (base `origin/main` @ `df4bd8f`).

## 1. Files that make up the flow

| Layer | File | Role |
| --- | --- | --- |
| Entry (header) | `src/components/founders/VerifyStatusBadge.tsx` | Chip/menu item → `Link href="/founders#verify"` |
| Entry (header host) | `src/components/wallet/HeaderWalletMenu.tsx` | Renders the chip on desktop (`:187`) and in the account menu (`:225`) |
| Page | `src/app/founders/page.tsx` → `src/components/founders/FoundersApp.tsx` | Loads `/api/founders/me`, renders the personal block only when a founder number exists |
| UI | `src/components/founders/FoundersPersonal.tsx` | The whole verification card: Telegram CTA, Human Passport CTA, Passport-wallet linker, messages |
| Client lib | `src/context/ExternalWalletContext.tsx` | `signer`, `connectInjected`, `connectWalletConnect`, `signViaActiveSigner` |
| Client lib | `src/components/wallet/WalletExternalConnectSection.tsx` | MetaMask / Trust / WalletConnect buttons + 60 s timeout |
| Client lib | `src/context/WalletModalContext.tsx`, `WalletModal.tsx`, `WalletConnectPanel.tsx` | The header/hero sign-in modal (Web3Auth — popup on desktop, full-page redirect on mobile) |
| API | `src/app/api/founders/verify/human-passport/route.ts` | POST — scores the wallet, grants level 2 |
| API | `src/app/api/founders/passport-wallet/nonce/route.ts` + `passport-wallet/route.ts` | GET nonce / POST link signature / DELETE unlink |
| Domain | `src/lib/founders/human-passport-verify.ts` | Score rules, error vocabulary |
| Domain | `src/lib/founders/passport-wallet.ts` | SIWE-style link message + signature check |
| Domain | `src/lib/founders/verification-service.ts` | `applyStrongVerification` sets `verificationLevel = 2` (server-side persistence) |

Levels: `0` none, `1` Telegram phone, `2` strong/human (`VERIFICATION_LEVEL_STRONG`). Only
level 2 is produced by the Human Passport route.

## 2. Entry points

1. **Header chip** — `VerifyStatusBadge variant="chip"`, desktop only (`lg:` and up; `max-lg:!hidden`).
   Label: `Verify` when level 0/1, `Telegram ✓` at level 1, `Passport ✓` at level 2. Returns
   `null` while signed out, so a signed-out visitor sees no entry point at all. Navigates to
   `/founders#verify` (client-side `Link`).
2. **Header account menu** — `VerifyStatusBadge variant="menu"` inside `HeaderWalletMenu`,
   same target `/founders#verify`.
3. **`/founders#verify` anchor** — `FoundersApp` scrolls to `#verify` once the founder record
   has loaded. If the visitor has **no founder number** (never registered) the verification card
   does not exist at all: the page renders the claim/loading block instead and the hash scroll
   lands nowhere.
4. **Verification card** (`FoundersPersonal`, `data-testid="founders-verification"`) — the only
   place with the actual Human Passport controls. Rendered only when `me.founder` exists and
   `verificationLevel < 2`.

## 3. What the card contains today (and the order windows open)

```
verification card  (FoundersPersonal.tsx:403-538)
├─ badge + level text                         (level 0/1/2)
├─ row of CTAs                                (:417-427)
│   ├─ [if level < 1] "Verify with Telegram"  → openTelegramBot()
│   │     opens a tab SYNCHRONOUSLY (window.open("about:blank")), then
│   │     fetches /api/founders/telegram/link and points it at the deep link
│   └─ [always if level < 2] "Verify with Human Passport"  → verifyHumanPassport()
│         POST /api/founders/verify/human-passport  (no window)
├─ raw inline link "app.passport.xyz"          (:446) target="_blank"  ← stray tab
├─ result box (:451)  — only after the POST answered
│   ├─ score_too_low → message + "Open app.passport.xyz" button (:460) target="_blank"  ← 2nd tab
│   └─ that box also holds <details> "Advanced: using the embedded wallet instead"
└─ passport-wallet block (:481) — rendered ALWAYS while level < 2, independent of the POST
      ├─ passportWallet set   → address + "Unlink"
      ├─ pwSigner set         → "Ready to sign with 0x…" + sign button → nonce → sign → POST link
      ├─ pwShowConnect        → WalletExternalConnectSection (inline, compact)
      │     MetaMask → injected prompt, or deep link out of the browser on mobile
      │     Trust    → same
      │     WalletConnect → WalletConnect QR modal (a second modal)
      └─ otherwise            → hint + "Link MetaMask for Human Passport" → setPwShowConnect(true)
```

`WalletExternalConnectSection` is **inline**, not a modal, but it opens its own surfaces:
the wallet's own approval UI, an app deep-link navigation on mobile, and the WalletConnect QR
modal (`showQrModal: true`). The header/hero sign-in path uses a *different* surface —
`WalletModalHost` → `WalletDialog` → `WalletConnectPanel` → `UnifiedWalletAuthPanel` →
`WalletWeb3AuthSignIn`, which runs in a **popup** on desktop and a **full-page redirect** on
mobile.

## 4. Confusing branches

1. **Two competing CTAs side by side.** At level 0 the card shows "Verify with Telegram" and
   "Verify with Human Passport" in one flex row with identical styling. Nothing says the second
   is the stronger tier, or that the first is optional.
2. **The Passport button does not do what its name implies.** It is a pure *score check* against
   whatever wallet the server already has. If there is no score it does not guide the user
   anywhere — it reports `score_too_low` and the only affordance is a raw external link.
3. **Two unrelated remedies for one failure.** A low score can be fixed either by stamping the
   founder wallet at app.passport.xyz, or by linking a *separate* MetaMask wallet
   (`passportWallet`). Both are on screen simultaneously, in different sub-blocks, with no
   indication that they are alternatives and in which order to try them.
4. **Window 1 then window 2.** Typical mobile session: tap "Verify with Human Passport" →
   `score_too_low` → tap "Open app.passport.xyz" (tab/window 1). Come back, tap "Link MetaMask
   for Human Passport" → the wallet's own approval UI or the WalletConnect QR modal (window 2).
   That is the "opens one window then another" report.
5. **Stray external link in body copy.** A third `target="_blank"` link to app.passport.xyz sits
   permanently in the hint paragraph (`:446`), at all times, next to the CTA row — a second way
   into the same external site that is not tied to any step.
6. **No return path.** Every external hop is `target="_blank"` with no `returnTo`; the user has
   to find their way back to `/founders#verify` on their own. Nothing in the external page knows
   where the user came from.
7. **No step indicator, no sequence.** The card is a single flat panel; the user cannot tell how
   many steps remain or whether they are past step 1.
8. **No persistence / no resume.** `hpBusy/hpMsg/hpPassportLink/pwShowConnect/pwMsg` are plain
   `useState`. Any reload (which is guaranteed on mobile — the Passport tab, the wallet app
   switch, the Web3Auth *redirect* sign-in) resets the panel to a bare button row, with no trace
   of what the user already did.
9. **Sign-in step is invisible.** If the visitor is not signed in, `VerifyStatusBadge` returns
   `null` and `/api/founders/me` answers `signedIn: false` → no founder → the card never renders:
   the entry point silently disappears. There is no "step 1: sign in" state — the flow either
   exists or does not.
10. **Wallet modal and Passport can be on screen at once.** The header/hero "Sign in" modal
    (`WalletModalHost`) is provider-level state, entirely independent of the card's
    `pwShowConnect`. Opening the wallet modal from the header while the passport-wallet sub-block
    is expanded gives two different connect UIs at once.
11. **No timeout or retry on the score check.** `verifyHumanPassport()` awaits `fetch` with no
    ceiling and no retry; a hung `/api/founders/verify/human-passport` leaves the button spinning
    forever. (The wallet connect path does have `EXT_CONNECT_TIMEOUT_MS = 60_000`, which must keep
    working — it was added after Android's "Connect wallet" spun forever.)
12. **Error vocabulary is a wall of text.** `not_configured`, `wallet_not_linked`,
    `wallet_mismatch`, `not_registered`, `sign_in_required`, `score_too_low` each produce one
    sentence with no action attached, except `score_too_low`.
13. **Overlap with Telegram.** Telegram's link opens a tab as well (`openTelegramBot`), so at
    level 0 the user can have a Telegram tab, a Passport tab and the wallet UI open together.
14. **Mobile layout noise.** The passport-wallet sub-block sits inside the same card as the
    score check and expands in place, pushing the CTA row off screen at 360/390 px; the expanded
    `WalletExternalConnectSection` `compact` grid is two columns from `sm:` but one column below,
    so the "Sign in / Verify / Link" stack on a phone is long and unordered.

## 5. Reproduced behaviour (Playwright, production)

See `before-*.png` in `/workspace/pb-passport-shots/`. Signed-out production sessions can only
reach branch 9 (the entry point is absent) plus the `/founders#verify` hash landing on a page
that has no `#verify` element; the authenticated branches above were traced in code and are the
ones the fix addresses. Details and the screenshot manifest are in the PR body.

## 6. Target flow

One component (`HumanPassportFlow`) drives every entry point with four explicit steps:
sign in → Human Passport (wallet link when needed) → score check → success. Sequential (never a
wallet modal and a Passport window from one action), single labelled external hop with an
"I've finished, check my score" button, `returnTo` back to `/founders#verify`, progress persisted
in `localStorage` plus the server status, step indicator "Step N of 4", explicit timeout + retry,
and a shared error surface with a retry action.
