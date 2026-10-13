// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleCommunitySale} from "../src/sale/PeopleCommunitySale.sol";

contract SaleFinalizeUsdt is ERC20("USDT", "USDT") {
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// Owner rule 2026-10-13: the PPL sale runs a fixed 180 days from opening; afterwards anyone can
/// finalize and the unsold PPL is assigned to the community pool.
contract SaleFinalizeTest is Test {
    SaleFinalizeUsdt usdt;
    PeopleCommunitySale sale;
    address treasury = address(0x7EA5);
    address pool = address(0xC0DE);
    address buyer = address(0xB0B);
    address anyone = address(0xA11);

    function setUp() public {
        usdt = new SaleFinalizeUsdt();
        sale = new PeopleCommunitySale(address(usdt), treasury, address(this));
        usdt.mint(buyer, 1_000_000e6);
        vm.prank(buyer);
        usdt.approve(address(sale), type(uint256).max);
    }

    function test_buyRevertsBeforeOpen() public {
        vm.prank(buyer);
        vm.expectRevert(PeopleCommunitySale.NotOpen.selector);
        sale.buy(buyer, 10e6, 0);
    }

    function test_onlyOwnerOpensOnce() public {
        vm.prank(anyone);
        vm.expectRevert();
        sale.open(pool);
        sale.open(pool);
        assertEq(sale.closesAt(), block.timestamp + 180 days);
        vm.expectRevert(PeopleCommunitySale.AlreadyOpened.selector);
        sale.open(pool);
    }

    function test_cannotFinalizeBefore180Days() public {
        sale.open(pool);
        vm.warp(block.timestamp + 180 days - 1);
        vm.prank(buyer);
        sale.buy(buyer, 10e6, 0);
        assertFalse(sale.canFinalize());
        vm.prank(anyone);
        vm.expectRevert(PeopleCommunitySale.NotFinalizable.selector);
        sale.finalize();
    }

    function test_anyoneFinalizesAfter180Days_unsoldToCommunityPool() public {
        sale.open(pool);
        vm.prank(buyer);
        sale.buy(buyer, 100e6, 0);
        uint256 sold = sale.soldPpl();
        vm.warp(block.timestamp + 180 days);

        vm.prank(buyer);
        vm.expectRevert(PeopleCommunitySale.SaleEnded.selector);
        sale.buy(buyer, 10e6, 0);

        vm.expectEmit(true, true, false, true);
        emit PeopleCommunitySale.SaleFinalized(anyone, pool, sale.SUPPLY_PPL() - sold);
        vm.prank(anyone);
        sale.finalize();
        assertTrue(sale.finalized());
        assertEq(sale.unsoldToCommunity(), sale.SUPPLY_PPL() - sold);
        assertEq(sale.communityPool(), pool);

        vm.expectRevert(PeopleCommunitySale.NotFinalizable.selector);
        sale.finalize();
    }

    function test_cannotFinalizeUnopenedSale() public {
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(PeopleCommunitySale.NotFinalizable.selector);
        sale.finalize();
    }
}
