# PplCurveHub v2 — specification, architecture, threat model

Status: **milestone (b): implemented in `contracts/src/sale/PplCurveHubV2.sol`**. Target: Base Sepolia tests green by 2026-11-20.
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
| `BUY_CAP_DAY_USD6` | 2_000e6 per recipient address per UTC calendar day (Q5) | v1 `:86`, `SALE.maxPerDayUsd` |
| `BUY_COOLDOWN` | 60 s per address | v1 `:88`, `SALE.cooldownSeconds` |
| `TERM` | 730 days from `open()` | v1 `:91`, `SALE.saleTermMonths = 24` |
| `WHITELIST_PERIOD` | 7 days from `open()` | D4 |
| `RESERVE_BPS` | 5_000 (50%) | D1 |
| `HOLD` | 30 days per lot | `SELL_BACK.holdDays` |
| `SELL_GLOBAL_CAP_BPS` | 200 (2% of the reserve snapshot) over an exact rolling 24 hours, not a UTC day. Snapshot is taken when the global ring is empty and stays until every entry ages out. Ring capacity `GLOBAL_SELL_CAPACITY` (128) bounds the scan | `SELL_BACK.dailyCapReservePct` |
| `SELL_CAP_DAY_USD6` | 2_000e6 per person per exact rolling 24 hours | `SELL_BACK.perPersonPerDayUsd` |
| `FEE_LOW_BPS` / `FEE_HIGH_BPS` | 150 / 300, on the same rolling 24-hour gross | `SELL_BACK.feePct/feeHighPct` |
| `FEE_HIGH_THRESHOLD_BPS` | 100 (1% of the same reserve snapshot) | `SELL_BACK.feeHighThresholdReservePct` |
| `ADMIN_TIMELOCK` | 48 hours, immutable. `queueSetVerifier` / `queueSetReturnVerifier` / `queueSetTrustedRouter` / `queueRescue` then `execute*` after `eta`; `cancel(id)` by the owner. No immediate setter or token sweep. Liquidity release stays `LIQUIDITY_RELEASE_DELAY` (30 days), which is longer, and has no shorter path | — |
| `GRACE_PERIOD` | 14 days after `eta`: queued owner ops expire and cannot execute (prevents year-old queues). At most one pending op per `kind`; `pendingAdminOp(kind)` exposes `eta` and `dataHash` | Opus r2 M1 |
| `MAX_LOTS_PER_SELL` | 50 (gas bound per tx, not economic; larger sales = several txs) | — |
| `LIQUIDITY_RELEASE_DELAY` | 30 days public notice before reserve → liquidity (Q1; option B = 14 days) | Q1 |
| `usdc` | immutable; Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Sepolia: MockUSDC (6 dec) | D7 |
| `treasury` | immutable, constructor arg (mainnet = Safe above) | D1 |
| `liquidityReceiver` | immutable, constructor arg, `≠ treasury`, `≠ owner`, `≠ 0` — only exit of the reserve (Q1) | Q1 |

## 3. State

```solidity
address public verifier;                 // EIP-712 attestation signer; owner-rotatable
uint64  public openedAt;                 // 0 until open()
bool    public graduated;
uint64  public releaseAnnouncedAt;       // 0 = no pending reserve → liquidity release (Q1)
bool    public liquidityReleased;        // terminal: reserve moved to liquidityReceiver

uint256 public raisedUsd6;               // NET curve position (buys − sell-back gross)
uint256 public soldPpl;                  // NET PPL on the curve (18 dec) == Σ pplOf
uint256 public reserveUsd6;              // USDC owed to sell-backs (accounted, not balanceOf)

mapping(address => uint256) public pplOf;          // per-address PPL ledger (delivered on PEOPLE network later)
mapping(address => bool)    public delivered;      // Q2: frozen after delivery on PEOPLE network

// identity binding (D4, D6)
mapping(address => bytes32) public personOf;       // 0 = unverified
mapping(bytes32 => address) public accountOfPerson;
mapping(bytes32 => uint256) public bindNonce;       // bumped on unbind → old attestations dead

// lots (one per buy) — one storage slot each
struct Lot { uint40 boughtAt; uint96 boughtUsd6; uint120 pplRemaining; }
mapping(address => Lot[]) internal _lots;
mapping(address => uint256) public lotHead;         // first lot with pplRemaining > 0 (FIFO)
mapping(address => uint64)  public lastBuyAt;       // cooldown
// per-person buy and sell-back rings: exact rolling 24 hours (capacity 50)
// global sell-back ring: same approach, capacity GLOBAL_SELL_CAPACITY (128)
uint256 public sellWindowReserveSnapshot; // reserve when the global ring was empty
```

