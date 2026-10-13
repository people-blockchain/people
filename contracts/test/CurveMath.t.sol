// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";

/// `vm.expectRevert` only sees reverts from an external call, and `CurveMath` is an internal
/// library, so the revert cases go through this thin wrapper.
contract CurveMathHarness {
    function buy(CurveMath.State memory s, uint256 nativeIn, uint256 minOut) external pure {
        CurveMath.calculateBuy(s, nativeIn, minOut);
    }

    function sell(CurveMath.State memory s, uint256 tokenAmount, uint256 minOut) external pure {
        CurveMath.calculateSell(s, tokenAmount, minOut);
    }

    function trySell(CurveMath.State memory s, uint256 tokenAmount, uint256 minOut)
        external
        view
        returns (bool reverted, uint256 netNativeOut)
    {
        try CurveMathHarness(this).sellAndReturn(s, tokenAmount, minOut) returns (uint256 out) {
            return (false, out);
        } catch {
            return (true, 0);
        }
    }

    function sellAndReturn(CurveMath.State memory s, uint256 tokenAmount, uint256 minOut)
        external
        pure
        returns (uint256 netNativeOut)
    {
        (netNativeOut,,,) = CurveMath.calculateSell(s, tokenAmount, minOut);
    }
}

contract CurveMathTest is Test {
    CurveMathHarness internal harness = new CurveMathHarness();

    function test_allocation_sums_to_supply() public pure {
        uint256 supply = 1_000_000_000;
        CurveMath.Allocation memory a = CurveMath.calculateAllocation(supply);
        assertEq(a.bondingCurve + a.communityPool + a.creator + a.liquidityReserve + a.ecosystemReserve, supply);
        assertEq(a.bondingCurve, (supply * 60) / 100);
    }

    function test_initial_k() public pure {
        CurveMath.State memory s = CurveMath.initialState(600_000_000);
        assertEq(s.virtualNativeReserve, PeopleConstants.VIRTUAL_NATIVE_RESERVE);
        assertEq(s.invariantK, 600_000_000 * PeopleConstants.VIRTUAL_NATIVE_RESERVE);
        assertEq(s.migrationThreshold, 600_000_000 / 3);
    }

    function testFuzz_buy_respects_inventory(uint128 nativeIn) public pure {
        nativeIn = uint128(bound(nativeIn, 1 ether, 50 ether));
        CurveMath.State memory s = CurveMath.initialState(600_000_000);
        (uint256 tokensOut,,, CurveMath.State memory next,) = CurveMath.calculateBuy(s, nativeIn, 0);
        assertLe(tokensOut, s.currentTokenReserve);
        assertLe(next.currentTokenReserve, s.currentTokenReserve);
    }

    function testFuzz_sell_roundtrip_bounded(uint128 buyNative, uint128 sellFractionBps) public pure {
        buyNative = uint128(bound(buyNative, 1 ether, 50 ether));
        sellFractionBps = uint128(bound(sellFractionBps, 100, 5000));
        uint256 supply = 1_000_000_000;
        CurveMath.State memory s = CurveMath.initialState((supply * 60) / 100);
        (uint256 tokensOut,,, CurveMath.State memory afterBuy,) = CurveMath.calculateBuy(s, buyNative, 0);
        if (tokensOut == 0) return;
        uint256 sellAmt = (tokensOut * sellFractionBps) / 10_000;
        if (sellAmt == 0) return;
        (uint256 netOut,,, CurveMath.State memory afterSell) = CurveMath.calculateSell(afterBuy, sellAmt, 0);
        assertLe(netOut, buyNative);
        assertGe(afterSell.currentTokenReserve, afterBuy.currentTokenReserve);
    }

    // ------------------------------------------------------- migration edge cases (audit-final)

    /// Migration must always be *reachable*: once a buy drops the inventory to the threshold,
    /// `calculateMigration` has to produce a pool the market can actually fund, or the triggering
    /// buy reverts and the curve is stuck with the native already paid in. Checks the pool is
    /// covered by the liquidity reserve plus what is left on the curve, for any supply and any
    /// buy size that triggers migration.
    function testFuzz_migration_is_fundable(uint256 supply, uint256 nativeIn) public pure {
        supply = bound(supply, 1_000 ether, 1_000_000_000_000 ether);
        nativeIn = bound(nativeIn, 1 ether, 1_000_000 ether);
        CurveMath.Allocation memory a = CurveMath.calculateAllocation(supply);
        CurveMath.State memory s = CurveMath.initialState(a.bondingCurve);

        (uint256 tokensOut,,, CurveMath.State memory next, bool migrate) = CurveMath.calculateBuy(s, nativeIn, 0);
        if (!migrate) return;
        assertGt(tokensOut, 0);

        (uint256 poolNative, uint256 poolToken, uint256 fromLiq, uint256 fromCurve) =
            CurveMath.calculateMigration(next, a.liquidityReserve);
        assertGt(poolNative, 0);
        assertEq(poolNative, next.actualNativeReserve, "the whole curve balance seeds the pool");
        assertEq(fromLiq + fromCurve, poolToken, "pool tokens are fully sourced");
        assertLe(fromLiq, a.liquidityReserve, "cannot overdraw the liquidity reserve");
        assertLe(fromCurve, next.currentTokenReserve, "cannot overdraw remaining curve inventory");
    }

    /// The pool must open at (or just below) the curve's final spot price, otherwise the first
    /// AMM trade is free money. Rounding may only move the price against the buyer.
    function testFuzz_migration_price_matches_final_curve_spot(uint256 nativeIn) public pure {
        nativeIn = bound(nativeIn, 10 ether, 100_000 ether);
        CurveMath.Allocation memory a = CurveMath.calculateAllocation(1_000_000_000 ether);
        CurveMath.State memory s = CurveMath.initialState(a.bondingCurve);
        (,,, CurveMath.State memory next, bool migrate) = CurveMath.calculateBuy(s, nativeIn, 0);
        if (!migrate) return;
        (uint256 poolNative, uint256 poolToken,,) = CurveMath.calculateMigration(next, a.liquidityReserve);
        // poolToken = poolNative * x/y (floored), so poolToken/poolNative <= x/y: the pool never
        // offers more tokens per PPL than the curve's closing price did.
        assertLe(poolToken * next.virtualNativeReserve, poolNative * next.virtualTokenReserve);
    }

    /// A buy large enough to take the inventory to almost nothing still migrates — the pool just
    /// becomes small. (The failure mode this rules out: a whale's buy reverting forever because
    /// `poolToken` outgrew everything the market holds.)
    function test_migration_after_a_near_total_buy() public pure {
        CurveMath.Allocation memory a = CurveMath.calculateAllocation(1_000_000_000 ether);
        CurveMath.State memory s = CurveMath.initialState(a.bondingCurve);
        (,,, CurveMath.State memory next, bool migrate) = CurveMath.calculateBuy(s, 10_000_000 ether, 0);
        assertTrue(migrate);
        (, uint256 poolToken,, uint256 fromCurve) = CurveMath.calculateMigration(next, a.liquidityReserve);
        assertGt(poolToken, 0);
        assertEq(fromCurve, 0, "a tiny pool is covered by the liquidity reserve alone");
    }

    /// No buy, however large, can hand out more than the curve's own allocation — so trading
    /// never reaches the liquidity or ecosystem reserve sitting in the same contract. `x1` is a
    /// ceil-division of a positive `k`, hence always >= 1, so `tokensOut = x - x1 < x`.
    /// (This also means `currentTokenReserve` tracks `virtualTokenReserve` exactly and
    /// `calculateBuy`'s `InsufficientLiquidity` branch is unreachable — see AUD-I3.)
    function testFuzz_buy_never_exceeds_curve_allocation(uint256 supply, uint256 nativeIn) public pure {
        supply = bound(supply, 1_000 ether, 1_000_000_000_000 ether);
        nativeIn = bound(nativeIn, 2, type(uint128).max);
        CurveMath.Allocation memory a = CurveMath.calculateAllocation(supply);
        CurveMath.State memory s = CurveMath.initialState(a.bondingCurve);
        (uint256 tokensOut,,, CurveMath.State memory next,) = CurveMath.calculateBuy(s, nativeIn, 0);
        assertLt(tokensOut, a.bondingCurve, "cannot drain more than the curve allocation");
        assertGt(next.currentTokenReserve, 0, "the curve always keeps a unit of inventory");
        assertEq(next.currentTokenReserve, next.virtualTokenReserve);
    }

    /// Selling into a curve that has taken no native must revert, not pay out of another
    /// token's balance (the market holds every curve's PPL in one account balance).
    function test_sell_against_empty_reserve_reverts() public {
        CurveMath.State memory s = CurveMath.initialState(600_000_000 ether);
        vm.expectRevert(CurveMath.InsufficientLiquidity.selector);
        harness.sell(s, 1_000 ether, 0);
    }

    /// A buy whose whole input is eaten by the ceil-rounded 1% fee must revert, not mint for free.
    function test_one_wei_buy_reverts() public {
        CurveMath.State memory s = CurveMath.initialState(600_000_000 ether);
        vm.expectRevert(CurveMath.InsufficientInput.selector);
        harness.buy(s, 1, 0);
    }

    /// Dust round trips must lose to the curve, never extract from it: both divisions round
    /// against the trader and the 1% fee rounds up to at least one wei on each leg. Since the
    /// invariant is re-derived after every trade (S1-01 fix), the ceil-rounding residue from the
    /// buy leg can make the sell leg's payout exactly zero, which now reverts instead of handing
    /// back a vanishing amount — that revert is itself a (stronger) way of not being profitable.
    function testFuzz_dust_roundtrip_loses(uint256 nativeIn) public view {
        nativeIn = bound(nativeIn, 2, 1_000_000);
        CurveMath.State memory s = CurveMath.initialState(600_000_000 ether);
        (uint256 tokensOut,,, CurveMath.State memory afterBuy,) = CurveMath.calculateBuy(s, nativeIn, 0);
        if (tokensOut == 0) return;
        (bool reverted, uint256 netOut) = harness.trySell(afterBuy, tokensOut, 0);
        if (reverted) return;
        assertLt(netOut, nativeIn, "a dust round trip must not be profitable");
    }
}
