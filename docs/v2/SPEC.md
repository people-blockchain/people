# PplCurveHub v2 — specification, architecture, threat model

Status: **draft for review (milestone a)**. No code yet. Target: Base Sepolia tests green by 2026-11-20.
Supersedes the sale part of `docs/PPL-CURVE-HUB.md` once v2 ships. v1 hub `0x84388772788B7a383Dc2a0bDCd655D15A8279DC8`
(Base mainnet) is **deprecated and must never be opened** (decision 8).

Source of truth for numbers: `website/src/lib/sale/config.ts` (`CURVE`, `SALE`, `SELL_BACK`) and v1
`contracts/src/sale/PplCurveHub.sol`. Every number below is copied from there or from Alex's approved decisions;
v2 adds no new economic constants.

## 1. Approved decisions (input)

| # | Decision |
|---|---|
| D1 | α = 50%: half of each purchase stays in the hub as sell-back reserve, half goes to treasury Safe `0x60E8F06E8E7db0C6f8c5B388c00485DF08790AB6`. Owner = same Safe (2-of-3). |
| D2 | Sell-back fee stays in the reserve. |
| D3 | If 24 months pass without graduation, sell-back keeps working with the same limits while the reserve has funds. Unsold PPL → Community Pool. |
| D4 | First 7 days after open: verified buyers only (one address per person), buy limits unchanged; then open to all. |
| D5 | No absolute minimum sell-back limit; `/buy` shows the current daily sell-back limit. |
| D6 | Limits are counted per address on-chain; one person = one address is enforced by binding at verification. |
| D7 | Reserve only in USDC. Hub accepts USDC only; USDT is swapped to USDC on `/buy` (LI.FI). Hub never swaps. |
| D8 | v1 hub `0x8438…9DC8` never opened; mark deprecated in docs/config. |
| D9 | Sell-back price is curve-at-exit and **moves the price down the curve**. |
| D10 | 3% fee threshold as on site/config (`feeHighThresholdReservePct = 1`). |
| D11 | Optional `referrer` in `Bought`; `referrer ≠ msg.sender`, `referrer ≠ recipient`; accounting only. |

## 2. Constants (all `constant`/`immutable`, no setters)

| Name | Value | Source |
|---|---|---|
| `P0_WAD`, `K_WAD` | unchanged from v1 (`p0 = 0.005`, `k = ln(50)/100`) | v1 `PplCurveHub.sol:18-20`, `config.ts:29,33` |
| `SUPPLY_PPL` | 100_000_000e18 | `config.ts` `CURVE.supplyPpl` |
| `RAISE_CAP_USD6` | 4_000_000e6 | v1 `:93`, `config.ts` `graduationRaiseUsd` |
| `MIN_BUY_USD6` / `MAX_BUY_USD6` | 10e6 / 500e6 | v1 `:83-84`, `SALE.minPerBuyUsd/maxPerBuyUsd` |
| `BUY_CAP_24H_USD6` | 2_000e6 per address, rolling 24 h | v1 `:86`, `SALE.maxPerDayUsd` |
| `BUY_COOLDOWN` | 60 s per address | v1 `:88`, `SALE.cooldownSeconds` |
| `TERM` | 730 days from `open()` | v1 `:91`, `SALE.saleTermMonths = 24` |
| `WHITELIST_PERIOD` | 7 days from `open()` | D4 |
| `RESERVE_BPS` | 5_000 (50%) | D1 |
| `HOLD` | 30 days per lot | `SELL_BACK.holdDays` |
| `SELL_GLOBAL_CAP_BPS` | 200 (2% of day-start reserve) | `SELL_BACK.dailyCapReservePct` |
| `SELL_CAP_DAY_USD6` | 2_000e6 per address per UTC day | `SELL_BACK.perPersonPerDayUsd` |
| `FEE_LOW_BPS` / `FEE_HIGH_BPS` | 150 / 300 | `SELL_BACK.feePct/feeHighPct` |
| `FEE_HIGH_THRESHOLD_BPS` | 100 (1% of day-start reserve) | `SELL_BACK.feeHighThresholdReservePct` |
| `MAX_LOTS_PER_SELL` | small constant (gas bound; value fixed in code review, not economic) | — |
| `usdc` | immutable; Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Sepolia: MockUSDC (6 dec) | D7 |
| `treasury` | immutable, constructor arg (mainnet = Safe above) | D1 |