Buys, the per-person $2k sell-back cap, and the global 2% sell-back cap all count over an exact rolling
24 hours (`now < t + 24h` still counts; `t + 24h` has aged out). UTC midnight does not reset them.
The 1.5% / 3% fee line uses that same global ring and the same reserve snapshot.

## 4. External interface

```solidity
// ---- user
function buy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer) external returns (uint256 pplOut);
function sellBack(uint256 pplIn, uint256 minUsdcOut) external returns (uint256 payoutUsd6);
function verify(bytes32 personId, uint256 deadline, bytes calldata sig) external; // binds msg.sender

// ---- owner (Safe)
function open() external;                       // once; sets openedAt
function pause() external; function unpause() external;
function queueSetVerifier(address v) external returns (bytes32 id); // executes after 48h
function queueSetReturnVerifier(address v) external returns (bytes32 id);
function queueRescue(address token, uint256 amount) external returns (bytes32 id); // USDC surplus or any other token
function cancel(bytes32 id) external;
function unbind(address account) external;      // lost wallet / abuse; bumps bindNonce
function announceLiquidityRelease() external;   // Q1: public notice; then 30 d timelock
function cancelLiquidityRelease() external;
function executeLiquidityRelease() external;    // permissionless after the delay → liquidityReceiver
function markDelivered(address[] calldata holders) external; // Q2: freeze delivered records
function executeRescue(bytes32 id) external; // only after ADMIN_TIMELOCK; surplus re-checked
// renounceOwnership() always reverts; Ownable2Step for transfer.

// ---- views for /buy and /api/sale/config
function quoteBuy(uint256 usdcIn) external view returns (uint256 pplOut, uint256 chargedUsd6);
function quoteSellBack(address holder, uint256 pplIn) external view returns (uint256 gross, uint256 fee, uint256 payout);
function sellableNow(address holder) external view returns (uint256 ppl);       // unlocked lots
function sellableBalance(address account) external view returns (uint256 ppl); // bought − sold − locked lots (sell-back scan)
function liquidityReleaseExecutableAt() external view returns (uint256);      // announce + 30d + pause after announce
function pendingAdminOp(bytes32 kind) external view returns (bool active, bytes32 id, uint64 eta, bytes32 dataHash);
function sellBackCapToday() external view returns (uint256 globalRemainingUsd6, uint256 feeLowRemainingUsd6); // D5
function addressSellRemainingToday(address) external view returns (uint256);
function buyRemainingToday(address) external view returns (uint256);
function spotPriceWad() external view returns (uint256);  // current curve price, USD wad per PPL
function lotCount(address) external view returns (uint256);
function nextBuyAt(address) external view returns (uint256);
function phase() external view returns (Phase); // NotOpen, Whitelist, Open, Expired, Graduated
function lots(address, uint256 from, uint256 n) external view returns (Lot[] memory);
```

`Phase` (derived, never stored): `NotOpen` (openedAt = 0) → `Whitelist` (now < openedAt + 7d) → `Open`
(now < openedAt + TERM) → `Expired` (now ≥ openedAt + TERM, not graduated) | `Graduated` (terminal, can occur
from Whitelist/Open). `paused` is orthogonal.

## 5. Flows

### 5.1 buy
1. `whenNotPaused`, `nonReentrant`; phase ∈ {Whitelist, Open}; no pending/executed liquidity release.
2. `recipient != 0`; if Whitelist: `personOf[recipient] != 0`; `!delivered[recipient]`.
3. `referrer == 0 || (referrer != msg.sender && referrer != recipient)`.
4. `usdcIn ≥ MIN_BUY_USD6` (except the final partial fill, see 6) and `≤ MAX_BUY_USD6`.
5. `now ≥ lastBuyAt[recipient] + BUY_COOLDOWN`.
6. Clamp to `RAISE_CAP_USD6 − raisedUsd6` (charged ≤ usdcIn; remainder simply not pulled — as v1 `_fill`).
7. `boughtToday(recipient) + charged ≤ BUY_CAP_DAY_USD6` (exact rolling 24 hours).
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

