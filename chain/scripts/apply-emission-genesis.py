#!/usr/bin/env python3
"""Apply owner-approved PPL emission genesis (1B supply, mint 0, vesting, Model A params)."""
from __future__ import annotations

import base64
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOCATION_PATH = ROOT / "emission" / "allocation.json"
DENOM = "appl"
DISPLAY = "PPL"
SECONDS_PER_YEAR = 31_536_000
SECONDS_PER_MONTH = SECONDS_PER_YEAR // 12


def load_allocation() -> dict:
    return json.loads(ALLOCATION_PATH.read_text())


def merge_coins(coins: list[dict]) -> list[dict]:
    totals: dict[str, int] = {}
    for coin in coins:
        totals[coin["denom"]] = totals.get(coin["denom"], 0) + int(coin["amount"])
    return [{"denom": d, "amount": str(totals[d])} for d in sorted(totals)]


def parse_genesis_time(genesis: dict) -> int:
    raw = genesis.get("genesis_time")
    if not raw:
        return int(datetime.now(timezone.utc).timestamp())
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    return int(datetime.fromisoformat(raw).timestamp())


def account_fields(address: str, account_number: int) -> dict:
    return {
        "address": address,
        "pub_key": None,
        "account_number": str(account_number),
        "sequence": "0",
    }


def base_account(address: str, account_number: int) -> dict:
    return {
        "@type": "/cosmos.auth.v1beta1.BaseAccount",
        **account_fields(address, account_number),
    }


def module_account(name: str, address: str, account_number: int, permissions: list[str] | None = None) -> dict:
    # Nested base_account must not include @type (auth module Any unpack).
    return {
        "@type": "/cosmos.auth.v1beta1.ModuleAccount",
        "base_account": {
            "address": address,
            "pub_key": None,
            "account_number": str(account_number),
            "sequence": "0",
        },
        "name": name,
        "permissions": permissions or [],
    }


def periodic_vesting_account(
    address: str,
    account_number: int,
    total_appl: str,
    start_time: int,
    periods: list[tuple[int, str]],
) -> dict:
    vesting_periods = [
        {"length": str(length), "amount": [{"denom": DENOM, "amount": amount}]}
        for length, amount in periods
    ]
    end_time = start_time + sum(length for length, _ in periods)
    return {
        "@type": "/cosmos.vesting.v1beta1.PeriodicVestingAccount",
        "base_vesting_account": {
            "base_account": account_fields(address, account_number),
            "original_vesting": [{"denom": DENOM, "amount": total_appl}],
            "delegated_free": [],
            "delegated_vesting": [],
            "end_time": str(end_time),
        },
        "start_time": str(start_time),
        "vesting_periods": vesting_periods,
    }


def continuous_vesting_account(
    address: str, account_number: int, total_appl: str, start_time: int, end_time: int
) -> dict:
    return {
        "@type": "/cosmos.vesting.v1beta1.ContinuousVestingAccount",
        "base_vesting_account": {
            "base_account": account_fields(address, account_number),
            "original_vesting": [{"denom": DENOM, "amount": total_appl}],
            "delegated_free": [],
            "delegated_vesting": [],
            "end_time": str(end_time),
        },
        "start_time": str(start_time),
    }


def multisig_pubkey_account(
    address: str,
    account_number: int,
    pubkeys_hex: list[str],
    threshold: int,
    key_type: str = "/cosmos.crypto.secp256k1.PubKey",
) -> dict:
    """M11-2: a BaseAccount whose pub_key is already known (a 2-of-3 LegacyAminoPubKey), so the
    treasury/liquidity multisig is spendable from genesis without waiting on a first signature."""
    return {
        "@type": "/cosmos.auth.v1beta1.BaseAccount",
        "address": address,
        "pub_key": {
            "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey",
            "threshold": threshold,
            "public_keys": [
                {
                    "@type": key_type,
                    "key": base64.b64encode(bytes.fromhex(hexkey)).decode(),
                }
                for hexkey in pubkeys_hex
            ],
        },
        "account_number": str(account_number),
        "sequence": "0",
    }


def account_address(acc: dict) -> str | None:
    return (acc.get("base_account") or acc).get("address") or acc.get("address")


def validator_funding_addresses(genesis: dict) -> set[str]:
    """All genesis accounts from testnet init (gentx signers + dev accounts)."""
    addrs: set[str] = set()
    for acc in genesis["app_state"]["auth"]["accounts"]:
        addr = account_address(acc)
        if addr:
            addrs.add(addr)
    return addrs


def is_already_patched(data: dict, cfg: dict) -> bool:
    """CHAIN-M2: detect a genesis this script already ran against, so a second run doesn't
    duplicate validator_reserve_appl balances and desync bank.supply. `app_state.peoplefees` and
    the treasury multisig balance only ever get written by this function."""
    app = data.get("app_state", {})
    if app.get("peoplefees"):
        return True
    multisig_addr = cfg["treasury_multisig"]["address"]
    return any(bal.get("address") == multisig_addr for bal in app.get("bank", {}).get("balances", []))


