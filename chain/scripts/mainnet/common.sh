#!/usr/bin/env bash
# Shared settings for the PEOPLE mainnet genesis ceremony. Sourced by the other scripts.
# Everything here is public. No script in this folder reads, prints or stores a private key
# or mnemonic outside the operator's own encrypted (file) keyring.
set -euo pipefail

MAINNET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAIN_ROOT="$(cd "$MAINNET_DIR/../.." && pwd)"

export CHAIN_ID="people_97400-1"
export EVM_CHAIN_ID="97400"
export DENOM="appl"
PEOPLED="${PEOPLED:-$CHAIN_ROOT/build/peopled}"
export PEOPLE_ALLOCATION="${PEOPLE_ALLOCATION:-$CHAIN_ROOT/emission/allocation-mainnet.json}"

alloc() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(eval(sys.argv[2],{},{'d':d}))" "$PEOPLE_ALLOCATION" "$1"; }

need() { command -v "$1" >/dev/null || { echo "missing required tool: $1" >&2; exit 1; }; }
need jq
need python3
[[ -x "$PEOPLED" ]] || { echo "peopled not found at $PEOPLED (build it with chain/scripts/build-peopled.sh or set PEOPLED)" >&2; exit 1; }

# Upstream evmd sets up its EVM coin globals from the client.toml chain-id of the --home in use.
# With an empty chain-id, offline commands (`genesis validate`, `collect-gentxs`, `gentx`) crash
# in x/precisebank, so every home this ceremony touches gets the mainnet chain-id first.
init_home() { # init_home HOME MONIKER
  "$PEOPLED" init "$2" --chain-id "$CHAIN_ID" --default-denom "$DENOM" --home "$1" >/dev/null 2>&1
  sed -i "s/^chain-id = .*/chain-id = \"$CHAIN_ID\"/" "$1/config/client.toml"
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }
