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

/// @notice Testnet (97401) redeploy for leftoverMode (Burn default / CommunityPool).
/// Redeploys registry, curve, vesting, vault, token/NFT factories, and a new StableFeeGateway
/// at the same $1 / $2 fees. The previous gateway (0x78e9…) cannot follow new factories —
/// its tokenFactory/nftFactory are immutable — so a new gateway is required; fees stay 1/2 USD.
/// Ownable contracts transferOwnership to the PeopleMultisig immediately; the gateway is
/// Ownable2Step (pending until the multisig calls acceptOwnership).
contract RedeployLaunchSet20261014 is Script {
    uint256 internal constant TOKEN_FEE_USD6 = 1_000000;
    uint256 internal constant NFT_FEE_USD6 = 2_000000;
    address internal constant MULTISIG = 0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB;
    address internal constant FEE_RECIPIENT = 0xc949b419ab6a202923D69F1e8B1784535293C375;
    address internal constant T_USDC = 0x3578D3bEdC71DA9B1472eb2719Aa47D98223E1BA;
    address internal constant T_USDT = 0x5F0BD878762F7DF035a4C71E3D75740348a3FADC;

    function run() external {
        revert("superseded: use RedeployFullStack.s.sol (no PromoRewardsVault, reuses stale-registry AMM)");
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/97401.json"));
        address router = vm.parseJsonAddress(json, ".contracts.router");
        address ammFactory = vm.parseJsonAddress(json, ".contracts.ammFactory");

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        vm.startBroadcast(key);

        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        BondingCurveMarket curve = new BondingCurveMarket(
            address(registry), FEE_RECIPIENT, IPeopleRouter(router), IPeopleAmmFactory(ammFactory), deployer, FEE_RECIPIENT
        );
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), deployer);
        TokenFactory tokenFactory = new TokenFactory(
            FEE_RECIPIENT, curve, ICreatorVesting(address(vesting)), ICommunityTokenVault(address(vault)), deployer
        );
        NftFactory nftFactory = new NftFactory(FEE_RECIPIENT, address(registry), deployer);
        registry.setTokenFactory(address(tokenFactory));

        StableFeeGateway gateway = new StableFeeGateway(
            deployer, FEE_RECIPIENT, address(tokenFactory), address(nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        gateway.setStableAllowed(T_USDC, true);
        gateway.setStableAllowed(T_USDT, true);
        tokenFactory.setGateway(address(gateway));
        nftFactory.setGateway(address(gateway));

        registry.transferOwnership(MULTISIG);
        curve.transferOwnership(MULTISIG);
        vault.transferOwnership(MULTISIG);
        tokenFactory.transferOwnership(MULTISIG);
        nftFactory.transferOwnership(MULTISIG);
        gateway.transferOwnership(MULTISIG); // Ownable2Step: pending until acceptOwnership()

        vm.stopBroadcast();

        console2.log("registry", address(registry));
        console2.log("bondingCurve", address(curve));
        console2.log("creatorVesting", address(vesting));
        console2.log("communityVault", address(vault));
        console2.log("tokenFactory", address(tokenFactory));
        console2.log("nftFactory", address(nftFactory));
        console2.log("gateway", address(gateway));
        console2.log("multisig", MULTISIG);
    }
}
