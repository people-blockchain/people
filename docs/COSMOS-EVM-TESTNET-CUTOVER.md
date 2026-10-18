> **Status 2026-10-14:** Cutover complete. Public RPC + Solidity launch set (token/NFT/AMM/gateway) are live; use this checklist for redeploys/ops.

# Cosmos EVM testnet cutover (operator checklist)

## Network

- JSON-RPC: `https://node.peopleblockchain.network/rpc`
- EVM chain id: **97401** (`people_97401-1`)
- Legacy people-node REST (`/snapshot`, `/assets`, …) is **not** served on this host — the public site uses JSON-RPC + deployed contracts.

## Deployer (fund before broadcast)

- Address: `0x74A50ac5Ea07f86fC10f0AD0E543e9321B57EB8c`
- GitHub secret: `TESTNET_DEPLOYER_PRIVATE_KEY`
- Top up via Cosmos faucet if needed: `docs/TESTNET-FAUCET.md` (`POST http://node.peopleblockchain.network/faucet/fund`)

## Deploy contracts

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=0x…   # secret manager only
export RPC_URL=https://node.peopleblockchain.network/rpc
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --private-key "$DEPLOYER_PRIVATE_KEY"
bash scripts/write-deployments-json.sh
cp deployments/97401.json ../website/src/data/evm-deployments-97401.json
```

Or run GitHub Actions workflow **Testnet EVM contract deploy** on branch `main` (after merge) with `workflow_dispatch`.

## Archive export (no state migration)

The Kirill chain is intentionally **empty**. Do **not** replay OVN balances or pools on-chain.

```bash
cd contracts
node scripts/export-ovn-testnet.mjs   # → deployments/ovn-export.json (archive only)
```

## Website defaults

```env
NEXT_PUBLIC_CHAIN=cosmos-evm
EVM_RPC_URL=https://node.peopleblockchain.network/rpc
```

Rollback for local dev only: `NEXT_PUBLIC_CHAIN=ovn-node` against a running people-node stack.

## Verification

After deploy, confirm non-zero `eth_getCode` for `registry`, `tokenFactory`, and `router` addresses in `contracts/deployments/97401.json`. Swap/factory UI stays in empty state until contracts are wired and users create tokens.
