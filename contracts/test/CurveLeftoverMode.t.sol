// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {IBondingCurveMarket} from "../src/interfaces/IBondingCurveMarket.sol";

/// Owner rule 2026-10-13 (Alex): creator chooses Burn (default) or CommunityPool for
/// migration leftovers and 180-day finalize unsold. Never creator, never treasury.
contract CurveLeftoverModeTest is Test {
    address internal constant BURN = address(0xdead);

    TokenFactory internal tokenFactory;
    BondingCurveMarket internal curve;
    CommunityTokenVault internal vault;
    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xB0B);
    address internal treasury = address(0x7EA5);

    function setUp() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), address(0xFEE), router, ammFactory, address(this), treasury);
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(address(0xFEE), curve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        vm.deal(creator, 100 ether);
        vm.deal(buyer, 100_000 ether);
    }

    function _launch(uint8 mode) internal returns (address token) {
        vm.prank(creator);
        if (mode == 0) {
            token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Test", "TST", 18, 1_000_000, "");
        } else {
            token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
                "Test", "TST", 18, 1_000_000, "", mode
            );
        }
    }

    function test_defaultCreateToken_leftoverModeIsBurn() public {
        address token = _launch(0);
        assertEq(curve.leftoverMode(token), uint8(IBondingCurveMarket.LeftoverMode.Burn));
    }

    function test_invalidLeftoverModeReverts() public {
        vm.prank(creator);
        vm.expectRevert(TokenFactory.InvalidLeftoverMode.selector);
        tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Bad", "BAD", 18, 1_000_000, "", 2);
    }

    function test_migrate_defaultBurnsLeftovers() public {
        address token = _launch(0);
        uint256 poolBefore = vault.balances(token);
        uint256 burnBefore = IERC20(token).balanceOf(BURN);

        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 0);
        assertTrue(curve.isMigrated(token));

        assertGt(IERC20(token).balanceOf(BURN), burnBefore, "leftovers burned to 0xdead");
        assertEq(vault.balances(token), poolBefore, "community pool unchanged on burn mode");
        assertEq(IERC20(token).balanceOf(treasury), 0, "treasury gets nothing");
        (, , uint256 eco,) = curve.curves(token);
        assertEq(IERC20(token).balanceOf(address(curve)), eco, "only ecosystem reserve remains");
    }

    function test_migrate_communityPoolReceivesLeftovers() public {
        address token = _launch(1);
        assertEq(curve.leftoverMode(token), uint8(IBondingCurveMarket.LeftoverMode.CommunityPool));
        uint256 poolBefore = vault.balances(token);
        uint256 burnBefore = IERC20(token).balanceOf(BURN);

        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 0);
        assertTrue(curve.isMigrated(token));

        assertGt(vault.balances(token), poolBefore, "leftovers to community pool");
        assertEq(IERC20(token).balanceOf(BURN), burnBefore, "burn address unchanged");
        assertEq(IERC20(token).balanceOf(treasury), 0, "treasury gets nothing");
    }

    function test_finalize_defaultBurnsUnsold() public {
        address token = _launch(0);
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 0);
        (, , uint256 eco,) = curve.curves(token);
        uint256 expectedUnsold = IERC20(token).balanceOf(address(curve)) - eco;
        uint256 burnBefore = IERC20(token).balanceOf(BURN);
        uint256 poolBefore = vault.balances(token);

        vm.warp(block.timestamp + 180 days);
        curve.finalize(token);

        assertTrue(curve.finalized(token));
        assertEq(IERC20(token).balanceOf(BURN), burnBefore + expectedUnsold, "unsold burned");
        assertEq(vault.balances(token), poolBefore, "pool unchanged");
        assertEq(IERC20(token).balanceOf(treasury), 0);
        assertEq(IERC20(token).balanceOf(address(curve)), eco);
    }

    function test_finalize_communityPoolReceivesUnsold() public {
        address token = _launch(1);
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 0);
        (, , uint256 eco,) = curve.curves(token);
        uint256 expectedUnsold = IERC20(token).balanceOf(address(curve)) - eco;
        uint256 poolBefore = vault.balances(token);
        uint256 burnBefore = IERC20(token).balanceOf(BURN);

        vm.warp(block.timestamp + 180 days);
        curve.finalize(token);

        assertEq(vault.balances(token), poolBefore + expectedUnsold, "unsold to pool");
        assertEq(IERC20(token).balanceOf(BURN), burnBefore, "not burned");
        assertEq(IERC20(token).balanceOf(treasury), 0);
    }
}
