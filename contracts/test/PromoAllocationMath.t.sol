// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// `vm.expectRevert` only sees reverts from an external call, and `CurveMath` is an internal
/// library, so the revert cases go through this thin wrapper.
contract PromoMathHarness {
    function allocationWithPromo(uint256 totalSupply, uint16 promoBps)
        external
        pure
        returns (CurveMath.Allocation memory a, uint256 promo)
    {
        return CurveMath.calculateAllocationWithPromo(totalSupply, promoBps);
    }

    function validate(uint16 promoBps) external pure {
        CurveMath.requireValidPromoBps(promoBps);
    }
}

/// Owner decision 2026-10-13: optional 0% / 5% / 10% creator promo share, carved out of the
/// bonding-curve portion.
contract PromoAllocationMathTest is Test {
    PromoMathHarness internal harness = new PromoMathHarness();

    uint16 internal constant LOW = PeopleConstants.PROMO_BPS_LOW;
    uint16 internal constant HIGH = PeopleConstants.PROMO_BPS_HIGH;

    // ------------------------------------------------------------- default 0% is unchanged

    /// The whole point of the default: a 0 bps launch must produce the exact same five numbers
    /// the fixed split always produced, field by field, and no promo share at all.
    function _assertZeroPromoMatchesLegacy(uint256 supply) private view {
        CurveMath.Allocation memory legacy = CurveMath.calculateAllocation(supply);
        (CurveMath.Allocation memory a, uint256 promo) = harness.allocationWithPromo(supply, 0);
        assertEq(promo, 0, "no promo share at 0 bps");
        assertEq(a.bondingCurve, legacy.bondingCurve);
        assertEq(a.communityPool, legacy.communityPool);
        assertEq(a.creator, legacy.creator);
        assertEq(a.liquidityReserve, legacy.liquidityReserve);
        assertEq(a.ecosystemReserve, legacy.ecosystemReserve);
    }

    function test_zero_promo_matches_the_legacy_allocation_exactly() public view {
        _assertZeroPromoMatchesLegacy(1);
        _assertZeroPromoMatchesLegacy(7);
        _assertZeroPromoMatchesLegacy(1_000_000_000);
        _assertZeroPromoMatchesLegacy(1_000_000_000 ether);
        _assertZeroPromoMatchesLegacy(999_999_999_999);
        _assertZeroPromoMatchesLegacy(type(uint128).max);
    }

    function testFuzz_zero_promo_matches_the_legacy_allocation_exactly(uint256 supply) public view {
        // `calculateAllocation` itself overflows on `totalSupply * 15` near 2**256; the bound
        // keeps the fuzzer inside the range the fixed split has always supported.
        supply = bound(supply, 0, type(uint256).max / 15);
        CurveMath.Allocation memory legacy = CurveMath.calculateAllocation(supply);
        (CurveMath.Allocation memory a, uint256 promo) = harness.allocationWithPromo(supply, 0);
        assertEq(promo, 0);
        assertEq(abi.encode(a), abi.encode(legacy), "0 bps must be byte-for-byte the fixed split");
    }

    // ------------------------------------------------------------- the promo share itself

    function test_promo_share_is_five_or_ten_percent_of_total_supply() public view {
        uint256 supply = 1_000_000_000 ether;
        (CurveMath.Allocation memory low, uint256 promoLow) = harness.allocationWithPromo(supply, LOW);
        (CurveMath.Allocation memory high, uint256 promoHigh) = harness.allocationWithPromo(supply, HIGH);

        assertEq(promoLow, (supply * 5) / 100, "5% of total supply");
        assertEq(promoHigh, (supply * 10) / 100, "10% of total supply");
        // The curve absorbs the whole deduction: 60% -> 55% -> 50%.
        assertEq(low.bondingCurve, (supply * 55) / 100);
        assertEq(high.bondingCurve, (supply * 50) / 100);
    }

    /// Promo comes out of the curve and nothing else: the mandatory community pool, the creator
    /// allocation and both protocol reserves are identical to a 0% launch.
    function testFuzz_promo_only_ever_shrinks_the_curve(uint256 supply, bool high) public view {
        supply = bound(supply, 0, type(uint128).max);
        uint16 bps = high ? HIGH : LOW;
        CurveMath.Allocation memory legacy = CurveMath.calculateAllocation(supply);
        (CurveMath.Allocation memory a, uint256 promo) = harness.allocationWithPromo(supply, bps);

        assertEq(a.communityPool, legacy.communityPool, "community pool is untouchable");
        assertEq(a.creator, legacy.creator, "creator allocation unchanged");
        assertEq(a.liquidityReserve, legacy.liquidityReserve, "liquidity reserve unchanged");
        assertEq(a.ecosystemReserve, legacy.ecosystemReserve, "ecosystem reserve unchanged");
        assertEq(a.bondingCurve + promo, legacy.bondingCurve, "promo is taken from the curve");
    }

    /// Nothing is minted and nothing is lost, at any supply and any accepted promo share.
    function testFuzz_allocation_plus_promo_sums_to_supply(uint256 supply, uint8 choice) public view {
        supply = bound(supply, 0, type(uint128).max);
        uint16 bps = choice % 3 == 0 ? 0 : (choice % 3 == 1 ? LOW : HIGH);
        (CurveMath.Allocation memory a, uint256 promo) = harness.allocationWithPromo(supply, bps);
        assertEq(
            a.bondingCurve + a.communityPool + a.creator + a.liquidityReserve + a.ecosystemReserve + promo,
            supply,
            "allocation + promo == total supply"
        );
    }

    /// Even the largest promo share can never underflow or outgrow the curve it comes from.
    function testFuzz_curve_portion_stays_the_largest_bucket(uint256 supply) public view {
        supply = bound(supply, 100, type(uint128).max);
        (CurveMath.Allocation memory a, uint256 promo) = harness.allocationWithPromo(supply, HIGH);
        assertGt(a.bondingCurve, promo, "a 10% promo cannot exceed the remaining curve");
        assertGe(a.bondingCurve, a.creator, "the curve is still the largest bucket at 10% promo");
    }

    /// The promo share is computed as a plain division (`/20`, `/10`) so it cannot overflow where
    /// the fixed split does not. It must still equal the basis-point formula it stands for.
    function testFuzz_promo_share_equals_the_basis_point_formula(uint256 supply, bool high) public view {
        supply = bound(supply, 0, type(uint256).max / 10_000);
        uint16 bps = high ? HIGH : LOW;
        (, uint256 promo) = harness.allocationWithPromo(supply, bps);
        assertEq(promo, (supply * bps) / 10_000);
    }

    // ------------------------------------------------------------- validation

    function test_only_zero_five_hundred_and_one_thousand_bps_are_accepted() public view {
        harness.validate(0);
        harness.validate(LOW);
        harness.validate(HIGH);
    }

    function _assertRejected(uint16 bps) private {
        vm.expectRevert(abi.encodeWithSelector(CurveMath.InvalidPromoBps.selector, bps));
        harness.validate(bps);
        vm.expectRevert(abi.encodeWithSelector(CurveMath.InvalidPromoBps.selector, bps));
        harness.allocationWithPromo(1_000_000_000, bps);
    }

    function test_any_other_promo_bps_reverts() public {
        _assertRejected(1);
        _assertRejected(100);
        _assertRejected(250);
        _assertRejected(499);
        _assertRejected(501);
        _assertRejected(999);
        _assertRejected(1001);
        _assertRejected(10_000);
        _assertRejected(type(uint16).max);
    }

    function testFuzz_any_other_promo_bps_reverts(uint16 bps) public {
        vm.assume(bps != 0 && bps != LOW && bps != HIGH);
        vm.expectRevert(abi.encodeWithSelector(CurveMath.InvalidPromoBps.selector, bps));
        harness.allocationWithPromo(1_000_000_000 ether, bps);
    }
}
