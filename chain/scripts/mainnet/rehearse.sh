#!/usr/bin/env bash
# Full mainnet ceremony rehearsal on one machine with THROWAWAY keys (test keyring, temp dir).
# Proves: the ceremony scripts produce a genesis that passes every mainnet check, and a binary
# without the real mainnet treasury multisig refuses to produce block 1.
#
#   bash rehearse.sh                     # default: expect the fail-closed halt
#   REHEARSAL_BUILD=1 bash rehearse.sh   # also builds a throwaway binary that knows the
#       rehearsal multisig; then the chain must run and report eth_chainId 0x17c78 (97400)
#
# Nothing here is usable on the real mainnet: all keys live in a temp dir that is deleted.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
need curl

EXPECT_BLOCKS="${EXPECT_BLOCKS:-0}"
N="${VALIDATORS:-3}"
REH="${REHEARSAL_DIR:-$(mktemp -d)}"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; [[ -n "${KEEP:-}" ]] || rm -rf "$REH"; }
trap cleanup EXIT
K=(--keyring-backend test --home "$REH/keys")

echo "== throwaway treasury multisig and team key =="
for s in signer1 signer2 signer3 team; do "$PEOPLED" keys add "$s" "${K[@]}" >/dev/null 2>&1; done
"$PEOPLED" keys add treasury --multisig signer1,signer2,signer3 --multisig-threshold 2 --nosort "${K[@]}" >/dev/null 2>&1
MS_ADDR="$("$PEOPLED" keys show treasury -a "${K[@]}")"
TEAM_ADDR="$("$PEOPLED" keys show team -a "${K[@]}")"
PUBS=()
for s in signer1 signer2 signer3; do
  PUBS+=("$("$PEOPLED" keys show "$s" --output json "${K[@]}" | jq -r '.pubkey' | jq -r '.key' | python3 -c 'import base64,sys;print(base64.b64decode(sys.stdin.read()).hex())')")
done
echo "rehearsal multisig: $MS_ADDR"

if [[ "${REHEARSAL_BUILD:-0}" == "1" ]]; then
  # Build a throwaway binary that knows this rehearsal multisig, so the chain must actually run
  # (and report EVM chain id 97400). Needs the cosmos/evm cache from build-peopled.sh.
  echo "== rehearsal binary with the throwaway multisig =="
  CACHE="$CHAIN_ROOT/.cache/cosmos-evm"
  FS="$CACHE/evmd/peoplefees/feesplit.go"
  [[ -f "$FS" ]] || { echo "run chain/scripts/build-peopled.sh first" >&2; exit 1; }
  cp "$FS" "$REH/feesplit.go.orig"
  sed -i "s/^const MainnetTreasuryMultisigAddress = \"\"/const MainnetTreasuryMultisigAddress = \"$MS_ADDR\"/" "$FS"
  grep -q "MainnetTreasuryMultisigAddress = \"$MS_ADDR\"" "$FS" || { echo "could not patch rehearsal binary" >&2; exit 1; }
  (cd "$CACHE" && LEDGER_ENABLED=false make build >/dev/null 2>&1) || { cp "$REH/feesplit.go.orig" "$FS"; echo "rehearsal build failed" >&2; exit 1; }
  cp "$REH/feesplit.go.orig" "$FS"
  cp "$CACHE/build/evmd" "$REH/peopled-rehearsal"
  PEOPLED="$REH/peopled-rehearsal"
  EXPECT_BLOCKS=1
fi

python3 - "$CHAIN_ROOT/emission/allocation-mainnet.json" "$REH/allocation.json" "$MS_ADDR" "$TEAM_ADDR" "${PUBS[@]}" <<'PY'
import json, sys
src, out, ms, team, *pubs = sys.argv[1:]
d = json.load(open(src))
d["treasury_multisig"].update({"address": ms, "public_keys_secp256k1_hex": pubs, "placeholder": False})
for name, b in d["buckets"].items():
    b["owner_placeholder"] = False
    if b.get("account_kind", "").startswith("multisig") or name == "treasury":
        b["account"] = ms
d["buckets"]["team"]["account"] = team
json.dump(d, open(out, "w"), indent=2)
PY
export PEOPLE_ALLOCATION="$REH/allocation.json"
export PEOPLE_REHEARSAL=1

echo "== step 1: validator-init x$N =="
OPS=()
for i in $(seq 1 "$N"); do
  out="$(MONIKER="rehearsal-$i" NODE_HOME="$REH/val$i" KEYRING_BACKEND=test ALLOW_TEST_KEYRING=1 bash "$MAINNET_DIR/validator-init.sh" 2>/dev/null)"
  OPS+=("$(awk '/^operator:/{print $2}' <<<"$out")")
done

echo "== step 2: pre-genesis =="
GT="$(date -u -d '+20 seconds' +%Y-%m-%dT%H:%M:%SZ)"
OPERATORS="$(IFS=,; echo "${OPS[*]}")" GENESIS_TIME="$GT" OUT="$REH/pre-genesis.json" bash "$MAINNET_DIR/build-pregenesis.sh"
SHA="$(sha256_of "$REH/pre-genesis.json")"

echo "== step 3: gentx x$N =="
mkdir -p "$REH/gentx"
for i in $(seq 1 "$N"); do
  PREGENESIS="$REH/pre-genesis.json" PREGENESIS_SHA256="$SHA" MONIKER="rehearsal-$i" NODE_HOME="$REH/val$i" KEYRING_BACKEND=test \
    bash "$MAINNET_DIR/make-gentx.sh" >/dev/null
  cp "$REH/val$i/config/gentx-rehearsal-$i.json" "$REH/gentx/"
done

echo "== step 4: finalize =="
PREGENESIS="$REH/pre-genesis.json" GENTX_DIR="$REH/gentx" OUT="$REH/genesis.json" bash "$MAINNET_DIR/finalize-genesis.sh"

echo "== step 5: start $N validators on this host =="
PEERS=()
for i in $(seq 1 "$N"); do
  PEERS+=("$("$PEOPLED" comet show-node-id --home "$REH/val$i")@127.0.0.1:$((26656 + i * 100))")
done
for i in $(seq 1 "$N"); do
  cp "$REH/genesis.json" "$REH/val$i/config/genesis.json"
  off=$((i * 100))
  args=(start --home "$REH/val$i" --chain-id "$CHAIN_ID"
    --p2p.laddr "tcp://127.0.0.1:$((26656 + off))" --rpc.laddr "tcp://127.0.0.1:$((26657 + off))"
    --grpc.address "127.0.0.1:$((9090 + off))" --p2p.persistent_peers "$(IFS=,; echo "${PEERS[*]}")"
    --json-rpc.ws-address "127.0.0.1:$((18546 + off))")
  # All rehearsal validators share 127.0.0.1, which the mainnet config forbids for real peers.
  sed -i -e 's/^allow_duplicate_ip = .*/allow_duplicate_ip = true/' -e 's/^addr_book_strict = .*/addr_book_strict = false/' \
    -e 's/^prometheus = .*/prometheus = false/' -e "s#^pprof_laddr = .*#pprof_laddr = \"\"#" "$REH/val$i/config/config.toml"
  if [[ $i == 1 ]]; then
    args+=(--json-rpc.enable --json-rpc.address "127.0.0.1:18545" --json-rpc.api eth,net,web3)
  fi
  "$PEOPLED" "${args[@]}" >"$REH/val$i.log" 2>&1 &
  PIDS+=($!)
done

height=0
for _ in $(seq 1 60); do
  sleep 2
  height=$(curl -sf "http://127.0.0.1:26757/status" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo 0)
  [[ "$height" =~ ^[0-9]+$ ]] || height=0
  (( height >= 3 )) && break
  grep -q "mainnet treasury multisig address is not set" "$REH/val1.log" && break
done

if [[ "$EXPECT_BLOCKS" == "1" ]]; then
  (( height >= 3 )) || { echo "FAIL: rehearsal chain produced no blocks"; tail -30 "$REH/val1.log"; exit 1; }
  cid=$(curl -sf -X POST http://127.0.0.1:18545 -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r .result)
  [[ "$cid" == "0x17c78" ]] || { echo "FAIL: eth_chainId $cid, want 0x17c78 (97400)"; exit 1; }
  echo "PASS: rehearsal mainnet at height $height, eth_chainId $cid"
else
  if grep -q "mainnet treasury multisig address is not set" "$REH/val1.log" && (( height < 2 )); then
    echo "PASS: genesis is valid and the node refuses mainnet without the real treasury multisig (height $height)"
  else
    echo "FAIL: expected the fail-closed halt, got height $height"; tail -30 "$REH/val1.log"; exit 1
  fi
fi
