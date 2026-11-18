# Live smoke plan: one-signature cross-chain PPL purchase (LI.FI → `verifyAndBuy`)

Status: **plan only**. Nothing in this file has been executed on any live network. Every on-chain step
below needs its own explicit approval ("yes") from Alex (§2). Times are Asia/Tbilisi (UTC+4).

Goal: before the 1 Dec launch, prove end to end on mainnets that
USDT on a source chain → one wallet signature → LI.FI bridge + destination call → `PplCurveHubV2.verifyAndBuy`
on Base → PPL credited on the PEOPLE mainnet (chain id 97400). Also prove that a failing destination
call returns the USDC to the buyer on Base.

## 0. Findings that shape the plan (checked 18 Nov 2026, read-only)

1. **The one-signature minimum is 40 USDC.** Direct buys keep the 10 USDC minimum
   (`MIN_BUY_USD6`), but router buys, which include every LI.FI destination call, need
   `ROUTER_MIN_BUY_USD6 = 40e6` (the audit M1 fix, see `LIFI-ONE-TX.md`).
   - The site does not offer one-signature below $40, so a 2–5 USDT one-signature purchase is
     not possible at all.
   - The happy path uses **~42 USDT**, which leaves ~41 USDC after fees. It is a real purchase:
     the PPL go to the buyer.
   - The refund case uses the same amount. The USDC comes back on Base minus ~$0.4 of fees.
2. **`open()` is irreversible.** It starts the 7-day whitelist phase and the 730-day term. Opening
   the launch hub for a smoke test starts the real sale early. Hence a **separate smoke hub** (§1).
3. **BNB USDT → one-tx has no route right now.** LI.FI `/quote/contractCalls` from BNB USDT fails its
   own source-step simulation: `MinimalOutputBalanceViolation` on the BSC USDT→USDC swap. It failed
   for 11 and 50 USDC and with two funded `fromAddress`es. A plain BNB USDT → Base USDC quote works,
   but via NEAR Intents, which cannot carry a destination call. From **BNB USDC** and **Polygon
   USDT** the one-tx quote works (Across), and the site validator `validateOneTxQuote` accepts the
   live Polygon quote. On the site, BNB USDT currently lands in "no route", with the two-step path
   still available below. Re-check on the smoke morning (§3.1). If it still fails, run the smoke
   from Polygon USDT or BNB USDC, and do BNB USDT via the two-step path.
4. **Destination caller confirmed on live data.** In the captured Across route, the destination
   chain is: Across SpokePool `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64` → LI.FI ReceiverAcrossV4
   `0x33b255b5db44A78c34381f89f1a454bc0Ef49871` → LI.FI Executor
   `0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110` → hub. The Executor is `msg.sender` at the hub, as
   in `LIFI-ONE-TX.md`. The Executor leaves a max USDC allowance to the hub
   (`LibAsset.maxApproveERC20`). This is harmless: the hub only pulls from `msg.sender` during a
   call, and the Executor holds no USDC between transactions.

## 1. Which hub: smoke hub (recommended) vs launch hub

**A — dedicated smoke hub (recommended).** Same bytecode as the launch hub (commit with
`verifyFor`), deployed with `DeployPplSaleV2.s.sol`, owner = a 2-of-3 Safe, and opened right away.
After the smoke it is paused and retired.
- **No effect on the launch:** person↔account bindings, daily caps and the term clock are per hub,
  so nothing the smoke does carries over.
- **Separate verifier key:** use a smoke verifier KMS key as the smoke hub's `VERIFIER`, so the
  production verifier key is never configured on a preview deployment.
- **Launch hub in parallel:** deploy the launch hub on the same day and queue its
  `setTrustedRouter(Executor)` in the same Safe batch. That executes ≤ 1 Dec, so the launch gets no
  extra 48 h wait.
- **Cost:** two deploys on Base (≈ cents of ETH each) and a few Safe transactions. The reserve part (~half) of the smoke
  purchases stays in the retired hub, plus ~41 USDC of PPL delivered to the smoke buyer.

**B — smoke on the launch hub.** Requires `open()` before the smoke, which starts the sale on chain
days before 1 Dec: the term ends earlier, the whitelist phase passes early, and anyone can buy
directly from the contract once it is open (`pause()` right after `open()` limits that). This is a
launch-semantics decision. Not recommended.

The rest of this plan assumes **A**.

## 2. Approval items (in order; each is a separate approval)

