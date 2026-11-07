#!/usr/bin/env python3
"""Apply owner-approved PPL emission genesis (1B supply, mint 0, vesting, Model A params)."""
from __future__ import annotations

import base64
import json
import os
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def allocation_path() -> Path:
    """PEOPLE_ALLOCATION selects the allocation file (default: testnet emission/allocation.json;
    mainnet uses emission/allocation-mainnet.json). Relative paths resolve against chain/."""
    raw = os.environ.get("PEOPLE_ALLOCATION", "emission/allocation.json")
    path = Path(raw)
    return path if path.is_absolute() else ROOT / path


ALLOCATION_PATH = allocation_path()
MAINNET_CHAIN_ID = "people_97400-1"
# Testnet signer keys (they sit in the testnet VPS keyring). A mainnet genesis must never use them.
TESTNET_MULTISIG_PUBKEYS = {
    "0211f37d541a43e7c6afbfd00e163130563719d817522db5218cc95318e608304b",
    "034388487f8f6e1f66eca64cb0ec1f9ef5755d2816d9ed8d22cd5da756e00e6e6f",
    "02895b4bc696fc47b4133e1cf389cc625dc963ecd0258366799223f2307f38cbe9",
}
DENOM = "appl"
DISPLAY = "PPL"
SECONDS_PER_YEAR = 31_536_000
SECONDS_PER_MONTH = SECONDS_PER_YEAR // 12


def load_allocation() -> dict:
    return json.loads(ALLOCATION_PATH.read_text())


def mainnet_blockers(cfg: dict) -> list[str]:
    """Everything that must be real before a mainnet genesis exists. Empty list = ready.
    Applies only to an allocation whose chain_id is mainnet; testnet allocations return []."""
    if cfg.get("chain_id") != MAINNET_CHAIN_ID:
        return []
    errors: list[str] = []
    ms = cfg["treasury_multisig"]
    keys = [k.lower() for k in ms.get("public_keys_secp256k1_hex", [])]
    if ms.get("placeholder"):
        errors.append("treasury_multisig.placeholder is true")
    if not ms.get("address", "").startswith("people1"):
        errors.append("treasury_multisig.address is not set")
    if len(keys) != 3 or len(set(keys)) != 3:
        errors.append("treasury_multisig needs exactly 3 distinct public keys")
    if ms.get("threshold") != 2:
        errors.append("treasury_multisig.threshold must be 2")
    for k in keys:
        if len(k) != 66 or k[:2] not in ("02", "03") or any(c not in "0123456789abcdef" for c in k):
            errors.append(f"treasury_multisig key {k[:12]}... is not a 33-byte compressed secp256k1 key")
    if TESTNET_MULTISIG_PUBKEYS & set(keys):
        errors.append("treasury_multisig reuses a testnet signer key")
    if ms.get("public_key_type") != "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey":
        errors.append("treasury_multisig.public_key_type must be ethsecp256k1")
    for name, bucket in cfg["buckets"].items():
        if bucket.get("owner_placeholder"):
            errors.append(f"bucket {name}: owner_placeholder is still true")
        if not str(bucket.get("account", "")).startswith("people1"):
            errors.append(f"bucket {name}: account is not set")
        if bucket.get("account_kind", "").startswith("multisig") and bucket.get("account") != ms.get("address"):
            errors.append(f"bucket {name}: multisig bucket must use treasury_multisig.address")
    if ms.get("address") and cfg["buckets"]["team"].get("account") == ms.get("address"):
        errors.append("team bucket must not share the treasury multisig")
    if (cfg.get("genesis_extra_accounts") or {}).get("accounts"):
        errors.append("mainnet must not carry genesis_extra_accounts (faucet/deployers)")
    return errors


def check_chain_matches(genesis: dict, cfg: dict) -> list[str]:
    """A testnet allocation (faucet, test keys) must never build a mainnet genesis, and the
    mainnet allocation must never build a genesis for another chain."""
    gid = genesis.get("chain_id")
    want = cfg.get("chain_id")
    if (gid == MAINNET_CHAIN_ID or want == MAINNET_CHAIN_ID) and gid != want:
        return [f"genesis chain_id {gid!r} does not match allocation chain_id {want!r}"]
    return []


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


def multisig_pubkey(pubkeys_hex: list[str], threshold: int, key_type: str) -> dict:
    return {
        "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey",
        "threshold": threshold,
        "public_keys": [
            {
                "@type": key_type,
                "key": base64.b64encode(bytes.fromhex(hexkey)).decode(),
            }
            for hexkey in pubkeys_hex
        ],
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
        "pub_key": multisig_pubkey(pubkeys_hex, threshold, key_type),
        "account_number": str(account_number),
        "sequence": "0",
    }


