#!/usr/bin/env bash
# Step 4, coordinator. Collects every validator's gentx into the final genesis, validates it with
# the node and with the mainnet rules, and prints the sha256 every validator must check.
#
#   PREGENESIS=chain/mainnet/pre-genesis.json GENTX_DIR=dir/with/gentx-*.json \
#     [OUT=chain/mainnet/genesis.json] bash finalize-genesis.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

PREGENESIS="${PREGENESIS:?path to pre-genesis.json}"
GENTX_DIR="${GENTX_DIR:?directory holding every validator gentx-*.json}"
OUT="${OUT:-$CHAIN_ROOT/mainnet/genesis.json}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
init_home "$WORK" coordinator
cp "$PREGENESIS" "$WORK/config/genesis.json"
mkdir -p "$WORK/config/gentx"
shopt -s nullglob
files=("$GENTX_DIR"/gentx-*.json)
(( ${#files[@]} >= 3 )) || { echo "need at least 3 gentx files in $GENTX_DIR" >&2; exit 1; }
cp "${files[@]}" "$WORK/config/gentx/"

"$PEOPLED" genesis collect-gentxs --home "$WORK" >/dev/null 2>&1
"$PEOPLED" genesis validate "$WORK/config/genesis.json" --home "$WORK"
python3 "$CHAIN_ROOT/scripts/validate-emission-genesis.py" "$WORK/config/genesis.json"

mkdir -p "$(dirname "$OUT")"
cp "$WORK/config/genesis.json" "$OUT"
echo "genesis: $OUT"
echo "sha256:  $(sha256_of "$OUT")"