**Reward PPL (§5.2 owner rule):** quest/founder rewards on the PEOPLE network live in `RewardVesting`
(`contracts/src/vesting/RewardVesting.sol`). Locked or unlocked reward balance must not be sold back
into the hub. On-chain: `PplReturnBurn` only accepts burns up to each sender's `hubPurchasedPpl`
(credited by the delivery relayer after hub buys); reward `claim` and plain transfers do not credit
that ledger. On Base, `sellBack` is capped by `_pplPurchasedViaHub − _pplReturnedViaSellBack` for
the bound person (in addition to unlocked lots). The hub's immutable `rewardBuyerForbidden` address
(if set) cannot `buy`, cannot be `recipient`, and cannot become `trustedRouter`. Curve sell-back
rights remain buy-lots only; `sellableBalance(account)` is the minimum of that hub cap and the
unlocked FIFO scan.

1. `whenNotPaused`, `nonReentrant`; `!graduated`; `!liquidityReleased`; `openedAt != 0` (works in Open, Whitelist,
   Expired — D3/Q1: never closed by time).
2. `personOf[msg.sender] != 0` (verified only); `!delivered[msg.sender]` (Q2).
3. Consume FIFO from `lotHead[msg.sender]`: only lots with `boughtAt + HOLD ≤ now`; ≤ `MAX_LOTS_PER_SELL`
   lots touched; revert `NotEnoughUnlocked` otherwise. Partial lot allowed.
4. `newSold = soldPpl − pplIn`; `newRaised = raisedForSold(newSold)` (**rounds up**);
   `gross = raisedUsd6 − newRaised` (so gross rounds down, favours reserve).
5. Global ring: prune entries with `timestamp + 24h <= now`. If none remain, `snapshot = reserveUsd6`;
   otherwise keep `sellWindowReserveSnapshot`.
6. Global cap: `windowGross + gross ≤ snapshot * 200 / 10_000`. Revert `GlobalWindowFull` if the ring
   already holds `GLOBAL_SELL_CAPACITY` live entries (gas bound).
7. Address cap: rolling-24h gross + this gross ≤ `SELL_CAP_DAY_USD6`.
8. Fee (marginal, same window): `low = min(gross, max(0, snapshot*100/10_000 − windowGross))`, `high = gross − low`;
   `fee = ceil(low*150/10_000) + ceil(high*300/10_000)`; `payout = gross − fee`.
9. `payout ≥ minUsdcOut`; `payout ≤ reserveUsd6` (else `ReserveExhausted`).
10. Effects: `soldPpl = newSold; raisedUsd6 = newRaised; reserveUsd6 −= payout` (fee stays, D2);
    `pplOf −= pplIn`; lots/`lotHead`; append the gross to the global ring and the person's ring.
11. `usdc.safeTransfer(msg.sender, payout)`; emit `SoldBack`.

Fee semantics: the marginal split charges 3% only on the part of a sell-back above the 1% line of the same
rolling-24-hour gross, so one large sale cannot dodge the high fee and a sale fully below the line pays 1.5%.

### 5.3 verify (D4, D6, Q4)
Backend (website) signs EIP-712 `Verification(address account, bytes32 personId, uint256 nonce, uint256 deadline)`
with the `verifier` key, reusing the site's existing verification flow. Q4 (Alex, 2026-10-27):
- signer key lives in a cloud KMS, sign-only, non-exportable; rotation/revocation only by the owner (Safe) via
  `queueSetVerifier` then `executeSetVerifier` after `ADMIN_TIMELOCK` (48 hours); `address(0)` revokes and all `verify` calls fail. `queueSetReturnVerifier` uses the same delay. There is no immediate setter;
- admission requires Human Passport (score threshold) **or** World ID; Telegram alone is not enough;
- backend stores hashes of all of a person's identifiers and refuses to sign if any of them is already bound to
  another address (cross-provider dedupe is off-chain);
