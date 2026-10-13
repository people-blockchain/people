#!/usr/bin/env python3
"""CHAIN-M2: apply-emission-genesis.py must refuse to re-patch an already-patched genesis
instead of duplicating validator_reserve_appl balances / desyncing bank.supply."""
from __future__ import annotations

import importlib.util
import json
import unittest
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


if __name__ == "__main__":
    unittest.main()
