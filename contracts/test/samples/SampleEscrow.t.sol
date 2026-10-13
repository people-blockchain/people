// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SampleEscrow} from "../../src/samples/SampleEscrow.sol";
import {SampleERC20} from "../../src/samples/SampleERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SampleEscrowTest is Test {
    address seller = address(0x5E11E2);
    address arbiter = address(0xA2B17E2);
    address buyer = address(0xB0702);

    SampleERC20 stable;

    function setUp() public {
        vm.prank(buyer);
        stable = new SampleERC20("Test USD", "tUSD", 1_000_000e18);
    }

    function _deployNative(uint256 value) internal returns (SampleEscrow) {
        vm.deal(buyer, value);
        vm.prank(buyer);
        return new SampleEscrow{value: value}(seller, arbiter, address(0), 0);
    }

    function _deployErc20(uint256 amount) internal returns (SampleEscrow) {
        vm.prank(buyer);
        return new SampleEscrow(seller, arbiter, address(stable), amount);
    }

    // -- native mode --

    function testReleaseByBuyer() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.prank(buyer);
        escrow.release();
        assertEq(seller.balance, 1 ether);
        assertTrue(escrow.settled());
    }

    function testReleaseByArbiter() public {
        SampleEscrow escrow = _deployNative(2 ether);
        vm.prank(arbiter);
        escrow.release();
        assertEq(seller.balance, 2 ether);
    }

    function testRefundByArbiter() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.prank(arbiter);
        escrow.refund();
        assertEq(buyer.balance, 1 ether);
    }

    function testRefundByNonArbiterReverts() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.NotAuthorized.selector);
        escrow.refund();
    }

    function testReleaseByUnrelatedCallerReverts() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.prank(seller);
        vm.expectRevert(SampleEscrow.NotAuthorized.selector);
        escrow.release();
    }

    function testDoubleSettleReverts() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.prank(buyer);
        escrow.release();
        vm.prank(arbiter);
        vm.expectRevert(SampleEscrow.AlreadySettled.selector);
        escrow.refund();
    }

    function testZeroDepositConstructorReverts() public {
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.ZeroDeposit.selector);
        new SampleEscrow{value: 0}(seller, arbiter, address(0), 0);
    }

    function testNativeModeRejectsDepositCall() public {
        SampleEscrow escrow = _deployNative(1 ether);
        vm.expectRevert(SampleEscrow.NativeValueNotAccepted.selector);
        escrow.deposit();
    }

    function testErc20ConstructorRejectsNativeValue() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.NativeValueNotAccepted.selector);
        new SampleEscrow{value: 1 ether}(seller, arbiter, address(stable), 100e18);
    }

    // -- ERC20 mode --

    function testErc20DepositAndRelease() public {
        SampleEscrow escrow = _deployErc20(100e18);
        vm.prank(buyer);
        stable.approve(address(escrow), 100e18);
        vm.prank(buyer);
        escrow.deposit();
        assertTrue(escrow.deposited());
        assertEq(stable.balanceOf(address(escrow)), 100e18);

        vm.prank(buyer);
        escrow.release();
        assertEq(stable.balanceOf(seller), 100e18);
    }

    function testErc20RefundByArbiter() public {
        SampleEscrow escrow = _deployErc20(50e18);
        vm.prank(buyer);
        stable.approve(address(escrow), 50e18);
        vm.prank(buyer);
        escrow.deposit();

        vm.prank(arbiter);
        escrow.refund();
        assertEq(stable.balanceOf(buyer), 1_000_000e18);
    }

    function testErc20ZeroAmountConstructorReverts() public {
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.ZeroDeposit.selector);
        new SampleEscrow(seller, arbiter, address(stable), 0);
    }

    function testErc20ReleaseBeforeDepositReverts() public {
        SampleEscrow escrow = _deployErc20(100e18);
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.NotDeposited.selector);
        escrow.release();
    }

    function testErc20DoubleDepositReverts() public {
        SampleEscrow escrow = _deployErc20(100e18);
        vm.prank(buyer);
        stable.approve(address(escrow), 200e18);
        vm.prank(buyer);
        escrow.deposit();
        vm.prank(buyer);
        vm.expectRevert(SampleEscrow.AlreadyDeposited.selector);
        escrow.deposit();
    }

    function testErc20DepositWithoutApprovalReverts() public {
        SampleEscrow escrow = _deployErc20(100e18);
        vm.prank(buyer);
        vm.expectRevert();
        escrow.deposit();
    }

    function testErc20DepositByNonBuyerReverts() public {
        SampleEscrow escrow = _deployErc20(100e18);
        vm.prank(seller);
        vm.expectRevert(SampleEscrow.NotAuthorized.selector);
        escrow.deposit();
    }
}
