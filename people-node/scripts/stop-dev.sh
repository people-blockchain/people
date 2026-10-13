#!/usr/bin/env bash
set -euo pipefail

PORTS=(3000 3001 4001 4002 4011 4012)

echo "Stopping OVN dev processes on ports: ${PORTS[*]}"
for port in "${PORTS[@]}"; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "Killing PIDs on :$port -> $pids"
    kill $pids 2>/dev/null || true
  fi
done

pkill -f "tsx src/index.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

sleep 1
echo "Done. Remaining listeners:"
lsof -iTCP:3000,3001,4001,4002 -sTCP:LISTEN 2>/dev/null || echo "(none)"
