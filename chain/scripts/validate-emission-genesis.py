#!/usr/bin/env python3
"""Validate genesis.json against chain/emission/allocation.json."""
from __future__ import annotations

import base64
import importlib.util
import json
import os
import re
import sys
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEESPLIT_GO = ROOT / "overrides" / "evmd" / "peoplefees" / "feesplit.go"
MULTISIG_TEST_GO = ROOT / "overrides" / "evmd" / "peoplefees" / "treasury_multisig_test.go"
# Same PEOPLE_ALLOCATION switch and mainnet rules as apply-emission-genesis.py (one source).
_spec = importlib.util.spec_from_file_location("apply_emission_genesis", Path(__file__).with_name("apply-emission-genesis.py"))
_apply = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_apply)
ALLOCATION_PATH = _apply.ALLOCATION_PATH
ALLOCATION = json.loads(ALLOCATION_PATH.read_text())
IS_MAINNET = ALLOCATION.get("chain_id") == _apply.MAINNET_CHAIN_ID
DENOM = ALLOCATION["denom"]
TOTAL = int(ALLOCATION["total_supply_appl"])
BPS = ALLOCATION["fee_split_bps"]
VALIDATOR_ANNUAL = ALLOCATION["validator_vesting_annual_ppl"]
VALIDATOR_ADDR = ALLOCATION["buckets"]["validators"]["account"]
TEAM_BUCKET = ALLOCATION["buckets"]["team"]
TREASURY_BUCKET = ALLOCATION["buckets"]["treasury"]
LIQUIDITY_BUCKET = ALLOCATION["buckets"]["liquidity"]
MULTISIG = ALLOCATION["treasury_multisig"]
SECONDS_PER_YEAR = 31_536_000
SECONDS_PER_MONTH = SECONDS_PER_YEAR // 12
# M11-7: module accounts that may still exist at genesis must never carry Minter/Burner —
# consensus-critical permissions live in Go (GetMaccPerms), but a genesis ModuleAccount's own
# `permissions` field is part of state and must match what the code grants.
NO_MINT_BURN_MODULES = {"people_sale", "people_growth"}


def genesis_unix_time(genesis: dict) -> int:
    raw = genesis["genesis_time"]
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    return int(datetime.fromisoformat(raw).timestamp())


def check_cliff_linear(name: str, acc: dict, bucket: dict, genesis_time: int, errors: list[str]) -> None:
    """A11 (owner decision): `bucket` vests as a ContinuousVestingAccount with
    original_vesting = (100 - vesting_upfront_pct)% of the bucket, start_time = genesis + cliff,
    end_time = start_time + linear months."""
    base_vesting = acc.get("base_vesting_account", {})
    want_locked = int(bucket["amount_appl"]) * (100 - int(bucket["vesting_upfront_pct"])) // 100
    got_locked = int(base_vesting.get("original_vesting", [{}])[0].get("amount", 0))
    if got_locked != want_locked:
        errors.append(f"{name} original_vesting want {want_locked}, got {got_locked}")
    want_start = genesis_time + int(bucket["vesting_cliff_months"]) * SECONDS_PER_MONTH
    got_start = int(acc.get("start_time", 0))
    if got_start != want_start:
        errors.append(f"{name} start_time want genesis+{bucket['vesting_cliff_months']} months ({want_start}), got {got_start}")
    want_end = want_start + int(bucket["vesting_linear_months"]) * SECONDS_PER_MONTH
    got_end = int(base_vesting.get("end_time", 0))
    if got_end != want_end:
        errors.append(f"{name} end_time want cliff+{bucket['vesting_linear_months']} months ({want_end}), got {got_end}")


def load_genesis(path: Path) -> dict:
    return json.loads(path.read_text())


def sum_balances(genesis: dict) -> int:
    total = 0
    for bal in genesis["app_state"]["bank"]["balances"]:
        for coin in bal["coins"]:
            if coin["denom"] == DENOM:
                total += int(coin["amount"])
    return total


def find_validator_vesting(genesis: dict) -> dict | None:
    for acc in genesis["app_state"]["auth"]["accounts"]:
        if acc.get("@type", "").endswith("PeriodicVestingAccount"):
            base = acc.get("base_vesting_account", {}).get("base_account", {})
            if base.get("address") == VALIDATOR_ADDR:
                return acc
    return None


def find_account(genesis: dict, address: str) -> dict | None:
    for acc in genesis["app_state"]["auth"]["accounts"]:
        base = acc.get("base_account") or acc.get("base_vesting_account", {}).get("base_account", {})
        if (base or acc).get("address") == address:
            return acc
    return None


def account_balance(genesis: dict, address: str) -> int:
    for bal in genesis["app_state"]["bank"]["balances"]:
        if bal["address"] == address:
            return sum(int(c["amount"]) for c in bal["coins"] if c["denom"] == DENOM)
    return 0


