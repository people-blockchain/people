#!/usr/bin/env python3
"""CHAIN-M2: apply-emission-genesis.py must refuse to re-patch an already-patched genesis
instead of duplicating validator_reserve_appl balances / desyncing bank.supply."""
from __future__ import annotations

import importlib.util
import json
import unittest
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "apply-emission-genesis.py"

spec = importlib.util.spec_from_file_location("apply_emission_genesis", MODULE_PATH)
apply_emission_genesis = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(apply_emission_genesis)


def minimal_genesis() -> dict:
    return {
        "genesis_time": "2026-01-01T00:00:00Z",
        "app_state": {
            "auth": {
                "accounts": [
                    {
                        "@type": "/cosmos.auth.v1beta1.BaseAccount",
                        "address": "people1gentxsigner0000000000000000000000000",
                        "pub_key": None,
                        "account_number": "0",
                        "sequence": "0",
                    }
                ]
            },
            "bank": {"balances": [], "supply": []},
            "mint": {},
            "distribution": {},
            "staking": {"params": {}},
            "evm": {"params": {}},
            "gov": {},
            "erc20": {},
        },
    }


class ApplyEmissionGenesisIdempotencyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = apply_emission_genesis.load_allocation()

    def test_second_run_refuses_to_repatch_and_leaves_state_untouched(self, tmp_path=None) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "genesis.json"
            path.write_text(json.dumps(minimal_genesis()))

            apply_emission_genesis.apply_emission(path, self.cfg)
            once = json.loads(path.read_text())
            supply_once = once["app_state"]["bank"]["supply"]
            balances_once = once["app_state"]["bank"]["balances"]

            with self.assertRaises(SystemExit) as cm:
                apply_emission_genesis.apply_emission(path, self.cfg)
            self.assertNotEqual(cm.exception.code, 0)

            twice = json.loads(path.read_text())
            self.assertEqual(twice["app_state"]["bank"]["supply"], supply_once)
            self.assertEqual(twice["app_state"]["bank"]["balances"], balances_once)

    def test_is_already_patched_detects_peoplefees_marker(self) -> None:
        data = minimal_genesis()
        self.assertFalse(apply_emission_genesis.is_already_patched(data, self.cfg))
        data["app_state"]["peoplefees"] = {"params": {}}
        self.assertTrue(apply_emission_genesis.is_already_patched(data, self.cfg))

    def test_is_already_patched_detects_multisig_balance_marker(self) -> None:
        data = minimal_genesis()
        multisig_addr = self.cfg["treasury_multisig"]["address"]
        data["app_state"]["bank"]["balances"].append(
            {"address": multisig_addr, "coins": [{"denom": "appl", "amount": "1"}]}
        )
        self.assertTrue(apply_emission_genesis.is_already_patched(data, self.cfg))


VALIDATE_PATH = ROOT / "scripts" / "validate-emission-genesis.py"
vspec = importlib.util.spec_from_file_location("validate_emission_genesis", VALIDATE_PATH)
validate_emission_genesis = importlib.util.module_from_spec(vspec)
assert vspec.loader is not None
vspec.loader.exec_module(validate_emission_genesis)

MONTH = apply_emission_genesis.SECONDS_PER_MONTH


def sdk_vested(original: int, start: int, end: int, t: int) -> int:
    """Mirrors cosmos-sdk x/auth/vesting ContinuousVestingAccount.GetVestedCoins: nothing up to
    start_time, everything from end_time, linear (rounded) in between."""
    if t <= start:
        return 0
    if t >= end:
        return original
    return round(Fraction(original * (t - start), end - start))


def spendable(balance: int, original: int, start: int, end: int, t: int, spent: int) -> int:
    """Spendable = balance - still-locked, where the account already sent `spent` out."""
    locked = original - sdk_vested(original, start, end, t)
    return max(0, balance - spent - locked)


