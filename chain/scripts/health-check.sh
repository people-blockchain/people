#!/usr/bin/env bash
set -euo pipefail

RPC_EVM="${PEOPLE_EVM_RPC:-http://127.0.0.1:8545}"
RPC_COMET="${PEOPLE_COMET_RPC:-http://127.0.0.1:26657}"
REST="${PEOPLE_REST:-http://127.0.0.1:1317}"

echo "== CometBFT =="
curl -sf "$RPC_COMET/status" | jq -r '"height=" + .result.sync_info.latest_block_height + " chain_id=" + .result.node_info.network'

echo "== EVM eth_chainId =="
chain_hex=$(curl -sf -X POST "$RPC_EVM" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')
echo "$chain_hex"
[[ -n "$chain_hex" && "$chain_hex" != "null" ]] || { echo "EVM RPC unavailable"; exit 1; }

echo "== REST node info =="
curl -sf "$REST/cosmos/base/tendermint/v1beta1/node_info" | jq -r '.default_node_info.network' || echo "REST unavailable"

echo "OK"