def cross_check_feesplit_go() -> list[str]:
    """CHAIN-M5 part 2: text-wise cross-check of feesplit.go's Go constants (multisig address,
    validator pool address, Model A bps) against allocation.json — the two files are hand-edited
    independently and nothing else catches them drifting apart (go build does not know about
    allocation.json; this script only checks genesis.json, which is generated *from*
    allocation.json, so a mismatch in feesplit.go itself would otherwise go unnoticed)."""
    errors: list[str] = []
    if not FEESPLIT_GO.is_file():
        return [f"feesplit.go not found at {FEESPLIT_GO}"]
    text = FEESPLIT_GO.read_text()

    def const_str(name: str) -> str | None:
        m = re.search(rf'\b{name}\s*=\s*"([^"]*)"', text)
        return m.group(1) if m else None

    def const_int(name: str) -> int | None:
        m = re.search(rf"\b{name}\s*=\s*(\d+)", text)
        return int(m.group(1)) if m else None

    want_multisig = MULTISIG["address"]
    multisig_const = "MainnetTreasuryMultisigAddress" if IS_MAINNET else "TreasuryMultisigAddress"
    got_multisig = const_str(multisig_const)
    if got_multisig != want_multisig:
        errors.append(f"feesplit.go {multisig_const} want {want_multisig!r}, got {got_multisig!r}")
    if IS_MAINNET:
        if const_str("MainnetChainID") != ALLOCATION["chain_id"]:
            errors.append(f"feesplit.go MainnetChainID want {ALLOCATION['chain_id']}")
        # The Go test derives the address from these keys, so they must be the allocation's keys.
        test_text = MULTISIG_TEST_GO.read_text() if MULTISIG_TEST_GO.is_file() else ""
        m = re.search(r"mainnetTreasuryMultisigPubkeysHex = \[\]string\{([^}]*)\}", test_text)
        got_keys = re.findall(r'"([0-9a-fA-F]+)"', m.group(1)) if m else None
        if got_keys != MULTISIG["public_keys_secp256k1_hex"]:
            errors.append("treasury_multisig_test.go mainnetTreasuryMultisigPubkeysHex does not match allocation-mainnet.json")

    want_validator_addr = VALIDATOR_ADDR
    got_validator_addr = const_str("ValidatorPoolAddress")
    if got_validator_addr != want_validator_addr:
        errors.append(f"feesplit.go ValidatorPoolAddress want {want_validator_addr}, got {got_validator_addr}")

    go_bps_names = {
        "validators": "BPSValidators",
        "community": "BPSCommunity",
        "treasury": "BPSTreasury",
        "liquidity": "BPSLiquidity",
        "growth": "BPSGrowth",
        "burn": "BPSBurn",
    }
    for key, go_name in go_bps_names.items():
        want = BPS[key]
        got = const_int(go_name)
        if got != want:
            errors.append(f"feesplit.go {go_name} want {want}, got {got}")

    return errors


_BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _bech32_polymod(values: list[int]) -> int:
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def rehrp(addr: str, hrp: str) -> str:
    """Re-encode a bech32 address under another prefix (peoplevaloper1... -> people1...)."""
    pos = addr.rfind("1")
    data = [_BECH32.index(c) for c in addr[pos + 1 :]][:-6]
    expand = [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]
    poly = _bech32_polymod(expand + data + [0] * 6) ^ 1
    checksum = [(poly >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(_BECH32[d] for d in data + checksum)


def validate_mainnet(g: dict) -> list[str]:
    """Mainnet-only rules on the built genesis (the allocation itself is checked by
    apply-emission-genesis.mainnet_blockers, re-run here so a hand-edited genesis is caught)."""
    errors = [f"allocation: {e}" for e in _apply.mainnet_blockers(ALLOCATION)]
    errors += _apply.check_chain_matches(g, ALLOCATION)
    app = g["app_state"]
    # The only liquid plain accounts allowed are the genesis validator operators (gentx signers),
    # each holding exactly validator_reserve_appl. No faucet, deployer or well-known dev keys.
    gentx_signers = set()
    for tx in app.get("genutil", {}).get("gen_txs", []):
        for msg in tx.get("body", {}).get("messages", []):
            if msg.get("delegator_address"):
                gentx_signers.add(msg["delegator_address"])
            elif msg.get("validator_address"):
                gentx_signers.add(rehrp(msg["validator_address"], "people"))
    if len(gentx_signers) < 3:
        errors.append(f"mainnet genesis needs at least 3 gentx validators, got {len(gentx_signers)}")
    bucket_addrs = {b["account"] for b in ALLOCATION["buckets"].values()} | {MULTISIG["address"]}
    reserve = int(ALLOCATION["validator_reserve_appl"])
    for acc in app["auth"]["accounts"]:
        if acc.get("@type") != "/cosmos.auth.v1beta1.BaseAccount":
            continue
        addr = acc.get("address")
        if addr in bucket_addrs:
            continue
        bal = account_balance(g, addr)
        if bal and addr not in gentx_signers:
            errors.append(f"liquid account {addr} holds {bal} appl but is not a gentx validator")
        if addr in gentx_signers and bal != reserve:
            errors.append(f"validator operator {addr} balance want {reserve}, got {bal}")
    # Validators sign with their own keys: no account may ship with a private-key-derived
    # pub_key from a known test set, and the sale bucket must sit on the multisig.
    if find_account(g, ALLOCATION["buckets"]["sale"]["account"]) is None:
        errors.append("sale bucket account missing")
    for acc in app["auth"]["accounts"]:
        if acc.get("@type", "").endswith("ModuleAccount") and acc.get("name") == "people_sale":
            errors.append("mainnet must not create the keyless people_sale module account")
    return errors


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    g = load_genesis(path)
    app = g["app_state"]
    if IS_MAINNET or g.get("chain_id") == _apply.MAINNET_CHAIN_ID:
        errors += validate_mainnet(g)

    supply = app["bank"]["supply"]
    if len(supply) != 1 or supply[0]["denom"] != DENOM:
        errors.append("bank.supply must be single appl coin")
    elif int(supply[0]["amount"]) != TOTAL:
        errors.append(f"bank.supply want {TOTAL}, got {supply[0]['amount']}")

    if sum_balances(g) != TOTAL:
        errors.append("sum(bank.balances) != total supply")

    mint = app["mint"]["params"]
    for key in ("inflation_min", "inflation_max", "inflation_rate_change"):
        want = ALLOCATION["mint"][key]
        if mint.get(key) != want:
            errors.append(f"mint.params.{key} want {want}, got {mint.get(key)}")
    minter = app["mint"].get("minter") or {}
    if minter.get("inflation") != ALLOCATION["mint"]["inflation"]:
        errors.append(
            f"mint.minter.inflation want {ALLOCATION['mint']['inflation']}, got {minter.get('inflation')}"
        )

    ct = app["distribution"]["params"]["community_tax"]
    if ct != ALLOCATION["distribution"]["community_tax"]:
        errors.append(f"distribution community_tax mismatch: {ct}")

    pf = app.get("peoplefees", {}).get("params", {}).get("fee_split_bps", {})
    if pf != BPS:
        errors.append("peoplefees.params.fee_split_bps mismatch")
    if sum(BPS.values()) != 10_000:
        errors.append("fee_split_bps must sum to 10000")

    # M11-2: validator pool — 60/50/50/40M PPL over years 1-4, laid out as ~365 daily periods
    # per year (not a yearly cliff) so StreamValidatorPool's native SpendableCoins drain
    # approximates a continuous per-block stream (see apply-emission-genesis.py for why).
    DAYS_PER_YEAR = 365
    SECONDS_PER_DAY = SECONDS_PER_YEAR // DAYS_PER_YEAR
    vest = find_validator_vesting(g)
    if vest is None:
        errors.append("validator pool PeriodicVestingAccount missing")
    else:
        periods = vest.get("vesting_periods") or []
        want_period_count = len(VALIDATOR_ANNUAL) * DAYS_PER_YEAR
        if len(periods) != want_period_count:
            errors.append(f"validator vesting want {want_period_count} daily periods, got {len(periods)}")
        for i, period in enumerate(periods):
            if int(period["length"]) != SECONDS_PER_DAY:
                errors.append(f"validator period {i+1} length must be {SECONDS_PER_DAY}")
        for year, ppl in enumerate(VALIDATOR_ANNUAL):
            year_periods = periods[year * DAYS_PER_YEAR : (year + 1) * DAYS_PER_YEAR]
            got_sum = sum(int(p["amount"][0]["amount"]) for p in year_periods)
            want_sum = ppl * 10**18
            if got_sum != want_sum:
                errors.append(f"validator year {year+1} daily periods sum to {got_sum}, want {want_sum}")

    genesis_time = genesis_unix_time(g)

    # A11 (owner decision): team — 0% at genesis, 6-month cliff, then 18 months linear.
    team_acc = find_account(g, TEAM_BUCKET["account"])
    if team_acc is None or not team_acc.get("@type", "").endswith("ContinuousVestingAccount"):
        errors.append("team bucket must be a ContinuousVestingAccount")
    else:
        check_cliff_linear("team", team_acc, TEAM_BUCKET, genesis_time, errors)
        team_total = int(TEAM_BUCKET["amount_appl"])
        got_balance = account_balance(g, TEAM_BUCKET["account"])
        if got_balance != team_total:
            errors.append(f"team balance want {team_total}, got {got_balance}")

    # M11-2: treasury + liquidity share one 2-of-3 multisig account with a known pub_key.
    # A11: it is a ContinuousVestingAccount locking only the treasury bucket (same schedule as
    # team); the liquidity bucket stays spendable from genesis.
    multisig_acc = find_account(g, MULTISIG["address"])
    if multisig_acc is None:
        errors.append("treasury_multisig account missing from genesis")
    elif not multisig_acc.get("@type", "").endswith("ContinuousVestingAccount"):
        errors.append("treasury_multisig must be a ContinuousVestingAccount (A11 treasury schedule)")
    else:
        check_cliff_linear("treasury", multisig_acc, TREASURY_BUCKET, genesis_time, errors)
        base = multisig_acc.get("base_vesting_account", {}).get("base_account", {})
        pub_key = base.get("pub_key") or {}
        if not pub_key.get("@type", "").endswith("LegacyAminoPubKey"):
            errors.append("treasury_multisig pub_key must be a LegacyAminoPubKey")
        elif pub_key.get("threshold") != MULTISIG["threshold"]:
            errors.append(f"treasury_multisig threshold want {MULTISIG['threshold']}, got {pub_key.get('threshold')}")
        else:
            want_keys = [base64.b64encode(bytes.fromhex(h)).decode() for h in MULTISIG["public_keys_secp256k1_hex"]]
            got_keys = [pk.get("key") for pk in pub_key.get("public_keys", [])]
            if got_keys != want_keys:
                errors.append("treasury_multisig public_keys do not match allocation.json")
        want_balance = int(TREASURY_BUCKET["amount_appl"]) + int(LIQUIDITY_BUCKET["amount_appl"])
        if ALLOCATION["buckets"]["sale"].get("account_kind") == "multisig_2of3":
            want_balance += int(ALLOCATION["buckets"]["sale"]["amount_appl"])
        got_balance = account_balance(g, MULTISIG["address"])
        if got_balance != want_balance:
            errors.append(f"treasury_multisig balance want {want_balance}, got {got_balance}")

    # Staking/distribution precompiles must be active or the website staking page's eth_call
    # queries silently return "0x" (see apply-emission-genesis.py for why init-files needs this).
    active_precompiles = app["evm"]["params"].get("active_static_precompiles") or []
    for required in (
        "0x0000000000000000000000000000000000000800",
        "0x0000000000000000000000000000000000000801",
    ):
        if required not in active_precompiles:
            errors.append(f"evm.params.active_static_precompiles missing {required}")

    # M11-7: any module account still present at genesis must carry no Minter/Burner permission.
    for acc in g["app_state"]["auth"]["accounts"]:
        if not acc.get("@type", "").endswith("ModuleAccount"):
            continue
        name = acc.get("name")
        if name in NO_MINT_BURN_MODULES and acc.get("permissions"):
            errors.append(f"module account {name} must have no permissions, got {acc.get('permissions')}")
        if name in ("people_treasury", "people_liquidity"):
            errors.append(f"module account {name} must not exist in a fresh M11-2 genesis (use treasury_multisig)")

    return errors


class EmissionGenesisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.genesis_path = ROOT / ".testnets" / "node0" / "peopled" / "config" / "genesis.json"
        if not cls.genesis_path.is_file():
            raise unittest.SkipTest("run init-testnet.sh first")

    def test_emission_genesis(self) -> None:
        errors = validate_file(self.genesis_path)
        self.assertEqual(errors, [], "\n".join(errors))

    def test_feesplit_go_matches_allocation_json(self) -> None:
        errors = cross_check_feesplit_go()
        self.assertEqual(errors, [], "\n".join(errors))


def main() -> None:
    paths = [Path(p) for p in sys.argv[1:]] or [
        ROOT / ".testnets" / "node0" / "peopled" / "config" / "genesis.json"
    ]
    failed = False

    feesplit_errors = cross_check_feesplit_go()
    if feesplit_errors and os.environ.get("PEOPLE_REHEARSAL") == "1":
        # scripts/mainnet/rehearse.sh only: its throwaway multisig is not compiled into the
        # binary (that mismatch is exactly what makes the node refuse to start, which the
        # rehearsal asserts). Never set this for the real ceremony.
        print(f"SKIP {FEESPLIT_GO} (rehearsal): " + "; ".join(feesplit_errors))
        feesplit_errors = []
    if feesplit_errors:
        failed = True
        print(f"FAIL {FEESPLIT_GO}:")
        for e in feesplit_errors:
            print(f"  - {e}")
    else:
        print(f"OK {FEESPLIT_GO}")

    for path in paths:
        errors = validate_file(path)
        if errors:
            failed = True
            print(f"FAIL {path}:")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"OK {path}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--unittest":
        unittest.main(argv=[sys.argv[0]])
    main()
