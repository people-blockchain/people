#!/usr/bin/env python3
"""Mainnet consensus parameters for a fresh people_97400-1 genesis (pre-allocation step).

Values are conservative defaults for a small validator set run on separate hosts; every one can
later be changed by an x/gov parameter proposal. The 1B PPL allocation itself is applied
afterwards by apply-emission-genesis.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DENOM = "appl"
PPL = 10**18
DAY = 24 * 3600


def dur(seconds: int) -> str:
    return f"{seconds}s"


def main() -> None:
    path = Path(sys.argv[1])
    genesis_time = sys.argv[2]
    g = json.loads(path.read_text())
    if g.get("chain_id") != "people_97400-1":
        sys.exit(f"{path}: chain_id must be people_97400-1, got {g.get('chain_id')}")
    g["genesis_time"] = genesis_time
    g["initial_height"] = 1
    app = g["app_state"]

    staking = app["staking"]["params"]
    staking.update({
        "bond_denom": DENOM,
        "unbonding_time": dur(21 * DAY),
        "max_validators": 100,
        "max_entries": 7,
        "historical_entries": 10000,
        "min_commission_rate": "0.050000000000000000",
    })

    slashing = app["slashing"]["params"]
    slashing.update({
        "signed_blocks_window": "10000",
        "min_signed_per_window": "0.050000000000000000",
        "downtime_jail_duration": dur(600),
        "slash_fraction_double_sign": "0.050000000000000000",
        "slash_fraction_downtime": "0.000100000000000000",
    })

    gov = app["gov"]["params"]
    gov.update({
        "min_deposit": [{"denom": DENOM, "amount": str(10_000 * PPL)}],
        "expedited_min_deposit": [{"denom": DENOM, "amount": str(50_000 * PPL)}],
        "max_deposit_period": dur(7 * DAY),
        "voting_period": dur(3 * DAY),
        "expedited_voting_period": dur(1 * DAY),
        "quorum": "0.334000000000000000",
        "threshold": "0.500000000000000000",
        "veto_threshold": "0.334000000000000000",
        "min_initial_deposit_ratio": "0.250000000000000000",
        "burn_vote_veto": False,
        "burn_proposal_deposit_prevote": False,
        "burn_vote_quorum": False,
    })

    app["mint"]["params"]["mint_denom"] = DENOM
    app["evm"]["params"]["evm_denom"] = DENOM
    app["crisis"] = app.get("crisis") or {}
    if "constant_fee" in app["crisis"]:
        app["crisis"]["constant_fee"] = {"denom": DENOM, "amount": str(1_000 * PPL)}

    consensus = g.setdefault("consensus", {}).setdefault("params", {})
    block = consensus.setdefault("block", {})
    block.update({"max_bytes": "4194304", "max_gas": "40000000"})
    evidence = consensus.setdefault("evidence", {})
    # CometBFT encodes this duration as nanoseconds in a string, unlike the SDK's "Ns" form.
    evidence.update({"max_age_num_blocks": "1000000", "max_age_duration": str(21 * DAY * 10**9), "max_bytes": "1048576"})

    path.write_text(json.dumps(g, indent=2) + "\n")


if __name__ == "__main__":
    main()