| # | What | Who acts | Earliest |
|---|------|----------|----------|
| 0 | Reviewer audit of PR #121 contract change (`verifyFor` / `verifyAndBuy`, `e500d1c`) done (no crit/high); M1/M2/L1–L3 fixed in the follow-up commit, which the Reviewer re-checks. Recommended gate before any mainnet deploy. | Reviewer | 19 Nov |
| 1 | **Deploy on Base mainnet**: smoke hub (+ its escrow) and launch hub v2 (+ escrow) from the reviewed commit. Params (`DeployPplSaleV2.s.sol` env): `OWNER` = 2-of-3 Safe (Alex chooses: prod Safe or a separate smoke Safe for the smoke hub), `TREASURY` = Safe, `VERIFIER` = smoke KMS key address (smoke hub) / prod `SALE_V2_VERIFIER_KMS_KEY_ID` address (launch hub), `USDC_ADDRESS` = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `REWARD_BUYER_FORBIDDEN` = reward distributor (launch hub; same value for the smoke hub). Deployer = plain EOA with ~0.003 ETH on Base, not a Safe signer key. Verify both on Basescan. | deploy key holder | 19 Nov |
| 2 | **Safe batch (queue)**: smoke hub `queueSetTrustedRouter(0x4DaC…F110, true)` (calldata `0xa9b0b5f0…0001`, see `safe-payloads/set-trusted-router-lifi-executor.md` with the new hub address) + smoke hub `open()` (`0xfcfff16f`); launch hub `queueSetTrustedRouter(0x4DaC…F110, true)` (no `open`). Record the `Queued(id, params, eta)` ids. | Safe signers | 19 Nov, right after #1 |
| 3 | **Verifier readiness**: smoke KMS key created (secp256k1, sign-only IAM for the preview), its address = smoke hub `verifier()`. Prod KMS key address = launch hub `verifier()` (check on Basescan). | Alex / infra | before #4 |
| 4 | **Preview config (NOT production)**: a Vercel Preview deployment of the PR branch with Preview-scoped env only: `NEXT_PUBLIC_PPL_V2_CHAIN_ID=8453`, `NEXT_PUBLIC_PPL_V2_HUB_ADDRESS=<smoke hub>`, `NEXT_PUBLIC_PPL_V2_BUY_ENABLED=1`, `NEXT_PUBLIC_PPL_V2_ONE_TX_ENABLED=1`, `SALE_V2_VERIFIER_MODE=kms`, `SALE_V2_VERIFIER_KMS_KEY_ID=<smoke key>`. Production env stays untouched. | Alex / Vercel admin | 19–21 Nov |
| 5 | **Safe batch (execute)** after the timelock: `executeSetTrustedRouter(id)` (`0xadd04e0a…`) on the smoke hub and on the launch hub. Check `trustedRouter(0x4DaC…F110) == true` on both. | Safe signers | queue time + 48 h |
| 6 | **Run the live smoke** (§3): Alex's own wallet in the preview UI (~42 USDT) + a dedicated smoke wallet for the refund case (~42 USDT + ~0.001 BNB gas; no ETH on Base; the USDC comes back on Base). | Alex (+ operator for the script case) | right after #5 |
| 7 | **PPL delivery for the smoke hub**: a one-off run of `contracts/scripts/sale-delivery-relayer.mjs` with `HUB_ADDRESS=<smoke hub>`, `START_BLOCK=<smoke hub deploy block>`, `ONCE=1` (real PPL from the mainnet `PplSaleDistributor`, ≈ 8.2k PPL per 41 USDC on a fresh curve). Never add the smoke hub to the production relayer config. | relayer key holder | after #6 |
| 8 | **Retire the smoke hub**: Safe `pause()` (`0x8456cb59`, immediate). Optional: `queueSetTrustedRouter(Executor, false)`. | Safe signers | after #7 |
| 9 | Later, separately: production env (`NEXT_PUBLIC_PPL_V2_HUB_ADDRESS` = launch hub, `..._ONE_TX_ENABLED`, `..._BUY_ENABLED`), launch hub `open()` on 1 Dec, merging PR #121. | Alex | 1 Dec |

### Earliest smoke date

