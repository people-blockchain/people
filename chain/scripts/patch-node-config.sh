#!/usr/bin/env bash
# Enable JSON-RPC / REST / gRPC for validator nodes (Docker and bare-metal).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.testnets}"

shopt -s nullglob
for app_toml in "$OUT"/node*/peopled/config/app.toml; do
  sed -i 's/enable = false/enable = true/g' "$app_toml"
  sed -i 's/address = "127.0.0.1:8545"/address = "0.0.0.0:8545"/g' "$app_toml"
  sed -i 's/address = "127.0.0.1:8546"/address = "0.0.0.0:8546"/g' "$app_toml"
  sed -i 's/minimum-gas-prices = ""/minimum-gas-prices = "0.0001appl"/g' "$app_toml" || true
done

for cfg in "$OUT"/node*/peopled/config/config.toml; do
  # Measured on a live node (people_97401-1): block ~4.3 s, empty blocks off.
  sed -i -E 's/^timeout_commit = ".*"/timeout_commit = "4s"/' "$cfg"
  sed -i -E 's/^timeout_propose = ".*"/timeout_propose = "3s"/' "$cfg"
  sed -i -E 's/^create_empty_blocks = .*/create_empty_blocks = false/' "$cfg"
  sed -i 's/prometheus = false/prometheus = true/g' "$cfg"
done

for client in "$OUT"/node*/peopled/config/client.toml; do
  sed -i 's/^chain-id = ""/chain-id = "people_97401-1"/' "$client"
done

echo "Patched node config under $OUT"