## 3. State

```solidity
address public verifier;                 // EIP-712 attestation signer; owner-rotatable
uint64  public openedAt;                 // 0 until open()
bool    public graduated;
bool    public reserveReleased;          // post-graduation release done

uint256 public raisedUsd6;               // NET curve position (buys − sell-back gross)
uint256 public soldPpl;                  // NET PPL on the curve (18 dec) == Σ pplOf
uint256 public reserveUsd6;              // USDC owed to sell-backs (accounted, not balanceOf)

mapping(address => uint256) public pplOf;          // per-address PPL ledger (delivered on PEOPLE network later)

// identity binding (D4, D6)
mapping(address => bytes32) public personOf;       // 0 = unverified
mapping(bytes32 => address) public accountOfPerson;
mapping(bytes32 => uint256) public bindNonce;       // bumped on unbind → old attestations dead

// lots (one per buy) — one storage slot each
struct Lot { uint40 boughtAt; uint96 cumBoughtUsd6; uint120 pplRemaining; }
mapping(address => Lot[]) internal _lots;
mapping(address => uint256) public lotHead;         // first lot with pplRemaining > 0 (FIFO)
mapping(address => uint64)  public lastBuyAt;       // cooldown

// sell-back day accounting (UTC day = block.timestamp / 1 days)
uint256 public sellDay;                  // current day index
uint256 public sellDayReserveSnapshot;   // reserveUsd6 at first sell-back of sellDay
uint256 public sellDayGrossUsd6;         // Σ gross sold back today (all users)
mapping(address => uint256) internal _sellDayOf;     // per-address day index
mapping(address => uint256) internal _sellUsedUsd6;  // per-address gross today
```

`cumBoughtUsd6` is the address's cumulative bought USD including this lot; the rolling-24h spend is
`cum(last) − cum(last lot with boughtAt ≤ now − 24h)`, found by binary search (O(log n) SLOADs, exact
"any 24 hours" semantics as promised on `/buy`, unlike a fixed window).

## 4. External interface

```solidity
// ---- user
function buy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer) external returns (uint256 pplOut);
function sellBack(uint256 pplIn, uint256 minUsdcOut) external returns (uint256 payoutUsd6);
function verify(bytes32 personId, uint256 deadline, bytes calldata sig) external; // binds msg.sender

// ---- owner (Safe)
function open() external;                       // once; sets openedAt
function pause() external; function unpause() external;
function setVerifier(address v) external;
function unbind(address account) external;      // lost wallet / abuse; bumps bindNonce
function releaseReserve() external;             // only after graduation → treasury
function rescue(address token, uint256 amount) external; // non-USDC, or USDC surplus above reserveUsd6
// renounceOwnership() always reverts; Ownable2Step for transfer.

// ---- views for /buy and /api/sale/config
function quoteBuy(uint256 usdcIn) external view returns (uint256 pplOut, uint256 chargedUsd6);
function quoteSellBack(address holder, uint256 pplIn) external view returns (uint256 gross, uint256 fee, uint256 payout);
function sellableNow(address holder) external view returns (uint256 ppl);       // unlocked lots
function sellBackCapToday() external view returns (uint256 globalRemainingUsd6, uint256 feeLowRemainingUsd6); // D5
function addressSellRemainingToday(address) external view returns (uint256);
function buyRemaining24h(address) external view returns (uint256);
function nextBuyAt(address) external view returns (uint256);
function phase() external view returns (Phase); // NotOpen, Whitelist, Open, Expired, Graduated
function lots(address, uint256 from, uint256 n) external view returns (Lot[] memory);
```

`Phase` (derived, never stored): `NotOpen` (openedAt = 0) → `Whitelist` (now < openedAt + 7d) → `Open`
(now < openedAt + TERM) → `Expired` (now ≥ openedAt + TERM, not graduated) | `Graduated` (terminal, can occur
from Whitelist/Open). `paused` is orthogonal.

## 5. Flows

