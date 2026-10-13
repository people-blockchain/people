#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DEV_FAUCET_PRIVATE_KEY:-}" ]]; then
  DEV_FAUCET_PRIVATE_KEY="$(node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(randomBytes(32).toString("hex"))')"
  export DEV_FAUCET_PRIVATE_KEY
fi

# One proposer for an empty-validator network; followers get only its public identity.
BOOTSTRAP_PRIVATE_KEY="$(node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(randomBytes(32).toString("hex"))')"
BOOTSTRAP_ADDRESS="$(BOOTSTRAP_PRIVATE_KEY="$BOOTSTRAP_PRIVATE_KEY" node --input-type=module -e 'import { keyPairFromPrivateKey } from "./packages/core/dist/crypto.js"; process.stdout.write(keyPairFromPrivateKey(process.env.BOOTSTRAP_PRIVATE_KEY).address)')"
export BOOTSTRAP_ADDRESS

CI_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/people-ci.XXXXXX")"
NODE1= NODE2= NODE3=
cleanup() {
  kill "$NODE1" "$NODE2" "$NODE3" 2>/dev/null || true
  wait "$NODE1" "$NODE2" "$NODE3" 2>/dev/null || true
  rm -rf "$CI_DATA_DIR"
}
trap cleanup EXIT



BOOTSTRAP_PRIVATE_KEY="$BOOTSTRAP_PRIVATE_KEY" ALLOW_FAUCET=1 PEER_ID=ci-1 PORT=4101 GOSSIP_PORT=4102 DATA_DIR="$CI_DATA_DIR/ci-1" npm --workspace @ovn/node run dev &
NODE1=$!
sleep 4
BOOTSTRAP_PRIVATE_KEY= PEER_ID=ci-2 PORT=4111 GOSSIP_PORT=4112 DATA_DIR="$CI_DATA_DIR/ci-2" BOOTSTRAP_PEERS=127.0.0.1:4102 npm --workspace @ovn/node run dev &
NODE2=$!
sleep 2
BOOTSTRAP_PRIVATE_KEY= PEER_ID=ci-3 PORT=4121 GOSSIP_PORT=4122 DATA_DIR="$CI_DATA_DIR/ci-3" BOOTSTRAP_PEERS=127.0.0.1:4102 npm --workspace @ovn/node run dev &
NODE3=$!

sleep 12
curl -sf http://127.0.0.1:4101/health >/dev/null
curl -sf http://127.0.0.1:4111/health >/dev/null
curl -sf http://127.0.0.1:4121/health >/dev/null
curl -sf http://127.0.0.1:4101/health/details >/dev/null
curl -sf http://127.0.0.1:4101/openapi.yaml >/dev/null
curl -sf http://127.0.0.1:4101/metrics/prometheus | grep -q ovn_height

H1=$(curl -sf http://127.0.0.1:4101/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
H2=$(curl -sf http://127.0.0.1:4111/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
H3=$(curl -sf http://127.0.0.1:4121/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
echo "heights $H1 $H2 $H3"
test "$H1" -ge 2
test "$H2" -ge 1
test "$H3" -ge 1
DIFF12=$((H1 - H2))
DIFF13=$((H1 - H3))
test "$DIFF12" -le 4
test "$DIFF13" -le 4

# Reward regression: with 0 validators, totalValidatorRewards must stay 0.
REWARDS=$(curl -sf http://127.0.0.1:4101/metrics | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).totalValidatorRewards??0))")
echo "rewards-before-validators $REWARDS"
test "$(printf '%.0f' "$REWARDS")" -eq 0

SMOKE_API_URL=http://127.0.0.1:4101 npx tsx ./scripts/ci-smoke-sdk.ts

# Partition: kill mid node, ensure survivors keep advancing, then restart and catch up.
kill "$NODE2" 2>/dev/null || true
wait "$NODE2" 2>/dev/null || true
sleep 8
H1B=$(curl -sf http://127.0.0.1:4101/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
echo "after-partition head $H1B"
test "$H1B" -gt "$H1"

BOOTSTRAP_PRIVATE_KEY= PEER_ID=ci-2 PORT=4111 GOSSIP_PORT=4112 DATA_DIR="$CI_DATA_DIR/ci-2" BOOTSTRAP_PEERS=127.0.0.1:4102 npm --workspace @ovn/node run dev &
NODE2=$!
sleep 14
H2B=$(curl -sf http://127.0.0.1:4111/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
H1C=$(curl -sf http://127.0.0.1:4101/chain/head | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).height))")
echo "catch-up heights $H1C $H2B"
CATCH_DIFF=$((H1C - H2B))
test "$CATCH_DIFF" -le 5

# Peer book should exist after runtime.
test -f "$CI_DATA_DIR/ci-2/peers.json"

P95=$(curl -sf http://127.0.0.1:4101/metrics | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).apiLatencyP95Ms??0))")
MAX_P95=${PERF_MAX_P95_MS:-500}
echo "api p95 ${P95}ms (max ${MAX_P95}ms)"
test "$(printf '%.0f' "$P95")" -le "$MAX_P95"

node --input-type=module <<'JS'
const ports = [4101,4111,4121];
const heads = await Promise.all(ports.map(async p => (await (await fetch(`http://127.0.0.1:${p}/chain/head`)).json()).height));
const height = Math.min(...heads);
const blocks = await Promise.all(ports.map(async p => await (await fetch(`http://127.0.0.1:${p}/blocks/${height}`)).json()));
if (!blocks[0].hash || !blocks.every(b => b.hash === blocks[0].hash && b.header.stateRoot === blocks[0].header.stateRoot)) throw new Error("nodes disagree at same height");
console.log(`all three nodes agree at height ${height}`);
JS

echo "ci smoke completed"
