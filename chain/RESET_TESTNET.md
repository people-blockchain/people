# Reset People's Cosmos EVM testnet genesis (approved 1B PPL emission)

This runbook is for operators resetting **testnet** validator data to the genesis produced by `chain/scripts/generate-emission-genesis.sh`. It does **not** authorize mainnet deploy. Do not run against production without an explicit founder-gated plan.

## Before resetting: is it a BeginBlocker halt? (no reset needed)

If the height stopped and CometBFT `/status` is exactly one block ahead of
`eth_blockNumber` (block store `H+1`, app `H`), the node saved block `H+1` and
then panicked in `FinalizeBlock`. The process stays up, keeps serving RPC, and
ignores SIGTERM. Example: M11-1 `peoplefees` `Int64() out of bound`, triggered
by the first fee-paying block with 100 PPL validator stakes (fixed in #172).
Do **not** wipe data. Install a fixed binary and restart. CometBFT replays
`H+1` through the new code during the ABCI handshake (`ABCI Replay Blocks
appHeight=H storeHeight=H+1`).

On each halted validator host, from a checkout of merged `main`:

```bash
git pull origin main
sudo bash chain/scripts/recover-halt.sh            # builds peopled, swaps, SIGKILL-restarts, verifies
# or with a prebuilt binary:
sudo PEOPLED_BIN=/path/to/peopled bash chain/scripts/recover-halt.sh
```

The script backs up the running binary (`<path>.bak-<UTC>`), installs the new
one in place, restarts the unit, and fails unless the height advances with no
new panic in the journal. If one host runs several `peopled*` units, run it
once per unit with `UNIT=<name>`. A pending EVM tx that was in the mempool at
the halt is either in `H+1` (it executes on replay) or dropped on restart.
Check the deployer nonce (`latest` vs `pending`) before any redeploy.

## When to reset vs keep `chain_id`

| Situation | `chain_id` | Action |
| --- | --- | --- |
| Live validators already on `people_97401-1` with the **old** (Cosmos-default) genesis | `people_97401-1` | **Hard reset required** — wipe all node data and replace `genesis.json` on every validator with the new file. Wallets/explorer stay on EVM `97401`. |
| Greenfield testnet (no users yet) | `people_97401-1` | Same wipe + new genesis; no id change. |
| Cannot coordinate a full network halt | New id e.g. `people_97401-2` | Only if founders explicitly choose a parallel network; update public `CHAIN_ID` docs and redeploy faucet/RPC config accordingly. **Default for this repo: stay on `people_97401-1`.** |

The emission genesis is deterministic from `chain/emission/allocation.json` + `peopled testnet init-files` gentxs (validator keys unchanged when you regenerate on the same machine).

## 1. Build genesis locally (review)

On a workstation with repo access (not on validators):

```bash
cd chain
./scripts/build-peopled.sh
chmod +x scripts/generate-emission-genesis.sh
./scripts/generate-emission-genesis.sh
python3 scripts/validate-emission-genesis.py .testnets/node0/peopled/config/genesis.json
```

Inspect `.testnets/node0/peopled/config/genesis.json`:

- `bank.supply` = `1000000000000000000000000000` appl  
- `mint.params` inflation fields = `0`  
- Validator pool vesting at `people1yaf2hms6r9z6ws3hk2nmfvn33ruatz6lezml02` with four annual periods (60M / 50M / 50M / 40M PPL)  
- `peoplefees.params.fee_split_bps` = 30/25/20/10/15/0 (basis points)

Copy the **same** `genesis.json` to all validators (node0 file is canonical after `collectGenFiles`).

## 2. Stop validators

On **each** validator host:

```bash
# systemd example — adjust unit name/path to your install
sudo systemctl stop peopled
# or docker compose:
cd /path/to/chain && docker compose down
```

Ensure no `peopled start` process remains.

## 3. Wipe chain data (destructive)

**Back up** `{DATA_DIR}` first if you need forensic recovery. Wiping is irreversible without a backup.

```bash
DATA_DIR=/path/to/peopled   # e.g. chain/.testnets/node0/peopled or mounted volume
rm -rf "$DATA_DIR/data"
rm -f  "$DATA_DIR/config/addrbook.json"
# keep config/priv_validator_key.json and node_key.json unless rotating keys
```

Install the new genesis:

```bash
cp /secure/copy/genesis.json "$DATA_DIR/config/genesis.json"
```

Every validator must use **identical** genesis and the same `chain_id` (`people_97401-1`).

## 4. Restart and sync

```bash
sudo systemctl start peopled
# verify
curl -sf http://127.0.0.1:26657/status | jq '.result.node_info.network,.result.sync_info.latest_block_height'
curl -sf http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/node_info | jq -r '.default_node_info.network'
```

Repeat on all validators; confirm block height advances and peers are connected.

## 5. Re-run EVM seed workflow

After RPC is healthy (`eth_chainId` = `0x17c79`):

1. GitHub → **Actions** → **Testnet EVM seed** (`.github/workflows/testnet-evm-seed.yml`).
2. Run workflow with inputs:
   - `rpc_url`: your JSON-RPC (default `https://node.peopleblockchain.network/rpc`)
   - `faucet_url`: faucet base URL
3. Requires repo secrets: `TESTNET_DEPLOYER_PRIVATE_KEY`, `FOUNDERS_AIRDROP_PRIVATE_KEY` (configured by repo admins — do not commit).
4. Merge the automated deployments PR if addresses changed, or re-run idempotently to refresh pools.

Faucet and deployer keys must be funded from test allocations after reset. Update the faucet env to an account that holds test PPL on the new chain.

The genesis buckets in `chain/emission/allocation.json` have **no signer**. Community (`people1vmdpt6…`) and the validator pool (`people1yaf2hm…`) are vesting accounts at module-derived addresses (`sha256("people_community_genesis")`, `sha256("people_validator_vesting")`). Treasury, team, sale and liquidity are `people_*` module accounts with no spend path. No key, mnemonic or multisig can move them. Only the keyring test accounts can sign. To top up the deployer and faucet from those, run this as root on a validator host. It is non-destructive and safe to re-run, and it never exports keys:

```bash
sudo bash chain/scripts/fund-testnet.sh            # DRY_RUN=1 to print the plan only
```

If the keyed accounts hold too little, the script exits `2` and lists the founder-gated options (an upgrade handler moving a fixed amount out of `people_treasury`, a genesis reset with the deployer and faucet funded, or a smaller seed spend).

## 6. Security note (mainnet)

Before any mainnet launch: **disable SSH password login**; use key-only (or SSO) access on all validator and ops hosts. This runbook does not change SSH settings.

## Placeholders owner must resolve

See `chain/emission/allocation.json`:

- `team` and `sale` module accounts use testnet module addresses (`owner_placeholder: true`) — replace with published vesting controllers before public sale/mainnet.
- DAO treasury migration from `people_treasury` module to published multisig is a governance/ops step (not automatic in this PR).

Fee routing runtime: Model A enforced in `evmd/peoplefees` (30/25/20/10/15/0). Genesis `distribution.params.community_tax` must stay **0** so `x/distribution` does not re-split fee-collector dust (peoplefees already sends 25% to the community pool). Governance can change `mint` params from year 5 onward; default genesis keeps mint at zero.
