// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";
import {ICreatorVesting, IPeopleRouter, IPeopleAmmFactory} from "../src/interfaces/ICreatorVesting.sol";
import {ICommunityTokenVault} from "../src/interfaces/ICommunityTokenVault.sol";

/// @notice Redeploys only the contracts whose bytecode changed for the C-01/S1-01/S1-02/S1-03/
/// H-01/H-02/H-03/P1-14 security fixes (PR #278/#279), against the already-deployed,
/// unchanged registry/router/ammFactory/timelock/multisig/creatorVesting on chain 97401.
///
/// Sequencing per the owner's operational decision: each new contract is deployed with the
/// deployer as a *temporary* owner so `setGateway` can be wired in the same broadcast (an
/// instant deployer-owner call), then ownership is handed to its governed final owner in the
/// same script — `StableFeeGateway` goes straight to the multisig (no temporary-owner step,
/// since its owner-only setup, if any, is the multisig's to do), the rest to the timelock
/// (H-02). `CommunityAgentWallet` has no `Ownable` owner to transfer — its roles
/// (`DEFAULT_ADMIN_ROLE` = timelock, `EXECUTOR_ROLE`, `GUARDIAN_ROLE`) are final at construction.
///
/// Known follow-up this script cannot do itself (out of scope / requires the existing 2-of-3
/// multisig + the existing timelock's 2-day delay, not a redeploy step):
/// `PeopleProtocolRegistry.setTokenFactory(newTokenFactory)` must be scheduled+executed by the
/// multisig through the timelock before `createToken` on the new `TokenFactory` will work --
/// `CommunityTokenVault.register` / `CreatorVesting.register` / `BondingCurveMarket.registerToken`
/// all gate on `registry.tokenFactoryAddress() == msg.sender`.
contract RedeploySecurityFixes is Script {
    struct Existing {
        address registry;
        address router;
        address ammFactory;
        address timelock;
        address peopleMultisig;
        address creatorVesting;
        address feeRecipient;
        address agentExecutor;
    }

    struct NewDeployment {
        BondingCurveMarket bondingCurve;
        CommunityTokenVault communityVault;
        TokenFactory tokenFactory;
        NftFactory nftFactory;
        CommunityAgentWallet agentWallet;
        StableFeeGateway gateway;
    }

    uint256 internal constant APPROVED_TOKEN_STABLE_FEE_USD6 = 5_000000; // 5.00 USD, owner-approved
    uint256 internal constant APPROVED_NFT_STABLE_FEE_USD6 = 10_000000; // 10.00 USD, owner-approved

    function _readExisting() internal returns (Existing memory e) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/97401.json"));
        e.registry = vm.parseJsonAddress(json, ".contracts.registry");
        e.router = vm.parseJsonAddress(json, ".contracts.router");
        e.ammFactory = vm.parseJsonAddress(json, ".contracts.ammFactory");
        e.timelock = vm.parseJsonAddress(json, ".contracts.timelock");
        e.peopleMultisig = vm.parseJsonAddress(json, ".contracts.peopleMultisig");
        e.creatorVesting = vm.parseJsonAddress(json, ".contracts.creatorVesting");
        address currentFeeRecipient = vm.envOr("FEE_RECIPIENT", address(0));
        e.feeRecipient = currentFeeRecipient == address(0)
            ? 0xc949b419ab6a202923D69F1e8B1784535293C375
            : currentFeeRecipient;
        e.agentExecutor = vm.envOr("AGENT_EXECUTOR", 0xF363639474cF4FE1c8a735CeFB444A42621C0Fb8);
    }

    function run() external returns (NewDeployment memory d) {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");

        Existing memory e = _readExisting();
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        uint256 tokenStableFeeUsd6 = vm.envOr("GATEWAY_TOKEN_STABLE_FEE_USD6", APPROVED_TOKEN_STABLE_FEE_USD6);
        uint256 nftStableFeeUsd6 = vm.envOr("GATEWAY_NFT_STABLE_FEE_USD6", APPROVED_NFT_STABLE_FEE_USD6);

        vm.startBroadcast(deployerKey);

        // S1-01: fixed CurveMath invariant re-derivation is inlined into this bytecode.
        d.bondingCurve = new BondingCurveMarket(
            e.registry, e.feeRecipient, IPeopleRouter(e.router), IPeopleAmmFactory(e.ammFactory), deployer, e.feeRecipient
        );

        // H-01: recipient allow-list is inlined into this bytecode.
        d.communityVault = new CommunityTokenVault(e.registry, deployer);

        d.tokenFactory = new TokenFactory(
            e.feeRecipient, d.bondingCurve, ICreatorVesting(e.creatorVesting), ICommunityTokenVault(address(d.communityVault)), deployer
        );

        d.nftFactory = new NftFactory(e.feeRecipient, e.registry, deployer);

        // H-03: zero-amount rejection + bounded eviction is inlined into this bytecode. Roles
        // are final at construction — no temporary-owner step needed (not Ownable).
        d.agentWallet = new CommunityAgentWallet(e.agentExecutor, e.timelock, e.feeRecipient, e.peopleMultisig);

        // C-01/S1-02/P1-14: owner is the multisig directly (not a temporary deployer step) so
        // `pause()` stays an instant incident-response action with no intermediate window where
        // the deployer EOA could pause/unpause.
        d.gateway = new StableFeeGateway(
            e.peopleMultisig, e.feeRecipient, address(d.tokenFactory), address(d.nftFactory), tokenStableFeeUsd6, nftStableFeeUsd6
        );

        // Wire the gateway while the deployer is still the factories' owner (instant, no
        // timelock delay) -- this is the whole reason for the temporary-owner step above.
        d.tokenFactory.setGateway(address(d.gateway));
        d.nftFactory.setGateway(address(d.gateway));

        // H-02: hand the factories/curve/vault to the timelock now that wiring is done.
        d.bondingCurve.transferOwnership(e.timelock);
        d.communityVault.transferOwnership(e.timelock);
        d.tokenFactory.transferOwnership(e.timelock);
        d.nftFactory.transferOwnership(e.timelock);

        vm.stopBroadcast();

        console2.log("BondingCurveMarket", address(d.bondingCurve));
        console2.log("CommunityTokenVault", address(d.communityVault));
        console2.log("TokenFactory", address(d.tokenFactory));
        console2.log("NftFactory", address(d.nftFactory));
        console2.log("CommunityAgentWallet", address(d.agentWallet));
        console2.log("StableFeeGateway", address(d.gateway));
    }
}
