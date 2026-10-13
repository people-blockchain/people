// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LavkaPass} from "../src/lavka/LavkaPass.sol";

contract LavkaPassTest is Test {
    LavkaPass pass;
    address merchant = address(0xA11CE);
    address buyer = address(0xB0B);

    function setUp() public {
        pass = new LavkaPass(address(this));
        vm.deal(buyer, 10 ether);
        vm.prank(merchant);
        pass.createProgram(5, uint64(block.timestamp + 30 days), true, 1 ether);
    }

    function testPurchaseEscrowsFunds() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        assertEq(pass.balanceOf(buyer, 1), 5);
        assertEq(address(pass).balance, 1 ether);
        assertEq(merchant.balance, 0);
    }

    function testRedeemPaysMerchantPerVisit() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        pass.redeemVisit(1, 1, bytes32("nonce-1"));
        assertEq(pass.balanceOf(buyer, 1), 4);
        assertEq(merchant.balance, 0.2 ether);
        assertEq(address(pass).balance, 0.8 ether);
    }

    function testRedeemRevertsOnReusedNonce() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        pass.redeemVisit(1, 1, bytes32("nonce-1"));
        vm.prank(buyer);
        vm.expectRevert(LavkaPass.NonceUsed.selector);
        pass.redeemVisit(1, 1, bytes32("nonce-1"));
    }

    function testRedeemRevertsOnZeroNonce() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        vm.expectRevert(LavkaPass.ZeroNonce.selector);
        pass.redeemVisit(1, 1, bytes32(0));
    }

    function testClaimRefundAfterDisable() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        pass.redeemVisit(1, 1, bytes32("nonce-1"));
        assertEq(pass.balanceOf(buyer, 1), 4);
        vm.prank(merchant);
        pass.setProgramActive(1, false);
        vm.prank(buyer);
        pass.claimRefund(1);
        assertEq(pass.balanceOf(buyer, 1), 0);
        assertEq(buyer.balance, 10 ether - 0.2 ether);
        assertEq(address(pass).balance, 0);
    }

    function testClaimRefundRevertsWhileActive() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        vm.expectRevert(LavkaPass.ProgramStillActive.selector);
        pass.claimRefund(1);
    }

    /// An active program past its `validUntil` can no longer be redeemed against, so escrow
    /// must be refundable then too — otherwise the funds are stuck forever (M08-4).
    function testClaimRefundAfterExpiry() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.warp(block.timestamp + 31 days);
        vm.prank(buyer);
        pass.claimRefund(1);
        assertEq(pass.balanceOf(buyer, 1), 0);
        assertEq(buyer.balance, 10 ether);
        assertEq(address(pass).balance, 0);
    }

    function testClaimRefundRevertsWithNothingToRefund() public {
        vm.prank(merchant);
        pass.setProgramActive(1, false);
        vm.prank(buyer);
        vm.expectRevert(LavkaPass.NothingToRefund.selector);
        pass.claimRefund(1);
    }

    function testNonTransferable() public {
        vm.prank(merchant);
        pass.createProgram(3, 0, false, 1 wei);
        vm.prank(buyer);
        pass.purchasePass{value: 1 wei}(2);
        vm.expectRevert(LavkaPass.NotTransferable.selector);
        vm.prank(buyer);
        pass.safeTransferFrom(buyer, merchant, 2, 1, "");
    }

    // ------------------------------------------------------------------ AUD-H2

    /// A zero-visit "redemption" burned nothing, paid nothing and needed no pass at all, yet it
    /// consumed the nonce and emitted a valid-looking `VisitRedeemed` event. Any address could
    /// manufacture one against any live program.
    function testRedeemRevertsOnZeroVisits() public {
        address stranger = address(0xDEAD1);
        vm.prank(stranger);
        vm.expectRevert(LavkaPass.ZeroVisits.selector);
        pass.redeemVisit(1, 0, bytes32("merchant-QR"));
        assertFalse(pass.isNonceUsed(1, bytes32("merchant-QR")), "nonce not consumed by a no-op");
    }

    /// Holding no pass is not a path to a redemption event either.
    function testRedeemRevertsWithoutVisits() public {
        address stranger = address(0xDEAD2);
        vm.prank(stranger);
        vm.expectRevert(LavkaPass.InsufficientVisits.selector);
        pass.redeemVisit(1, 1, bytes32("merchant-QR"));
    }

    /// Nonces are scoped per program: an unrelated program the attacker owns can no longer burn
    /// a merchant's QR code.
    function testNonceIsScopedToItsProgram() public {
        address griefer = address(0xBAD);
        vm.deal(griefer, 1 ether);
        vm.prank(griefer);
        uint256 junk = pass.createProgram(5, 0, false, 1 wei);
        vm.prank(griefer);
        pass.purchasePass{value: 1 wei}(junk);

        bytes32 nonce = bytes32("merchant-QR");
        vm.prank(griefer);
        pass.redeemVisit(junk, 1, nonce);
        assertTrue(pass.isNonceUsed(junk, nonce));
        assertFalse(pass.isNonceUsed(1, nonce), "the merchant's program is unaffected");

        // The merchant's own redemption still goes through.
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.prank(buyer);
        pass.redeemVisit(1, 1, nonce);
        assertEq(pass.balanceOf(buyer, 1), 4);
        assertTrue(pass.isNonceUsed(1, nonce));
    }

    /// Within one program the QR is still single-use.
    function testNonceStillSingleUseWithinProgram() public {
        vm.prank(buyer);
        pass.purchasePass{value: 1 ether}(1);
        vm.startPrank(buyer);
        pass.redeemVisit(1, 1, bytes32("n"));
        vm.expectRevert(LavkaPass.NonceUsed.selector);
        pass.redeemVisit(1, 1, bytes32("n"));
        vm.stopPrank();
    }
}
