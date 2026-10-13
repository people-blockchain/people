#!/usr/bin/env bash
# On-chain E2E on Cosmos EVM 97401 (read + write). Requires: cast, curl, jq.
set -euo pipefail
RPC="${RPC_URL:-https://node.peopleblockchain.network/rpc}"
FAUCET="${EVM_FAUCET_URL:-https://node.peopleblockchain.network/faucet}"
FACTORY=0x7420D301C98EC8aD0476072eF0FD7Af9Af047F1A
CURVE=0x66b152836FFbE41761e6Ba285308cB0e6C534dE7
ROUTER=0xea266b3361993Db1E62D7c47b82Cb5261af3e0C1
NFT=0x206cA420587B584F0257D5Ff1CBE9Ad256057Fe2
WPPL=0x4f2141103b6dd942A1fe0fa2082AcC2f52F3A680
AMM_FACTORY=0x24198D61150DEC3184e9daDa267269ef2b98E121
CREATE_FEE=1045005000000000000
NFT_FEE=2925000000000000000
TOKEN_CREATED=0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724
COL_CREATED=0x5fead977881b23a0dbf2f905699203f29cefea57a576d2d4f412523191258e84
SYM="E2E$(date +%s | tail -c 6)"

NEW=$(cast wallet new --json)
PK=$(echo "$NEW" | jq -r '.data[0].private_key')
ADDR=$(echo "$NEW" | jq -r '.data[0].address')
echo "test wallet $ADDR"

curl -sf -X POST "$FAUCET/fund" -H 'content-type: application/json' \
  -d "{\"address\":\"$ADDR\",\"amount\":\"30\"}" | jq -c .
sleep 10
BAL=$(cast balance "$ADDR" --rpc-url "$RPC")
echo "balance=$BAL"
[[ "$BAL" != "0" ]] || { echo "faucet failed"; exit 1; }

TX=$(cast send "$FACTORY" \
  "createToken(string,string,uint8,uint256,string)" \
  "E2E Token $SYM" "$SYM" 6 1000000000000 "ipfs://people/$SYM" \
  --rpc-url "$RPC" --private-key "$PK" --value "$CREATE_FEE" --json)
TOKEN=$(echo "$TX" | jq -r --arg t "$TOKEN_CREATED" '.logs[]? | select(.topics[0]==$t) | .topics[1]' | head -1)
TOKEN=$(cast parse-bytes32-address "$TOKEN")
echo "token=$TOKEN"

cast send "$CURVE" "buy(address,uint256)" "$TOKEN" 0 \
  --rpc-url "$RPC" --private-key "$PK" --value 2ether >/dev/null
echo "curve buy ok"

AMT=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$ADDR" --rpc-url "$RPC" | awk '{print $1}')
AMT=$(( AMT / 4 ))
echo "liq amount raw=$AMT"
cast send "$TOKEN" "approve(address,uint256)" "$ROUTER" "$AMT" --rpc-url "$RPC" --private-key "$PK" >/dev/null
DEADLINE=$(( $(date +%s) + 600 ))
cast send "$ROUTER" \
  "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)" \
  "$TOKEN" "$AMT" 0 0 "$ADDR" "$DEADLINE" \
  --rpc-url "$RPC" --private-key "$PK" --value 1ether >/dev/null
PAIR=$(cast call "$AMM_FACTORY" "getPair(address,address)(address)" "$TOKEN" "$WPPL" --rpc-url "$RPC")
echo "pair=$PAIR"

cast send "$ROUTER" \
  "swapExactETHForTokens(uint256,address[],address,uint256)" \
  0 "[$WPPL,$TOKEN]" "$ADDR" "$DEADLINE" \
  --rpc-url "$RPC" --private-key "$PK" --value 0.1ether >/dev/null
echo "swap ok"

CRE=$(cast send "$NFT" "createCollection(string,string)" "E2E NFT $SYM" "EN$SYM" \
  --rpc-url "$RPC" --private-key "$PK" --json)
COL=$(echo "$CRE" | jq -r --arg t "$COL_CREATED" '.logs[]? | select(.topics[0]==$t) | .topics[1]' | head -1)
COL=$(cast parse-bytes32-address "$COL")
echo "collection=$COL"
cast send "$NFT" "mint(address,string)" "$COL" "ipfs://nft/1" \
  --rpc-url "$RPC" --private-key "$PK" --value "$NFT_FEE" >/dev/null
echo "nft mint ok"

echo "E2E_OK token=$TOKEN pair=$PAIR collection=$COL wallet=$ADDR"
