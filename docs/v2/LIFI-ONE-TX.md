# One-signature cross-chain PPL purchase (LI.FI destination call)

Status: **draft, not enabled anywhere.** It ships behind `NEXT_PUBLIC_PPL_V2_ONE_TX_ENABLED`
(default off). It also needs a Safe change on the hub (below) before it can work. Without that
change the panel reads `hub.trustedRouter(executor) == false` and keeps the two-step swap.

## 1. Flow

1. The buyer types the USDC amount to buy with (`usdcIn`, $10–$500) and picks a source network and
   token.
2. The site reads `hub.quoteBuy(usdcIn)` on Base and sets `minPplOut = quoteBuy(usdcIn) × 0.99`.
3. The site asks LI.FI `POST /v1/quote/contractCalls` with `toAmount = usdcIn`, so LI.FI quotes
   the source amount needed to deliver **at least** `usdcIn` USDC on Base. The single contract call
   is `PplCurveHubV2.buy(usdcIn, minPplOut, recipient = buyer, referrer)` with
   `toApprovalAddress = hub`, `toFallbackAddress = buyer` and a gas limit of 500k.
   (`hub.buy` was measured at up to about 321k gas.)
4. Before showing the button, the site refuses the quote unless all of these hold
   (`validateOneTxQuote`):
   - the last step is the contract call;
   - it runs from the LI.FI Executor on Base;
   - it targets the configured hub;
   - its calldata is byte-for-byte the `buy` we built;
   - the step feeding it delivers USDC on Base with `toAmountMin ≥ usdcIn`;
   - the source chain, token and sender match the buyer.
5. The buyer approves the exact source amount (never `MaxUint256`) and signs one transaction on the
   source network.
6. On Base, the bridge receiver (`ReceiverAcrossV4` / `ReceiverStargateV2`) hands the USDC to the
   Executor. The Executor approves the hub and calls `buy`. The hub pulls `usdcIn` (less only on
   the final partial fill), and the Executor returns the unused USDC to the buyer.
   For a site-verified buyer who is **not yet bound on Base**, the buyer first gives one free
   ownership signature (no gas, any network). The server returns the verifier's attestation for
   that account, and the single destination call becomes
   `verifyAndBuy(usdcIn, minPplOut, buyer, referrer, personId, deadline, sig)` (§3). The first
   purchase therefore needs no separate verify transaction and no Base ETH.
7. The site polls `GET /v1/status`. Once the route is DONE or FAILED, it reads the Base receiving
   transaction:
   - **`Bought(recipient = buyer)` found:** success screen with the real `pplOut`.
   - **No `Bought`:** the destination call reverted, and the receiver's `catch` sent all the
     bridged USDC to the buyer on Base. The site measures the **on-chain USDC balance delta** and
     shows the existing "USDC arrived, PPL not bought" top-up button for that exact amount.

Same-chain Base USDT → USDC works the same way. LI.FI sends the buyer's transaction straight to
the Executor, so a revert there undoes everything and the buyer keeps the USDT.

### Two-step fallback (kept)

The LI.FI widget swap to the buyer's wallet stays available. It sits under "Prefer two steps?"
when one-signature is usable, and is the only option otherwise. Fix in this PR: the second step
now buys with the **USDC that actually arrived**, not the typed amount. That is the Base balance
delta between route start and completion, capped by the amount LI.FI reports it delivered and by
the $500 per-purchase cap (SPEC §12.1). The top-up button is also capped by the wallet's current
USDC balance.

## 2. Which Base address calls the hub

**LI.FI `Executor` — `0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110` (Base, 8453).**

Evidence:

- LI.FI deployment registry for Base, `Executor`:
  https://github.com/lifinance/contracts/blob/main/deployments/base.json
  - The same file lists `LiFiDiamond` `0x1231DEB6…4EaE` (the source-chain entry point, not the
    hub caller), `ReceiverAcrossV4` `0x33b255b5…9871` and `ReceiverStargateV2` `0x1493e7B8…219A`.
- Official address page (Diamond and pointer to the registry):
  https://docs.li.fi/introduction/lifi-architecture/smart-contract-addresses
- Contract-calls API (`toContractAddress`, `toContractCallData`, `toApprovalAddress`,
  `toFallbackAddress` = where bridged tokens go if the call fails):
  https://docs.li.fi/api-reference/perform-multiple-contract-calls-across-blockchains-beta
