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
import {PromoRewardsVault} from "../src/promo/PromoRewardsVault.sol";
import {IPeopleRouter, IPeopleAmmFactory} from "../src/interfaces/ICreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";

/// @notice Full launch-stack redeploy on 97401 (owner-approved 2026-10-16).
/// @dev The live registry was an older build whose `setTokenFactory` is set-once, so a new
/// TokenFactory could never be registered there. This deploys a fresh, rotatable registry and
/// everything that gates on it (CreatorVesting, CommunityTokenVault, BondingCurveMarket,
/// TokenFactory, PromoRewardsVault, NftFactory) plus a StableFeeGateway pointed at the new
/// factories. PeopleAmmFactory + PeopleRouter are redeployed too: the AMM factory's `registry`
/// is immutable, and on the old registry its M07-2 pre-listing guard would be a no-op for every
/// new token (a dust pre-created pair would permanently brick curve migration, whose
/// addLiquidityETH uses min == desired). WPPL has no registry coupling and is reused. The six
/// legacy demo pools stay on the old AMM (manifest keys routerV1 / ammFactoryV1); old tokens
/// stay on the old contracts.
///
/// The deployer is the temporary owner only for the in-broadcast wiring (registry factory,
/// promo vault, gateways); every Ownable then goes to the PeopleMultisig (owner decision for
/// this redeploy: multisig, not timelock). The gateway is Ownable2Step: the deployer allows
/// tUSDC/tUSDT, then ownership is offered to the multisig, which must call acceptOwnership.
/// Includes the 2026-10-13 rules: creator-chosen leftoverMode (Burn / CommunityPool) and the
/// 180-day curve finalize, alongside the 0/5/10% promo share.
contract RedeployFullStack is Script {
    struct D {
        PeopleProtocolRegistry registry;
        PeopleAmmFactory ammFactory;
        PeopleRouter router;
        CreatorVesting creatorVesting;
        CommunityTokenVault communityVault;
        BondingCurveMarket bondingCurve;
        TokenFactory tokenFactory;
        PromoRewardsVault promoVault;
        NftFactory nftFactory;
        StableFeeGateway gateway;
    }

    address internal constant FEE_RECIPIENT = 0xc949b419ab6a202923D69F1e8B1784535293C375;
    /// @dev PeopleMultisig the live site already uses (2-of-3; three independent signers), checked
    /// on chain before this deploy. Replaces 0x8E6a…9d03 (older multisig build).
    address internal constant MULTISIG = 0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB;
    /// @dev Owner-approved launch fees from the 2026-10-14 public redeploy: $1 token, $2 NFT.
    uint256 internal constant TOKEN_FEE_USD6 = 1_000000;
    uint256 internal constant NFT_FEE_USD6 = 2_000000;
    address internal constant T_USDC = 0x3578D3bEdC71DA9B1472eb2719Aa47D98223E1BA;
    address internal constant T_USDT = 0x5F0BD878762F7DF035a4C71E3D75740348a3FADC;

    function run() external returns (D memory d) {
        require(block.chainid == PeopleConstants.PEOPLE_EVM_CHAIN_ID, "wrong chain id");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/97401.json"));
        address wppl = vm.parseJsonAddress(json, ".contracts.wppl");
        address multisig = MULTISIG;
        // Single-step Ownable handoff is irreversible: refuse to run unless the target really is
        // a 2-of-3 PeopleMultisig.
        require(multisig.code.length > 0, "multisig has no code");
        (bool ok, bytes memory data) = multisig.staticcall(abi.encodeWithSignature("threshold()"));
        require(ok && data.length == 32 && abi.decode(data, (uint256)) == 2, "multisig threshold != 2");
        (ok, data) = multisig.staticcall(abi.encodeWithSignature("ownerCount()"));
        require(ok && data.length == 32 && abi.decode(data, (uint256)) == 3, "multisig owners != 3");

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        d.registry = new PeopleProtocolRegistry();
        d.ammFactory = new PeopleAmmFactory(address(d.registry));
        d.router = new PeopleRouter(address(d.ammFactory), WPPL(payable(wppl)));
        d.creatorVesting = new CreatorVesting(address(d.registry));
        d.communityVault = new CommunityTokenVault(address(d.registry), deployer);
        d.bondingCurve = new BondingCurveMarket(
            address(d.registry), FEE_RECIPIENT, IPeopleRouter(address(d.router)), IPeopleAmmFactory(address(d.ammFactory)), deployer, FEE_RECIPIENT
        );
        d.tokenFactory = new TokenFactory(FEE_RECIPIENT, d.bondingCurve, d.creatorVesting, d.communityVault, deployer);
        d.registry.setTokenFactory(address(d.tokenFactory));
        d.promoVault = new PromoRewardsVault(address(d.registry), d.communityVault);
        d.tokenFactory.setPromoVault(address(d.promoVault));
        d.nftFactory = new NftFactory(FEE_RECIPIENT, address(d.registry), deployer);
        d.gateway = new StableFeeGateway(
            deployer, FEE_RECIPIENT, address(d.tokenFactory), address(d.nftFactory), TOKEN_FEE_USD6, NFT_FEE_USD6
        );
        d.gateway.setStableAllowed(T_USDC, true);
        d.gateway.setStableAllowed(T_USDT, true);
        d.tokenFactory.setGateway(address(d.gateway));
        d.nftFactory.setGateway(address(d.gateway));

        d.registry.transferOwnership(multisig);
        d.communityVault.transferOwnership(multisig);
        d.bondingCurve.transferOwnership(multisig);
        d.tokenFactory.transferOwnership(multisig);
        d.nftFactory.transferOwnership(multisig);
        d.gateway.transferOwnership(multisig); // Ownable2Step: multisig must acceptOwnership()
        vm.stopBroadcast();

        console2.log("registry", address(d.registry));
        console2.log("ammFactory", address(d.ammFactory));
        console2.log("router", address(d.router));
        console2.log("creatorVesting", address(d.creatorVesting));
        console2.log("communityVault", address(d.communityVault));
        console2.log("bondingCurve", address(d.bondingCurve));
        console2.log("tokenFactory", address(d.tokenFactory));
        console2.log("promoRewardsVault", address(d.promoVault));
        console2.log("nftFactory", address(d.nftFactory));
        console2.log("gateway", address(d.gateway));
    }
}
