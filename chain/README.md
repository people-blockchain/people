# People's Chain (Cosmos EVM) — Stage 1

Cosmos EVM–based execution layer for People's Blockchain. The legacy TypeScript node in `people-node/` is **unchanged**; this folder is the new validator stack.

| Parameter | Value |
| --- | --- |
| Cosmos `chain-id` | `people_97401-1` |
| EVM `chainId` | `97401` (`0x17c79`) |
| Native denom (base) | `appl` (18 decimals; display **PPL**, alias **aPPL**) |
| Bech32 prefix | `people` (`people1…` accounts) |
| Upstream | [cosmos/evm](https://github.com/cosmos/evm) — tag in `COSMOS_EVM_VERSION` (`v0.4.0`) **and** the commit it must resolve to in `COSMOS_EVM_COMMIT`; the build compares `git rev-parse HEAD` against the pin and refuses to build on a mismatch |
| Node binary | `peopled` (example `evmd` with People's config) |

## Quick start (local, 3 validators, one host)

```bash
cd chain
./scripts/build-peopled.sh
SINGLE_HOST=1 ./scripts/init-testnet.sh
# start three processes (or use docker compose after docker build)
for n in 0 1 2; do
  ./build/peopled start --home ".testnets/node$n/peopled" \
    --chain-id people_97401-1 --minimum-gas-prices 0.0001appl \
    --json-rpc.api eth,txpool,net,web3 &
done
./scripts/health-check.sh
```

## Docker Compose (3 validators)

```bash
cd chain
./scripts/build-peopled.sh
STARTING_IP=192.168.20.2 SINGLE_HOST=0 ./scripts/init-testnet.sh
docker compose build
docker compose up -d
./scripts/health-check.sh
```

## Ports (node0 / host defaults)

| Service | Port |
| --- | --- |
| CometBFT RPC | 26657 |
| CometBFT P2P | 26656 |
| Cosmos REST | 1317 |
| gRPC | 9090 |
| EVM JSON-RPC | 8545 |
| EVM WebSocket | 8546 |

See `docker-compose.yml` for node1/node2 host port offsets.

Production validator exposure, sentry layout, and public RPC hardening: [`docs/NODE-SECURITY.md`](../docs/NODE-SECURITY.md).

## Exposure and key handling (M11-3)

- The JSON-RPC API set defaults to `eth,txpool,net,web3` (Docker entrypoint `JSON_RPC_API`).
  `personal` (account unlock/keyring operations) and `debug` (arbitrary tracing) are **not**
  exposed by default — set `JSON_RPC_API` explicitly for local debugging only, and never on a
  host that is reachable from outside.
- Docker Compose mounts each validator's own directory (`./.testnets/nodeN:/data/nodeN`), so a
  container compromise cannot read the other validators' keyrings. The three services are still
  a single-host local testnet; real validators run on separate hosts.
- `init-testnet.sh` takes `KEYRING_BACKEND` (`test` by default for throwaway local nets). Any
  host holding real value must use `file` or `os` — the `test` backend leaves keys unencrypted
  under the node home.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/build-peopled.sh` | Clone pinned cosmos/evm, apply overrides, build `build/peopled` |
| `scripts/init-testnet.sh` | Generate `.testnets/` for 3 validators |
| `scripts/generate-emission-genesis.sh` | Init testnet + apply approved 1B PPL emission genesis |
| `scripts/validate-emission-genesis.py` | Assert supply, mint 0, vesting, Model A params |
| `scripts/health-check.sh` | CometBFT + `eth_chainId` + REST smoke |
| `scripts/send-test-transfer.mjs` | Signed EVM transfer via `eth_sendRawTransaction` |
| `scripts/ci-smoke.sh` | CI/local end-to-end smoke |


Migration overview: `docs/COSMOS-EVM-MIGRATION.md`.

Testnet hard reset (approved emission genesis): `RESET_TESTNET.md`.