- Executor source: it runs the call list itself, so `msg.sender` at the hub is the Executor, and
  it sends leftovers to the receiver:
  https://github.com/lifinance/contracts/blob/main/src/Periphery/Executor.sol
- Receiver source: `try executor.swapAndCompleteBridgeTokens(...) catch { transfer to receiver }`:
  https://github.com/lifinance/contracts/blob/main/src/Periphery/ReceiverAcrossV4.sol
- Live check, 18 Nov 2026: read-only `POST https://li.quest/v1/quote/contractCalls` from every EVM
  source in §4. Every quote's final `custom` step had
  `action.fromAddress = 0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110`. `eth_getCode` on Base
  returned 9,446 bytes at that address.

`trustedRouter` risk note (audit M1 on `e500d1c`, fixed): anyone can call the Executor with
their own calldata, so whitelisting it lets anyone buy **for** any verified recipient with their
own USDC (and anyone can copy a pending buyer's 60-minute attestation from public calldata, which
only binds that buyer's own account to that buyer's person: the intended effect).
- **Before:** router buys had a count limit (`MAX_ROUTER_BUYS_24H = 5`). That was **not** safe: five
  minimum buys ($50, all PPL to the victim) locked the victim's one-signature buys for 24 hours.
- **Now:** router buys have **no count limit**. They have a router minimum, `ROUTER_MIN_BUY_USD6 = 40e6`
  (or `minBuyUsd6` if higher), and they share the person's $2k/24h amount cap. At the minimum, the
  cap ends the router window at exactly 50 entries = `RollingWindow24h.CAPACITY`, so the window
  cannot overflow. A routed buy with 49 attacker entries in the window costs < 400k gas
  (`test_m1_routedBuyGasWithFullWindow`), under the 500k/650k destination gas limits.
- **Remaining grief:** the attacker must spend the victim's whole $2k daily cap, and the victim
  receives all of those PPL. Router buys still never touch the person's own `maxBuysPer24h` slots
  or cooldown, so the victim can always buy directly on Base.
- **Product effect:** the one-signature path starts at $40. The site does not offer it below that
  (`belowRouterMin`); smaller amounts use the two-step path (direct buy, $10 minimum).
- **Size:** this fix fits the EIP-170 margin. A bucketed router window without a minimum (fold
  router buys into 30-minute buckets, no count limit, keep the $10 minimum) was also built and
  tested; it costs ~200 B and does not fit (24,625 B > 24,576 B). It is an option for a later,
  slimmer hub if Alex wants $10 one-signature buys.
- The Executor's own leftover approvals do not matter: the hub only ever pulls from `msg.sender`.

Site-side quote checks (audit M2, L1, L2):
- **The source transaction the buyer signs is pinned**, not just the quote summary:
  - `transactionRequest.to` and `estimate.approvalAddress` must be the LI.FI Diamond
    `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`. It is the same address on every source chain we
    list, per `lifinance/contracts/deployments/{mainnet,bsc,polygon,arbitrum,optimism,avalanche,base}.json`,
    checked 18 Nov 2026.
  - `value` must be 0, since every source token is an ERC-20.
  - `fromAmount` must equal `action.fromAmount` and be ≤ `usdcIn` × 1.03 in token units
    (`MAX_SOURCE_OVERPAY_BPS = 300`; live quotes were 0.3–0.9% above).
  - `transactionRequest.data` must contain our exact hub calldata.
  - Cross-chain, its `ILiFi.BridgeData` must name the buyer as receiver, Base as destination and
    a destination call, and the buyer must also appear outside the hub calldata as the refund
    receiver of the destination message.
  - A real captured LI.FI quote passes all of these (unit test with fixture).
- **Outcome on Base comes from the receiving transaction's logs, not a balance delta.**
  `Bought(recipient = buyer)` means success. USDC `Transfer`s to the buyer in that tx are the
  leftover (after success) or the refund (no `Bought`). Executor transfers to anything other
  than the hub, the hub treasury or the buyer are flagged as misrouted. The balance delta is
  only a fallback when LI.FI's status gives no receiving tx hash.

`verifyFor` idempotency note (audit L3, documentation only): when `account` is already bound to
`personId`, `verifyFor` and `verifyAndBuy` return before checking the signature or deadline, so
any bytes are accepted. This is intended. Nothing changes in that case, so there is nothing to
authorise, and it keeps a front-run or stale attestation from reverting a buyer's destination
call. Every state change still requires a valid, unexpired verifier signature for that exact
account, person, nonce, chain and hub.

