// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console2} from "forge-std/console2.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2, PplCurveMathV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Sell-back, fees, caps, expiry, liquidity release, delivery freeze, pause (SPEC §5.2, §5.4, §5.5, §5.5a, §6).
contract PplCurveHubV2SellTest is HubV2Base {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant SMALL_RAISED = 100_000e6; // reserve 50k: 1% line ~505, 2% cap ~1010
    uint256 internal constant BIG_RAISED = 2_000_000e6; // reserve 1M: global cap 20k, address cap binds

    function setUp() public override {
        super.setUp();
        _open();
    }

    // ---------------------------------------------------------------- helpers

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function _warpBy(uint256 s) internal {
        vm.warp(_now() + s);
    }

    /// @dev `n` buys of `amt` for `who` (already prepared), 60s apart (cooldown).
    function _buyN(address who, uint256 n, uint256 amt) internal {
        for (uint256 i; i < n; ++i) {
            _buy(who, amt);
            _warpBy(60);
        }
    }

    function _sell(address who, uint256 ppl) internal returns (uint256 payout) {
        vm.prank(who);
        payout = hub.sellBack(ppl, 0);
    }

    /// @dev Seed a consistent curve position, then give `who` n lots of `amt` each.
    function _seedSeller(uint256 raised, address who, uint256 n, uint256 amt) internal {
        _seedRaised(raised);
        _prepare(who);
        _buyN(who, n, amt);
    }

    function _unlock() internal {
        _warpBy(30 days);
    }

    function _graduate(address who) internal {
        _seedRaised(CAP - MAX_BUY);
        _prepare(who);
        _buy(who, MAX_BUY);
        assertTrue(hub.graduated(), "graduated");
    }

    function _announce() internal {
        vm.prank(owner);
        hub.announceLiquidityRelease();
    }

    function _ceil(uint256 a, uint256 bps) internal pure returns (uint256) {
        return (a * bps + 9_999) / 10_000;
    }

    /// @dev Independent restatement of the Q3 fee: 1.5% below 1% of the snapshot, 3% above, each ceil'd.
    function _expFee(uint256 gross, uint256 snapshot, uint256 dayGross) internal pure returns (uint256) {
        uint256 line = snapshot * 100 / 10_000;
        uint256 room = line > dayGross ? line - dayGross : 0;
        uint256 low = gross < room ? gross : room;
        return _ceil(low, 150) + _ceil(gross - low, 300);
    }

    function _unlockedHolder() internal {
        _seedSeller(SMALL_RAISED, alice, 2, MAX_BUY);
        _unlock();
    }

    // ================================================================ eligibility

    function test_sellBackRequiresVerified() public {
        _seedSeller(SMALL_RAISED, alice, 2, MAX_BUY);
        _unlock();

        // never verified, no lots
        vm.prank(carol);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.sellBack(1e18, 0);

        // unbound after buying: lots stay, but selling needs a current binding
        vm.prank(owner);
        hub.unbind(alice);
        uint256 ppl = hub.pplOf(alice) / 10;
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.sellBack(ppl, 0);

        // re-verify (fresh nonce) restores the ability
        _verify(alice);
        assertGt(_sell(alice, ppl), 0, "sells after re-verify");

        // zero amount
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ZeroOut.selector);
        hub.sellBack(0, 0);
    }

    function test_sellBackLockedLotReverts() public {
        _seedSeller(SMALL_RAISED, alice, 1, MAX_BUY);
        uint256 boughtAt = uint256(hub.lots(alice, 0, 1)[0].boughtAt);
        uint256 ppl = hub.pplOf(alice) / 2;

        vm.warp(boughtAt + 30 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(ppl, 0);

        vm.warp(boughtAt + 30 days); // exactly HOLD: unlocked
        assertGt(_sell(alice, ppl), 0);
    }

    function test_sellBackUnlocksPerLot() public {
        _seedRaised(SMALL_RAISED);
        _prepare(alice);
        _buy(alice, MAX_BUY);
        _warpBy(5 days);
        _buy(alice, MAX_BUY);
        uint256 t0 = uint256(hub.lots(alice, 0, 1)[0].boughtAt);
        uint256 t1 = uint256(hub.lots(alice, 1, 1)[0].boughtAt);
        uint256 l0 = hub.lots(alice, 0, 1)[0].pplRemaining;
        uint256 l1 = hub.lots(alice, 1, 1)[0].pplRemaining;

        vm.warp(t0 + 30 days);
        assertEq(hub.sellableNow(alice), l0, "only lot0 sellable");
        _sell(alice, l0); // lot0 unlocked
        assertEq(hub.lotHead(alice), 1);

        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(1, 0); // lot1 still locked

        vm.warp(t1 + 30 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(l1, 0);

        vm.warp(t1 + 30 days);
        assertEq(hub.sellableNow(alice), l1);
        _sell(alice, l1);
        assertEq(hub.pplOf(alice), 0);
        assertEq(hub.lotHead(alice), 2);
    }

    function test_sellBackFifoSkipsNothing() public {
        _seedRaised(SMALL_RAISED);
        _prepare(alice);
        _buy(alice, MAX_BUY);
        uint256 t0 = _now();
        _warpBy(20 days);
        _buy(alice, MAX_BUY);
        vm.warp(t0 + 30 days); // lot0 unlocked, lot1 locked for 20 more days
        uint256 l0 = hub.lots(alice, 0, 1)[0].pplRemaining;
        uint256 l1 = hub.lots(alice, 1, 1)[0].pplRemaining;

        // cannot skip over the locked lot to reach more PPL
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(l0 + 1, 0);

        // partial head lot
        uint256 half = l0 / 2;
        _sell(alice, half);
        assertEq(hub.lotHead(alice), 0, "head lot not exhausted");
        assertEq(hub.lots(alice, 0, 1)[0].pplRemaining, l0 - half);
        assertEq(hub.lots(alice, 1, 1)[0].pplRemaining, l1, "lot1 untouched");

        // rest of head lot exactly
        _sell(alice, l0 - half);
        assertEq(hub.lotHead(alice), 1, "head advanced");
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(1, 0);

        // lot1 unlocks later; sell it across a different UTC day
        vm.warp(t0 + 20 days + 30 days + 1 hours);
        _sell(alice, l1);
        assertEq(hub.lotHead(alice), 2);
        assertEq(hub.pplOf(alice), 0);
    }

    // ================================================================ price

    function test_sellBackMovesPriceDown() public {
        _unlockedHolder();
        uint256 spotBefore = hub.spotPriceWad();
        uint256 soldBefore = hub.soldPpl();
        uint256 raisedBefore = hub.raisedUsd6();
        uint256 ppl = hub.pplOf(alice) / 4;
        (uint256 gross,,) = hub.quoteSellBack(alice, ppl);

        _sell(alice, ppl);

        assertLt(hub.spotPriceWad(), spotBefore, "price down");
        assertEq(hub.spotPriceWad(), PplCurveMathV2.spotPriceWad(hub.soldPpl()));
        assertEq(hub.soldPpl(), soldBefore - ppl, "sold down by pplIn");
        assertEq(hub.raisedUsd6(), raisedBefore - gross, "raised down by gross");
    }

    function testFuzz_buySellRoundTripNoProfit(uint256 seedR, uint256 amt) public {
        seedR = bound(seedR, 200_000e6, 3_000_000e6);
        amt = bound(amt, MIN_BUY, MAX_BUY);
        _seedRaised(seedR);
        _prepare(alice);
        uint256 balBefore = usdc.balanceOf(alice);
        uint256 ppl = _buy(alice, amt);
        _unlock();
        uint256 payout = _sell(alice, ppl);

        assertLt(payout, amt, "round trip strictly loses");
        assertEq(balBefore - usdc.balanceOf(alice), amt - payout, "net loss == amt - payout");
        assertEq(hub.pplOf(alice), 0);
        // the curve is back where it started (within rounding of the two curve maps)
        assertApproxEqAbs(hub.raisedUsd6(), seedR, 3 + seedR / 1e9, "curve restored");
    }

    // ================================================================ global / address caps

    /// @dev alice and bob each hold ~2000 USDC worth; reserve ~52k, global cap ~1040, line ~520.
    function _twoSellers() internal {
        _seedRaised(SMALL_RAISED);
        _prepare(alice);
        _prepare(bob);
        _buyN(alice, 4, MAX_BUY);
        _buyN(bob, 4, MAX_BUY);
        _unlock();
    }

    function test_sellBackGlobalCap() public {
        _twoSellers();
        uint256 aPpl = hub.pplOf(alice);
        uint256 bPpl = hub.pplOf(bob);

        uint256 reserveBefore = hub.reserveUsd6();
        _sell(alice, aPpl * 45 / 100);
        assertEq(hub.sellDayReserveSnapshot(), reserveBefore, "snapshot = reserve at first sell");
        (uint256 remaining,) = hub.sellBackCapToday();
        assertEq(remaining, reserveBefore * 200 / 10_000 - hub.sellDayGrossUsd6());

        (uint256 gTooBig,,) = hub.quoteSellBack(bob, bPpl * 10 / 100);
        assertGt(gTooBig, remaining, "precondition: over remaining cap");
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.GlobalDayCap.selector);
        hub.sellBack(bPpl * 10 / 100, 0);

        (uint256 gOk,,) = hub.quoteSellBack(bob, bPpl * 5 / 100);
        assertLe(gOk, remaining, "precondition: under remaining cap");
        _sell(bob, bPpl * 5 / 100);
    }

    function test_sellBackGlobalCapResetsNextUtcDay() public {
        _twoSellers();
        uint256 aPpl = hub.pplOf(alice);
        uint256 bPpl = hub.pplOf(bob);
        _sell(alice, aPpl * 45 / 100);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.GlobalDayCap.selector);
        hub.sellBack(bPpl * 10 / 100, 0);

        _skipToNextUtcDay();
        uint256 reserveNow = hub.reserveUsd6();
        (uint256 remaining,) = hub.sellBackCapToday();
        assertEq(remaining, reserveNow * 200 / 10_000, "fresh cap before first sell of the day");

        _sell(bob, bPpl * 10 / 100); // same sell now passes
        assertEq(hub.sellDay(), _now() / 1 days);
        assertEq(hub.sellDayReserveSnapshot(), reserveNow);
    }

    function test_sellBackCapUsesDayStartSnapshot() public {
        _twoSellers();
        uint256 aPpl = hub.pplOf(alice);
        uint256 bPpl = hub.pplOf(bob);
        uint256 s = hub.reserveUsd6();
        _sell(alice, aPpl * 45 / 100);
        (uint256 remBefore,) = hub.sellBackCapToday();

        // reserve grows tenfold mid-day (e.g. other buys / top-up); the cap does not follow it
        uint256 r = hub.reserveUsd6();
        hub.forceReserve(r * 10);
        usdc.mint(address(hub), r * 9);
        (uint256 remAfter,) = hub.sellBackCapToday();
        assertEq(remAfter, remBefore, "cap fixed to day-start snapshot");
        assertEq(hub.sellDayReserveSnapshot(), s);

        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.GlobalDayCap.selector);
        hub.sellBack(bPpl * 10 / 100, 0);

        // next UTC day takes a new snapshot from the (now larger) reserve
        _skipToNextUtcDay();
        uint256 resBefore = hub.reserveUsd6();
        _sell(bob, bPpl * 10 / 100);
        assertEq(hub.sellDayReserveSnapshot(), resBefore);
    }

    /// @dev Reserve ~1M so the global cap never binds; alice holds ~2500 USDC worth over two days.
    function _addressCapSeller() internal returns (uint256 total) {
        _seedRaised(BIG_RAISED);
        _prepare(alice);
        _buyN(alice, 4, MAX_BUY);
        _skipToNextUtcDay();
        _buyN(alice, 1, MAX_BUY);
        _unlock();
        total = hub.pplOf(alice);
    }

    function test_sellBackAddressCap() public {
        uint256 total = _addressCapSeller();
        _sell(alice, total * 70 / 100);
        uint256 used = SELL_CAP() - hub.addressSellRemainingToday(alice);
        assertGt(used, 1_700e6);
        assertLt(used, SELL_CAP());

        (uint256 g,,) = hub.quoteSellBack(alice, total * 20 / 100);
        assertGt(used + g, SELL_CAP(), "precondition: crosses 2000");
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AddressDayCap.selector);
        hub.sellBack(total * 20 / 100, 0);

        // a smaller one still fits
        _sell(alice, total * 5 / 100);
        // the address cap is per address: bob (fresh) is unaffected by alice's usage
        assertEq(hub.addressSellRemainingToday(bob), SELL_CAP());
    }

    function test_sellBackAddressCapResetsNextDay() public {
        uint256 total = _addressCapSeller();
        _sell(alice, total * 70 / 100);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AddressDayCap.selector);
        hub.sellBack(total * 20 / 100, 0);

        _skipToNextUtcDay();
        assertEq(hub.addressSellRemainingToday(alice), SELL_CAP(), "reset");
        uint256 p = _sell(alice, total * 20 / 100);
        assertGt(p, 0);
        assertLt(hub.addressSellRemainingToday(alice), SELL_CAP());
    }

    function SELL_CAP() internal pure returns (uint256) {
        return 2_000e6;
    }

    // ================================================================ fees (Q3)

    /// @dev alice holds ~1000 USDC worth in 2 lots; reserve 50.5k -> line 505, cap 1010.
    function test_feeLowBelowThreshold() public {
        _unlockedHolder();
        uint256 snapshot = hub.reserveUsd6();
        uint256 line = snapshot * 100 / 10_000;
        uint256 ppl = hub.pplOf(alice) * 20 / 100;
        (uint256 gross, uint256 fee, uint256 payout) = hub.quoteSellBack(alice, ppl);
        assertLt(gross, line, "precondition: below line");

        uint256 bal = usdc.balanceOf(alice);
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.SoldBack(alice, ppl, gross, fee, payout);
        assertEq(_sell(alice, ppl), payout);
        assertEq(usdc.balanceOf(alice) - bal, payout);
        assertEq(fee, _ceil(gross, 150), "1.5% ceil");
        assertEq(fee, _expFee(gross, snapshot, 0));
    }

    function test_feeHighAboveThreshold() public {
        _unlockedHolder();
        uint256 snapshot = hub.reserveUsd6();
        uint256 line = snapshot * 100 / 10_000;
        uint256 total = hub.pplOf(alice);
        _sell(alice, total * 60 / 100); // crosses the line
        (, uint256 lowLeft) = hub.sellBackCapToday();
        assertEq(lowLeft, 0, "line used up");
        uint256 dayGross = hub.sellDayGrossUsd6();
        assertGt(dayGross, line);

        uint256 ppl = total * 10 / 100;
        (uint256 gross, uint256 fee, uint256 payout) = hub.quoteSellBack(alice, ppl);
        assertEq(fee, _ceil(gross, 300), "3% ceil on the whole sell");
        assertEq(fee, _expFee(gross, hub.sellDayReserveSnapshot(), dayGross));
        assertEq(_sell(alice, ppl), payout);
    }

    function test_feeSplitAcrossThreshold() public {
        _unlockedHolder();
        uint256 snapshot = hub.reserveUsd6();
        uint256 line = snapshot * 100 / 10_000;
        uint256 ppl = hub.pplOf(alice) * 60 / 100;
        (uint256 gross, uint256 fee, uint256 payout) = hub.quoteSellBack(alice, ppl);
        assertGt(gross, line, "precondition: crosses line");
        assertLt(gross, snapshot * 200 / 10_000, "precondition: under global cap");

        uint256 expected = _ceil(line, 150) + _ceil(gross - line, 300);
        assertEq(fee, expected, "split fee");
        assertGt(fee, _ceil(gross, 150), "more than flat low");
        assertLt(fee, _ceil(gross, 300), "less than flat high");
        assertEq(_sell(alice, ppl), payout);
    }

    function test_feeStaysInReserve() public {
        _unlockedHolder();
        assertEq(usdc.balanceOf(address(hub)), hub.reserveUsd6(), "precondition: balance == reserve");
        uint256 reserveBefore = hub.reserveUsd6();
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 ppl = hub.pplOf(alice) / 3;
        (uint256 gross, uint256 fee, uint256 payout) = hub.quoteSellBack(alice, ppl);
        assertGt(fee, 0);

        _sell(alice, ppl);

        assertEq(hub.reserveUsd6(), reserveBefore - payout, "reserve loses payout only");
        assertEq(usdc.balanceOf(address(hub)), hub.reserveUsd6(), "fee remains as reserve USDC");
        assertEq(reserveBefore - hub.reserveUsd6(), gross - fee);
        assertEq(usdc.balanceOf(treasury), treasuryBefore, "treasury gets nothing from sell-back");
    }

    // ================================================================ phases

    function test_sellBackClosedAfterGraduation() public {
        _graduate(alice);
        _unlock();
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SellBackClosed.selector);
        hub.sellBack(1, 0);
        // closed before any other check
        vm.prank(carol);
        vm.expectRevert(PplCurveHubV2.SellBackClosed.selector);
        hub.sellBack(1, 0);
    }

    function test_sellBackWorksAfterExpiry() public {
        _unlockedHolder();
        vm.warp(uint256(hub.openedAt()) + hub.TERM());
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Expired));
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        uint256 ppl = hub.pplOf(alice) / 4;
        uint256 payout = _sell(alice, ppl);
        assertGt(payout, 0);
    }

    function test_sellBackWorksLongAfterExpiry() public {
        _unlockedHolder();
        vm.warp(uint256(hub.openedAt()) + hub.TERM() + 6 * 365 days);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Expired));
        uint256 total = hub.pplOf(alice);
        uint256 bal = usdc.balanceOf(alice);
        uint256 payout = _sell(alice, total / 4);
        assertGt(payout, 0);
        assertEq(usdc.balanceOf(alice) - bal, payout);
        // and again on a later day, same limits
        _skipToNextUtcDay();
        assertGt(_sell(alice, total / 4), 0);
    }

    /// @dev Natural paths cannot reach ReserveExhausted: reserve >= ~50% of raised while gross <= 2% of the
    /// day-start reserve snapshot (and a tiny reserve also makes the snapshot cap tiny -> GlobalDayCap first).
    /// It is reachable only when the reserve falls below the snapshot after the day's first sell-back, which
    /// the harness forces here.
    function test_sellBackRevertsWhenReserveEmpty() public {
        _seedSeller(SMALL_RAISED, alice, 4, MAX_BUY);
        _unlock();
        uint256 total = hub.pplOf(alice);
        uint256 r0 = hub.reserveUsd6();

        // fresh day with a tiny reserve: snapshot (and so the 2% cap) is tiny -> GlobalDayCap triggers first
        hub.forceReserve(1e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.GlobalDayCap.selector);
        hub.sellBack(total / 20, 0);
        hub.forceReserve(r0); // restore the real reserve (balance covers it)

        _sell(alice, total / 20); // sets the day snapshot
        hub.forceReserve(1e6); // reserve drops below one payout, snapshot stays
        (uint256 gross, uint256 fee,) = hub.quoteSellBack(alice, total / 20);
        assertGt(gross - fee, 1e6, "precondition");
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ReserveExhausted.selector);
        hub.sellBack(total / 20, 0);
    }

    function test_unsoldPplAfterExpiry() public {
        _unlockedHolder();
        vm.warp(uint256(hub.openedAt()) + hub.TERM() + 1);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Expired));
        uint256 unsold = hub.unsoldPpl();
        assertEq(unsold, hub.SUPPLY_PPL() - hub.soldPpl());
        assertGt(unsold, 0);
        uint256 ppl = hub.pplOf(alice) / 4;
        _sell(alice, ppl);
        assertEq(hub.unsoldPpl(), unsold + ppl, "sell-back returns PPL to the unsold pool");
    }

    function test_unsoldPplAfterGraduation() public {
        _graduate(alice);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Graduated));
        assertEq(hub.unsoldPpl(), hub.SUPPLY_PPL() - hub.soldPpl());
        assertLe(hub.soldPpl(), hub.SUPPLY_PPL());
        assertGt(hub.unsoldPpl(), 0);
    }

    // ================================================================ rescue / admin

    function test_rescueCannotTakeReserve() public {
        _unlockedHolder();
        uint256 reserve = hub.reserveUsd6();
        assertEq(usdc.balanceOf(address(hub)), reserve);

        // no surplus yet: even 1 unit is refused
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ExceedsSurplus.selector);
        hub.rescue(address(usdc), 1);

        // a stray 100 USDC is rescuable, but not 1 unit more
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        usdc.mint(address(hub), 100e6);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ExceedsSurplus.selector);
        hub.rescue(address(usdc), 100e6 + 1);
        vm.prank(owner);
        hub.rescue(address(usdc), 100e6);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 100e6, "to treasury");
        assertEq(usdc.balanceOf(address(hub)), reserve, "reserve intact");

        // insolvent (balance below reserve): nothing can leave, not even 0
        hub.forceReserve(reserve + 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ExceedsSurplus.selector);
        hub.rescue(address(usdc), 0);
        hub.forceReserve(reserve);

        // other tokens are free to rescue
        MockUSDC other = new MockUSDC();
        other.mint(address(hub), 7e6);
        vm.prank(owner);
        hub.rescue(address(other), 7e6);
        assertEq(other.balanceOf(treasury), 7e6);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.rescue(address(usdc), 0);
    }

    function test_onlyOwnerAdmin() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        address[] memory none = new address[](0);
        vm.startPrank(alice);
        vm.expectRevert(err);
        hub.open();
        vm.expectRevert(err);
        hub.pause();
        vm.expectRevert(err);
        hub.unpause();
        vm.expectRevert(err);
        hub.setVerifier(alice);
        vm.expectRevert(err);
        hub.unbind(bob);
        vm.expectRevert(err);
        hub.rescue(address(usdc), 0);
        vm.expectRevert(err);
        hub.announceLiquidityRelease();
        vm.expectRevert(err);
        hub.cancelLiquidityRelease();
        vm.expectRevert(err);
        hub.markDelivered(none);
        vm.expectRevert(err);
        hub.transferOwnership(alice);
        vm.stopPrank();

        // renounce is disabled for everyone, owner included
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.RenounceDisabled.selector);
        hub.renounceOwnership();
        assertEq(hub.owner(), owner);

        // the owner path works and is the only one
        vm.prank(owner);
        hub.pause();
        assertTrue(hub.paused());
    }

    // ================================================================ liquidity release (Q1)

    function test_liquidityReleaseTimelock() public {
        _unlockedHolder();
        vm.expectRevert(PplCurveHubV2.ReleaseNotAnnounced.selector);
        hub.executeLiquidityRelease();

        _announce();
        uint256 t = _now();
        assertEq(uint256(hub.releaseAnnouncedAt()), t);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ReleaseNotAllowed.selector);
        hub.announceLiquidityRelease(); // only once

        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
        vm.warp(t + 30 days - 1);
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();

        vm.warp(t + 30 days);
        uint256 reserve = hub.reserveUsd6();
        assertGt(reserve, 0);
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.LiquidityReleased(liquidityReceiver, reserve);
        vm.prank(carol); // permissionless
        hub.executeLiquidityRelease();

        assertEq(usdc.balanceOf(liquidityReceiver), reserve);
        assertEq(hub.reserveUsd6(), 0);
        assertEq(usdc.balanceOf(address(hub)), 0);
        assertTrue(hub.liquidityReleased());
        vm.expectRevert(PplCurveHubV2.ReleaseNotAnnounced.selector);
        hub.executeLiquidityRelease(); // terminal
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ReleaseNotAnnounced.selector);
        hub.cancelLiquidityRelease();
    }

    function test_liquidityReleaseAnnounceStopsBuys() public {
        _unlockedHolder();
        _fund(bob, 1_000e6);
        _verify(bob);
        _announce();
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Open), "phase unchanged");
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, bob, address(0));
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    function test_liquidityReleaseCancel() public {
        _unlockedHolder();
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ReleaseNotAnnounced.selector);
        hub.cancelLiquidityRelease(); // nothing to cancel

        _announce();
        vm.expectEmit(false, false, false, true, address(hub));
        emit PplCurveHubV2.LiquidityReleaseCancelled();
        vm.prank(owner);
        hub.cancelLiquidityRelease();
        assertEq(uint256(hub.releaseAnnouncedAt()), 0);

        // buys are open again
        uint256 before = hub.pplOf(alice);
        _buy(alice, MIN_BUY);
        assertGt(hub.pplOf(alice), before);

        // execution of a cancelled notice is impossible, and a new notice restarts the clock
        _warpBy(31 days);
        vm.expectRevert(PplCurveHubV2.ReleaseNotAnnounced.selector);
        hub.executeLiquidityRelease();
        _announce();
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
    }

    function test_cancelReleaseRevertsAfterDelivery() public {
        _unlockedHolder();
        _announce();
        address[] memory hs = new address[](1);
        hs[0] = alice;
        vm.prank(owner);
        hub.markDelivered(hs);
        assertTrue(hub.deliveryStarted());
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.DeliveryStarted.selector);
        hub.cancelLiquidityRelease();
        // the release itself is unaffected
        _warpBy(30 days);
        hub.executeLiquidityRelease();
        assertTrue(hub.liquidityReleased());
    }

    function test_liquidityReleaseAfterGraduation() public {
        _graduate(alice);
        uint256 reserve = hub.reserveUsd6();
        uint256 execAt = _now() + 30 days;
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.LiquidityReleaseAnnounced(liquidityReceiver, reserve, execAt, true);
        _announce();

        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
        vm.warp(execAt);
        hub.executeLiquidityRelease();
        assertEq(usdc.balanceOf(liquidityReceiver), reserve);
        assertEq(hub.reserveUsd6(), 0);
    }

    function test_sellBackWorksDuringNotice() public {
        _unlockedHolder();
        _announce();
        uint256 t = _now();
        _warpBy(1 days);
        uint256 reserveBefore = hub.reserveUsd6();
        uint256 ppl = hub.pplOf(alice) / 4;
        uint256 payout = _sell(alice, ppl);
        assertGt(payout, 0);
        assertEq(hub.reserveUsd6(), reserveBefore - payout);

        vm.warp(t + 30 days);
        uint256 remaining = hub.reserveUsd6();
        hub.executeLiquidityRelease();
        assertEq(usdc.balanceOf(liquidityReceiver), remaining, "only what is left of the reserve");
        assertEq(usdc.balanceOf(address(hub)), 0);
    }

    function test_sellBackClosedAfterRelease() public {
        _unlockedHolder();
        _announce();
        _warpBy(30 days);
        hub.executeLiquidityRelease();
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SellBackClosed.selector);
        hub.sellBack(1, 0);
        assertEq(hub.reserveUsd6(), 0);
    }

    // ================================================================ delivery (Q2)

    function test_deliveredCannotSellBack() public {
        _seedRaised(SMALL_RAISED);
        _prepare(alice);
        _prepare(carol);
        _buyN(alice, 2, MAX_BUY);
        _buyN(carol, 2, MAX_BUY);
        _unlock();
        _announce();

        address[] memory hs = new address[](1);
        hs[0] = alice;
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.Delivered(alice, hub.pplOf(alice));
        vm.prank(owner);
        hub.markDelivered(hs);
        assertTrue(hub.delivered(alice));

        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.IsDelivered.selector);
        hub.sellBack(1e18, 0);
        assertGt(_sell(carol, hub.pplOf(carol) / 10), 0, "non-delivered holder unaffected");

        // idempotent
        vm.prank(owner);
        hub.markDelivered(hs);
    }

    function test_sellBackRevertsForDeliveredHolder() public {
        _seedRaised(SMALL_RAISED);
        _prepare(alice);
        _prepare(carol);
        _buyN(alice, 2, MAX_BUY);
        _buyN(carol, 2, MAX_BUY);
        _warpBy(30 days + 1);
        _announce();

        address[] memory hs = new address[](1);
        hs[0] = alice;
        vm.prank(owner);
        hub.markDelivered(hs);
        assertTrue(hub.delivered(alice));

        // delivered (frozen) buyer cannot sell back during the notice, even with unlocked lots
        uint256 pplAlice = hub.pplOf(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.IsDelivered.selector);
        hub.sellBack(pplAlice / 10, 0);
        assertEq(hub.pplOf(alice), pplAlice, "record untouched");

        // a non-delivered holder can still sell back during the notice
        assertGt(_sell(carol, hub.pplOf(carol) / 10), 0, "non-delivered holder unaffected");
    }

    function test_markDeliveredOnlyAfterSaleOver() public {
        _unlockedHolder();
        address[] memory hs = new address[](1);
        hs[0] = alice;

        // normal sale: refused
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.DeliveryNotAllowed.selector);
        hub.markDelivered(hs);
        assertFalse(hub.deliveryStarted());

        // expiry alone does not count: it needs a public release announcement
        vm.warp(uint256(hub.openedAt()) + hub.TERM() + 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.DeliveryNotAllowed.selector);
        hub.markDelivered(hs);

        _announce();
        vm.prank(owner);
        hub.markDelivered(hs);
        assertTrue(hub.delivered(alice));
        assertTrue(hub.deliveryStarted());

        // graduation also unlocks it (fresh hub)
        hub = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier);
        _open();
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.DeliveryNotAllowed.selector);
        hub.markDelivered(hs);
        _graduate(bob);
        vm.prank(owner);
        hub.markDelivered(hs);
        assertTrue(hub.delivered(alice));
    }

    // ================================================================ pause

    function test_pauseBlocksBuyAndSell() public {
        _unlockedHolder();
        vm.prank(owner);
        hub.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.sellBack(1e18, 0);

        // verify still works while paused
        _verify(bob);
        assertTrue(hub.personOf(bob) != bytes32(0));

        vm.prank(owner);
        hub.unpause();
        assertGt(_sell(alice, hub.pplOf(alice) / 10), 0);
        _buy(alice, MIN_BUY);
    }

    // ================================================================ lots per sell / gas

    function test_sellBackMaxLotsPerSell() public {
        _seedSeller(SMALL_RAISED, alice, 51, MIN_BUY); // 51 lots of 10 USDC (cooldown 60s)
        _unlock();
        assertEq(hub.lotCount(alice), 51);

        PplCurveHubV2.Lot[] memory ls = hub.lots(alice, 0, 51);
        uint256 first50;
        for (uint256 i; i < 50; ++i) {
            first50 += ls[i].pplRemaining;
        }
        uint256 all = first50 + ls[50].pplRemaining;
        assertEq(hub.pplOf(alice), all);
        assertEq(hub.sellableNow(alice), first50, "view caps at 50 lots");

        // 51 lots in one sell: refused
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(all, 0);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotEnoughUnlocked.selector);
        hub.sellBack(first50 + 1, 0);

        // exactly 50 lots: works
        _sell(alice, first50);
        assertEq(hub.lotHead(alice), 50);
        assertEq(hub.pplOf(alice), ls[50].pplRemaining);
        // the 51st goes in a second call
        _sell(alice, ls[50].pplRemaining);
        assertEq(hub.pplOf(alice), 0);
        assertEq(hub.lotHead(alice), 51);
    }

    function test_sellBackGas() public {
        _seedSeller(SMALL_RAISED, alice, 1, MAX_BUY);
        _unlock();
        uint256 ppl = hub.pplOf(alice);
        vm.prank(alice);
        uint256 g0 = gasleft();
        hub.sellBack(ppl, 0);
        uint256 used = g0 - gasleft();
        console2.log("sellBack single-lot gas", used);
        assertLt(used, 300_000, "single-lot sellBack gas");
    }

    // ================================================================ fork

    function test_forkBaseUsdcEndToEnd() public {
        if (bytes(vm.envOr("BASE_FORK_RPC_URL", string(""))).length == 0) {
            vm.skip(true);
        }
        vm.createSelectFork(vm.envString("BASE_FORK_RPC_URL"));
        address baseUsdc = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        hub = new HubV2Harness(baseUsdc, treasury, liquidityReceiver, owner, verifier);
        _open();
        _verify(alice);
        deal(baseUsdc, alice, 10_000e6);
        vm.startPrank(alice);
        IERC20(baseUsdc).approve(address(hub), type(uint256).max);
        uint256 ppl = hub.buy(MAX_BUY, 0, alice, address(0));
        vm.stopPrank();
        assertEq(IERC20(baseUsdc).balanceOf(address(hub)), hub.reserveUsd6());

        _warpBy(31 days);
        uint256 bal = IERC20(baseUsdc).balanceOf(alice);
        uint256 payout = _sell(alice, ppl / 200);
        assertEq(IERC20(baseUsdc).balanceOf(alice) - bal, payout);
        assertEq(IERC20(baseUsdc).balanceOf(address(hub)), hub.reserveUsd6());
    }
}
