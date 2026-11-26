#!/usr/bin/env bash
# Enable JSON-RPC / REST / gRPC for validator nodes (Docker and bare-metal).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.testnets}"
# Default 0.0.0.0 keeps docker-compose published ports working. Set 127.0.0.1 on
# bare-metal hosts that must not expose JSON-RPC on the LAN.
JSON_RPC_BIND_HOST="${JSON_RPC_BIND_HOST:-0.0.0.0}"

shopt -s nullglob
for app_toml in "$OUT"/node*/peopled/config/app.toml; do
  python3 - "$app_toml" "$JSON_RPC_BIND_HOST" <<'PYEOF'
import re, sys
path, bind_host = sys.argv[1], sys.argv[2]
text = open(path).read()
lines = text.splitlines(keepends=True)
section = ""
out = []
for line in lines:
    stripped = line.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        section = stripped[1:-1]
    elif section in ("api", "json-rpc") and re.match(r"^enable\s*=\s*false\b", stripped):
        line = re.sub(r"enable\s*=\s*false", "enable = true", line, count=1)
    elif section == "json-rpc":
        if re.match(r'^address\s*=\s*"127\.0\.0\.1:8545"', stripped):
            line = re.sub(r'"127\.0\.0\.1:8545"', f'"{bind_host}:8545"', line, count=1)
        elif re.match(r'^ws-address\s*=\s*"127\.0\.0\.1:8546"', stripped) or re.match(r'^address\s*=\s*"127\.0\.0\.1:8546"', stripped):
            line = re.sub(r'"127\.0\.0\.1:8546"', f'"{bind_host}:8546"', line, count=1)
    elif section == "" and re.match(r'^minimum-gas-prices\s*=\s*".*"', stripped):
        line = re.sub(r'minimum-gas-prices\s*=\s*".*"', 'minimum-gas-prices = "0.0001appl"', line, count=1)
    out.append(line)
open(path, "w").write("".join(out))
PYEOF
done

for cfg in "$OUT"/node*/peopled/config/config.toml; do
  sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/g' "$cfg"
  sed -i 's/prometheus = false/prometheus = true/g' "$cfg"
done

for client in "$OUT"/node*/peopled/config/client.toml; do
  sed -i 's/^chain-id = ""/chain-id = "people_97401-1"/' "$client"
done

echo "Patched node config under $OUT"
