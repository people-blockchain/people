#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.testnets}"

shopt -s nullglob
files=("$OUT"/node*/peopled/config/genesis.json)
if ((${#files[@]} == 0)); then
  echo "No genesis files under $OUT"
  exit 1
fi

python3 "$ROOT/scripts/apply-emission-genesis.py" "${files[@]}"
echo "Patched genesis under $OUT"

python3 "$ROOT/scripts/validate-emission-genesis.py" "${files[@]}"
