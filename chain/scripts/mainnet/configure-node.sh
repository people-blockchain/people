#!/usr/bin/env bash
# Writes mainnet config.toml / app.toml / client.toml settings for one node home.
#   configure-node.sh validator|rpc NODE_HOME
# validator: P2P only, JSON-RPC and REST off, nothing listens publicly except 26656.
# rpc:       public read node behind a reverse proxy (TLS terminates at the proxy); EVM JSON-RPC
#            on 127.0.0.1:8545 with only eth,net,web3 (never personal/debug/admin/txpool).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

ROLE="${1:?validator|rpc}"
NODE_HOME="${2:?node home}"
CFG="$NODE_HOME/config"
APP="$CFG/app.toml"
CMT="$CFG/config.toml"
CLIENT="$CFG/client.toml"

set_toml() { # file section key value
  python3 - "$@" <<'PY'
import re, sys
path, section, key, value = sys.argv[1:5]
text = open(path).read()
lines = text.split("\n")
cur = ""
done = False
for i, line in enumerate(lines):
    m = re.match(r"^\[([^\]]+)\]\s*$", line)
    if m:
        cur = m.group(1)
        continue
    if cur == section and re.match(rf"^{re.escape(key)}\s*=", line):
        lines[i] = f"{key} = {value}"
        done = True
        break
if not done:
    sys.exit(f"{path}: [{section}] {key} not found")
open(path, "w").write("\n".join(lines))
PY
}

# EVM chain id: the binary also refuses to start on mainnet when this disagrees.
set_toml "$APP" evm evm-chain-id "$EVM_CHAIN_ID"
set_toml "$APP" "" minimum-gas-prices "\"0.0001$DENOM\""
set_toml "$APP" "" pruning '"default"'
set_toml "$CLIENT" "" chain-id "\"$CHAIN_ID\""
set_toml "$CLIENT" "" keyring-backend '"file"'

# Consensus timing for validators on separate hosts (testnet uses 1s on one VPS).
set_toml "$CMT" consensus timeout_commit '"2s"'
set_toml "$CMT" p2p pex "true"
set_toml "$CMT" p2p addr_book_strict "true"
set_toml "$CMT" rpc laddr '"tcp://127.0.0.1:26657"'
set_toml "$CMT" instrumentation prometheus "true"
set_toml "$CMT" instrumentation prometheus_listen_addr '"127.0.0.1:26660"'

case "$ROLE" in
  validator)
    set_toml "$APP" json-rpc enable "false"
    set_toml "$APP" api enable "false"
    set_toml "$APP" grpc address '"127.0.0.1:9090"'
    set_toml "$CMT" p2p max_num_inbound_peers "20"
    ;;
  rpc)
    set_toml "$APP" json-rpc enable "true"
    set_toml "$APP" json-rpc address '"127.0.0.1:8545"'
    set_toml "$APP" json-rpc ws-address '"127.0.0.1:8546"'
    set_toml "$APP" json-rpc api '"eth,net,web3"'
    set_toml "$APP" api enable "true"
    set_toml "$APP" api address '"tcp://127.0.0.1:1317"'
    set_toml "$APP" grpc address '"127.0.0.1:9090"'
    set_toml "$APP" "" pruning '"nothing"'
    ;;
  *) echo "role must be validator or rpc" >&2; exit 1 ;;
esac
echo "configured $NODE_HOME as $ROLE for $CHAIN_ID (EVM $EVM_CHAIN_ID)"
