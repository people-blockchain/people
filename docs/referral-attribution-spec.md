# End-to-End Referral, Partner & KOL Attribution Specification (`public/main`)

**Status:** `APPROVED FOR IMPLEMENTATION` (Aligned with `public/main` `eeded8fe` / PR #92)  
**Target Launch Gate:** Public PPL Bonding-Curve Sale Opening — **December 1, 2026**  
**Scope:** Unified referral invite link (`/?ref=<code>` from PR #92) and `people_partner_ref` 30-day cookie, cookie-timestamp attribution window & automatic first-sign-in attach fix, depth 2 (`MAX_PARTNER_REFERRAL_DEPTH = 2`) verification, off-chain `PplCurveHub` (`0x84388772788B7a383Dc2a0bDCd655D15A8279DC8` on Base) `Bought`/`Sold` event matching, volume-tiered KOL commissions (`7% / 9% / 12%` USDC on Base + `3%` PPL on PEOPLE mainnet), payouts ledger (`pending / approved / paid / void`), anti-abuse & sell-back clawbacks, DB migration `0023`, API routes, and English-only Partner Cabinet UI design.

> [!IMPORTANT]
> Per `AGENTS.md` §2–§3, this specification preserves the protocol fee split (`30 / 25 / 20 / 10 / 15 / 0`) and Growth Pool L1/L2 weights (`70 / 30`). All site copy is strictly English-only.

---

## 0. Codebase Audit & Verified Facts (`public/main`)

Every design decision in this specification is verified against `public/main` (`eeded8fe`):

| # | Area | `public/main` Codebase Reality & Finalized Resolution |
|---|---|---|
| **F1** | **Unified Invite Link (`/?ref=<code>`, PR #92)** | `public/main` (`eeded8fe`) already unifies Founders, Bounty, Partner, and on-chain Participant Referral under a single invite link format: **`/?ref=<code>`** (`partnerSharePath(code)` in [referral.ts](../website/src/lib/partner/referral.ts#L146-L148)) and a single 30-day first-party cookie **`people_partner_ref`** (`REFERRAL_COOKIE` in [referral.ts](../website/src/lib/partner/referral.ts#L8-L9)). We reuse `/?ref=<code>` and `people_partner_ref` directly rather than introducing duplicate `/buy?ref` or `ppl_ref` cookies. |
| **F2** | **On-Chain Hub (`PplCurveHub` on Base)** | Deployed on Base (`chainId: 8453`) at `0x84388772788B7a383Dc2a0bDCd655D15A8279DC8`. `PplCurveHub.sol` is external to this repository (no repo path is referenced). Its `buy(...)` function has **no `referrer` parameter** and emits `Bought` events with the buyer wallet, stablecoin amount, and PPL amount. Referrals are attributed **off-chain** by matching `Bought` events (`buyer` wallet) to attributed users via `sale_binding` + `sale_person` (`0020_sale_person_binding.sql`), `sale_buyer_binding`, and linked account wallets (`partner.walletAddress`, `founder.walletAddress`, `founder.passportWallet`, `user_wallet_vault.address`). |
| **F3** | **PPL Settlement & Genesis Quest Lock** | Purchased PPL and the `3%` KOL PPL commission bonus are credited on **PEOPLE mainnet**, never on Base. **Genesis Quest reward PPL is locked** on PEOPLE mainnet and is **not sellable back** to the Base `PplCurveHub`. |
| **F4** | **Migration Numbering (`0023`)** | On `public/main`, `website/drizzle/` migrations go up to `0020_sale_person_binding.sql`, `0021_founder_nft_person.sql`, and `0022_founder_nft_auth_nonce.sql`. Therefore, our migration is **`0023_referral_kol_attribution.sql`** (`idx: 23` in `website/drizzle/meta/_journal.json`). |
| **F5** | **Cookie Window & First-Sign-In Attach Fix (`referral.ts` / `service.ts`)** | In [referral.ts](../website/src/lib/partner/referral.ts#L85-L91), `REFERRAL_REGISTRATION_WINDOW_MS = 24h` is checked against `invitee.createdAt` in [service.ts](../website/src/lib/partner/service.ts#L57). Because [auth.ts](../website/src/auth.ts#L28-L38) creates the `partner` row at first login (`ensurePartner(userId)`) without calling `attachReferralIfEligible` (since calling `cookies()` inside NextAuth events drops the session `Set-Cookie` header), a user who signs in on `/buy` or `/` and visits `/partner` >24h later loses their referral. **Fix:** Encode the cookie set timestamp (`<code>.<setAtSec>`) in `people_partner_ref` (while remaining 100% compatible with plain `<code>` values), add `/buy` to [proxy.ts](../website/src/proxy.ts#L83-L93) matcher, measure the 30-day attribution window from **cookie `setAt` time** when present (falling back to the 24h `invitee.createdAt` window for untimestamped cookies), and trigger `POST /api/partner/referral/attach` automatically on first sign-in from [ReferralRefCapture.tsx](../website/src/components/ReferralRefCapture.tsx). |
| **F6** | **Referral Depth Verification (`referral.ts:130`)** | In [referral.ts](../website/src/lib/partner/referral.ts#L130-L132), `MAX_PARTNER_REFERRAL_DEPTH = 2` enforces a 2-level partner hierarchy (`Root` depth `0` → `L1` depth `1` → `L2` depth `2`; `parentDepth + 1 > MAX_PARTNER_REFERRAL_DEPTH` rejects depth `3` with `reason: "depth_exceeded"`), matching Growth L1 (`70%`) / L2 (`30%`) lines and [founders/register/route.ts](../website/src/app/api/founders/register/route.ts#L60-L64). Verified, documented, and tested across unit and DB integration tests. |
| **F7** | **KOL Tiered Commission Rates** | Approved business terms: Bloggers/KOLs earn **7% / 9% / 12% in USDC** (on Base) on sales via their link based on configurable cumulative net volume tiers (`< $25,000`, `$25,000–$99,999.99`, `>= $100,000`), plus **3% in PPL** credited on **PEOPLE mainnet**. |

---

## 1. Attribution Model, Unified Link & Cookie Fix

### 1.1 First-Touch Attribution Decision & Justification
**Decision:** **Strict First-Touch Attribution** within the 30-day `people_partner_ref` cookie window (`REFERRAL_COOKIE_MAX_AGE = 2,592,000` seconds), with immutable binding on first sign-in.

**Justification:**
1. **Matches PR #92 (`eeded8fe`) Across All Programs:** Both `resolveStoredReferralCode` ([referral.ts](../website/src/lib/partner/referral.ts#L20-L27)) and `captureReferrerFromSearch` ([referral-ref.ts](../website/src/lib/referral-ref.ts#L46-L57)) enforce first-touch ("an existing cookie is never overwritten").
2. **Protects Bloggers, KOLs & Community Inviters:** Creators who introduce a user via `/?ref=<code>` are protected against last-second link hijacking prior to sign-in or purchase.
3. **Immutable Account Binding:** Once `partner.referredByUserId` is set, `evaluateReferralAttach` returns `{ ok: false, reason: "already_bound" }` on any subsequent attempt.

### 1.2 Unified Invite Link Format (`/?ref=<code>`)
- **Canonical Share URL:** `https://www.peopleblockchain.network/?ref=<code>` (generated via `partnerSharePath(code)` in `website/src/lib/partner/referral.ts`).
- **Landing Support Across Entry Routes:** Visitors may land on `/?ref=<code>`, `/buy?ref=<code>`, `/<locale>/buy?ref=<code>`, `/founders?ref=<code>`, `/bounty?ref=<code>`, `/partner?ref=<code>`, or `/login?ref=<code>`.
- **Code Resolution (`referralCode` & Optional Custom `kolCode`):**
  - Every partner receives a deterministic 8–10 char lowercase alphanumeric `referralCode` at first sign-in (`referralCodeFromUserId`).
  - Bloggers/KOLs can optionally claim a custom `kolCode` matching `REFERRAL_CODE_RE = /^[a-z0-9]{6,16}$/` (e.g. `/?ref=alicekol`).
  - Both `resolveUserIdByReferralCode` ([referral-link-server.ts](../website/src/lib/referral-link-server.ts)) and `attachReferralIfEligible` ([service.ts](../website/src/lib/partner/service.ts)) match `partners.referralCode = code` **or** `lower(partners.kolCode) = code`, so the single `/?ref=<code>` link works across Partner, KOL Sale Attribution, Founders, Bounty, and On-Chain Participant Referral.

### 1.3 `people_partner_ref` Cookie Timestamp & First-Sign-In Attach Fix
1. **Backwards-Compatible Timestamped Cookie Value:**
   - Cookie name remains `REFERRAL_COOKIE = "people_partner_ref"` (`Max-Age = 2592000` / 30 days, `Path=/`, `SameSite=Lax`).
   - `serializeReferralCookie(code, setAtMs)` encodes `"<code>.<setAtEpochSeconds>"` (e.g. `"33063c3605.1762200000"`).
   - `parseReferralCookie(raw)` accepts both plain `"33063c3605"` (`setAt: null`) and timestamped `"33063c3605.1762200000"` (`setAt: new Date(1762200000 * 1000)`).
   - `normalizeReferralCode(raw)` strips any optional `.<digits>` timestamp suffix before testing `REFERRAL_CODE_RE`, so every existing caller on `public/main` works transparently whether the cookie is plain or timestamped.
2. **Window Measured from Cookie Set Time:**
   - `withinReferralCookieWindow(cookieSetAt, now)` checks `0 <= now - cookieSetAt <= REFERRAL_COOKIE_MAX_AGE * 1000` (30 days from when the cookie was set on landing).
   - In `attachReferralIfEligible(userId, rawCode, options)`:
     - When `cookieSetAt` is present (from the timestamped cookie or `options.cookieSetAt`), eligibility is measured from `cookieSetAt` (30-day window from cookie set time) rather than `invitee.createdAt`.
     - When no `cookieSetAt` is present (legacy plain cookie), `withinReferralRegistrationWindow(invitee.createdAt, now)` (24h window) continues to guard against stale untimestamped cookies on old accounts.
3. **Automatic Attach on First Sign-In (`ReferralRefCapture.tsx` + `POST /api/partner/referral/attach`):**
   - `ReferralRefCapture.tsx` (mounted in `RootLayout` on all pages) captures `?ref=<code>` into `localStorage` (`ppl_referrer`) and `document.cookie` (`people_partner_ref`), and calls `POST /api/partner/referral/attach` once per session/code so first sign-in on `/buy`, `/`, `/discover`, `/bounty`, or `/founders` attaches the referral immediately without waiting for the user to visit `/partner`.

---

## 2. Off-Chain `Bought` / `Sold` Event Matching on Base

### 2.1 Why Off-Chain Matching Is Required
The Base `PplCurveHub` contract (`0x84388772788B7a383Dc2a0bDCd655D15A8279DC8`, `chainId: 8453`) has no `referrer` parameter in `buy(...)`. It emits:
- `Bought(address indexed buyer, address indexed token, uint256 usdIn, uint256 pplOut, uint256 soldAfter)` (and the 2-indexed-address `beneficiary` variant)
- `Sold(address indexed seller, address indexed token, uint256 pplIn, uint256 grossUsd, uint256 feeUsd, uint256 soldAfter)`

### 2.2 Buyer Wallet Attribution Waterfall (Integrated with `0020_sale_person_binding`)
When a `Bought` event is observed on Base with `buyerAddress` (normalized lowercase `0x` address):
1. **Primary — Sale Verifier Binding (`sale_binding` + `sale_person` from `0020_sale_person_binding.sql`, or `sale_buyer_binding`):**
   - Every buyer on `/buy` obtains a verifier signature via `POST /api/sale/verify-signature` ([verify-signature/route.ts](../website/src/app/api/sale/verify-signature/route.ts)), which records `sale_binding(personId, account)` and `sale_person(personKey, personId, userId)`.
   - Additionally, `POST /api/partner/referral/attach` (when `buyerWallet` is supplied) records `sale_buyer_binding(buyerWallet, userId, referrerUserId, kolCode)`.
2. **Fallback — Linked Account Wallets (`partner.walletAddress`, `founder.walletAddress`, `founder.passportWallet`, `user_wallet_vault.address`):**
   - If the `buyerAddress` matches a wallet linked to a user's Partner profile, Founder profile, or Cloud Wallet Vault, `buyerUserId` is resolved to that user and attributed to `partner.referredByUserId`.
3. **Unattributed:**
   - If the wallet cannot be resolved to an attributed user, `sale_purchase` is recorded with `attributionMethod = 'unattributed'` and zero commission rows are created.

### 2.3 Confirmations, Idempotency & Reorg Handling (`bought-matcher.ts`)
- **Confirmations:** Requires `MIN_BASE_CONFIRMATIONS = 5` blocks (`headBlockNumber - event.blockNumber >= 5`, matching `website/src/data/ppl-sale-evm.json` for Base `8453`).
- **Idempotency:** Unique index `sale_purchase_chain_tx_log_idx` on `(chainId, lower(txHash), logIndex)` and deterministic commission `idempotencyKey` (`kol:${chainId}:${txHashLower}:${logIndex}`).
- **Reorg Rollback:** Rescans `REORG_LOOKBACK_BLOCKS = 64` blocks from `sale_chain_cursor.lastScannedBlock`; if a stored purchase's `blockHash` mismatches canonical chain logs, the purchase is marked `'reorged'` and its `pending`/`approved` commissions transition to `status = 'void'`, `voidReason = 'chain_reorg'`.

---

## 3. Payouts Accounting, Volume Tiers & Anti-Abuse

### 3.1 Volume-Tiered Blogger / KOL Commissions (`commission.ts`)
| Tier | Label | Cumulative Net Referred Volume (USD) | USDC Commission Rate (Base) | PPL Bonus Rate (PEOPLE Mainnet) | Configurable Env Override |
|---|---|---|---|---|---|
| **Tier 1** | **Starter Partner** | `$0` – `$24,999.99` (`< 25_000_000_000` micro-USD) | **7%** (`700 bps`) | **3%** (`300 bps`) | `KOL_TIER1_USDC_BPS=700` |
| **Tier 2** | **Growth Partner** | `$25,000.00` – `$99,999.99` (`>= 25_000_000_000` micro-USD) | **9%** (`900 bps`) | **3%** (`300 bps`) | `KOL_TIER2_MIN_USD=25000`, `KOL_TIER2_USDC_BPS=900` |
| **Tier 3** | **Elite Partner** | `>= $100,000.00` (`>= 100_000_000_000` micro-USD) | **12%** (`1200 bps`) | **3%** (`300 bps`) | `KOL_TIER3_MIN_USD=100000`, `KOL_TIER3_USDC_BPS=1200` |

- **Settlement Networks:**
  - **USDC (`7% / 9% / 12%`):** Settled in **USDC on Base (`chainId: 8453`)**.
  - **PPL (`3%`):** Credited in **PPL on PEOPLE Mainnet**, **never on Base**.
  - **Genesis Quest PPL Lock:** Genesis Quest reward PPL is locked (`isPplSellableToCurveHub("genesis_quest") === false`) and cannot be sold back to `PplCurveHub`.
- **Ledger Statuses & Hold Period:**
  - `pending` (30-day hold `holdUntil = blockTimestamp + 30 days`) → `approved` (after hold matures and no clawback/abuse) → `paid` (batch executed on Base / PEOPLE mainnet) or `void` (reorg, sell-back clawback, self-referral, or cluster abuse).

### 3.2 Anti-Abuse & Curve Sell-Back Clawbacks
1. **Self-Referral Block:** Rejects `buyerUserId === referrerUserId` or any purchase where `lower(buyerAddress)` belongs to the referrer's own wallets (`voidReason = 'self_referral'`).
2. **Wallet Clustering Detection:** Flags multiple buyer accounts sharing the same `buyerAddress`, `ipHash`, or `deviceHash`, or sharing device/IP hashes with the referrer (`voidReason = 'wallet_cluster_abuse'`).
3. **Curve Sell-Back LIFO Clawback (`applySellBackClawback`):** When a buyer sells PPL back to `PplCurveHub` (`Sold` event) during the 30-day hold window, pending/unpaid commissions for that buyer are clawed back in LIFO order (`voidReason = 'sell_back_clawback'` when 100% sold back, or proportional `BigInt` reduction on partial sell-back).
4. **Rate Limits:** `checkSharedRateLimit` (`website/src/lib/api-rate-limit.ts`) enforces per-IP and per-user fixed-window rate limits on `/api/partner/referral/attach` and `/api/partner/kol-code`.

---

## 4. Database Migration `0023` & Drizzle Schema

### 4.1 Exact SQL (`website/drizzle/0023_referral_kol_attribution.sql`)
```sql
-- Migration 0023: Referral & KOL attribution, off-chain PplCurveHub Bought/Sold matching, and commission ledger.

ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolCode" text;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referredByKolCode" text;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralAttachedAt" timestamp;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralCookieSetAt" timestamp;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolTierOverrideBps" integer;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolStatus" text NOT NULL DEFAULT 'active';
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralClicks" integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "partner_kol_code_lower_idx" ON "partner" (lower("kolCode"));
CREATE INDEX IF NOT EXISTS "partner_referred_by_user_idx" ON "partner" ("referredByUserId");
CREATE INDEX IF NOT EXISTS "partner_referred_by_kol_idx" ON "partner" (lower("referredByKolCode"));

CREATE TABLE IF NOT EXISTS "sale_buyer_binding" (
  "buyerWallet" text PRIMARY KEY NOT NULL,
  "peopleAddress" text,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "referrerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "kolCode" text,
  "source" text NOT NULL DEFAULT 'cookie',
  "cookieSetAt" timestamp,
  "boundAt" timestamp NOT NULL DEFAULT now(),
  "ipHash" text,
  "deviceHash" text
);

CREATE INDEX IF NOT EXISTS "sale_buyer_binding_user_idx" ON "sale_buyer_binding" ("userId");
CREATE INDEX IF NOT EXISTS "sale_buyer_binding_referrer_idx" ON "sale_buyer_binding" ("referrerUserId");
CREATE INDEX IF NOT EXISTS "sale_buyer_binding_kol_idx" ON "sale_buyer_binding" (lower("kolCode"));

CREATE TABLE IF NOT EXISTS "sale_chain_cursor" (
  "chainId" integer NOT NULL,
  "contractAddress" text NOT NULL,
  "lastScannedBlock" integer NOT NULL DEFAULT 0,
  "lastBlockHash" text,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("chainId", "contractAddress")
);

CREATE TABLE IF NOT EXISTS "sale_purchase" (
  "id" text PRIMARY KEY NOT NULL,
  "chainId" integer NOT NULL DEFAULT 8453,
  "contractAddress" text NOT NULL,
  "txHash" text NOT NULL,
  "logIndex" integer NOT NULL DEFAULT 0,
  "blockNumber" integer NOT NULL,
  "blockHash" text NOT NULL,
  "blockTimestamp" timestamp NOT NULL,
  "eventKind" text NOT NULL DEFAULT 'buy',
  "buyerAddress" text NOT NULL,
  "beneficiaryAddress" text NOT NULL,
  "tokenAddress" text NOT NULL,
  "usdMicro" numeric(38, 0) NOT NULL,
  "pplMicro" numeric(38, 0) NOT NULL,
  "soldAfterMicro" numeric(38, 0),
  "buyerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "referrerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "kolCode" text,
  "attributionMethod" text NOT NULL DEFAULT 'unattributed',
  "status" text NOT NULL DEFAULT 'confirmed',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sale_purchase_chain_tx_log_idx" ON "sale_purchase" ("chainId", lower("txHash"), "logIndex");
CREATE INDEX IF NOT EXISTS "sale_purchase_buyer_idx" ON "sale_purchase" ("buyerAddress", "blockTimestamp");
CREATE INDEX IF NOT EXISTS "sale_purchase_referrer_idx" ON "sale_purchase" ("referrerUserId", "status");
CREATE INDEX IF NOT EXISTS "sale_purchase_kol_idx" ON "sale_purchase" (lower("kolCode"), "status");

CREATE TABLE IF NOT EXISTS "referral_payout_batch" (
  "id" text PRIMARY KEY NOT NULL,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "periodKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "usdcAmountMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "pplAmountMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "usdcNetwork" text NOT NULL DEFAULT 'base',
  "pplNetwork" text NOT NULL DEFAULT 'people_mainnet',
  "usdcTxHash" text,
  "pplTxHash" text,
  "paidAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "referral_payout_batch_user_idx" ON "referral_payout_batch" ("beneficiaryUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "referral_commission_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "purchaseId" text NOT NULL REFERENCES "sale_purchase"("id") ON DELETE CASCADE,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "buyerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "buyerAddress" text NOT NULL,
  "program" text NOT NULL DEFAULT 'kol',
  "level" integer NOT NULL DEFAULT 1,
  "usdcRateBps" integer NOT NULL DEFAULT 700,
  "pplRateBps" integer NOT NULL DEFAULT 300,
  "usdPurchaseMicro" numeric(38, 0) NOT NULL,
  "pplPurchaseMicro" numeric(38, 0) NOT NULL,
  "grossUsdcMicro" numeric(38, 0) NOT NULL,
  "grossPplMicro" numeric(38, 0) NOT NULL,
  "clawedBackUsdcMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "clawedBackPplMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "netUsdcMicro" numeric(38, 0) NOT NULL,
  "netPplMicro" numeric(38, 0) NOT NULL,
  "usdcSettlementNetwork" text NOT NULL DEFAULT 'base',
  "pplSettlementNetwork" text NOT NULL DEFAULT 'people_mainnet',
  "isPplLocked" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "voidReason" text,
  "holdUntil" timestamp NOT NULL,
  "payoutBatchId" text REFERENCES "referral_payout_batch"("id") ON DELETE SET NULL,
  "paidTxHashBase" text,
  "paidTxHashPeople" text,
  "paidAt" timestamp,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_commission_idem_idx" ON "referral_commission_ledger" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "referral_commission_benef_status_idx" ON "referral_commission_ledger" ("beneficiaryUserId", "status", "holdUntil");
CREATE INDEX IF NOT EXISTS "referral_commission_buyer_idx" ON "referral_commission_ledger" ("buyerAddress", "status");
```

---

## 5. API Routes & Partner Cabinet UI (`/partner`)

### 5.1 API Endpoints
1. **`POST /api/partner/referral/attach`** (`website/src/app/api/partner/referral/attach/route.ts`):
   - Reads `people_partner_ref` cookie (or `refCookie` in body), attaches the signed-in user via `attachReferralIfEligible(userId, rawCookie)` using the cookie `setAt` window, and optionally binds `buyerWallet` in `sale_buyer_binding`.
2. **`GET /api/partner/cabinet`** (`website/src/app/api/partner/cabinet/route.ts`):
   - Returns the authenticated user's unified invite link (`/?ref=<code>`), optional custom KOL link (`/?ref=<kolCode>`), funnel metrics (`clicks`, `signUps`, `buyers`, `volumeUsdMicro`), earned USDC on Base (`pending / approved / paid / void`), earned PPL on PEOPLE mainnet (`pending / approved / paid / void`), active KOL tier (`7% / 9% / 12%` USDC + `3%` PPL) and progress to next tier, commission ledger rows, payout batches, and L1/L2 lines.
3. **`POST /api/partner/kol-code`** (`website/src/app/api/partner/kol-code/route.ts`):
   - Claims or updates the partner's custom alphanumeric code (`6–16` chars, `REFERRAL_CODE_RE`) so their unified link `/?ref=<kolCode>` resolves across all programs.

### 5.2 Partner Cabinet UI Components (`website/src/components/partner/`)
- `PartnerCabinet.tsx` — Main dashboard combining the unified link generator, 6-card funnel & earnings metrics grid, KOL volume tier progress bar, tabbed commission/payout ledger table, People Wallet status, and L1/L2 network lines.
- `PartnerLinkGenerator.tsx` — Displays the unified invite link (`/?ref=<code>`) with one-click copy and optional custom KOL code claim form.
- `PartnerMetricsGrid.tsx` — Displays Link Clicks, Referred Sign-Ups, Confirmed Buyers, Referred Volume (USD), Earned USDC (Base), and Earned PPL (PEOPLE Mainnet).
- `PartnerTierProgress.tsx` — Shows Tier 1 (`7%`), Tier 2 (`9%` at `$25k`), and Tier 3 (`12%` at `$100k`) USDC + `3%` PPL progress.
- `PartnerPayoutHistory.tsx` — Tabbed view of Commission Ledger (`pending / approved / paid / void`) and Payout History (`USDC on Base` + `PPL on PEOPLE Mainnet`), with clean empty states.
- `cabinet-copy.ts` — 100% English-only UI copy (`PARTNER_CABINET_EN`), verified by automated Cyrillic-character rejection test.

---

## 6. Test Plan
1. `website/src/lib/partner/referral.test.ts` — `people_partner_ref` serialization/parsing, 30-day cookie `setAt` window vs 24h fallback, `MAX_PARTNER_REFERRAL_DEPTH = 2` (L1/L2 allowed, depth 3 rejected with `depth_exceeded`), cycle rejection, L1/L2 listing.
2. `website/src/lib/partner/commission.test.ts` — `7% / 9% / 12%` USDC + `3%` PPL tiers, configurable thresholds, tier progress calculation, 30-day hold maturity, LIFO curve sell-back clawbacks, and Genesis Quest PPL lock invariant.
3. `website/src/lib/partner/bought-matcher.test.ts` — Base `PplCurveHub` `Bought`/`Sold` log decoding, buyer attribution waterfall (`sale_binding` / `sale_buyer_binding` / account wallet / unattributed), `>= 5` confirmations, idempotency, reorg voiding, self-referral & cluster abuse guards, and mock RPC transport.
4. `website/src/lib/partner/service-referral.test.ts` — End-to-end PGlite DB test for `attachReferralIfEligible` with `people_partner_ref` cookie `setAt`, `claimKolCode`, `bindBuyerWalletForReferral`, `loadCabinet`, and English-only copy check.
5. `website/scripts/partner-db-bootstrap.test.mjs` — Verifies `REFERRAL_KOL_SCHEMA_STATEMENTS` mirrors `drizzle/0023_referral_kol_attribution.sql` and is idempotent DDL.
