#!/usr/bin/env python3
"""Founder NFT genesis generator: determinism, stable numbering, eligibility, validation."""
from __future__ import annotations

import itertools
import json
import random
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import generate_founder_nft_genesis as gen  # noqa: E402

SCRIPT_PATH = SCRIPTS / "generate_founder_nft_genesis.py"
FIXTURE_PATH = SCRIPTS / "fixtures" / "founder-nft-snapshot.sample.json"


def pid(n: int) -> str:
    return "0x" + format(n, "064x")


def adr(n: int) -> str:
    return "0x" + format(n, "040x")


def human(person: int, holder: int, level: int = 2, token_id=None) -> dict:
    return {"personId": pid(person), "holder": adr(holder), "verificationLevel": level, "tokenId": token_id}


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def by_person(genesis: dict) -> dict:
    return {r["personId"]: r for r in genesis["records"]}


class DeterminismTests(unittest.TestCase):
    def test_two_calls_identical_bytes(self) -> None:
        snap = load_fixture()
        a = gen.render(gen.build_genesis(deepcopy(snap))).encode()
        b = gen.render(gen.build_genesis(deepcopy(snap))).encode()
        self.assertEqual(a, b)
        self.assertTrue(a.endswith(b"\n"))

    def test_shuffled_input_same_output(self) -> None:
        snap = load_fixture()
        expected = gen.render(gen.build_genesis(snap))
        rng = random.Random(1234)
        for _ in range(25):
            rows = deepcopy(snap["humans"])
            rng.shuffle(rows)
            self.assertEqual(gen.render(gen.build_genesis({"humans": rows})), expected)

    def test_all_permutations_small_input(self) -> None:
        rows = [human(3, 13), human(1, 11, token_id=4), human(2, 12), human(5, 15, level=1, token_id=9)]
        outputs = {gen.render(gen.build_genesis({"humans": list(p)})) for p in itertools.permutations(rows)}
        self.assertEqual(len(outputs), 1)

    def test_output_shape_and_order(self) -> None:
        g = gen.build_genesis(load_fixture())
        self.assertEqual(g["version"], 1)
        self.assertEqual(g["collection"], "PeopleFounderNFT")
        self.assertEqual(g["count"], len(g["records"]))
        ids = [r["tokenId"] for r in g["records"]]
        self.assertEqual(ids, sorted(ids))
        for r in g["records"]:
            self.assertEqual(set(r), {"tokenId", "personId", "holder"})

    def test_hex_normalized_lowercase(self) -> None:
        row = {"personId": "0x" + "AB" * 32, "holder": "0x" + "CD" * 20, "verificationLevel": 2, "tokenId": 1}
        rec = gen.build_genesis({"humans": [row]})["records"][0]
        self.assertEqual(rec["personId"], "0x" + "ab" * 32)
        self.assertEqual(rec["holder"], "0x" + "cd" * 20)


class EligibilityTests(unittest.TestCase):
    def test_eligible_level_constant(self) -> None:
        self.assertEqual(gen.ELIGIBLE_LEVEL, 2)

    def test_telegram_only_excluded_with_and_without_token(self) -> None:
        g = gen.build_genesis({"humans": [human(1, 11, level=1, token_id=1), human(2, 12, level=1), human(3, 13)]})
        self.assertEqual([r["personId"] for r in g["records"]], [pid(3)])

    def test_level_zero_excluded(self) -> None:
        g = gen.build_genesis({"humans": [human(1, 11, level=0), human(2, 12, level=0, token_id=3)]})
        self.assertEqual(g["records"], [])
        self.assertEqual(g["count"], 0)

    def test_fixture_expectations(self) -> None:
        g = gen.build_genesis(load_fixture())
        got = {r["tokenId"]: r["personId"] for r in g["records"]}
        self.assertEqual(got, {1: pid(0xA1), 2: pid(0xA2), 5: pid(0xA4), 6: pid(0xB1), 7: pid(0xB2)})

    def test_no_duplicate_person_ids_in_output(self) -> None:
        g = gen.build_genesis(load_fixture())
        persons = [r["personId"] for r in g["records"]]
        self.assertEqual(len(persons), len(set(persons)))

    def test_current_holder_taken_from_input(self) -> None:
        before = gen.build_genesis({"humans": [human(1, 0x11, token_id=1)]})
        after = gen.build_genesis({"humans": [human(1, 0x22, token_id=1)]})
        self.assertEqual(before["records"][0]["holder"], adr(0x11))
        self.assertEqual(after["records"][0]["holder"], adr(0x22))
        self.assertEqual(by_person(gen.build_genesis(load_fixture()))[pid(0xA2)]["holder"], adr(0x2002))


