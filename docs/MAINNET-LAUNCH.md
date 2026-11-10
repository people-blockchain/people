# PEOPLE mainnet launch runbook

**Status (2026-11-10):** tooling ready and rehearsed; mainnet is **not live**. Genesis:
**2026-11-30 12:00 UTC** (owner decision 2026-11-09), 12 hours before the PPL sale opens on
2026-12-01 00:00 UTC, in sale mode (buyers receive PPL on mainnet). Testnet `people_97401-1` keeps running.
Launching, and every action with real keys or funds, needs the owner's explicit go-ahead.

## Network identity

| Parameter | Mainnet | Testnet (unchanged) |
| --- | --- | --- |
| Cosmos chain-id | `people_97400-1` | `people_97401-1` |
| EVM chain id (EIP-155) | **97400** (`0x17c78`) | 97401 (`0x17c79`) |
| Denom | `appl` (18 decimals, display PPL) | same |
| Bech32 prefix | `people` | same |
| Supply at genesis | 1,000,000,000 PPL, mint 0 | same |

97400 is not registered in [ethereum-lists/chains](https://github.com/ethereum-lists/chains) and is
used nowhere else in this repo. Registering it there (chainlist.org) is a post-launch task.

## One binary, two networks

`peopled` serves both networks. Everything mainnet-specific is keyed on the genesis chain-id, so
testnet replays its history unchanged:

- `config.EVMChainIDFor(chainID)` picks the EVM chain id (97400 on mainnet) for every app
  construction (`chain/scripts/apply-evm-overrides.py` patches upstream `root.go`/`creator.go`).
  A mainnet node whose `app.toml` `[evm] evm-chain-id` is not 97400 refuses to start, because the
  JSON-RPC server reports that value to wallets.
- `peoplefees.TreasuryMultisigAddressFor(chainID)` routes the 20% / 10% / 15% fee shares to the
  **mainnet** multisig on mainnet. While `MainnetTreasuryMultisigAddress` is empty, a mainnet node
  halts at block 1 (`ErrMainnetTreasuryUnset`): a binary without the real multisig can never run
  mainnet, and fees can never reach the testnet signer keys.

## Genesis allocation

`chain/emission/allocation-mainnet.json`: same buckets and amounts as testnet
(`website/src/lib/tokenomics.ts`), with these mainnet differences:

| Bucket | PPL | Mainnet custody |
| --- | --- | --- |
| Community & rewards | 350M | Continuous vesting 6 years. **Spend path to decide** (see blockers). Holds the Million Founders program incl. Genesis Quest (up to 25M) |
| Validators | 200M | Periodic vesting 60/50/50/40M, streamed per block to signing validators (unchanged) |
| Team | 150M | 6-month cliff, then 18 months linear, on the owner's team-controller address |
| Treasury | 150M | Same schedule, on the 2-of-3 mainnet treasury multisig |
| Sale | 100M | **Spendable** on the treasury multisig, to fund `PplSaleDistributor` (PR #88) in tranches. On testnet it was a keyless module account nothing could spend |
| Liquidity | 50M | Spendable on the treasury multisig (one PPL/pUSDC pool on PEOPLE) |

No faucet, no deployer, no well-known dev accounts. Each genesis validator operator gets
`validator_reserve_appl` (100 PPL, carved out of community) and bonds
`validator_self_delegation_appl` (50 PPL) in its gentx.

`apply-emission-genesis.py` refuses to build a mainnet genesis while the allocation has any
placeholder, reuses a testnet signer key, carries extra accounts, or when allocation and genesis
chain-ids differ (a testnet allocation can never produce a mainnet genesis).
`validate-emission-genesis.py` (with `PEOPLE_ALLOCATION=emission/allocation-mainnet.json`) re-checks
the built genesis and cross-checks `feesplit.go` / `treasury_multisig_test.go` against the
allocation.

Consensus parameters (`chain/scripts/mainnet/mainnet-params.py`, all changeable by governance):
unbonding 21 days, max 100 validators, min commission 5%, downtime jail 10 min with 0.01% slash,
double-sign slash 5%, gov deposit 10,000 PPL, voting 3 days (expedited 1 day, 50,000 PPL),
block max gas 40M, 2 s commit timeout.

## Owner inputs still required (blockers)

1. **Treasury multisig, 3 public keys** (owner, co-founder, owner's cold key; threshold 2).
   Proposal: reuse the three owners of the Base sale Safe. Their eth_secp256k1 public keys can be
   recovered from any Base transaction they signed, so no new keys are needed. Then set
   `treasury_multisig` in `allocation-mainnet.json`, `MainnetTreasuryMultisigAddress` in
   `feesplit.go` and `mainnetTreasuryMultisigPubkeysHex` in `treasury_multisig_test.go` together.
2. **Team-controller address** for the 150M team bucket (not the treasury multisig).
3. **Community bucket spend path.** On testnet the community vesting address has no signer and no
   code path, so vested PPL can never move. Options: (a) recommended: `peoplefees` streams the vested
   amount into the x/distribution community pool each block (like the validator pool), spent by
   governance proposals; (b) the treasury multisig.
4. **Are PPL transfers open from day 1?** Recommended yes: locks (team, treasury, quest rewards) are
   enforced by vesting accounts, and sell-back only accepts sale-purchased PPL.
5. **Servers**: 3 to 4 validators on separate hosts (ideally 2+ providers), plus 1 to 2 RPC nodes.
6. **Genesis time**: DONE, **2026-11-30T12:00:00Z** (owner decision 2026-11-09).

## Ceremony (scripts in `chain/scripts/mainnet/`)

Each validator generates its own keys on its own server. Nothing secret is ever sent anywhere.

| Step | Who / where | Script | Output (public) |
| --- | --- | --- | --- |
| 1 | each validator server | `MONIKER=people-val-N bash validator-init.sh` | operator address, node id |
| 2 | coordinator | `OPERATORS=... GENESIS_TIME=... bash build-pregenesis.sh` | `pre-genesis.json` + sha256 |
| 3 | each validator server | `PREGENESIS=... PREGENESIS_SHA256=... MONIKER=... bash make-gentx.sh` | `gentx-<moniker>.json` |
| 4 | coordinator | `PREGENESIS=... GENTX_DIR=... bash finalize-genesis.sh` | `genesis.json` + sha256 |
| 5 | every node | `GENESIS=... GENESIS_SHA256=... PEERS=... sudo -E bash install-genesis.sh` | systemd unit; block 1 at genesis_time |

Validator keys use the encrypted `file` keyring. The operator mnemonic is written on paper once.
`priv_validator_key.json` is backed up offline. **Never run the same validator key on two machines
(double-sign = 5% slash and permanent jail).**

`bash rehearse.sh` runs the whole ceremony on one machine with throwaway keys and asserts the node
refuses to start without the real multisig. `REHEARSAL_BUILD=1 bash rehearse.sh` also builds a
throwaway binary that knows the rehearsal multisig and asserts the chain runs with
`eth_chainId == 0x17c78`. Both run in CI (`chain-ci.yml`).

## Infrastructure

- **Validators**: P2P (26656) only; CometBFT RPC, gRPC and Prometheus on 127.0.0.1; JSON-RPC and
  REST off (`configure-node.sh validator`). SSH key-only, firewall everything else.
- **Public RPC**: separate non-validator node(s) (`configure-node.sh rpc`), EVM JSON-RPC
  `eth,net,web3` only, behind a TLS reverse proxy with rate limits, on its own hostname (proposal:
  `rpc.peopleblockchain.network`; testnet stays on `node.peopleblockchain.network`). This URL is
  `PEOPLE_MAINNET_RPC_URL` on Vercel and `PEOPLE_RPC_URL` for the return cosigner and the delivery
  relayer.
- **Explorer**: the site's `/explorer` pointed at the mainnet RPC; a Blockscout instance later.
- **Monitoring**: Prometheus on each node (127.0.0.1:26660) scraped over a private network; alerts
  on height stall > 1 min, missed blocks, peer count < 2, disk > 80%. Telegram alert channel shared
  with the sale relayer/cosigner.
- **Backups**: offline copies of every `priv_validator_key.json` and operator mnemonic; daily data
  snapshot from an RPC node (never from a validator's signing state).

## After genesis (sale)

Everything below happens between genesis (**2026-11-30 12:00 UTC**) and the sale opening
(**2026-12-01 00:00 UTC**), so buyers get PPL on 97400 from the first purchase. `PplCurveHubV2` must
already be deployed on Base (closed) so its address can be passed as `BASE_HUB`.

1. **EVM owner on 97400.** The native 2-of-3 treasury multisig is a Cosmos multisig and cannot sign
   EVM transactions, and `DeployPplSaleDelivery` requires `OWNER` to be a contract. Deploy
   `contracts/src/governance/PeopleMultisig.sol` on 97400 with the same three owner EOAs:
   `[0x510B2e28e936d36eF1EDDA7C9ea592e359aB5D48, 0x685Ef7cE99a7C8bBC7BdE0B12594376163DDd4B2,
   0xCFFF2577D01b2494E0699Ac5E0D1EFA6485fF8D0]` (owner, co-founder, owner's cold key; the threshold
   starts at 2). Any owner submits, a second confirms, then an owner executes. Verify `owners()`,
   `threshold() == 2` and the bytecode before using it.
2. **Gas for the owners.** Mainnet genesis has no extra accounts, so send each owner EOA a small amount
   of PPL for gas: a `bank send` from the native treasury multisig, signed by 2 of 3
   (`peopled tx bank send … --generate-only`, `peopled tx sign --multisig …` by two signers,
   `peopled tx multisign`, `peopled tx broadcast`). The same flow funds the deployer and relayer keys.
3. **Delivery contracts.** Run `contracts/script/DeployPplSaleDelivery.s.sol` on 97400 with
   `--slow`, from a fresh deployer key with no pending transactions (the reporter is the predicted
   address at deployer nonce + 1), and `OWNER` = the PeopleMultisig from step 1,
   `RELAYER` = the relayer key's address, `BASE_HUB` = the Base `PplCurveHubV2`, `BASE_CHAIN_ID=8453`,
   `COMMUNITY_POOL`, and `REPORTER_CREDIT_LIMIT` (PPL **wei** per window, 1,000..100,000,000 PPL) /
   `REPORTER_CREDIT_PERIOD` (seconds, default 86400, 1 hour..7 days). The predicted distributor is
   set as `PplReturnBurn`'s initial `purchaseReporter` with that cap **in the constructor**, so
   `deliver` works right away; there is no 48 h wait. Later changes to the reporter or the cap still
   go through the 48 h `queue…` / `execute…` timelock.
   - **Cap sizing:** about 1.5–3× the expected peak daily sale volume in PPL, not the whole bucket.
     The cap bounds what a stolen relayer key can credit; the distributor balance (funded in
     tranches) bounds what it can pay out. The window is tumbling, so up to 2× the limit can pass
     around a window boundary. Hitting the cap stalls delivery on purpose: the relayer stops in
     order and alerts. If volume may exceed it, queue a higher cap right after deploy and execute it
     only if needed (`cancel` otherwise).
   - **Verify on chain before anything else** (the script's checks run in simulation only). With
     `cast` against the live RPC: the runtime code at the distributor matches the build artifact;
     `dist.returnBurn() == burn`; `burn.purchaseReporter() == burn.returnRecipient() == dist`;
     `burn.reporterCreditLimit()` / `reporterCreditPeriod()`; `burn.owner() == dist.owner() ==`
     the PeopleMultisig; `dist.relayer()`, `dist.baseHub()`, `dist.baseChainId() == 8453`,
     `dist.communityPool()`. If any check fails, abandon both contracts and redeploy; never re-point
     the reporter of an orphaned `PplReturnBurn`. Give only this verified `PplReturnBurn` address to
     the return verifier and the cosigner.
4. **Fund the distributor.** Send the sale PPL from the native treasury multisig (sale bucket) to the
   distributor, in tranches (2-of-3 `multisign` as in step 2). Convert the distributor's 0x address
   to bech32 and have two people check it; send a small test tranche first and confirm
   `dist.available()` grew. **Never send PPL to `PplReturnBurn`**: a bank send does not run EVM code
   and that contract has no way to send PPL out, so it would be stuck for good.
5. **Relayer.** Start `contracts/scripts/sale-delivery-relayer.mjs` with `RELAYER`'s key, Telegram
   alerts on, and confirm `preflight ok`.
6. Site: wallet network config for 97400 and `PEOPLE_MAINNET_RPC_URL`, so sell-back (from Dec 31)
   can switch wallets to mainnet.
7. Deploy the second return cosigner (`docs/v2/RETURN-COSIGNER.md`) pointed at the mainnet RPC.
8. **Last:** the hub owner calls `open()` on Base only after the relayer shows `preflight ok`,
   `dist.available() > 0` and every on-chain check in step 3 has passed.
