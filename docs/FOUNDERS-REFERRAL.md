# Million Founders — referral bounty (2 levels)

**Status:** `IMPLEMENTED` (website off-chain ledger, internal testnet). Not `PRODUCTION-READY`.
All numeric values below are **PROVISIONAL** and live as constants in `website/src/lib/founders/referral.ts`.
Items marked `TBD` need a founder decision. PPL payout is **accounting only** until a mainnet distribution contract exists.

Not to be confused with the 15% fee partner split (Beta L1=70 / L2=30 of the Growth reward budget) — a separate mechanism.

## Funding (no mint)

- Million Founders program pool: 50M PPL of the 350M community pool (existing). Split (owner decision 2026-11-01): Season 1 founder points 15M, referral pool 10M, Genesis Quest up to 25M (see `GENESIS-QUEST.md`).
- Referral share: **10M PPL** (1% of 1B supply; was 15M, 5M moved to the Genesis Quest). Season 1 budget: **6M PPL**, later seasons 4M.
- The program stops when the season pool is empty; the last credit is truncated to the remainder. Nothing is minted.
- PPL per referral point: `1` — **TBD** (founder decision). Spent points are tracked in `founder_referral_pool`.

## Active invitee

All required, otherwise 0 points:

1. Verified via the Telegram phone bot or Human Passport (`founder.verifiedAt`, set only by those two flows; the registration-time level bump for invitees of strong inviters and World ID do **not** set it).
2. Wallet created.
3. At least one real testnet action in the points ledger: `swap`, `pool_create`, `nft_mint`, `token_launch`, `governance_vote`. Discover reactions/follows do not count.

Registration alone = 0. The legacy flat `invite` (300 pts) action is retired and rejected by `awardFounderPoints`.

## Rewards

| Level | Rule |
| --- | --- |
| L1 | 100 points per own active invitee (once per invitee per season) |
| L2 | 30% (floor) of what the direct invitee earned for their own active invitees. Not deducted from the invitee. |

Only two levels. L2 beneficiary = the inviter's inviter, if verified and not a bot.

Extra L1 points (L2 gets 30% of each), once per invitee per kind. Points are earned only for the **real actions of verified invitees** — buying PPL in a sale and joining another project's airdrop are **not** rewarded. **Defaults are proposals** — `TBD` founder approval:

| Kind | Points | Trigger |
| --- | --- | --- |
| `stay_7d` | 10 | Invitee has a real action ≥ 7 days after activation (settled lazily on action and on the inviter's page load) |

The retired `sale_buy` (20) and `airdrop_join` (10) kinds are gone from `REFERRAL_EXTRA_POINTS`; `POST /api/founders/referral/events` now accepts only `issuer_purchase` and answers `invalid_kind` for anything else.

## Limits

- Max **50** active invitees per person per season; above that only with ambassador status (`founder_referral_ambassador`, set via `POST /api/founders/admin/referral-ambassador`, admin only, cap must exceed 50).
- Daily cap: **1000** points per beneficiary per UTC day — same value as `FOUNDER_DAILY_TOTAL_CAP`, counted on the referral ledger separately (not shared with action points). A credit blocked by the daily cap is not recorded and is retried on the invitee's next real action.
- Bot clawback (`markFounderAsBot`) deletes all credits sourced from the invitee, refunds the pool and frees the cap slot.

## Vesting

Reuses the founders mainnet schedule (`reward-rules.ts`): **10% liquid at once, 90% in equal weekly slices over 52 weeks**, per credit from its credit time, exact total on week 52. Claims (`POST /api/founders/referral/claim`) queue the vested-minus-claimed amount in `founder_referral_claim` (`status=queued`). The existing "pause when inactive" founders rule is **not** applied to referral PPL (not specified).

## Issuer option (token launch)

Optional checkbox on `/create/token`, **off by default**. When on, the issuer reserves an extra share (default 5% of supply, max 10%, provisional) beyond the mandatory 10% community share. It is paid on invitees' **purchases** of that token: L1 = `l1Bps` of the purchase (default 5%, **TBD**), L2 = 30% of L1, same vesting, bounded by the reserved allocation.

Current limits (honest): accounting is off-chain (`founder_issuer_referral_*`); purchases are recorded only by a trusted backend through `POST /api/founders/referral/events` (bearer `FOUNDERS_REFERRAL_INDEXER_TOKEN`; 503 if unset) — there is no on-chain purchase indexer yet; the reserved share is not escrowed on-chain; the issuer's ownership of the token address is not verified on-chain at registration (first registration wins). No Solidity/factory change in this PR.

## Persistence

`drizzle/0011_founder_referral.sql` (also applied by `bootstrap.ts`): `founder.verifiedAt`, `founder_referral_activation` (activity proof), `founder_referral_credit`, `founder_referral_pool`, `founder_referral_ambassador`, `founder_referral_claim`, `founder_issuer_referral_program`, `founder_issuer_referral_credit`.

## UI

`/founders`: referral link `?ref=<wallet>`, active vs inactive invitees, L1/L2/extra points, remaining season pool, daily/cap lines, vesting schedule and claim. RU/EN copy (other languages fall back to EN).

## Tests

`scripts/referral-rules.test.mjs` (pure rules) and `scripts/referral-service.integration.test.mjs` (real SQL on PGlite): inactive earns 0, L1/L2 math, 50-cap + ambassador, daily cap, pool exhaustion, vesting 10%/weekly, claims, bot clawback, issuer option off by default.