### 5.1 buy
1. `whenNotPaused`, `nonReentrant`; phase ∈ {Whitelist, Open}.
2. `recipient != 0`; if Whitelist: `personOf[recipient] != 0`.
3. `referrer == 0 || (referrer != msg.sender && referrer != recipient)`.
4. `usdcIn ≥ MIN_BUY_USD6` (except the final partial fill, see 6) and `≤ MAX_BUY_USD6`.
5. `now ≥ lastBuyAt[recipient] + BUY_COOLDOWN`.
6. Clamp to `RAISE_CAP_USD6 − raisedUsd6` (charged ≤ usdcIn; remainder simply not pulled — as v1 `_fill`).
7. `rolling24h(recipient) + charged ≤ BUY_CAP_24H_USD6`.
8. `newRaised = raisedUsd6 + charged`; `newSold = soldForRaised(newRaised)` (v1 math, rounds down);
   `pplOut = newSold − soldPpl`; require `pplOut > 0 && pplOut ≥ minPplOut`.
9. Split: `toTreasury = charged * (10_000 − RESERVE_BPS) / 10_000` (floor), `toReserve = charged − toTreasury`
   (rounding favours reserve).
10. Effects: update raised/sold/reserve/pplOf, push lot, `lastBuyAt`; if `newRaised ≥ RAISE_CAP_USD6` →
    `graduated = true`, emit `Graduated`.
11. Interactions: `usdc.safeTransferFrom(msg.sender, address(this), toReserve)`,
    `usdc.safeTransferFrom(msg.sender, treasury, toTreasury)`.
12. Emit `Bought`.

Payer = `msg.sender` (wallet or LI.FI executor); limits, cooldown, whitelist and lots bind to `recipient` (D6).

### 5.2 sellBack (curve-at-exit, D9)
1. `whenNotPaused`, `nonReentrant`; `!graduated`; `openedAt != 0` (works in Open, Whitelist, Expired — D3).
2. `personOf[msg.sender] != 0` (verified only).
3. Consume FIFO from `lotHead[msg.sender]`: only lots with `boughtAt + HOLD ≤ now`; ≤ `MAX_LOTS_PER_SELL`
   lots touched; revert `NotEnoughUnlocked` otherwise. Partial lot allowed.
4. `newSold = soldPpl − pplIn`; `newRaised = raisedForSold(newSold)` (**rounds up**);
   `gross = raisedUsd6 − newRaised` (so gross rounds down, favours reserve).
5. Day roll: if `today != sellDay` → `sellDay = today; sellDayReserveSnapshot = reserveUsd6; sellDayGrossUsd6 = 0`.
6. Global cap: `sellDayGrossUsd6 + gross ≤ snapshot * 200 / 10_000`.
7. Address cap: `addrUsedToday + gross ≤ SELL_CAP_DAY_USD6`.
8. Fee (marginal, D10): `low = min(gross, max(0, snapshot*100/10_000 − sellDayGrossUsd6))`, `high = gross − low`;
   `fee = ceil(low*150/10_000) + ceil(high*300/10_000)`; `payout = gross − fee`.
9. `payout ≥ minUsdcOut`; `payout ≤ reserveUsd6` (else `ReserveExhausted`).
10. Effects: `soldPpl = newSold; raisedUsd6 = newRaised; reserveUsd6 −= payout` (fee stays, D2);
    `pplOf −= pplIn`; lots/`lotHead`; day counters.
11. `usdc.safeTransfer(msg.sender, payout)`; emit `SoldBack`.

Fee semantics note: site copy says "3% when that day's sell-backs already exceed 1% of the reserve". The marginal
split charges 3% only on the part of a sell-back above the 1% line, so one large sale cannot dodge the high fee and
a sale fully below the line pays 1.5%. Copy stays truthful; flagged as Q3.

### 5.3 verify (D4, D6)
Backend (website, after Human Passport / Telegram success) signs EIP-712
`Verification(address account, bytes32 personId, uint256 nonce, uint256 deadline)` with the `verifier` key.
`personId = keccak256(serverSecret, provider, providerUniqueId)` — no PII on-chain.
Contract: `now ≤ deadline`, signer == `verifier`, `nonce == bindNonce[personId]`, `personOf[msg.sender] == 0`,
`accountOfPerson[personId] == 0` → bind both directions, emit `Verified`. One person ↔ one address, permanent
until owner `unbind` (bumps `bindNonce`, emits `Unbound`). Unbinding does **not** move lots or `pplOf`.

