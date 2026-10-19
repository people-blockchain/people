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

if [[ -n "${PEOPLE_JSONRPC_BIND:-}" ]]; then
  APP_TOML="$HOME_DIR/config/app.toml"
  CFG_TOML="$HOME_DIR/config/config.toml"
  if [[ -f "$APP_TOML" ]]; then
    sed -i -E 's|address = "[^"]*:8545"|address = "'"${PEOPLE_JSONRPC_BIND}"':8545"|g' "$APP_TOML"
    sed -i -E 's|address = "[^"]*:8546"|address = "'"${PEOPLE_JSONRPC_BIND}"':8546"|g' "$APP_TOML"
  fi
  if [[ -f "$CFG_TOML" ]]; then
    if [[ "$PEOPLE_JSONRPC_BIND" == "127.0.0.1" || "$PEOPLE_JSONRPC_BIND" == "localhost" ]]; then
      sed -i 's/prometheus = false/prometheus = true/g' "$CFG_TOML"
      sed -i -E 's|prometheus_listen_addr = "[^"]*"|prometheus_listen_addr = "127.0.0.1:26660"|g' "$CFG_TOML"
    else
      sed -i 's/prometheus = true/prometheus = false/g' "$CFG_TOML"
    fi
  fi
fi

exec peopled "$@" \
  --home "$HOME_DIR" \
  --chain-id "$CHAIN_ID" \
  --minimum-gas-prices "${MIN_GAS_PRICES:-0.0001appl}" \
  --json-rpc.api "$JSON_RPC_API"
