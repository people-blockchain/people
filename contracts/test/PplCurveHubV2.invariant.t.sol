// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {PplCurveMath} from "../src/sale/PplCurveHub.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Handler for the SPEC §7 invariants. All state-changing actions are bounded and wrapped in
/// try/catch so reverts do not dominate; ghosts are updated only on success and are derived from
/// USDC balance deltas / contract state deltas measured around the call (not from the hub's own
/// accounting variables) wherever possible. Time is always read through `vm.getBlockTimestamp()`
/// (via_ir caches `block.timestamp`).
contract HubV2Handler is Test {
    struct ShadowLot {
        uint256 at;
        uint256 ppl;
    }

    uint256 internal constant CAP = 4_000_000e6;
    uint256 internal constant HOLD = 30 days;

    HubV2Harness public hub;
    MockUSDC public usdc;
    address public owner;
    address public treasury;
    address public receiver;
    uint256 public verifierPk;
    uint256 public returnPk;

    address[] public actors; // verified, funded, approved
    address[] public holders; // actors + unverified extra recipients

    // ---- counters (successful actions)
    uint256 public buys;
    uint256 public sells;
    uint256 public buyAttempts;
    uint256 public sellAttempts;
    uint256 public warps;
    uint256 public ownerOps;
    uint256 public pauses;
    uint256 public announces;
    uint256 public cancels;
    uint256 public executes;
    uint256 public jumps;
    uint256 public rtChecks;
    uint256 public rtSkipped;
    uint256 public gradCount;

    // ---- money ghosts
    uint256 public ghostCharged; // Σ buyer USDC spent
    uint256 public ghostToReserve; // Σ hub USDC balance increase on buys
    uint256 public ghostPayout; // Σ seller USDC balance increase on sells
    uint256 public ghostReleased; // Σ receiver USDC balance increase on executeLiquidityRelease
    uint256 public forcedReserve; // reserve injected by jumpNearCap (harness)
    uint256 public phantomSold; // soldPpl injected by jumpNearCap (no holder owns it)
    uint256 public buyMismatch; // buys where returned pplOut != pplOf delta
    uint256 public payoutMismatch; // sells where event return value != balance delta
    uint256 public ghostGross; // Σ curve-area gross of sell-backs (raised delta)
    uint256 public ghostFees; // Σ (gross - payout): stays in the reserve

    // ---- violation flags
    uint256 public holdViolations; // sold from a lot younger than HOLD
    uint256 public oversold; // sold more than the shadow lots contain
    uint256 public rtViolations; // round-trip payout > paid in
    uint256 public rtWorstExcess;
    uint256 public rollingBuyViolations; // rolling-24h buy sum > cap, or live buys > maxBuysPer24h
    uint256 public rollingSellViolations; // rolling-24h sell gross > cap, or live sells > maxSellsPer24h
    uint256 public replayAccepted; // a consumed returnId paid out again
    uint256 public globalCapViolations;

    // ---- curve drift (max observed)
    uint256 public maxUp; // F(raised) - sold
    uint256 public maxDown; // sold - F(raised)

    // ---- per-day ghosts
    uint256[] public buyDays;
    mapping(uint256 => bool) internal _buyDaySeen;
    mapping(address => mapping(uint256 => uint256)) public buyUsed; // recipient => day => USDC

    uint256[] public sellDays;
    mapping(uint256 => bool) internal _sellDaySeen;
    mapping(uint256 => uint256) public sellDayGross;
    mapping(uint256 => uint256) public sellDaySnapshot; // reserve right before the day's first sell
    mapping(address => mapping(uint256 => uint256)) public sellUsed; // seller => day => gross

    // ---- rolling-24h spend logs per person (independent of the hub's ring buffer)
    struct Spend {
        uint256 at;
        uint256 amount;
        bool router; // buy made for someone else; own buys and all sells are false
    }

    mapping(address => Spend[]) internal _buyLog;
    mapping(address => Spend[]) internal _sellLog;

    // ---- shadow lots (independent FIFO model for the hold check)
    mapping(address => ShadowLot[]) internal _shadow;
    mapping(address => uint256) internal _shadowHead;

    // ---- graduation snapshot
    bool public gradTaken;
    uint256 public gradRaised;
    uint256 public gradSold;
    uint256 public gradReserve;
    uint256 public gradTreasury;
    bytes32 public gradHash;

    bool public jumped;
    uint256 internal _rtNonce;

    constructor(
        HubV2Harness hub_,
        MockUSDC usdc_,
        address owner_,
        address treasury_,
        address receiver_,
        uint256 verifierPk_,
        uint256 returnPk_,
        address[] memory actors_,
        address[] memory extras_
    ) {
        hub = hub_;
        usdc = usdc_;
        owner = owner_;
        treasury = treasury_;
        receiver = receiver_;
        verifierPk = verifierPk_;
        returnPk = returnPk_;
        for (uint256 i; i < actors_.length; ++i) {
            actors.push(actors_[i]);
            holders.push(actors_[i]);
        }
        for (uint256 i; i < extras_.length; ++i) {
            holders.push(extras_[i]);
        }
    }

    // ================================================================ actions

    function buy(uint256 aSeed, uint256 amount, uint256 rSeed, uint256 refSeed) external {
        _tick(aSeed >> 200);
        _buy(aSeed, amount, rSeed, refSeed);
        _post();
    }

    /// @dev Three buys in a row (different seeds) to raise buy weight vs. the other selectors.
    function buyBurst(uint256 aSeed, uint256 amount, uint256 rSeed, uint256 refSeed) external {
        _tick(aSeed >> 200);
        for (uint256 i; i < 3; ++i) {
            _buy(
                uint256(keccak256(abi.encode(aSeed, i))),
                uint256(keccak256(abi.encode(amount, i))),
                rSeed >> i,
                refSeed >> i
            );
        }
        _post();
    }

    function sellBack(uint256 aSeed, uint256 amount, uint256 fSeed) external {
        _tick(aSeed >> 200);
        _sell(aSeed, amount, fSeed);
        _post();
    }

    function sellBurst(uint256 aSeed, uint256 amount, uint256 fSeed) external {
        _tick(aSeed >> 200);
        for (uint256 i; i < 3; ++i) {
            _sell(uint256(keccak256(abi.encode(aSeed, i))), uint256(keccak256(abi.encode(amount, i))), fSeed >> (8 * i));
        }
        _post();
    }

    function warp(uint256 seed) external {
        ++warps;
        uint256 k = seed % 10;
        uint256 d = seed / 10;
        uint256 secs;
        if (k < 4) secs = bound(d, 30 days, 32 days);
        else if (k < 7) secs = bound(d, 61, 1 hours);
        else secs = bound(d, 1 hours, 3 days);
        vm.warp(vm.getBlockTimestamp() + secs);
        _post();
    }

    /// @dev Rare owner / keeper actions, dispatched by seed.
    function ownerAction(uint256 seed) external {
        ++ownerOps;
        uint256 kind = seed % 16;
        uint256 rest = seed / 16;
        if (kind == 0) {
            vm.prank(owner);
            try hub.pause() {
                ++pauses;
            } catch {}
        } else if (kind <= 2) {
            vm.prank(owner);
            try hub.unpause() {} catch {}
        } else if (kind == 3) {
            if (rest % 3 == 0) {
                vm.prank(owner);
                try hub.announceLiquidityRelease() {
                    ++announces;
                } catch {}
            }
        } else if (kind == 4) {
            vm.prank(owner);
            try hub.cancelLiquidityRelease() {
                ++cancels;
            } catch {}
        } else if (kind <= 6) {
            uint256 r0 = usdc.balanceOf(receiver);
            try hub.executeLiquidityRelease() {
                ++executes;
                ghostReleased += usdc.balanceOf(receiver) - r0;
            } catch {}
        } else if (kind == 8) {
            if (rest % 2 == 0) _jumpNearCap(rest / 2);
        }
        _post();
    }

    /// @dev Once per run (rare): push raised close to the cap through the harness so that graduation
    /// can happen within the run depth. Keeps reserve/USDC consistent and records the injected sold.
    function _jumpNearCap(uint256 gap) internal {
        if (jumped || hub.graduated() || hub.openedAt() == 0) return;
        uint256 r = hub.raisedUsd6();
        uint256 target = CAP - bound(gap, 20e6, 1_500e6);
        if (target < r + 100e6) return;
        jumped = true;
        ++jumps;
        uint256 soldBefore = hub.soldPpl();
        hub.forceRaised(target);
        uint256 add = (target - r) / 2;
        hub.forceReserve(hub.reserveUsd6() + add);
        usdc.mint(address(hub), add);
        forcedReserve += add;
        phantomSold += hub.soldPpl() - soldBefore;
    }

    /// @dev SPEC §7.10: on a fresh hub (no other actors) with arbitrary seeded curve position, buying
    /// and selling back the same PPL never pays out more than was paid in. Uses a separate hub+USDC
    /// so nothing in the main run is touched; time is restored afterwards.
    function roundTrip(uint256 r0Seed, uint256 amtSeed, uint256 holdSeed) external {
        uint256 t0 = vm.getBlockTimestamp();
        MockUSDC u = new MockUSDC();
        HubV2Harness h =
            new HubV2Harness(address(u), address(0x7001), address(0x7002), address(this), vm.addr(verifierPk), address(0));
        h.open();
        bytes32 qid = h.queueSetReturnVerifier(vm.addr(returnPk));
        vm.warp(vm.getBlockTimestamp() + h.ADMIN_TIMELOCK());
        h.executeSetReturnVerifier(qid);
        // The 48h wait is before the buy, so the hold and the bind deadline start from this timestamp.
        uint256 opened = vm.getBlockTimestamp();
        uint256 r0 = bound(r0Seed, 0, CAP - 1_000e6);
        h.forceRaised(r0);
        uint256 res = r0 - r0 / 2;
        if (res < 200_000e6) res = 200_000e6;
        h.forceReserve(res);
        u.mint(address(h), res);

        address a = address(uint160(0xA000 + (++_rtNonce)));
        bytes32 person = keccak256(abi.encode("rt", _rtNonce));
        _bind(h, a, person, opened + 1 days);

        uint256 amt = bound(amtSeed, 10e6, 500e6);
        u.mint(a, amt);
        vm.prank(a);
        u.approve(address(h), type(uint256).max);
        vm.prank(a);
        uint256 out = h.buy(amt, 0, a, address(0));

        vm.warp(opened + HOLD + bound(holdSeed, 0, 2 days));
        bytes32 rid = keccak256(abi.encode("rtReturn", _rtNonce));
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(h, a, person, out, rid, dl);
        vm.prank(a);
        try h.sellBack(out, 0, rid, dl, out, sig) returns (uint256 payout) {
            ++rtChecks;
            if (payout > amt) {
                ++rtViolations;
                if (payout - amt > rtWorstExcess) rtWorstExcess = payout - amt;
            }
        } catch {
            ++rtSkipped;
        }
        vm.warp(t0);
    }

    // ================================================================ internals

    function _bind(HubV2Harness h, address a, bytes32 person, uint256 deadline) internal {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PplCurveHubV2"),
                keccak256("1"),
                block.chainid,
                address(h)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)"),
                a,
                person,
                h.bindNonce(person),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(verifierPk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(a);
        h.verify(person, deadline, abi.encodePacked(r, s, v));
    }

    function _signReturn(HubV2Harness h, address seller, bytes32 person, uint256 ppl, bytes32 id, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PplCurveHubV2"),
                keccak256("1"),
                block.chainid,
                address(h)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "MainnetReturn(bytes32 personId,address hub,address seller,uint256 pplAmount,uint256 sourceChainId,uint256 destChainId,bytes32 returnId,uint256 deadline)"
                ),
                person,
                address(h),
                seller,
                ppl,
                uint256(97401),
                block.chainid,
                id,
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(returnPk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _tick(uint256 seed) internal {
        vm.warp(vm.getBlockTimestamp() + (seed % 120));
    }

    function _buy(uint256 aSeed, uint256 amount, uint256 rSeed, uint256 refSeed) internal {
        address buyer = actors[aSeed % actors.length];
        address recipient = rSeed % 3 == 0 ? holders[(rSeed / 3) % holders.length] : buyer;
        address ref = refSeed % 3 == 0 ? actors[(refSeed / 3) % actors.length] : address(0);
        uint256 amt = amount % 16 == 0 ? bound(amount, 0, 600e6) : bound(amount, 10e6, 500e6);

        uint256 buyerBal = usdc.balanceOf(buyer);
        uint256 hubBal = usdc.balanceOf(address(hub));
        uint256 recipientPpl = hub.pplOf(recipient);
        ++buyAttempts;
        vm.prank(buyer);
        try hub.buy(amt, 0, recipient, ref) returns (uint256 out) {
            ++buys;
            uint256 charged = buyerBal - usdc.balanceOf(buyer);
            ghostCharged += charged;
            ghostToReserve += usdc.balanceOf(address(hub)) - hubBal;
            if (hub.pplOf(recipient) - recipientPpl != out) ++buyMismatch;
            uint256 nowTs = vm.getBlockTimestamp();
            _shadow[recipient].push(ShadowLot(nowTs, out));
            uint256 day = nowTs / 1 days;
            if (!_buyDaySeen[day]) {
                _buyDaySeen[day] = true;
                buyDays.push(day);
            }
            buyUsed[recipient][day] += charged;
            // Router buys (recipient != buyer) do not consume own-buy slots or the cooldown. They have
            // their own count (MAX_ROUTER_BUYS_24H). The $2k amount cap stays shared.
            _logSpend(
                _buyLog[recipient],
                nowTs,
                charged,
                hub.BUY_CAP_DAY_USD6(),
                hub.maxBuysPer24h(),
                true,
                buyer != recipient
            );
        } catch {}
    }

    function _sell(uint256 aSeed, uint256 amount, uint256 fSeed) internal {
        address seller = actors[aSeed % actors.length];
        uint256 owned = hub.pplOf(seller);
        if (owned == 0) return;
        uint256 sellable = hub.sellableNow(seller);
        uint256 pplIn;
        if (fSeed % 5 == 0 || sellable == 0) {
            pplIn = bound(amount, 1, owned); // may include still-locked PPL (must revert)
        } else {
            uint256 pm = (fSeed / 5) % 5;
            pm = pm == 0 ? 1 : pm == 1 ? 10 : pm == 2 ? 50 : pm == 3 ? 250 : 1000;
            pplIn = (sellable * pm) / 1000;
            if (pplIn == 0) pplIn = 1;
        }

        uint256 raised0 = hub.raisedUsd6();
        uint256 reserve0 = hub.reserveUsd6();
        uint256 bal0 = usdc.balanceOf(seller);
        ++sellAttempts;
        bytes32 rid = keccak256(abi.encode("handlerReturn", sellAttempts));
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _signReturn(hub, seller, hub.personOf(seller), pplIn, rid, dl);
        vm.prank(seller);
        try hub.sellBack(pplIn, 0, rid, dl, pplIn, sig) returns (uint256 payout) {
            ++sells;
            uint256 paid = usdc.balanceOf(seller) - bal0;
            if (paid != payout) ++payoutMismatch;
            ghostPayout += paid;
            uint256 gross = raised0 - hub.raisedUsd6();
            ghostGross += gross;
            ghostFees += gross - payout;
            _recordSell(seller, pplIn, gross, reserve0);
            // the same attestation must never pay again
            vm.prank(seller);
            try hub.sellBack(pplIn, 0, rid, dl, pplIn, sig) {
                ++replayAccepted;
            } catch {}
        } catch {}
    }

    /// @dev Records a spend and checks the rolling window ending now. Amount sum over (now-24h, now]
    /// <= cap. Own buys and sells also stay within the owner-set entry limit; router buys stay within
    /// MAX_ROUTER_BUYS_24H and are not counted against the person's own buy slots.
    function _logSpend(
        Spend[] storage log,
        uint256 nowTs,
        uint256 amount,
        uint256 cap,
        uint256 maxEntries,
        bool isBuy,
        bool router
    ) internal {
        log.push(Spend(nowTs, amount, router));
        uint256 sum;
        uint256 ownLive;
        uint256 routerLive;
        for (uint256 i = log.length; i != 0; --i) {
            if (log[i - 1].at + 1 days <= nowTs) break;
            sum += log[i - 1].amount;
            if (log[i - 1].router) ++routerLive;
            else ++ownLive;
        }
        if (isBuy) {
            if (sum > cap || ownLive > maxEntries || routerLive > hub.MAX_ROUTER_BUYS_24H()) ++rollingBuyViolations;
        } else if (sum > cap || ownLive > maxEntries) {
            ++rollingSellViolations;
        }
    }

    struct GlobalSell {
        uint64 at;
        uint256 gross;
        uint256 snapshot;
    }

    GlobalSell[] internal _globalSells;

    /// @dev Sum of gross still inside (now-24h, now] against reserve-before-this-sell plus that sum.
    function _noteGlobal(uint256 nowTs, uint256 gross, uint256 reserve0) internal {
        uint256 prior;
        for (uint256 i = _globalSells.length; i != 0; --i) {
            if (uint256(_globalSells[i - 1].at) + 1 days <= nowTs) break;
            prior += _globalSells[i - 1].gross;
        }
        uint256 ref = reserve0 + prior;
        if (prior + gross > (ref * hub.SELL_GLOBAL_CAP_BPS()) / 10_000) ++globalCapViolations;
        _globalSells.push(GlobalSell(uint64(nowTs), gross, ref));
    }

    function _recordSell(address seller, uint256 pplIn, uint256 gross, uint256 reserve0) internal {
        uint256 nowTs = vm.getBlockTimestamp();
        uint256 day = nowTs / 1 days;
        if (!_sellDaySeen[day]) {
            _sellDaySeen[day] = true;
            sellDays.push(day);
            sellDaySnapshot[day] = reserve0;
        }
        sellDayGross[day] += gross;
        sellUsed[seller][day] += gross;
        _noteGlobal(nowTs, gross, reserve0);
        _logSpend(_sellLog[seller], nowTs, gross, hub.SELL_CAP_DAY_USD6(), hub.maxSellsPer24h(), false, false);

        // FIFO over the shadow lots; each touched lot must be older than HOLD.
        ShadowLot[] storage ls = _shadow[seller];
        uint256 i = _shadowHead[seller];
        uint256 left = pplIn;
        while (left != 0) {
            if (i >= ls.length) {
                ++oversold;
                break;
            }
            ShadowLot storage l = ls[i];
            if (l.at + HOLD > nowTs) ++holdViolations;
            if (l.ppl > left) {
                l.ppl -= left;
                left = 0;
            } else {
                left -= l.ppl;
                l.ppl = 0;
                ++i;
            }
        }
        _shadowHead[seller] = i;
    }

    function _post() internal {
        uint256 f = PplCurveMath.soldForRaised(hub.raisedUsd6());
        uint256 s = hub.soldPpl();
        if (f > s) {
            if (f - s > maxUp) maxUp = f - s;
        } else if (s - f > maxDown) {
            maxDown = s - f;
        }
        if (!gradTaken && hub.graduated()) {
            gradTaken = true;
            ++gradCount;
            gradRaised = hub.raisedUsd6();
            gradSold = s;
            gradReserve = hub.reserveUsd6();
            gradTreasury = usdc.balanceOf(treasury);
            gradHash = stateHash();
        }
    }

    // ================================================================ views for invariants

    function holdersLength() external view returns (uint256) {
        return holders.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function buyDaysLength() external view returns (uint256) {
        return buyDays.length;
    }

    function sellDaysLength() external view returns (uint256) {
        return sellDays.length;
    }

    function sumPplOf() external view returns (uint256 t) {
        for (uint256 i; i < holders.length; ++i) {
            t += hub.pplOf(holders[i]);
        }
    }

    function sumLotsRemaining() external view returns (uint256 t) {
        for (uint256 i; i < holders.length; ++i) {
            address a = holders[i];
            PplCurveHubV2.Lot[] memory ls = hub.lots(a, 0, hub.lotCount(a));
            for (uint256 j; j < ls.length; ++j) {
                t += ls[j].pplRemaining;
            }
        }
    }

    /// @dev Hash of everything that must be frozen after graduation.
    function stateHash() public view returns (bytes32 h) {
        h = keccak256(abi.encode(hub.raisedUsd6(), hub.soldPpl()));
        for (uint256 i; i < holders.length; ++i) {
            address a = holders[i];
            uint256 n = hub.lotCount(a);
            h = keccak256(abi.encode(h, a, hub.pplOf(a), n, hub.lotHead(a), hub.lots(a, 0, n)));
        }
    }
}

/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 50
contract PplCurveHubV2InvariantTest is HubV2Base {
    uint256 internal constant RUNS = 64;
    /// @dev Curve rounding tolerances (see invariant_curveConsistency).
    uint256 internal constant UP_TOL = 5e14;
    uint256 internal constant DOWN_TOL = 1e3;

    HubV2Handler internal handler;
    address[] internal actors;
    address[] internal extras;

    function setUp() public override {
        super.setUp();
        _open();
        for (uint256 i; i < 8; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            _prepare(a);
            // actors may buy for other recipients (A3 trusted routers)
            _setTrustedRouter(a, true);
        }
        // Verified but unfunded recipients: only receive buys made by the actors, never sell.
        extras.push(makeAddr("extra0"));
        extras.push(makeAddr("extra1"));
        _verify(extras[0]);
        _verify(extras[1]);

        handler = new HubV2Handler(
            hub, usdc, owner, treasury, liquidityReceiver, verifierPk, returnVerifierPk, actors, extras
        );

        bytes4[] memory sels = new bytes4[](7);
        sels[0] = HubV2Handler.buy.selector;
        sels[1] = HubV2Handler.buyBurst.selector;
        sels[2] = HubV2Handler.sellBack.selector;
        sels[3] = HubV2Handler.warp.selector;
        sels[4] = HubV2Handler.ownerAction.selector;
        sels[5] = HubV2Handler.sellBurst.selector;
        sels[6] = HubV2Handler.roundTrip.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// @dev Runs after every invariant run. Accumulates ghost counters across runs in the process
    /// environment (handler storage is reverted between runs) and, once all RUNS runs are done,
    /// asserts that the handler actually exercised buys, sell-backs and graduation.
    function afterInvariant() public {
        uint256 runs = vm.envOr("V2I_RUNS", uint256(0)) + 1;
        uint256 b = vm.envOr("V2I_BUYS", uint256(0)) + handler.buys();
        uint256 s = vm.envOr("V2I_SELLS", uint256(0)) + handler.sells();
        uint256 g = vm.envOr("V2I_GRAD", uint256(0)) + handler.gradCount();
        uint256 rt = vm.envOr("V2I_RT", uint256(0)) + handler.rtChecks();
        uint256 ex = vm.envOr("V2I_EXEC", uint256(0)) + handler.executes();
        uint256 sa = vm.envOr("V2I_SELLATT", uint256(0)) + handler.sellAttempts();
        uint256 up = vm.envOr("V2I_UP", uint256(0));
        uint256 dn = vm.envOr("V2I_DOWN", uint256(0));
        if (handler.maxUp() > up) up = handler.maxUp();
        if (handler.maxDown() > dn) dn = handler.maxDown();
        vm.setEnv("V2I_RUNS", vm.toString(runs));
        vm.setEnv("V2I_BUYS", vm.toString(b));
        vm.setEnv("V2I_SELLS", vm.toString(s));
        vm.setEnv("V2I_GRAD", vm.toString(g));
        vm.setEnv("V2I_RT", vm.toString(rt));
        vm.setEnv("V2I_EXEC", vm.toString(ex));
        vm.setEnv("V2I_SELLATT", vm.toString(sa));
        vm.setEnv("V2I_UP", vm.toString(up));
        vm.setEnv("V2I_DOWN", vm.toString(dn));
        if (runs >= RUNS) {
            console.log("runs", runs);
            console.log("successful buys", b);
            console.log("successful sellBacks", s);
            console.log("sellBack attempts", sa);
            console.log("graduations", g);
            console.log("roundTrip checks", rt);
            console.log("liquidity releases executed", ex);
            console.log("max F(raised)-sold", up);
            console.log("max sold-F(raised)", dn);
            assertGt(b, 0, "no successful buys");
            assertGt(s, 0, "no successful sellBacks");
            assertGt(rt, 0, "no roundTrip checks");
        }
    }

    // ---------------------------------------------------------------- §7.1

    function invariant_solvency() public view {
        assertGe(usdc.balanceOf(address(hub)), hub.reserveUsd6(), "hub USDC < reserve");
    }

    // ---------------------------------------------------------------- §7.2

    /// @dev reserve == Σ toReserve (+ harness injection) - Σ payout - released. The fee part of a
    /// sell-back never leaves: the reserve only drops by the payout (gross - fee), so the fee stays in
    /// BOTH the reserve and the hub balance. No donations happen, so balance == reserve exactly (no
    /// separate retained-fee term is needed); equivalently reserve == Σ toReserve + forced + Σ fees - Σ gross - released.
    function invariant_reserveAccounting() public view {
        uint256 expected =
            handler.ghostToReserve() + handler.forcedReserve() - handler.ghostPayout() - handler.ghostReleased();
        assertEq(hub.reserveUsd6(), expected, "reserve != ghost");
        assertEq(usdc.balanceOf(address(hub)), expected, "balance != ghost");
        assertEq(
            handler.ghostToReserve() + handler.forcedReserve() + handler.ghostFees() - handler.ghostGross()
                - handler.ghostReleased(),
            expected,
            "fee ghost relation"
        );
        assertEq(hub.reserveUsd6(), usdc.balanceOf(address(hub)), "reserve != balance");
        assertEq(handler.payoutMismatch(), 0, "return value != balance delta");
        assertEq(handler.buyMismatch(), 0, "pplOut != pplOf delta");
    }

    // ---------------------------------------------------------------- §7.3

    /// @dev soldPpl == Σ pplOf (+ PPL injected by the harness jump, owned by nobody) == Σ lot remainders.
    function invariant_pplLedger() public view {
        uint256 sold = hub.soldPpl();
        assertEq(sold, handler.sumPplOf() + handler.phantomSold(), "sold != sum pplOf");
        assertEq(sold, handler.sumLotsRemaining() + handler.phantomSold(), "sold != sum lots");
    }

    // ---------------------------------------------------------------- §7.4

    /// @dev Buys set sold = F(raised) exactly. A sell-back sets raised = G(sold') with G = raisedForSold,
    /// which rounds up by one USDC unit (1e-6 USD) and carries expWad truncation, so afterwards
    /// F(raised) can exceed sold by about 1e-6 USD / p0 = 1e-6 / 0.005 = 2e14 wei (the lowest price
    /// maximises it; allow 5e14 = 2.5x headroom for the Taylor/F truncation) and can be below sold by
    /// only a few hundred wei (F floors). Errors do not accumulate: every sell recomputes raised from
    /// sold, every buy recomputes sold from raised.
    function invariant_curveConsistency() public view {
        uint256 raised = hub.raisedUsd6();
        assertLe(raised, hub.RAISE_CAP_USD6(), "raised > cap");
        uint256 f = PplCurveMath.soldForRaised(raised);
        uint256 sold = hub.soldPpl();
        if (f >= sold) assertLe(f - sold, UP_TOL, "F(raised) too far above sold");
        else assertLe(sold - f, DOWN_TOL, "F(raised) too far below sold");
    }

    // ---------------------------------------------------------------- §7.5

    /// @dev Treasury balance (only ever fed by buys) == Σ charged - Σ toReserve.
    function invariant_treasuryInflow() public view {
        assertEq(usdc.balanceOf(treasury), handler.ghostCharged() - handler.ghostToReserve(), "treasury inflow");
    }

    // ---------------------------------------------------------------- §7.6

    function invariant_sellDayCaps() public view {
        uint256 nd = handler.sellDaysLength();
        uint256 na = handler.actorsLength();
        for (uint256 i; i < nd; ++i) {
            uint256 day = handler.sellDays(i);
            for (uint256 j; j < na; ++j) {
                assertLe(handler.sellUsed(handler.actors(j), day), hub.SELL_CAP_DAY_USD6(), "addr sell day cap");
            }
        }
    }

    /// @dev Sell inside the cap, then `executeLiquidityRelease` while that 15-minute bucket is
    /// still live. Release zeros the reserve and closes sell-back without clearing the ring, so
    /// `sellWindowReference()` collapses to the live gross and the raw ratio is ~50x the 2% cap.
    /// Every sell was checked against the pre-release reference; the invariant must not treat the
    /// terminal state as a breach.
    function test_regression_globalSellDayCap_afterLiquidityRelease() public {
        address alice = actors[0];
        _seedRaised(100_000e6);
        _buy(alice, MAX_BUY);

        vm.prank(owner);
        hub.announceLiquidityRelease();
        vm.warp(vm.getBlockTimestamp() + 30 days);

        uint256 ppl = hub.sellableNow(alice);
        assertGt(ppl, 0);
        assertGt(_sellBack(alice, ppl, 0), 0);

        (uint256 gross,) = hub.globalSellUsed();
        assertGt(gross, 0);
        assertGt(hub.reserveUsd6(), 0);
        assertLe(
            gross,
            (hub.sellWindowReference() * hub.SELL_GLOBAL_CAP_BPS()) / 10_000,
            "cap holds while the reserve is still there"
        );

        hub.executeLiquidityRelease();
        assertTrue(hub.liquidityReleased());
        assertEq(hub.reserveUsd6(), 0);
        (uint256 grossAfter, uint256 liveAfter) = hub.globalSellUsed();
        assertEq(grossAfter, gross, "bucket survives release");
        assertGt(liveAfter, 0);
        assertEq(hub.sellWindowReference(), grossAfter, "reference collapsed to the live gross");
        assertGt(
            grossAfter,
            (hub.sellWindowReference() * hub.SELL_GLOBAL_CAP_BPS()) / 10_000,
            "raw post-release ratio is the CI failure shape"
        );
        _expectSellBackRevert(alice, 1, 0, PplCurveHubV2.SellBackClosed.selector);

        invariant_globalSellDayCap();
    }

    /// @dev Global sell-back gross over the live rolling window never exceeds 2% of
    /// reserve + that gross (the same reference `sellBack` uses), while sell-back is open.
    /// `executeLiquidityRelease` zeros the reserve and closes sell-back without clearing the
    /// 15-minute ring, so the reference collapses to the live gross and the raw ratio is
    /// gross > 2% of gross. Sells cannot happen after that, and each sell was already checked
    /// against the pre-release reference (`globalCapViolations`).
    function invariant_globalSellDayCap() public view {
        assertEq(handler.globalCapViolations(), 0, "rolling 24h global sell cap");
        if (hub.liquidityReleased()) return;
        (uint256 gross, uint256 live) = hub.globalSellUsed();
        if (live == 0) return;
        assertLe(
            gross,
            (hub.sellWindowReference() * hub.SELL_GLOBAL_CAP_BPS()) / 10_000,
            "live global gross > 2% of reference"
        );
    }

    /// @dev A4: for every window ending at a spend, buys/sell-backs sum to <= $2k and number <= the entry limit.
    function invariant_rollingWindows() public view {
        assertEq(handler.rollingBuyViolations(), 0, "rolling 24h buy cap / entry limit");
        assertEq(handler.rollingSellViolations(), 0, "rolling 24h sell cap / entry limit");
    }

    /// @dev A1: a consumed returnId never pays out again.
    function invariant_noReplay() public view {
        assertEq(handler.replayAccepted(), 0, "returnId replayed");
    }

    // ---------------------------------------------------------------- §7.7

    function invariant_buyDayCap() public view {
        uint256 nd = handler.buyDaysLength();
        uint256 nh = handler.holdersLength();
        for (uint256 i; i < nd; ++i) {
            uint256 day = handler.buyDays(i);
            for (uint256 j; j < nh; ++j) {
                assertLe(handler.buyUsed(handler.holders(j), day), hub.BUY_CAP_DAY_USD6(), "buy day cap");
            }
        }
    }

    // ---------------------------------------------------------------- §7.8

    function invariant_noSellBeforeHold() public view {
        assertEq(handler.holdViolations(), 0, "sold a lot younger than HOLD");
        assertEq(handler.oversold(), 0, "sold more than owned lots");
    }

    // ---------------------------------------------------------------- §7.9

    /// @dev After graduation, buys are closed and the treasury does not receive reserve. Sell-back of an
    /// already attested return may still reduce sold/raised/reserve until liquidity release. The
    /// receiver then gets whatever reserve remains, which is at most the reserve at graduation.
    function invariant_frozenAfterGraduation() public view {
        if (!hub.graduated()) return;
        assertTrue(handler.gradTaken(), "graduation not snapshotted");
        assertLe(hub.raisedUsd6(), handler.gradRaised(), "raised rose after graduation");
        assertLe(hub.soldPpl(), handler.gradSold(), "sold rose after graduation");
        if (hub.liquidityReleased()) {
            assertEq(hub.reserveUsd6(), 0, "reserve after release");
            assertLe(
                usdc.balanceOf(liquidityReceiver), handler.gradReserve(), "receiver got more than graduation reserve"
            );
        } else {
            assertLe(hub.reserveUsd6(), handler.gradReserve(), "reserve rose after graduation");
        }
        assertEq(usdc.balanceOf(treasury), handler.gradTreasury(), "treasury received more after graduation");
    }

    // ---------------------------------------------------------------- §7.10

    function invariant_roundTripNoProfit() public view {
        assertEq(handler.rtViolations(), 0, "round trip paid out more than paid in");
    }
}
