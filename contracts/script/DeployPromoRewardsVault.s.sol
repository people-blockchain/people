// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PromoRewardsVault} from "../src/promo/PromoRewardsVault.sol";
import {ICommunityTokenVault} from "../src/interfaces/ICommunityTokenVault.sol";

/// @notice Deploys `PromoRewardsVault`, the custodian for the optional creator promo share
/// (owner decision 2026-10-13). Deployed separately from `Deploy.s.sol` because the vault needs
/// the already-deployed `CommunityTokenVault`, and because the wiring call is owner-gated.
///
/// Env: PROMO_REGISTRY (the deployed `PeopleProtocolRegistry`),
/// PROMO_COMMUNITY_VAULT (the deployed `CommunityTokenVault`).
///
/// After this script runs, the `TokenFactory` owner (the timelock) must separately call
/// `tokenFactory.setPromoVault(address(vault))` — this script only broadcasts as a single
/// deployer EOA and cannot do it. Until then, launching with a non-zero promo share reverts with
/// `TokenFactory.PromoVaultNotSet`; the default 0% launch path is unaffected either way.
contract DeployPromoRewardsVault is Script {
    function run() external returns (PromoRewardsVault vault) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registry = vm.envAddress("PROMO_REGISTRY");
        address communityVault = vm.envAddress("PROMO_COMMUNITY_VAULT");

        vm.startBroadcast(deployerKey);
        vault = new PromoRewardsVault(registry, ICommunityTokenVault(communityVault));
        vm.stopBroadcast();

        console2.log("PromoRewardsVault", address(vault));
        console2.log("Now have the TokenFactory owner call setPromoVault with the address above");
    }
}
