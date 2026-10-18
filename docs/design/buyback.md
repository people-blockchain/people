# Public PPL buyback — design note (not implemented)

**Status:** mechanism (§4) remains `DESIGN ONLY` — no cadence-automation or swap code has
shipped. §5 (the stablecoin launch-fee gateway) is now `IMPLEMENTED` as `StableFeeGateway.sol`
(`contracts/src/fees/StableFeeGateway.sol`) and live on testnet; see §5 and §8 below for what
changed from the original design-only text. Owner-approved policy (this batch): fee split
unchanged, treasury + liquidity shares fund public buybacks, visible in the explorer. Website
copy (`/tokenomics`, `/how-it-works`, `/fees`) describes the batched swap-and-split as
**preliminary** policy; the stablecoin launch fee itself is live, with an owner-approved price
(5.00 USD token launch, 10.00 USD NFT mint — owner decision, 2026-10-12) and is People-network-only for
now; cross-chain stablecoin payment (Ethereum, Polygon, Tron, TON, Solana) is not built yet.

**OWNER DECISION (2026-10-12):** the token/NFT launch fee paid in USDC/USDT goes **100%**
to the public PPL buyback (not the 30/25/20/10/15 split applied to a stablecoin balance as
originally drafted below in §5.2 point 2). The PPL that the buyback purchases is what the
treasury multisig then splits 30/25/20/10/15 per §4, off-chain, the same way it already splits
every other buyback-sourced PPL. This supersedes the "splits it 30/25/20/10/15/0" sentence in
the original §5.2 draft — that text is left in place below, struck through in spirit, so the
revision is traceable; §5.4 explains the shape that was actually built.

**Public copy order (site / litepaper / whitepaper):** (1) 100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks; (2) 30% of network fees go to public PPL buybacks (treasury 20% + liquidity 10%); (3) the remaining 70% of network fees go to validators (30%), the community pool (25%) and the Growth Pool (15%) — and it all ultimately goes back to participants. Never say "100% of all fees".

## 1. What doesn't change

Model A fee split stays exactly as approved: validators 30% / community 25% / treasury 20% /
liquidity 10% / Growth 15% / burn 0% (`chain/overrides/evmd/peoplefees/feesplit.go`,
`BPSValidators/BPSCommunity/BPSTreasury/BPSLiquidity/BPSGrowth/BPSBurn`). This note does not
propose new basis points, a new pool, or a new Growth mechanic. "Buyback" describes what happens
to the treasury (20%) and liquidity (10%) shares **after** they are split off, not a change to
the split itself.

## 2. Why "buyback" only bites on stablecoin-denominated fees

Today every protocol fee is paid in native PPL, and `SplitModelA` routes the treasury and
liquidity cuts directly to `TreasuryMultisigAddress` every block (M11-2, already implemented —
see `docs/PROTOCOL-DECISIONS.md` and `chain/overrides/evmd/peoplefees/feesplit.go:36`). Those
shares are already PPL the moment they're split; there is nothing to "buy" — using PPL to buy
PPL on the open market is a no-op. A public *buyback* only becomes a real, distinct action once
a fee is paid in something that **isn't** PPL:

- The optional stablecoin (USDC/USDT) token/NFT launch fee from item 2 of this batch (design
  below, not implemented in this batch) is the first candidate source.
- If other protocol fees are ever priced in a stablecoin in the future, the same mechanism
  applies to them without a new design.

So the concrete mechanism is: **when a fee is paid in a stablecoin, split it 30/25/20/10/15/0
exactly like a PPL fee (in stablecoin units), then use the treasury+liquidity 30% of that
stablecoin amount to buy PPL on the open market.** The purchased PPL lands in the same place the
treasury/liquidity shares would have landed had the fee simply been paid in PPL — the mechanism
makes stablecoin fees economically equivalent to PPL fees from the treasury's point of view,
while adding real buy-side demand instead of letting stablecoin accumulate idle.

PPL-denominated fees need no buyback step at all; they already arrive as PPL. A future owner
decision could also route a slice of idle treasury PPL into discretionary buybacks of something
else (e.g. LP rebalancing), but that is out of scope here — this note only covers the specific
policy approved this batch.

## 3. Contract vs. chain module

