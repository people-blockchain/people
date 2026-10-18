# EVM JSON-RPC — operator note, internal testnet)

**Status:** stage 0–1 (read-only RPC + address policy 0a). Not Mainnet.

## What changed

- Nodes expose Ethereum JSON-RPC on the **same HTTP port** as the REST API: `POST /rpc` and `POST /` (with `Content-Type: application/json`).
- Numeric chain id for wallets: **`97401`** (`eth_chainId`).
- String `CHAIN_ID` (e.g. `people-public-testnet-v2-2026-09-30`) is **unchanged**.
- New wallets derive **Ethereum-style** addresses; legacy sha256 addresses still resolve in REST with `legacy: true`.

## Upgrade steps (keep `DATA_DIR`)

1. Merge approved PR to `main`; on the server, `git pull` to that SHA.
2. `cd people-node && npm ci && npm run build`
3. **Do not** change `DATA_DIR` or run `docker compose down -v`.
4. Keep existing env: same `CHAIN_ID`, `GENESIS_FAUCET_ADDRESS`, validator keys, `DEV_FAUCET_PRIVATE_KEY` on faucet node only.
5. Rebuild/restart the node container or process (e.g. `docker compose up --build -d` **without** `-v`).
6. Smoke checks:
   - `curl -s http://localhost:4001/health`
   - `curl -s -X POST http://localhost:4001/rpc -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'` → `0x17c79` (97401)
7. **Address migration height:** default `EVM_ADDRESS_ACTIVATION_HEIGHT = 2_147_483_647` (disabled). A follow-up release will lower this constant before the coordinated block height; all validators must run the **same** binary before that height.

## Rollback

Checkout previous approved SHA, rebuild, restart with the **same** `DATA_DIR` and secrets.
