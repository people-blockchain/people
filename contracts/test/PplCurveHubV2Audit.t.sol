// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console2} from "forge-std/console2.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {PplCurveHubV2} from "../src/sale/PplCurveHubV2.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @dev Audit-fix tests: A1 attested sell-back, A2 verification for the whole sale, A3 trusted routers,
/// A4 exact rolling 24h windows, A5 person-keyed state, A6 50/50 split (see PplCurveHubV2.sol).
contract PplCurveHubV2AuditTest is HubV2Base {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal mallory = makeAddr("mallory");
    address internal victim = makeAddr("victim");

    uint256 internal constant BIG_RAISED = 2_000_000e6; // reserve 1M: global sell cap never binds

    event MainnetReturnConsumed(bytes32 indexed returnId, bytes32 indexed personId, uint256 ppl);
    event TrustedRouterSet(address indexed router, bool trusted);
    event WindowLimitsSet(uint256 maxBuysPer24h, uint256 minBuyUsd6, uint256 maxSellsPer24h, uint256 minSellUsd6);

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

    function _trust(address router) internal {
        vm.prank(owner);
        hub.setTrustedRouter(router, true);
    }

    function _limits(uint256 maxBuys, uint256 minBuy, uint256 maxSells, uint256 minSell) internal {
        vm.prank(owner);
        hub.setWindowLimits(maxBuys, minBuy, maxSells, minSell);
    }

    function _bindTo(address account, bytes32 pid) internal {
        uint256 deadline = _now() + 1 days;
        bytes memory sig = _sign(account, pid, deadline);
        vm.prank(account);
        hub.verify(pid, deadline, sig);
    }

    /// @dev Raised seeded high, `who` verified and funded, `n` buys of `amt` 60s apart, then HOLD passes.
    function _holder(address who, uint256 raised, uint256 n, uint256 amt) internal {
        _seedRaised(raised);
        _prepare(who);
        for (uint256 i; i < n; ++i) {
            _buy(who, amt);
            _warpBy(60);
        }
        _warpBy(30 days);
    }

    function _sellArgs(address who, uint256 ppl) internal returns (bytes32 id, uint256 deadline, bytes memory sig) {
        id = _freshReturnId();
        deadline = _now() + 1 hours;
        sig = _signReturn(who, ppl, id, deadline);
    }

    // ================================================================ A1: attested sell-back

    function test_a1_validAttestationPaysOnce() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 4;
        (uint256 gross, uint256 fee, uint256 payout) = hub.quoteSellBack(alice, ppl);
        (bytes32 id, uint256 deadline, bytes memory sig) = _sellArgs(alice, ppl);
        assertFalse(hub.returnUsed(id));

        uint256 balBefore = usdc.balanceOf(alice);
        uint256 hubBefore = usdc.balanceOf(address(hub));
        vm.expectEmit(true, true, false, true, address(hub));
        emit MainnetReturnConsumed(id, hub.personOf(alice), ppl);
        vm.prank(alice);
        uint256 out = hub.sellBack(ppl, 0, id, deadline, ppl, sig);

        assertEq(out, payout);
        assertEq(gross - fee, payout);
        assertEq(usdc.balanceOf(alice) - balBefore, payout, "paid exactly once");
        assertEq(hubBefore - usdc.balanceOf(address(hub)), payout);
        assertTrue(hub.returnUsed(id));
    }

    function test_a1_replaySameReturnIdReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        (bytes32 id, uint256 deadline, bytes memory sig) = _sellArgs(alice, ppl);
        vm.prank(alice);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);

        uint256 bal = usdc.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ReturnUsed.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        // a fresh valid signature over the same returnId does not help either
        bytes memory sig2 = _signReturn(alice, ppl, id, deadline + 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ReturnUsed.selector);
        hub.sellBack(ppl, 0, id, deadline + 1, ppl, sig2);
        assertEq(usdc.balanceOf(alice), bal, "nothing paid on replay");
    }

    function test_a1_wrongSignerReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes memory bad = _signReturnRaw(
            0xBADBAD,
            address(hub),
            block.chainid,
            hub.personOf(alice),
            address(hub),
            alice,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, bad);
        // the Verification signer is not the return signer
        bytes memory byVerifier = _signReturnRaw(
            verifierPk,
            address(hub),
            block.chainid,
            hub.personOf(alice),
            address(hub),
            alice,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, byVerifier);
        assertFalse(hub.returnUsed(id), "failed attempt does not burn the id");
    }

    function test_a1_expiredReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() - 1;
        bytes memory sig = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Expired.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);

        // deadline == now is still valid
        deadline = _now();
        sig = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, sig), 0);
    }

    function test_a1_disabledReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        vm.prank(owner);
        bytes32 off = hub.queueSetReturnVerifier(address(0));
        vm.warp(_now() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetReturnVerifier(off);
        assertEq(hub.returnVerifier(), address(0));
        (bytes32 id, uint256 deadline, bytes memory sig) = _sellArgs(alice, ppl);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SellBackDisabled.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        // an empty / garbage signature must not match address(0) either
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SellBackDisabled.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, new bytes(65));

        // default of a fresh hub is disabled
        HubV2Harness fresh = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier);
        assertEq(fresh.returnVerifier(), address(0));

        // re-enabling restores it (the earlier signature expired across the timelock)
        _installReturnVerifier(hub, returnVerifier);
        deadline = _now() + 1 hours;
        sig = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, sig), 0);
    }

    function test_a1_otherHubDomainReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        HubV2Harness other = new HubV2Harness(address(usdc), treasury, liquidityReceiver, owner, verifier);
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes memory sig = _signReturnRaw(
            returnVerifierPk,
            address(other),
            block.chainid,
            hub.personOf(alice),
            address(other),
            alice,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
    }

    function test_a1_otherChainIdReverts() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 10;
        (bytes32 id, uint256 deadline, bytes memory sig) = _sellArgs(alice, ppl);
        uint256 cid = vm.getChainId(); // not block.chainid: via_ir would re-read it after vm.chainId
        vm.chainId(cid + 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        // back on the signed chain it is valid
        vm.chainId(cid);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, sig), 0);
    }

    function test_a1_wrongFieldsRevert() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        _prepare(bob);
        uint256 ppl = hub.pplOf(alice) / 10;
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes32 pid = hub.personOf(alice);

        // signed for another seller (bob) but alice calls
        bytes memory forBob = _signReturnRaw(
            returnVerifierPk,
            address(hub),
            block.chainid,
            pid,
            address(hub),
            bob,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forBob);

        // signed for another amount
        bytes memory forMore = _signReturnRaw(
            returnVerifierPk,
            address(hub),
            block.chainid,
            pid,
            address(hub),
            alice,
            ppl + 1,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forMore);

        // signed for another source chain
        bytes memory forChain = _signReturnRaw(
            returnVerifierPk,
            address(hub),
            block.chainid,
            pid,
            address(hub),
            alice,
            ppl,
            PEOPLE_CHAIN_ID + 1,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forChain);

        // signed for another person
        bytes memory forPerson = _signReturnRaw(
            returnVerifierPk,
            address(hub),
            block.chainid,
            hub.personOf(bob),
            address(hub),
            alice,
            ppl,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forPerson);

        // signed for another returnId / deadline
        bytes memory forId = _signReturn(alice, ppl, keccak256("other"), deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forId);
        bytes memory forDeadline = _signReturn(alice, ppl, id, deadline + 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, forDeadline);

        // the intended one works
        bytes memory ok = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, ok), 0);
    }

    function test_a1_checkOrderBeforeAttestation() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        bytes memory junk = new bytes(65);
        // not verified / zero amount come before any attestation check (even with the verifier unset)
        vm.prank(owner);
        bytes32 off = hub.queueSetReturnVerifier(address(0));
        vm.warp(_now() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetReturnVerifier(off);
        vm.prank(carol);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.sellBack(1e18, 0, bytes32(0), 0, 1e18, junk);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ZeroOut.selector);
        hub.sellBack(0, 0, bytes32(0), 0, 0, junk);
        // a bad attestation reverts before the lot check: locked/unowned PPL with junk sig -> BadSignature
        _installReturnVerifier(hub, returnVerifier);
        uint256 tooMuch = hub.pplOf(alice) * 2;
        bytes memory bad = _signReturnRaw(
            0xBADBAD,
            address(hub),
            block.chainid,
            hub.personOf(alice),
            address(hub),
            alice,
            tooMuch,
            PEOPLE_CHAIN_ID,
            block.chainid,
            bytes32(0),
            _now()
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(tooMuch, 0, bytes32(0), _now(), tooMuch, bad);
        // with a valid one the lots are what fail
        _expectSellBackRevert(alice, tooMuch, 0, PplCurveHubV2.NotEnoughUnlocked.selector);
    }

    // ================================================================ A2: verification for the whole sale

    function test_a2_unverifiedBuyRejectedOnDay8() public {
        _fund(alice, 1_000e6);
        vm.warp(uint256(hub.openedAt()) + 8 days);
        assertGt(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Whitelist));
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        // also much later in the term
        vm.warp(uint256(hub.openedAt()) + 400 days);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MAX_BUY, 0, alice, address(0));
    }

    function test_a2_twoAddressesOnePersonShareBuyCap() public {
        bytes32 pid = keccak256("person-A");
        _bindTo(alice, pid);
        _fund(alice, 1_000_000e6);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.UnbindDenied.selector);
        hub.unbind(alice);
        vm.prank(alice);
        hub.unbind(alice);
        uint256 deadline = _now() + 1 days;
        bytes memory forBob = _sign(bob, pid, deadline);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, deadline, forBob);
        bytes memory again = _sign(alice, pid, deadline);
        vm.prank(alice);
        hub.verify(pid, deadline, again);
        assertEq(hub.buyRemaining24h(alice), 0, "the cap stays on the pinned account");
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    // ================================================================ A3: trusted routers

    function test_a3_randomCallerCannotBuyForVictim() public {
        _prepare(victim);
        _buy(victim, MIN_BUY);
        _warpBy(61);
        _prepare(mallory);
        uint64 last = hub.lastBuyAt(victim);
        uint256 remaining = hub.buyRemaining24h(victim);
        uint256 lots = hub.lotCount(victim);
        uint256 ppl = hub.pplOf(victim);

        vm.prank(mallory);
        vm.expectRevert(PplCurveHubV2.UntrustedRouter.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));

        assertEq(hub.lastBuyAt(victim), last, "cooldown not reset");
        assertEq(hub.buyRemaining24h(victim), remaining, "limit not spent");
        assertEq(hub.lotCount(victim), lots);
        assertEq(hub.pplOf(victim), ppl);
        // unverified victims are checked after the router gate
        vm.prank(mallory);
        vm.expectRevert(PplCurveHubV2.UntrustedRouter.selector);
        hub.buy(MIN_BUY, 0, carol, address(0));
        // the victim can still buy on its own right away
        _buy(victim, MIN_BUY);
    }

    function test_a3_trustedRouterBuysForVictimChargedToVictim() public {
        address router = makeAddr("router");
        _prepare(victim);
        _fund(router, 1_000_000e6);

        vm.expectEmit(true, false, false, true, address(hub));
        emit TrustedRouterSet(router, true);
        vm.prank(owner);
        hub.setTrustedRouter(router, true);
        assertTrue(hub.trustedRouter(router));

        uint256 routerBal = usdc.balanceOf(router);
        vm.prank(router);
        uint256 out = hub.buy(MAX_BUY, 0, victim, address(0));
        assertGt(out, 0);
        assertEq(routerBal - usdc.balanceOf(router), MAX_BUY, "router pays");
        assertEq(hub.pplOf(victim), out, "victim is credited");
        assertEq(hub.lotCount(victim), 1);
        assertEq(hub.lastBuyAt(victim), 0, "victim cooldown untouched");
        assertEq(hub.buyRemaining24h(victim), DAY_CAP - MAX_BUY, "amount cap charged to victim");
        (uint256 rUsd, uint256 rBuys) = hub.routerUsage24h(victim);
        assertEq(rUsd, MAX_BUY);
        assertEq(rBuys, 1, "router counter");
        (, uint256 ownBuys,,) = hub.usage24h(victim);
        assertEq(ownBuys, 0, "own slots untouched");
        assertEq(hub.buyRemaining24h(router), DAY_CAP, "router has no counter");
        // no cooldown on the router path, and the victim may buy on its own right away
        vm.prank(router);
        hub.buy(MIN_BUY, 0, victim, address(0));
        _buy(victim, MIN_BUY);

        // revoked again
        vm.prank(owner);
        hub.setTrustedRouter(router, false);
        _warpBy(61);
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.UntrustedRouter.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));

        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.ZeroAddress.selector);
        hub.setTrustedRouter(address(0), true);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        hub.setTrustedRouter(mallory, true);
    }

    function test_a3_routerBuysCappedAtFivePer24h() public {
        address router = makeAddr("router");
        _prepare(victim);
        _fund(router, 1_000_000e6);
        _trust(router);
        assertEq(hub.MAX_ROUTER_BUYS_24H(), 5);
        uint256 t0 = _now();
        for (uint256 i; i < 5; ++i) {
            vm.prank(router);
            hub.buy(MIN_BUY, 0, victim, address(0));
        }
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.TooManyRouterBuys.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
        // a second trusted router shares the same per-person counter
        address router2 = makeAddr("router2");
        _fund(router2, 1_000_000e6);
        _trust(router2);
        vm.prank(router2);
        vm.expectRevert(PplCurveHubV2.TooManyRouterBuys.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
        // exactly 24 h after the first router buy one slot frees up
        vm.warp(t0 + 24 hours - 1);
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.TooManyRouterBuys.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
        vm.warp(t0 + 24 hours);
        vm.prank(router);
        hub.buy(MIN_BUY, 0, victim, address(0));
    }

    /// @dev Griefing: an attacker using a public trusted router (it runs any user's calldata) with
    /// `recipient = victim` cannot fill the victim's own buy window or reset its cooldown.
    function test_a3_routerGriefCannotFillVictimWindow() public {
        address router = makeAddr("router");
        _fund(router, 1_000_000e6);
        _trust(router);
        _prepare(victim);
        _limits(20, MIN_BUY, 10, 1e6);

        // the attacker maxes out the router path for the victim at the minimum buy
        for (uint256 i; i < 5; ++i) {
            vm.prank(router);
            hub.buy(MIN_BUY, 0, victim, address(0));
        }
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.TooManyRouterBuys.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
        (, uint256 ownBuys,,) = hub.usage24h(victim);
        assertEq(ownBuys, 0, "victim window empty");
        assertEq(hub.lastBuyAt(victim), 0, "victim cooldown untouched");

        // the victim still has all 20 of its own buys in the same 24 h
        for (uint256 i; i < 20; ++i) {
            _buy(victim, MIN_BUY);
            _warpBy(60);
        }
        (, ownBuys,,) = hub.usage24h(victim);
        assertEq(ownBuys, 20);
        vm.prank(victim);
        vm.expectRevert(PplCurveHubV2.TooManyBuys.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
    }

    function test_a3_routerAndOwnBuysShareAmountCap() public {
        address router = makeAddr("router");
        _fund(router, 1_000_000e6);
        _trust(router);
        _prepare(victim);
        // 3 x $500 by router + $500 own = $2,000 cap
        for (uint256 i; i < 3; ++i) {
            vm.prank(router);
            hub.buy(MAX_BUY, 0, victim, address(0));
        }
        _buy(victim, MAX_BUY);
        assertEq(hub.buyRemaining24h(victim), 0);
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
        _warpBy(60);
        vm.prank(victim);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, victim, address(0));
    }

    // ================================================================ A4: exact rolling 24h windows

    function test_a4_noUtcMidnightReset() public {
        _prepare(alice);
        // four buys at 23:56..23:59 UTC; the last one ends the day
        uint256 dayStart = (_now() / 1 days) * 1 days;
        vm.warp(dayStart + 23 hours + 56 minutes);
        uint256 t0 = _now();
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        assertEq(_now(), dayStart + 1 days, "midnight");
        _warpBy(60); // 00:01 next UTC day
        assertEq(hub.buyRemaining24h(alice), 0);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        // frees only at 23:56 next day
        vm.warp(t0 + 1 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(t0 + 1 days);
        _buy(alice, MAX_BUY);
    }

    function test_a4_exactBoundaryAtT24h() public {
        _prepare(alice);
        uint256 t = _now();
        _buy(alice, MAX_BUY); // single spend at t
        _warpBy(1 hours);
        for (uint256 i; i < 3; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        assertEq(hub.buyRemaining24h(alice), 0);

        vm.warp(t + 1 days - 1);
        assertEq(hub.buyRemaining24h(alice), 0, "still counted 1s before");
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MAX_BUY, 0, alice, address(0));
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        vm.warp(t + 1 days);
        assertEq(hub.buyRemaining24h(alice), MAX_BUY, "freed at exactly t + 24h");
        // exceeding by one unit still fails, exactly the freed amount fits
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AboveMax.selector);
        hub.buy(MAX_BUY + 1, 0, alice, address(0));
        _buy(alice, MAX_BUY);
        assertEq(hub.buyRemaining24h(alice), 0);
    }

    function test_a4_accumulatesExactlyAndSharedByPerson() public {
        _prepare(alice);
        uint256[6] memory amts = [uint256(100e6), 200e6, 300e6, 500e6, 500e6, 400e6];
        uint256 sum;
        for (uint256 i; i < amts.length; ++i) {
            _buy(alice, amts[i]);
            sum += amts[i];
            _warpBy(61);
            (uint256 bought, uint256 buys,,) = hub.usage24h(alice);
            assertEq(bought, sum, "exact sum");
            assertEq(buys, i + 1);
            assertEq(hub.buyRemaining24h(alice), DAY_CAP - sum);
        }
        assertEq(sum, DAY_CAP);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        // self-unbind hides the view, but the person window is still there after the same account re-verifies
        bytes32 pid = hub.personOf(alice);
        vm.prank(alice);
        hub.unbind(alice);
        (uint256 b3, uint256 n3,,) = hub.usage24h(alice);
        assertEq(b3 + n3, 0, "unbound address has no usage");
        _bindTo(alice, pid);
        (uint256 b2, uint256 n2,,) = hub.usage24h(alice);
        assertEq(b2, DAY_CAP);
        assertEq(n2, amts.length);
        uint256 deadline = _now() + 1 days;
        bytes memory forBob = _sign(bob, pid, deadline);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, deadline, forBob);
    }

    function test_a4_bufferFull50Buys() public {
        _limits(50, 1e6, 10, 1e6);
        _prepare(alice);
        for (uint256 i; i < 50; ++i) {
            _buy(alice, 1e6 + (i % 10) * 1e6); // $1..$10
            _warpBy(60);
        }
        (, uint256 buys,,) = hub.usage24h(alice);
        assertEq(buys, 50);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.TooManyBuys.selector);
        hub.buy(1e6, 0, alice, address(0));
        assertEq(hub.maxBuysPer24h(), 50);
    }

    function test_a4_defaultMaxBuys20ThenExpiryFreesOne() public {
        _prepare(alice);
        assertEq(hub.maxBuysPer24h(), 20);
        uint256 t0 = _now();
        for (uint256 i; i < 20; ++i) {
            _buy(alice, MIN_BUY);
            _warpBy(60);
        }
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.TooManyBuys.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        vm.warp(t0 + 1 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.TooManyBuys.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(t0 + 1 days); // first entry expires
        _buy(alice, MIN_BUY);
        (, uint256 buys,,) = hub.usage24h(alice);
        assertEq(buys, 20);
        _warpBy(60);
        _buy(alice, MIN_BUY); // second entry (t0 + 60) expires at t0 + 1 day + 60
        // one more minute: the third entry (t0 + 120) is gone too
        _warpBy(60);
        (, buys,,) = hub.usage24h(alice);
        assertEq(buys, 19);
    }

    function test_a4_setWindowLimitsBounds() public {
        bytes memory bad = abi.encodeWithSelector(PplCurveHubV2.BadLimits.selector);
        vm.startPrank(owner);
        vm.expectRevert(bad);
        hub.setWindowLimits(0, MIN_BUY, 10, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(51, MIN_BUY, 10, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MIN_BUY, 0, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MIN_BUY, 51, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, 1e6 - 1, 10, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MAX_BUY + 1, 10, 1e6);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MIN_BUY, 10, 1e6 - 1);
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MIN_BUY, 10, DAY_CAP + 1);
        uint256 maxMinSell = hub.MAX_MIN_SELL_USD6();
        vm.expectRevert(bad);
        hub.setWindowLimits(20, MIN_BUY, 10, maxMinSell + 1);

        // edges are valid
        vm.expectEmit(false, false, false, true, address(hub));
        emit WindowLimitsSet(1, 1e6, 1, 1e6);
        hub.setWindowLimits(1, 1e6, 1, 1e6);
        hub.setWindowLimits(50, MAX_BUY, 50, maxMinSell);
        vm.stopPrank();
        assertEq(hub.maxBuysPer24h(), 50);
        assertEq(hub.minBuyUsd6(), MAX_BUY);
        assertEq(hub.maxSellsPer24h(), 50);
        assertEq(hub.minSellUsd6(), maxMinSell);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.setWindowLimits(20, MIN_BUY, 10, 1e6);
    }

    function test_a4_raisedMinBuyRevertsBelowMin() public {
        _limits(20, 50e6, 10, 1e6);
        _prepare(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BelowMin.selector);
        hub.buy(50e6 - 1, 0, alice, address(0));
        _buy(alice, 50e6);

        // the final partial fill stays exempt
        _prepare(bob);
        _seedRaised(CAP - 30e6);
        _buy(bob, 30e6);
        assertTrue(hub.graduated());
    }

    function test_a4_tooManySells() public {
        _holder(alice, BIG_RAISED, 4, MAX_BUY);
        uint256 ppl = hub.pplOf(alice) / 40;
        uint256 t0 = _now();
        for (uint256 i; i < 10; ++i) {
            _sellBack(alice, ppl, 0);
            _warpBy(60);
        }
        _expectSellBackRevert(alice, ppl, 0, PplCurveHubV2.TooManySells.selector);
        vm.warp(t0 + 1 days - 1);
        _expectSellBackRevert(alice, ppl, 0, PplCurveHubV2.TooManySells.selector);
        vm.warp(t0 + 1 days); // first sell-back expires
        assertGt(_sellBack(alice, ppl, 0), 0);
    }

    function test_a4_belowMinSellAndWholeDust() public {
        _holder(alice, BIG_RAISED, 2, MAX_BUY);
        uint256 total = hub.pplOf(alice);
        uint256 dust = total / 10_000;
        (uint256 g,,) = hub.quoteSellBack(alice, dust);
        assertLt(g, 1e6, "precondition: dust gross below the $1 minimum");
        assertGt(g, 0);
        _expectSellBackRevert(alice, dust, 0, PplCurveHubV2.BelowMinSell.selector);

        // raised minimum applies to normal sells
        _limits(20, MIN_BUY, 10, 50e6);
        _expectSellBackRevert(alice, total / 100, 0, PplCurveHubV2.BelowMinSell.selector);
        _limits(20, MIN_BUY, 10, 1e6);

        // leave only dust, then selling the whole remaining dust is allowed
        _sellBack(alice, total - dust, 0);
        assertEq(hub.pplOf(alice), dust);
        assertGt(_sellBack(alice, dust, 0), 0);
        assertEq(hub.pplOf(alice), 0);
    }

    function test_a4_sellPersonCapRollsExactlyAt24h() public {
        // 2500 USDC of lots, bought over two days
        _seedRaised(BIG_RAISED);
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(1 days);
        _buy(alice, MAX_BUY);
        _warpBy(30 days);
        uint256 total = hub.pplOf(alice);

        uint256 t = _now();
        _sellBack(alice, total * 60 / 100, 0); // entry A at t
        _warpBy(1 hours);
        _sellBack(alice, total * 10 / 100, 0); // entry B at t + 1h
        (,, uint256 soldGross, uint256 sells) = hub.usage24h(alice);
        assertEq(sells, 2);
        assertEq(hub.sellRemaining24h(alice), DAY_CAP - soldGross);

        (uint256 gC,,) = hub.quoteSellBack(alice, total * 20 / 100);
        assertGt(soldGross + gC, DAY_CAP, "precondition: C crosses the cap");
        vm.warp(t + 1 days - 1);
        _expectSellBackRevert(alice, total * 20 / 100, 0, PplCurveHubV2.PersonDayCap.selector);
        vm.warp(t + 1 days); // A (and only A) is freed
        (,, uint256 soldNow, uint256 sellsNow) = hub.usage24h(alice);
        assertEq(sellsNow, 1);
        assertLt(soldNow, soldGross);
        assertGt(_sellBack(alice, total * 20 / 100, 0), 0);
    }

    /// @dev Worst-case gas of the rolling window: 50 live entries. `vm.cool` resets warm slots so the
    /// numbers match a fresh transaction (all 25 packed slots cold).
    function test_a4_worstCaseGas() public {
        _limits(50, 1e6, 10, 1e6);
        _seedRaised(BIG_RAISED); // reserve 1M so the global sell cap does not bind in the sell part below
        _prepare(alice);
        for (uint256 i; i < 49; ++i) {
            _buy(alice, 1e6);
            _warpBy(60);
        }
        (, uint256 live,,) = hub.usage24h(alice);
        assertEq(live, 49);

        // 50th buy: scans 49 live entries and appends
        vm.cool(address(hub));
        vm.prank(alice);
        uint256 g0 = gasleft();
        hub.buy(1e6, 0, alice, address(0));
        uint256 gAppend = g0 - gasleft();
        _warpBy(60);
        (, live,,) = hub.usage24h(alice);
        assertEq(live, 50);
        console2.log("buy with 49 live entries (50th, appends) gas", gAppend);
        assertLt(gAppend, 300_000, "50th buy gas");

        // a buy that is refused at 50 live entries (TooManyBuys) is also bounded
        vm.cool(address(hub));
        vm.prank(alice);
        g0 = gasleft();
        try hub.buy(1e6, 0, alice, address(0)) {} catch {}
        uint256 gRefused = g0 - gasleft();
        console2.log("buy refused with 50 live entries gas", gRefused);
        assertLt(gRefused, 300_000, "refused buy gas");

        // pruning buy: every one of the 50 entries has expired
        _warpBy(1 days);
        (, live,,) = hub.usage24h(alice);
        assertEq(live, 0);
        vm.cool(address(hub));
        vm.prank(alice);
        g0 = gasleft();
        hub.buy(1e6, 0, alice, address(0));
        uint256 gPrune = g0 - gasleft();
        console2.log("pruning buy (50 expired entries) gas", gPrune);
        assertLt(gPrune, 300_000, "pruning buy gas");
        (, live,,) = hub.usage24h(alice);
        assertEq(live, 1);

        // sell-back window at its (default) limit of 10 entries, for reference
        _warpBy(30 days);
        uint256 ppl = hub.pplOf(alice) / 20; // ~$2.5 gross each, above the $1 minimum
        for (uint256 i; i < 9; ++i) {
            _sellBack(alice, ppl, 0);
            _warpBy(60);
        }
        (bytes32 id, uint256 deadline, bytes memory sig) = _sellArgs(alice, ppl);
        vm.cool(address(hub));
        vm.prank(alice);
        g0 = gasleft();
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        uint256 gSell = g0 - gasleft();
        console2.log("sellBack, 10th sell entry gas", gSell);
        assertLt(gSell, 300_000, "sellBack gas");
    }

    // ================================================================ A5: person-keyed state

    /// @dev A verifier installed after the 48h timelock cannot move lots. Owner `unbind` is refused,
    /// and self-unbind still leaves the person pinned to the original account.
    function test_h4_timelockedVerifierCannotTakeLots() public {
        bytes32 pid = keccak256("person-A5");
        _bindTo(alice, pid);
        _fund(alice, 1_000_000e6);
        _seedRaised(100_000e6);
        _buy(alice, MAX_BUY);
        _warpBy(61);
        _buy(alice, MAX_BUY);
        uint256 pplBefore = hub.pplOf(alice);
        _warpBy(30 days);
        assertEq(hub.pinnedAccount(pid), alice);
        assertEq(hub.sellableNow(alice), pplBefore);

        uint256 evilPk = 0xE417;
        address evil = vm.addr(evilPk);
        vm.startPrank(owner);
        bytes32 qVerify = hub.queueSetVerifier(evil);
        bytes32 qReturn = hub.queueSetReturnVerifier(evil);
        vm.stopPrank();
        vm.warp(_now() + hub.ADMIN_TIMELOCK());
        vm.startPrank(owner);
        hub.executeSetVerifier(qVerify);
        hub.executeSetReturnVerifier(qReturn);
        vm.expectRevert(PplCurveHubV2.UnbindDenied.selector);
        hub.unbind(alice);
        vm.stopPrank();

        // 48h is not a path to the reserve
        vm.prank(owner);
        hub.announceLiquidityRelease();
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();

        vm.prank(alice);
        hub.unbind(alice);
        uint256 deadline = _now() + 1 days;
        bytes memory steal = _signWith(evilPk, bob, pid, deadline);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, deadline, steal);
        assertEq(hub.pplOf(bob), 0);
        assertEq(hub.sellableNow(bob), 0);

        bytes memory back = _signWith(evilPk, alice, pid, deadline);
        vm.prank(alice);
        hub.verify(pid, deadline, back);
        assertEq(hub.pplOf(alice), pplBefore);
        assertEq(hub.sellableNow(alice), pplBefore);

        bytes32 id = _freshReturnId();
        uint256 sellDeadline = _now() + 1 hours;
        bytes memory forBob = _signReturnRaw(
            evilPk,
            address(hub),
            block.chainid,
            pid,
            address(hub),
            bob,
            pplBefore / 2,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            sellDeadline
        );
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.sellBack(pplBefore / 2, 0, id, sellDeadline, pplBefore / 2, forBob);

        bytes memory forAlice = _signReturnRaw(
            evilPk,
            address(hub),
            block.chainid,
            pid,
            address(hub),
            alice,
            pplBefore / 2,
            PEOPLE_CHAIN_ID,
            block.chainid,
            id,
            sellDeadline
        );
        uint256 bal = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 payout = hub.sellBack(pplBefore / 2, 0, id, sellDeadline, pplBefore / 2, forAlice);
        assertGt(payout, 0);
        assertEq(usdc.balanceOf(alice) - bal, payout);
        assertEq(usdc.balanceOf(bob), 0);
    }

    // ================================================================ A6: 50/50 split

    function _splitBuy(address token, uint256 idx, uint256 amt) internal {
        address b = makeAddr(string.concat("splitBuyer", vm.toString(idx)));
        _verify(b);
        IMintable(token).mint(b, amt);
        vm.prank(b);
        IERC20(token).approve(address(hub), type(uint256).max);

        uint256 tBefore = IERC20(token).balanceOf(treasury);
        uint256 hBefore = IERC20(token).balanceOf(address(hub));
        uint256 rBefore = hub.reserveUsd6();
        uint256 bBefore = IERC20(token).balanceOf(b);

        _buy(b, amt);

        uint256 toTreasury = IERC20(token).balanceOf(treasury) - tBefore;
        uint256 toHub = IERC20(token).balanceOf(address(hub)) - hBefore;
        assertEq(toTreasury, amt * 5_000 / 10_000, "treasury gets floor(half)");
        assertEq(toHub, amt - amt * 5_000 / 10_000, "reserve gets the ceil");
        assertGe(toHub, toTreasury);
        assertLe(toHub - toTreasury, 1);
        assertEq(toTreasury + toHub, amt, "parts sum to payment");
        assertEq(bBefore - IERC20(token).balanceOf(b), amt, "buyer pays exactly the payment");
        assertEq(hub.reserveUsd6() - rBefore, toHub, "reserveUsd6 tracks the part kept");
        assertEq(hub.reserveUsd6(), IERC20(token).balanceOf(address(hub)), "reserve == hub balance");
    }

    /// @dev Split on buy for several amounts, then one sell-back: reserve drops by exactly the payout.
    function _splitAndSellBack(address token) internal {
        uint256[6] memory amts = [uint256(10e6), 10_000_001, 333_333_333, 11e6 + 1, 499_999_999, MAX_BUY];
        for (uint256 i; i < amts.length; ++i) {
            _splitBuy(token, i, amts[i]);
        }
        // treasury only ever got floor halves
        uint256 sum;
        for (uint256 i; i < amts.length; ++i) {
            sum += amts[i] * 5_000 / 10_000;
        }
        assertEq(IERC20(token).balanceOf(treasury), sum);

        address seller = makeAddr("splitSeller");
        _verify(seller);
        IMintable(token).mint(seller, MAX_BUY);
        vm.prank(seller);
        IERC20(token).approve(address(hub), type(uint256).max);
        uint256 ppl = _buy(seller, MAX_BUY);
        _warpBy(30 days);

        uint256 reserveBefore = hub.reserveUsd6();
        uint256 treasuryBefore = IERC20(token).balanceOf(treasury);
        uint256 sellerBefore = IERC20(token).balanceOf(seller);
        uint256 payout = _sellBack(seller, ppl / 200, 0);
        assertGt(payout, 0);
        assertEq(reserveBefore - hub.reserveUsd6(), payout, "reserve falls by exactly the payout");
        assertEq(IERC20(token).balanceOf(seller) - sellerBefore, payout);
        assertEq(IERC20(token).balanceOf(treasury), treasuryBefore, "treasury untouched by sell-back");
        assertEq(hub.reserveUsd6(), IERC20(token).balanceOf(address(hub)), "fee stays in reserve and balance");
    }

    function test_a6_splitUsdc() public {
        _splitAndSellBack(address(usdc));
    }

    function test_a6_splitMockUsdt() public {
        MockUSDT usdt = new MockUSDT();
        hub = new HubV2Harness(address(usdt), treasury, liquidityReceiver, owner, verifier);
        _installReturnVerifier(hub, returnVerifier);
        vm.prank(owner);
        hub.open();
        _splitAndSellBack(address(usdt));
    }

    function testFuzz_a6_splitExact(uint256 amt) public {
        amt = bound(amt, 10e6, 500e6);
        _splitBuy(address(usdc), 0, amt);
        assertEq(usdc.balanceOf(treasury), amt / 2);
        assertEq(usdc.balanceOf(address(hub)), amt - amt / 2);
    }

    // ================================================================ explicit limits

    function _ceilBps(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return (amount * bps + 10_000 - 1) / 10_000;
    }

    function _floorBps(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return (amount * bps) / 10_000;
    }

    function _quoteGross(uint256 ppl) internal view returns (uint256 gross) {
        (gross,,) = hub.quoteSellBack(address(0), ppl);
    }

    /// @dev Largest ppl whose sell-back gross is <= `target`, and the smallest whose gross is > `target`.
    function _pplAround(uint256 target) internal view returns (uint256 pplAt, uint256 pplOver) {
        uint256 sold = hub.soldPpl();
        require(sold > 1 && _quoteGross(sold) > target, "curve cannot reach target");
        uint256 lo = 1;
        uint256 hi = sold;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_quoteGross(mid) > target) hi = mid;
            else lo = mid + 1;
        }
        pplOver = lo;
        pplAt = lo - 1;
    }

    function _alignReserve(uint256 reserve) internal {
        uint256 bal = usdc.balanceOf(address(hub));
        if (reserve > bal) usdc.mint(address(hub), reserve - bal);
        hub.forceReserve(reserve);
    }

    /// @dev Hold is 30 days from the lot's own timestamp: one second early reverts, exactly HOLD pays.
    function test_limit_hold30Days() public {
        _seedRaised(BIG_RAISED);
        _prepare(alice);
        uint256 ppl = _buy(alice, MAX_BUY);
        uint256 boughtAt = uint256(hub.lots(alice, 0, 1)[0].boughtAt);
        assertEq(hub.HOLD(), 30 days);

        vm.warp(boughtAt + hub.HOLD() - 1);
        _expectSellBackRevert(alice, ppl, 0, PplCurveHubV2.NotEnoughUnlocked.selector);

        vm.warp(boughtAt + hub.HOLD());
        assertGt(_sellBack(alice, ppl / 2, 0), 0);
        assertEq(hub.pplOf(alice), ppl - ppl / 2);
    }

    /// @dev Global sell-back cap is 2% of the day-start reserve. Gross equal to the cap pays;
    /// one USDC-unit over reverts.
    function test_limit_globalSell2PctPerDay() public {
        _seedRaised(100_000e6);
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(30 days);
        assertGe(hub.pplOf(alice), 1);

        uint256 target = 1_000e6;
        (uint256 pplExact, uint256 pplOver) = _pplAround(target);
        assertLe(pplOver, hub.pplOf(alice), "holder owns the tip");
        assertEq(_quoteGross(pplExact), target, "exact gross");
        assertEq(_quoteGross(pplOver), target + 1, "one unit over");

        uint256 reserve = target * 50; // 2% of this reserve is `target`
        _alignReserve(reserve);
        assertEq((hub.reserveUsd6() * hub.SELL_GLOBAL_CAP_BPS()) / 10_000, target);
        assertEq(hub.SELL_GLOBAL_CAP_BPS(), 200);

        uint256 snap = vm.snapshotState();
        assertGt(_sellBack(alice, pplExact, 0), 0);
        (uint256 usedGross,) = hub.globalSellUsed();
        assertEq(usedGross, target, "exact cap consumed");

        assertTrue(vm.revertToState(snap));
        _expectSellBackRevert(alice, pplOver, 0, PplCurveHubV2.GlobalDayCap.selector);
    }

    /// @dev $2,000 per person per rolling 24h on buys. Two addresses of one person share it.
    /// UTC midnight does not reset it; the oldest buy frees at exactly 24h.
    function test_limit_buyCap2kRolling24hTwoAddresses() public {
        assertEq(hub.BUY_CAP_DAY_USD6(), 2_000e6);
        bytes32 pid = keccak256("limit-buy-person");
        _bindTo(alice, pid);
        _fund(alice, 1_000_000e6);

        uint256 t0 = _now();
        _buy(alice, MAX_BUY);
        _warpBy(60);
        _buy(alice, MAX_BUY);
        _warpBy(60);
        _buy(alice, MAX_BUY); // $1,500 on alice

        _warpBy(60);
        _buy(alice, MAX_BUY); // exact $2,000 on the pinned account
        assertEq(hub.buyRemaining24h(alice), 0);
        uint256 bindDeadline = _now() + 1 days;
        bytes memory forBob = _sign(bob, pid, bindDeadline);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, bindDeadline, forBob);

        _warpBy(60); // cooldown is checked before the cap
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        // a different person is not capped
        _prepare(carol);
        _buy(carol, MAX_BUY);

        // next UTC midnight is still inside the rolling window
        uint256 midnight = (_now() / 1 days + 1) * 1 days;
        assertLt(midnight, t0 + 1 days);
        vm.warp(midnight);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        vm.warp(t0 + 1 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        vm.warp(t0 + 1 days); // only the first $500 has aged out
        assertEq(hub.buyRemaining24h(alice), MAX_BUY);
        _buy(alice, MAX_BUY);
        assertEq(hub.buyRemaining24h(alice), 0);
    }

    /// @dev $2,000 gross per person per rolling 24h on sell-back, shared by two addresses.
    function test_limit_sellCap2kRolling24hTwoAddresses() public {
        assertEq(hub.SELL_CAP_DAY_USD6(), 2_000e6);
        _seedRaised(BIG_RAISED); // reserve ~$1M, so the 2% global cap (~$20k) does not bind
        bytes32 pid = keccak256("limit-sell-person");
        _bindTo(alice, pid);
        _fund(alice, 1_000_000e6);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(1 days);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(30 days);

        (uint256 pplA,) = _pplAround(1_500e6);
        assertLe(pplA, hub.pplOf(alice));
        assertEq(_quoteGross(pplA), 1_500e6);
        uint256 t0 = _now();
        assertGt(_sellBack(alice, pplA, 0), 0);
        assertEq(hub.sellRemaining24h(alice), DAY_CAP - 1_500e6);

        (uint256 pplB,) = _pplAround(500e6);
        assertLe(pplB, hub.pplOf(alice));
        assertEq(_quoteGross(pplB), 500e6);
        assertGt(_sellBack(alice, pplB, 0), 0);
        assertEq(hub.sellRemaining24h(alice), 0, "exact $2,000");

        (, uint256 pplOne) = _pplAround(0);
        assertGt(_quoteGross(pplOne), 0);
        assertEq(_quoteGross(pplOne - 1), 0);
        assertLe(pplOne, hub.pplOf(alice));
        _expectSellBackRevert(alice, pplOne, 0, PplCurveHubV2.PersonDayCap.selector);

        uint256 midnight = (t0 / 1 days + 1) * 1 days;
        assertLt(midnight, t0 + 1 days);
        vm.warp(midnight);
        _expectSellBackRevert(alice, pplOne, 0, PplCurveHubV2.PersonDayCap.selector);
        vm.warp(t0 + 1 days - 1);
        _expectSellBackRevert(alice, pplOne, 0, PplCurveHubV2.PersonDayCap.selector);
        vm.warp(t0 + 1 days);
        assertEq(hub.sellRemaining24h(alice), DAY_CAP, "both sells were at t0");
    }

    /// @dev Sell fee is 1.5% below 1% of the day-start reserve and 3% above, each part rounded up.
    function test_limit_feeRoundsUpAcross1PctLine() public {
        _holder(alice, 100_000e6, 4, MAX_BUY);
        // line = floor(reserve / 100) = 500_000_001, which is not a multiple of the 1.5% modulus (200).
        uint256 reserve = 50_000_000_100;
        _alignReserve(reserve);
        uint256 line = (reserve * hub.FEE_HIGH_THRESHOLD_BPS()) / 10_000;
        assertEq(line, 500_000_001);
        assertEq(line % 200, 1);
        assertEq(hub.FEE_LOW_BPS(), 150);
        assertEq(hub.FEE_HIGH_BPS(), 300);
        uint256 cap = (reserve * hub.SELL_GLOBAL_CAP_BPS()) / 10_000;
        assertGt(cap, line);

        // --- entirely below the line, odd gross so 1.5% rounds up (above the $1 minimum) ---
        uint256 gLow = 1_000_003;
        (uint256 pplLow,) = _pplAround(gLow);
        assertLe(pplLow, hub.pplOf(alice));
        assertEq(_quoteGross(pplLow), gLow);
        assertLt(gLow, line);
        assertGt(gLow % 200, 0);
        (, uint256 feeLow, uint256 payoutLow) = hub.quoteSellBack(alice, pplLow);
        assertEq(feeLow, _ceilBps(gLow, 150));
        assertEq(feeLow, _floorBps(gLow, 150) + 1, "1.5% rounds up");
        uint256 reserveBefore = hub.reserveUsd6();
        assertEq(_sellBack(alice, pplLow, 0), payoutLow);
        assertEq(reserveBefore - hub.reserveUsd6(), payoutLow, "reserve loses the payout only");

        // --- one sell split across the line; both parts round up ---
        (uint256 dayGross,) = hub.globalSellUsed();
        uint256 lineNow = (hub.sellWindowReference() * hub.FEE_HIGH_THRESHOLD_BPS()) / 10_000;
        uint256 lowRoom = lineNow - dayGross;
        assertGt(lowRoom % 200, 0, "low part is not a multiple of 200");
        uint256 highPart = 100_001;
        assertEq(highPart % 100, 1, "high part is not a multiple of 100");
        uint256 gSplit = lowRoom + highPart;
        assertLt(dayGross + gSplit, cap);
        (uint256 pplSplit,) = _pplAround(gSplit);
        assertLe(pplSplit, hub.pplOf(alice));
        assertEq(_quoteGross(pplSplit), gSplit);
        (, uint256 feeSplit, uint256 payoutSplit) = hub.quoteSellBack(alice, pplSplit);
        uint256 expectLow = _ceilBps(lowRoom, 150);
        uint256 expectHigh = _ceilBps(highPart, 300);
        assertEq(expectLow, _floorBps(lowRoom, 150) + 1);
        assertEq(expectHigh, _floorBps(highPart, 300) + 1);
        assertEq(feeSplit, expectLow + expectHigh, "split fee");
        reserveBefore = hub.reserveUsd6();
        assertEq(_sellBack(alice, pplSplit, 0), payoutSplit);
        assertEq(reserveBefore - hub.reserveUsd6(), payoutSplit);

        // --- entirely above the line, odd gross so 3% rounds up ---
        (, uint256 lowLeft) = hub.sellBackCapToday();
        assertEq(lowLeft, 0, "1% line used up");
        uint256 gHigh = 1_000_001;
        (uint256 usedNow,) = hub.globalSellUsed();
        assertLt(usedNow + gHigh, cap);
        (uint256 pplHigh,) = _pplAround(gHigh);
        assertLe(pplHigh, hub.pplOf(alice));
        assertEq(_quoteGross(pplHigh), gHigh);
        (, uint256 feeHigh, uint256 payoutHigh) = hub.quoteSellBack(alice, pplHigh);
        assertEq(feeHigh, _ceilBps(gHigh, 300));
        assertEq(feeHigh, _floorBps(gHigh, 300) + 1, "3% rounds up");
        reserveBefore = hub.reserveUsd6();
        assertEq(_sellBack(alice, pplHigh, 0), payoutHigh);
        assertEq(reserveBefore - hub.reserveUsd6(), payoutHigh);
    }

    /// @dev Item 1. A sell near UTC midnight still counts until exactly t+24h. Midnight does not
    /// free the 2% cap or the 1% fee line; t+24h-1 reverts and t+24h pays again.
    function test_globalSellCap_rolling24hAcrossUtcMidnight() public {
        assertEq(hub.GLOBAL_SELL_CAPACITY(), 128, "gas-bounded ring");
        assertEq(hub.SELL_GLOBAL_CAP_BPS(), 200);
        _seedRaised(100_000e6);
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(30 days);

        uint256 midnight = (_now() / 1 days + 1) * 1 days;
        vm.warp(midnight - 1 hours);
        uint256 t0 = _now();
        assertLt(midnight, t0 + 1 days, "sell is before the UTC midnight inside the same 24h");

        uint256 target = 1_000e6;
        (uint256 pplExact,) = _pplAround(target);
        _alignReserve(target * 50);
        assertGt(_sellBack(alice, pplExact, 0), 0, "exact 2% pays");
        (, uint256 feeRoom) = hub.sellBackCapToday();
        assertEq(feeRoom, 0, "1% fee line is the same window and is used up");

        uint256 more = hub.pplOf(alice) / 20;
        assertGt(_quoteGross(more), 0);
        _expectSellBackRevert(alice, more, 0, PplCurveHubV2.GlobalDayCap.selector);

        vm.warp(midnight);
        _expectSellBackRevert(alice, more, 0, PplCurveHubV2.GlobalDayCap.selector);
        (, uint256 feeAtMidnight) = hub.sellBackCapToday();
        assertEq(feeAtMidnight, 0, "fee line does not reset at UTC midnight");

        vm.warp(t0 + 1 days - 1);
        _expectSellBackRevert(alice, more, 0, PplCurveHubV2.GlobalDayCap.selector);

        vm.warp(t0 + 1 days);
        (uint256 room,) = hub.sellBackCapToday();
        assertEq(room, (hub.reserveUsd6() * 200) / 10_000, "cap frees at exactly t+24h");
        assertGt(_sellBack(alice, more, 0), 0);
    }

    /// @dev Item 2. Attestation for a different amount, hub, seller or chain id does not pay,
    /// and the same returnId cannot pay twice.
    function test_return_replayBindsAmountHubSellerChain() public {
        _holder(alice, 100_000e6, 1, MAX_BUY);
        _prepare(bob);
        uint256 ppl = hub.pplOf(alice) / 10;
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes32 pid = hub.personOf(alice);
        uint256 cid = block.chainid;

        bytes memory wrongAmount = _signReturnRaw(
            returnVerifierPk, address(hub), cid, pid, address(hub), alice, ppl + 1, PEOPLE_CHAIN_ID, cid, id, deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, wrongAmount);

        bytes memory wrongHub = _signReturnRaw(
            returnVerifierPk, address(hub), cid, pid, address(0x1234), alice, ppl, PEOPLE_CHAIN_ID, cid, id, deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, wrongHub);

        bytes memory wrongSeller = _signReturnRaw(
            returnVerifierPk, address(hub), cid, pid, address(hub), bob, ppl, PEOPLE_CHAIN_ID, cid, id, deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, wrongSeller);

        bytes memory wrongDestChain = _signReturnRaw(
            returnVerifierPk, address(hub), cid, pid, address(hub), alice, ppl, PEOPLE_CHAIN_ID, cid + 1, id, deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, wrongDestChain);

        bytes memory wrongSourceChain = _signReturnRaw(
            returnVerifierPk, address(hub), cid, pid, address(hub), alice, ppl, PEOPLE_CHAIN_ID + 1, cid, id, deadline
        );
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, wrongSourceChain);

        bytes memory ok = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl, 0, id, deadline, ppl, ok), 0);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ReturnUsed.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, ok);
        assertTrue(hub.returnUsed(id));
    }

    /// @dev Item 3. Verifier, return verifier and rescue wait exactly 48 hours. Non-owners cannot
    /// queue, execute or cancel. Liquidity release stays on its 30-day notice, so 48 hours is not enough.
    function test_adminTimelock48h_verifierReturnVerifierRescue() public {
        assertEq(hub.ADMIN_TIMELOCK(), 48 hours);
        bytes memory denied = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        address next = makeAddr("nextVerifier");

        vm.startPrank(alice);
        vm.expectRevert(denied);
        hub.queueSetVerifier(next);
        vm.expectRevert(denied);
        hub.executeSetVerifier(bytes32(uint256(1)));
        vm.expectRevert(denied);
        hub.cancel(bytes32(uint256(1)));
        vm.expectRevert(denied);
        hub.queueSetReturnVerifier(next);
        vm.expectRevert(denied);
        hub.executeSetReturnVerifier(bytes32(uint256(1)));
        vm.expectRevert(denied);
        hub.queueRescue(address(usdc), 0);
        vm.expectRevert(denied);
        hub.executeRescue(bytes32(uint256(1)));
        vm.stopPrank();

        bytes32 kind = keccak256("setVerifier");
        bytes32 id = keccak256(abi.encode(kind, next, uint256(0), uint256(1)));
        uint256 eta = _now() + 48 hours;
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.Queued(id, abi.encode(kind, next, uint256(0)), eta);
        vm.prank(owner);
        assertEq(hub.queueSetVerifier(next), id);

        vm.warp(eta - 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.Timelocked.selector);
        hub.executeSetVerifier(id);
        vm.warp(eta);
        vm.prank(owner);
        hub.executeSetVerifier(id);
        assertEq(hub.verifier(), next);

        // cancel, then the cancelled id cannot execute
        bytes32 rvKind = keccak256("setReturnVerifier");
        address rv = makeAddr("nextReturn");
        bytes32 rid = keccak256(abi.encode(rvKind, rv, uint256(0), uint256(2)));
        uint256 reta = _now() + 48 hours;
        vm.prank(owner);
        assertEq(hub.queueSetReturnVerifier(rv), rid);
        vm.expectEmit(true, false, false, true, address(hub));
        emit PplCurveHubV2.Cancelled(rid);
        vm.prank(owner);
        hub.cancel(rid);
        vm.warp(reta);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.NotQueued.selector);
        hub.executeSetReturnVerifier(rid);
        assertEq(hub.returnVerifier(), returnVerifier);

        // rescue of surplus: eta-1 reverts, eta pays treasury
        usdc.mint(address(hub), 25e6);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        bytes32 rKind = keccak256("rescue");
        bytes32 rescueId = keccak256(abi.encode(rKind, address(usdc), uint256(25e6), uint256(3)));
        uint256 rescueEta = _now() + 48 hours;
        vm.prank(owner);
        assertEq(hub.queueRescue(address(usdc), 25e6), rescueId);
        vm.warp(rescueEta - 1);
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.Timelocked.selector);
        hub.executeRescue(rescueId);
        vm.warp(rescueEta);
        vm.prank(owner);
        hub.executeRescue(rescueId);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 25e6);

        // reserve exit is the 30-day notice, which 48 hours does not unlock
        vm.prank(owner);
        hub.announceLiquidityRelease();
        uint256 announced = _now();
        vm.warp(announced + 48 hours);
        vm.expectRevert(PplCurveHubV2.ReleaseTimelocked.selector);
        hub.executeLiquidityRelease();
        assertGt(hub.LIQUIDITY_RELEASE_DELAY(), hub.ADMIN_TIMELOCK());
    }

    /// @dev Slippage does not consume the attestation. A slice can be redeemed now and the rest
    /// after the deadline is renewed. `minUsdcOut` is the caller's, not part of the signature.
    function test_h3_partialRenewalAndSlippage() public {
        _holder(alice, 2_000_000e6, 2, MAX_BUY);
        uint256 ppl = hub.pplOf(alice);
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes memory sig = _signReturn(alice, ppl, id, deadline);
        (,, uint256 quoted) = hub.quoteSellBack(alice, ppl / 10);

        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Slippage.selector);
        hub.sellBack(ppl / 10, quoted + 1, id, deadline, ppl, sig);
        assertEq(hub.returnClaimedPpl(id), 0);
        assertFalse(hub.returnUsed(id));

        vm.prank(alice);
        uint256 paid = hub.sellBack(ppl / 10, quoted, id, deadline, ppl, sig);
        assertEq(paid, quoted);
        assertEq(hub.returnClaimedPpl(id), ppl / 10);
        assertFalse(hub.returnUsed(id));

        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.ReturnExceeded.selector);
        hub.sellBack(ppl - ppl / 10 + 1, 0, id, deadline, ppl, sig);

        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Expired.selector);
        hub.sellBack(ppl / 10, 0, id, deadline, ppl, sig);

        uint256 deadline2 = _now() + 1 hours;
        bytes memory renewed = _signReturn(alice, ppl, id, deadline2);
        vm.prank(alice);
        assertGt(hub.sellBack(ppl / 10, 0, id, deadline2, ppl, renewed), 0);
        assertEq(hub.returnClaimedPpl(id), (ppl / 10) * 2);
        assertFalse(hub.returnUsed(id));
    }

    /// @dev An attested amount whose gross no longer fits the $2k person cap can still be redeemed
    /// in slices under the same returnId.
    function test_h3_overCapSliceStaysRedeemable() public {
        _seedRaised(2_000_000e6);
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(1 days);
        _buy(alice, MAX_BUY);
        _warpBy(60);
        _buy(alice, MAX_BUY);
        _warpBy(30 days);

        uint256 ppl = hub.pplOf(alice);
        assertGt(_quoteGross(ppl), DAY_CAP, "precondition: full position is over the person cap");
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 1 hours;
        bytes memory sig = _signReturn(alice, ppl, id, deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.PersonDayCap.selector);
        hub.sellBack(ppl, 0, id, deadline, ppl, sig);
        assertEq(hub.returnClaimedPpl(id), 0);

        (uint256 slice,) = _pplAround(DAY_CAP);
        assertLe(slice, ppl);
        assertLe(_quoteGross(slice), DAY_CAP);
        vm.prank(alice);
        assertGt(hub.sellBack(slice, 0, id, deadline, ppl, sig), 0);
        assertEq(hub.returnClaimedPpl(id), slice);
        assertFalse(hub.returnUsed(id));
    }

    /// @dev The owner cannot set minSell to the $2k cap. A position below the floor, and a sell that
    /// exactly fills the global room, both still clear.
    function test_m_minSellCannotDeadlock() public {
        uint256 maxMinSell = hub.MAX_MIN_SELL_USD6();
        vm.prank(owner);
        hub.setWindowLimits(20, MIN_BUY, 10, maxMinSell);

        _seedRaised(100_000e6);
        _prepare(alice);
        _buy(alice, MIN_BUY);
        _warpBy(30 days);
        _buy(alice, MAX_BUY);
        uint256 unlocked = hub.sellableNow(alice);
        assertLt(unlocked, hub.pplOf(alice));
        (uint256 gross,,) = hub.quoteSellBack(alice, unlocked);
        assertLt(gross, hub.minSellUsd6());
        assertGt(_sellBack(alice, unlocked, 0), 0);

        _prepare(bob);
        _buy(bob, MAX_BUY);
        _warpBy(30 days);
        (uint256 fit,) = _pplAround(40e6);
        assertLe(fit, hub.pplOf(bob));
        uint256 exact = _quoteGross(fit);
        _alignReserve(exact * 50);
        assertEq((hub.sellWindowReference() * 200) / 10_000, exact);
        assertLt(exact, hub.minSellUsd6());
        assertGt(_sellBack(bob, fit, 0), 0);
    }

    /// @dev Many sells in one 15-minute bucket share a ring slot, so dust cannot fill all 128.
    function test_m_globalSellsShareABucket() public {
        vm.prank(owner);
        hub.setWindowLimits(20, MIN_BUY, 50, 1e6);
        _seedRaised(2_000_000e6);
        _prepare(alice);
        _buy(alice, MAX_BUY);
        _warpBy(30 days);
        (, uint256 slice) = _pplAround(5e6);
        assertGe(_quoteGross(slice), 1e6);
        for (uint256 i; i < 30; ++i) {
            _sellBack(alice, slice, 0);
        }
        (, uint256 live) = hub.globalSellUsed();
        assertEq(live, 1, "thirty sells, one bucket");
        (uint256 room,) = hub.sellBackCapToday();
        assertGt(room, 0);

        vm.warp(_now() + hub.GLOBAL_SELL_BUCKET());
        _sellBack(alice, slice, 0);
        (, live) = hub.globalSellUsed();
        assertEq(live, 2);
        assertLt(live, hub.GLOBAL_SELL_CAPACITY());
    }

    /// @dev The unpaid remainder of a returnId that was already paid in part is payable even when
    /// its gross is below `minSellUsd6`. The person and global caps still apply; the remainder
    /// waits until the window has room, then pays. A smaller slice of that remainder does not.
    function test_m_attestedRemainderPaysBelowMinSell() public {
        _limits(20, MIN_BUY, 10, hub.MAX_MIN_SELL_USD6());
        _seedRaised(BIG_RAISED);
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            _warpBy(60);
        }
        _warpBy(1 days);
        _buy(alice, MAX_BUY);
        _warpBy(30 days);

        uint256 unlocked = hub.sellableNow(alice);
        uint256 room = hub.sellRemaining24h(alice);
        (uint256 fit,) = _pplAround(room);
        (uint256 dust,) = _pplAround(1e6);
        assertGt(dust, 1);
        assertGt(fit, dust);
        assertLt(fit + dust, unlocked, "other unlocked PPL remain");
        assertGe(_quoteGross(fit), hub.minSellUsd6());
        assertLt(_quoteGross(dust), hub.minSellUsd6());

        uint256 ceiling = fit + dust;
        bytes32 id = _freshReturnId();
        uint256 deadline = _now() + 2 days;
        bytes memory sig = _signReturn(alice, ceiling, id, deadline);

        vm.prank(alice);
        hub.sellBack(fit, 0, id, deadline, ceiling, sig);
        assertEq(hub.returnClaimedPpl(id), fit);
        assertFalse(hub.returnUsed(id));

        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.PersonDayCap.selector);
        hub.sellBack(dust, 0, id, deadline, ceiling, sig);
        assertEq(hub.returnClaimedPpl(id), fit);

        vm.warp(_now() + 1 days);
        (uint256 leftGross,,) = hub.quoteSellBack(alice, dust);
        assertGt(leftGross, 0);
        assertLt(leftGross, hub.minSellUsd6());
        assertLt(dust, hub.sellableNow(alice), "remainder is not the whole unlocked position");
        (uint256 globalRoom,) = hub.sellBackCapToday();
        assertTrue(leftGross != globalRoom && leftGross != hub.sellRemaining24h(alice));

        uint256 slice = dust / 2;
        (uint256 sliceGross,,) = hub.quoteSellBack(alice, slice);
        assertGt(sliceGross, 0);
        assertLt(sliceGross, hub.minSellUsd6());
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BelowMinSell.selector);
        hub.sellBack(slice, 0, id, deadline, ceiling, sig);

        vm.prank(alice);
        assertGt(hub.sellBack(dust, 0, id, deadline, ceiling, sig), 0);
        assertEq(hub.returnClaimedPpl(id), ceiling);
        assertTrue(hub.returnUsed(id));
    }
}
