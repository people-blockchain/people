#!/usr/bin/env bash
# Step 1, on EACH validator server (never on a shared machine).
# Creates the node home, the consensus key (priv_validator_key.json) and the operator account
# key in the encrypted `file` keyring. Prints only public data to send to the coordinator.
#
#   MONIKER=people-val-1 [NODE_HOME=/var/lib/peopled] bash validator-init.sh
#
# The operator key mnemonic is printed ONCE by `keys add`: write it on paper, keep it offline.
# Do not paste it into chats, tickets or repositories. Back up priv_validator_key.json offline too.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MONIKER="${MONIKER:?set MONIKER, e.g. people-val-1}"
NODE_HOME="${NODE_HOME:-/var/lib/peopled}"
KEYRING_BACKEND="${KEYRING_BACKEND:-file}"
[[ "$KEYRING_BACKEND" == "file" || "$KEYRING_BACKEND" == "os" || "${ALLOW_TEST_KEYRING:-0}" == "1" ]] \
  || { echo "mainnet keys must use the file or os keyring" >&2; exit 1; }

if [[ -f "$NODE_HOME/config/genesis.json" ]]; then
  echo "$NODE_HOME already initialised; refusing to overwrite keys" >&2
  exit 1
fi

init_home "$NODE_HOME" "$MONIKER"

bash "$MAINNET_DIR/configure-node.sh" validator "$NODE_HOME"

if ! "$PEOPLED" keys show operator --keyring-backend "$KEYRING_BACKEND" --home "$NODE_HOME" >/dev/null 2>&1; then
  "$PEOPLED" keys add operator --keyring-backend "$KEYRING_BACKEND" --home "$NODE_HOME"
fi

OPERATOR="$("$PEOPLED" keys show operator -a --keyring-backend "$KEYRING_BACKEND" --home "$NODE_HOME")"
NODE_ID="$("$PEOPLED" comet show-node-id --home "$NODE_HOME")"
chmod 600 "$NODE_HOME/config/priv_validator_key.json" "$NODE_HOME/config/node_key.json"

cat <<OUT

== Send these PUBLIC values to the genesis coordinator ==
moniker:  $MONIKER
operator: $OPERATOR
node_id:  $NODE_ID
p2p:      <this server's public IP>:26656
OUT