- `personId = keccak256(serverSecret, canonical person key)` — no PII on-chain.
Contract (only the signature check): `now ≤ deadline` (expiry), signer == `verifier`, `nonce == bindNonce[personId]`,
`personOf[msg.sender] == 0`, `accountOfPerson[personId] == 0` → bind both directions, emit `Verified`. One
person ↔ one address, permanent until owner `unbind` (bumps `bindNonce`, emits `Unbound`). Unbinding does **not**
move lots or `pplOf`.

### 5.4 Reserve exit: graduation or PEOPLE launch, timelocked (Q1)
Q1 (Alex, 2026-10-27): the reserve can **never** be withdrawn to the Safe/treasury or the team. Its only exit
(besides sell-backs) is PPL liquidity at graduation or at the PEOPLE network launch, through a timelock with an
advance public notice.

Implemented: `liquidityReceiver` is an immutable constructor arg (`≠ treasury`, `≠ owner`, `≠ 0`).
`announceLiquidityRelease()` (owner, after `open`) records `releaseAnnouncedAt` and emits
`LiquidityReleaseAnnounced(to, reserve, executableAt, graduated)`; new buys stop while pending; sell-back keeps
working during the notice (unless graduated) so holders who disagree can exit within the rolling 24-hour limits.
`cancelLiquidityRelease()` (owner) reopens buys. `executeLiquidityRelease()` is **permissionless** once
`liquidityReleaseExecutableAt()` has passed (30-day notice plus any time paused after announce) and moves the full `reserveUsd6` to `liquidityReceiver`; terminal
(`liquidityReleased`), sell-back then closes. There is no other owner path that moves reserve USDC.

Options for Alex (one constant / one constructor arg to change):
- **Timelock length:** (A, implemented) **30 days** — equals the sell-back hold, so any lot bought before the
  notice becomes sellable before execution; (B) 14 days — faster launch, but lots bought in the last 2 weeks
  before the notice cannot exit.
- **Destination:** (A, implemented) a **purpose-built liquidity escrow contract** fixed at deploy (e.g. the
  LP-seeding/bridge escrow for the PEOPLE network launch; its code, not the Safe, decides where USDC goes); (B) the
  destination is passed in `announceLiquidityRelease(to)` and published with the notice — flexible, but then the
  "never to the team" guarantee rests on public scrutiny during the notice, not on code. Recommendation: A, and
  the escrow must be deployed and reviewed before mainnet deploy of the hub (it is a constructor arg).
Note: the contract cannot verify that the PEOPLE network actually launched; the announcement + 30-day public
notice is the safeguard.

Graduation: triggered inside `buy` when `raisedUsd6` reaches `RAISE_CAP_USD6`; buys and sell-backs stop forever,
reserve leaves only via the timelocked release above. The 50/50 liquidity/multisig split of the treasury half
and LP lock from site copy remain off-chain Safe operations with public reporting. Unsold PPL = `SUPPLY_PPL −
soldPpl` (view `unsoldPpl()`) → Community Pool on the PEOPLE network.

### 5.5 Expiry without graduation (D3, Q1)
At `openedAt + TERM` buys stop. Sell-back continues with identical limits (30-day hold, 2% of the reserve snapshot and $2k per person, both over an exact rolling 24 hours, fees)
while `reserveUsd6` covers the payout and is **never closed by time**. `unsoldPpl()` → Community Pool. The only
end is the timelocked liquidity release at the PEOPLE network launch (§5.4).

