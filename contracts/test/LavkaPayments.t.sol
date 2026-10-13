// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LavkaPayments} from "../src/lavka/LavkaPayments.sol";

contract LavkaPaymentsTest is Test {
    address owner = address(0x9);
    // Deliberately above the precompile range so bucket balances are plain accounts.
    address community = address(0xC0);
    address treasury = address(0xC1);
    address validators = address(0xC2);
    address liquidity = address(0xC3);
    address growth = address(0xC4);

    LavkaPayments pay;

    function setUp() public {
        pay = new LavkaPayments(owner, community, treasury, validators, liquidity, growth);
    }

    function testPayMerchant() public {
        address merchant = address(0xA11CE);
        vm.deal(address(this), 10 ether);
        pay.payMerchant{value: 1 ether}(merchant, bytes32("memo"));
        assertGt(merchant.balance, 0);
    }

    function testOwnerCanRotateBuckets() public {
        address newTreasury = address(0x20);
        vm.prank(owner);
        pay.setBuckets(community, newTreasury, validators, liquidity, growth);
        assertEq(pay.treasury(), newTreasury);
    }

    function testNonOwnerCannotRotateBuckets() public {
        vm.expectRevert();
        pay.setBuckets(community, address(0x20), validators, liquidity, growth);
    }

    // ------------------------------------------------------------------ AUD-H3

    /// The approved Model A split is validators 30 / community 25 / treasury 20 /
    /// liquidity & ecosystem 10 / growth 15 / burn 0 (docs/PROTOCOL-DECISIONS.md). The 30%
    /// slice used to go to a burn sink and validators got the 10% one, so nearly a third of
    /// every Lavka fee was destroyed.
    function testFeeFollowsApprovedModelASplit() public {
        address merchant = address(0xA11CE);
        vm.deal(address(this), 10 ether);
        pay.payMerchant{value: 10 ether}(merchant, bytes32("memo"));
        uint256 fee = (10 ether * uint256(pay.protocolFeeBps())) / 10_000;
        assertEq(fee, 0.1 ether);
        assertEq(merchant.balance, 10 ether - fee, "merchant keeps 99%");
        assertEq(validators.balance, (fee * 3000) / 10_000, "validators 30%");
        assertEq(community.balance, (fee * 2500) / 10_000, "community pool 25%");
        assertEq(treasury.balance, (fee * 2000) / 10_000, "treasury 20%");
        assertEq(liquidity.balance, (fee * 1000) / 10_000, "liquidity & ecosystem 10%");
        assertEq(growth.balance, (fee * 1500) / 10_000, "growth pool 15%");
    }

    /// Nothing is burned and nothing is retained: every wei of the fee lands in a bucket, with
    /// the floor-division remainder going to validators.
    function testFuzzNoFeeIsLostOrBurned(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 ether);
        vm.deal(address(this), amount);
        address merchant = address(0xA11CE);
        pay.payMerchant{value: amount}(merchant, bytes32("memo"));
        uint256 fee = (amount * uint256(pay.protocolFeeBps())) / 10_000;
        uint256 routed = validators.balance + community.balance + treasury.balance + liquidity.balance + growth.balance;
        assertEq(routed, fee, "the whole fee is routed, none burned or stranded");
        assertEq(merchant.balance, amount - fee);
        assertEq(address(pay).balance, 0, "contract retains nothing");
        if (fee > 0) {
            // The remainder stays with validators, so their share is never short of 30%.
            assertGe(validators.balance, (fee * 3000) / 10_000);
        }
    }

    /// A zero bucket would silently keep its slice in a contract with no withdrawal path.
    function testZeroBucketIsRejected() public {
        vm.expectRevert(LavkaPayments.ZeroBucket.selector);
        new LavkaPayments(owner, community, treasury, address(0), liquidity, growth);
        vm.prank(owner);
        vm.expectRevert(LavkaPayments.ZeroBucket.selector);
        pay.setBuckets(community, treasury, validators, liquidity, address(0));
    }
}
