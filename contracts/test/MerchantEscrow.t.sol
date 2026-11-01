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
        uint256 id =
            escrow.createEscrow{value: 2 ether}(merchant, uint64(block.timestamp + minDuration), bytes32("terms"));
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
        vm.prank(merchant);
        escrow.openDispute(id);
        vm.warp(block.timestamp + escrow.DISPUTE_AUTO_CLOSE_WINDOW() + 1);
        // Anyone can trigger the auto-close, not just a party to the escrow.
        escrow.autoCloseDispute(id);
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

    // ---- A10: no merchant dispute after the deadline

    function testMerchantCannotOpenDisputeAtOrAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        vm.warp(deadline);
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.DisputeAfterDeadline.selector);
        escrow.openDispute(id);
        vm.warp(uint256(deadline) + escrow.MERCHANT_CLAIM_WINDOW());
        vm.prank(merchant);
        vm.expectRevert(MerchantEscrow.DisputeAfterDeadline.selector);
        escrow.openDispute(id);
        // the lapsed claim keeps the customer's self-refund path
        vm.prank(customer);
        escrow.refundCustomer(id);
        assertEq(customer.balance, 5 ether);
    }

    function testMerchantCanOpenDisputeOneSecondBeforeDeadline() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        vm.warp(uint256(deadline) - 1);
        vm.prank(merchant);
        escrow.openDispute(id);
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Disputed));
    }

    function testCustomerCanStillDisputeAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + minDuration);
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, deadline, bytes32(0));
        vm.warp(uint256(deadline) + 1);
        vm.prank(customer);
        escrow.openDispute(id);
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Disputed));
    }

    // ---- A10: push payout with pull fallback

    function testRejectingCustomerCannotBlockMerchantHalf() public {
        RejectingReceiver bad = new RejectingReceiver(escrow);
        uint256 id = bad.create{value: 1 ether}(merchant, uint64(block.timestamp + minDuration));
        vm.prank(merchant);
        escrow.openDispute(id);
        vm.warp(block.timestamp + escrow.DISPUTE_AUTO_CLOSE_WINDOW());
        escrow.autoCloseDispute(id);
        assertEq(merchant.balance, 0.5 ether);
        assertEq(escrow.owed(address(bad)), 0.5 ether);
        assertEq(address(escrow).balance, 0.5 ether);

        vm.expectRevert(MerchantEscrow.WithdrawFailed.selector);
        bad.withdraw();
        bad.setAccept(true);
        bad.withdraw();
        assertEq(address(bad).balance, 0.5 ether);
        assertEq(escrow.owed(address(bad)), 0);
        assertEq(address(escrow).balance, 0);
        vm.expectRevert(MerchantEscrow.NothingOwed.selector);
        bad.withdraw();
    }

    function testGasBurningMerchantIsCreditedNotBlocking() public {
        GasBurner burner = new GasBurner(escrow);
        vm.prank(customer);
        uint256 id =
            escrow.createEscrow{value: 1 ether}(address(burner), uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(customer);
        escrow.releaseToMerchant{gas: 1_000_000}(id);
        assertEq(escrow.owed(address(burner)), 1 ether);
        (,,,, MerchantEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(MerchantEscrow.Status.Released));
    }

    function testEoaPayoutsStayPush() public {
        vm.prank(customer);
        uint256 id = escrow.createEscrow{value: 1 ether}(merchant, uint64(block.timestamp + minDuration), bytes32(0));
        vm.prank(customer);
        escrow.releaseToMerchant(id);
        assertEq(merchant.balance, 1 ether);
        assertEq(escrow.owed(merchant), 0);
    }
}

contract RejectingReceiver {
    MerchantEscrow internal immutable escrow;
    bool public accept;

    constructor(MerchantEscrow e) {
        escrow = e;
    }

    function create(address merchant, uint64 deadline) external payable returns (uint256) {
        return escrow.createEscrow{value: msg.value}(merchant, deadline, bytes32(0));
    }

    function setAccept(bool a) external {
        accept = a;
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable {
        require(accept, "rejecting");
    }
}

contract GasBurner {
    MerchantEscrow internal immutable escrow;

    constructor(MerchantEscrow e) {
        escrow = e;
    }

    receive() external payable {
        while (true) {}
    }
}
