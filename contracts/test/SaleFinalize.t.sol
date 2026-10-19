// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleCommunitySale} from "../src/sale/PeopleCommunitySale.sol";

contract SaleFinalizeUsdt is ERC20("USDT", "USDT") {
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// Owner decision 2026-10-19: the PPL sale runs until sold out or a fixed 24 months (730 days) from
/// opening, whichever comes first; then anyone can finalize and the unsold PPL (zero when sold out)
/// is assigned to the community pool. No extensions, no refunds.
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
        assertEq(sale.closesAt(), block.timestamp + 730 days);
        vm.expectRevert(PeopleCommunitySale.AlreadyOpened.selector);
        sale.open(pool);
    }

    function test_cannotFinalizeBefore730Days() public {
        sale.open(pool);
        vm.warp(block.timestamp + 730 days - 1);
        vm.prank(buyer);
        sale.buy(buyer, 10e6, 0);
        assertFalse(sale.canFinalize());
        vm.prank(anyone);
        vm.expectRevert(PeopleCommunitySale.NotFinalizable.selector);
        sale.finalize();
    }

    function test_anyoneFinalizesAt730Days_unsoldToCommunityPool() public {
        sale.open(pool);
        vm.prank(buyer);
        sale.buy(buyer, 100e6, 0);
        uint256 sold = sale.soldPpl();
        vm.warp(block.timestamp + 730 days);

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

    function test_durationIsFixedAt730Days() public view {
        // `SALE_DURATION` is a constant: no setter, no extension path.
        assertEq(sale.SALE_DURATION(), 730 days);
    }

    function test_soldOutSaleFinalizesImmediately_noUnsold() public {
        sale.open(pool);
        uint256 openedAt = block.timestamp;
        assertFalse(sale.isSoldOut());
        _sellOut();

        assertTrue(sale.isSoldOut());
        assertEq(sale.remainingPpl(), 0);
        assertLt(block.timestamp, openedAt + 730 days);
        assertEq(sale.closesAt(), openedAt + 730 days);
        assertTrue(sale.canFinalize());

        vm.expectEmit(true, true, false, true);
        emit PeopleCommunitySale.SaleFinalized(anyone, pool, 0);
        vm.prank(anyone);
        sale.finalize();
        assertTrue(sale.finalized());
        assertEq(sale.unsoldToCommunity(), 0);
        assertFalse(sale.canFinalize());
    }

    function test_buyAfterSoldOutReverts() public {
        sale.open(pool);
        _sellOut();
        vm.prank(buyer);
        vm.expectRevert(PeopleCommunitySale.SaleEnded.selector);
        sale.buy(buyer, 10e6, 0);
    }

    function test_buyAfter730DaysReverts() public {
        sale.open(pool);
        vm.warp(block.timestamp + 730 days - 1);
        vm.prank(buyer);
        sale.buy(buyer, 10e6, 0);
        vm.warp(block.timestamp + 1);
        vm.prank(buyer);
        vm.expectRevert(PeopleCommunitySale.SaleEnded.selector);
        sale.buy(buyer, 10e6, 0);
    }

    function test_notSoldOutSaleCannotFinalizeEarly() public {
        sale.open(pool);
        vm.prank(buyer);
        sale.buy(buyer, 100e6, 0);
        assertFalse(sale.isSoldOut());
        assertFalse(sale.canFinalize());
        vm.expectRevert(PeopleCommunitySale.NotFinalizable.selector);
        sale.finalize();
    }

    /// Buys the entire supply (the full curve costs ~3M USDT).
    function _sellOut() internal {
        usdt.mint(buyer, 10_000_000e6);
        vm.prank(buyer);
        sale.buy(buyer, 10_000_000e6, 0);
    }
}
