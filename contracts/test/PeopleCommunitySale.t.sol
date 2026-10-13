// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleCommunitySale} from "../src/sale/PeopleCommunitySale.sol";

contract MockUsdt6 is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// M05-6: BNB Chain stablecoins (BSC-USD, USDC) report 18 decimals.
contract MockUsdt18 is ERC20 {
    constructor() ERC20("BSC-USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SaleHarness is PeopleCommunitySale {
    constructor(address stablecoin_, address treasury_, address owner_)
        PeopleCommunitySale(stablecoin_, treasury_, owner_)
    {}

    function costUsdt(uint256 soldBefore, uint256 pplAmount) external pure returns (uint256) {
        return _costUsdt(soldBefore, pplAmount);
    }

    function setSold(uint256 sold) external {
        soldPpl = sold;
    }
}

/// M05-5: the contract price must match the website curve `bondingCurveCostUsdt`
/// (100M PPL, 0.01 -> 0.05 USDT spot, stablecoin with 6 decimals).
contract PeopleCommunitySaleTest is Test {
    uint256 internal constant SUPPLY = 100_000_000;
    uint256 internal constant ONE_USDT = 1e6;

    MockUsdt6 internal usdt;
    SaleHarness internal sale;
    address internal treasury = address(0x7EA5);
    address internal buyer = address(0xB0B);

    function setUp() public {
        usdt = new MockUsdt6();
        sale = new SaleHarness(address(usdt), treasury, address(this));
        sale.open(address(0xC0DE));
    }

    /// Website formula in exact rational arithmetic (micro-USDT, rounded up).
    function _refCost(uint256 sold, uint256 n) internal pure returns (uint256) {
        if (n == 0) return 0;
        // p(s) = 10_000 + 40_000 * s / SUPPLY  (micro-USDT per PPL)
        uint256 num = n * (2 * 10_000 * SUPPLY + 40_000 * (2 * sold + n));
        uint256 den = 2 * SUPPLY;
        return (num + den - 1) / den;
    }

    function _refQuote(uint256 sold, uint256 budget) internal pure returns (uint256) {
        uint256 lo = 0;
        uint256 hi = SUPPLY - sold;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (_refCost(sold, mid) <= budget) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    function test_fullSupplyCostsThreeMillionUsdt() public view {
        assertEq(sale.costUsdt(0, SUPPLY), 3_000_000 * ONE_USDT);
    }

    function test_onePplIsNotFree() public view {
        assertGe(sale.costUsdt(0, 1), 10_000); // 0.01 USDT (+1 micro rounding up)
        assertLe(sale.costUsdt(0, 1), 10_001);
        assertGt(sale.costUsdt(SUPPLY - 1, 1), 49_999);
    }

    function test_tenUsdtBuysAboutOneThousandPpl() public view {
        (uint256 pplOut, uint256 used) = sale.quotePplForUsdt(10 * ONE_USDT);
        assertLe(pplOut, _refQuote(0, 10 * ONE_USDT));
        assertGe(pplOut, 999);
        assertLe(pplOut, 1000);
        assertLe(used, 10 * ONE_USDT);
    }

    function test_quoteMatchesWebsiteCurveOnGrid() public {
        uint256[5] memory solds = [uint256(0), 1_000_000, 37_500_000, 50_000_000, 99_000_000];
        uint256[6] memory budgets = [uint256(10), 99, 1_000, 12_345, 100_000, 250_000];
        for (uint256 i = 0; i < solds.length; i++) {
            sale.setSold(solds[i]);
            for (uint256 j = 0; j < budgets.length; j++) {
                uint256 budget = budgets[j] * ONE_USDT;
                (uint256 pplOut, uint256 used) = sale.quotePplForUsdt(budget);
                uint256 ref = _refQuote(solds[i], budget);
                assertLe(used, budget, "spends more than budget");
                assertLe(pplOut, ref + 1, "contract gives more PPL than the website curve");
                assertGe(pplOut + 1, ref, "contract gives far less PPL than the website curve");
            }
        }
    }

    function test_buyChargesCurvePrice() public {
        usdt.mint(buyer, 10 * ONE_USDT);
        vm.startPrank(buyer);
        usdt.approve(address(sale), type(uint256).max);
        sale.buy(buyer, 10 * ONE_USDT, 1);
        vm.stopPrank();
        assertLe(sale.soldPpl(), 1000);
        assertGe(sale.soldPpl(), 999);
        assertGt(usdt.balanceOf(treasury), 9_990_000);
    }

    /// Audit PoC: before the fix 10 USDT bought the whole 100M PPL supply for 3 USDT.
    function test_tenUsdtCannotBuyWholeSupply() public view {
        (uint256 pplOut,) = sale.quotePplForUsdt(10 * ONE_USDT);
        assertLt(pplOut, SUPPLY);
    }
}

/// M05-6: on BNB Chain the stablecoin reports 18 decimals; the contract must quote and
/// charge in native units so the USD price matches the 6-decimal curve on every chain.
contract PeopleCommunitySale18DecimalsTest is Test {
    uint256 internal constant ONE_USDT_18 = 1e18;

    MockUsdt18 internal usdt;
    SaleHarness internal sale;
    address internal treasury = address(0x7EA5);
    address internal buyer = address(0xB0B);

    function setUp() public {
        usdt = new MockUsdt18();
        sale = new SaleHarness(address(usdt), treasury, address(this));
        sale.open(address(0xC0DE));
    }

    function test_tenUsdtBuysAboutOneThousandPplAt18Decimals() public view {
        (uint256 pplOut, uint256 used) = sale.quotePplForUsdt(10 * ONE_USDT_18);
        assertGe(pplOut, 999);
        assertLe(pplOut, 1000);
        assertLe(used, 10 * ONE_USDT_18);
        assertGe(used, 9_990_000_000_000_000_000); // ~10 USDT in 18-decimal units, not 1e-12 of it
    }

    function test_buyChargesNativeDecimalsAmount() public {
        usdt.mint(buyer, 10 * ONE_USDT_18);
        vm.startPrank(buyer);
        usdt.approve(address(sale), type(uint256).max);
        sale.buy(buyer, 10 * ONE_USDT_18, 1);
        vm.stopPrank();
        assertGe(sale.soldPpl(), 999);
        assertLe(sale.soldPpl(), 1000);
        assertGt(usdt.balanceOf(treasury), 9_990_000_000_000_000_000);
    }
}