If LI.FI redeploys the Executor, the address changes. A quote from a new Executor fails our
`unexpectedCaller` check and the site falls back to two-step. Re-whitelisting needs a new Safe
queue + execute.

Safe payload (not sent): [`safe-payloads/set-trusted-router-lifi-executor.md`](safe-payloads/set-trusted-router-lifi-executor.md).

## 3. Verification for new cross-chain buyers: `verifyFor` + `verifyAndBuy` (implemented, not deployed)

Before this change `verify(personId, deadline, sig)` bound `msg.sender` only. A new buyer therefore
had to send a Base transaction (and hold Base ETH) before any purchase. On 18 Nov 2026 the owner
approved adding `verifyFor` to the hub.

### Changed / new hub functions (`contracts/src/sale/PplCurveHubV2.sol`)

| Function | Status | Who may call |
| - | - | - |
| `verify(bytes32 personId, uint256 deadline, bytes sig)` | unchanged behaviour (now a wrapper over `_bind(msg.sender, …, idempotent = false)`) | the account itself |
| `verifyFor(address account, bytes32 personId, uint256 deadline, bytes sig)` | **new** | anyone |
| `verifyAndBuy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer, bytes32 personId, uint256 deadline, bytes sig) returns (uint256 pplOut)` | **new**, `nonReentrant whenNotPaused` | `recipient` itself, or a `trustedRouter` buying for `recipient` (same rule as `buy`) |
| `buy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer)` | unchanged; its body moved verbatim into internal `_buy` | as before |

`verifyAndBuy` runs `_bind(recipient, …, idempotent = true)` and then exactly the `buy` checks, in
one call. LI.FI runs one contract call per destination step; a separate zero-amount `verifyFor`
call is not a reliable LI.FI call. So the site sends `verifyAndBuy` as the single destination call
for a buyer who is not yet bound, and plain `buy` for a bound buyer.

### Signature scheme and replay protection (no new scheme)

The verifier signs the **existing** EIP-712 struct, unchanged:

```
Verification(address account, bytes32 personId, uint256 nonce, uint256 deadline)
domain = EIP712("PplCurveHubV2", "1", chainId = block.chainid, verifyingContract = hub)
```

- **Who signs:** the existing hub `verifier` key (production: the AWS KMS key behind
  `/api/sale/verify-signature`), the same key and flow as `verify`. The server signs only after
  the signed-in, human-verified user proves wallet ownership with a personal signature, and it
  refuses accounts already bound on chain.
- **Account:** `account` is inside the signed struct. A signature for Alice cannot bind Bob, and a
  submitter (relayer, the LI.FI Executor) cannot bind itself.
- **Chain and hub:** the EIP-712 domain contains `block.chainid` and the hub address. OpenZeppelin
  rebuilds the domain if the chain id changes (fork), so a signature is dead on any other chain or
  hub.
- **Nonce:** `bindNonce[personId]` is in the struct. `unbind` increments it, so every older
  attestation for that person dies.
- **Expiry:** `deadline` is checked (`Expired`). Direct `verify` attestations last 15 minutes as
  before. Attestations requested for the routed path (`routed: true`) last 60 minutes so they
  outlive a slow bridge. The site refuses a quote unless at least
  max(10 min, 3 × LI.FI ETA) of validity is left.
- **One person ↔ one account, pinning:** unchanged (`AlreadyBound`). A person stays pinned to its
  first account forever, even after `unbind`.
- **Signature malleability:** OpenZeppelin `ECDSA.recover` rejects high-s and bad-length
  signatures.
- **Idempotent:** if `account` is already bound to `personId`, `verifyFor` / `verifyAndBuy`
  return without changes or events and do not look at the signature. So someone who front-runs
  the same attestation cannot make the buyer's destination call revert. Any other bound state
  still reverts `AlreadyBound`.
- **Atomic:** if the buy part of `verifyAndBuy` reverts (untrusted caller, slippage, caps,
  pause), the binding is rolled back too. The LI.FI receiver then sends all the USDC to the buyer.

Contract tests: `contracts/test/PplCurveHubV2VerifyFor.t.sol` cover the happy path (third-party
submit), idempotency, wrong account, wrong person, wrong chain (other domain chain id and
`vm.chainId` fork), wrong hub, wrong signer, expiry, replay after `unbind`, the already-bound and
pinned guards, zero inputs, and unchanged `verify`. The `verifyAndBuy` tests use a mock LI.FI
Executor (approve → call → refund leftovers, revert → full refund): new buyer in one call,
untrusted executor (atomic revert + refund), bad signature, slippage, already-verified buyer,
self-call without a router, a third party without a router, and paused.

