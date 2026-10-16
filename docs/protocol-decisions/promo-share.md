# Optional Creator Promo Share — node-side activation

Status: **APPROVED** by the owner (promo-share option 2026-10-13; per-recipient cap, 16-award
bound and 10%-upfront + 180-day linear vesting 2026-10-16, PR #298). Implemented in
`people-node` behind a single coordinated activation height, `NetworkConfig.promoShareUpgrade.height`,
set via `PROMO_SHARE_UPGRADE_HEIGHT` (`people-node/packages/core/src/promo-share.ts`). Omitted on
legacy networks — not part of genesis identity, same pattern as `securityUpgrade` and
`consensusUpgrade1`. **Subject to audit.**

The rule itself is not new. It was merged for the Solidity Token Factory and the website EVM
launch form in PR #298 (`contracts/src/libs/CurveMath.sol`, `contracts/src/promo/PromoRewardsVault.sol`,
`docs/TOKEN-ECONOMY.md` §4a). This document records how the **same** rule reaches the node's own
`applyTokenCreate` without forking a running network.

## The rule (unchanged from §4a)

| Promo share | `promoBps` | Bonding curve becomes |
| --- | ---: | ---: |
| None (default) | 0 | 60% |
| 5% of total supply | 500 | 55% |
| 10% of total supply | 1000 | 50% |

Nothing in between is accepted. The share is carved **entirely out of the bonding-curve
portion**; the mandatory 10% Community Pool, the 15% creator allocation, the 10% liquidity
reserve and the 5% ecosystem reserve are byte-for-byte identical at every promo share, so
`curve + community + creator + liquidity + ecosystem + promo == total supply` always holds.

Promo tokens are **not** credited to the creator. They sit in `ChainState.promoPools[assetId]`,
the node-side equivalent of the ownerless `PromoRewardsVault`, and may only leave it towards an
awarded recipient or — after the window — towards that token's Community Pool.

| Rule | Solidity | Node |
| --- | --- | --- |
| Only the creator may award | `msg.sender != p.creator` | `sender !== pool.creator` |
| Never to self, the vault or a protocol address | zero address / creator / token / vault / community vault | creator / genesis faucet / pinned bootstrap authority / non-canonical address |
| Per-recipient cap | `PROMO_RECIPIENT_CAP_BPS` = 1000 bps of the pool | `promoRecipientCap` = 1000 bps of the pool |
| Awards per recipient | `PROMO_MAX_AWARDS_PER_RECIPIENT` = 16 | 16 |
| Vesting | 10% upfront + linear over `VESTING_DURATION` (180 days) | 10% upfront + linear over `PROMO_VESTING_BLOCKS` |
| Award window | `PROMO_WINDOW` = 180 days | `PROMO_WINDOW_BLOCKS` |
| Unused remainder | anyone calls `returnUnused` → `ICommunityTokenVault.creditPromoReturn` | anyone submits `promoReturn` → `allocateToCommunityPool` |

### Clock: blocks, not timestamps

The vault runs on `block.timestamp`. A node state transition has no trusted wall clock, so the
pool runs on block heights and reuses the horizon `CreatorVestingState.durationBlocks` already
uses: `PROMO_VESTING_BLOCKS = 5_184_000` (180 days at 3 s/block). `PROMO_WINDOW_BLOCKS` equals
it, mirroring `PROMO_WINDOW = VESTING_DURATION`, so a launch keeps a single economic clock.
`durationBlocks` and `windowBlocks` are stored **on each pool**, so changing the constant later
cannot rewrite the schedule of a pool that already exists.

This is an implementation choice forced by the node's execution model, not a change to the
approved 180-day horizon. At a block interval other than 3 s the wall-clock length of 5,184,000
blocks differs from 180 days; the block interval is itself a consensus parameter and is not
changed here.

## New transaction types

