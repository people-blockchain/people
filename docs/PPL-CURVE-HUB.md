# PPL curve hub (Base) — operations runbook

**Contract:** `contracts/src/sale/PplCurveHub.sol` · **Deploy script:** `contracts/script/DeployPplCurveHub.s.sol` · **Site:** `website/src/lib/sale/`

The hub sells PPL allocation on a bonding curve for allowlisted stablecoins on Base. PPL is not transferred on Base: purchases are recorded in `purchasedOf` and delivered on the People chain. Stablecoins go straight to the immutable `treasury`; the hub never holds funds.

## Roles and deploy guards

- `OWNER` and `TREASURY` are Safes (contracts). On Base mainnet (8453) the deploy script refuses to run unless both have code, and refuses `TREASURY == broadcaster`.
- The owner can `pause()` / `unpause()`, `setToken`, `open()` and `rescueToken`; `renounceOwnership` is disabled.
- `setToken(token, true)` works only before `open()`. After `open()` the owner can only disable tokens (`setToken(token, false)`); enabling or re-enabling reverts with `SaleAlreadyOpened`.

## Behaviour to know

- **Buying from the treasury address is impossible.** The hub measures the treasury's balance delta around `transferFrom`; if the payer is the treasury the balance does not change and `buyWith` reverts with `TransferMismatch`. The site pre-checks this (`treasury_address`) before asking for an approval, and the deploy script keeps the broadcaster away from the treasury on 8453. Test purchases must come from another wallet.
- **L-1 — treasury migration = deploy a new hub.** `treasury` is `immutable`. To move funds to another treasury, deploy a new hub with the new `TREASURY`, run the rollout below for it, point the site at the new address, then `pause()` the old hub and mark it deprecated in the allowlist. Allocations already recorded in the old hub's `purchasedOf` must be carried over by the delivery tooling when PPL is delivered on the People chain.
- **L-2 — monitor the stablecoin peg.** Every allowlisted token is valued at exactly 1 USD. Monitor the USDC and USDT market price (alert on a sustained deviation, e.g. > 0.5%). On a depeg the response is: `pause()` through the Safe first, then `setToken(token, false)` for the affected token, then `unpause()` once only healthy tokens remain. A disabled token cannot be re-enabled on the same hub.
- **L-3 — risk accepted.** Reviewed and accepted by the team; no code change.

## Rollout plan

**The code can be merged before the hub is deployed.** Production has no `NEXT_PUBLIC_SALE_HUB_ADDRESS`, `NEXT_PUBLIC_SALE_CHAIN` is unset (sale mode `base`), and no `NEXT_PUBLIC_SEPOLIA_*` / `NEXT_PUBLIC_BASE_TEST_*` variables exist. In that state:

- the production guard (`VERCEL_ENV=production`) throws only for a sale mode other than `base`; a missing hub address is not an error, so the build passes;
- `/buy` shows the "sale opens soon" state: closed headline, disabled main button, no bridge widget, no balance reads, no hub or RPC calls, and a purchase attempt stops with `sale_not_configured` before any wallet prompt.

Merging first therefore cannot expose a buy flow or break the build. Then, in this order:

1. **Deploy the hub** with `DeployPplCurveHub.s.sol` (`OWNER` = Safe, `TREASURY` = Safe, a different broadcaster, `OPEN_SALE` unset).
2. **Safe `setToken`** for canonical Base USDC and USDT. This must happen before `open()`; tokens cannot be added later.
3. **Set the env** `NEXT_PUBLIC_SALE_HUB_ADDRESS` in the Vercel **Preview** environment, with `NEXT_PUBLIC_SALE_CHAIN` unset (or `base`). Production builds fail if the sale mode is anything but `base`.
4. **Preview:** check the preview deployment end to end (quote, limits, treasury guard message, the "Buy on Base" button after a bridge delivery).
5. **Production:** set the same `NEXT_PUBLIC_SALE_HUB_ADDRESS` for Production and redeploy (the variable is inlined at build time). The page stays on "soon" until the owner opens the sale on-chain.
6. **Safe `open()`** at the planned opening time.

## Test hub on Base mainnet (8453)

The TEST copy of the hub on 8453 (valueless mock stablecoins, public mint; same addresses as `contracts/deployments/base-sepolia.json`, older 3-argument `buyWith`) must be retired before launch:

- call `pause()` from its owner;
- mark it **deprecated** in the allowlist below and in any deployment record;
- never point `NEXT_PUBLIC_SALE_HUB_ADDRESS` at it; it is reachable only through `NEXT_PUBLIC_SALE_CHAIN=base-test` on Preview/Development.

## Off-chain allowlist of official hubs

Anyone can deploy a contract that looks like the hub. Keep a short, versioned list of the official hubs and publish it next to the site docs. For each hub record: chain id, address, treasury, status (`active` / `paused` / `deprecated`), deploy tx and source commit. The site, announcements and support answers refer only to addresses on this list; every migration (L-1) or retirement adds or updates an entry in the same change.
