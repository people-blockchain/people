#!/usr/bin/env bash
# Non-destructive recovery of a validator halted by a BeginBlocker panic
# (e.g. M11-1 peoplefees int64 overflow, fixed in #172).
#
# Symptom: CometBFT block store is one block ahead of the app/EVM state
# (/status height H+1, eth_blockNumber H) and the height stops advancing.
# CometBFT saved block H+1, then FinalizeBlock panicked. Restarting with a
# fixed binary replays H+1 through the new code. No data wipe, no genesis change.
#
# Usage on the validator host, from a checkout of merged main:
#   sudo bash chain/scripts/recover-halt.sh            # build peopled from this checkout
#   sudo PEOPLED_BIN=/path/to/peopled bash chain/scripts/recover-halt.sh   # use a prebuilt binary
#
# Env: UNIT (default: auto-detected peopled*.service), COMET_RPC, EVM_RPC,
#      WAIT_SECS (default 120), DEPLOYER (address whose nonces are printed).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMET_RPC="${COMET_RPC:-http://127.0.0.1:26657}"
EVM_RPC="${EVM_RPC:-http://127.0.0.1:8545}"
WAIT_SECS="${WAIT_SECS:-120}"
DEPLOYER="${DEPLOYER:-0x74A50ac5Ea07f86fC10f0AD0E543e9321B57EB8c}"

need() { command -v "$1" >/dev/null || { echo "missing $1" >&2; exit 1; }; }
need curl; need jq; need systemctl

comet_height() { curl -sf -m 5 "$COMET_RPC/status" | jq -r '.result.sync_info.latest_block_height' || echo 0; }
evm_call() {
  curl -sf -m 5 -X POST "$EVM_RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" | jq -r '.result // empty'
}
evm_height() { local h; h="$(evm_call eth_blockNumber '[]')"; [ -n "$h" ] && echo $((h)) || echo 0; }
nonces() {
  local l p
  l="$(evm_call eth_getTransactionCount "[\"$DEPLOYER\",\"latest\"]")"
  p="$(evm_call eth_getTransactionCount "[\"$DEPLOYER\",\"pending\"]")"
  echo "deployer $DEPLOYER nonce latest=$((${l:-0})) pending=$((${p:-0}))"
}

UNIT="${UNIT:-$(systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -E '^peopled' | head -1)}"
[ -n "$UNIT" ] || { echo "no peopled*.service found; set UNIT=" >&2; exit 1; }
EXEC="$(systemctl show -p ExecStart --value "$UNIT" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -1)"
[ -n "$EXEC" ] && [ -x "$EXEC" ] || { echo "cannot resolve ExecStart binary for $UNIT (got '$EXEC')" >&2; exit 1; }
TARGET="$(readlink -f "$EXEC")"

echo "== before"
echo "unit=$UNIT exec=$EXEC -> $TARGET"
echo "active=$(systemctl is-active "$UNIT" || true)"
"$TARGET" version --long 2>/dev/null | grep -E '^(version|commit):' || true
echo "sha256 $(sha256sum "$TARGET" | cut -d' ' -f1)"
c0="$(comet_height)"; e0="$(evm_height)"
echo "comet height=$c0 evm height=$e0"
nonces || true
echo "-- last panic in journal (if any)"
last_panic="$(journalctl -u "$UNIT" --no-pager -n 4000 2>/dev/null | grep -iE -A 12 'panic|CONSENSUS FAILURE' | head -40 || true)"
echo "${last_panic:-(none in last 4000 lines)}"

echo "== binary"
if [ -n "${PEOPLED_BIN:-}" ]; then
  NEW="$PEOPLED_BIN"
else
  bash "$ROOT/scripts/build-peopled.sh"
  NEW="$ROOT/build/peopled"
fi
[ -x "$NEW" ] || { echo "new binary $NEW not executable" >&2; exit 1; }
SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if grep -q 'math.Int' "$ROOT/overrides/evmd/peoplefees/feesplit.go"; then
  echo "checkout $SHA contains the #172 peoplefees math.Int fix"
else
  echo "checkout $SHA does NOT contain the #172 fix; pull main first" >&2; exit 1
fi
if cmp -s "$NEW" "$TARGET"; then
  echo "running binary is already identical to the new build; restarting only"
else
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$TARGET" "$TARGET.bak-$TS"
  echo "backup: $TARGET.bak-$TS"
fi

echo "== restart"
# Swap first (atomic rename is safe under a running process), so a
# Restart=on-failure respawn can only ever exec the fixed binary.
if ! cmp -s "$NEW" "$TARGET"; then
  install -m 0755 "$NEW" "$TARGET.new"
  mv -f "$TARGET.new" "$TARGET"
fi
# After CONSENSUS FAILURE the consensus goroutine holds its lock and the process
# ignores SIGTERM; escalate to SIGKILL. Safe: the failed block was never
# committed by the app and CometBFT replays it on start (ABCI handshake).
systemctl kill -s SIGTERM "$UNIT" 2>/dev/null || true
for _ in $(seq 1 20); do systemctl is-active -q "$UNIT" || break; sleep 1; done
if systemctl is-active -q "$UNIT"; then
  echo "process ignored SIGTERM (expected after a consensus panic); sending SIGKILL"
  systemctl kill -s SIGKILL "$UNIT" || true
  sleep 2
fi
systemctl stop "$UNIT" 2>/dev/null || true
systemctl reset-failed "$UNIT" 2>/dev/null || true
systemctl start "$UNIT"

halted="$c0"
for _ in $(seq 1 "$((WAIT_SECS / 5))"); do
  sleep 5
  h="$(comet_height)"
  [ "$h" -gt "$((halted + 2))" ] 2>/dev/null && break
done

echo "== after"
echo "active=$(systemctl is-active "$UNIT" || true)"
"$TARGET" version --long 2>/dev/null | grep -E '^(version|commit):' || true
echo "sha256 $(sha256sum "$TARGET" | cut -d' ' -f1)"
c1="$(comet_height)"; e1="$(evm_height)"
echo "comet height $c0 -> $c1, evm height $e0 -> $e1, repo checkout $SHA"
nonces || true
if journalctl -u "$UNIT" --no-pager --since "-$((WAIT_SECS + 30))s" 2>/dev/null | grep -qiE 'panic|CONSENSUS FAILURE'; then
  echo "FAIL: panic after restart; journal:" >&2
  journalctl -u "$UNIT" --no-pager --since "-$((WAIT_SECS + 30))s" | grep -iE -A 20 'panic|CONSENSUS FAILURE' | head -60 >&2
  exit 1
fi
[ "$c1" -gt "$((halted + 2))" ] || { echo "FAIL: height not advancing ($c0 -> $c1)" >&2; exit 1; }
echo "OK: chain advancing"
