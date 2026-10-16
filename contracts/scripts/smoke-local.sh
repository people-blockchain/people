#!/usr/bin/env bash
# Local smoke for Stage 2 contracts on chain id 97401 (local peopled JSON-RPC or dev node).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$PATH:${HOME}/.foundry/bin"

RPC="${RPC_URL:-http://127.0.0.1:8545}"
# OPS-M4: no silent default. Against a local devnet, pass the well-known cosmos/evm dev0 key
# explicitly (see chain/scripts/send-test-transfer.mjs):
#   DEPLOYER_PRIVATE_KEY=0x88cbead91aee890d27bf06e003ade3d4e952427e88f88d31d61d3ef5e5d54305
PK="${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
export DEPLOYER_PRIVATE_KEY="$PK"
DEPLOYER="$(cast wallet address --private-key "$PK")"

echo "==> chain id"
CHAIN="$(cast chain-id --rpc-url "$RPC")"
echo "chainId=$CHAIN"
[[ "$CHAIN" == "97401" || "$CHAIN" == "0x17c79" ]] || { echo "expected chain 97401, got $CHAIN"; exit 1; }

echo "==> deploy protocol (split txs, EIP-170 safe)"
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --private-key "$PK" -vv 2>&1 | tee /tmp/people-deploy.log

RUN_JSON="$ROOT/broadcast/Deploy.s.sol/97401/run-latest.json"
test -f "$RUN_JSON" || { echo "missing broadcast artifact $RUN_JSON"; exit 1; }

_load_addr() {
  local name="$1"
  local deploy_json="${DEPLOY_JSON:-$ROOT/deployments/97401.json}"
  if [[ -f "$deploy_json" ]]; then
    local from_file
    from_file="$(jq -r --arg k "$name" '.[$k] // empty' "$deploy_json" 2>/dev/null || true)"
    if [[ -n "$from_file" ]]; then
      echo "$from_file"
      return
    fi
  fi
  jq -r --arg n "$name" '.transactions[] | select(.contractName==$n) | .contractAddress' "$RUN_JSON" | tail -1
}

FACTORY="$(_load_addr TokenFactory)"
CURVE="$(_load_addr BondingCurveMarket)"
ROUTER="$(_load_addr PeopleRouter)"
AGENT="$(_load_addr CommunityAgentWallet)"
REGISTRY="$(_load_addr PeopleProtocolRegistry)"
GOV="$(_load_addr GovernanceToken)"
test -n "$FACTORY" && test -n "$CURVE"
echo "registry=$REGISTRY factory=$FACTORY"

FEE_RAW="$(cast call "$FACTORY" 'tokenCreateFee()(uint256)' --rpc-url "$RPC" | awk '{print $1}')"

echo "==> create token"
SIG="$(cast sig-event 'TokenCreated(address,address,string,string,uint8,uint256,(uint256,uint256,uint256,uint256,uint256),uint8)')"
CREATE_OUT="$(cast send "$FACTORY" \
  'createToken(string,string,uint8,uint256,string)' \
  'Smoke Token' "SMK${RANDOM}" 6 1000000000 'ipfs://smoke' \
  --value "$FEE_RAW" --private-key "$PK" --rpc-url "$RPC" --json)"
TOKEN_TOPIC="$(echo "$CREATE_OUT" | jq -r --arg sig "$SIG" '.logs[] | select(.topics[0]==$sig) | .topics[1]' | head -1)"
TOKEN="$(cast parse-bytes32-address "$TOKEN_TOPIC")"
echo "token=$TOKEN"

echo "==> curve buy 1 PPL"
cast send "$CURVE" 'buy(address,uint256)' "$TOKEN" 0 --value 1ether --private-key "$PK" --rpc-url "$RPC" >/dev/null

echo "==> listing before curve migration (expect revert, M07-2)"
TOKEN_AMT=1000000
cast send "$TOKEN" 'approve(address,uint256)' "$ROUTER" "$TOKEN_AMT" --private-key "$PK" --rpc-url "$RPC" >/dev/null
if cast send "$ROUTER" 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)' "$TOKEN" "$TOKEN_AMT" 0 0 "$DEPLOYER" $(( $(date +%s) + 600 )) --value 1ether --private-key "$PK" --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "ERROR: pair for an unmigrated curve token was created"
  exit 1
fi

echo "==> add liquidity + swap (gPPL / WPPL)"
GOV_AMT=1000000000000000000000
cast send "$GOV" 'approve(address,uint256)' "$ROUTER" "$GOV_AMT" --private-key "$PK" --rpc-url "$RPC" >/dev/null
cast send "$ROUTER" 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)' "$GOV" "$GOV_AMT" 0 0 "$DEPLOYER" $(( $(date +%s) + 600 )) --value 1ether --private-key "$PK" --rpc-url "$RPC" >/dev/null
WPPL="$(cast call "$ROUTER" 'WETH()(address)' --rpc-url "$RPC" | awk '{print $1}')"
cast send "$ROUTER" 'swapExactETHForTokens(uint256,address[],address,uint256)' 0 "[$WPPL,$GOV]" "$DEPLOYER" $(( $(date +%s) + 600 )) --value 0.1ether --private-key "$PK" --rpc-url "$RPC" >/dev/null

echo "==> agent wallet spend within limit"
cast send "$AGENT" --value 2ether --private-key "$PK" --rpc-url "$RPC" >/dev/null
FEE_RECIPIENT="$(cast call "$FACTORY" 'feeRecipient()(address)' --rpc-url "$RPC" | awk '{print $1}')"
cast send "$AGENT" 'spend(address,uint256)' "$FEE_RECIPIENT" 500000000000000000 --private-key "$PK" --rpc-url "$RPC" >/dev/null

echo "==> agent spend over limit (expect revert)"
if cast send "$AGENT" 'spend(address,uint256)' "$FEE_RECIPIENT" 2000000000000000000 --private-key "$PK" --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "ERROR: over-limit spend succeeded"
  exit 1
fi

echo "SMOKE OK"
