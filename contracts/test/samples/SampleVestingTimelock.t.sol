// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SampleVestingTimelock} from "../../src/samples/SampleVestingTimelock.sol";

contract SampleVestingTimelockTest is Test {
    address beneficiary = address(0xBE2E);
    address deployer = address(0xDEADBEEF);
    uint256 start;
    uint256 duration = 100 days;

    function _deploy(uint256 value) internal returns (SampleVestingTimelock) {
        start = block.timestamp;
        vm.deal(deployer, value);
        vm.prank(deployer);
        return new SampleVestingTimelock{value: value}(beneficiary, start, duration);
    }

    function testVestedAmountBeforeStart() public {
        vm.warp(block.timestamp + 1000);
        start = block.timestamp + 1 days;
        vm.deal(deployer, 10 ether);
        vm.prank(deployer);
        SampleVestingTimelock vesting = new SampleVestingTimelock{value: 10 ether}(beneficiary, start, duration);
        assertEq(vesting.vestedAmount(block.timestamp), 0);
    }

    function testPartialVesting() public {
        SampleVestingTimelock vesting = _deploy(10 ether);
        vm.warp(start + duration / 2);
        assertEq(vesting.vestedAmount(block.timestamp), 5 ether);
        assertEq(vesting.releasable(), 5 ether);
    }

    function testFullVestingAndRelease() public {
        SampleVestingTimelock vesting = _deploy(10 ether);
        vm.warp(start + duration + 1);
        assertEq(vesting.vestedAmount(block.timestamp), 10 ether);
        vesting.release();
        assertEq(beneficiary.balance, 10 ether);
        assertEq(vesting.released(), 10 ether);
    }

    function testPartialThenFullRelease() public {
        SampleVestingTimelock vesting = _deploy(10 ether);
        vm.warp(start + duration / 2);
        vesting.release();
        assertEq(beneficiary.balance, 5 ether);

        vm.warp(start + duration);
        vesting.release();
        assertEq(beneficiary.balance, 10 ether);
    }

    function testAnyoneCanCallRelease() public {
        SampleVestingTimelock vesting = _deploy(10 ether);
        vm.warp(start + duration);
        vm.prank(address(0x1234));
        vesting.release();
        assertEq(beneficiary.balance, 10 ether);
    }

    function testReleaseWithNothingReleasableReverts() public {
        SampleVestingTimelock vesting = _deploy(10 ether);
        // At exactly `start`, nothing has vested yet.
        vm.expectRevert(SampleVestingTimelock.NothingToRelease.selector);
        vesting.release();
    }

    function testZeroDurationConstructorReverts() public {
        vm.expectRevert(SampleVestingTimelock.ZeroDuration.selector);
        new SampleVestingTimelock(beneficiary, block.timestamp, 0);
    }

    function testZeroBeneficiaryConstructorReverts() public {
        vm.expectRevert(SampleVestingTimelock.ZeroBeneficiary.selector);
        new SampleVestingTimelock(address(0), block.timestamp, duration);
    }
}