### 5.5a Delivery freeze (Q2)
Q2 (Alex): when PPL are delivered on the PEOPLE network, the buyer's Base record is frozen so it cannot be sold
back (no double spend). `markDelivered(address[] holders)` (owner) sets `delivered[h] = true` and emits
`Delivered(h, pplOf[h])`; frozen addresses cannot `sellBack` and cannot receive new buys. `pplOf`/lots stay as
an immutable record (invariant 3 unchanged). Allowed only once the sale is over (`graduated`) or the launch release
has been announced/executed, so it cannot be used to block sell-backs during the normal sale. The first
`markDelivered` sets `deliveryStarted`; after that `cancelLiquidityRelease` reverts (`DeliveryStarted`), so frozen
records can never coexist with a reopened sale/sell-back (test `test_cancelReleaseRevertsAfterDelivery`).
Note: `sellWindowReserveSnapshot` is taken when the global ring is empty (the first sell-back of an epoch) and
stays until every entry ages out. Before any live entry, `sellBackCapToday()` reports 2% of the current reserve.

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
| $2k per person per exact rolling 24 hours | per-person ring | `test_buyCapPerUtcDay`, `test_buyCapResetsNextUtcDay`, `test_buyCapCountsRecipientNotPayer` |
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
| 2% of reserve over an exact rolling 24 hours (global) | ring + snapshot; frees at t+24h | `test_sellBackGlobalCap`, `test_sellBackGlobalCapRollsAt24hNotUtcMidnight`, `test_sellBackCapUsesDayStartSnapshot`, `test_globalSellCap_rolling24hAcrossUtcMidnight` |
| $2k per person per exact rolling 24 hours | per-person ring | `test_sellBackAddressCap`, `test_sellBackAddressCapResetsNextDay` |
| Fee 1.5% / 3% above 1% | marginal split | `test_feeLowBelowThreshold`, `test_feeHighAboveThreshold`, `test_feeSplitAcrossThreshold` |
| Fee stays in reserve (D2) | `reserveUsd6 −= payout` | `test_feeStaysInReserve` |
| Closes at graduation | `!graduated` | `test_sellBackClosedAfterGraduation` |
| Works after 24 months (D3) | no term check in sellBack | `test_sellBackWorksAfterExpiry` |
| Reserve exhausted | `payout ≤ reserveUsd6` | `test_sellBackRevertsWhenReserveEmpty` |
| No refunds | no refund path exists | (absence; reviewed) |
| Unsold → Community Pool | `unsoldPpl()` view | `test_unsoldPplAfterExpiry`, `test_unsoldPplAfterGraduation` |
| Referrer (D11) | `≠ msg.sender`, `≠ recipient` | `test_referrerEmitted`, `test_referrerSelfReverts`, `test_referrerRecipientReverts`, `test_referrerZeroOk` |
| Reserve never to Safe/team (Q1) | only `executeLiquidityRelease` → immutable `liquidityReceiver`; `rescue` surplus-only | `test_liquidityReceiverCannotBeTreasuryOrOwner`, `test_rescueCannotTakeReserve`, `test_onlyOwnerAdmin` |
| Reserve exit via timelock + notice (Q1) | `announce` → 30 d → permissionless `execute` | `test_liquidityReleaseTimelock`, `test_liquidityReleaseAnnounceStopsBuys`, `test_liquidityReleaseCancel`, `test_liquidityReleaseAfterGraduation`, `test_sellBackWorksDuringNotice`, `test_sellBackClosedAfterRelease` |
| Sell-back never closed by time (Q1) | no term check in sellBack | `test_sellBackWorksLongAfterExpiry` |
| Delivered records frozen (Q2) | `delivered[...]` | `test_deliveredCannotSellBack`, `test_markDeliveredOnlyAfterSaleOver`, `test_deliveredCannotReceiveBuy` |
| Verifier and return verifier rotate/revoke only by owner, after 48 hours | `queue*` / `execute*` / `cancel`; no immediate setter | `test_setVerifierRevokes`, `test_onlyOwnerAdmin`, `test_adminTimelock48h_verifierReturnVerifierRescue` |
| Return attestation binds amount, hub, seller, both chain ids | EIP-712 `MainnetReturn` checks; `returnId` preimage | `test_return_replayBindsAmountHubSellerChain`, `test_burn_returnIdBindsAmountHubSellerAndChains` |
| Pause | `whenNotPaused` | `test_pauseBlocksBuyAndSell`, `test_onlyOwnerAdmin` |
| Renounce disabled | revert | `test_renounceReverts` |
| Mainnet USDC fork | — | `test_forkBaseUsdcEndToEnd` (fork, skipped without RPC) |

## 7. Invariants (handler-based, `forge` invariant testing)