def apply_emission(path: Path, cfg: dict) -> None:
    data = json.loads(path.read_text())
    app = data["app_state"]

    if is_already_patched(data, cfg):
        print(f"{path}: genesis already patched, refusing to patch again", file=sys.stderr)
        sys.exit(1)

    start_time = parse_genesis_time(data)

    validator_funding = validator_funding_addresses(data)
    reserve = int(cfg["validator_reserve_appl"])
    operator_liquid_total = reserve * len(validator_funding)

    buckets = cfg["buckets"]
    total_supply = int(cfg["total_supply_appl"])

    # --- mint: zero inflation years 1–4 (gov can raise later via mint params) ---
    mint = app.setdefault("mint", {})
    mint_params = mint.setdefault("params", {})
    mint_params.update(
        {
            "mint_denom": DENOM,
            "goal_bonded": mint_params.get("goal_bonded", "0.670000000000000000"),
            "blocks_per_year": mint_params.get("blocks_per_year", "6311520"),
        }
    )
    for key in ("inflation_min", "inflation_max", "inflation_rate_change"):
        mint_params[key] = cfg["mint"][key]
    mint["minter"] = {
        "inflation": cfg["mint"]["inflation"],
        "annual_provisions": "0.000000000000000000",
    }

    # --- distribution params (Model A community tax; fees routed in peoplefees) ---
    distr = app.setdefault("distribution", {})
    distr.setdefault("params", {}).update(
        {
            k: v
            for k, v in cfg["distribution"].items()
            if k in ("community_tax", "base_proposer_reward", "bonus_proposer_reward", "withdraw_addr_enabled")
        }
    )

    # --- peoplefees genesis params (documentation + future module wiring) ---
    app["peoplefees"] = {
        "params": {
            "fee_split_bps": cfg["fee_split_bps"],
            "denom": DENOM,
        }
    }

    # --- staking bond denom ---
    app["staking"]["params"]["bond_denom"] = DENOM
    app["evm"]["params"]["evm_denom"] = DENOM

    # `peopled testnet init-files` builds genesis via the SDK's basic-manager default genesis,
    # which leaves x/vm's ActiveStaticPrecompiles empty (it's only pre-populated by evmd's
    # app-level DefaultGenesis(), which that CLI path does not call). Without this, the
    # staking/distribution precompiles at 0x...800/0x...801 exist in code but eth_call against
    # them returns no data, so the website staking page cannot delegate/claim.
    app["evm"]["params"]["active_static_precompiles"] = [
        "0x0000000000000000000000000000000000000100",  # p256
        "0x0000000000000000000000000000000000000400",  # bech32
        "0x0000000000000000000000000000000000000800",  # staking
        "0x0000000000000000000000000000000000000801",  # distribution
        "0x0000000000000000000000000000000000000802",  # ics20
        "0x0000000000000000000000000000000000000803",  # vesting
        "0x0000000000000000000000000000000000000804",  # bank
        "0x0000000000000000000000000000000000000805",  # gov
        "0x0000000000000000000000000000000000000806",  # slashing
    ]

    # --- gov deposits ---
    gov = app.get("gov") or {}
    for dep in (gov.get("deposit_params") or {}).get("min_deposit", []) or []:
        dep["denom"] = DENOM
    for dep in (gov.get("params") or {}).get("min_deposit", []) or []:
        dep["denom"] = DENOM
    for dep in (gov.get("params") or {}).get("expedited_min_deposit", []) or []:
        dep["denom"] = DENOM

    # --- build auth accounts + bank balances ---
    existing_accounts = app["auth"]["accounts"]
    existing_addrs = {a for a in (account_address(x) for x in existing_accounts) if a}

    new_accounts: list[dict] = [deepcopy(a) for a in existing_accounts]
    balances: list[dict] = []

    next_num = len(existing_accounts)

    def add_balance(address: str, amount: str) -> None:
        balances.append({"address": address, "coins": [{"denom": DENOM, "amount": amount}]})

    # people_growth never receives anything from height 1 onward (M11-2 routes fees straight to
    # the multisig) — this module account only exists so an existing pre-M11-2 network's upgrade
    # handler has somewhere to sweep from; a fresh genesis still creates it at a zero balance for
    # that documentation purpose, matching people_treasury/people_liquidity's prior behaviour.
    GROWTH_MODULE = cfg["fee_sink_modules"]["growth"]
    GROWTH_ADDR = "people1wnw7865hmkjyghnymknyqy3xz962cnt5qtcmds"

    module_rows: list[tuple[str, str]] = [
        (buckets["sale"]["module_name"], buckets["sale"]["account"]),
        (GROWTH_MODULE, GROWTH_ADDR),
    ]

    for name, addr in module_rows:
        if addr not in existing_addrs:
            new_accounts.append(module_account(name, addr, next_num))
            next_num += 1
            existing_addrs.add(addr)

    # M11-2 (owner-approved): treasury + liquidity share one 2-of-3 multisig BaseAccount,
    # spendable from genesis since its pub_key (not just address) is already known.
    multisig_cfg = cfg["treasury_multisig"]
    multisig_addr = multisig_cfg["address"]
    multisig_total = int(buckets["treasury"]["amount_appl"]) + int(buckets["liquidity"]["amount_appl"])
    if multisig_addr not in existing_addrs:
        new_accounts.append(
            multisig_pubkey_account(
                multisig_addr,
                next_num,
                multisig_cfg["public_keys_secp256k1_hex"],
                multisig_cfg["threshold"],
                multisig_cfg.get("public_key_type", "/cosmos.crypto.secp256k1.PubKey"),
            )
        )
        next_num += 1
        existing_addrs.add(multisig_addr)
    add_balance(multisig_addr, str(multisig_total))

    # M11-2 (owner-approved): team vesting — 10% unlocked at genesis, 90% linear over 24 months.
    team = buckets["team"]
    team_total = int(team["amount_appl"])
    team_cliff_pct = int(team.get("vesting_cliff_pct", 0))
    team_months = int(team.get("vesting_linear_months", 0))
    team_locked = team_total * (100 - team_cliff_pct) // 100
    team_end = start_time + team_months * SECONDS_PER_MONTH
    if team["account"] not in existing_addrs:
        new_accounts.append(
            continuous_vesting_account(team["account"], next_num, str(team_locked), start_time, team_end)
        )
        next_num += 1
        existing_addrs.add(team["account"])
    add_balance(team["account"], str(team_total))

    # Liquid testnet accounts (faucet, deployers) carved out of the community bucket so the
    # total supply stays fixed (testnet genesis v2; see allocation.json genesis_extra_accounts).
    extra_total = 0
    for extra in (cfg.get("genesis_extra_accounts") or {}).get("accounts", []):
        addr = extra["address"]
        if addr not in existing_addrs:
            new_accounts.append(base_account(addr, next_num))
            next_num += 1
            existing_addrs.add(addr)
        add_balance(addr, extra["amount_appl"])
        extra_total += int(extra["amount_appl"])

    # community continuous vesting (6y)
    comm = buckets["community"]
    comm_amount = str(int(comm["amount_appl"]) - operator_liquid_total - extra_total)
    comm_end = start_time + int(comm["vesting_years"]) * SECONDS_PER_YEAR
    if comm["account"] not in existing_addrs:
        new_accounts.append(
            continuous_vesting_account(
                comm["account"], next_num, comm_amount, start_time, comm_end
            )
        )
        next_num += 1
        existing_addrs.add(comm["account"])
    add_balance(comm["account"], comm_amount)

    # M11-2 (owner-approved): validator pool 60/50/50/40M PPL over years 1-4, laid out as daily
    # (not yearly-cliff) PeriodicVestingAccount periods. StreamValidatorPool (peoplefees) drains
    # whatever has natively unlocked each block to signing validators, so daily periods are the
    # Cosmos-SDK-native approximation of "streamed per block" (SECONDS_PER_YEAR divides evenly
    # into 365 whole days; any per-day rounding remainder is folded into that year's last day).
    val = buckets["validators"]
    annual = cfg["validator_vesting_annual_ppl"]
    DAYS_PER_YEAR = 365
    SECONDS_PER_DAY = SECONDS_PER_YEAR // DAYS_PER_YEAR
    periods: list[tuple[int, str]] = []
    for ppl_amount in annual:
        appl_amount = ppl_amount * 10**18
        per_day = appl_amount // DAYS_PER_YEAR
        remainder = appl_amount - per_day * DAYS_PER_YEAR
        for day in range(DAYS_PER_YEAR):
            amount = per_day + remainder if day == DAYS_PER_YEAR - 1 else per_day
            periods.append((SECONDS_PER_DAY, str(amount)))
    if val["account"] not in existing_addrs:
        new_accounts.append(
            periodic_vesting_account(
                val["account"], next_num, val["amount_appl"], start_time, periods
            )
        )
        next_num += 1
        existing_addrs.add(val["account"])
    add_balance(val["account"], val["amount_appl"])

    # sale module balance (growth fee sink starts at 0; treasury/liquidity/team handled above)
    add_balance(buckets["sale"]["account"], buckets["sale"]["amount_appl"])

    # gentx signers / validator operators (liquid stake + fees)
    for addr in sorted(validator_funding):
        add_balance(addr, str(reserve))

    app["auth"]["accounts"] = new_accounts
    app["bank"]["balances"] = balances
    app["bank"]["supply"] = [{"denom": DENOM, "amount": str(total_supply)}]

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


def patch(path: Path) -> None:
    cfg = load_allocation()
    apply_emission(path, cfg)


def main() -> None:
    if not ALLOCATION_PATH.is_file():
        print(f"Missing {ALLOCATION_PATH}", file=sys.stderr)
        sys.exit(1)
    for arg in sys.argv[1:]:
        patch(Path(arg))


if __name__ == "__main__":
    main()
