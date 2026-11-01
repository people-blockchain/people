// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {PplCurveMath} from "../src/sale/PplCurveHub.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base} from "./PplCurveHubV2Base.sol";

/// @dev Regression gates for one call. Not a block-gas safety limit.
library HubV2GasGate {
    /// @dev Regression gate, not a block-gas safety limit: measured max 572901 at n=200 (solc 0.8.24, via_ir, 200 runs, paris) + 10%. Per-call work is capped by MAX_LOTS_PER_SELL / CAPACITY, so gas does not grow past 50 records.
    uint256 internal constant SELL_BACK = 631_000;
    /// @dev Regression gate, not a block-gas safety limit: measured max 272777 at n=200 (solc 0.8.24, via_ir, 200 runs, paris) + 10%. Per-call work is capped by MAX_LOTS_PER_SELL / CAPACITY, so gas does not grow past 50 records.
    uint256 internal constant BUY_PRUNE = 301_000;
    /// @dev Regression gate, not a block-gas safety limit: measured max 291427 at n=200 (solc 0.8.24, via_ir, 200 runs, paris) + 10%. Per-call work is capped by MAX_LOTS_PER_SELL / CAPACITY, so gas does not grow past 50 records.
    uint256 internal constant BUY_APPEND = 321_000;
    /// @dev Regression gate, not a block-gas safety limit: measured max 145837 at n=200 (solc 0.8.24, via_ir, 200 runs, paris) + 10%. Per-call work is capped by MAX_LOTS_PER_SELL / CAPACITY, so gas does not grow past 50 records.
    uint256 internal constant SELLABLE_NOW = 161_000;
    /// @dev Regression gate, not a block-gas safety limit: measured max 174577 at n=200 (solc 0.8.24, via_ir, 200 runs, paris) + 10%. Per-call work is capped by MAX_LOTS_PER_SELL / CAPACITY, so gas does not grow past 50 records.
    uint256 internal constant BUY_REFUSED = 193_000;
}