`promoAward`, `promoClaim`, `promoReturn`. They carry the ordinary `DEFAULT_TRANSFER_FEE`
(0.004875 PPL) and route it through Model A 30/25/20/10/15/0 exactly like every other eligible
`tx.fee` — **no new public tariff**, same decision AMM v0.1 took. Concretely they are members of
`PROTOCOL_TX_FEE_TYPES` (`packages/core/src/growth-pool.ts`), so `listEligibleFeeComponents`
classifies the fee as `protocol_tx_fee` and `routeEligibleTxFee` splits it; without that
membership the whole fee would land in the undivided `pendingValidatorFees` lump and the
community / treasury / liquidity / Growth buckets would get nothing. No new PPL issuance, no
change to Model A, Growth L1=70/L2=30, depth=2, pool 15%, Claim D or caps.

Below the activation height node-local mempool admission refuses all three outright (same reason
as the `promoBps` guard below): `applyPromoTransaction` would reject them at block apply anyway,
so refusing at submit time only turns a silent drop into an explicit error and keeps a hopeless
transaction out of the sender's single mempool slot.

## Activation and byte-identity

`promoShareActive(config, inclusionBlockHeight(state))` gates everything. Below the height, or
with the env var unset:

- `parsePromoBps` returns 0 and **ignores** a `promoBps` payload field, exactly as a pre-upgrade
  binary ignores an unknown payload key. Rejecting it instead would make an upgraded node
  disagree with a legacy peer on a block that carried the field, which is the fork this gate
  exists to prevent. Node-local mempool admission refuses such a transaction separately, so a
  creator submitting one gets an explicit error rather than a silent 0%.
- `applyTokenCreate` takes the pre-upgrade code path line for line: the same five allocation
  numbers, the same key order in the hashed `allocation` object (no `promo` key), the same curve
  state, the same community-pool, vesting and reserve writes.
- `ChainState.promoPools` is hashed in `computeStateRoot` **only while non-empty**, appended last.
  A chain that has never launched a token with a promo share hashes exactly the object the
  pre-promo-share binary hashed.
- `promoShareUpgrade` is stripped from the hashed `networkConfig` until its height
  (`normalizedNetworkConfigForRoot`) **and** from the genesis state root, so scheduling the
  upgrade on a live network does not move the genesis hash. At activation the schedule becomes
  committed configuration, the same rule `securityUpgrade` follows.

  *Pre-existing note, not changed here:* `consensusUpgrade1` **is** part of the genesis hash
  (`createGenesisBlock` only strips `securityUpgrade`), despite being documented as "not part of
  genesis identity". It is left as-is because it is already baked into the genesis of any network
  that scheduled it; correcting it would move that network's genesis and needs its own
  coordinated change.

`protocolVersion` remains **2**. Historical blocks contain no promo transactions and no
`promoBps` payloads, so genesis replay is unchanged.

## Startup rails

`NodeService.start` applies the same two rails `securityUpgrade`/`consensusUpgrade1` already get:

1. a height already pinned in this node's persisted `networkConfig` may not be silently changed
   or dropped by an env edit (`Promo share upgrade configuration changed`);
2. a height at or below the existing head is refused (`Promo share upgrade must be scheduled
   above the existing head`), so the fork cannot activate retroactively.

`GET /network` publishes `promoShareUpgrade`, and `scripts/node-network.mjs` pins it into a
joining node's env as `PROMO_SHARE_UPGRADE_HEIGHT` — CHAIN-H2's reason applies unchanged: a
joiner that never learns the height runs the legacy split past activation and splits off.

## Rollout

Operators set `PROMO_SHARE_UPGRADE_HEIGHT` to the agreed height on **every** node ahead of time,
following `docs/AUDIT-CRITICAL-FIXES.md` → "Coordinated testnet activation procedure". A network
with the env var unset never activates the feature and keeps exactly the pre-upgrade behaviour.

**No height is chosen in this change.** Picking H is an operator decision that requires the
current head of every peer; see the procedure for the constraint (H strictly above every head,
with time for the coordinated restart).

## Not in this change

- No REST/JSON-RPC read endpoints for promo pools, and no SDK helpers for the three new
  transaction types. Pools are visible in state and in `computeStateRoot`; a client submits the
  transactions through the existing generic submit path.
- No website UI for the node-side path (the EVM launch form already covers `contracts/`).
- No deploy. No activation height set on any running node.
