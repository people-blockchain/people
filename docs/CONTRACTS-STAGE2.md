# Stage 2 — Solidity contracts (Cosmos EVM)

**Status:** **IMPLEMENTED** (Foundry `contracts/` + tests + deploy script). On-chain fee split (Model A, Stage 3) is **not** in these contracts.

**Chain target:** EVM `chainId` **97401** (`people_97401-1`), native **PPL** / `appl` (18 decimals).

---

## Scope

| Component | Contract(s) | Parity with `people-node` |
| --- | --- | --- |
| Token factory | `TokenFactory`, `PeopleProjectToken` | `tokenCreate`: name/symbol/decimals/supply, allocation 60/10/15/10/5, create fee ~1.045005 PPL |
| Bonding curve | `BondingCurveMarket`, `CurveMath` | Virtual 60 PPL reserve, `K=x*y`, 1% trade fee, migration at ⅓ curve inventory |
| AMM | `WPPL`, `PeopleAmmFactory`, `PeoplePair`, `PeopleRouter` | Uniswap V2–style, 30 bps swap fee, `MINIMUM_LIQUIDITY=1000` |
| NFT | `NftFactory`, `PeopleNFT` | ERC-721 collections + mint fee ~2.925 PPL |
| Community agent wallet | `CommunityAgentWallet` | Per-tx/day/week limits, recipient whitelist, emergency freeze; policy via timelock |
| Governance | `GovernanceToken`, `PeopleGovernor`, `PeopleTimelock` | OpenZeppelin Governor + ERC20Votes + timelock (2-day delay) |
| Bootstrap | `PeopleProtocolRegistry` + `script/Deploy.s.sol` | Multi-tx deploy; EIP-170–safe (no monolithic `PeopleCore`) |

**Interfaces:** `IAgentRegistry8004`, `Ix402Payment` on the agent wallet for registry / payment-hash hooks.

**Out of scope (later stages):** Model A fee router, genesis snapshot, website RPC cutover.

---

## Layout

```text
contracts/
  src/           # protocol contracts
  test/          # unit + fuzz + integration
  script/Deploy.s.sol
  scripts/smoke-local.sh
  foundry.toml   # chain id 97401 RPC alias `local`
```

---

## Build & test

```bash
cd contracts
forge build
forge test
```

Requires Foundry (`foundryup`). OpenZeppelin **v5.0.2** is vendored under `lib/`.

---

## Deploy (chain 97401 only)

**Do not** broadcast to the operator public RPC (`node.peopleblockchain.network`) unless explicitly authorized.

1. Run a local Cosmos EVM node from `chain/` (see `chain/README.md` and `chain/scripts/contracts-smoke.sh`).

2. Fund deployer with native PPL on that network.

3. Deploy:

   ```bash
   export DEPLOYER_PRIVATE_KEY=0x...
   export FEE_RECIPIENT=0x...      # required (never the deployer EOA)
   export AGENT_EXECUTOR=0x...     # required (agent wallet EXECUTOR_ROLE)
   forge script script/Deploy.s.sol:Deploy \
     --rpc-url http://127.0.0.1:8545 \
     --broadcast \
     --private-key "$DEPLOYER_PRIVATE_KEY"
   ```

4. Smoke on peopled (from repo root after validators are up):

   ```bash
   bash chain/scripts/contracts-smoke.sh
   ```

---

## Behaviour notes

- **Curve buy/sell** sends trade fees to `feeRecipient` (treasury placeholder until Stage 3).
- **Migration** seeds a WPPL pair via `PeopleRouter.addLiquidityETH`; LP from migration is minted to `0xdead` (locked liquidity pattern).
- **Creator vesting:** 10% of creator allocation upfront; remainder linear over **180 days** (`CreatorVesting`).
- **Agent wallet:** only `EXECUTOR_ROLE` may `spend` / `authorizePayment`; limit and whitelist changes require timelock (governor-proposed).

---

## Related docs

- `docs/COSMOS-EVM-MIGRATION.md` — migration stages
- `chain/README.md` — Stage 1 local testnet
- `people-node/packages/core/src/curve.ts`, `amm.ts`, `index.ts` (`applyTokenCreate`) — reference logic