The 48 h `ADMIN_TIMELOCK` on `setTrustedRouter` is the critical path; the clock starts at the Safe
queue transaction (#2).
- **Recommended: Sat 21 Nov 2026, ~14:00 Tbilisi.** The audit (#0) is done on Thu 19 Nov morning,
  deploy (#1) and the Safe queue (#2) go out by ~13:00 on 19 Nov, and execute (#5) is possible from
  Sat 21 Nov ~13:00.
- **Absolute earliest: Fri 20 Nov, ~22:00.** Only if deploy and queue go out tonight, Wed 18 Nov
  by ~22:00, without waiting for the audit. Not recommended.
- **If the Safe signers are not available on the weekend:** Mon 23 Nov. That still leaves a week
  before 1 Dec for fixes and a re-run.

## 3. Pre-checks (free, no transactions)

### 3.1 Live quote shape check (any time, also on the smoke morning)

```bash
cd website
HUB=<smoke hub> BUYER=<buyer wallet holding the source token> FROM_CHAIN=56 USDC_IN=41000000 \
  node --import ./scripts/node-test-paths.mjs --experimental-strip-types scripts/smoke-one-tx-quote.mjs
```

The script uses the same request builder and validator as the buy panel. It signs and sends nothing.
**Pass:** `ok: true`, `check.summary.minReceivedUsd6 >= USDC_IN`, and the source tx `to` is the
LI.FI Diamond `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`. Repeat with `FROM_CHAIN=137` (Polygon
USDT) and with BNB USDC (`FROM_TOKEN=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`).

### 3.2 Base mainnet fork rehearsal (done 18 Nov, passes; re-run on the audit-fix commit)

`contracts/test/fork/PplCurveHubV2LifiFork.t.sol` is skipped unless `BASE_RPC_URL` is set:

```bash
cd contracts
BASE_RPC_URL=https://mainnet.base.org forge test --match-path test/fork/PplCurveHubV2LifiFork.t.sol -vv
```

Setup and method:
- Forks Base mainnet at block 59,109,516.
- Deploys the hub at a fixed address with the Base-mainnet constructor checks active (real USDC,
  contract owner/treasury/escrow), opens it, and queues + executes `setTrustedRouter(Executor)`
  with a 48 h warp.
- Replays a **real LI.FI destination message** captured from a live `/quote/contractCalls`
  response (Polygon USDT → Base USDC via Across, built by the site's `buildContractCallsRequest`)
  through the **real** LI.FI ReceiverAcrossV4 and Executor, by impersonating the Across SpokePool.

| Test | Result |
|------|--------|
| `test_fork_capturedMessageShape`: the LI.FI SwapData targets the hub, approves the hub, sends USDC, `fromAmount` = bridge output, calldata = `verifyAndBuy`, refund receiver = buyer | PASS |
| `test_fork_newBuyerVerifyAndBuyThroughRealLifiContracts`: new buyer bound (`Verified`), `Bought(buyer = Executor, recipient = buyer)`, hub charged exactly `usdcIn` (41.000000), leftover 0.201302 USDC refunded to the buyer, Executor keeps 0; 41 USDC → 8,198.685 PPL on a fresh curve | PASS |
| `test_fork_untrustedExecutorRefundsAllUsdcToBuyer`: router not yet trusted → `UntrustedRouter` → Receiver catches → buyer gets the full 41.201302 USDC on Base, no binding | PASS |
| `test_fork_slippageRevertRefundsAllUsdcToBuyer`: `minPplOut` too high → `Slippage` → full refund, no binding | PASS |

What the fork **cannot** cover:
- Across relayer behaviour and timing.
- The source-chain step (LI.FI simulates it; §3.1).
- The real verifier KMS signature (the fork uses a local key with the same EIP-712 struct).
- PPL delivery on the PEOPLE mainnet.

Tenderly is not needed; anvil (`anvil --fork-url https://mainnet.base.org`) can replay the same
calls interactively if a reviewer wants to step through them.

## 4. Live smoke, step by step (after #5)

Accounts:
- **B1** = Alex's real wallet: a new buyer on the smoke hub, registered person, site-verified.
- **B2** = dedicated smoke wallet: a fresh EOA funded with ~42 USDT + ~0.001 BNB on BNB. It may also
  be a registered test person, or B1 does the refund case.

Record every tx hash in the PR.

### 4.1 Readiness checks (read-only)
- Smoke hub: `phase() == Open or Whitelist` (opened), `paused() == false`,
  `trustedRouter(0x4DaC…F110) == true`, `verifier() == smoke KMS address`, `personOf(B1) == 0`.
- Preview site: buy panel shows the one-tx CTA for BNB/Polygon. `/api/sale/verify-signature` with
  `routed: true` returns an attestation for the smoke hub, with a deadline ≈ now + 60 min.
- Relayer config for the one-off run (#7) is ready; the distributor has PPL available.
- Re-run §3.1 for the chosen source token.

### 4.2 Happy path, new buyer (B1, preview UI, ~42 USDT)
1. Connect B1 on the preview and choose source BNB (or Polygon), token USDT, amount 41 USDC.
2. **Expect:** the panel asks for one gas-free ownership signature (new buyer). Then it shows the
   quote: pay ≈ 41.4 USDT, fees, ETA ≈ 30–60 s.
3. Approve USDT for the LI.FI Diamond (if needed), then send the one transaction on the source chain.
   **Expect on the source chain:** a tx to `0x1231DEB6…4EaE`
   (`swapAndStartBridgeTokensViaAcrossV4` or similar), event `LiFiTransferStarted`.
4. **Expect on Base**, in one tx, the Across fill: SpokePool → Receiver → Executor → hub.
   Events, in order:
   - USDC `Transfer` Receiver → Executor;
   - `Verified(B1, personId)`;
   - USDC `Transfer`s Executor → hub (reserve part) and Executor → treasury;
   - `Bought(buyer = 0x4DaC…F110, recipient = B1, referrer, usdcIn = 41000000, toReserve, pplOut, lotId)`;
   - USDC `Transfer` Executor → B1 (leftover).
5. LI.FI status (`GET https://li.quest/v1/status?txHash=<source tx>`): `DONE` / `COMPLETED`.
6. **Pass criteria:**
   - `personOf(B1) == personId`;
   - `pplOut ≥ minPplOut` (quote × 0.99);
   - B1's USDC on Base rose only by the leftover (< 0.1 USDC);
   - the hub's `raisedUsd6` rose by 41,000,000;
   - B1 needed **no ETH on Base**;
   - the panel shows success with the Basescan link.

### 4.3 PPL credited on the PEOPLE mainnet (after #7)
1. Run the relayer once for the smoke hub (#7). It waits for the Base block to be `safe`.
2. **Expect** a `PplSaleDistributor.deliver` tx on chain 97400 with
   `Delivered(purchaseId, B1, amount = pplOut, sent = true)`, where
   `purchaseId = keccak256(abi.encode(8453, smokeHub, baseTxHash, logIndex))`.
3. **Pass criteria:**
   - B1's PPL balance on chain 97400 rose by exactly `pplOut`;
   - `delivered(purchaseId) == true`;
   - re-running the relayer does not pay twice.
   If `sent = false`, the PPL is in `owed(B1)` and B1 claims it. Note this and treat it as a pass
   only if the claim works.

### 4.4 Refund case (B2, script, ~42 USDT, money comes back as USDC on Base)
1. Get a routed attestation for B2 from the preview API. Build the quote with the helper and
   `MIN_PPL_OUT = 2 × quoteBuy(41e6)`:
   `VERIFICATION='{…}' MIN_PPL_OUT=<2x> HUB=<smoke> BUYER=<B2> … scripts/smoke-one-tx-quote.mjs`.
2. Send the printed `check.summary.tx` from B2: approve, then the tx (e.g. `cast send` with B2's key
   held by the operator). This is the only step that needs a key outside a browser wallet.
3. **Expect on Base:**
   - the fill tx emits no `Verified` or `Bought` from the hub (the call reverts with `Slippage`
     inside the Executor; the Receiver catches it);
   - USDC `Transfer` Receiver → B2 for the whole bridged amount;
   - LI.FI status `DONE` with substatus `PARTIAL` (received the bridge token instead of the call
     result).
4. **Pass criteria:**
   - B2 holds ≈ 41.2 USDC on Base;
   - `personOf(B2) == 0` (bind rolled back);
   - the hub's `raisedUsd6` is unchanged.

### 4.5 Optional second buy (B1, already bound → plain `buy` destination call)
Buy 41 USDC again from Polygon USDT. **Expect:** no ownership-signature prompt, calldata `buy`,
`Bought` with `recipient = B1`. This covers the existing-buyer branch.

### 4.6 Close
Pause the smoke hub (#8). Save all tx hashes, LI.FI status JSONs and screenshots in the PR. Run the
same §3.1 check against the launch hub address once its router is executed.

## 5. Failure handling and rollback

| Symptom | Action |
|---------|--------|
| No one-tx route for the chosen source (as BNB USDT on 18 Nov) | Switch source (Polygon USDT / BNB USDC). The site shows the two-step path. Report to LI.FI with the request JSON from §3.1. |
| Bridge stuck > 30 min | Watch `li.quest/v1/status`. Across refunds on the source chain after `fillDeadline`. The panel offers the two-step path. No hub action. |
| Destination call reverted | USDC is with the buyer on Base (§4.4). The buyer retries via the two-step path (USDC already on Base) or after the fix. |
| `verifyAndBuy` reverts with `BadSignature` / `Expired` | Check the smoke KMS address == `verifier()`, the routed deadline (60 min) vs. bridge ETA, and that the preview env points to the smoke hub. |
| Any unexpected hub behaviour | Safe `pause()` on the smoke hub (immediate). The launch hub is not open and is unaffected. Fix in PR #121, then redeploy both hubs (they are not upgradeable) and re-queue the router. That adds 48 h, so a failure found by 28 Nov still fits before 1 Dec. |
| Relayer delivery fails | Fix and re-run. Idempotent: `delivered[purchaseId]` blocks double pay. The distributor owner can `pause` at once. |
| Preview misconfigured | Remove the Preview env vars. Production is never touched by this plan. |

Rollback of the site is just not promoting the preview (production env is unchanged). Rollback on
chain is `pause()` on the smoke hub. The launch hub is never opened before 1 Dec.
