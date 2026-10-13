// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestStablecoin} from "../../src/samples/TestStablecoin.sol";

contract TestStablecoinTest is Test {
    TestStablecoin usdc;
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new TestStablecoin("Test USD Coin", "tUSDC");
    }

    function testMetadata() public view {
        assertEq(usdc.name(), "Test USD Coin");
        assertEq(usdc.symbol(), "tUSDC");
        assertEq(usdc.decimals(), 6);
    }

    function testMint() public {
        vm.prank(alice);
        usdc.mint();
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }

    function testMintBeforeCooldownReverts() public {
        vm.prank(alice);
        usdc.mint();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TestStablecoin.FaucetCooldown.selector, block.timestamp + 24 hours));
        usdc.mint();
    }

    function testMintAfterCooldownSucceeds() public {
        vm.prank(alice);
        usdc.mint();
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        usdc.mint();
        assertEq(usdc.balanceOf(alice), 2_000e6);
    }

    function testMintIsIndependentPerAddress() public {
        address bob = address(0xB0B);
        vm.prank(alice);
        usdc.mint();
        vm.prank(bob);
        usdc.mint();
        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(usdc.balanceOf(bob), 1_000e6);
    }
}