### 5.4 Graduation
Triggered inside `buy` when `raisedUsd6` reaches `RAISE_CAP_USD6`. Effects: buys and sell-backs stop forever.
`releaseReserve()` (owner, once, only if graduated) sends `reserveUsd6` to `treasury`, zeroes it, emits
`ReserveReleased`. The 50/50 liquidity/multisig split and LP lock from site copy remain **off-chain Safe
operations with public reporting** (PPL is not a Base token; the pool cannot be created by this contract).
Unsold PPL = `SUPPLY_PPL − soldPpl` (view `unsoldPpl()`) → Community Pool on the PEOPLE network.

### 5.5 Expiry without graduation (D3)
At `openedAt + TERM` buys stop. Sell-back continues with identical limits while `reserveUsd6 > 0`.
`unsoldPpl()` → Community Pool. No owner path to withdraw reserve in this phase (see Q1).

### 5.6 Pause
Owner can pause/unpause `buy` and `sellBack` together. `verify` and views work while paused. Pause does not
extend `TERM` (same as v1). Pause cannot move funds.

## 6. Enforcement matrix (every promise → check → test)

Test file `contracts/test/PplCurveHubV2.t.sol` (+ `PplCurveHubV2.invariant.t.sol`), style `test_<camelCase>` /
`testFuzz_` / `invariant_` as in v1.

| Promise (site / decision) | On-chain check | Test(s) |
|---|---|---|
| Curve `p0·e^(k·x)` | v1 `PplCurveMath` + new `expWad`, `raisedForSold` | `test_curveMatchesV1`, `testFuzz_raisedSoldRoundTrip` |
| $10 min per buy | `usdcIn ≥ MIN_BUY_USD6` | `test_buyRevertsBelowMin`, `test_buyAtMinSucceeds` |
| $500 max per buy | `usdcIn ≤ MAX_BUY_USD6` | `test_buyRevertsAboveMax` |
| $2k per address any 24 h | rolling sum via `cumBoughtUsd6` | `test_buyCapRolling24h`, `test_buyCapNoWindowBoundaryBypass`, `test_buyCapCountsRecipientNotPayer` |
| 60 s pause | `lastBuyAt[recipient] + 60` | `test_cooldown`, `test_cooldownPerRecipient` |
| Slippage 1% (UI sets minPplOut) | `pplOut ≥ minPplOut` | `test_buySlippage` |
| USDC only (D7) | single immutable token | `test_onlyUsdcPulled` |
| 50/50 split (D1) | `toReserve`/`toTreasury` | `test_buySplitsHalfToReserve`, `testFuzz_splitRoundingFavoursReserve` |
| Whitelist first 7 days (D4) | phase + `personOf[recipient]` | `test_whitelistRejectsUnverified`, `test_whitelistAcceptsVerified`, `test_whitelistEndsAfter7Days` |
| One address per person (D6) | binding both directions | `test_verifyBindsOnce`, `test_verifySecondAddressSamePersonReverts`, `test_verifyExpiredSig`, `test_verifyWrongSigner`, `test_unbindInvalidatesOldSig` |
| Sale term 24 months, no extension | `now < openedAt + TERM` | `test_buyRevertsAfterTerm`, `test_pauseDoesNotExtendTerm` |
| $4M graduation, partial last fill | clamp + `graduated` | `test_graduationAtCap`, `test_graduationPartialFillChargesRemainder`, `test_buyAfterGraduationReverts` |
| Sell-back verified only | `personOf[msg.sender]` | `test_sellBackRequiresVerified` |
| 30-day hold per lot | `boughtAt + HOLD ≤ now` | `test_sellBackLockedLotReverts`, `test_sellBackUnlocksPerLot`, `test_sellBackFifoSkipsNothing` |
| Curve-at-exit, price moves down (D9) | `raisedForSold(newSold)` | `test_sellBackMovesPriceDown`, `testFuzz_buySellRoundTripNoProfit` |
| 2% of reserve per day (global) | day snapshot cap | `test_sellBackGlobalCap`, `test_sellBackGlobalCapResetsNextUtcDay`, `test_sellBackCapUsesDayStartSnapshot` |
| $2k per address per day | per-address day counter | `test_sellBackAddressCap`, `test_sellBackAddressCapResetsNextDay` |
| Fee 1.5% / 3% above 1% | marginal split | `test_feeLowBelowThreshold`, `test_feeHighAboveThreshold`, `test_feeSplitAcrossThreshold` |
| Fee stays in reserve (D2) | `reserveUsd6 −= payout` | `test_feeStaysInReserve` |
| Closes at graduation | `!graduated` | `test_sellBackClosedAfterGraduation` |
| Works after 24 months (D3) | no term check in sellBack | `test_sellBackWorksAfterExpiry` |
| Reserve exhausted | `payout ≤ reserveUsd6` | `test_sellBackRevertsWhenReserveEmpty` |
| No refunds | no refund path exists | (absence; reviewed) |
| Unsold → Community Pool | `unsoldPpl()` view | `test_unsoldPplAfterExpiry`, `test_unsoldPplAfterGraduation` |
| Referrer (D11) | `≠ msg.sender`, `≠ recipient` | `test_referrerEmitted`, `test_referrerSelfReverts`, `test_referrerRecipientReverts`, `test_referrerZeroOk` |
| Owner cannot touch reserve before graduation | `releaseReserve` gated, `rescue` surplus-only | `test_releaseReserveBeforeGraduationReverts`, `test_rescueCannotTakeReserve` |
| Pause | `whenNotPaused` | `test_pauseBlocksBuyAndSell`, `test_onlyOwnerAdmin` |
| Renounce disabled | revert | `test_renounceReverts` |
| Mainnet USDC fork | — | `test_forkBaseUsdcEndToEnd` (fork, skipped without RPC) |

