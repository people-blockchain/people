#!/usr/bin/env python3
"""Write chain/emission/genesis-liquidity-vault.json from the forge build of
GenesisLiquidityVault (run `forge build` in contracts/ first; needs `cast` for keccak).

The vault lives at a keyless address: the last 20 bytes of keccak256(ADDRESS_PREIMAGE), so no
private key exists for it. contracts/test/GenesisLiquidityVault.t.sol checks this file against the
build, so a stale artifact fails `forge test`."""
from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT.parent / "contracts" / "out" / "GenesisLiquidityVault.sol" / "GenesisLiquidityVault.json"
ADDRESS_PREIMAGE = "PEOPLE genesis liquidity vault"

spec = importlib.util.spec_from_file_location("apply_emission_genesis", ROOT / "scripts" / "apply-emission-genesis.py")
apply_emission_genesis = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(apply_emission_genesis)


def main() -> None:
    build = json.loads(BUILD.read_text())
    code = build["deployedBytecode"]["object"].removeprefix("0x")
    digest = subprocess.run(["cast", "keccak", ADDRESS_PREIMAGE], check=True, capture_output=True, text=True)
    address = subprocess.run(
        ["cast", "to-check-sum-address", "0x" + digest.stdout.strip()[-40:]], check=True, capture_output=True, text=True
    ).stdout.strip()
    artifact = {
        "contract": "contracts/src/sale/GenesisLiquidityVault.sol:GenesisLiquidityVault",
        "address_preimage": ADDRESS_PREIMAGE,
        "address": address,
        "bech32": apply_emission_genesis.evm_to_bech32(address),
        "slots": {name: i for i, name in enumerate(apply_emission_genesis.VAULT_SLOTS)},
        "runtime_code": code,
    }
    apply_emission_genesis.VAULT_ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2) + "\n")
    print(f"wrote {apply_emission_genesis.VAULT_ARTIFACT_PATH} ({len(code) // 2} bytes) at {address}")


if __name__ == "__main__":
    main()
