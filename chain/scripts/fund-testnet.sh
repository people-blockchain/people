#!/usr/bin/env bash
# Fund the testnet deployer and EVM faucet on people_97401-1 from keys that can
# actually sign. Testnet only. Does not stop validators, touch node data, change
# genesis or export keys.
#
# Who controls the big genesis balances (chain/emission/allocation.json, #157):
#   community  people1vmdpt6...dfpel  ContinuousVestingAccount at
#              sha256("people_community_genesis")[:20]
#   validators people1yaf2hm...ml02   PeriodicVestingAccount at
#              sha256("people_validator_vesting")[:20]
#   treasury/team/sale/liquidity      x/auth ModuleAccounts (people_*), no Msg handler spends them
# Module-derived addresses have no private key, mnemonic or multisig. No module
# in peopled moves coins out of them. A vesting balance can be vested and
# spendable on paper and still have no signer. The only ways to move them are a
# coordinated binary upgrade handler or a genesis reset. Both are founder-gated
# (AGENTS.md sections 3, 4 and 17), so this script does not attempt them.
#
# What it does instead: it looks for every test-backend keyring under the
# known release and node homes, lists each key's address (never the key
# material), and reads spendable balances (bonded stake is never spendable, so
# validator power is not touched). It then tops up the deployer to TARGET_DEPLOYER_PPL
# and the faucet to TARGET_FAUCET_PPL with plain x/bank sends, deployer first,
# leaving KEEP_PPL on each source for fees. It is safe to re-run: it only sends
# the shortfall. With too little keyed PPL it sends what exists (deployer
# first), prints the shortfall and exits 2.
#
# Usage (root on a validator host, from a checkout of this repo):
#   sudo bash chain/scripts/fund-testnet.sh
#   sudo DRY_RUN=1 bash chain/scripts/fund-testnet.sh   # plan only, no tx
#
# Env: PEOPLED, COMET_RPC, EVM_RPC, CHAIN_ID, DEPLOYER, FAUCET, TARGET_DEPLOYER_PPL,
#      TARGET_FAUCET_PPL, SEED_MIN_PPL, KEEP_PPL, GAS_PRICE_APPL, KEYRING_SEARCH, DRY_RUN
set -euo pipefail

export PEOPLED="${PEOPLED:-/opt/people-chain-cosmos/bin/peopled}"
export COMET_RPC="${COMET_RPC:-http://127.0.0.1:26657}"
export EVM_RPC="${EVM_RPC:-http://127.0.0.1:8545}"
export CHAIN_ID="${CHAIN_ID:-people_97401-1}"
export DEPLOYER="${DEPLOYER:-0x74A50ac5Ea07f86fC10f0AD0E543e9321B57EB8c}"
export FAUCET="${FAUCET:-0x2697602E17815C110aBc736374B5afF8B8E405B5}"
export TARGET_DEPLOYER_PPL="${TARGET_DEPLOYER_PPL:-2000}"
export TARGET_FAUCET_PPL="${TARGET_FAUCET_PPL:-1000}"
export SEED_MIN_PPL="${SEED_MIN_PPL:-1300}"
export KEEP_PPL="${KEEP_PPL:-1}"
export GAS_PRICE_APPL="${GAS_PRICE_APPL:-}"
export KEYRING_SEARCH="${KEYRING_SEARCH:-/opt/people-chain-cosmos /var/lib/people-cosmos /root}"
export DRY_RUN="${DRY_RUN:-0}"

command -v python3 >/dev/null || { echo "missing python3" >&2; exit 1; }
[ -x "$PEOPLED" ] || { echo "peopled not executable at $PEOPLED (set PEOPLED=)" >&2; exit 1; }

exec python3 - <<'PY'
import json, os, subprocess, sys, time, urllib.request

E = os.environ
PEOPLED, COMET, EVM, CHAIN_ID = E["PEOPLED"], E["COMET_RPC"], E["EVM_RPC"], E["CHAIN_ID"]
DRY = E["DRY_RUN"] == "1"
ONE = 10**18
NODE = "tcp://" + COMET.split("://", 1)[-1]

# Read-only info about the genesis buckets (see header).
KEYLESS = {
    "people1vmdpt6nljzrcx924ddle96q8kgjaf2mlvdfpel": "community (vesting, sha256('people_community_genesis'))",
    "people1yaf2hms6r9z6ws3hk2nmfvn33ruatz6lezml02": "validators pool (vesting, sha256('people_validator_vesting'))",
    "people1waxs09dmsze7vsxy9mwqk09y9hk0x6nh948p85": "treasury (module people_treasury)",
}

CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
def _polymod(v):
    g = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; c = 1
    for x in v:
        b = c >> 25; c = (c & 0x1ffffff) << 5 ^ x
        for i in range(5):
            c ^= g[i] if (b >> i) & 1 else 0
    return c
def _conv(data, f, t):
    acc = bits = 0; out = []
    for v in data:
        acc = (acc << f) | v; bits += f
        while bits >= t:
            bits -= t; out.append((acc >> bits) & ((1 << t) - 1))
    if bits: out.append((acc << (t - bits)) & ((1 << t) - 1))
    return out
def to_bech32(hexaddr, hrp="people"):
    d = _conv(bytes.fromhex(hexaddr[2:]), 8, 5)
    hx = [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]
    p = _polymod(hx + d + [0] * 6) ^ 1
    return hrp + "1" + "".join(CH[x] for x in d + [(p >> 5 * (5 - i)) & 31 for i in range(6)])

def ppl(appl):
    s = f"{appl // ONE}.{appl % ONE:018d}".rstrip("0").rstrip(".")
    return s + " PPL"

def run(args, check=True):
    r = subprocess.run([PEOPLED] + args, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"peopled {args[0]} {args[1] if len(args) > 1 else ''} failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r

def http_json(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def evm(method, params):
    return http_json(EVM, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).get("result")

def spendable(addr):
    r = run(["q", "bank", "spendable-balances", addr, "--node", NODE, "-o", "json"], check=False)
    if r.returncode != 0:
        return 0
    for c in json.loads(r.stdout).get("balances", []):
        if c["denom"] == "appl":
            return int(c["amount"])
    return 0

def balance(addr):
    r = run(["q", "bank", "balances", addr, "--node", NODE, "-o", "json"], check=False)
    if r.returncode != 0:
        return 0
    for c in json.loads(r.stdout).get("balances", []):
        if c["denom"] == "appl":
            return int(c["amount"])
    return 0

def show(title, deployer, faucet):
    print(f"== {title}")
    for label, hx, b32 in (("deployer", E["DEPLOYER"], deployer), ("faucet", E["FAUCET"], faucet)):
        line = f"{label:8} {hx} {b32} bank={ppl(balance(b32))}"
        try:
            line += f" evm={ppl(int(evm('eth_getBalance', [hx, 'latest']), 16))}"
        except Exception:
            line += " evm=(rpc unavailable)"
        print(line)

# 1. Right network.
try:
    st = http_json(COMET + "/status")["result"]
except Exception as e:
    sys.exit(f"cannot reach CometBFT RPC {COMET}: {e}")
network, height = st["node_info"]["network"], st["sync_info"]["latest_block_height"]
print(f"network={network} height={height} catching_up={st['sync_info']['catching_up']}")
if network != CHAIN_ID:
    sys.exit(f"refusing: node is on {network}, expected {CHAIN_ID}")

deployer = to_bech32(E["DEPLOYER"])
faucet = to_bech32(E["FAUCET"])
show("before", deployer, faucet)

print("== genesis buckets (no signer exists; info only)")
for a, what in KEYLESS.items():
    print(f"  {a} {what}: balance={ppl(balance(a))} spendable={ppl(spendable(a))}")

# 2. Every test keyring we can see. Addresses only; key material is never read or printed.
homes = []
for root in E["KEYRING_SEARCH"].split():
    if not os.path.isdir(root):
        continue
    for dirpath, dirnames, _ in os.walk(root):
        if dirpath.count(os.sep) - root.count(os.sep) > 8:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in ("data", "node_modules", ".git", "wasm", "snapshots", ".cache", ".npm", "go", ".cargo", ".rustup", "build")]
        if "keyring-test" in dirnames:
            homes.append(dirpath)

sources, seen = [], set()
for home in sorted(set(homes)):
    r = run(["keys", "list", "--keyring-backend", "test", "--home", home, "--output", "json"], check=False)
    if r.returncode != 0:
        continue
    try:
        keys = json.loads(r.stdout or "[]")
    except json.JSONDecodeError:
        continue
    for k in keys:
        addr = k.get("address", "")
        if not addr or addr in seen or addr in (deployer, faucet):
            continue
        seen.add(addr)
        sources.append({"name": k["name"], "home": home, "addr": addr, "spendable": spendable(addr)})

keep = int(E["KEEP_PPL"]) * ONE
print(f"== keyed sources ({len(sources)} keys in {len(set(homes))} keyring homes; keep {ppl(keep)} each for fees)")
for s in sorted(sources, key=lambda s: -s["spendable"]):
    print(f"  {s['name']:20} {s['addr']} spendable={ppl(s['spendable'])}  [{s['home']}]")
available = sum(max(0, s["spendable"] - keep) for s in sources)
print(f"  total usable: {ppl(available)}")

# 3. Plan: top up deployer first, then faucet.
targets = [("deployer", deployer, int(E["TARGET_DEPLOYER_PPL"]) * ONE),
           ("faucet", faucet, int(E["TARGET_FAUCET_PPL"]) * ONE)]
plan = []
pool = sorted(sources, key=lambda s: -s["spendable"])
for label, to, target in targets:
    need = max(0, target - balance(to))
    for s in pool:
        if need == 0:
            break
        free = s["spendable"] - keep - sum(a for src, _, _, a in plan if src is s)
        if free <= 0:
            continue
        amt = min(free, need)
        plan.append((s, label, to, amt))
        need -= amt
print("== plan")
for s, label, to, amt in plan:
    print(f"  {s['name']} -> {label} {ppl(amt)}")
if not plan:
    print("  nothing to send")

# 4. Gas price: 2x the EVM gas price (base fee + tip), unless overridden.
if E["GAS_PRICE_APPL"]:
    gas_price = int(E["GAS_PRICE_APPL"])
else:
    try:
        gas_price = max(1, 2 * int(evm("eth_gasPrice", []), 16))
    except Exception as e:
        sys.exit(f"cannot read eth_gasPrice from {EVM} ({e}); set GAS_PRICE_APPL")

def wait_tx(txhash):
    for _ in range(30):
        r = run(["q", "tx", txhash, "--node", NODE, "-o", "json"], check=False)
        if r.returncode == 0:
            return json.loads(r.stdout)
        time.sleep(2)
    return None

failed = False
if plan and not DRY:
    print(f"== sending (gas price {gas_price} appl)")
    for s, label, to, amt in plan:
        r = run(["tx", "bank", "send", s["name"], to, f"{amt}appl",
                 "--keyring-backend", "test", "--home", s["home"], "--chain-id", CHAIN_ID, "--node", NODE,
                 "--gas", "auto", "--gas-adjustment", "1.5", "--gas-prices", f"{gas_price}appl",
                 "--broadcast-mode", "sync", "-y", "-o", "json"], check=False)
        try:
            out = json.loads(r.stdout)
        except (json.JSONDecodeError, TypeError):
            out = {}
        if r.returncode != 0 or out.get("code", 1) != 0:
            failed = True
            print(f"  FAIL {s['name']} -> {label}: {(out.get('raw_log') or r.stderr or r.stdout).strip()[-300:]}")
            continue
        res = wait_tx(out["txhash"])
        ok = res is not None and res.get("code", 1) == 0
        failed |= not ok
        print(f"  {'OK  ' if ok else 'FAIL'} {s['name']} -> {label} {ppl(amt)} tx={out['txhash']} height={res.get('height') if res else '?'}")
elif DRY:
    print("== DRY_RUN=1: no transactions sent")

time.sleep(0 if DRY else 3)
show("after", deployer, faucet)

dep_bal, fct_bal = balance(deployer), balance(faucet)
seed_min = int(E["SEED_MIN_PPL"]) * ONE
print(f"deployer {'OK' if dep_bal >= seed_min else 'BELOW'} seed minimum {ppl(seed_min)}")
short = sum(max(0, t - balance(a)) for _, a, t in targets)
if failed:
    sys.exit(1)
if short and not DRY:
    print(f"SHORTFALL {ppl(short)}: keyed test accounts do not hold enough spendable PPL.")
    print("The genesis buckets above have no signer. Options (founder decision; not done by this script):")
    print("  a) upgrade handler that moves a fixed testnet amount from people_treasury (coordinated binary upgrade)")
    print("  b) genesis reset with deployer/faucet funded (RESET_TESTNET.md, destructive)")
    print("  c) lower seed spend for this run: SEED_MAX_CURVE_SPEND_PPL / SEED_FALLBACK_POOL_PPL in seed-97401.mjs")
    sys.exit(2)
print("DONE")
PY