## 7. Invariants (handler-based, `forge` invariant testing)

1. `usdc.balanceOf(hub) ≥ reserveUsd6` (I-solvency).
2. `reserveUsd6 == Σ toReserve − Σ payout` (ghost accounting; fee never leaves).
3. `soldPpl == Σ pplOf == Σ lots.pplRemaining`.
4. `soldPpl == soldForRaised(raisedUsd6)` within 1 wei-PPL rounding tolerance per op; `raisedUsd6 ≤ RAISE_CAP_USD6`.
5. `Σ treasury inflow == Σ charged − Σ toReserve`.
6. Per UTC day: `sellDayGrossUsd6 ≤ 2% · sellDayReserveSnapshot`; per address per day ≤ 2_000e6.
7. Per address any 24 h bought ≤ 2_000e6.
8. No lot sold back before `boughtAt + HOLD`.
9. After `graduated`: no state change except `releaseReserve`/`rescue`.
10. Round-trip (buy then sell same PPL, no other actors) never pays out more than was paid in.

## 8. Events

```solidity
event Bought(address indexed buyer, address indexed recipient, address indexed referrer,
             uint256 usdcIn, uint256 toReserve, uint256 pplOut, uint256 lotId);
event SoldBack(address indexed holder, uint256 pplIn, uint256 grossUsd6, uint256 feeUsd6, uint256 payoutUsd6);
event Verified(address indexed account, bytes32 indexed personId);
event Unbound(address indexed account, bytes32 indexed personId);
event VerifierSet(address indexed previous, address indexed current);
event SaleOpened(uint256 openedAt, uint256 whitelistEndsAt, uint256 closesAt);
event Graduated(uint256 raisedUsd6, uint256 soldPpl, uint256 reserveUsd6);
event ReserveReleased(address indexed to, uint256 amount);
event Rescued(address indexed token, uint256 amount);
```
ABI differs from v1 (`buyWith(token,…)` → `buy(…)`); website must use a v2-specific ABI and never call v1.

## 9. Roles

| Role | Holder | Powers | Cannot |
|---|---|---|---|
| owner | Safe 2-of-3 (mainnet); throwaway EOA on Sepolia | open, pause/unpause, setVerifier, unbind, releaseReserve (post-graduation), rescue surplus, 2-step transfer | change constants/curve/limits, withdraw reserve before graduation, extend term, mint PPL, renounce |
| treasury | immutable, = Safe | receives 50% of every buy and released reserve | — |
| verifier | website backend key (new) | sign bindings | buy/sell on others' behalf, move funds |

## 10. Threat model

