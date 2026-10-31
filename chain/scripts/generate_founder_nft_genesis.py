#!/usr/bin/env python3
"""Deterministic Founder NFT genesis generator (PeopleFounderNFT).

Input snapshot JSON:
  {"humans": [{"personId": "0x<64 hex>", "holder": "0x<40 hex>",
               "verificationLevel": 0|1|2, "tokenId": <int >= 1> | null}, ...]}

Levels mirror website/src/lib/founders/verification.ts:
  0 none, 1 Telegram (NOT eligible), 2 Human Passport (STRONG).
Only level 2 is eligible; this is a hard-coded constant, not configurable.
`holder` is the CURRENT holder (after rebind).

Output is byte-identical for any permutation of the input rows.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

VERSION = 1
COLLECTION = "PeopleFounderNFT"
ELIGIBLE_LEVEL = 2
VALID_LEVELS = (0, 1, 2)

_PERSON_ID_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _normalize_row(index: int, row: object) -> dict:
    where = f"humans[{index}]"
    if not isinstance(row, dict):
        raise ValueError(f"{where}: must be an object")

    person_id = row.get("personId")
    if not isinstance(person_id, str) or not _PERSON_ID_RE.match(person_id):
        raise ValueError(f"{where}: personId must be 0x followed by 64 hex chars, got {person_id!r}")
    person_id = person_id.lower()
    if int(person_id, 16) == 0:
        raise ValueError(f"{where}: personId must not be zero")

    holder = row.get("holder")
    if not isinstance(holder, str) or not _ADDRESS_RE.match(holder):
        raise ValueError(f"{where}: holder must be 0x followed by 40 hex chars, got {holder!r}")
    holder = holder.lower()
    if int(holder, 16) == 0:
        raise ValueError(f"{where}: holder must not be the zero address")

    level = row.get("verificationLevel")
    if not _is_int(level) or level not in VALID_LEVELS:
        raise ValueError(f"{where}: verificationLevel must be one of {list(VALID_LEVELS)}, got {level!r}")

    token_id = row.get("tokenId")
    if token_id is not None and (not _is_int(token_id) or token_id < 1):
        raise ValueError(f"{where}: tokenId must be an integer >= 1 or null, got {token_id!r}")

    return {"personId": person_id, "holder": holder, "level": level, "tokenId": token_id}


def build_genesis(snapshot: dict) -> dict:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("humans"), list):
        raise ValueError("snapshot must be an object with a 'humans' array")

    rows = [_normalize_row(i, r) for i, r in enumerate(snapshot["humans"])]

    seen_person: set[str] = set()
    seen_token: set[int] = set()
    for row in rows:
        if row["personId"] in seen_person:
            raise ValueError(f"duplicate personId: {row['personId']}")
        seen_person.add(row["personId"])
        if row["tokenId"] is not None:
            if row["tokenId"] in seen_token:
                raise ValueError(f"duplicate tokenId: {row['tokenId']}")
            seen_token.add(row["tokenId"])

    # Numbers of excluded rows are never reused: max covers ALL rows.
    max_token = max(seen_token, default=0)

    eligible = [r for r in rows if r["level"] == ELIGIBLE_LEVEL]

    seen_holder: set[str] = set()
    for row in sorted(eligible, key=lambda r: r["personId"]):
        if row["holder"] in seen_holder:
            raise ValueError(f"duplicate holder among eligible humans: {row['holder']}")
        seen_holder.add(row["holder"])

    records = [
        {"tokenId": r["tokenId"], "personId": r["personId"], "holder": r["holder"]}
        for r in eligible
        if r["tokenId"] is not None
    ]
    next_id = max_token + 1
    for row in sorted((r for r in eligible if r["tokenId"] is None), key=lambda r: r["personId"]):
        records.append({"tokenId": next_id, "personId": row["personId"], "holder": row["holder"]})
        next_id += 1

    records.sort(key=lambda r: r["tokenId"])
    return {"version": VERSION, "collection": COLLECTION, "count": len(records), "records": records}


def render(genesis: dict) -> str:
    return json.dumps(genesis, sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic Founder NFT genesis JSON.")
    parser.add_argument("--input", required=True, help="snapshot JSON path")
    parser.add_argument("--output", help="output path (default: stdout)")
    args = parser.parse_args(argv)

    try:
        snapshot = json.loads(Path(args.input).read_text())
        out = render(build_genesis(snapshot))
    except (OSError, ValueError) as exc:  # JSONDecodeError is a ValueError
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.output:
        Path(args.output).write_text(out)
    else:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
