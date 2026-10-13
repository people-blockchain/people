#!/usr/bin/env bash
# Generate a 3-validator People's testnet under chain/.testnets
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PEOPLED="$ROOT/build/peopled"
OUT="$ROOT/.testnets"
CHAIN_ID="${CHAIN_ID:-people_97401-1}"
VALIDATORS="${VALIDATORS:-3}"
SINGLE_HOST="${SINGLE_HOST:-0}"
STARTING_IP="${STARTING_IP:-192.168.10.2}"
# M11-3: `test` keeps unencrypted keys under the node home, which is fine for a throwaway local
# testnet and nowhere else. Any real host must pick `file` or `os` (prompting passphrase).
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
case "$KEYRING_BACKEND" in
  test|file|os) ;;
  *) echo "KEYRING_BACKEND must be test, file or os (got '$KEYRING_BACKEND')"; exit 1 ;;
esac

command -v jq >/dev/null || { echo "jq is required"; exit 1; }

if [[ ! -x "$PEOPLED" ]]; then
  "$ROOT/scripts/build-peopled.sh"
fi

rm -rf "$OUT"
mkdir -p "$OUT"

ARGS=(
  testnet init-files
  --validator-count "$VALIDATORS"
  --chain-id "$CHAIN_ID"
  --output-dir "$OUT"
  --node-daemon-home peopled
  --node-dir-prefix node
  --keyring-backend "$KEYRING_BACKEND"
  --commit-timeout 1s
  --minimum-gas-prices "0.0001appl"
)

if [[ "$SINGLE_HOST" == "1" ]]; then
  ARGS+=(--single-host)
else
  ARGS+=(--starting-ip-address "$STARTING_IP")
fi

"$PEOPLED" "${ARGS[@]}"

"$ROOT/scripts/patch-genesis.sh" "$OUT"
"$ROOT/scripts/patch-node-config.sh" "$OUT"

echo ""
echo "Testnet files ready in $OUT"
echo "  Cosmos chain-id: $CHAIN_ID"
echo "  EVM chain-id:    97401 (0x17c79)"
echo "  Bech32 prefix:   people"
echo "  Native denom:    appl (display PPL / aPPL)"
