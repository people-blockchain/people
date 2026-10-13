# Testnet genesis v3 (2026-10-09)

Owner-approved fresh-genesis restart of `people_97401-1` (EVM chain id 97401) on 2026-10-09,
so that the staking/distribution/gov/bank static precompiles are active from block 1 (#217) and
the EVM contracts carry the #219 audit fixes.

| Item | Value |
|---|---|
| Genesis time | 2026-10-09T04:22:17Z (08:22:17 Tbilisi), initial height 1 |
| Chain id | `people_97401-1` (unchanged), EVM 97401 |
| genesis.json sha256 | `ff7fc5138639a01b06db12a49921a12361120c4ce92b0a539446cbcb71e33c92` |
| Block 1 hash | `0x6a8f9cf0319e44acc4ee8fe4473549f422266e5b0e5be6b3ac68167a4cbe525d` (faucet `FAUCET_FIRST_BLOCK_HASH`) |
| Old (v2) chain last height | 37292 (data kept in the VPS backup below) |
| Binary | unchanged from v2 (`peopled` sha256 `b9a3490e…4bb3`); chain code did not change between v2 and v3 |
| Diff vs v2 genesis | only `genesis_time`, vesting start/end times and `evm.params.active_static_precompiles` (0x100, 0x400, 0x800–0x806) |
| Validators, gentxs | same node0/node1 keys and the v2 gentxs (100 PPL self-delegation, 10% commission) |
| Treasury, faucet, deployers, team vesting, validator pool | identical to v2 (`docs/TESTNET-GENESIS-V2.md`); validator-pool daily unlocks start at genesis + 24h |

EVM: protocol + Lavka contracts redeployed from main after #219 (`deployBlock` 56 in
`contracts/deployments/97401.json`). Deploy inputs: `PeopleMultisig` owners
0x4d57…1b42 / 0x8297…4459 / 0x5499…A106 (same as v2), `FEE_RECIPIENT` and Lavka
treasury / growth pool / liquidity & ecosystem = treasury multisig 0xC949…C375, Lavka validators =
validator pool 0x2752…8b5F, community vault = `contracts.communityVault`.
Seed: 6 tokens, 6 pools, 2 NFTs.

Post-deploy ownership changes (live, 2026-10-09, owner decision):

| Contract | Address | Owner / admin now | Tx |
|---|---|---|---|
| `LavkaPass` | `0x47723bc7d7bab2dd177698e2255d0ae5646e37d4` | `PeopleMultisig` `0x8e6abdc7225621770cad88345a72f20ed77e9d03` (was deployer `0x040b…44C4`) | `0x77bfcf48f9da728b954fb150030de651db898cbbde15cb7cabb647c6b0b272aa` (block 28037), `owner()` verified |
| `CommunityAgentWallet` EXECUTOR_ROLE | `0xfbf9b56e243f01ba58df814e9883be232ea04b8d` | **still deployer — move blocked.** The role's admin is `DEFAULT_ADMIN_ROLE`, held by the protocol `PeopleTimelock` `0xcdBa640215E4d8A7Cb52C967Bb516A71b30D1dce`; the deployer holds neither, and both `grantRole` and `revokeRole` revert `AccessControlUnauthorizedAccount(0x040b…44C4, 0x00…00)`. Only the 2-of-3 `PeopleMultisig` can schedule the timelock op — see the AUD-M5 note in `docs/audit-final/reaudit-2026-10-09.md`. The script/workflow fix (AUD-M5, #242) still applies to future deploys. | — |
| Lavka `PeopleTimelock` admin | `0xCEb8b40516B53928f2B61cEf0Ae68c11352C548F` | `PeopleMultisig` `0x8e6abdc7225621770cad88345a72f20ed77e9d03` (was deployer `0x040b…44C4`) — granted then renounced, verified `hasRole(DEFAULT_ADMIN_ROLE, deployer)=false`, `…(multisig)=true` | grant `0x6ea263823ad290d7caa197ae4709ef3df085b92ab12f194870ebe5d849bb02f6` (block 43120), renounce `0x75cc0dff20b83ecdb8b74d2606c4505f04747e55d6e4cd997d2cebd148f0b57e` (block 43129) |

CHAIN-M4 workaround: 200 PPL each to validator operators `0xae7b4A57363F0Aa3F76fc2B5E460bC0D4BcFB565`
(tx `0xf7308dd6fd23f6c224216e25924b6768a480f1bdf505f482f037c83136e83a20`) and
`0xf31B292562e93Be281db2601f38400E5a22e9AEc` (tx `0x0c0370c4c8e88537ef9e32b5c046c38efc3cbe41923e81b28312f2715311df83`).

Rollback (VPS backup `/opt/people-chain-cosmos/backups/before-genesis-v3-20261009T041319Z`):
stop faucet and both validators, move `node{0,1}-data` back to
`/var/lib/people-cosmos/node{n}/peopled/data`, restore `config/genesis.json` from
`genesis-v2.json` and the faucet env from `cosmos-faucet.env`, chown to `people-validator-{n}`,
start. Build workdir: `/root/genesis-v3-20261009T041319Z` (`restart-v3.sh`, `trial2.sh`).
