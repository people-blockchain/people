#!/usr/bin/env bash
# Deterministic People's testnet genesis (1B PPL emission). Requires built peopled + jq.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CHAIN_ID="${CHAIN_ID:-people_97401-1}"

"$ROOT/scripts/init-testnet.sh"

echo ""
echo "Emission genesis applied from chain/emission/allocation.json"
python3 "$ROOT/scripts/validate-emission-genesis.py" "$ROOT/.testnets/node0/peopled/config/genesis.json"
