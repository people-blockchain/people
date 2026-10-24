# V5 testnet redeploy plan (chainId 97401, `people_97401-1`)

> **Status: plan only.** Nothing described here has been executed. This document does not
> authorise a deploy: every broadcast step needs an explicit go from the multisig signers.
> No private key, mnemonic or RPC credential appears in this file or must be pasted into a
> commit, PR, issue or chat. Keys are supplied only through the operator's secret manager
> (`DEPLOYER_PRIVATE_KEY` env var at the moment of broadcast) and are never written to disk.

V5 is the set of contracts that include the pre-mainnet audit guards (PR #21) plus the
follow-up batch (PR #38: MF-10, MF-11, MF-12). Current live set is **V4**
(`contracts/deployments/97401.json`, keys with the `V4` suffix; un-suffixed keys point at the
latest security-fix redeploy). There is no `V5` key in the repo yet.

## 1. What changes

Source diff against `main` before this work: `git diff origin/main --stat -- contracts/src`
(8 files, no storage-layout migration is possible: every change is a **bytecode replace**).

| Contract (file) | Change | Redeploy? | ABI / constructor impact |
| --- | --- | --- | --- |
| `BondingCurveMarket` (`src/curve/BondingCurveMarket.sol`) | `buy(token,minTokensOut,deadline)` and `sell(token,tokenAmount,minNativeOut,deadline)` get a mandatory `deadline`; zero `minOut`, zero recipient, re-registration are rejected (`Expired`, `ZeroMinOut`, `ZeroRecipient`, `AlreadyRegistered`); `totalAccountedNative` + owner `sweepNativeDust(token,to)` (`NativeDustSwept`); `CurveNotSettled`, `NothingToSweep`, `InvalidToken` errors | **Yes** | **Breaking ABI**: old 2/3-arg `buy`/`sell` selectors are gone. Constructor unchanged (6 args). `IBondingCurveMarket.sol` changed accordingly |
| `TokenFactory` (`src/factory/TokenFactory.sol`) | `totalSupply` bounded by `PeopleConstants.MAX_TOKEN_TOTAL_SUPPLY = 1e40` (`SupplyTooLarge`, MF-11) | **Yes** | Constructor unchanged (5 args). New error only |
| `PeopleAmmFactory` (`src/amm/PeopleAmmFactory.sol`) | `createPair` asks the token's own creator factory (and the registry's current factory) whether the curve may list it, fails closed on a bad registry (`RegistryCheckFailed`, MF-10) | **Yes** | Constructor unchanged (`registry_`). New error only |
| `PeopleRouter` (`src/amm/PeopleRouter.sol`) | Source unchanged, but `factory` is `immutable`, so a new `PeopleAmmFactory` forces a new router | **Yes (forced)** | Constructor `(ammFactory, wppl)`; reuse existing `WPPL` |
| `StableFeeGateway` (`src/fees/StableFeeGateway.sol`) | Owner `rescueERC20(token,to,amount)` (`ERC20Rescued`, `NativeTokenNotRescuable`, `NativeBalanceChanged`); the native-PPL ERC-20 precompile address can never be rescued | **Yes** | Constructor unchanged (6 args); new function and events |
| `MerchantEscrow` (`src/lavka/MerchantEscrow.sol`) | Pull-payment refunds (`pendingWithdrawals`, `withdrawPending()`, `PendingCredited`, `PendingWithdrawn`, `NothingPending`); merchant dispute only inside its claim window (MF-12) | **Yes** | Constructor unchanged (`owner_`). **New user-facing flow**: payouts after a dispute are credited, then withdrawn |
| `CreatorVesting` (`src/vesting/CreatorVesting.sol`) | `register` refuses to overwrite an existing schedule (`AlreadyRegistered`) | **Yes** | Constructor unchanged (`core_` = registry) |
| `CommunityTokenVault` (same file) | `registered` flag, `register` is one-shot per token | **Yes** | Constructor unchanged (`core_`, `initialOwner_`) |
| `PeopleConstants` (`src/PeopleConstants.sol`) | New constants (`NATIVE_PPL_ERC20`, `MAX_TOKEN_TOTAL_SUPPLY`); library constants are inlined, so no separate deploy | n/a | n/a |

**Not redeployed (reuse V4 addresses):** `PeopleProtocolRegistry`, `WPPL`, `PeopleMultisig`,
`PeopleTimelock`, `GovernanceToken`, `PeopleGovernor`, `NftFactory`, `CommunityAgentWallet`,
`LavkaPass`, `LavkaPayments`, `PromoRewardsVault`, `CommunitySale` and the sample token /
collection contracts. Re-confirm that list against the final `git diff --stat` of the release
commit before you start; if it differs, this plan must be updated first.

Two consequences of the "forced" rows:

* `TokenFactory` holds `bondingCurve` and `communityVault` / `creatorVesting` as immutable
  dependencies, so the **whole launch chain is replaced together**:
  `BondingCurveMarket -> CommunityTokenVault -> CreatorVesting -> TokenFactory -> StableFeeGateway`,
  plus `PeopleAmmFactory -> PeopleRouter`.
* `StableFeeGateway` is bound to one `TokenFactory` and one `NftFactory` at construction.
  It is replaced because its bytecode changed and because the factory it points to changes.
  `NftFactory` itself is unchanged, so it must be re-pointed (`setGateway`) to the new gateway.
  That call is owner-only: the owner is the timelock after the V4 handover, so it is a
  scheduled timelock operation (see step 6). If the signers prefer to avoid that,
  redeploy `NftFactory` too, using the same temporary-deployer-owner pattern as
  `script/RedeploySecurityFixes.s.sol`.

## 2. Preconditions (all must hold before any broadcast)

1. The release commit is merged to `main` and `forge build` and `forge test` are green on it
   (`cd contracts && forge build && forge test`). Save the summary line in the release notes.
2. `bash contracts/scripts/check-eip170.sh` passes (contract size limit). `via_ir` is on, and
   `BondingCurveMarket` and `TokenFactory` are the largest runtime sizes.
3. The deployer EOA is funded for gas on 97401 (see `docs/TESTNET-FAUCET.md`). Record only the
   balance check result, not any key material.
4. The multisig signers are available (needed for the timelock operations in step 6).
5. A snapshot of the current state is archived: copy `contracts/deployments/97401.json` to
   `contracts/deployments/97401.v4-snapshot.json` in the release branch, and export
   open-position data as described in section 5.
6. Maintenance notice: curve trading and token creation are paused on the site (step 8) from
   the moment the registry is re-pointed until smoke tests pass.
7. Chain check: `cast chain-id --rpc-url "$RPC_URL"` returns `97401`. The scripts also
   `require(block.chainid == PEOPLE_EVM_CHAIN_ID)`.

## 3. Deploy order

The order follows constructor dependencies. The existing script pattern (deployer is a
*temporary* owner so wiring is instant, then ownership moves to the timelock) is reused from
`contracts/script/RedeploySecurityFixes.s.sol`. A new script `script/RedeployV5.s.sol`
**does not exist yet and must be written and reviewed in a separate PR** (this PR only adds
the contracts and this plan); it should read the unchanged addresses from
`deployments/97401.json` (`registry`, `wppl`, `timelock`, `peopleMultisig`, `nftFactory`,
`lavkaPass` and so on) like `_readExisting()` in the script above. Do not run
`Deploy.s.sol` or `RedeployFullStack.s.sol` for V5: they would also replace the registry,
timelock and multisig.

| # | Contract | Constructor params | Initial owner / roles | Final owner |
| --- | --- | --- | --- | --- |
| 1 | `PeopleAmmFactory` | `registry` (existing) | none (immutable `registry`) | none |
| 2 | `PeopleRouter` | `ammFactory` (#1), `wppl` (existing `WPPL`) | none | none |
| 3 | `BondingCurveMarket` | `registry`, `feeRecipient`, `router` (#2), `ammFactory` (#1), `initialOwner` = deployer, `treasury` = fee recipient | `Ownable`: deployer (temporary) | **timelock** via `transferOwnership` |
| 4 | `CommunityTokenVault` | `registry`, `initialOwner` = deployer | `Ownable`: deployer (temporary) | **timelock** |
| 5 | `CreatorVesting` | `registry` | none | none |
| 6 | `TokenFactory` | `feeRecipient`, `bondingCurve` (#3), `creatorVesting` (#5), `communityVault` (#4), `initialOwner` = deployer | `Ownable`: deployer (temporary) | **timelock** |
| 7 | `StableFeeGateway` | `owner` = **multisig** (no temporary step, so `pause()` stays instant), `buybackRecipient` = fee recipient, `tokenFactory` (#6), `nftFactory` (existing), `tokenStableFeeUsd6`, `nftStableFeeUsd6` | `Ownable`: multisig | multisig |
| 8 | `MerchantEscrow` | `owner` = **timelock** | `Ownable`: timelock | timelock |

Parameter values (take them from the V4 run, do not invent new ones):

* Fee recipient: the `FEE_RECIPIENT` env var if set, otherwise the value currently used by
  `RedeploySecurityFixes.s.sol`. Verify it equals the live V4 `TokenFactory.feeRecipient()`.
* `tokenStableFeeUsd6` / `nftStableFeeUsd6`: `GATEWAY_TOKEN_STABLE_FEE_USD6` /
  `GATEWAY_NFT_STABLE_FEE_USD6` env vars, defaults 5.00 USD and 10.00 USD
  (`5_000000` / `10_000000`) as in `RedeploySecurityFixes.s.sol`. Confirm the numbers with
  the owner before broadcast.
* `MerchantEscrow` owner: read from `deployments/97401.json` `.contracts.timelock`.
* Timelock delay is `2 days` (`PeopleTimelock(2 days)` in `Deploy.s.sol` / `DeployLavka.s.sol`).

Wiring inside the same broadcast (deployer is still owner, so these are instant):

* `tokenFactory.setGateway(gateway)` (the gateway owner is the multisig; the factory owner is
  still the deployer at this point).
* Only after all wiring: `bondingCurve.transferOwnership(timelock)`,
  `communityVault.transferOwnership(timelock)`, `tokenFactory.transferOwnership(timelock)`.

Dry run first, with no `--broadcast` and no key on the command line:

```bash
cd contracts
export RPC_URL=...                 # operator value, never committed
forge script script/RedeployV5.s.sol:RedeployV5 --rpc-url "$RPC_URL"           # simulation only
```

Real broadcast (signers present, deployer key injected from the secret manager into the
environment for this one command only):

```bash
forge script script/RedeployV5.s.sol:RedeployV5 --rpc-url "$RPC_URL" --broadcast
```

The broadcast writes `contracts/broadcast/RedeployV5.s.sol/97401/run-latest.json`. That file
holds addresses and transaction hashes only; review it before committing anything.

## 4. Ownership, timelock and registry re-pointing

After the broadcast, state on chain is: new contracts exist, but **registry still points at
the V4 `TokenFactory`**, so nothing user-facing has moved yet. Every step below goes through
the multisig and the 2-day timelock (`PeopleTimelock`), with the multisig as
proposer/canceller and executor open to anyone, as set up in `Deploy.s.sol`.

| Step | Target | Call | Why |
| --- | --- | --- | --- |
| T1 | `PeopleProtocolRegistry` (owner: timelock) | `setTokenFactory(newTokenFactory)` | `CommunityTokenVault.register`, `CreatorVesting.register` and `BondingCurveMarket.registerToken` all gate on `registry.tokenFactoryAddress() == msg.sender`. Until T1 executes, `createToken` on V5 reverts |
| T2 | existing `NftFactory` (owner: timelock) | `setGateway(newStableFeeGateway)` | The old gateway is bound to the old token factory. Skip if `NftFactory` was redeployed |
| T3 | optional | Revoke the old gateway from the old `NftFactory` flow by pausing the old gateway via the multisig (`pause()`, instant) | Prevents fee payments going to the retired gateway |

Schedule T1 and T2 as one batch (`scheduleBatch`) so both land at the same time, then execute
after the delay. Record the operation ids and execution transaction hashes in the release
notes.

Do **not** put the new deployer EOA in any permanent role. After the broadcast, assert:

```bash
cast call <bondingCurve>   "owner()(address)" --rpc-url "$RPC_URL"   # == timelock
cast call <communityVault> "owner()(address)" --rpc-url "$RPC_URL"   # == timelock
cast call <tokenFactory>   "owner()(address)" --rpc-url "$RPC_URL"   # == timelock
cast call <gateway>        "owner()(address)" --rpc-url "$RPC_URL"   # == peopleMultisig
cast call <merchantEscrow> "owner()(address)" --rpc-url "$RPC_URL"   # == timelock
```

## 5. State migration

There is no storage migration: all replaced contracts are fresh deployments with empty state.
What this means per contract:

* **Tokens launched on V4 factories** keep working with their V4 curve. Their immutable
  `factory` and `bondingCurve` links point at V4 contracts, which stay on chain. The V4 curve
  and V4 `TokenFactory` are **not** decommissioned and keep their owner (timelock), so users
  can still sell or migrate their tokens. The new `PeopleAmmFactory` guard (MF-10) is written
  specifically so tokens created by a retired factory stay listable: it asks the token's own
  creator factory, not just the registry's current one.
* **AMM pools** on the V4 `PeopleAmmFactory` / V4 router (see `pools` in
  `deployments/97401.json`) are not migrated. They remain reachable through the V4 router.
  New pairs are created on the V5 factory. The site must keep the V4 router address available
  for existing pools (section 7). Do **not** try to move liquidity: testnet only, and the
  chain history policy in `docs/COSMOS-EVM-TESTNET-CUTOVER.md` is "no state migration".
* **`CreatorVesting` / `CommunityTokenVault` schedules** for V4 tokens stay in the V4
  contracts. V5 contracts start empty and only serve tokens created via the V5 `TokenFactory`.
* **`MerchantEscrow`**: V4 escrows stay in the V4 contract. Before retiring the V4 escrow in
  the UI, list open escrows (`EscrowCreated` logs, then `escrows(id)` for status) and either
  let them settle in V4 or ask the timelock owner to resolve them. New escrows are created in
  V5. The UI must read both addresses until V4 has no open escrows.
* **`StableFeeGateway`**: balances held by the V4 gateway are rescued by its multisig owner as
  before. The V5 gateway has `rescueERC20`, which can be used on V5 only.

Archive step (read-only, safe): `node contracts/scripts/export-legacy-testnet.mjs` writes
`contracts/deployments/legacy-testnet-export.json`, and `contracts/scripts/verify-migration.mjs`
checks it. Run them before and after, and attach the output to the release notes.

## 6. Verification of deployed code

`contracts/foundry.toml` has no 97401 `rpc_endpoints` entry and no explorer/verifier section,
so verification is done by bytecode comparison, which does not depend on an explorer:

```bash
cd contracts
forge build
# for each new address from run-latest.json:
cast code <address> --rpc-url "$RPC_URL" > /tmp/onchain.hex
jq -r '.deployedBytecode.object' out/<File>.sol/<Contract>.json > /tmp/local.hex
# Compare after stripping the metadata suffix (the trailing CBOR block) from both.
```

Checklist per contract:

1. `eth_getCode` is non-empty for all 8 addresses (the pattern from
   `docs/COSMOS-EVM-TESTNET-CUTOVER.md`).
2. Runtime bytecode equals the local `deployedBytecode` of the release commit, except
   immutables and the metadata hash.
3. Immutables and constructor args read back correctly:
   `router.factory() == ammFactory`, `ammFactory.registry() == registry`,
   `tokenFactory.bondingCurve() == bondingCurve`, `gateway.tokenFactory()`/`nftFactory()`
   match, `bondingCurve` router/factory addresses match.
4. Owners match section 4.
5. If the explorer used for this chain supports source verification, submit with
   `forge verify-contract` using the explorer's own verifier URL (supplied by the operator),
   compiler `0.8.24`, optimizer runs `200`, `via_ir = true`, EVM version `paris`.
   Treat this as optional; bytecode comparison is the required check.
6. Commit `contracts/deployments/97401.json` with the V5 keys, and keep the `V4` keys.

## 7. ABI sync and address sync into the website

Facts about where the website keeps this data:

* **Addresses**: `website/src/data/evm-deployments-97401.json`. It has `chainId`,
  `cosmosChainId`, `rpcUrl`, `deployer`, `deployBlock`, `assetMap`, `pools` and a `contracts`
  block with latest un-suffixed keys (`registry`, `tokenFactory`, `bondingCurve`, `router`,
  `wppl`, `ammFactory`, `nftFactory`, `creatorVesting`, `communityVault`, `peopleMultisig`,
  `gateway`, `agentWallet`, `timelock`, `governor`, `lavkaPass`, `merchantEscrow`,
  `lavkaPayments`, `promoRewardsVault`, ...) plus historical `*V1..*V4` keys. It is read by
  `website/src/lib/evm/config.ts` (and `evmContractsReady()` there checks `tokenFactory`,
  `router`, `wppl`). The source of truth is `contracts/deployments/97401.json`.
* **Other address files**: `website/src/data/evm-stable-fee-gateway-97401.json` (imported by
  `website/src/lib/evm/stable-fee-gateway.ts`), `website/src/data/evm-test-stables-97401.json`,
  `website/src/data/evm-deployments-97401-samples.json`, `website/src/data/ppl-sale-evm.json`.
* **ABIs** are hand-written TypeScript constants, not generated from `contracts/out`:
  `website/src/lib/evm/client.ts` (factory, router, token ABIs), `website/src/lib/evm/nft-factory.ts`,
  `website/src/lib/evm/stable-fee-gateway.ts`, `website/src/lib/evm/staking-abi.ts`,
  `website/src/lib/lavka/contracts.ts` (LavkaPass, MerchantEscrow, LavkaPayments),
  `website/src/lib/lavka/chain-verify.ts`, `website/src/lib/sale/pplCurveHub.abi.ts`.
  The only generated artifacts are `website/src/lib/generated/sample-contracts-artifacts.json`
  (`website/scripts/generate-sample-contract-artifacts.mjs`, reads `contracts/out`, manual run)
  and `website/src/lib/generated/contract-template-artifacts.json`
  (`website/scripts/precompile-templates.mjs`). Neither covers V5 core contracts.
* **Address copy scripts**: `contracts/scripts/write-deployments-json.sh`,
  `contracts/scripts/seed-97401.mjs` (copies to `website/src/data/`),
  `contracts/scripts/merge-lavka-deployments.mjs` (merges Lavka from
  `broadcast/DeployLavka.s.sol/97401/run-latest.json`). There is no single sync command.

Procedure:

1. Update `contracts/deployments/97401.json`: move current un-suffixed values for the 8
   redeployed contracts to `*V4`-suffixed keys if not already there (they are, for most),
   then write the new addresses into the un-suffixed keys and add `*V5` aliases for the 8
   contracts. Update `deployedAt` and `deployBlock` (the first block of the V5 broadcast).
   Keep `routerV4`/`ammFactoryV4` so existing pools stay reachable.
2. Copy to the site: `cp contracts/deployments/97401.json website/src/data/evm-deployments-97401.json`
   (same command as in `docs/COSMOS-EVM-TESTNET-CUTOVER.md`). Regenerate
   `evm-stable-fee-gateway-97401.json` with the new gateway address and fees.
3. ABI diff for the hand-written constants, generated from the freshly built artifacts:
   ```bash
   cd contracts && forge build
   for c in BondingCurveMarket TokenFactory PeopleAmmFactory StableFeeGateway MerchantEscrow CommunityTokenVault CreatorVesting; do
     jq '.abi' out/$c.sol/$c.json > /tmp/$c.abi.json
   done
   ```
   Compare against the matching ABI constants listed above and update:
   * `website/src/lib/lavka/contracts.ts` and `chain-verify.ts`: add `pendingWithdrawals(address)`,
     `withdrawPending()`, `NothingPending`, `PendingCredited`, `PendingWithdrawn`. The lavka UI
     must show a "withdraw" action when `pendingWithdrawals(account) > 0`.
   * `website/src/lib/evm/stable-fee-gateway.ts`: add `rescueERC20` only if an admin UI uses it
     (it is owner-only; probably not needed on the site).
   * `website/src/lib/evm/client.ts` (token factory ABI): new `SupplyTooLarge` error for error
     decoding. The create-token form must cap total supply at `1e40` base units (and see the
     form validation in `website/src/components/factory/EvmTokenLaunch.tsx`).
   * Curve `buy`/`sell`: the site currently contains no call to the curve `buy`/`sell`
     selectors (it reads state and the `CurveBuy`/`CurveSell` logs in
     `website/src/lib/evm/market-data.ts`; events are unchanged). If any other client, bot or
     script calls the curve directly, it **must** switch to the 3- and 4-argument forms with
     a deadline. Search the repo and external scripts for `minTokensOut`/`minNativeOut`.
4. Add the V4 router and V4 factory as a fallback for existing pools only if the UI lists
   pools by `deployments.pools[].router`; otherwise swap routing by pool address keeps working.
5. `cd website && npm run build` (and the unit tests that exist in `website/`) must pass
   before the PR is opened. Do not change Vercel environment variables as part of this
   step; `EVM_RPC_URL` stays as-is. Any env change is a separate, explicit operator action.

## 8. Rollout sequence

1. Announce maintenance; website feature flag / banner for the launch pad (separate PR).
2. Deploy (section 3) and run the verification checklist (section 6).
3. Schedule T1+T2 on the timelock (section 4); wait for the delay; execute.
4. Open the website PR with the address and ABI sync (section 7), preview deploy, run the
   smoke tests below against the preview.
5. Merge the website PR only after smoke tests pass on the preview. Production deploy through
   the normal pipeline.

## 9. Smoke tests

Run read-only checks first, then one write path per area with a throwaway funded test account
(never the deployer or a signer key):

Read-only:

* `cast call <registry> "tokenFactoryAddress()(address)"` equals the new `TokenFactory`.
* `cast call <tokenFactory> "bondingCurve()(address)"` equals the new curve.
* `cast call <ammFactory> "registry()(address)"` equals the registry.
* Owners as in section 4; `cast call <gateway> "paused()(bool)"` is `false`.

Write paths:

1. **Create token** through the site (or `contracts/scripts/evm-onchain-e2e.sh`): succeeds;
   attempt with total supply above `1e40` reverts with `SupplyTooLarge`.
2. **Curve buy**: with deadline in the future succeeds; expired deadline reverts `Expired`;
   `minTokensOut = 0` reverts `ZeroMinOut`.
3. **Curve sell**: same checks.
4. **Re-register**: calling `registerToken` again for an existing token reverts
   `AlreadyRegistered` (only possible from the factory address, so covered by the Foundry
   tests rather than on chain).
5. **Migration to AMM**: finish a test token's curve; `createPair` succeeds for a V5 token and
   for a V4 token (retired-factory path, MF-10).
6. **Gateway**: stable fee payment for token creation and NFT creation succeeds with the new
   gateway; `NftFactory.gateway()` equals the new gateway after T2.
7. **Escrow**: create escrow, dispute inside the merchant claim window succeeds, dispute after
   the window reverts `ClaimWindowElapsed`; refund is credited and `withdrawPending()` pays out.
8. **Website**: open the launch, swap, lavka and explorer pages; confirm the displayed
   addresses match `website/src/data/evm-deployments-97401.json` and that the V4 pools still
   load.
9. `contracts/scripts/smoke-local.sh` and `contracts/scripts/evm-onchain-e2e.sh` are the
   existing automation; review them before running, they must be pointed at `97401` only.

## 10. Rollback

Because the registry is only re-pointed at step T1, rollback is cheap until that moment:

* **Before T1 executes**: do nothing on chain. The V5 contracts are unused. Discard the
  website PR; V4 remains live. Cancel the scheduled batch via the multisig (`cancel`).
* **After T1 executed, before users depend on V5**: schedule through the timelock
  `registry.setTokenFactory(<V4 TokenFactory>)` and `nftFactory.setGateway(<V4 gateway>)`
  (another 2-day delay). The V4 contracts were never paused or decommissioned, so they work
  once re-pointed. Revert the website PR (git revert; `website/src/data/evm-deployments-97401.json`
  returns to the V4 values). Unpause the V4 gateway if it was paused in T3.
* **Emergency, before the delay elapses**: `StableFeeGateway.pause()` on V5 is an instant
  multisig action and stops fee-gated creation. The curve and factory owners are the
  timelock, so there is no instant lever there; this is by design (H-02).
* **Tokens created on V5 before rollback** remain valid on their V5 curve; do not delete V5
  addresses from `deployments/97401.json`. Keep them under `*V5` keys.
* Never reuse the deployer account for rollback: all rollback operations are multisig and
  timelock operations.

## 11. Release notes template

Record, without any key material: release commit SHA, `forge test` summary, 8 new addresses,
broadcast tx hashes, timelock operation ids and their execution txs, bytecode comparison
result, smoke test results, website PR link.
