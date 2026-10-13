#!/usr/bin/env bash
# Run Stage 2 contract deploy + smoke against the local peopled EVM RPC (chain 97401).
set -euo pipefail
CHAIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_ROOT="$(cd "$CHAIN_ROOT/../contracts" && pwd)"

export RPC_URL="${PEOPLE_EVM_RPC:-http://127.0.0.1:8545}"
# OPS-M4: no silent default. Against a local devnet, pass the well-known cosmos/evm dev0 key
# explicitly: DEPLOYER_PRIVATE_KEY=0x88cbead91aee890d27bf06e003ade3d4e952427e88f88d31d61d3ef5e5d54305
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"

chain_id=$(curl -sf -X POST "$RPC_URL" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')
[[ "$chain_id" == "0x17c79" ]] || { echo "bad EVM chain id: $chain_id"; exit 1; }

bash "$CONTRACTS_ROOT/scripts/check-eip170.sh"
bash "$CONTRACTS_ROOT/scripts/smoke-local.sh"
