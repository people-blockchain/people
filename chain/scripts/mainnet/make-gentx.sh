#!/usr/bin/env bash
# Step 3, on EACH validator server. Signs this validator's genesis transaction against the
# coordinator's pre-genesis. Prints the gentx path (public; send it to the coordinator).
#
#   PREGENESIS=/path/pre-genesis.json PREGENESIS_SHA256=<from coordinator> \
#     MONIKER=people-val-1 [NODE_HOME=/var/lib/peopled] bash make-gentx.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

PREGENESIS="${PREGENESIS:?path to pre-genesis.json}"
WANT_SHA="${PREGENESIS_SHA256:?sha256 published by the coordinator}"
MONIKER="${MONIKER:?moniker used in validator-init.sh}"
NODE_HOME="${NODE_HOME:-/var/lib/peopled}"
KEYRING_BACKEND="${KEYRING_BACKEND:-file}"

[[ "$(sha256_of "$PREGENESIS")" == "$WANT_SHA" ]] || { echo "pre-genesis sha256 mismatch: refuse to sign" >&2; exit 1; }
[[ "$(jq -r .chain_id "$PREGENESIS")" == "$CHAIN_ID" ]] || { echo "pre-genesis is not $CHAIN_ID" >&2; exit 1; }

BOND="$(alloc 'd["validator_self_delegation_appl"]')"
cp "$PREGENESIS" "$NODE_HOME/config/genesis.json"
rm -rf "$NODE_HOME/config/gentx"
OUTDOC="$NODE_HOME/config/gentx-$MONIKER.json"
"$PEOPLED" genesis gentx operator "${BOND}${DENOM}" \
  --chain-id "$CHAIN_ID" \
  --moniker "$MONIKER" \
  --commission-rate 0.10 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01 \
  --keyring-backend "$KEYRING_BACKEND" \
  --home "$NODE_HOME" \
  --output-document "$OUTDOC" >/dev/null
echo "gentx: $OUTDOC"
echo "Send it to the coordinator. It holds no secret (public key + signature only)."
