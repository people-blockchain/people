#!/usr/bin/env bash
# Offline test for fund-testnet.sh: fake peopled (JSON state file) + fake CometBFT/EVM RPC.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"
trap 'kill "${SRV:-0}" 2>/dev/null || true; rm -rf "$T"' EXIT

PPL=1000000000000000000
DEP=people1wjjs4302qluxlsg0ptgw2slfxgd406uv7rr5d6   # bech32 of 0x74A5…EB8c
FCT=people1y6tkqtshs9wpzz4uwd3hfdd0lzuwgpd4v4588a

mkdir -p "$T/rel/chain/.testnets/node0/peopled/keyring-test" "$T/node1/peopled/keyring-test" "$T/node1/peopled/data/keyring-test"

cat >"$T/peopled" <<'PY'
#!/usr/bin/env python3
import json, os, sys
st_path = os.environ["FAKE_STATE"]; st = json.load(open(st_path)); a = sys.argv[1:]
def save(): json.dump(st, open(st_path, "w"))
def coin(n): return {"balances": [{"denom": "appl", "amount": str(n)}] if n else []}
if a[:2] == ["keys", "list"]:
    home = a[a.index("--home") + 1]
    if "unsafe" in a or "export" in a: sys.exit(9)
    print(json.dumps([{"name": n, "address": ad, "type": "local"} for n, ad in st["keys"].get(home, [])]))
elif a[:3] == ["q", "bank", "balances"]:
    print(json.dumps(coin(st["bal"].get(a[3], 0))))
elif a[:3] == ["q", "bank", "spendable-balances"]:
    print(json.dumps(coin(st["bal"].get(a[3], 0) - st["locked"].get(a[3], 0))))
elif a[:3] == ["tx", "bank", "send"]:
    home = a[a.index("--home") + 1]
    frm = dict(st["keys"][home])[a[3]]; to = a[4]; amt = int(a[5][:-4])
    assert a[a.index("--chain-id") + 1] == "people_97401-1"
    fee = 10**14
    if st["bal"].get(frm, 0) - st["locked"].get(frm, 0) < amt + fee:
        print(json.dumps({"code": 5, "raw_log": "insufficient funds", "txhash": "X"})); sys.exit(0)
    st["bal"][frm] -= amt + fee; st["bal"][to] = st["bal"].get(to, 0) + amt
    st["sends"].append([a[3], to, amt]); save()
    print(json.dumps({"code": 0, "txhash": "H%d" % len(st["sends"])}))
elif a[:2] == ["q", "tx"]:
    print(json.dumps({"code": 0, "height": "100"}))
else:
    sys.exit(f"unexpected {a}")
PY
chmod +x "$T/peopled"

cat >"$T/rpc.py" <<'PY'
import http.server, json, os, sys
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, obj):
        b = json.dumps(obj).encode(); self.send_response(200); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._send({"result": {"node_info": {"network": os.environ.get("NET", "people_97401-1")},
                               "sync_info": {"latest_block_height": "9300", "catching_up": False}}})
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["content-length"])))
        self._send({"jsonrpc": "2.0", "id": 1, "result": "0x3b9aca00" if req["method"] == "eth_gasPrice" else "0x0"})
s = http.server.HTTPServer(("127.0.0.1", 0), H); print(s.server_port, flush=True); s.serve_forever()
PY

start_rpc() {
  python3 "$T/rpc.py" >"$T/port" & SRV=$!
  for _ in $(seq 50); do [ -s "$T/port" ] && break; sleep 0.1; done
  PORT="$(cat "$T/port")"
}

state() {  # $1 = per-account spendable PPL for account1..3, $2 = node0 locked (bonded) PPL
  python3 - "$T" "$1" "$2" "$PPL" <<'PY'
import json, sys
t, each, locked, one = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
h0 = f"{t}/rel/chain/.testnets/node0/peopled"; h1 = f"{t}/node1/peopled"
st = {"keys": {h0: [["node0", "people1node0"], ["account1", "people1acc1"], ["account2", "people1acc2"]],
               h1: [["account1", "people1acc1"], ["account3", "people1acc3"]]},
      "bal": {"people1node0": 100 * one, "people1acc1": each * one, "people1acc2": each * one, "people1acc3": each * one,
              "people1vmdpt6nljzrcx924ddle96q8kgjaf2mlvdfpel": 350_000_000 * one},
      "locked": {"people1node0": locked * one, "people1vmdpt6nljzrcx924ddle96q8kgjaf2mlvdfpel": 349_000_000 * one},
      "sends": []}
json.dump(st, open(f"{t}/state.json", "w"))
PY
}

run_fund() {
  FAKE_STATE="$T/state.json" PEOPLED="$T/peopled" COMET_RPC="http://127.0.0.1:$PORT" EVM_RPC="http://127.0.0.1:$PORT" \
    KEYRING_SEARCH="$T" bash "$HERE/fund-testnet.sh" "$@"
}
sends() { python3 -c "import json;print(json.load(open('$T/state.json'))['sends'])"; }
bal() { python3 -c "import json;print(json.load(open('$T/state.json'))['bal'].get('$1',0)//$PPL)"; }
fail() { echo "FAIL: $*" >&2; cat "$T/out" >&2; exit 1; }

start_rpc

# 1. Enough keyed funds: deployer topped to 2000, faucet to 1000, bonded stake untouched.
state 1500 100
run_fund >"$T/out" 2>&1 || fail "case 1 exit $?"
[ "$(bal $DEP)" = 2000 ] || fail "deployer $(bal $DEP)"
[ "$(bal $FCT)" = 1000 ] || fail "faucet $(bal $FCT)"
[ "$(bal people1node0)" = 100 ] || fail "bonded node0 moved"
grep -q "DONE" "$T/out" || fail "no DONE"
grep -qiE "private|mnemonic|priv_key" "$T/out" && fail "key material in output"
[ "$(grep -c 'people1acc1 ' "$T/out")" = 1 ] || fail "duplicate key across homes not deduped"

# 2. Idempotent re-run sends nothing.
n="$(sends | python3 -c 'import sys,ast;print(len(ast.literal_eval(sys.stdin.read())))')"
run_fund >"$T/out" 2>&1 || fail "case 2 exit $?"
[ "$(sends | python3 -c 'import sys,ast;print(len(ast.literal_eval(sys.stdin.read())))')" = "$n" ] || fail "re-run sent again"

# 3. Shortfall: deployer funded first, exit 2 with explanation.
state 100 100
set +e; run_fund >"$T/out" 2>&1; rc=$?; set -e
[ "$rc" = 2 ] || fail "case 3 exit $rc"
[ "$(bal $DEP)" = 297 ] || fail "deployer partial $(bal $DEP)"
[ "$(bal $FCT)" = 0 ] || fail "faucet should be empty"
grep -q "SHORTFALL" "$T/out" || fail "no shortfall message"

# 4. Dry run sends nothing.
state 1500 100
run_fund_dry() { DRY_RUN=1 run_fund; }
run_fund_dry >"$T/out" 2>&1 || fail "case 4 exit $?"
[ "$(bal $DEP)" = 0 ] || fail "dry run sent"

# 5. Wrong network refused.
kill "$SRV"; NET=people_97401-2 start_rpc
set +e; run_fund >"$T/out" 2>&1; rc=$?; set -e
[ "$rc" != 0 ] && grep -q refusing "$T/out" || fail "wrong network not refused"

echo "fund-testnet.test.sh: all cases passed"
