// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplLiquidityEscrow} from "../src/sale/PplLiquidityEscrow.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Stand-in for an LP-seeding / bridge contract (has code, accepts ERC20 by plain balance).
contract DummyDestination {}

/// @dev Unit tests for the escrow in isolation.
contract PplLiquidityEscrowTest is HubV2Base {
    PplLiquidityEscrow internal escrow;
    DummyDestination internal dest;
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant PLAN = keccak256("plan v1");

    function setUp() public override {
        super.setUp();
        dest = new DummyDestination();
        escrow = new PplLiquidityEscrow(IERC20(address(usdc)), owner, treasury);
    }

    function _announce(address d) internal {
        vm.prank(owner);
        escrow.announce(d, PLAN);
    }

    function _warpBy(uint256 s) internal {
        vm.warp(vm.getBlockTimestamp() + s);
    }

    // ---- constructor

    function test_constructorZeroChecks() public {
        vm.expectRevert(PplLiquidityEscrow.ZeroAddress.selector);
        new PplLiquidityEscrow(IERC20(address(0)), owner, treasury);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new PplLiquidityEscrow(IERC20(address(usdc)), address(0), treasury);
        vm.expectRevert(PplLiquidityEscrow.ZeroAddress.selector);
        new PplLiquidityEscrow(IERC20(address(usdc)), owner, address(0));
    }

    function test_constructorStoresConfig() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.treasury(), treasury);
        assertEq(escrow.owner(), owner);
        assertEq(escrow.NOTICE(), 30 days);
    }

    // ---- announce

    function test_announceRejectsBadDestinations() public {
        vm.startPrank(owner);
        vm.expectRevert(PplLiquidityEscrow.BadDestination.selector);
        escrow.announce(address(0), PLAN);
        vm.expectRevert(PplLiquidityEscrow.BadDestination.selector);
        escrow.announce(owner, PLAN);
        vm.expectRevert(PplLiquidityEscrow.BadDestination.selector);
        escrow.announce(treasury, PLAN);
        vm.expectRevert(PplLiquidityEscrow.BadDestination.selector);
        escrow.announce(stranger, PLAN); // EOA
        vm.stopPrank();
        assertEq(escrow.pendingDestination(), address(0));
    }

    function test_announceRecordsAndEmits() public {
        uint256 t = vm.getBlockTimestamp();
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PplLiquidityEscrow.ReleaseAnnounced(address(dest), PLAN, t + 30 days);
        _announce(address(dest));
        assertEq(escrow.pendingDestination(), address(dest));
        assertEq(escrow.pendingPlanHash(), PLAN);
        assertEq(uint256(escrow.announcedAt()), t);
    }

    function test_onlyOwnerAnnounceAndCancel() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.announce(address(dest), PLAN);
        _announce(address(dest));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.cancel();
    }

    function test_doubleAnnounceReverts() public {
        _announce(address(dest));
        DummyDestination d2 = new DummyDestination();
        vm.prank(owner);
        vm.expectRevert(PplLiquidityEscrow.ReleasePending.selector);
        escrow.announce(address(d2), PLAN);
    }

    // ---- execute

    function test_executeBeforeNoticeReverts() public {
        usdc.mint(address(escrow), 1_000e6);
        vm.expectRevert(PplLiquidityEscrow.NoPendingRelease.selector);
        escrow.execute();
        uint256 t = vm.getBlockTimestamp();
        _announce(address(dest));
        vm.expectRevert(PplLiquidityEscrow.NoticeNotElapsed.selector);
        escrow.execute();
        vm.warp(t + 30 days - 1);
        vm.expectRevert(PplLiquidityEscrow.NoticeNotElapsed.selector);
        escrow.execute();
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
    }

    function test_executeAfterNoticeMovesFullBalanceByAnyone() public {
        usdc.mint(address(escrow), 1_000e6);
        uint256 t = vm.getBlockTimestamp();
        _announce(address(dest));
        vm.warp(t + 30 days);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PplLiquidityEscrow.Released(address(dest), 1_000e6);
        vm.prank(stranger);
        escrow.execute();
        assertEq(usdc.balanceOf(address(dest)), 1_000e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.pendingDestination(), address(0));
        assertEq(uint256(escrow.announcedAt()), 0);
        vm.expectRevert(PplLiquidityEscrow.NoPendingRelease.selector);
        escrow.execute();
    }

    function test_repeatableWithNewAnnounce() public {
        usdc.mint(address(escrow), 100e6);
        _announce(address(dest));
        _warpBy(30 days);
        escrow.execute();
        usdc.mint(address(escrow), 50e6);
        _announce(address(dest));
        vm.expectRevert(PplLiquidityEscrow.NoticeNotElapsed.selector);
        escrow.execute();
        _warpBy(30 days);
        escrow.execute();
        assertEq(usdc.balanceOf(address(dest)), 150e6);
    }

    function test_cancelClearsPending() public {
        usdc.mint(address(escrow), 1_000e6);
        _announce(address(dest));
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PplLiquidityEscrow.ReleaseCancelled(address(dest), PLAN);
        vm.prank(owner);
        escrow.cancel();
        assertEq(escrow.pendingDestination(), address(0));
        _warpBy(31 days);
        vm.expectRevert(PplLiquidityEscrow.NoPendingRelease.selector);
        escrow.execute();
        vm.prank(owner);
        vm.expectRevert(PplLiquidityEscrow.NoPendingRelease.selector);
        escrow.cancel();
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
    }

    // ---- ownership

    function test_renounceReverts() public {
        vm.prank(owner);
        vm.expectRevert(PplLiquidityEscrow.RenounceDisabled.selector);
        escrow.renounceOwnership();
        assertEq(escrow.owner(), owner);
    }

    function test_ownershipToDestinationBlocksExecute() public {
        usdc.mint(address(escrow), 1_000e6);
        _announce(address(dest));
        vm.prank(owner);
        escrow.transferOwnership(address(dest));
        vm.prank(address(dest));
        escrow.acceptOwnership();
        _warpBy(30 days);
        vm.expectRevert(PplLiquidityEscrow.BadDestination.selector);
        escrow.execute();
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
    }

    function test_noOtherUsdcPath() public {
        usdc.mint(address(escrow), 1_000e6);
        // owner has no way to pull USDC without announce + notice: nothing but execute() moves it.
        _announce(address(dest));
        vm.prank(owner);
        escrow.cancel();
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
        assertEq(usdc.balanceOf(owner), 0);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    // ---- fuzz

    /// @dev Escrow balance only decreases via execute(), only to the announced destination, only after NOTICE.
    function testFuzz_balanceOnlyDecreasesViaExecute(uint96 amount, uint32 waitS, bool doCancel, address caller) public {
        vm.assume(caller != address(escrow) && caller != address(0));
        usdc.mint(address(escrow), amount);
        _announce(address(dest));
        uint256 t = vm.getBlockTimestamp();

        if (doCancel) {
            vm.prank(owner);
            escrow.cancel();
        }
        vm.warp(t + uint256(waitS));

        vm.prank(caller);
        try escrow.execute() {
            assertFalse(doCancel, "executed after cancel");
            assertGe(uint256(waitS), 30 days, "executed early");
            assertEq(usdc.balanceOf(address(escrow)), 0);
            assertEq(usdc.balanceOf(address(dest)), amount);
        } catch {
            assertTrue(doCancel || uint256(waitS) < 30 days, "unexpected revert");
            assertEq(usdc.balanceOf(address(escrow)), amount);
            assertEq(usdc.balanceOf(address(dest)), 0);
        }
        assertEq(usdc.balanceOf(caller), caller == address(dest) ? amount * (doCancel || waitS < 30 days ? 0 : 1) : 0);
        assertEq(usdc.balanceOf(owner), 0);
        assertEq(usdc.balanceOf(treasury), 0);
    }
}

