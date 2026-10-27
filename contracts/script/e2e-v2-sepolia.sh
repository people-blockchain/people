#!/usr/bin/env bash
# E2E driver for PplCurveHubV2 + PplLiquidityEscrow on Base Sepolia (84532) or a local anvil fork of it.
# Usage: script/e2e-v2-sepolia.sh <deploy|phase1|forkwarp|phase2|all-fork>
# Env: RPC (default $BASE_SEPOLIA_RPC), VERIFY=1 (sourcify verify on deploy), OUT_SUFFIX (output file suffix),
#      V2_TREASURY, USDC (see DeployPplCurveHubV2.s.sol). Never prints private keys. Never touches mainnet.
set -euo pipefail
set +x

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$(cd "$DIR/.." && pwd)"
ROOT="$(cd "$CONTRACTS/.." && pwd)"
ENV_FILE="$CONTRACTS/../.sepolia-test.env"
[[ -f "$ENV_FILE" ]] || { echo "missing env file: .sepolia-test.env" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

RPC="${RPC:-${BASE_SEPOLIA_RPC:-}}"
SUF="${OUT_SUFFIX:-}"
DEP_DIR="$CONTRACTS/deployments"
DEPLOY_JSON="$DEP_DIR/base-sepolia-v2${SUF}.json"
E2E_JSON="$DEP_DIR/base-sepolia-v2-e2e${SUF}.json"
WARP_JSON="$DEP_DIR/base-sepolia-v2-forkwarp${SUF}.json"
FORK_JSON="$DEP_DIR/base-sepolia-v2-fork.json"
BROADCAST_JSON="$CONTRACTS/broadcast/DeployPplCurveHubV2.s.sol/84532/run-latest.json"
TUSDC_DEFAULT="0xd5066Db05658b3AEa4cB1AcdEdAcb80a4B9a7505"
export USDC="${USDC:-$TUSDC_DEFAULT}"
export V2_TREASURY="${V2_TREASURY:-0x000000000000000000000000000000000000dEaD}"
mkdir -p "$DEP_DIR"

die() { echo "FAIL: $*" >&2; exit 1; }
say() { echo "[e2e] $*"; }
py() { python3 -I -c "$@"; }
first() { awk '{print $1}'; }
ucall() { cast call --rpc-url "$RPC" "$@" | first; }

guard() {
  [[ -n "$RPC" ]] || die "RPC not set"
  local id
  id="$(cast chain-id --rpc-url "$RPC")" || die "cannot reach RPC"
  [[ "$id" == "84532" ]] || die "chain-id is $id, refusing (only 84532 allowed)"
}
is_fork() { cast rpc --rpc-url "$RPC" anvil_nodeInfo >/dev/null 2>&1; }

load_deploy() {
  [[ -f "$DEPLOY_JSON" ]] || die "no deployment file $(basename "$DEPLOY_JSON"); run deploy first"
  HUB="$(jq -r .hub "$DEPLOY_JSON")"
  ESCROW="$(jq -r .escrow "$DEPLOY_JSON")"
  TOKEN="$(jq -r .usdc "$DEPLOY_JSON")"
  ME="$SEPOLIA_DEPLOYER_ADDR"
}

# ---- recording
rec_init() { jq -n --arg hub "$HUB" --arg rpcKind "$(is_fork && echo fork || echo live)" \
  '{chainId:84532, network:$rpcKind, hub:$hub, steps:[]}' > "$E2E_JSON"; }
rec() { # label tx status note
  [[ -f "$E2E_JSON" ]] || rec_init
  local tmp; tmp="$(mktemp)"
  jq --arg l "$1" --arg h "$2" --arg s "$3" --arg n "${4:-}" \
    '.steps += [{label:$l, tx:$h, status:$s, note:$n}]' "$E2E_JSON" > "$tmp" && mv "$tmp" "$E2E_JSON"
  say "$1: $3 ${2:+tx=$2} ${4:+($4)}"
}

# send_tx <to> <sig> [args...]  (optional GAS=<limit>) -> sets TXHASH TXSTATUS (success|reverted), RECEIPT
send_tx() {
  local opts=(--rpc-url "$RPC" --private-key "$SEPOLIA_DEPLOYER_PK" --json)
  [[ -n "${GAS:-}" ]] && opts+=(--gas-limit "$GAS")
  local out
  out="$(cast send "${opts[@]}" "$@" 2>&1)" || true
  RECEIPT="$out"
  TXHASH="$(jq -r '.transactionHash // empty' <<<"$out" 2>/dev/null || true)"
  [[ -n "$TXHASH" ]] || die "send failed for $2: $out"
  local st; st="$(jq -r '.status' <<<"$out")"
  if [[ "$st" == "0x1" || "$st" == "1" || "$st" == "success" ]]; then TXSTATUS=success; else TXSTATUS=reverted; fi
}
must_succeed() { # label to sig args...
  local label="$1"; shift
  send_tx "$@"
  [[ "$TXSTATUS" == success ]] || { rec "$label" "$TXHASH" reverted "UNEXPECTED"; die "$label reverted"; }
  rec "$label" "$TXHASH" success
}
# failed_tx <label> <ErrorName> <to> <sig> args... : real tx with fixed gas must revert; eth_call must return the error
failed_tx() {
  local label="$1" err="$2"; shift 2
  local out sel
  sel="$(cast sig "$err()")"; sel="${sel#0x}"
  if out="$(cast call --rpc-url "$RPC" --from "$ME" "$@" 2>&1)"; then die "$label: eth_call unexpectedly succeeded"; fi
  grep -qiE "$err|$sel" <<<"$out" || die "$label: eth_call reverted with something other than $err: $out"
  GAS=400000 send_tx "$@"
  [[ "$TXSTATUS" == reverted ]] || { rec "$label" "$TXHASH" success "UNEXPECTED success"; die "$label: tx did not revert"; }
  rec "$label" "$TXHASH" reverted "expected $err (eth_call confirmed)"
}

# ---------------------------------------------------------------- deploy
cmd_deploy() {
  guard
  local bal; bal="$(cast balance --rpc-url "$RPC" "$SEPOLIA_DEPLOYER_ADDR")"
  [[ "$bal" != "0" ]] || die "deployer has zero ETH balance on this RPC"
  local vflags=()
  [[ "${VERIFY:-0}" == "1" ]] && vflags=(--verify --verifier sourcify)
  say "forge script DeployPplCurveHubV2 (broadcast)"
  (cd "$CONTRACTS" && forge script script/DeployPplCurveHubV2.s.sol:DeployPplCurveHubV2 \
      --rpc-url "$RPC" --broadcast ${vflags[@]+"${vflags[@]}"} 2>&1 | grep -vi "private" | tail -25)
  [[ -f "$BROADCAST_JSON" ]] || die "broadcast file not found"
  local hub escrow
  hub="$(jq -r '[.transactions[]|select(.contractName=="PplCurveHubV2")][0].contractAddress' "$BROADCAST_JSON")"
  escrow="$(jq -r '[.transactions[]|select(.contractName=="PplLiquidityEscrow")][0].contractAddress' "$BROADCAST_JSON")"
  [[ "$hub" =~ ^0x ]] && [[ "$escrow" =~ ^0x ]] || die "could not parse addresses"
  jq --arg usdc "$USDC" --arg treasury "$V2_TREASURY" --arg owner "$SEPOLIA_DEPLOYER_ADDR" \
     --arg verifier "$SEPOLIA_VERIFIER_ADDR" --arg hub "$hub" --arg escrow "$escrow" \
     '{chainId:84532, hub:$hub, escrow:$escrow, usdc:$usdc, treasury:$treasury, owner:$owner, verifier:$verifier,
       txs: [.transactions[] | {name:(.contractName // .function), type:.transactionType, hash:.hash}]}' \
     "$BROADCAST_JSON" > "$DEPLOY_JSON"
  say "hub=$hub escrow=$escrow -> $(basename "$DEPLOY_JSON")"
  # sanity: sale opened
  load_deploy
  [[ "$(ucall "$HUB" "openedAt()(uint64)")" != "0" ]] || die "hub not open after deploy"
}

# ---------------------------------------------------------------- phase1
cmd_phase1() {
  guard; load_deploy; rec_init
  local ts deadline pid nonce td sig
  must_succeed "mint 1000 tUSDC" "$TOKEN" "mint(address,uint256)" "$ME" 1000000000
  must_succeed "approve hub" "$TOKEN" "approve(address,uint256)" "$HUB" "$(cast max-uint)"

  ts="$(cast block latest --field timestamp --rpc-url "$RPC")"
  deadline=$((ts + 3600))
  pid="$(cast keccak "ppl-v2-e2e-person-${ts}")"
  nonce="$(ucall "$HUB" "bindNonce(bytes32)(uint256)" "$pid")"
  td="$(jq -cn --arg hub "$HUB" --arg acc "$ME" --arg pid "$pid" --argjson nonce "$nonce" --argjson dl "$deadline" '{
    types:{
      EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],
      Verification:[{name:"account",type:"address"},{name:"personId",type:"bytes32"},{name:"nonce",type:"uint256"},{name:"deadline",type:"uint256"}]},
    primaryType:"Verification",
    domain:{name:"PplCurveHubV2",version:"1",chainId:84532,verifyingContract:$hub},
    message:{account:$acc,personId:$pid,nonce:$nonce,deadline:$dl}}')"
  sig="$(cast wallet sign --data --private-key "$SEPOLIA_VERIFIER_PK" "$td")"
  must_succeed "verify(person)" "$HUB" "verify(bytes32,uint256,bytes)" "$pid" "$deadline" "$sig"
  [[ "$(ucall "$HUB" "personOf(address)(bytes32)" "$ME")" == "$pid" ]] || die "personOf mismatch after verify"

  must_succeed "buy 100 USDC" "$HUB" "buy(uint256,uint256,address,address)" 100000000 0 "$ME" 0x0000000000000000000000000000000000000000
  local ppl; ppl="$(ucall "$HUB" "pplOf(address)(uint256)" "$ME")"
  [[ "$ppl" != "0" ]] || die "pplOf is zero after buy"
  say "pplOf=$ppl reserve=$(ucall "$HUB" "reserveUsd6()(uint256)")"

  failed_tx "buy 501 USDC (over MAX)" AboveMax "$HUB" "buy(uint256,uint256,address,address)" 501000000 0 "$ME" 0x0000000000000000000000000000000000000000
  failed_tx "sellBack before 30d hold" NotEnoughUnlocked "$HUB" "sellBack(uint256,uint256)" "$(py 'print(int(__import__("sys").argv[1])//100)' "$ppl")" 0
  say "phase1 OK"
}

# ---------------------------------------------------------------- forkwarp
cmd_forkwarp() {
  guard; is_fork || die "forkwarp requires an anvil fork (anvil_nodeInfo unavailable)"
  load_deploy
  [[ -f "$E2E_JSON" ]] || rec_init
  cast rpc --rpc-url "$RPC" evm_increaseTime $((31 * 86400)) >/dev/null
  cast rpc --rpc-url "$RPC" evm_mine >/dev/null
  say "warped +31 days"

  local reserve raised ppl
  reserve="$(ucall "$HUB" "reserveUsd6()(uint256)")"
  raised="$(ucall "$HUB" "raisedUsd6()(uint256)")"
  ppl="$(ucall "$HUB" "pplOf(address)(uint256)" "$ME")"
  local caps; caps="$(cast call --rpc-url "$RPC" "$HUB" "sellBackCapToday()(uint256,uint256)" | first)"
  local cap line
  cap="$(sed -n 1p <<<"$caps")"; line="$(sed -n 2p <<<"$caps")"
  [[ "$line" == "$(py 'print(int(__import__("sys").argv[1])*100//10000)' "$reserve")" ]] || die "contract fee line != reserve*1%"
  [[ "$cap" == "$(py 'print(int(__import__("sys").argv[1])*200//10000)' "$reserve")" ]] || die "contract cap != reserve*2%"
  local target; target="$(py 'import sys;print((int(sys.argv[1])+int(sys.argv[2]))//2)' "$line" "$cap")"

  local pplIn gross fee payout q found=0
  pplIn="$(py 'import sys;print(int(sys.argv[1])*int(sys.argv[2])//int(sys.argv[3]))' "$ppl" "$target" "$raised")"
  for _ in $(seq 1 40); do
    q="$(cast call --rpc-url "$RPC" "$HUB" "quoteSellBack(address,uint256)(uint256,uint256,uint256)" "$ME" "$pplIn" | first)"
    gross="$(sed -n 1p <<<"$q")"; fee="$(sed -n 2p <<<"$q")"; payout="$(sed -n 3p <<<"$q")"
    if [[ "$(py 'import sys;g,l,c=map(int,sys.argv[1:]);print(1 if l<g<=c else 0)' "$gross" "$line" "$cap")" == 1 ]]; then found=1; break; fi
    [[ "$gross" != "0" ]] || die "quote returned zero gross"
    pplIn="$(py 'import sys;p,t,g=map(int,sys.argv[1:]);print(max(1,p*t//g))' "$pplIn" "$target" "$gross")"
  done
  [[ $found == 1 ]] || die "could not find pplIn with line < gross <= cap"
  local sellable; sellable="$(ucall "$HUB" "sellableNow(address)(uint256)" "$ME")"
  [[ "$(py 'import sys;print(1 if int(sys.argv[1])<=int(sys.argv[2]) else 0)' "$pplIn" "$sellable")" == 1 ]] || die "pplIn exceeds sellableNow"

  local expfee; expfee="$(py '
import sys
reserve,gross=int(sys.argv[1]),int(sys.argv[2])
ceil=lambda a,b:(a+b-1)//b
line=reserve*100//10000
low=min(gross,line); high=gross-low
print(ceil(low*150,10000)+ceil(high*300,10000), low, high)' "$reserve" "$gross")"
  local expfee_v low high; read -r expfee_v low high <<<"$expfee"
  [[ "$expfee_v" == "$fee" ]] || die "fee mismatch (quote): contract=$fee expected=$expfee_v"
  [[ "$low" != 0 && "$high" != 0 ]] || die "both fee tiers not hit (low=$low high=$high)"

  local bal0 bal1; bal0="$(ucall "$TOKEN" "balanceOf(address)(uint256)" "$ME")"
  must_succeed "sellBack after 31d (both fee tiers)" "$HUB" "sellBack(uint256,uint256)" "$pplIn" "$payout"
  bal1="$(ucall "$TOKEN" "balanceOf(address)(uint256)" "$ME")"
  local delta; delta="$(py 'import sys;print(int(sys.argv[2])-int(sys.argv[1]))' "$bal0" "$bal1")"
  [[ "$delta" == "$payout" ]] || die "USDC delta $delta != payout $payout"

  local topic data ev
  topic="$(cast keccak "SoldBack(address,uint256,uint256,uint256,uint256)")"
  data="$(jq -r --arg t "$topic" --arg hub "$HUB" '[.logs[]|select((.address|ascii_downcase)==($hub|ascii_downcase) and .topics[0]==$t)][0].data' <<<"$RECEIPT")"
  [[ "$data" =~ ^0x ]] || die "SoldBack event not found in receipt"
  ev="$(py 'import sys;d=sys.argv[1][2:];print(*[int(d[i*64:(i+1)*64],16) for i in range(4)])' "$data")"
  local e_ppl e_gross e_fee e_payout; read -r e_ppl e_gross e_fee e_payout <<<"$ev"
  [[ "$e_ppl" == "$pplIn" && "$e_gross" == "$gross" && "$e_fee" == "$fee" && "$e_payout" == "$payout" ]] \
    || die "SoldBack event mismatch: $ev vs $pplIn $gross $fee $payout"

  jq -n --arg tx "$TXHASH" --arg reserve "$reserve" --arg pplIn "$pplIn" --arg gross "$gross" --arg fee "$fee" \
    --arg payout "$payout" --arg expfee "$expfee_v" --arg low "$low" --arg high "$high" --arg line "$line" --arg cap "$cap" \
    --arg delta "$delta" '{warpDays:31, reserveUsd6:$reserve, feeLineUsd6:$line, globalCapUsd6:$cap, pplIn:$pplIn,
      grossUsd6:$gross, lowPartUsd6:$low, highPartUsd6:$high, feeUsd6:$fee, expectedFeeUsd6:$expfee, payoutUsd6:$payout,
      usdcBalanceDelta:$delta, soldBackEventMatches:true, feeMatchesSpec:true, tx:$tx}' > "$WARP_JSON"
  say "forkwarp OK: gross=$gross fee=$fee expected=$expfee_v payout=$payout (low=$low high=$high)"
}

# ---------------------------------------------------------------- phase2
cmd_phase2() {
  guard; load_deploy
  [[ -f "$E2E_JSON" ]] || rec_init
  must_succeed "announceLiquidityRelease" "$HUB" "announceLiquidityRelease()"
  must_succeed "markDelivered([deployer])" "$HUB" "markDelivered(address[])" "[$ME]"
  [[ "$(ucall "$HUB" "delivered(address)(bool)" "$ME")" == "true" ]] || die "delivered flag not set"
  local ppl; ppl="$(ucall "$HUB" "pplOf(address)(uint256)" "$ME")"
  failed_tx "sellBack after delivered" IsDelivered "$HUB" "sellBack(uint256,uint256)" "$(py 'print(max(1,int(__import__("sys").argv[1])//100))' "$ppl")" 0
  say "phase2 OK"
}

# ---------------------------------------------------------------- all-fork
cmd_all_fork() {
  command -v anvil >/dev/null || die "anvil not found"
  local port=8546
  if cast chain-id --rpc-url "http://127.0.0.1:$port" >/dev/null 2>&1; then die "something already listens on :$port"; fi
  export OUT_SUFFIX="-forkrun"; SUF="$OUT_SUFFIX"
  DEPLOY_JSON="$DEP_DIR/base-sepolia-v2${SUF}.json"; E2E_JSON="$DEP_DIR/base-sepolia-v2-e2e${SUF}.json"
  WARP_JSON="$DEP_DIR/base-sepolia-v2-forkwarp${SUF}.json"
  rm -f "$DEPLOY_JSON" "$E2E_JSON" "$WARP_JSON" "$FORK_JSON"
  anvil --fork-url "$BASE_SEPOLIA_RPC" --chain-id 84532 --port "$port" --silent >/dev/null 2>&1 &
  ANVIL_PID=$!
  trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT
  RPC="http://127.0.0.1:$port"
  local i
  for i in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
  guard; is_fork || die "anvil_nodeInfo unavailable"
  cast rpc --rpc-url "$RPC" anvil_setBalance "$SEPOLIA_DEPLOYER_ADDR" 0x8AC7230489E80000 >/dev/null  # 10 ETH
  VERIFY=0 cmd_deploy
  cmd_phase1
  cmd_forkwarp
  cmd_phase2
  jq -n --slurpfile d "$DEPLOY_JSON" --slurpfile e "$E2E_JSON" --slurpfile w "$WARP_JSON" \
    '{note:"anvil fork of Base Sepolia (chain 84532), not a live deployment", deployment:$d[0], e2e:$e[0], forkwarp:$w[0]}' > "$FORK_JSON"
  rm -f "$DEPLOY_JSON" "$E2E_JSON" "$WARP_JSON"
  say "ALL PASS -> $(basename "$FORK_JSON")"
}

case "${1:-}" in
  deploy)   cmd_deploy ;;
  phase1)   cmd_phase1 ;;
  forkwarp) cmd_forkwarp ;;
  phase2)   cmd_phase2 ;;
  all-fork) cmd_all_fork ;;
  *) echo "usage: $0 {deploy|phase1|forkwarp|phase2|all-fork}" >&2; exit 2 ;;
esac
