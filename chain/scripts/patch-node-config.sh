#!/usr/bin/env bash
# Enable JSON-RPC / REST / gRPC for validator nodes (Docker and bare-metal).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.testnets}"

# Default: loopback-only JSON-RPC. Set PEOPLE_JSONRPC_BIND=0.0.0.0 for Docker (with host
# ports still bound to 127.0.0.1 in docker-compose.yml) or other container setups.
JSONRPC_BIND="${PEOPLE_JSONRPC_BIND:-127.0.0.1}"

shopt -s nullglob
for app_toml in "$OUT"/node*/peopled/config/app.toml; do
  sed -i 's/enable = false/enable = true/g' "$app_toml"
  sed -i -E 's|address = "[^"]*:8545"|address = "'"${JSONRPC_BIND}"':8545"|g' "$app_toml"
  sed -i -E 's|address = "[^"]*:8546"|address = "'"${JSONRPC_BIND}"':8546"|g' "$app_toml"
  sed -i 's/minimum-gas-prices = ""/minimum-gas-prices = "0.0001appl"/g' "$app_toml" || true
done

for cfg in "$OUT"/node*/peopled/config/config.toml; do
  sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/g' "$cfg"
  if [[ "$JSONRPC_BIND" == "127.0.0.1" || "$JSONRPC_BIND" == "localhost" ]]; then
    sed -i 's/prometheus = false/prometheus = true/g' "$cfg"
    sed -i -E 's|prometheus_listen_addr = "[^"]*"|prometheus_listen_addr = "127.0.0.1:26660"|g' "$cfg"
  else
    sed -i 's/prometheus = true/prometheus = false/g' "$cfg"
  fi
done

for client in "$OUT"/node*/peopled/config/client.toml; do
  sed -i 's/^chain-id = ""/chain-id = "people_97401-1"/' "$client"
done

echo "Patched node config under $OUT (JSON-RPC bind: ${JSONRPC_BIND})"