def multisig_vesting_account(
    address: str,
    account_number: int,
    pubkeys_hex: list[str],
    threshold: int,
    key_type: str,
    locked_appl: str,
    start_time: int,
    end_time: int,
) -> dict:
    """A11: the treasury multisig as a ContinuousVestingAccount with its 2-of-3 pub_key already
    known. Only `locked_appl` (the treasury bucket) vests; anything else on the account (the
    liquidity bucket, later fee income) is spendable at once."""
    acc = continuous_vesting_account(address, account_number, locked_appl, start_time, end_time)
    acc["base_vesting_account"]["base_account"]["pub_key"] = multisig_pubkey(pubkeys_hex, threshold, key_type)
    return acc


def cliff_linear_schedule(bucket: dict, genesis_time: int) -> tuple[int, int, int]:
    """A11 (owner decision): (locked_appl, start_time, end_time) for a ContinuousVestingAccount.
    `vesting_upfront_pct` is spendable at genesis; the rest vests linearly from
    genesis + `vesting_cliff_months` over `vesting_linear_months`. The SDK vests nothing until
    start_time, so start_time = end of the cliff and nothing is spendable before it."""
    total = int(bucket["amount_appl"])
    upfront_pct = int(bucket["vesting_upfront_pct"])
    if not 0 <= upfront_pct <= 100:
        raise ValueError(f"{bucket['id']}: vesting_upfront_pct out of range")
    linear_months = int(bucket["vesting_linear_months"])
    if linear_months <= 0:
        raise ValueError(f"{bucket['id']}: vesting_linear_months must be positive")
    locked = total * (100 - upfront_pct) // 100
    start = genesis_time + int(bucket["vesting_cliff_months"]) * SECONDS_PER_MONTH
    return locked, start, start + linear_months * SECONDS_PER_MONTH


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

    refusals = check_chain_matches(data, cfg) + mainnet_blockers(cfg)
    if refusals:
        print(f"{path}: refusing to build this genesis:", file=sys.stderr)
        for r in refusals:
            print(f"  - {r}", file=sys.stderr)
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

    # Testnet: the sale bucket is the keyless people_sale module account. Mainnet: it sits on
    # the 2-of-3 treasury multisig, spendable, so the multisig can fund PplSaleDistributor.
    sale_on_multisig = buckets["sale"].get("account_kind") == "multisig_2of3"
    module_rows: list[tuple[str, str]] = [(GROWTH_MODULE, GROWTH_ADDR)]
    if not sale_on_multisig:
        module_rows.insert(0, (buckets["sale"]["module_name"], buckets["sale"]["account"]))

    for name, addr in module_rows:
        if addr not in existing_addrs:
            new_accounts.append(module_account(name, addr, next_num))
            next_num += 1
            existing_addrs.add(addr)

    # M11-2: treasury + liquidity share one 2-of-3 multisig account whose pub_key (not just
    # address) is known at genesis. A11 (owner decision): it is a ContinuousVestingAccount locking
    # only the treasury bucket (0% at genesis, 6-month cliff, 18 months linear); the liquidity
    # bucket on the same address stays spendable from genesis (TODO(owner): liquidity schedule).
    multisig_cfg = cfg["treasury_multisig"]
    multisig_addr = multisig_cfg["address"]
    treasury = buckets["treasury"]
    multisig_total = int(treasury["amount_appl"]) + int(buckets["liquidity"]["amount_appl"])
    if sale_on_multisig:
        multisig_total += int(buckets["sale"]["amount_appl"])
    treasury_locked, treasury_start, treasury_end = cliff_linear_schedule(treasury, start_time)
    if multisig_addr not in existing_addrs:
        new_accounts.append(
            multisig_vesting_account(
                multisig_addr,
                next_num,
                multisig_cfg["public_keys_secp256k1_hex"],
                multisig_cfg["threshold"],
                multisig_cfg.get("public_key_type", "/cosmos.crypto.secp256k1.PubKey"),
                str(treasury_locked),
                treasury_start,
                treasury_end,
            )
        )
        next_num += 1
        existing_addrs.add(multisig_addr)
    add_balance(multisig_addr, str(multisig_total))

    # A11 (owner decision): team vesting — 0% at genesis, 6-month cliff, then 18 months linear.
    team = buckets["team"]
    team_total = int(team["amount_appl"])
    team_locked, team_start, team_end = cliff_linear_schedule(team, start_time)
    if team["account"] not in existing_addrs:
        new_accounts.append(
            continuous_vesting_account(team["account"], next_num, str(team_locked), team_start, team_end)
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
    if not sale_on_multisig:
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
