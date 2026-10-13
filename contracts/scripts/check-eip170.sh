#!/usr/bin/env bash
# Fail if any production contract runtime exceeds EIP-170 (24576 bytes).
set -euo pipefail
export PATH="$PATH:${HOME}/.foundry/bin"
cd "$(dirname "$0")/.."
forge build --sizes --no-cache >/tmp/forge-sizes.txt 2>&1
python3 <<'PY'
import re, sys
limit = 24576
bad = []
for line in open("/tmp/forge-sizes.txt"):
    m = re.match(r"\| ([^|]+) \| ([0-9,]+)", line)
    if not m:
        continue
    name = m.group(1).strip()
    if name in ("Contract", "test/", "script/", "Deploy", "Std") or name.startswith("Mock"):
        continue
    if "Test" in name or name.endswith(".t.sol"):
        continue
    runtime = int(m.group(2).replace(",", ""))
    if runtime > limit:
        bad.append((name, runtime))
if bad:
    for n, s in bad:
        print(f"EIP-170 violation: {n} runtime={s} > {limit}")
    sys.exit(1)
print("EIP-170 check OK (all src contracts <= 24576 bytes runtime)")
PY
