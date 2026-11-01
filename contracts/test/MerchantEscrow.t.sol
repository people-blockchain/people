// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerchantEscrow} from "../src/lavka/MerchantEscrow.sol";

contract MerchantEscrowTest is Test {
    MerchantEscrow escrow;
    address merchant = address(0xA11CE);
    address customer = address(0xC0FFEE);
    uint256 minDuration;

    function setUp() public {
        escrow = new MerchantEscrow(address(this));
        vm.deal(customer, 5 ether);
        minDuration = escrow.MIN_ESCROW_DURATION();
    }

    function testRelease() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 2 ether}(
            merchant, uint64(block.timestamp + minDuration), bytes32("terms")
        );
        vm.prank(customer);
        escrow.releaseToMerchant(id);
        assertEq(merchant.balance, 2 ether);
    }

    function testRefundAfterDeadline() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.warp(block.timestamp + minDuration + escrow.MERCHANT_CLAIM_WINDOW() + 1);
        vm.prank(customer);
        escrow.refundCustomer(id);
        assertEq(customer.balance, 5 ether);
    }

    function testCreateEscrowRevertsOnZeroDeadline() public {
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.BadDeadline.selector);
        escrow.createEscrow{value: 1 ether}(merchant, 0, bytes32(0));
    }

    function testCreateEscrowRevertsBelowMinDuration() public {
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.BadDeadline.selector);
        escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + 1), bytes32(0));
    }

    function testCreateEscrowRevertsOnZeroMerchant() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.BadMerchant.selector);
        escrow.createEscrow{value: 1 ether}(address(0), deadline, bytes32(0));
    }

    function testCreateEscrowRevertsOnSelfMerchant() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.BadMerchant.selector);
        escrow.createEscrow{value: 1 ether}(customer, deadline, bytes32(0));
    }

    function testCustomerCannotRefundBeforeDeadline() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.refundCustomer(id);
    }

    function testMerchantCanClaimReleaseAfterDeadlineIfCustomerSilent() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.warp(block.timestamp + minDuration + 1);
        vm.prank(merchant);
        escrow.claimRelease(id);
        assertEq(merchant.balance, 1 ether);
    }

    function testMerchantCannotClaimReleaseBeforeDeadline() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.claimRelease(id);
    }

    function testCustomerCannotClaimRelease() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.warp(block.timestamp + minDuration + 1);
        vm.prank(customer);
        vm.expectRevert(MerchantEscrow.NotParty.selector);
        escrow.claimRelease(id);
    }

    function testAutoCloseDisputeRevertsBeforeWindow() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(customer);
        escrow.openDispute(id);
        vm.expectRevert(MerchantEscrow.DisputeWindowNotElapsed.selector);
        escrow.autoCloseDispute(id);
    }

    /// @notice S2-02: an auto-closed dispute (resolver never acted) splits the escrow 50/50
    /// instead of refunding the customer in full — a free, cost-free dispute must not let the
    /// customer win by default.
    function testAutoCloseDisputeSplitsAfterWindow() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        // MF-12: the merchant may dispute only once the deadline has passed (inside its claim window).
        vm.warp(block.timestamp + minDuration);
        vm.prank(merchant);
        escrow.openDispute(id);
        vm.warp(block.timestamp + escrow.DISPUTE_AUTO_CLOSE_WINDOW() + 1);
        // Anyone can trigger the auto-close, not just a party to the escrow.
        escrow.autoCloseDispute(id);
        // Pull payment: the split is credited, not pushed.
        assertEq(escrow.pendingWithdrawals(customer), 0.5 ether);
        assertEq(escrow.pendingWithdrawals(merchant), 0.5 ether);
        vm.prank(customer);
        escrow.withdrawPending();
        vm.prank(merchant);
        escrow.withdrawPending();
        assertEq(customer.balance, 4.5 ether);
        assertEq(merchant.balance, 0.5 ether);
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Split));
    }

    function testOwnerCanStillResolveDisputeBeforeAutoCloseWindow() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(customer);
        escrow.openDispute(id);
        escrow.resolveDispute(id, false);
        assertEq(merchant.balance, 1 ether);
    }

    // ------------------------------------------------------------------ MF-12

    /// @notice MF-12: the merchant used to be able to open a dispute right after payment and take
    /// 50% via `autoCloseDispute` without delivering, stripping the customer of `refundCustomer`.
    /// The merchant may now dispute only inside its claim window
    /// `[deadline, deadline + MERCHANT_CLAIM_WINDOW)`; the customer's self-refund still works.
    function testMerchantCannotOpenDisputeBeforeDeadline_customerRefundStillWorks() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));

        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.openDispute(id);

        vm.warp(uint256(deadline) + escrow.MERCHANT_CLAIM_WINDOW());
        // Past the claim window the merchant cannot dispute either (it would block the refund).
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.ClaimWindowElapsed.selector);
        escrow.openDispute(id);

        // Still Locked: the customer keeps its full refund path.
        uint256 before = customer.balance;
        vm.prank(customer);
        escrow.refundCustomer(id);
        assertEq(customer.balance - before, 1 ether, "customer fully refunded");
        assertEq(merchant.balance, 0);
    }

    /// @notice The customer may dispute at any time while Locked; the merchant only once the
    /// deadline has passed.
    function testDisputeOpeningRights_customerAnytime_merchantAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.startPrank(customer);
        uint256 idA = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        uint256 idB = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        escrow.openDispute(idA);
        vm.stopPrank();

        vm.warp(deadline);
        vm.prank(merchant);
        escrow.openDispute(idB);
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(idB);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Disputed));
    }

    /// @notice Window boundaries: the last second of the claim window is inside, the window end is not.
    function testMerchantDisputeWindowBoundaries() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.startPrank(customer);
        uint256 idA = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        uint256 idB = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        vm.stopPrank();

        vm.warp(uint256(deadline) - 1);
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.DeadlineNotReached.selector);
        escrow.openDispute(idA);

        vm.warp(uint256(deadline) + escrow.MERCHANT_CLAIM_WINDOW() - 1);
        vm.prank(merchant);
        escrow.openDispute(idA);

        vm.warp(uint256(deadline) + escrow.MERCHANT_CLAIM_WINDOW());
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.ClaimWindowElapsed.selector);
        escrow.openDispute(idB);
    }
}
