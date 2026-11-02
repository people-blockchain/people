#!/usr/bin/env bash
# Step 2, coordinator (any machine; needs no keys). Builds the pre-genesis every validator
# signs its gentx against: the 1B PPL allocation from allocation-mainnet.json, mainnet
# governance/staking/slashing params, and each genesis validator operator funded with
# validator_reserve_appl.
#
#   OPERATORS="people1...,people1...,people1..." GENESIS_TIME=2026-12-01T12:00:00Z \
#     [OUT=chain/mainnet/pre-genesis.json] bash build-pregenesis.sh
#
# Refuses while allocation-mainnet.json still has placeholders (apply-emission-genesis.py).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

OPERATORS="${OPERATORS:?comma-separated operator addresses (people1...) from validator-init.sh}"
GENESIS_TIME="${GENESIS_TIME:?RFC3339 UTC launch time, e.g. 2026-12-01T12:00:00Z}"
OUT="${OUT:-$CHAIN_ROOT/mainnet/pre-genesis.json}"
[[ "$GENESIS_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || { echo "GENESIS_TIME must look like 2026-12-01T12:00:00Z" >&2; exit 1; }

IFS=',' read -r -a OPS <<<"$OPERATORS"
(( ${#OPS[@]} >= 3 )) || { echo "need at least 3 validator operators" >&2; exit 1; }
if [[ "$(printf '%s\n' "${OPS[@]}" | sort -u | wc -l)" != "${#OPS[@]}" ]]; then
  echo "duplicate operator address" >&2; exit 1
fi

RESERVE="$(alloc 'd["validator_reserve_appl"]')"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
init_home "$WORK" coordinator
G="$WORK/config/genesis.json"

for op in "${OPS[@]}"; do
  [[ "$op" =~ ^people1[02-9ac-hj-np-z]{38}$ ]] || { echo "bad operator address: $op" >&2; exit 1; }
  "$PEOPLED" genesis add-genesis-account "$op" "${RESERVE}${DENOM}" --home "$WORK" >/dev/null
done

python3 "$MAINNET_DIR/mainnet-params.py" "$G" "$GENESIS_TIME"
python3 "$CHAIN_ROOT/scripts/apply-emission-genesis.py" "$G"
"$PEOPLED" genesis validate "$G" --home "$WORK" >/dev/null

mkdir -p "$(dirname "$OUT")"
cp "$G" "$OUT"
echo "pre-genesis: $OUT"
echo "sha256:      $(sha256_of "$OUT")"
echo "Send this file and its sha256 to every validator for make-gentx.sh."
