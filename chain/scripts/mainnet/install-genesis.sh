#!/usr/bin/env bash
# Step 5, on EACH node (validators and RPC nodes). Installs the final genesis after checking the
# coordinator's sha256, sets the peers and installs a systemd unit. CometBFT itself waits until
# genesis_time before producing block 1, so nodes can be started early.
#
#   GENESIS=/path/genesis.json GENESIS_SHA256=<published> PEERS="id@ip:26656,..." \
#     [NODE_HOME=/var/lib/peopled] [ROLE=validator|rpc] sudo -E bash install-genesis.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

GENESIS="${GENESIS:?path to final genesis.json}"
WANT_SHA="${GENESIS_SHA256:?sha256 published by the coordinator}"
PEERS="${PEERS:?comma-separated node_id@ip:26656 of the other genesis validators}"
NODE_HOME="${NODE_HOME:-/var/lib/peopled}"
ROLE="${ROLE:-validator}"
RUN_USER="${RUN_USER:-peopled}"

[[ "$(sha256_of "$GENESIS")" == "$WANT_SHA" ]] || { echo "genesis sha256 mismatch: refuse to install" >&2; exit 1; }
[[ "$(jq -r .chain_id "$GENESIS")" == "$CHAIN_ID" ]] || { echo "genesis is not $CHAIN_ID" >&2; exit 1; }

if [[ "$ROLE" == "rpc" && ! -f "$NODE_HOME/config/config.toml" ]]; then
  init_home "$NODE_HOME" "people-rpc-$(hostname -s)"
fi
bash "$MAINNET_DIR/configure-node.sh" "$ROLE" "$NODE_HOME"
cp "$GENESIS" "$NODE_HOME/config/genesis.json"
sed -i "s/^persistent_peers = .*/persistent_peers = \"$PEERS\"/" "$NODE_HOME/config/config.toml"
rm -f "$NODE_HOME/config/gentx-"*.json

if command -v systemctl >/dev/null && [[ "$(id -u)" == 0 ]]; then
  id -u "$RUN_USER" >/dev/null 2>&1 || useradd --system --home "$NODE_HOME" --shell /usr/sbin/nologin "$RUN_USER"
  install -m 0755 "$PEOPLED" /usr/local/bin/peopled
  chown -R "$RUN_USER:$RUN_USER" "$NODE_HOME"
  cat > /etc/systemd/system/peopled.service <<UNIT
[Unit]
Description=PEOPLE mainnet node ($CHAIN_ID, $ROLE)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
ExecStart=/usr/local/bin/peopled start --home $NODE_HOME --chain-id $CHAIN_ID
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$NODE_HOME
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable peopled
  echo "installed. Start with: systemctl start peopled   (block 1 waits for genesis_time $(jq -r .genesis_time "$GENESIS"))"
else
  echo "genesis installed in $NODE_HOME (no systemd/root: start peopled yourself)"
fi
