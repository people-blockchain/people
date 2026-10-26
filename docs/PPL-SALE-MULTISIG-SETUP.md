# PPL community sale — owner setup (Tron, TON, Solana + EVM)

**Status:** operational instructions for founders. Does not authorize mainnet deploy without explicit approval.

## Multisig wallets to create

Use the same **2-of-3 threshold** as the treasury multisig (three separately held keys, addressed published when created). Create **receive-only** multisig addresses on:

| Network | Asset | Tool | Threshold |
| --- | --- | --- | --- |
| **Tron** | USDT (TRC-20) | Tron account **multi-sig permissions** (owner/active permission with 3 keys) | 2-of-3 |
| **TON** | USDT jetton | **TON multisig wallet** (e.g. Tonkeeper / TON multisig) | 2-of-3 |
| **Solana** | USDT + USDC (SPL) | **Squads** | 2-of-3 |
| **EVM** (BNB Chain, Base, Ethereum, Polygon) | USDT/USDC | **Safe** | 2-of-3 |

EVM chains (**BNB Chain, Base, Ethereum, Polygon**) use the `PeopleCommunitySale` contract; stablecoins flow to the **EVM Safe treasury** configured at deploy time (`SALE_TREASURY`), not the transfer receivers below.

> The Base bonding-curve sale (`PplCurveHub`) has its own runbook: [PPL-CURVE-HUB.md](PPL-CURVE-HUB.md) (deploy guards, treasury migration, peg monitoring, rollout).

## Environment variables (Vercel / server)

```bash
# Transfer-network receivers (public addresses; empty = network shown with pending badge)
SALE_RECEIVER_TRON=
SALE_RECEIVER_TON=
SALE_RECEIVER_SOLANA=

# Optional per-chain EVM sale contract (overrides website/src/data/ppl-sale-evm.json)
SALE_CONTRACT_BSC=
SALE_CONTRACT_BASE=
SALE_CONTRACT_ETHEREUM=
SALE_CONTRACT_POLYGON=

# Cron: POST /api/sale/watch (TronGrid, TON Center, Solana public RPC)
SALE_CRON_SECRET=

# PEOPLE chain delivery (testnet / pre-genesis crediting). Never commit the key.
SALE_DELIVERY_PRIVATE_KEY=

# Optional dedicated RPC for payment verification
SALE_RPC_BSC=
SALE_RPC_BASE=
SALE_RPC_ETHEREUM=
SALE_RPC_POLYGON=
SALE_SOLANA_RPC_URL=
```

Copy the same names into `website/.env.local` for local checkout testing.

## EVM deploy workflow (owner only)

1. Set `SALE_STABLECOIN` (USDT or USDC on target chain) and `SALE_TREASURY` (EVM Safe).
2. Run `contracts/scripts/deploy-ppl-sale-mainnet.sh` with `CHAIN_ID`, `RPC_URL`, and `DEPLOYER_PRIVATE_KEY`.
3. Record the address in `contracts/deployments/ppl-sale-mainnet.json` and `website/src/data/ppl-sale-evm.json` (or `SALE_CONTRACT_*` env).
4. **Do not deploy Polygon (or any mainnet) until explicitly approved.**

## Payment matching

- **EVM:** `Purchased` event on the sale contract; confirmations per chain in `ppl-sale-evm.json`.
- **Tron / TON / Solana:** unique stable amount (+ memo on TON/Solana when supported) and buyer PEOPLE `0x` address; watcher job `POST /api/sale/watch` with `Authorization: Bearer $SALE_CRON_SECRET`.

Delivery uses `SALE_DELIVERY_PRIVATE_KEY` to submit a PEOPLE `transfer` when configured; otherwise orders stay `paid` until manual settlement.
