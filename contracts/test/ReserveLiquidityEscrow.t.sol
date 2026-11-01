// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReserveLiquidityEscrow} from "../src/sale/ReserveLiquidityEscrow.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Stand-in for a future bridge adapter / LP seeder: any contract with code.
contract EscrowSink {}

contract EscrowStrayToken is ERC20 {
    constructor() ERC20("STRAY", "STRAY") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Tries to re-enter `release` from the token transfer.
contract EscrowReentrantToken is ERC20 {
    ReserveLiquidityEscrow public escrow;
    bool public reentryBlocked;

    constructor() ERC20("RE", "RE") {}

    function setEscrow(ReserveLiquidityEscrow e) external {
        escrow = e;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from == address(escrow) && address(escrow) != address(0)) {
            try escrow.release(IERC20(address(this))) {} catch {
                reentryBlocked = true;
            }
        }
    }
}

contract ReserveLiquidityEscrowTest is HubV2Base {
    ReserveLiquidityEscrow internal escrow;
    address internal safe;
    address internal sink;
    bytes32 internal constant DESC = keccak256("bridge adapter v1: USDC -> PEOPLE LP seeder -> LiquidityLock");

    function setUp() public override {
        super.setUp();
        safe = address(new EscrowSink()); // the Safe is a contract on mainnet
        sink = address(new EscrowSink());
        escrow = new ReserveLiquidityEscrow(usdc, safe, treasury);
    }

    function _activate(address dest) internal {
        vm.prank(safe);
        escrow.proposeDestination(dest, DESC);
        vm.warp(vm.getBlockTimestamp() + escrow.DESTINATION_DELAY());
        escrow.activateDestination();
    }

    // ---------------------------------------------------------------- constructor

    function test_constructorRejectsZero() public {
        vm.expectRevert(ReserveLiquidityEscrow.ZeroAddress.selector);
        new ReserveLiquidityEscrow(IERC20(address(0)), safe, treasury);
        vm.expectRevert(ReserveLiquidityEscrow.ZeroAddress.selector);
        new ReserveLiquidityEscrow(usdc, safe, address(0));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ReserveLiquidityEscrow(usdc, address(0), treasury);
    }

    // ---------------------------------------------------------------- proposal rules

    function test_onlyOwnerProposesAndCancels() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.proposeDestination(sink, DESC);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.cancelDestination();
        vm.stopPrank();
    }

    function test_badDestinationsRejected() public {
        vm.startPrank(safe);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(address(0), DESC);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(address(escrow), DESC);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(safe, DESC);
        vm.etch(treasury, hex"00");
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(treasury, DESC);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(makeAddr("plainKey"), DESC); // no code
        vm.stopPrank();
    }

    function test_activateWaitsFullNotice() public {
        vm.prank(safe);
        escrow.proposeDestination(sink, DESC);
        uint256 eta = vm.getBlockTimestamp() + 30 days;
        assertEq(escrow.pendingEta(), eta);
        assertEq(escrow.pendingDestination(), sink);
        assertEq(escrow.pendingDescriptionHash(), DESC);

        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(ReserveLiquidityEscrow.DestinationTimelocked.selector, eta));
        escrow.activateDestination();

        vm.warp(eta);
        escrow.activateDestination(); // permissionless
        assertEq(escrow.destination(), sink);
        assertEq(escrow.pendingDestination(), address(0));
        assertEq(escrow.pendingEta(), 0);
    }

    function test_reproposalRestartsNotice() public {
        vm.prank(safe);
        escrow.proposeDestination(sink, DESC);
        vm.warp(vm.getBlockTimestamp() + 29 days);
        address other = address(new EscrowSink());
        vm.prank(safe);
        escrow.proposeDestination(other, bytes32(0));
        vm.warp(vm.getBlockTimestamp() + 1 days);
        vm.expectRevert(
            abi.encodeWithSelector(ReserveLiquidityEscrow.DestinationTimelocked.selector, escrow.pendingEta())
        );
        escrow.activateDestination();
        vm.warp(vm.getBlockTimestamp() + 29 days);
        escrow.activateDestination();
        assertEq(escrow.destination(), other);
    }

    function test_cancelClearsPending() public {
        vm.expectRevert(ReserveLiquidityEscrow.NoPendingDestination.selector);
        vm.prank(safe);
        escrow.cancelDestination();

        vm.prank(safe);
        escrow.proposeDestination(sink, DESC);
        vm.prank(safe);
        escrow.cancelDestination();
        vm.warp(vm.getBlockTimestamp() + 31 days);
        vm.expectRevert(ReserveLiquidityEscrow.NoPendingDestination.selector);
        escrow.activateDestination();
        assertEq(escrow.destination(), address(0));
    }

    function test_changingActiveDestinationAlsoNeedsNotice() public {
        _activate(sink);
        address other = address(new EscrowSink());
        vm.prank(safe);
        escrow.proposeDestination(other, DESC);
        assertEq(escrow.destination(), sink, "old destination stays until the new notice passes");
        vm.warp(vm.getBlockTimestamp() + 30 days);
        escrow.activateDestination();
        assertEq(escrow.destination(), other);
    }

    function test_activateRejectsDestinationThatBecameOwner() public {
        address newSafe = address(new EscrowSink());
        vm.prank(safe);
        escrow.proposeDestination(newSafe, DESC);
        vm.prank(safe);
        escrow.transferOwnership(newSafe); // pending owner
        vm.warp(vm.getBlockTimestamp() + 30 days);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.activateDestination();
        vm.prank(newSafe);
        escrow.acceptOwnership();
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.activateDestination();
    }

    function test_ownershipCannotMoveToActiveDestination() public {
        _activate(sink);
        vm.prank(safe);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.transferOwnership(sink);
    }

    function test_renounceDisabled() public {
        vm.prank(safe);
        vm.expectRevert(ReserveLiquidityEscrow.RenounceDisabled.selector);
        escrow.renounceOwnership();
        assertEq(escrow.owner(), safe);
    }

    // ---------------------------------------------------------------- release

    function test_releaseNeedsActiveDestination() public {
        usdc.mint(address(escrow), 1_000e6);
        vm.expectRevert(ReserveLiquidityEscrow.NoDestination.selector);
        escrow.release(usdc);
        vm.prank(safe);
        escrow.proposeDestination(sink, DESC);
        vm.expectRevert(ReserveLiquidityEscrow.NoDestination.selector);
        escrow.release(usdc); // pending is not enough
    }

    function test_releaseSendsWholeBalanceToDestinationOnly() public {
        usdc.mint(address(escrow), 1_234_567e6);
        _activate(sink);
        uint256 safeBefore = usdc.balanceOf(safe);
        vm.prank(makeAddr("anyone"));
        uint256 sent = escrow.release(usdc);
        assertEq(sent, 1_234_567e6);
        assertEq(usdc.balanceOf(sink), 1_234_567e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(safe), safeBefore);
        vm.expectRevert(ReserveLiquidityEscrow.NothingToRelease.selector);
        escrow.release(usdc);
    }

    function test_strayTokensFollowTheReserve() public {
        EscrowStrayToken stray = new EscrowStrayToken();
        stray.mint(address(escrow), 5e18);
        _activate(sink);
        escrow.release(IERC20(address(stray)));
        assertEq(stray.balanceOf(sink), 5e18);
    }

    function test_releaseNotReentrant() public {
        EscrowReentrantToken re = new EscrowReentrantToken();
        re.setEscrow(escrow);
        re.mint(address(escrow), 100);
        _activate(sink);
        escrow.release(IERC20(address(re)));
        assertTrue(re.reentryBlocked());
        assertEq(re.balanceOf(sink), 100);
    }

    function testFuzz_ownerCannotPullFunds(uint256 amount, uint256 waitDays) public {
        amount = bound(amount, 1, 1e15);
        waitDays = bound(waitDays, 0, 3650);
        usdc.mint(address(escrow), amount);
        vm.warp(vm.getBlockTimestamp() + waitDays * 1 days);
        vm.startPrank(safe);
        vm.expectRevert(ReserveLiquidityEscrow.BadDestination.selector);
        escrow.proposeDestination(safe, DESC);
        vm.expectRevert(ReserveLiquidityEscrow.NoDestination.selector);
        escrow.release(usdc);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(escrow)), amount);
    }

    // ---------------------------------------------------------------- with the real hub

    function test_hubReleaseLandsInEscrowThenGoesToDestination() public {
        HubV2Harness h = new HubV2Harness(address(usdc), treasury, address(escrow), owner, verifier, address(0));
        vm.prank(owner);
        h.open();
        uint256 r = 1_000_000e6;
        h.forceRaised(r);
        uint256 res = r - r / 2;
        h.forceReserve(res);
        usdc.mint(address(h), res);

        // The Safe starts the destination notice in parallel with the hub's release notice.
        vm.prank(safe);
        escrow.proposeDestination(sink, DESC);
        vm.prank(owner);
        h.announceLiquidityRelease();
        vm.warp(h.liquidityReleaseExecutableAt());
        h.executeLiquidityRelease();

        assertEq(usdc.balanceOf(address(escrow)), res);
        assertEq(escrow.reserveBalance(), res);
        assertEq(usdc.balanceOf(treasury), 0, "treasury never gets the reserve");

        escrow.activateDestination();
        escrow.release(usdc);
        assertEq(usdc.balanceOf(sink), res);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_hubOnBaseAcceptsEscrowAsReceiver() public {
        // On Base mainnet the hub requires the receiver to be a contract; the escrow is one.
        vm.chainId(8453);
        address baseUsdc = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        vm.etch(baseUsdc, address(usdc).code);
        address baseTreasury = address(new EscrowSink());
        address baseOwner = address(new EscrowSink());
        ReserveLiquidityEscrow e = new ReserveLiquidityEscrow(IERC20(baseUsdc), baseOwner, baseTreasury);
        HubV2Harness h = new HubV2Harness(baseUsdc, baseTreasury, address(e), baseOwner, verifier, address(0));
        assertEq(h.liquidityReceiver(), address(e));
    }
}
