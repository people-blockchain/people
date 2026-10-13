# Testnet genesis v2 (2026-10-08)

Owner-approved fresh-genesis restart of `people_97401-1` (EVM chain id 97401) on 2026-10-08.

| Item | Value |
|---|---|
| Genesis time | 2026-10-08T14:40:39Z (18:40:39 Tbilisi), initial height 1 |
| Chain id | `people_97401-1` (unchanged), EVM 97401 |
| genesis.json sha256 | `31ce4e05ec1b4fb347c64952c4cd3cc055f669ca07956e24dab5f3c93a9d8df0` |
| Old chain last height | 167546 (data kept in the VPS backup below) |
| Validators | same node0/node1 consensus + operator keys; 100 PPL self-delegation, 10% commission (max 20%, max change 1%) |
| Fee split | 30/25/20/10/15/0 (`peoplefees` RouteModelAFees) |
| Treasury | native 2-of-3 multisig `people1e9ymgxdtdgszjg7knu0gk9uy2dff8sm4pd0zl2` (0xC949…C375), ethsecp256k1 **test** keys — not mainnet custody |
| Removed | the 4 well-known public dev accounts from the old test genesis |
| Faucet | `people1y6tkqtshs9wpzz4uwd3hfdd0lzuwgpd4v4588a` funded with 1,000,000 PPL at genesis (cap 100 PPL/address, 10,000 PPL/UTC day) |
| Deployers | 0x74a5… (GitHub secret) and 0x040b…44C4, 50,000 PPL each at genesis |

Extra accounts (`genesis_extra_accounts` in `chain/emission/allocation.json`) are paid out of the
community bucket by `apply-emission-genesis.py`, so total supply and the other buckets are unchanged.

Validator-pool stream: PeriodicVesting with daily periods; first unlock at genesis + 24h
(2026-10-09T14:40:39Z), ~164,383.56 PPL/day in year 1, streamed to signing validators.

EVM: protocol + Lavka contracts redeployed from block 106 (`deployBlock` in
`contracts/deployments/97401.json`). Lavka buckets: treasury = growth pool = 0xC949…C375,
validators = 0x2752…8b5f (validator pool), community vault = `contracts.communityVault`.
Seed: 6 tokens, 6 pools, 2 NFTs.

Rollback (VPS backup `/opt/people-chain-cosmos/backups/before-genesis-v2-20261008T142648Z`):
stop both validators, restore `bin/peopled` from `peopled.v1`, move `node{0,1}-data` back to
`/var/lib/people-cosmos/node{n}/peopled/data`, restore `config/genesis.json` from
`genesis-v1.json` and the faucet env from `cosmos-faucet.env`, chown to `people-validator-{n}`, start.
