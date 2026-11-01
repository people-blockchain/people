// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {PplReturnBurn} from "../src/sale/PplReturnBurn.sol";
import {RewardVesting} from "../src/vesting/RewardVesting.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Opus r3 review fixes (H1, H2, M1–M3).
contract PplCurveHubV2OpusR3Test is HubV2Base {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal router = makeAddr("router");
    address internal rewardPool = makeAddr("rewardPool");

    bytes32 internal constant OP_SET_TRUSTED_ROUTER = keccak256("setTrustedRouter");

    PplReturnBurn internal burner;
    RewardVesting internal vesting;

    function setUp() public override {
        super.setUp();
        burner = new PplReturnBurn(owner);
        vm.prank(owner);
        burner.setPurchaseReporter(owner);
        vesting = new RewardVesting(owner);
        vm.deal(owner, 100 ether);
    }

    // ---- H1: liquidity release pause extension

    function test_pauseBeforeAnnounce_extendsDeadlineFromAnnounceWhileStillPaused() public {
        _open();
        vm.prank(owner);
        hub.pause();
        vm.warp(vm.getBlockTimestamp() + 10 days);
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 announced = vm.getBlockTimestamp();
        vm.warp(announced + 30 days);
        vm.expectRevert();
        hub.executeLiquidityRelease();
        vm.prank(owner);
        hub.unpause();
        assertEq(hub.releasePauseAccumulated(), 30 days);
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
        vm.warp(hub.liquidityReleaseExecutableAt());
        hub.executeLiquidityRelease();
        assertTrue(hub.liquidityReleased());
    }

    function test_announcePauseCancelReannounce_keepsPauseAccumulation() public {
        _open();
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 5 days);
        vm.prank(owner);
        hub.pause();
        vm.warp(t0 + 8 days);
        vm.prank(owner);
        hub.unpause();
        assertEq(hub.releasePauseAccumulated(), 3 days);
        vm.prank(owner);
        hub.cancelLiquidityRelease();
        assertEq(hub.releasePauseAccumulated(), 3 days);
        vm.prank(owner);
        hub.pause();
        vm.warp(t0 + 12 days);
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 t1 = vm.getBlockTimestamp();
        vm.warp(t1 + 30 days);
        vm.expectRevert();
        hub.executeLiquidityRelease();
        vm.prank(owner);
        hub.unpause();
        assertEq(hub.liquidityReleaseExecutableAt(), t1 + 30 days + 3 days + 30 days);
        vm.warp(hub.liquidityReleaseExecutableAt());
        hub.executeLiquidityRelease();
    }

    function test_executeLiquidityReleaseRevertsWhilePaused() public {
        _open();
        vm.prank(owner);
        hub.announceLiquidityRelease();
        vm.warp(hub.liquidityReleaseExecutableAt());
        vm.prank(owner);
        hub.pause();
        vm.expectRevert();
        hub.executeLiquidityRelease();
    }

    function test_pauseOverlapShiftsDeadlineExactly() public {
        _open();
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 announced = vm.getBlockTimestamp();
        vm.warp(announced + 4 days);
        vm.prank(owner);
        hub.pause();
        vm.warp(announced + 9 days);
        vm.prank(owner);
        hub.unpause();
        assertEq(hub.releasePauseAccumulated(), 5 days);
        assertEq(hub.liquidityReleaseExecutableAt(), announced + 30 days + 5 days);
    }

    // ---- H2: hub + PEOPLE burn ledger

    function test_hubSellBackRevertsWhenReturnExceedsHubPurchasedCap() public {
        _open();
        _prepare(alice);
        uint256 ppl = _buy(alice, MIN_BUY);
        vm.warp(vm.getBlockTimestamp() + 30 days);
        _seedRaised(hub.raisedUsd6());
        hub.testForceHubReturned(alice, ppl - 1);
        bytes32 id = _freshReturnId();
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(alice, ppl, id, deadline);
        vm.expectRevert(PplCurveHubV2.RewardPplNotSellable.selector);
        vm.prank(alice);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
    }

    function test_boughtPplSellableUpToPurchasedMinusReturned() public {
        _open();
        _prepare(alice);
        uint256 ppl = _buy(alice, MIN_BUY);
        vm.warp(vm.getBlockTimestamp() + 30 days);
        assertEq(hub.sellableBalance(alice), ppl);
        hub.testForceHubReturned(alice, ppl / 4);
        assertEq(hub.sellableBalance(alice), ppl - ppl / 4);
    }

    function test_returnBurnRevertsWithoutHubPurchaseCredit() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert(PplReturnBurn.NotHubPurchasedPpl.selector);
        burner.burnForReturn{value: 1 ether}(address(hub), bytes32("x"), alice, block.chainid);
    }

    function test_returnBurnRevertsForTransferredInPpl() public {
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(PplReturnBurn.NotHubPurchasedPpl.selector);
        burner.burnForReturn{value: 1 ether}(address(hub), bytes32("x"), bob, block.chainid);
    }

    function test_claimRewardToEoaThenReturnBurnReverts() public {
        vm.startPrank(owner);
        vesting.setForbiddenRecipient(address(burner), true);
        vesting.addGrant{value: 5 ether}(alice, uint64(block.timestamp), 1 days);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vesting.claim(payable(alice), 5 ether);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert(PplReturnBurn.NotHubPurchasedPpl.selector);
        burner.burnForReturn{value: 1 ether}(address(hub), bytes32("person"), alice, block.chainid);
    }

    // ---- M1: revoke trusted router immediately

    function test_revokeTrustedRouterImmediateDespiteQueuedGrant() public {
        address other = makeAddr("otherRouter");
        vm.prank(owner);
        bytes32 grantId = hub.queueSetTrustedRouter(other, true);
        _setTrustedRouter(router, true);
        assertTrue(hub.trustedRouter(router));
        vm.prank(owner);
        hub.queueSetTrustedRouter(router, false);
        assertFalse(hub.trustedRouter(router));
        (bool active,,,) = hub.pendingAdminOp(OP_SET_TRUSTED_ROUTER);
        assertTrue(active);
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetTrustedRouter(grantId);
        assertTrue(hub.trustedRouter(other));
        assertFalse(hub.trustedRouter(router));
    }

    // ---- M2: forbidden recipient on buy

    function test_recipientRewardBuyerForbiddenReverts() public {
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier, rewardPool);
        _installReturnVerifier(hub, returnVerifier);
        _open();
        _prepare(alice);
        _fund(rewardPool, MAX_BUY);
        vm.prank(rewardPool);
        vm.expectRevert(PplCurveHubV2.RewardBuyForbidden.selector);
        hub.buy(MIN_BUY, 0, rewardPool, address(0));
    }

    function test_trustedRouterCannotBuyForForbiddenRecipient() public {
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier, rewardPool);
        _installReturnVerifier(hub, returnVerifier);
        _queueTrustedRouter(router, true);
        _open();
        _prepare(alice);
        _fund(router, MAX_BUY);
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.RewardBuyForbidden.selector);
        hub.buy(MIN_BUY, 0, rewardPool, address(0));
    }

    // ---- M3: permanent forbidden in RewardVesting

    function test_forbiddenRecipientCannotBeUnset() public {
        address target = makeAddr("burner2");
        vm.startPrank(owner);
        vesting.setForbiddenRecipient(target, true);
        vm.expectRevert(RewardVesting.ForbiddenPermanent.selector);
        vesting.setForbiddenRecipient(target, false);
        vm.stopPrank();
    }

    function test_forbiddenRecipientCannotBeFeeWhitelisted() public {
        vm.startPrank(owner);
        vesting.setForbiddenRecipient(address(burner), true);
        vm.expectRevert(RewardVesting.ForbiddenRecipient.selector);
        vesting.setFeeSpendWhitelist(address(burner), true);
        vm.stopPrank();
    }
}