1. `usdc.balanceOf(hub) ≥ reserveUsd6` (I-solvency).
2. `reserveUsd6 == Σ toReserve − Σ payout` (ghost accounting; fee never leaves).
3. `soldPpl == Σ pplOf == Σ lots.pplRemaining`.
4. `soldPpl == soldForRaised(raisedUsd6)` within 1 wei-PPL rounding tolerance per op; `raisedUsd6 ≤ RAISE_CAP_USD6`.
5. `Σ treasury inflow == Σ charged − Σ toReserve`.
6. Over the live global ring: gross ≤ 2% of `sellWindowReserveSnapshot`; per person over the live ring ≤ 2_000e6.
7. Per person over the live buy ring ≤ 2_000e6.
8. No lot sold back before `boughtAt + HOLD`.
9. After `graduated`: no change to raised/sold/pplOf/lots; reserve only decreases via `executeLiquidityRelease`
   (to `liquidityReceiver`); treasury never receives reserve USDC.
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
event LiquidityReleaseAnnounced(address indexed to, uint256 reserveUsd6, uint256 executableAt, bool graduated);
event LiquidityReleaseCancelled();
event LiquidityReleased(address indexed to, uint256 amount);
event Delivered(address indexed holder, uint256 ppl);
event Rescued(address indexed token, uint256 amount);
```
ABI differs from v1 (`buyWith(token,…)` → `buy(…)`); website must use a v2-specific ABI and never call v1.

## 9. Roles

| Role | Holder | Powers | Cannot |
|---|---|---|---|
| owner | Safe 2-of-3 (mainnet); throwaway EOA on Sepolia | open, pause/unpause, queue/execute/cancel verifier, return verifier and surplus rescue (48 h), unbind, announce/cancel liquidity release (executes only to immutable `liquidityReceiver` after 30 d), markDelivered (after sale over), 2-step transfer | change constants/curve/limits, withdraw reserve before graduation, move USDC/USDT before the 48 h delay, extend term, mint PPL, renounce |
| treasury | immutable, = Safe | receives 50% of every buy and released reserve | — |
| verifier | website backend key (new) | sign bindings | buy/sell on others' behalf, move funds |

## 10. Threat model

| Threat | Impact | Mitigation | Residual |
|---|---|---|---|
| Verifier key leak | attacker mints many "persons" → bypass whitelist & per-person limits, gains sell-back access | owner queues a verifier rotation (48 h) + `pause`; global 2% rolling-24h cap bounds drain; hold 30 d delays sell-back; key in server KMS/env, never in repo | 48 h before the new verifier is live |
| Sybil (real people renting identities) | per-person limits diluted | binding uniqueness by provider id; caps are per address | accepted |
| Bank run on reserve | holders compete for the rolling 2% | rolling-24h cap + per-person cap; reserve can only fall by ≤ 2% of the window snapshot in any 24 hours | early-stage cap is small in absolute terms (D5: shown honestly) |
| Front-running / sandwich | profit extraction | 30-day hold makes buy→sell sandwich impossible; slippage `minPplOut`/`minUsdcOut` | first-come race for daily cap |
| Rounding / dust abuse | drain reserve via rounding | buy rounds PPL down, sell rounds gross down & fee up; min $10 buy; fuzz round-trip test | — |
| Griefing via `recipient` | attacker buys $10 for victim → consumes victim's cooldown/daily cap | costs attacker ≥ $10 per 60 s and gives victim PPL | accepted, documented |
| Gas DoS on lots | many tiny lots make sellBack expensive | FIFO head pointer, `MAX_LOTS_PER_SELL`, partial sells | user may need several txs |
| Reentrancy | — | `nonReentrant`, CEI, USDC has no hooks | — |
| USDC blacklist / upgrade (Circle) | reserve frozen | none on-chain | external, disclose |
| Owner abuse (pause forever) | sell-back blocked | pause cannot move funds; Safe 2-of-3; public | trust in Safe |
| Owner abuse (early launch announcement) | reserve → liquidityReceiver after 30 d | receiver immutable and ≠ Safe; 30-day public notice, sell-back stays open meanwhile (daily caps limit how much can exit) | Q1 option A; receiver code reviewed before mainnet |
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

## 13. Questions for Alex — answered 2026-10-27

- **Q1** Sell-back never closes by time; reserve never to Safe/team; exit only to liquidity via timelock +
  public notice → §5.4 (options for timelock length and destination listed there; 30 days + immutable escrow
  implemented).
- **Q2** Delivered records frozen → §5.5a.
- **Q3** Marginal fee confirmed → §5.2 (site copy fix flagged).
- **Q4** KMS sign-only signer, expiry + nonce, owner-only rotation, Human Passport or World ID, backend
  cross-identifier dedupe → §5.3.
- **Q5** Superseded: buys, the per-person $2k sell-back, and the global 2% sell-back count over an exact rolling 24 hours, not a UTC calendar day → §3.
