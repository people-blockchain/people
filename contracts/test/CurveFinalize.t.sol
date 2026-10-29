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
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// Owner rule 2026-10-13: a curve not sold out within 180 days can be finalized by anyone.
/// Unsold / migration leftovers follow the creator's leftoverMode (Burn default, or CommunityPool).
/// A sold-out curve still migrates. See CurveLeftoverMode.t.sol for mode coverage.
contract CurveFinalizeTest is Test {
    TokenFactory internal tokenFactory;
    BondingCurveMarket internal curve;
    CommunityTokenVault internal vault;
    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xB0B);
    address internal anyone = address(0xA11);

    function setUp() public {
        PeopleProtocolRegistry registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        curve = new BondingCurveMarket(address(registry), address(0xFEE), router, ammFactory, address(this), address(0x7EA5));
        CreatorVesting vesting = new CreatorVesting(address(registry));
        vault = new CommunityTokenVault(address(registry), address(this));
        tokenFactory = new TokenFactory(address(0xFEE), curve, vesting, vault, address(this));
        registry.setTokenFactory(address(tokenFactory));
        vm.deal(creator, 100 ether);
        vm.deal(buyer, 100_000 ether);
    }

    function _launch() internal returns (address token) {
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Test", "TST", 18, 1_000_000, "");
    }

    function test_cannotFinalizeBefore180Days() public {
        address token = _launch();
        vm.warp(block.timestamp + 180 days - 1);
        assertFalse(curve.canFinalize(token));
        vm.prank(anyone);
        vm.expectRevert(BondingCurveMarket.NotFinalizable.selector);
        curve.finalize(token);
    }

    function _launchMode(uint8 mode) internal returns (address token) {
        vm.prank(creator);
        token = tokenFactory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Test", "TST", 18, 1_000_000, "", uint16(0), mode
        );
    }

    function test_anyoneFinalizesAfter180Days_unsoldToCommunityPool() public {
        address token = _launchMode(1); // CommunityPool
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 1, block.timestamp);
        uint256 poolBefore = vault.balances(token);
        (, , uint256 eco,) = curve.curves(token);
        uint256 expectedUnsold = IERC20(token).balanceOf(address(curve)) - eco;

        vm.warp(block.timestamp + 180 days);
        vm.prank(anyone);
        curve.finalize(token);

        assertTrue(curve.finalized(token));
        assertEq(vault.balances(token), poolBefore + expectedUnsold, "pool credited");
        assertEq(IERC20(token).balanceOf(address(curve)), eco, "only ecosystem reserve stays");
        assertGe(IERC20(token).balanceOf(address(vault)), vault.balances(token));
        assertFalse(curve.isMigrated(token));

        vm.prank(buyer);
        vm.expectRevert();
        curve.buy{value: 1 ether}(token, 1, block.timestamp);

        vm.prank(anyone);
        vm.expectRevert(BondingCurveMarket.NotFinalizable.selector);
        curve.finalize(token);
    }

    function test_holdersCanStillSellAfterFinalize_tokensGoToPool() public {
        address token = _launch();
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 1, block.timestamp);
        uint256 bought = IERC20(token).balanceOf(buyer);
        vm.warp(block.timestamp + 181 days);
        curve.finalize(token);
        uint256 poolBefore = vault.balances(token);
        uint256 nativeBefore = buyer.balance;

        vm.startPrank(buyer);
        IERC20(token).approve(address(curve), bought);
        curve.sell(token, bought, 1, block.timestamp);
        vm.stopPrank();

        assertGt(buyer.balance, nativeBefore, "seller paid");
        assertEq(vault.balances(token), poolBefore + bought, "sold-back tokens to pool");
        (CurveMath.State memory st,,,) = _state(token);
        assertFalse(st.active);
    }

    function test_soldOutCurveMigratesAndCannotBeFinalized() public {
        address token = _launchMode(1); // CommunityPool so leftovers still land in the vault
        uint256 alloc = vault.balances(token);
        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 1, block.timestamp);
        assertTrue(curve.isMigrated(token), "migrated");
        assertEq(IERC20(token).balanceOf(address(0x7EA5)), 0, "treasury gets no leftovers");
        assertGt(vault.balances(token), alloc, "leftovers added to the community pool");
        assertEq(IERC20(token).balanceOf(address(vault)), vault.balances(token));
        vm.warp(block.timestamp + 200 days);
        assertFalse(curve.canFinalize(token));
        vm.expectRevert(BondingCurveMarket.NotFinalizable.selector);
        curve.finalize(token);
    }

    function test_soldOutCurveMigrates_defaultBurnsLeftovers() public {
        address token = _launch(); // Burn default
        uint256 alloc = vault.balances(token);
        uint256 burnBefore = IERC20(token).balanceOf(address(0xdead));
        vm.prank(buyer);
        curve.buy{value: 50_000 ether}(token, 1, block.timestamp);
        assertTrue(curve.isMigrated(token), "migrated");
        assertEq(IERC20(token).balanceOf(address(0x7EA5)), 0, "treasury gets no leftovers");
        assertEq(vault.balances(token), alloc, "burn mode: pool not credited leftovers");
        assertGt(IERC20(token).balanceOf(address(0xdead)), burnBefore, "leftovers burned");
    }

    function test_vaultDepositOnlyCreditsReceived() public {
        address token = _launch();
        vm.prank(buyer);
        curve.buy{value: 1 ether}(token, 1, block.timestamp);
        uint256 amt = IERC20(token).balanceOf(buyer) / 2;
        uint256 before = vault.balances(token);
        vm.startPrank(buyer);
        IERC20(token).approve(address(vault), amt);
        vault.deposit(token, amt);
        vm.stopPrank();
        assertEq(vault.balances(token), before + amt);
    }

    function _state(address token) internal view returns (CurveMath.State memory st, uint256 a, uint256 b, uint256 c) {
        (st, a, b, c) = curve.curves(token);
    }
}