| Threat | Impact | Mitigation | Residual |
|---|---|---|---|
| Verifier key leak | attacker mints many "persons" → bypass whitelist & per-person limits, gains sell-back access | owner `setVerifier` rotation + `pause`; global 2%/day cap bounds drain; hold 30 d delays sell-back; key in server KMS/env, never in repo | Safe reaction time |
| Sybil (real people renting identities) | per-person limits diluted | binding uniqueness by provider id; caps are per address | accepted |
| Bank run on reserve | holders compete for 2%/day | per-day cap + per-address cap; reserve can only fall by ≤ 2% of day-start snapshot per day | early-stage daily cap is small in absolute terms (D5: shown honestly) |
| Front-running / sandwich | profit extraction | 30-day hold makes buy→sell sandwich impossible; slippage `minPplOut`/`minUsdcOut` | first-come race for daily cap |
| Rounding / dust abuse | drain reserve via rounding | buy rounds PPL down, sell rounds gross down & fee up; min $10 buy; fuzz round-trip test | — |
| Griefing via `recipient` | attacker buys $10 for victim → consumes victim's cooldown/24 h cap | costs attacker ≥ $10 per 60 s and gives victim PPL | accepted, documented |
| Gas DoS on lots | many tiny lots make sellBack expensive | FIFO head pointer, `MAX_LOTS_PER_SELL`, partial sells | user may need several txs |
| Reentrancy | — | `nonReentrant`, CEI, USDC has no hooks | — |
| USDC blacklist / upgrade (Circle) | reserve frozen | none on-chain | external, disclose |
| Owner abuse (pause forever) | sell-back blocked | pause cannot move funds; Safe 2-of-3; public | trust in Safe (Q2) |
| Owner `unbind` abuse | user loses verified status | does not touch lots/pplOf; event emitted | trust in Safe |
| Referral self-dealing | fake referrals | `≠ msg.sender/recipient`; payouts off-chain on net (not sold-back) volume after hold | sybil referrers |
| Wrong contract (v1) used by UI | funds to v1 | v1 never opened → `buyWith` reverts; site config points only to v2 | — |
| Timestamp skew | ± seconds on cooldown/day roll | Base sequencer timestamps; tolerances irrelevant at 60 s / 1 day | — |
| Graduation sniping | last buyer partial fill | charged = remainder only; event shows exact amounts | — |
| Holders locked at graduation | lots < 30 d old cannot be sold; transfers open only at network launch | disclose on /buy (already says sell-back closes at graduation) | UX copy |
| USDT→USDC swap slippage / depeg / bad route (off-contract, §12) | user gets less USDC than expected | hard slippage cap on the LI.FI request, depeg floor, expected USDC shown before signing; hub never swaps | LI.FI / DEX risk on the user's side |
| Swap OK, `buy` reverts (cap, cooldown, graduation, slippage) | user stuck between steps | user keeps USDC in own wallet; `/buy` offers one-button "buy with USDC"; atomic LI.FI contract call preferred | two-tx path needs a second signature |
| Unlimited token approval (USDT to LI.FI, USDC to hub) | wallet drained if spender is compromised | approve exactly the amount of this purchase, never `MaxUint256`; tested in UI unit tests | — |
| Malicious LI.FI calldata / spoofed aggregator | funds to attacker | only LI.FI official API; verify `transactionRequest.to` against the LI.FI Diamond allowlist and that the destination call targets the v2 hub with `recipient = connected wallet` | aggregator trust |

## 11. Deployment & tooling plan

- Contract: `contracts/src/sale/PplCurveHubV2.sol` (v1 untouched); shared math extended in `PplCurveMath`.
- Script: `contracts/script/DeployPplCurveHubV2.s.sol`; Base Sepolia only, MockUSDC (6 dec), throwaway owner key in
  `.sepolia-test.env` (gitignored, chmod 600), test verifier key. Mainnet path refuses to run (chainId guard).
- Output: `contracts/deployments/base-sepolia-v2.json` (same keys as `base-sepolia.json`).
- E2E script: verify → whitelist buy → warp-free Sepolia checks (buy, caps, views); hold/day logic covered by forge tests with `vm.warp`.
- Static analysis: Slither / Aderyn if installable; findings triaged in `docs/v2/REVIEW.md`.
- CI: existing `contracts-ci.yml` picks up new tests; OZ submodule must be initialized locally (`contracts/lib` empty now).
- Website (separate branch/PR): see §12.

## 12. Site (/buy v2) — payment path and UX (addenda, agreed by Alex + ElonBot)