### Deployment consequence

`PplCurveHubV2` is not upgradeable. Using `verifyFor` / `verifyAndBuy` on mainnet needs a **new
hub deployment** of this code, then the usual post-deploy setup and the `trustedRouter` Safe step
in the payload doc against the **new** hub address. No mainnet v2 hub address is in the repo yet.
Nothing was deployed (no testnet either).

## 4. Destination-call support by source network (checked 18 Nov 2026)

Method: read-only `POST /v1/quote/contractCalls` for 20 USDC on Base with a `buy` call. No
transactions were sent.

| Source network on /buy | Token tested | Destination call | Route seen | Site behaviour |
| - | - | - | - | - |
| Ethereum (1) | USDT | Yes | Across → ReceiverAcrossV4 → Executor | one signature |
| BNB Chain (56) | USDT, USDC | Yes | swap → Across (Stargate V2 if Across is excluded) | one signature |
| Polygon (137) | USDT | Yes | swap → Across | one signature |
| Arbitrum (42161) | USDT0 | Yes | Across | one signature |
| Optimism (10) | USDT | Yes | swap → Across | one signature |
| Avalanche (43114) | USDT | Yes | swap → Stargate V2 → ReceiverStargateV2 → Executor | one signature |
| Base (8453) | USDT → USDC | Yes (same chain, transaction goes to the Executor) | swap → Executor | one signature |
| Solana | USDT, USDC | **No**: `422 "Contract calls are not supported for non-EVM chains yet"` | — | two-step widget |
| Tron | USDT | **No**: same 422 | — | two-step widget |

Notes:

- The 18 Nov smoke test (2 USDT BNB → 1.968638 USDC Base) went through Relay as a plain swap.
  Relay did not appear in any destination-call quote: LI.FI picks a bridge that supports the call
  (Across or Stargate V2 here).
- Routes change over time. That is why the site re-checks every quote rather than trusting a
  table.
- LI.FI reports a known case where a Stargate V2 receiver delivered tokens without running the
  call (lifinance/sdk#359, Gnosis → Base). In that case the buyer gets the USDC on Base and sees
  the top-up button. No funds are lost.

## 5. "Fees on us" (crediting PPL for the amount sent): options only, owner decision

Today, with this PR, the typed amount is the USDC the hub receives. LI.FI quotes a slightly
larger source amount. On the 18 Nov test quotes for 20 USDC the extra was about 0.9–2%; part of
it is fixed, so it is a smaller share on larger buys. The buyer gets PPL for exactly what they
typed and sees the fees before signing.

| Option | What it means | Contract | Cost / risk |
| - | - | - | - |
| 1. Keep as is | Buyer pays swap/bridge fees on top. | None | None |
| 2. Off-chain rebate | After a confirmed `Bought`, PEOPLE credits the fee value in PPL from a marketing/rewards pool. | None | Needs a budget, per-person caps, and accounting. PPL comes from a pool, not the curve. |
| 3. Sponsor contract tops up USDC | A PEOPLE-funded sponsor adds the fee in USDC on Base inside the destination call, so the hub receives the full sent amount. | New sponsor contract + funding + abuse limits (the hub is unchanged) | Treasury pays real USDC; needs daily caps. |
| 4. Hub credits PPL for a declared sent amount | The hub mints curve PPL for more USDC than it received. | Yes, plus a trusted attestation of the sent amount | **Not recommended**: breaks the 50% reserve backing for sell-back and adds an oracle to trust. |
| 5. Negotiate the LI.FI fee | Our integrator fee is already 0. The 0.25% LI.FI fixed fee may be reducible through the partner portal. | None | Business step. |

## 6. Needs the owner's explicit approval (not done here)

- Merging this PR.
- Safe `queueSetTrustedRouter(Executor, true)`, then `executeSetTrustedRouter(id)` at least 48 h
  later (any on-chain action).
- Setting `NEXT_PUBLIC_PPL_V2_ONE_TX_ENABLED=1` (and `NEXT_PUBLIC_PPL_V2_BUY_ENABLED`) in
  Production.
- Deploying the new hub with `verifyFor` / `verifyAndBuy` (§3), on any network, plus an external
  audit of the change.
- The choice in §5.
