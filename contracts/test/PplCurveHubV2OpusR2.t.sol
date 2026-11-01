// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Opus r2 review fixes (M1, M2, owner rule §5.2) — see docs/v2/SPEC.md.
contract PplCurveHubV2OpusR2Test is HubV2Base {
    address internal alice = makeAddr("alice");

    bytes32 internal constant OP_SET_VERIFIER = keccak256("setVerifier");
    bytes32 internal constant OP_SET_TRUSTED_ROUTER = keccak256("setTrustedRouter");

    function test_adminOpExpiresAfterGrace() public {
        address next = makeAddr("nextVerifier");
        vm.prank(owner);
        bytes32 id = hub.queueSetVerifier(next);
        uint256 eta = vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK();
        vm.warp(eta + hub.GRACE_PERIOD() + 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.OpExpired.selector);
        hub.executeSetVerifier(id);
    }

    function test_onePendingOpPerKind() public {
        address v1 = makeAddr("v1");
        address v2 = makeAddr("v2");
        vm.startPrank(owner);
        hub.queueSetVerifier(v1);
        vm.expectRevert(PplCurveHubV2.KindAlreadyQueued.selector);
        hub.queueSetVerifier(v2);
        vm.stopPrank();
    }

    function test_pendingAdminOpView() public {
        address next = makeAddr("nextVerifier");
        vm.prank(owner);
        bytes32 id = hub.queueSetVerifier(next);
        (bool active, bytes32 id2, uint64 eta, bytes32 dataHash) = hub.pendingAdminOp(OP_SET_VERIFIER);
        assertTrue(active);
        assertEq(id2, id);
        assertEq(eta, vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        assertEq(dataHash, keccak256(abi.encode(OP_SET_VERIFIER, next, uint256(0))));
    }

    function test_pauseShiftsLiquidityReleaseDeadline() public {
        _open();
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 announced = vm.getBlockTimestamp();
        vm.warp(announced + 20 days);
        vm.prank(owner);
        hub.pause();
        vm.warp(announced + 25 days);
        vm.prank(owner);
        hub.unpause();
        assertEq(hub.releasePauseAccumulated(), 5 days);
        vm.warp(announced + 30 days);
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
        vm.warp(hub.liquidityReleaseExecutableAt());
        hub.executeLiquidityRelease();
        assertTrue(hub.liquidityReleased());
    }

    function test_setTrustedRouterTimelocked() public {
        address router = makeAddr("router");
        vm.prank(owner);
        bytes32 id = hub.queueSetTrustedRouter(router, true);
        uint256 eta = vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK();
        vm.warp(eta - 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.Timelocked.selector);
        hub.executeSetTrustedRouter(id);
        vm.warp(eta);
        vm.prank(owner);
        hub.executeSetTrustedRouter(id);
        assertTrue(hub.trustedRouter(router));
        (bool active,,,) = hub.pendingAdminOp(OP_SET_TRUSTED_ROUTER);
        assertFalse(active);
    }

    function test_rewardBuyerCannotBuyOrBecomeTrustedRouter() public {
        address rewardPool = makeAddr("rewardPool");
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier, rewardPool);
        _installReturnVerifier(hub, returnVerifier);
        _open();
        _prepare(alice);
        _fund(rewardPool, MAX_BUY);
        vm.prank(rewardPool);
        vm.expectRevert(PplCurveHubV2.RewardBuyForbidden.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.RewardBuyForbidden.selector);
        hub.queueSetTrustedRouter(rewardPool, true);
    }

    function test_sellableBalanceMatchesUnlockedLots() public {
        _open();
        _prepare(alice);
        _buy(alice, MAX_BUY);
        assertEq(hub.sellableBalance(alice), 0);
        vm.warp(vm.getBlockTimestamp() + 30 days);
        uint256 sellable = hub.sellableNow(alice);
        assertEq(hub.sellableBalance(alice), sellable);
        assertEq(hub.sellableBalance(alice), hub.pplOf(alice));
    }
}