**Recommendation: application-layer (multisig + existing AMM contract), not a new chain
module.** Reasons:

- A new native module (e.g. a `x/buyback` Cosmos SDK module executing swaps at the end-block)
  changes consensus state transitions and `stateRoot` composition, which requires a coordinated
  node upgrade — the same high-risk class as `SECURITY_UPGRADE_HEIGHT` in
  `docs/AUDIT-CRITICAL-FIXES.md` and the M11-2 sweep handler in
  `chain/overrides/evmd/upgrades/upgrades.go`. That cost is not justified for a periodic,
  low-frequency, already-governable action.
- The chain already has everything a buyback needs at the application layer: an on-chain AMM
  (`ammFactory` / `router` — `contracts/deployments/97401.json`) for the swap itself, and a
  multisig that already custodies the treasury/liquidity balance and already executes scheduled,
  published actions (the M11-2 sweep, LP lock, vesting controllers per `/tokenomics`).
- Keeping it at the multisig+contract layer means a buyback is just another signed EVM
  transaction: easy to audit, easy to pause (don't sign), easy to change cadence or venue later
  without a chain upgrade.

Two multisig-shaped things already exist on People and must not be confused:

| Name | Kind | Holds | Used for |
| --- | --- | --- | --- |
| `TreasuryMultisigAddress` (`people1e9y…`, 2-of-3) | Native Cosmos multisig | Treasury (20%) + liquidity (10%) PPL fee shares, credited every block by `peoplefees` | M11-2 custody (implemented) |
| `PeopleMultisig.sol` (`0x8e6a…`, 2-of-3) | EVM contract | `Ownable.owner()` of `CommunityTokenVault` / `BondingCurveMarket` | Submit/confirm/execute vault calls |
| Sale multisigs (2-of-3 per `/tokenomics`): Safe (EVM), Squads (Solana), TON multisig wallet, Tron multi-sig permissions | External-chain multisigs | Public-sale stablecoin proceeds | Sale proceeds, LP open, vesting controllers |

Because this is a cosmos-evm chain, `TreasuryMultisigAddress` has a 1:1-mapped `0x…` EVM address
controlled by the same signer set, so it can submit ordinary EVM transactions (an ERC-20
`approve` + a swap call to `router`) without any new on-chain plumbing. A future stablecoin fee
gateway (§5) would land its stablecoin fee share at this same address, so the buyback step is:
the treasury multisig signs a swap of its stablecoin balance for PPL through `router`.

## 4. Cadence and execution

- **Cadence:** batched, not per-fee. A per-transaction buyback would be dust (most launch fees
  are a few PPL-equivalent) and would pay AMM slippage/gas on every single launch. Recommend a
  **weekly** sweep, with a minimum stablecoin balance threshold (e.g. don't bother under some
  owner-set floor) so a slow week doesn't force a trade at the worst possible size.
- **Execution:** the treasury multisig signers submit one swap transaction (stablecoin →
  PPL) through the existing `router` contract, sized to whatever stablecoin balance has
  accumulated at the treasury/liquidity address since the last run. No price oracle beyond the
  AMM's own spot price is required; a max-slippage bound on the swap call protects against a
  thin pool.
- **No discretion beyond cadence:** signers do not pick amounts or timing beyond "run the
  scheduled sweep" — the whole stablecoin balance (above the floor) goes in every time, so there
  is no judgment call that needs separate governance sign-off per run.

## 5. Relationship to the stablecoin launch fee — now implemented

Token/NFT creation fees are still native PPL at the `TokenFactory.sol` / `NftFactory.sol` layer
(`PeopleConstants.TOKEN_CREATE_FEE` / `NFT_MINT_FEE`, checked against `msg.value`), mirrored in
consensus by `people-node/packages/core/src/factory-fees.ts`, and that layer is **unchanged** —
per the hard constraint for this batch, those deployed, already-immutable contracts' ABI and
bytecode are not touched. What changed from the original design-only draft (points 1–3 below are
the original text, kept for history; point 4 is what actually shipped):

1. **No bridged stablecoin exists on People (97401) for mainnet yet.** `contracts/deployments/97401.json`
   has no mainnet USDC/USDT address. On testnet this is no longer a blocker: `TestStablecoin.sol`
   (`contracts/src/samples/TestStablecoin.sol`) already ships two 6-decimal mocks, tUSDC/tUSDT
   (`website/src/data/evm-test-stables-97401.json`), and `StableFeeGateway` accepts any
   owner-allowlisted 6-decimal ERC-20 — a real bridged USDC/USDT just needs `setStableAllowed`
   once it exists on mainnet, no contract change.
2. _(superseded — see the owner decision above)_ The original draft proposed a gateway that
   splits the incoming stablecoin 30/25/20/10/15/0 itself and swaps part of it for PPL to pay the
   factory directly. That is not what was built: the approved policy sends 100% of the stable fee
   to the buyback recipient, and the 30/25/20/10/15 split happens **after** the treasury multisig
   buys back PPL with it (§4), not on the raw stablecoin. This removes the "community pool and
   Growth need their own stablecoin-accounting design" problem entirely — those pools only ever
   see PPL, exactly as they do today.
3. **The open question from the original draft is answered, and the answer is "no".**
   `TokenFactory.createToken` / `NftFactory.mint` record `msg.sender` as creator with no
   caller-verified "create on behalf of `X`" parameter, and `CreatorVesting.register` is gated
   `onlyFactory` via `PeopleProtocolRegistry.tokenFactoryAddress()` (`CreatorVesting.sol:36-40`).
   If `StableFeeGateway` called `TokenFactory.createToken` itself, the factory would see the
   gateway as `msg.sender` and record the **gateway** as creator — wrong, and not fixable by the
   gateway alone, because the registry only ever points at one `tokenFactory` address and
   `CreatorVesting`/`CommunityTokenVault.register` trust whatever that pointer resolves to.
   Making the factory accept an explicit, caller-verified `creator` parameter (mirroring how
   `registerIssuerReferralProgram`'s `verifyTokenCreatorOnChain` in
   `website/src/lib/founders/chain-verify.ts` verifies creatorship off-chain for a different
   purpose) would require changing `TokenFactory`'s ABI — forbidden this batch — or deploying a
   `TokenFactoryV2` and repointing the registry to it, a multisig-signed pointer switch that is
   itself a coordinated, auditable change. That is recorded as the **future option** below, not
   something this batch does.
4. **Shape actually built: a two-step flow, no "create on behalf of" needed.**
   `StableFeeGateway.payLaunchFee(kind, stable)` pulls the fixed USD stable fee from the caller
   straight to `buybackRecipient` via `SafeERC20.safeTransferFrom` (100%, no on-chain split), then
   pays the caller — not the factory, not itself — the live PPL amount from `pplFee(kind)` (an
   internal hook that reads `TokenFactory.tokenCreateFee()` / `NftFactory.mintFee()` on every
   call, never cached). The website then immediately calls the **unchanged**
   `TokenFactory.createToken` / `NftFactory.mint` with that PPL as `msg.value`, from the same
   user wallet. `msg.sender` at the factory is the user throughout — the gateway never calls the
   factory, so the creator-recording problem in point 3 never arises. The cost is one extra
   signature (approve-or-already-approved, then `payLaunchFee`, then the factory call) instead of
   a single atomic transaction; that is the price of not touching the factory ABI.
5. **Future option, not built this batch:** a `TokenFactoryV2` that accepts a caller-verified
   `creator` parameter, deployed and then wired in by the owner multisig flipping
   `PeopleProtocolRegistry.setTokenFactory` to point at it, would let a future gateway call the
   factory directly in one transaction. That is a coordinated, registry-pointer-switch change
   gated on the multisig signing it, and is out of scope here.
6. **Gas stays PPL always**, regardless of which asset paid the creation fee — unaffected by any
   of the above, since EVM gas is a protocol-level charge independent of the application-level
   fee gateway.

The website (`/create/token`, `/create/nft`, `/fees`) describes this as live on testnet with an
**owner-approved** stable price (§8) — 5.00 USD for a token launch, 10.00 USD for an NFT mint —
not yet wired to a mainnet bridged stablecoin, and People-network-only; paying the stable fee
from another chain (Ethereum, Polygon, Tron, TON, Solana) is not built yet.

## 6. Explorer visibility

No new indexing code is required for the buyback swap itself: it is an ordinary `router` swap
transaction from a known, published address (`TreasuryMultisigAddress`'s EVM-mapped address), and
the explorer (`website/src/app/explorer`, `website/src/components/explorer/*`) already lists
transactions and transfers per address. Recommended (future, not this batch) polish once a
buyback actually ships:

- A labeled "Buyback" tag on the explorer's transaction view when `from == treasury multisig`
  and the call target is `router`'s swap function, so it reads as a distinct, named event rather
  than an anonymous swap.
- A small rollup (total PPL bought back, by week) next to the existing fee-split chart on
  `/tokenomics`, sourced from the same indexed transactions — no new on-chain state needed.

## 7. Non-goals / explicitly out of scope here

- No burn. Burn stays at the approved 0 bps; bought-back PPL returns to treasury/liquidity, it
  is not removed from supply.
- No new Growth Pool mechanic and no change to the 15% Growth share or its existing L1/L2
  settlement.
- No chain module, no coordinated node upgrade, no new consensus-critical code.
- No change to `TokenFactory.sol` / `NftFactory.sol` ABI or bytecode — `StableFeeGateway`
  (§5.4, §8) sits in front of them unchanged.
- No actual swap or cadence-automation code for the batched treasury buyback (§4) — that part
  of the mechanism remains the design to be reviewed, costed, and implemented as its own change.
  `StableFeeGateway` itself (the stable-fee intake half of the picture) is implemented and
  tested (§8).

## 8. Stable fee pricing — `StableFeeGateway` (implemented)

`contracts/src/fees/StableFeeGateway.sol`, tests in `contracts/test/fees/StableFeeGateway.t.sol`,
deploy script `contracts/script/DeployStableFeeGateway.s.sol`, self-review
`docs/audits/STABLE-FEE-GATEWAY-SELF-REVIEW.md`.

- **The stable fee is a fixed USD amount (6 decimals), not derived from the PPL price.** It is
  set per `Kind` (`TOKEN_LAUNCH`, `NFT_MINT`) in the constructor and owner-settable afterwards via
  `setStableFee`, bounded by `MIN_STABLE_FEE_USD6` (0.01 USD) and `MAX_STABLE_FEE_USD6` (100 USD).
  This is deliberate: a stablecoin fee priced directly off a PPL/USD oracle would reintroduce the
  exact price dependency a *fixed* USD launch fee is meant to avoid, and no oracle/pool-based PPL
  pricing decision has been approved yet.
- **The deploy script's default values are the owner-approved price** (owner decision, 2026-10-12): 5.00
  USD for a token launch, 10.00 USD for an NFT mint (`DeployStableFeeGateway.s.sol`,
  `APPROVED_TOKEN_STABLE_FEE_USD6` / `APPROVED_NFT_STABLE_FEE_USD6`), overridable via
  `GATEWAY_TOKEN_STABLE_FEE_USD6` / `GATEWAY_NFT_STABLE_FEE_USD6` env vars. The owner can change
  them post-deploy with `setStableFee` at any time, within the min/max bounds, with no redeploy.
  The already-deployed testnet gateway (`0xB68441f160C63988105285944534c607Dfd94E80`, which
  supersedes the paused `0xF85Cc098Ccbd41580D74d0877e68EA541DbaeE44`) is set to these same values
  on-chain.
- **The PPL side is a separate concern, read live, not cached.** `pplFee(kind)` is a public view
  that calls an internal `_pplFee(kind)` hook, which currently reads
  `TokenFactory.tokenCreateFee()` / `NftFactory.mintFee()` on every call. If those factories (or a
  future `TokenFactoryV2`, §5.5) ever price the PPL fee from an oracle, a pool, or any other
  live source, `StableFeeGateway` needs no change — it already treats the PPL fee as "whatever
  the factory says right now", never as a value baked into this contract.
- **Why split the USD price and the PPL price into two independent settings:** the stable fee
  funds the public buyback (§4) and is a demand-side policy lever the owner may tune without
  touching protocol fee economics; the PPL fee is the protocol's own launch-fee economics
  (`PeopleConstants.TOKEN_CREATE_FEE` / `NFT_MINT_FEE`), governed separately and already paid by
  every direct-PPL launch. Coupling them would mean every stable-price change accidentally
  changes the protocol-level PPL fee, or vice versa — this design keeps them orthogonal on
  purpose.
