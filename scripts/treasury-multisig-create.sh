#!/usr/bin/env bash
# Create a native Cosmos SDK multisig account from 3 independently-generated
# public keys (no private key ever touches this machine or this script).
# Testnet or mainnet, read-only against the chain: builds a local keyring
# entry only, does not send any transaction.
#
# Each signer (three independent key holders, one cold) runs on their OWN machine,
# independently:
#   peopled keys add <name>
#   peopled keys show <name> -p
# and shares only the printed pubkey JSON (never the mnemonic/private key).
#
# Usage:
#   PEOPLED=/opt/people-chain-cosmos/bin/peopled \
#   scripts/treasury-multisig-create.sh <multisig-name> <threshold> \
#     <signer1-name>:<signer1-pubkey-json> \
#     <signer2-name>:<signer2-pubkey-json> \
#     <signer3-name>:<signer3-pubkey-json>
#
# Example (2-of-3 test multisig):
#   scripts/treasury-multisig-create.sh treasury-test 2 \
#     'signer1:{"@type":"/cosmos.evm.crypto.v1.ethsecp256k1.PubKey","key":"..."}' \
#     'signer2:{"@type":"/cosmos.evm.crypto.v1.ethsecp256k1.PubKey","key":"..."}' \
#     'signer3:{"@type":"/cosmos.evm.crypto.v1.ethsecp256k1.PubKey","key":"..."}'
#
# Env: PEOPLED (default: peopled on PATH), HOME_DIR (keyring dir, default
# ./multisig-keyring), KEYRING_BACKEND (default: test — unencrypted, fine for
# a throwaway local keyring that holds only public keys; use "file" or "os"
# for a long-lived real signer set).
set -euo pipefail

PEOPLED="${PEOPLED:-peopled}"
HOME_DIR="${HOME_DIR:-$(pwd)/multisig-keyring}"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"

if [ "$#" -lt 5 ]; then
  echo "usage: $0 <multisig-name> <threshold> <name1>:<pubkey-json> <name2>:<pubkey-json> <name3>:<pubkey-json>" >&2
  exit 1
fi

MS_NAME="$1"
THRESHOLD="$2"
shift 2

command -v "$PEOPLED" >/dev/null || { echo "peopled not found (set PEOPLED=/path/to/peopled)" >&2; exit 1; }
mkdir -p "$HOME_DIR"

NAMES=()
for entry in "$@"; do
  name="${entry%%:*}"
  pubkey="${entry#*:}"
  NAMES+=("$name")
  "$PEOPLED" keys add "$name" \
    --pubkey "$pubkey" \
    --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR"
done

JOINED=$(IFS=,; echo "${NAMES[*]}")
"$PEOPLED" keys add "$MS_NAME" \
  --multisig "$JOINED" --multisig-threshold "$THRESHOLD" \
  --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR"

echo "== multisig account =="
"$PEOPLED" keys show "$MS_NAME" -a --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR"
"$PEOPLED" debug addr "$("$PEOPLED" keys show "$MS_NAME" -a --keyring-backend "$KEYRING_BACKEND" --home "$HOME_DIR")" \
  --home "$HOME_DIR" | grep -i hex