/// @dev Hub -> escrow -> destination, end to end.
contract PplLiquidityEscrowIntegrationTest is HubV2Base {
    PplLiquidityEscrow internal escrow;
    DummyDestination internal dest;
    address internal alice = makeAddr("alice");

    function setUp() public override {
        super.setUp();
        escrow = new PplLiquidityEscrow(IERC20(address(usdc)), owner, treasury);
        dest = new DummyDestination();
        // replace the base hub with one whose immutable receiver is the escrow
        hub = new HubV2Harness(address(usdc), treasury, address(escrow), owner, verifier);
        _open();
    }

    function test_hubReleaseThenEscrowRelease() public {
        _prepare(alice);
        _buy(alice, MAX_BUY);
        uint256 reserve = hub.reserveUsd6();
        assertGt(reserve, 0);

        vm.warp(vm.getBlockTimestamp() + 30 days + 1);
        vm.prank(owner);
        hub.announceLiquidityRelease();
        vm.warp(vm.getBlockTimestamp() + 30 days);
        hub.executeLiquidityRelease();
        assertEq(usdc.balanceOf(address(escrow)), reserve, "reserve landed in escrow");
        assertEq(usdc.balanceOf(address(hub)), hub.reserveUsd6());

        vm.prank(owner);
        escrow.announce(address(dest), keccak256("lp seeding plan"));
        vm.warp(vm.getBlockTimestamp() + 30 days);
        escrow.execute();
        assertEq(usdc.balanceOf(address(dest)), reserve, "destination got the reserve");
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(owner), 0);
        assertEq(usdc.balanceOf(treasury), MAX_BUY / 2, "treasury only has its sale half");
    }
}
