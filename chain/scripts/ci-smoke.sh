#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if command -v pkill >/dev/null; then
  pkill -9 -f 'build/peopled start' 2>/dev/null || true
  sleep 2
fi

bash scripts/build-peopled.sh
rm -rf "$ROOT/.testnets"
TESTNET_SEED_WELL_KNOWN_ACCOUNTS=1 SINGLE_HOST=1 VALIDATORS=3 bash scripts/init-testnet.sh

PIDS=()
for n in 0 1 2; do
  "$ROOT/build/peopled" start \
    --home "$ROOT/.testnets/node$n/peopled" \
    --chain-id people_97401-1 \
    --minimum-gas-prices 0.0001appl \
    --json-rpc.api eth,txpool,net,web3 \
    >"$ROOT/.testnets/node$n.log" 2>&1 &
  PIDS+=($!)
done

cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

height=0
for _ in $(seq 1 90); do
  height=$(curl -sf http://127.0.0.1:26657/status 2>/dev/null | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo 0)
  if [[ "$height" != "0" && -n "$height" && "$height" != "null" ]]; then break; fi
  sleep 2
done
[[ "$height" != "0" ]] || { echo "no blocks produced"; exit 1; }

bash scripts/health-check.sh

chain_id=$(curl -sf -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')
[[ "$chain_id" == "0x17c79" ]] || { echo "bad chain id $chain_id"; exit 1; }

for _ in $(seq 1 60); do
  if curl -sf -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -e '.result != "0x0" and .result != null' >/dev/null; then
    break
  fi
  sleep 2
done

cd scripts
npm install --omit=dev --no-fund --no-audit
ok=0
# OPS-M4/CHAIN-M7: no silent default sender — this is the well-known cosmos/evm dev0 key,
# only ever funded above via TESTNET_SEED_WELL_KNOWN_ACCOUNTS=1 on this local throwaway testnet.
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0x88cbead91aee890d27bf06e003ade3d4e952427e88f88d31d61d3ef5e5d54305}"
for _ in $(seq 1 15); do
  if node send-test-transfer.mjs; then
    ok=1
    break
  fi
  sleep 3
done
[[ "$ok" == "1" ]] || { echo "EVM transfer test failed"; exit 1; }

if [[ "${SKIP_CONTRACTS_SMOKE:-0}" != "1" ]]; then
  bash "$ROOT/scripts/contracts-smoke.sh"
fi

echo "chain ci-smoke passed"
