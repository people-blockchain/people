#!/usr/bin/env python3
"""Patch cosmos/evm testnet genesis metadata for People's chain (does not alter signed gentxs)."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

DENOM = "appl"
DISPLAY = "PPL"


def merge_coins(coins: list[dict]) -> list[dict]:
    totals: dict[str, int] = defaultdict(int)
    for coin in coins:
        totals[coin["denom"]] += int(coin["amount"])
    return [{"denom": d, "amount": str(totals[d])} for d in sorted(totals)]


def patch(path: Path) -> None:
    data = json.loads(path.read_text())
    app = data["app_state"]

    app["staking"]["params"]["bond_denom"] = DENOM
    app["mint"]["params"]["mint_denom"] = DENOM
    app["evm"]["params"]["evm_denom"] = DENOM

    gov = app.get("gov") or {}
    deposit_params = gov.get("deposit_params") or {}
    params = gov.get("params") or {}
    for dep in deposit_params.get("min_deposit", []) or []:
        dep["denom"] = DENOM
    for dep in params.get("min_deposit", []) or []:
        dep["denom"] = DENOM
    for dep in params.get("expedited_min_deposit", []) or []:
        dep["denom"] = DENOM

    balances = app["bank"]["balances"]
    for bal in balances:
        bal["coins"] = merge_coins(bal["coins"])

    supply: dict[str, int] = defaultdict(int)
    for bal in balances:
        for coin in bal["coins"]:
            supply[coin["denom"]] += int(coin["amount"])
    app["bank"]["supply"] = [{"denom": d, "amount": str(supply[d])} for d in sorted(supply)]

    app["bank"]["denom_metadata"] = [
        {
            "description": "People native staking and gas token.",
            "denom_units": [
                {"denom": DENOM, "exponent": 0, "aliases": ["aPPL"]},
                {"denom": DISPLAY, "exponent": 18, "aliases": []},
            ],
            "base": DENOM,
            "display": DISPLAY,
            "name": "People",
            "symbol": "PPL",
            "uri": "",
            "uri_hash": "",
        }
    ]

    app["erc20"]["token_pairs"] = [
        {
            "contract_owner": 1,
            "erc20_address": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            "denom": DENOM,
            "enabled": True,
        }
    ]
    app["erc20"]["native_precompiles"] = ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"]

    path.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    for arg in sys.argv[1:]:
        patch(Path(arg))


if __name__ == "__main__":
    main()