### 12.1 USDT → USDC (off-contract, D7)
- Hub accepts **USDC only** and never swaps. `/buy` swaps USDT→USDC on Base via LI.FI, then calls `buy`.
- **Hard slippage cap on the swap: 0.5% (`slippage=0.005` in the LI.FI request)**, enforced client-side and in
  the route request (never the LI.FI default). Basis — LI.FI quotes, Base, 2026-10-27, `li.quest/v1/quote`:

  | USDT in | USDC out (`toAmount`) | LI.FI fee (`feeCosts`, 0.25%) | price impact after fee | LI.FI default slippage |
  |---|---|---|---|---|
  | 500 | 498.096375 | $1.2459 | (498.75 − 498.096375)/498.75 = 0.131% | 0.913% |
  | 2 000 (max per day) | 1 991.474046 | $4.9835 | (1 995 − 1 991.474046)/1 995 = 0.177% | 0.913% |

  0.5% leaves ~3× headroom over the observed impact at the per-day maximum and is tighter than the LI.FI default.
  **Depeg floor:** refuse the route if `toAmountMin < 99%` of USDT in (observed total cost incl. fee: 0.38–0.43%).
  Re-check the quote on Sepolia/mainnet before launch; numbers live in `website/src/lib/sale/config.ts`, not hard-coded in UI.
- Show expected USDC (`toAmount`) and its minimum before signing. `buy` always gets
  `minPplOut = quoteBuy(toAmountMin) × (1 − 1%)` (existing site promise: >1% move cancels).
- **Approvals: exact amount only** (USDT→LI.FI spender, USDC→hub). Never `MaxUint256`.
- **Preferred: one atomic tx** — LI.FI contract call (swap → `hub.buy(usdcOut, minPplOut, wallet, referrer)`).
  **Acceptable fallback: two txs** (swap, then approve+buy).
- **Swap succeeded, buy failed:** user keeps the USDC on Base; `/buy` shows one button
  «У вас X USDC на Base, докупить PPL» (X = actual on-chain USDC balance delta).
- Copy: «USDT автоматически меняется на USDC, небольшая комиссия обмена». Sell-back always pays out in USDC.

### 12.2 /buy v2 UX (no explanatory blocks about the aggregator)
Before **Buy**, show only:
1. Network, token (USDT/USDC) and amount.
2. PPL estimate + guaranteed minimum (`minPplOut`).
3. All fees in $ on one line (swap/bridge + gas); tap to expand the breakdown.
4. Current PPL price on the curve (spot).
5. ETA — only if the source network is not Base (LI.FI `executionDuration`).
6. One small-print line: «Обмен через LI.FI, покупка в USDC на Base».
7. Next to the button: «Продать обратно можно через 30 дней, лимиты выкупа — подробнее» (link to sell-back rules,
   incl. today's limit from `sellBackCapToday()`, D5).

After purchase: PPL credited (`pplOut` from `Bought`), tx link (Basescan), and the date the lot's sell-back unlocks
(`boughtAt + 30 days`).
Swap OK / buy failed: the single button from 12.1.
All strings in all 12 locales. Playwright screenshots of /buy at 360, 390 and desktop widths before the UI PR.

### 12.3 Other website changes (separate branch/PR)
v2 ABI + address in sale config, v1 marked deprecated; copy in 12 locales: D1 reserve text (B:193, B:234), D4
(B:247, LP:181/224), stale texts (180 days, "sell back at any time", $0.25 ceiling, Russian text in en T:102-103);
verifier-signing API route (§5.3).

## 13. Open questions for Alex

- **Q1** After expiry (D3), sell-back runs "while the reserve has funds" — is there ever an end (e.g. at PEOPLE
  network delivery snapshot), and who may then take leftover reserve? Proposed: owner can schedule a final
  snapshot ≥ 30 days ahead on-chain; after it sell-back closes and leftover reserve → treasury. Until answered,
  v2 has **no** path to withdraw reserve in Expired phase.
- **Q2** Delivery: once PPL is delivered on the PEOPLE network the Base ledger must freeze, otherwise a holder
  could sell back already-delivered PPL. Same mechanism as Q1?
- **Q3** Fee: marginal split (3% only on the part above the 1% line) vs whole-tx 3% once the line is already
  crossed. Spec uses marginal.
- **Q4** Verifier key custody (new backend secret) and `personId` derivation for Telegram vs Human Passport —
  can one person verify with both providers and get two bindings? Proposed: one personId namespace per provider
  is insufficient; need cross-provider dedupe in website DB before signing.
- **Q5** Global and per-address sell-back days use UTC calendar days; buys use rolling 24 h (site says "in any 24
  hours" for buys, "per day" for sell-back). OK?
