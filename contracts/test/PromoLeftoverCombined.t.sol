// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {PromoRewardsVault} from "../src/promo/PromoRewardsVault.sol";
import {ICommunityTokenVault} from "../src/interfaces/ICommunityTokenVault.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// Promo share (0/5/10%, #298) combined with the creator's leftover choice (owner rule
/// 2026-10-13): both paths credit the same CommunityTokenVault and must not interfere.
contract PromoLeftoverCombinedTest is Test {
    TokenFactory internal factory;
    BondingCurveMarket internal curve;
    CommunityTokenVault internal vault;
    PromoRewardsVault internal promo;
    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xB0B);
    uint256 internal constant SUPPLY = 1_000_000 ether;

    function setUp() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), address(0xFEE), router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        factory = new TokenFactory(address(0xFEE), curve, vesting, vault, address(this));
        registry.setTokenFactory(address(factory));
        promo = new PromoRewardsVault(address(registry), ICommunityTokenVault(address(vault)));
        factory.setPromoVault(address(promo));
        vm.deal(creator, 100 ether);
        vm.deal(buyer, 1_000_000 ether);
    }

    function _launch(uint16 promoBps, uint8 mode) internal returns (address token) {
        vm.prank(creator);
        token = factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Combo", "CMB", 18, SUPPLY, "", promoBps, mode);
    }

    function test_promo5_communityPool_finalizeThenReturnUnused() public {
        address token = _launch(500, 1);
        (CurveMath.Allocation memory a, uint256 promoAmt) = CurveMath.calculateAllocationWithPromo(SUPPLY, 500);
        assertEq(promoAmt, SUPPLY * 5 / 100);
        assertEq(IERC20(token).balanceOf(address(promo)), promoAmt);
        assertEq(curve.leftoverMode(token), 1);
        assertEq(vault.balances(token), a.communityPool);

        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 1, block.timestamp);
        vm.prank(creator);
        promo.award(token, address(0xA1), promoAmt / 100);

        vm.warp(block.timestamp + 180 days);
        curve.finalize(token);
        uint256 afterFinalize = vault.balances(token);
        assertGt(afterFinalize, a.communityPool, "unsold went to the pool");

        uint256 returned = promo.returnUnused(token);
        assertEq(returned, promoAmt - promoAmt / 100);
        assertEq(vault.balances(token), afterFinalize + returned);
        assertGe(IERC20(token).balanceOf(address(vault)), vault.balances(token));
    }

    function test_promo10_burn_migrates() public {
        address token = _launch(1000, 0);
        uint256 pool = vault.balances(token);
        uint256 burnBefore = IERC20(token).balanceOf(address(0xdead));
        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 1, block.timestamp);
        assertTrue(curve.isMigrated(token));
        assertEq(vault.balances(token), pool, "burn mode: no leftovers to pool");
        assertGt(IERC20(token).balanceOf(address(0xdead)), burnBefore);
        assertEq(IERC20(token).balanceOf(address(promo)), SUPPLY / 10, "promo untouched by migration");
    }

    function test_promo5_default5ArgAndPromoOverloadUseBurn() public {
        vm.prank(creator);
        address t1 = factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Aa", "AA", 18, SUPPLY, "", uint16(500));
        assertEq(curve.leftoverMode(t1), 0);
        vm.prank(creator);
        address t2 = factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Bb", "BB", 18, SUPPLY, "");
        assertEq(curve.leftoverMode(t2), 0);
    }

    function test_invalidModeOrPromoReverts() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Bad", "BAD", 18, SUPPLY, "", uint16(500), uint8(2));
        vm.prank(creator);
        vm.expectRevert();
        factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Bad", "BAD", 18, SUPPLY, "", uint16(750), uint8(1));
    }
}
