#!/usr/bin/env bash
set -euo pipefail

ID="${NODE_ID:-0}"
HOME_DIR="/data/node${ID}/peopled"
CHAIN_ID="${CHAIN_ID:-people_97401-1}"

if [[ ! -d "$HOME_DIR/config" ]]; then
  echo "Missing config at $HOME_DIR — run init-testnet.sh on the host and mount .testnets to /data"
  exit 1
fi

# M11-3: `personal` (account unlock/keyring operations) and `debug` (arbitrary tracing) are not
# part of the public API surface and are only ever needed while debugging on a local machine.
# They are opt-in via JSON_RPC_API, never on by default.
JSON_RPC_API="${JSON_RPC_API:-eth,txpool,net,web3}"

exec peopled "$@" \
  --home "$HOME_DIR" \
  --chain-id "$CHAIN_ID" \
  --minimum-gas-prices "${MIN_GAS_PRICES:-0.0001appl}" \
  --json-rpc.api "$JSON_RPC_API"
