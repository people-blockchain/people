## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

## Mainnet deploy (`script/DeployMainnet.s.sol`)

Ownership model: one MAIN `PeopleTimelock` (delay >= 1 day, default 2 days) is its own and only
`DEFAULT_ADMIN_ROLE` holder; the 2-of-3 `PeopleMultisig` is only `PROPOSER` + `CANCELLER`;
`EXECUTOR` is open. Every `Ownable` / `Ownable2Step` contract (registry, bonding curve, community
vault, token factory, NFT factory, `StableFeeGateway`, `LavkaPass`, `MerchantEscrow`,
`LavkaPayments`) ends owned by that timelock. `run()` re-checks every owner and role at the end
and reverts if anything is off.

### Configuration

Copy `deployments/mainnet.config.example.json` to `deployments/mainnet.config.json`, fill it in and
run with `DEPLOY_CONFIG=deployments/mainnet.config.json`, or set the equivalent env vars (listed in
the example's `note`). No private key goes into a file or env var: pass `DEPLOYER_ADDRESS` / `deployer`
and sign with the forge CLI (`--account`, `--ledger`, ...).

### Dry run (local only)

Never broadcast while validating. Fork into a local anvil and simulate:

```shell
$ anvil --fork-url <rpc-url-you-trust> --chain-id <chainId-from-config>   # or plain `anvil --chain-id ...`
$ DEPLOY_CONFIG=deployments/mainnet.config.json \
  forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url http://127.0.0.1:8545 --sender <DEPLOYER_ADDRESS>
```

Without `--broadcast` forge only simulates; the in-script verification must pass. The same logic is
exercised in-process by `forge test --match-path test/DeployMainnetConfig.t.sol`.

### After the real deploy: the two scheduled stablecoin ops

The gateway is born timelock-owned, so the stablecoin allowlist is queued as two timelock
operations (`setStableAllowed(USDC,true)`, `setStableAllowed(USDT,true)`, salts from
`DeployMainnet.stableSalt`). Until they run the gateway accepts no stablecoin (fails closed).
After `minDelay`, anyone may call `timelock.execute(gateway, 0, stableCall(stable), 0x0, stableSalt(stable))`.

### Post-deploy ownership checklist (read-only, run by a human)

- [ ] `owner()` == timelock on: registry, bondingCurve, communityVault, tokenFactory, nftFactory,
      stableFeeGateway, lavkaPass, merchantEscrow, lavkaPayments.
- [ ] `pendingOwner()` == `address(0)` on stableFeeGateway (Ownable2Step; ctor-owned, nothing pending).
- [ ] `timelock.hasRole(DEFAULT_ADMIN_ROLE, timelock)` is true and false for deployer, multisig, governor.
- [ ] `hasRole(PROPOSER_ROLE / CANCELLER_ROLE, multisig)` true; governor true; deployer false.
- [ ] `hasRole(EXECUTOR_ROLE, address(0))` true; `getMinDelay()` == configured delay.
- [ ] `communityAgentWallet`: `hasRole(DEFAULT_ADMIN_ROLE, timelock)`, `hasRole(GUARDIAN_ROLE, multisig)`,
      `hasRole(EXECUTOR_ROLE, agentExecutor)`; nothing for the deployer.
- [ ] `registry.tokenFactoryAddress()` == tokenFactory; `tokenFactory.promoVault()` / `gateway()` and
      `nftFactory.gateway()` set.
- [ ] `timelock.isOperationPending(id)` for both stable ops until executed, then `isAcceptedStable(...)`.

### Documented exceptions / trade-offs

1. `CommunityAgentWallet` GUARDIAN = multisig: instant freeze only; unfreeze / limits stay timelock-only.
2. `StableFeeGateway.pause()` is `onlyOwner` (no separate pauser role), so pausing takes `minDelay`.
3. `CommunityAgentWallet` EXECUTOR = the configured agent executor (bounded by the wallet's limits).
4. Testnet `LavkaPass` handoff recipe: `deployments/lavkapass-ownership-handoff.md`.
5. `script/Deploy.s.sol` and the fresh-timelock path of `script/DeployLavka.s.sol` follow the same
   rule: the timelock is its own sole admin and the multisig is only proposer + canceller.