class NumberingTests(unittest.TestCase):
    def test_existing_numbers_preserved(self) -> None:
        g = gen.build_genesis({"humans": [human(9, 19, token_id=7), human(1, 11, token_id=2)]})
        self.assertEqual({r["personId"]: r["tokenId"] for r in g["records"]}, {pid(9): 7, pid(1): 2})

    def test_newcomers_after_max_ordered_by_person_id(self) -> None:
        g = gen.build_genesis({"humans": [human(30, 13), human(10, 11), human(20, 12), human(5, 15, token_id=4)]})
        got = {r["personId"]: r["tokenId"] for r in g["records"]}
        self.assertEqual(got, {pid(5): 4, pid(10): 5, pid(20): 6, pid(30): 7})

    def test_newcomers_start_at_one_when_no_tokens(self) -> None:
        g = gen.build_genesis({"humans": [human(2, 12), human(1, 11)]})
        self.assertEqual([(r["tokenId"], r["personId"]) for r in g["records"]], [(1, pid(1)), (2, pid(2))])

    def test_excluded_numbers_not_reused(self) -> None:
        # Excluded holder owns the highest number 10; newcomer must get 11, and 10 is not reused.
        g = gen.build_genesis({"humans": [human(1, 11, level=1, token_id=10), human(2, 12, token_id=1), human(3, 13)]})
        ids = {r["personId"]: r["tokenId"] for r in g["records"]}
        self.assertEqual(ids, {pid(2): 1, pid(3): 11})
        self.assertNotIn(10, ids.values())

    def test_numbering_ignores_input_order_of_newcomers(self) -> None:
        a = gen.build_genesis({"humans": [human(2, 12), human(1, 11)]})
        b = gen.build_genesis({"humans": [human(1, 11), human(2, 12)]})
        self.assertEqual(a, b)


class ValidationTests(unittest.TestCase):
    def assert_invalid(self, humans, msg: str | None = None) -> None:
        with self.assertRaises(ValueError) as ctx:
            gen.build_genesis({"humans": humans})
        if msg:
            self.assertIn(msg, str(ctx.exception))

    def test_duplicate_person_id(self) -> None:
        self.assert_invalid([human(1, 11), human(1, 12)], "duplicate personId")

    def test_duplicate_person_id_case_insensitive(self) -> None:
        a = human(0xAB, 11)
        b = human(0xAB, 12)
        b["personId"] = "0x" + b["personId"][2:].upper()
        self.assert_invalid([a, b], "duplicate personId")

    def test_duplicate_person_id_even_if_excluded(self) -> None:
        self.assert_invalid([human(1, 11, level=0), human(1, 12)], "duplicate personId")

    def test_duplicate_holder_among_eligible(self) -> None:
        self.assert_invalid([human(1, 11), human(2, 11)], "duplicate holder")

    def test_duplicate_holder_with_excluded_is_ok(self) -> None:
        g = gen.build_genesis({"humans": [human(1, 11, level=1), human(2, 11)]})
        self.assertEqual(g["count"], 1)

    def test_duplicate_token_id(self) -> None:
        self.assert_invalid([human(1, 11, token_id=1), human(2, 12, token_id=1)], "duplicate tokenId")

    def test_duplicate_token_id_with_excluded(self) -> None:
        self.assert_invalid([human(1, 11, level=1, token_id=1), human(2, 12, token_id=1)], "duplicate tokenId")

    def test_invalid_formats(self) -> None:
        good = human(1, 11)
        bad_rows = [
            {**good, "personId": "0x1234"},
            {**good, "personId": "1" * 66},
            {**good, "personId": "0x" + "zz" * 32},
            {**good, "personId": pid(0)},
            {**good, "personId": 5},
            {**good, "holder": "0x1234"},
            {**good, "holder": "0x" + "zz" * 20},
            {**good, "holder": adr(0)},
            {**good, "holder": pid(1)},
            {**good, "verificationLevel": 3},
            {**good, "verificationLevel": -1},
            {**good, "verificationLevel": "2"},
            {**good, "verificationLevel": True},
            {**good, "tokenId": 0},
            {**good, "tokenId": -4},
            {**good, "tokenId": True},
            {**good, "tokenId": 1.5},
            {**good, "tokenId": "1"},
            "not an object",
        ]
        for row in bad_rows:
            with self.subTest(row=row):
                self.assert_invalid([row])

    def test_invalid_row_rejected_even_if_not_eligible(self) -> None:
        self.assert_invalid([{**human(1, 11, level=0), "holder": "0x12"}])

    def test_invalid_snapshot_shape(self) -> None:
        for snap in ({}, {"humans": {}}, [], None):
            with self.subTest(snap=snap):
                with self.assertRaises(ValueError):
                    gen.build_genesis(snap)


class CliTests(unittest.TestCase):
    def run_cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(SCRIPT_PATH), *args], capture_output=True, text=True)

    def test_output_file_matches_render(self) -> None:
        expected = gen.render(gen.build_genesis(load_fixture()))
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "genesis.json"
            res = self.run_cli("--input", str(FIXTURE_PATH), "--output", str(out))
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertEqual(out.read_text(), expected)

    def test_stdout_when_no_output(self) -> None:
        res = self.run_cli("--input", str(FIXTURE_PATH))
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(res.stdout, gen.render(gen.build_genesis(load_fixture())))

    def test_invalid_input_fails_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "bad.json"
            src.write_text(json.dumps({"humans": [human(1, 11), human(1, 12)]}))
            res = self.run_cli("--input", str(src))
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("duplicate personId", res.stderr)
            self.assertEqual(res.stdout, "")


if __name__ == "__main__":
    unittest.main()
