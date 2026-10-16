// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {NftFactory} from "../src/nft/NftFactory.sol";
import {StableFeeGateway} from "../src/fees/StableFeeGateway.sol";
import {ICreatorVesting, IPeopleRouter, IPeopleAmmFactory} from "../src/interfaces/ICreatorVesting.sol";
import {ICommunityTokenVault} from "../src/interfaces/ICommunityTokenVault.sol";

/// @notice Testnet (97401) redeploy of the launch set for the 180-day `finalize` rule and
/// leftovers-to-community-pool (owner-approved 2026-10-13): new registry, curve, creator
/// vesting, community vault, token factory, NFT factory and stable-fee gateway at 1 USD / 2 USD.
/// Everything is wired by the deployer, then ownership goes to the existing PeopleMultisig.
/// The gateway is Ownable2Step: the multisig must call `acceptOwnership()` to finish.
contract RedeployLaunchSet20261013 is Script {
    uint256 internal constant TOKEN_FEE_USD6 = 1_000000; // 1.00 USD
    uint256 internal constant NFT_FEE_USD6 = 2_000000; // 2.00 USD

    function run() external {
        revert("superseded: use RedeployFullStack.s.sol (no PromoRewardsVault, reuses stale-registry AMM)");
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/97401.json"));
        address router = vm.parseJsonAddress(json, ".contracts.router");
        address ammFactory = vm.parseJsonAddress(json, ".contracts.ammFactory");
        address multisig = vm.parseJsonAddress(json, ".contracts.peopleMultisig");
        address feeRecipient = 0xc949b419ab6a202923D69F1e8B1784535293C375;
        address tUSDC = 0x3578D3bEdC71DA9B1472eb2719Aa47D98223E1BA;
        address tUSDT = 0x5F0BD878762F7DF035a4C71E3D75740348a3FADC;

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        BondingCurveMarket curve = new BondingCurveMarket(
            address(registry), feeRecipient, IPeopleRouter(router), IPeopleAmmFactory(ammFactory), deployer, feeRecipient
        );
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), deployer);
        TokenFactory tokenFactory = new TokenFactory(
            feeRecipient, curve, ICreatorVesting(address(vesting)), ICommunityTokenVault(address(vault)), deployer
        );
        NftFactory nftFactory = new NftFactory(feeRecipient, address(registry), deployer);
        registry.setTokenFactory(address(tokenFactory));

        StableFeeGateway gateway = new StableFeeGateway(
            deployer, feeRecipient, address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        gateway.setStableAllowed(tUSDC, true);
        gateway.setStableAllowed(tUSDT, true);
        tokenFactory.setGateway(address(gateway));
        nftFactory.setGateway(address(gateway));

        registry.transferOwnership(multisig);
        curve.transferOwnership(multisig);
        vault.transferOwnership(multisig);
        tokenFactory.transferOwnership(multisig);
        nftFactory.transferOwnership(multisig);
        gateway.transferOwnership(multisig); // pending until the multisig calls acceptOwnership()

        vm.stopBroadcast();

        console2.log("registry", address(registry));
        console2.log("bondingCurve", address(curve));
        console2.log("creatorVesting", address(vesting));
        console2.log("communityVault", address(vault));
        console2.log("tokenFactory", address(tokenFactory));
        console2.log("nftFactory", address(nftFactory));
        console2.log("gateway", address(gateway));
    }
}