class CliffLinearVestingTests(unittest.TestCase):
    """A11 (owner decision): team and treasury = 0% at genesis, 6-month cliff, then 18 months
    linear; liquidity on the treasury multisig address stays spendable from genesis."""

    @classmethod
    def setUpClass(cls) -> None:
        import tempfile

        cls.cfg = apply_emission_genesis.load_allocation()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "genesis.json"
            path.write_text(json.dumps(minimal_genesis()))
            apply_emission_genesis.apply_emission(path, cls.cfg)
            cls.genesis = json.loads(path.read_text())
            cls.validate_errors = validate_emission_genesis.validate_file(path)
        cls.genesis_time = apply_emission_genesis.parse_genesis_time(cls.genesis)

    def account(self, address: str) -> dict:
        acc = validate_emission_genesis.find_account(self.genesis, address)
        self.assertIsNotNone(acc, address)
        return acc

    def schedule(self, address: str) -> tuple[int, int, int, int]:
        acc = self.account(address)
        self.assertTrue(acc["@type"].endswith("ContinuousVestingAccount"), acc["@type"])
        bva = acc["base_vesting_account"]
        original = int(bva["original_vesting"][0]["amount"])
        balance = validate_emission_genesis.account_balance(self.genesis, address)
        return original, int(acc["start_time"]), int(bva["end_time"]), balance

    def vesting_cases(self):
        team = self.cfg["buckets"]["team"]
        treasury = self.cfg["buckets"]["treasury"]
        return [
            ("team", team["account"], int(team["amount_appl"]), 0),
            ("treasury", self.cfg["treasury_multisig"]["address"], int(treasury["amount_appl"]),
             int(self.cfg["buckets"]["liquidity"]["amount_appl"])),
        ]

    def test_generated_genesis_passes_validator(self) -> None:
        schedule_errors = [e for e in self.validate_errors if e.startswith(("team", "treasury"))]
        self.assertEqual(schedule_errors, [], "\n".join(schedule_errors))

    def test_allocation_is_zero_upfront_six_month_cliff_eighteen_months_linear(self) -> None:
        for name in ("team", "treasury"):
            bucket = self.cfg["buckets"][name]
            self.assertEqual(bucket["vesting_upfront_pct"], 0, name)
            self.assertEqual(bucket["vesting_cliff_months"], 6, name)
            self.assertEqual(bucket["vesting_linear_months"], 18, name)

    def test_schedule_boundaries(self) -> None:
        g0 = self.genesis_time
        for name, addr, allocation, liquid in self.vesting_cases():
            original, start, end, balance = self.schedule(addr)
            self.assertEqual(original, allocation, name)  # 100% locked at genesis
            self.assertEqual(balance, allocation + liquid, name)
            self.assertEqual(start, g0 + 6 * MONTH, name)
            self.assertEqual(end, g0 + 24 * MONTH, name)
            # genesis: nothing of the bucket spendable (liquidity bucket only, for treasury)
            self.assertEqual(spendable(balance, original, start, end, g0, 0), liquid, name)
            # 1 second before the cliff: still 0
            self.assertEqual(sdk_vested(original, start, end, start - 1), 0, name)
            # exactly at the cliff: 0 (linear part starts from 0, no lump)
            self.assertEqual(sdk_vested(original, start, end, start), 0, name)
            # right after the cliff: first second of the linear part
            self.assertEqual(sdk_vested(original, start, end, start + 1), round(Fraction(original, end - start)), name)
            # middle of the linear part (cliff + 9 months): 50%
            self.assertEqual(sdk_vested(original, start, end, start + 9 * MONTH), original // 2, name)
            # 1 second before the end: < 100%; end: 100%
            self.assertLess(sdk_vested(original, start, end, end - 1), original, name)
            self.assertEqual(sdk_vested(original, start, end, end), original, name)
            self.assertEqual(sdk_vested(original, start, end, end + 10 * 365 * 86400), original, name)

    def test_repeated_spend_at_same_time_gives_nothing_extra_and_sum_equals_allocation(self) -> None:
        for name, addr, allocation, liquid in self.vesting_cases():
            original, start, end, balance = self.schedule(addr)
            spent = 0
            t = self.genesis_time
            while t <= end + MONTH:
                out = spendable(balance, original, start, end, t, spent)
                spent += out
                self.assertEqual(spendable(balance, original, start, end, t, spent), 0, f"{name} t={t}")
                t += MONTH // 3
            self.assertEqual(spent, allocation + liquid, name)

    def test_fuzz_monotonic_and_bounded(self) -> None:
        import random

        rng = random.Random(0xA11)
        for name, addr, _allocation, _liquid in self.vesting_cases():
            original, start, end, _balance = self.schedule(addr)
            times = sorted(rng.randrange(self.genesis_time, end + 400 * 86400) for _ in range(2000))
            prev = 0
            for t in times:
                v = sdk_vested(original, start, end, t)
                self.assertGreaterEqual(v, prev, name)
                self.assertLessEqual(v, original, name)
                if t <= start:
                    self.assertEqual(v, 0, name)
                prev = v

    def test_cliff_linear_schedule_rejects_bad_buckets(self) -> None:
        bad = dict(self.cfg["buckets"]["team"], vesting_upfront_pct=101)
        with self.assertRaises(ValueError):
            apply_emission_genesis.cliff_linear_schedule(bad, 0)
        bad = dict(self.cfg["buckets"]["team"], vesting_linear_months=0)
        with self.assertRaises(ValueError):
            apply_emission_genesis.cliff_linear_schedule(bad, 0)


if __name__ == "__main__":
    unittest.main()