/// @dev Gas of the capped per-person loops, plus a 220-lot drain that must not stick.
/// Setup, funding, and attested sells come from `HubV2Base` (the base the audit tests use).
/// Lot creation stays inside the default 20 buys / $2_000 per 24h and does not use a router.
/// A 49- or 50-entry buy window is only possible after the owner raises `maxBuysPer24h` to
/// `RollingWindow24h.CAPACITY` (50); that fill is separate from the lot builder.
contract PplCurveHubV2GasTest is HubV2Base {
    address internal alice = makeAddr("alice");

    uint256 internal constant BIG_RAISED = 2_000_000e6;
    /// @dev Same curve slop as `invariant_curveConsistency` in the invariant suite.
    uint256 internal constant UP_TOL = 5e14;
    uint256 internal constant DOWN_TOL = 1e3;

    function setUp() public override {
        super.setUp();
        _open();
    }

    function test_gas_measure_1() public {
        _measure(1);
    }

    function test_gas_measure_10() public {
        _measure(10);
    }

    function test_gas_measure_50() public {
        _measure(50);
    }

    function test_gas_measure_200() public {
        _measure(200);
    }

    /// @dev 220 unlocked lots. One call can touch 50. Warping clears the $2_000 / 10-sell / 2% windows.
    /// Every PPL must come out; `lotHead` catches up with `lotCount`.
    function test_gas_drain_220() public {
        _seedRaised(BIG_RAISED);
        uint256 phantom = hub.soldPpl();
        _prepare(alice);
        _buyLots(alice, 220);
        vm.warp(block.timestamp + hub.HOLD());

        assertEq(hub.lotCount(alice), 220);
        assertEq(hub.lotHead(alice), 0);
        _assertBooks(alice, phantom);

        uint256 first50 = _sumLots(alice, 0, 50);
        uint256 lot51 = _sumLots(alice, 50, 1);
        assertGt(first50, 0);
        assertGt(lot51, 0);
        assertEq(hub.sellableNow(alice), first50, "view stops at 50 lots");

        uint256 soldBefore = hub.soldPpl();
        uint256 pplBefore = hub.pplOf(alice);
        uint256 reserveBefore = hub.reserveUsd6();
        _expectSellBackRevert(alice, first50 + lot51, 0, PplCurveHubV2.NotEnoughUnlocked.selector);
        assertEq(hub.soldPpl(), soldBefore, "failed sell does not move soldPpl");
        assertEq(hub.pplOf(alice), pplBefore);
        assertEq(hub.reserveUsd6(), reserveBefore);
        assertEq(hub.lotHead(alice), 0);
        assertEq(hub.lots(alice, 50, 1)[0].pplRemaining, lot51);

        uint256 calls;
        uint256 payout = _sellCapped(alice, first50);
        calls = 1;
        assertGt(payout, 0, "continuation after the 51-lot revert");
        assertEq(hub.lotHead(alice), 50, "first call consumed 50 lots");
        assertEq(hub.lots(alice, 50, 1)[0].pplRemaining, lot51, "51st lot waits for the next call");
        _assertBooks(alice, phantom);

        uint256 guard;
        while (hub.pplOf(alice) != 0) {
            assertLt(guard++, 40, "drain did not finish");
            uint256 beforeHead = hub.lotHead(alice);
            uint256 beforeSold = hub.soldPpl();
            uint256 beforeReserve = hub.reserveUsd6();
            uint256 chunk = _nextChunk(alice);
            assertGt(chunk, 0);
            assertLe(chunk, hub.sellableNow(alice), "chunk stays inside the 50-lot view");
            payout = _sellCapped(alice, chunk);
            assertGt(payout, 0);
            assertEq(hub.soldPpl(), beforeSold - chunk, "soldPpl decreases by pplIn");
            assertEq(beforeReserve - hub.reserveUsd6(), payout, "reserve drops by the payout");
            assertLe(hub.lotHead(alice) - beforeHead, hub.MAX_LOTS_PER_SELL(), "one call touches <= 50 lots");
            _assertBooks(alice, phantom);
            ++calls;
        }

        assertGe(calls, 5, "220 lots cannot fit in four 50-lot calls");
        assertEq(hub.lotHead(alice), hub.lotCount(alice));
        assertEq(hub.pplOf(alice), 0);
        assertEq(hub.soldPpl(), phantom, "holder PPL is gone; seeded curve position remains");
        PplCurveHubV2.Lot[] memory ls = hub.lots(alice, 0, 220);
        assertEq(ls.length, 220);
        for (uint256 i; i < ls.length; ++i) {
            assertEq(ls[i].pplRemaining, 0);
        }
        _assertBooks(alice, phantom);
        console2.log(string.concat("DRAIN calls=", vm.toString(calls)));
    }

    // ---------------------------------------------------------------- measure

    function _measure(uint256 n) internal {
        _seedRaised(BIG_RAISED);
        uint256 phantom = hub.soldPpl();
        _prepare(alice);
        _buyLots(alice, n);
        vm.warp(block.timestamp + hub.HOLD());

        uint256 take = n < hub.MAX_LOTS_PER_SELL() ? n : hub.MAX_LOTS_PER_SELL();
        uint256 sellPpl = _sumLots(alice, 0, take);
        assertEq(hub.lotCount(alice), n);
        assertEq(hub.sellableNow(alice), sellPpl, "unlocked sum is the first min(n,50) lots");
        assertEq(hub.soldPpl(), phantom + hub.pplOf(alice));
        assertEq(hub.pplOf(alice), _sumLots(alice, 0, n));

        uint256 gView = _gasSellable(alice);
        _logGas("sellableNow", n, gView, HubV2GasGate.SELLABLE_NOW);

        uint256 pplBefore = hub.pplOf(alice);
        uint256 gSell = _gasSell(alice, sellPpl);
        _logGas("sellBack", n, gSell, HubV2GasGate.SELL_BACK);
        assertEq(hub.lotHead(alice), take, "one sellBack consumed min(n,50) lots");
        assertEq(hub.pplOf(alice), pplBefore - sellPpl);
        assertEq(usdc.balanceOf(address(hub)), hub.reserveUsd6());

        // Owner may set the entry cap up to CAPACITY. Default 20 cannot stage 49–50 live rows.
        _limits(50, MIN_BUY, hub.maxSellsPer24h(), hub.minSellUsd6());

        uint256 liveBefore = n < 49 ? n : 49;
        address appender = makeAddr(string.concat("append-", vm.toString(n)));
        _buyPacked(appender, liveBefore);
        if (liveBefore != 0) vm.warp(block.timestamp + hub.BUY_COOLDOWN());
        uint256 gAppend = _gasBuy(appender);
        _logGas("buyAppend", n, gAppend, HubV2GasGate.BUY_APPEND);
        (, uint256 buys,,) = hub.usage24h(appender);
        assertEq(buys, liveBefore + 1, "append grew the live window by one");

        if (buys == 50) {
            vm.warp(block.timestamp + hub.BUY_COOLDOWN());
            uint256 gRefused = _gasBuyRefused(appender);
            _logGas("buyRefused", n, gRefused, HubV2GasGate.BUY_REFUSED);
            (, buys,,) = hub.usage24h(appender);
            assertEq(buys, 50, "refused buy did not append");
            vm.expectRevert(PplCurveHubV2.TooManyBuys.selector);
            vm.prank(appender);
            hub.buy(MIN_BUY, 0, appender, address(0));
        }

        uint256 expired = n < 50 ? n : 50;
        address pruner = makeAddr(string.concat("prune-", vm.toString(n)));
        _buyPacked(pruner, expired);
        vm.warp(block.timestamp + 1 days);
        (, buys,,) = hub.usage24h(pruner);
        assertEq(buys, 0, "entries are expired but still stored until prune");
        uint256 gPrune = _gasBuy(pruner);
        _logGas("buyPrune", n, gPrune, HubV2GasGate.BUY_PRUNE);
        (, buys,,) = hub.usage24h(pruner);
        assertEq(buys, 1, "prune dropped the expired rows and appended one");
    }

    function _gasSellable(address who) internal returns (uint256 used) {
        vm.cool(address(hub));
        uint256 g0 = gasleft();
        uint256 ppl = hub.sellableNow(who);
        used = g0 - gasleft();
        assertGt(ppl, 0);
    }

    function _gasSell(address who, uint256 ppl) internal returns (uint256 used) {
        bytes32 id = _freshReturnId();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signReturn(who, ppl, id, deadline);
        vm.cool(address(hub));
        vm.prank(who);
        uint256 g0 = gasleft();
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        used = g0 - gasleft();
    }

    function _gasBuy(address who) internal returns (uint256 used) {
        vm.cool(address(hub));
        vm.prank(who);
        uint256 g0 = gasleft();
        hub.buy(MIN_BUY, 0, who, address(0));
        used = g0 - gasleft();
    }

    function _gasBuyRefused(address who) internal returns (uint256 used) {
        bool accepted;
        vm.cool(address(hub));
        vm.prank(who);
        uint256 g0 = gasleft();
        try hub.buy(MIN_BUY, 0, who, address(0)) {
            accepted = true;
        } catch {}
        used = g0 - gasleft();
        assertFalse(accepted, "buy at a full window must revert");
    }

    function _logGas(string memory path, uint256 n, uint256 gasUsed, uint256 bound) internal pure {
        console2.log(string.concat("GAS ", path, " n=", vm.toString(n), " ", vm.toString(gasUsed)));
        assertLt(gasUsed, bound, path);
    }

    // ---------------------------------------------------------------- lots and caps

    /// @dev Self-buys of `MIN_BUY`. At most 20 in any rolling 24h (the default), each batch under
    /// the $2_000 cap, cooldown between buys, no router. A new day starts once the batch is full.
    function _buyLots(address who, uint256 n) internal {
        assertEq(hub.maxBuysPer24h(), 20, "lot builder uses the default entry cap");
        uint256 inWindow;
        for (uint256 i; i < n; ++i) {
            if (inWindow == 20) {
                vm.warp(block.timestamp + 1 days);
                inWindow = 0;
            } else if (i != 0) {
                vm.warp(block.timestamp + hub.BUY_COOLDOWN());
            }
            _buy(who, MIN_BUY);
            ++inWindow;
            (uint256 spent, uint256 buys,,) = hub.usage24h(who);
            assertLe(buys, 20, "20 buys/24h");
            assertLe(spent, hub.BUY_CAP_DAY_USD6(), "$2k/24h");
            (uint256 routerUsd, uint256 routerBuys) = hub.routerUsage24h(who);
            assertEq(routerUsd, 0, "router amount");
            assertEq(routerBuys, 0, "router count");
        }
    }

    /// @dev `n` self-buys inside one rolling day. `n` may be 50, so the owner cap must already allow it.
    /// Amount stays at `MIN_BUY` ($10): 50 of those are $500, under the $2_000 cap. No router.
    function _buyPacked(address who, uint256 n) internal {
        assertGe(hub.maxBuysPer24h(), n);
        assertLe(n * MIN_BUY, hub.BUY_CAP_DAY_USD6());
        _prepare(who);
        for (uint256 i; i < n; ++i) {
            if (i != 0) vm.warp(block.timestamp + hub.BUY_COOLDOWN());
            _buy(who, MIN_BUY);
        }
        (uint256 spent, uint256 buys,,) = hub.usage24h(who);
        assertEq(buys, n, "packed fill");
        assertLe(spent, hub.BUY_CAP_DAY_USD6());
        (uint256 routerUsd, uint256 routerBuys) = hub.routerUsage24h(who);
        assertEq(routerUsd, 0);
        assertEq(routerBuys, 0);
    }

    function _limits(uint256 maxBuys, uint256 minBuy, uint256 maxSells, uint256 minSell) internal {
        hub.testSetWindowLimits(maxBuys, minBuy, maxSells, minSell);
    }

    function _sumLots(address who, uint256 from, uint256 n) internal view returns (uint256 sum) {
        PplCurveHubV2.Lot[] memory ls = hub.lots(who, from, n);
        for (uint256 i; i < ls.length; ++i) {
            sum += ls[i].pplRemaining;
        }
    }

    /// @dev Person $2_000, 10 sells, and the 2% global cap. A full day-warp clears every window.
    function _fits(address who, uint256 ppl) internal view returns (bool) {
        (uint256 gross,,) = hub.quoteSellBack(who, ppl);
        if (gross == 0) return false;
        (,, uint256 soldGross, uint256 sells) = hub.usage24h(who);
        if (sells >= hub.maxSellsPer24h()) return false;
        if (soldGross + gross > hub.SELL_CAP_DAY_USD6()) return false;
        (uint256 gGross, uint256 gLive) = hub.globalSellUsed();
        if (gLive >= hub.GLOBAL_SELL_CAPACITY()) return false;
        uint256 globalCap = (hub.sellWindowReference() * hub.SELL_GLOBAL_CAP_BPS()) / 10_000;
        return gGross + gross <= globalCap;
    }

    /// @dev Largest unlocked prefix that fits today's caps. Warps one day once, then shrinks the lot count.
    function _nextChunk(address who) internal returns (uint256 ppl) {
        ppl = hub.sellableNow(who);
        assertGt(ppl, 0, "nothing unlocked");
        if (_fits(who, ppl)) return ppl;
        vm.warp(block.timestamp + 1 days);
        if (_fits(who, ppl)) return ppl;

        uint256 head = hub.lotHead(who);
        uint256 available = hub.lotCount(who) - head;
        uint256 maxK = available < hub.MAX_LOTS_PER_SELL() ? available : hub.MAX_LOTS_PER_SELL();
        for (uint256 k = maxK; k > 0; --k) {
            uint256 part = _sumLots(who, head, k);
            if (part != 0 && _fits(who, part)) return part;
        }
        revert("no sell fits the caps");
    }

    function _sellCapped(address who, uint256 ppl) internal returns (uint256 payout) {
        assertTrue(_fits(who, ppl), "sell exceeds a cap");
        uint256 beforeHead = hub.lotHead(who);
        payout = _sellBack(who, ppl, 0);
        assertLe(hub.lotHead(who) - beforeHead, hub.MAX_LOTS_PER_SELL());
    }

    /// @dev `invariant_solvency`, the balance==reserve half of `invariant_reserveAccounting`,
    /// `invariant_pplLedger` (seeded curve PPL has no lot), and `invariant_curveConsistency`.
    function _assertBooks(address who, uint256 phantom) internal view {
        assertGe(usdc.balanceOf(address(hub)), hub.reserveUsd6(), "reserve covers liabilities");
        assertEq(usdc.balanceOf(address(hub)), hub.reserveUsd6(), "reserve == hub balance");
        assertEq(hub.soldPpl(), phantom + hub.pplOf(who), "soldPpl == seeded + holder");
        assertEq(hub.pplOf(who), _sumLots(who, 0, hub.lotCount(who)), "pplOf == lot remainders");
        uint256 raised = hub.raisedUsd6();
        uint256 f = PplCurveMath.soldForRaised(raised);
        uint256 sold = hub.soldPpl();
        if (f >= sold) assertLe(f - sold, UP_TOL, "F(raised) too far above sold");
        else assertLe(sold - f, DOWN_TOL, "F(raised) too far below sold");
    }
}
