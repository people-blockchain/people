// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";
import {GovernanceToken} from "../src/governance/GovernanceToken.sol";
import {PeopleTimelock} from "../src/governance/PeopleTimelock.sol";
import {PeopleGovernor} from "../src/governance/PeopleGovernor.sol";
import {PeopleMultisig} from "../src/governance/PeopleMultisig.sol";

/// @notice Multi-contract deploy for chain 97401 — each `new` is a separate tx (EIP-170 / initcode safe).
contract Deploy is Script {
    struct Deployment {
        PeopleProtocolRegistry registry;
        WPPL wppl;
        PeopleAmmFactory ammFactory;
        PeopleRouter router;
        BondingCurveMarket bondingCurve;
        CreatorVesting creatorVesting;
        CommunityTokenVault communityVault;
        TokenFactory tokenFactory;
        NftFactory nftFactory;
        GovernanceToken governanceToken;
        PeopleTimelock timelock;
        PeopleGovernor governor;
        PeopleMultisig treasuryMultisig;
        CommunityAgentWallet agentWallet;
    }

    /// @notice Rejects an unset (zero) configured address.
    function configuredAddress(address value, string memory name) public pure returns (address) {
        require(value != address(0), string.concat(name, " must be a non-zero address"));
        return value;
    }

    /// @notice Rejects an unset or non-distinct treasury multisig owner set.
    /// @dev Split from `run` so the guard is unit-testable without the forge env plumbing, the
    /// same way `DeployLavka.configuredBucket` is. `PeopleMultisig` would also revert on a
    /// duplicate, but with an opaque `DuplicateOwner()` partway through a broadcast.
    function checkedMultisigOwners(address[3] memory owners_) public pure returns (address[3] memory) {
        for (uint256 i = 0; i < 3; i++) {
            require(owners_[i] != address(0), "TREASURY_MULTISIG_{OWNER,COFOUNDER,COLD} must be non-zero");
            for (uint256 j = i + 1; j < 3; j++) {
                require(owners_[i] != owners_[j], "TREASURY_MULTISIG_* must be three distinct addresses");
            }
        }
        return owners_;
    }

    function run() external returns (Deployment memory d) {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        // AUD-H4: required, not defaulted to `deployer`. This address receives 100% of every
        // token-create fee, NFT mint fee and 1% curve trading fee; defaulting it meant all EVM
        // protocol revenue accrued to the deploy hot key (same reasoning as LAV-M2 for the
        // Lavka fee buckets). It must be the treasury multisig or another governed address that
        // accepts native PPL.
        address feeRecipient = configuredAddress(vm.envAddress("FEE_RECIPIENT"), "FEE_RECIPIENT");
        // AUD-M5: required, not defaulted to `deployer`. `CommunityAgentWallet` grants
        // EXECUTOR_ROLE to this address, which may then spend community funds up to the
        // wallet's limits; defaulting it to the deploy hot key concentrated that authority on
        // the deploy key (same reasoning as FEE_RECIPIENT). Set it to the intended executor
        // (an agent ops key, or the treasury multisig while the agent is not yet live).
        address agentExecutor = configuredAddress(vm.envAddress("AGENT_EXECUTOR"), "AGENT_EXECUTOR");

        // M11-2 / M07-4: owner, co-founder, owner's cold address (see
        // docs/PROTOCOL-DECISIONS.md M11-2). AUD-H1: these used to default to `deployer`, which
        // could never actually deploy — `PeopleMultisig` rejects `DuplicateOwner`, so with the
        // variables unset the whole script reverted at that line. They are now required, the
        // same way `DeployLavka` requires its fee buckets, and this multisig is additionally the
        // timelock's bootstrap admin, so three real independent addresses matter more than before.
        address[3] memory multisigOwners = checkedMultisigOwners(
            [
                vm.envAddress("TREASURY_MULTISIG_OWNER"),
                vm.envAddress("TREASURY_MULTISIG_COFOUNDER"),
                vm.envAddress("TREASURY_MULTISIG_COLD")
            ]
        );

        vm.startBroadcast(deployerKey);

        d.registry = new PeopleProtocolRegistry();
        d.wppl = new WPPL();
        d.ammFactory = new PeopleAmmFactory(address(d.registry));
        d.router = new PeopleRouter(address(d.ammFactory), d.wppl);
        d.treasuryMultisig = new PeopleMultisig(multisigOwners);
        d.timelock = new PeopleTimelock(2 days);
        d.governanceToken = new GovernanceToken(address(d.timelock));
        d.governor = new PeopleGovernor(d.governanceToken, d.timelock);
        d.timelock.grantRole(d.timelock.PROPOSER_ROLE(), address(d.governor));
        d.timelock.grantRole(d.timelock.EXECUTOR_ROLE(), address(0));
        d.timelock.grantRole(d.timelock.CANCELLER_ROLE(), address(d.governor));
        // AUD-H1: M07-5 renounced the deployer's admin role while the entire 1,000,000 gPPL
        // supply sat undelegated in the timelock. That left nobody with voting power, so the
        // governor could not reach its 100,000 gPPL proposal threshold (or the 4% quorum) and
        // the governor was the timelock's only proposer — the DAO could never pass a first
        // proposal, the supply was locked forever, and the timelock-gated kill switches on
        // `CommunityAgentWallet` (freeze, limits, recipient allowlist) were unreachable. The
        // already-approved 2-of-3 `PeopleMultisig` (M07-4, the owner of the vaults) is therefore
        // the timelock's bootstrap PROPOSER and CANCELLER: it can schedule the initial gPPL
        // distribution/delegation and act in an emergency, still behind the 2-day delay, with no
        // EOA keeping standing control. Once gPPL is distributed and the governor can carry a
        // vote on its own, revoking these two roles from the multisig is one timelock
        // proposal (see docs/audit-final/contracts.md AUD-H1 for the open owner decision on the
        // distribution itself).
        // The multisig is deliberately NOT given DEFAULT_ADMIN_ROLE: an admin can `grantRole`
        // instantly, so a multisig admin could mint itself (or anyone) any role, including
        // EXECUTOR/PROPOSER, and bypass the delay entirely. OZ's `TimelockController` constructor
        // always grants DEFAULT_ADMIN_ROLE to the timelock itself, so after the deployer
        // renounces below, the timelock is its own sole admin and any role change must itself
        // pass through schedule -> delay -> execute.
        d.timelock.grantRole(d.timelock.PROPOSER_ROLE(), address(d.treasuryMultisig));
        d.timelock.grantRole(d.timelock.CANCELLER_ROLE(), address(d.treasuryMultisig));
        // M07-5: the deployer keeps no admin role (`PeopleTimelock` passes `msg.sender` as the
        // constructor's temporary admin).
        d.timelock.renounceRole(d.timelock.DEFAULT_ADMIN_ROLE(), deployer);
        // AUD-M1: the last argument is where a migrated curve's leftover tokens go. It is the
        // same governed address as `FEE_RECIPIENT` (the treasury multisig on the live chain),
        // owner decision 2026-10-09; `setTreasury` can rotate it without a redeploy.
        // H-02: owner is the timelock, not the multisig directly, so every owner-gated call
        // (including `CommunityTokenVault.withdraw` / `setRecipientAllowed`, H-01) carries the
        // timelock's 2-day delay instead of executing the instant the 2nd multisig confirmation
        // lands. `StableFeeGateway` is deliberately the one exception (see
        // `DeployStableFeeGateway.s.sol`) — it stays owned by the multisig so `pause()` remains
        // an instant incident-response action.
        d.bondingCurve = new BondingCurveMarket(
            address(d.registry), feeRecipient, d.router, d.ammFactory, address(d.timelock), feeRecipient
        );
        d.creatorVesting = new CreatorVesting(address(d.registry));
        d.communityVault = new CommunityTokenVault(address(d.registry), address(d.timelock));
        d.tokenFactory = new TokenFactory(
            feeRecipient, d.bondingCurve, d.creatorVesting, d.communityVault, address(d.timelock)
        );
        d.registry.setTokenFactory(address(d.tokenFactory));
        // AUD-M12: the registry is now Ownable; hand it to the timelock like the deployer's
        // other standing authority (M07-5), so rotating the factory later needs a governance
        // proposal, not a redeploy.
        d.registry.transferOwnership(address(d.timelock));
        d.nftFactory = new NftFactory(feeRecipient, address(d.registry), address(d.timelock));
        // AUD-M4: the treasury multisig is the guardian — it can freeze the wallet instantly
        // in an emergency without waiting on the timelock's 2-day delay; only unfreezing stays
        // onlyTimelock.
        d.agentWallet =
            new CommunityAgentWallet(agentExecutor, address(d.timelock), feeRecipient, address(d.treasuryMultisig));

        vm.stopBroadcast();

        console2.log("Registry", address(d.registry));
        console2.log("TokenFactory", address(d.tokenFactory));
        console2.log("BondingCurve", address(d.bondingCurve));
        console2.log("Router", address(d.router));
        console2.log("WPPL", address(d.wppl));
        console2.log("AgentWallet", address(d.agentWallet));
        console2.log("TreasuryMultisig", address(d.treasuryMultisig));
    }
}
