// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {PplCurveHubV2, PplCurveMathV2} from "../src/sale/PplCurveHubV2.sol";
import {PplCurveMath} from "../src/sale/PplCurveHub.sol";
import {HubV2Base, HubV2Harness} from "./PplCurveHubV2Base.sol";

/// @dev Buy-side, whitelist/verification, term, graduation, referrer and admin tests (SPEC §6).
contract PplCurveHubV2Test is HubV2Base {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public override {
        super.setUp();
        _open();
    }

    function _trust(address router) internal {
        vm.prank(owner);
        hub.setTrustedRouter(router, true);
    }

    // ================================================================ curve

    function test_curveMatchesV1() public {
        // p0 at zero, ~50x at 100M PPL sold (k chosen for that).
        assertEq(hub.spotPriceWad(), 5e15);
        assertEq(PplCurveMathV2.spotPriceWad(0), 5e15);
        assertApproxEqRel(PplCurveMathV2.spotPriceWad(100_000_000e18), 0.25e18, 1e12);

        // v2 inverse agrees with v1 forward map over the whole raise range.
        uint256[6] memory rs = [uint256(10e6), 1_000e6, 100_000e6, 1_000_000e6, 3_000_000e6, CAP];
        for (uint256 i; i < rs.length; ++i) {
            uint256 sold = PplCurveMath.soldForRaised(rs[i]);
            uint256 back = PplCurveMathV2.raisedForSold(sold);
            assertApproxEqAbs(back, rs[i], 3 + rs[i] / 1e9, "raisedForSold(soldForRaised(r)) ~ r");
        }

        // hub buy uses exactly the v1 forward map.
        _prepare(alice);
        uint256 out = _buy(alice, 100e6);
        assertEq(hub.soldPpl(), PplCurveMath.soldForRaised(100e6));
        assertEq(out, PplCurveMath.soldForRaised(100e6));
        assertEq(hub.raisedUsd6(), 100e6);
    }

    function testFuzz_raisedSoldRoundTrip(uint256 r) public pure {
        r = bound(r, 1e6, CAP);
        uint256 sold = PplCurveMath.soldForRaised(r);
        uint256 back = PplCurveMathV2.raisedForSold(sold);
        assertApproxEqAbs(back, r, 3 + r / 1e9, "raised round trip");
        // sold -> raised -> sold is stable to within a relative 1e-9.
        uint256 sold2 = PplCurveMath.soldForRaised(back);
        assertApproxEqRel(sold2, sold, 1e10, "sold round trip");
    }

    // ================================================================ buy limits

    function test_buyRevertsBelowMin() public {
        _prepare(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BelowMin.selector);
        hub.buy(MIN_BUY - 1, 0, alice, address(0));
    }

    function test_buyAtMinSucceeds() public {
        _prepare(alice);
        uint256 out = _buy(alice, MIN_BUY);
        assertGt(out, 0);
        assertEq(hub.pplOf(alice), out);
        assertEq(hub.raisedUsd6(), MIN_BUY);
    }

    function test_buyRevertsAboveMax() public {
        _prepare(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AboveMax.selector);
        hub.buy(MAX_BUY + 1, 0, alice, address(0));
        // exactly max is fine
        _buy(alice, MAX_BUY);
    }

    function test_buyCapPer24h() public {
        _prepare(alice);
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            vm.warp(vm.getBlockTimestamp() + 60);
        }
        assertEq(hub.buyRemaining24h(alice), 0);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    function test_buyCapResetsAfter24h() public {
        _prepare(alice);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 i; i < 4; ++i) {
            _buy(alice, MAX_BUY);
            vm.warp(vm.getBlockTimestamp() + 60);
        }
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));

        // rolling window: the first spend frees up at exactly t0 + 24h, not at UTC midnight.
        vm.warp(t0 + 1 days - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(t0 + 1 days);
        assertEq(hub.buyRemaining24h(alice), MAX_BUY);
        _buy(alice, MAX_BUY);
        assertEq(hub.buyRemaining24h(alice), 0);
    }

    function test_buyCapCountsRecipientNotPayer() public {
        address payer = makeAddr("payer");
        _fund(payer, 1_000_000e6);
        _trust(payer);
        _verify(alice);
        _verify(bob);
        for (uint256 i; i < 4; ++i) {
            vm.prank(payer);
            hub.buy(MAX_BUY, 0, alice, address(0));
            vm.warp(vm.getBlockTimestamp() + 60);
        }
        // alice (recipient) is capped even though payer never bought for itself.
        vm.prank(payer);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        // same payer buying for a different recipient is fine; payer has no own counter.
        vm.prank(payer);
        hub.buy(MAX_BUY, 0, bob, address(0));
        assertEq(hub.buyRemaining24h(payer), DAY_CAP);
        assertEq(hub.buyRemaining24h(bob), DAY_CAP - MAX_BUY);
        assertEq(hub.pplOf(payer), 0);
    }

    // ================================================================ cooldown

    function test_cooldown() public {
        _prepare(alice);
        _buy(alice, MIN_BUY);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Cooldown.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(vm.getBlockTimestamp() + 59);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Cooldown.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(vm.getBlockTimestamp() + 1);
        _buy(alice, MIN_BUY);
    }

    function test_cooldownPerRecipient() public {
        _prepare(alice);
        _prepare(bob);
        _buy(alice, MIN_BUY);
        _buy(bob, MIN_BUY); // other recipient not affected
        // A trusted router buys for other people. Those buys do not use or reset the person's cooldown:
        // they have their own count (MAX_ROUTER_BUYS_24H) and only share the $2k amount cap.
        address payer = makeAddr("payer");
        _fund(payer, 1_000e6);
        _trust(payer);
        _verify(carol);
        uint64 bobLast = hub.lastBuyAt(bob);
        assertGt(bobLast, 0);
        uint256 bobRemaining = hub.buyRemaining24h(bob);
        vm.startPrank(payer);
        hub.buy(MIN_BUY, 0, carol, address(0));
        hub.buy(MIN_BUY, 0, carol, address(0)); // back-to-back: no cooldown on the router path
        hub.buy(MIN_BUY, 0, bob, address(0)); // bob's own cooldown does not apply to a router buy
        vm.stopPrank();

        assertEq(hub.lastBuyAt(carol), 0, "router buy does not start cooldown");
        assertEq(hub.lastBuyAt(bob), bobLast, "router buy does not reset cooldown");
        (, uint256 carolOwn,,) = hub.usage24h(carol);
        assertEq(carolOwn, 0, "router buys are not own slots");
        (uint256 carolUsd, uint256 carolBuys) = hub.routerUsage24h(carol);
        assertEq(carolBuys, 2);
        assertEq(carolUsd, 2 * MIN_BUY);
        (, uint256 bobOwn,,) = hub.usage24h(bob);
        assertEq(bobOwn, 1, "bob's own buy still the only own slot");
        assertEq(hub.buyRemaining24h(bob), bobRemaining - MIN_BUY, "router buy shares the $2k cap");
        assertEq(hub.buyRemaining24h(carol), DAY_CAP - 2 * MIN_BUY);

        // bob is still inside the cooldown his own buy started
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.Cooldown.selector);
        hub.buy(MIN_BUY, 0, bob, address(0));
        // carol was never put on cooldown, so she can buy for herself immediately
        _fund(carol, 1_000e6);
        _buy(carol, MIN_BUY);
        assertGt(hub.lastBuyAt(carol), 0);
    }

    /// @dev Router buys cannot fill the victim's own window or start their cooldown, so they cannot
    /// lock the victim out. The $2k/24h amount cap is shared: once it is spent, both paths revert.
    function test_routerBuyCannotLockOutVictimSharesCap() public {
        address router = makeAddr("router");
        _fund(router, 1_000_000e6);
        _trust(router);
        _prepare(alice);

        for (uint256 i; i < hub.MAX_ROUTER_BUYS_24H(); ++i) {
            vm.prank(router);
            hub.buy(MIN_BUY, 0, alice, address(0));
        }
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.TooManyRouterBuys.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        assertEq(hub.lastBuyAt(alice), 0, "cooldown untouched");
        (, uint256 ownBuys,,) = hub.usage24h(alice);
        assertEq(ownBuys, 0, "own window empty");
        _buy(alice, MIN_BUY); // victim buys immediately

        _prepare(bob);
        for (uint256 i; i < 3; ++i) {
            vm.prank(router);
            hub.buy(MAX_BUY, 0, bob, address(0));
        }
        _buy(bob, MAX_BUY); // 3 * $500 router + $500 own = $2,000
        assertEq(hub.buyRemaining24h(bob), 0);
        vm.prank(router);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, bob, address(0));
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.BuyDayCap.selector);
        hub.buy(MIN_BUY, 0, bob, address(0));
    }

    // ================================================================ slippage / token / split

    function test_buySlippage() public {
        _prepare(alice);
        (uint256 q,) = hub.quoteBuy(100e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Slippage.selector);
        hub.buy(100e6, q + 1, alice, address(0));
        vm.prank(alice);
        uint256 out = hub.buy(100e6, q, alice, address(0));
        assertEq(out, q);
    }

    function test_onlyUsdcPulled() public {
        MockUSDC other = new MockUSDC();
        _prepare(alice);
        other.mint(alice, 1_000e6);
        vm.prank(alice);
        other.approve(address(hub), type(uint256).max);
        assertEq(address(hub.usdc()), address(usdc));

        uint256 usdcBefore = usdc.balanceOf(alice);
        _buy(alice, 100e6);
        assertEq(usdcBefore - usdc.balanceOf(alice), 100e6);
        assertEq(other.balanceOf(alice), 1_000e6);
        assertEq(other.balanceOf(address(hub)), 0);
        assertEq(other.balanceOf(treasury), 0);
        assertEq(address(hub).balance, 0);
    }

    function test_buySplitsHalfToReserve() public {
        _prepare(alice);
        _buy(alice, 100e6);
        assertEq(hub.reserveUsd6(), 50e6);
        assertEq(usdc.balanceOf(address(hub)), 50e6);
        assertEq(usdc.balanceOf(treasury), 50e6);

        // odd amount: extra unit goes to reserve
        vm.warp(vm.getBlockTimestamp() + 60);
        _buy(alice, 11e6 + 1);
        assertEq(hub.reserveUsd6(), 50e6 + 5_500_001);
        assertEq(usdc.balanceOf(treasury), 50e6 + 5_500_000);
    }

    function testFuzz_splitRoundingFavoursReserve(uint256 amt) public {
        amt = bound(amt, MIN_BUY, MAX_BUY);
        _prepare(alice);
        _buy(alice, amt);
        uint256 res = hub.reserveUsd6();
        uint256 tre = usdc.balanceOf(treasury);
        assertEq(res + tre, amt);
        assertGe(res, tre);
        assertLe(res - tre, 1);
        assertEq(usdc.balanceOf(address(hub)), res);
    }

    // ================================================================ whitelist

    function test_whitelistRejectsUnverified() public {
        _fund(alice, 1_000e6);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        // payer verified but recipient not: still rejected (recipient is what counts)
        _prepare(bob);
        _trust(bob);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    function test_whitelistAcceptsVerified() public {
        _prepare(alice);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Whitelist));
        assertGt(_buy(alice, MIN_BUY), 0);
    }

    function test_verificationStillRequiredAfterWhitelist() public {
        _fund(alice, 1_000e6);
        uint256 end = uint256(hub.openedAt()) + 7 days;
        vm.warp(end - 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        _skipPastWhitelist();
        assertEq(vm.getBlockTimestamp(), end);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Open));
        // A2: no whitelist-phase special case, an unverified buyer stays rejected
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotVerified.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        _verify(alice);
        assertGt(_buy(alice, MIN_BUY), 0);
    }

    // ================================================================ verification

    function test_verifyBindsOnce() public {
        bytes32 pid = _verify(alice);
        assertEq(hub.personOf(alice), pid);
        assertEq(hub.accountOfPerson(pid), alice);

        // same account, new person
        bytes32 pid2 = keccak256("other");
        bytes memory sig2 = _sign(alice, pid2, vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid2, vm.getBlockTimestamp() + 1 days, sig2);
        // same account, same person again
        bytes memory sig = _sign(alice, pid, vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, vm.getBlockTimestamp() + 1 days, sig);
    }

    function test_verifySecondAddressSamePersonReverts() public {
        bytes32 pid = _verify(alice);
        bytes memory sig = _sign(bob, pid, vm.getBlockTimestamp() + 1 days);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, vm.getBlockTimestamp() + 1 days, sig);
        assertEq(hub.personOf(bob), bytes32(0));
        assertEq(hub.accountOfPerson(pid), alice);
    }

    function test_verifyExpiredSig() public {
        bytes32 pid = keccak256("p");
        uint256 deadline = vm.getBlockTimestamp() + 100;
        bytes memory sig = _sign(alice, pid, deadline);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.Expired.selector);
        hub.verify(pid, deadline, sig);
        // exactly at the deadline is still valid
        vm.warp(deadline);
        vm.prank(alice);
        hub.verify(pid, deadline, sig);
        assertEq(hub.personOf(alice), pid);
    }

    function test_verifyWrongSigner() public {
        bytes32 pid = keccak256("p");
        uint256 deadline = vm.getBlockTimestamp() + 1 days;
        bytes memory bad = _signWith(0xBADBAD, alice, pid, deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verify(pid, deadline, bad);
        // valid signature for another account cannot be replayed by alice
        bytes memory forBob = _sign(bob, pid, deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verify(pid, deadline, forBob);
        // zero personId rejected
        bytes memory zero = _sign(alice, bytes32(0), deadline);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verify(bytes32(0), deadline, zero);
        assertEq(hub.personOf(alice), bytes32(0));
    }

    function test_unbindInvalidatesOldSig() public {
        bytes32 pid = keccak256("p");
        uint256 deadline = vm.getBlockTimestamp() + 30 days;
        bytes memory oldSig = _sign(alice, pid, deadline);
        vm.prank(alice);
        hub.verify(pid, deadline, oldSig);

        vm.prank(alice);
        hub.unbind(alice);
        assertEq(hub.personOf(alice), bytes32(0));
        assertEq(hub.accountOfPerson(pid), address(0));
        assertEq(hub.bindNonce(pid), 1);
        assertEq(hub.pinnedAccount(pid), alice);

        // the old attestation (nonce 0) is dead
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verify(pid, deadline, oldSig);

        // a new verifier cannot hand this person to another address
        bytes memory fresh = _sign(bob, pid, deadline);
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.AlreadyBound.selector);
        hub.verify(pid, deadline, fresh);

        // the pinned account can verify again with the new nonce
        bytes memory again = _sign(alice, pid, deadline);
        vm.prank(alice);
        hub.verify(pid, deadline, again);
        assertEq(hub.accountOfPerson(pid), alice);

        // unbinding an unbound address reverts; another account cannot unbind
        vm.prank(alice);
        hub.unbind(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.NotBound.selector);
        hub.unbind(alice);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.UnbindDenied.selector);
        hub.unbind(bob);
    }

    // ================================================================ term

    function test_buyRevertsAfterTerm() public {
        _prepare(alice);
        uint256 closes = uint256(hub.openedAt()) + 730 days;
        vm.warp(closes - 1);
        _buy(alice, MIN_BUY);
        vm.warp(closes);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Expired));
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    function test_pauseDoesNotExtendTerm() public {
        _prepare(alice);
        uint256 opened = uint256(hub.openedAt());
        vm.warp(opened + 10 days);
        vm.prank(owner);
        hub.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
        vm.warp(opened + 730 days - 100);
        vm.prank(owner);
        hub.unpause();
        assertEq(uint256(hub.openedAt()), opened);
        _buy(alice, MIN_BUY); // still inside the original term
        vm.warp(opened + 730 days);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    // ================================================================ graduation

    function test_graduationAtCap() public {
        _prepare(alice);
        _seedRaised(CAP - MAX_BUY);
        uint256 expectedSold = PplCurveMath.soldForRaised(CAP);
        uint256 expectedReserve = hub.reserveUsd6() + MAX_BUY / 2;
        uint256 prevSold = hub.soldPpl();

        vm.expectEmit(false, false, false, true, address(hub));
        emit PplCurveHubV2.Graduated(CAP, expectedSold, expectedReserve);
        uint256 out = _buy(alice, MAX_BUY);

        assertTrue(hub.graduated());
        assertEq(hub.raisedUsd6(), CAP);
        assertEq(hub.soldPpl(), expectedSold);
        assertEq(out, expectedSold - prevSold);
        assertEq(hub.reserveUsd6(), expectedReserve);
        assertEq(uint256(hub.phase()), uint256(PplCurveHubV2.Phase.Graduated));
    }

    function test_graduationPartialFillChargesRemainder() public {
        _prepare(alice);
        uint256 remaining = 123e6;
        _seedRaised(CAP - remaining);

        // below the min and not completing the raise -> still BelowMin
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BelowMin.selector);
        hub.buy(MIN_BUY - 1, 0, alice, address(0));

        uint256 balBefore = usdc.balanceOf(alice);
        uint256 treasBefore = usdc.balanceOf(treasury);
        uint256 reserveBefore = hub.reserveUsd6();
        uint256 expectedOut = PplCurveMath.soldForRaised(CAP) - hub.soldPpl();

        vm.expectEmit(true, true, true, true, address(hub));
        emit PplCurveHubV2.Bought(alice, alice, address(0), remaining, remaining - remaining / 2, expectedOut, 0);
        uint256 out = _buy(alice, MAX_BUY);

        assertEq(out, expectedOut);
        assertEq(balBefore - usdc.balanceOf(alice), remaining, "only the remainder is charged");
        assertEq(usdc.balanceOf(treasury) - treasBefore, remaining / 2);
        assertEq(hub.reserveUsd6() - reserveBefore, remaining - remaining / 2);
        assertEq(hub.raisedUsd6(), CAP);
        assertTrue(hub.graduated());
        assertEq(hub.buyRemaining24h(alice), DAY_CAP - remaining);
    }

    function test_buyAfterGraduationReverts() public {
        _prepare(alice);
        _prepare(bob);
        _seedRaised(CAP - MAX_BUY);
        _buy(alice, MAX_BUY);
        assertTrue(hub.graduated());
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(MIN_BUY, 0, bob, address(0));
        // even an amount below min (the "final fill" exception) cannot sneak in
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.SaleNotActive.selector);
        hub.buy(1, 0, bob, address(0));
    }

    // ================================================================ referrer

    function test_referrerEmitted() public {
        _prepare(alice);
        (uint256 q,) = hub.quoteBuy(100e6);
        vm.expectEmit(true, true, true, true, address(hub));
        emit PplCurveHubV2.Bought(alice, alice, bob, 100e6, 50e6, q, 0);
        vm.prank(alice);
        hub.buy(100e6, 0, alice, bob);
    }

    function test_referrerSelfReverts() public {
        _prepare(alice);
        address payer = makeAddr("payer");
        _fund(payer, 1_000e6);
        _trust(payer);
        vm.prank(alice);
        vm.expectRevert(PplCurveHubV2.BadReferrer.selector);
        hub.buy(MIN_BUY, 0, alice, alice); // referrer == msg.sender
        vm.prank(payer);
        vm.expectRevert(PplCurveHubV2.BadReferrer.selector);
        hub.buy(MIN_BUY, 0, alice, payer); // referrer == msg.sender (payer != recipient)
    }

    function test_referrerRecipientReverts() public {
        _prepare(alice);
        address payer = makeAddr("payer");
        _fund(payer, 1_000e6);
        _trust(payer);
        vm.prank(payer);
        vm.expectRevert(PplCurveHubV2.BadReferrer.selector);
        hub.buy(MIN_BUY, 0, alice, alice); // referrer == recipient
    }

    function test_referrerZeroOk() public {
        _prepare(alice);
        vm.expectEmit(true, true, true, false, address(hub));
        emit PplCurveHubV2.Bought(alice, alice, address(0), 0, 0, 0, 0);
        vm.prank(alice);
        hub.buy(MIN_BUY, 0, alice, address(0));
    }

    // ================================================================ admin

    function test_liquidityReceiverCannotBeTreasuryOrOwner() public {
        vm.expectRevert(PplCurveHubV2.BadReceiver.selector);
        new PplCurveHubV2(usdc, treasury, treasury, owner, verifier);
        vm.expectRevert(PplCurveHubV2.BadReceiver.selector);
        new PplCurveHubV2(usdc, treasury, owner, owner, verifier);
        vm.expectRevert(PplCurveHubV2.ZeroAddress.selector);
        new PplCurveHubV2(usdc, treasury, address(0), owner, verifier);
        // sanity: a distinct receiver deploys
        PplCurveHubV2 ok = new PplCurveHubV2(usdc, treasury, liquidityReceiver, owner, verifier);
        assertEq(ok.liquidityReceiver(), liquidityReceiver);
    }

    function test_setVerifierRevokes() public {
        bytes32 pid = keccak256("p");
        uint256 deadline = vm.getBlockTimestamp() + 30 days;
        bytes memory sigOld = _sign(bob, pid, deadline);
        _verify(alice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        hub.queueSetVerifier(address(0));

        vm.prank(owner);
        bytes32 id = hub.queueSetVerifier(address(0));
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetVerifier(id);
        assertEq(hub.verifier(), address(0));

        // signature from the revoked verifier no longer binds anyone
        vm.prank(bob);
        vm.expectRevert(PplCurveHubV2.BadSignature.selector);
        hub.verify(pid, deadline, sigOld);
        // already-bound accounts keep their binding
        assertEq(hub.personOf(alice), _personIdOf(alice));

        // rotate to a new key
        uint256 pk2 = 0xB0B;
        vm.prank(owner);
        bytes32 id2 = hub.queueSetVerifier(vm.addr(pk2));
        vm.warp(vm.getBlockTimestamp() + hub.ADMIN_TIMELOCK());
        vm.prank(owner);
        hub.executeSetVerifier(id2);
        bytes memory sigNew = _signWith(pk2, bob, pid, deadline);
        vm.prank(bob);
        hub.verify(pid, deadline, sigNew);
        assertEq(hub.personOf(bob), pid);
    }

    function test_renounceReverts() public {
        vm.prank(owner);
        vm.expectRevert(PplCurveHubV2.RenounceDisabled.selector);
        hub.renounceOwnership();
        assertEq(hub.owner(), owner);
    }

    // ================================================================ gas

    function test_buyGas() public {
        _prepare(alice);
        _skipPastWhitelist();
        _buy(alice, 100e6);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.prank(alice);
        uint256 g = gasleft();
        hub.buy(100e6, 0, alice, address(0));
        g -= gasleft();
        emit log_named_uint("second buy gas", g);
        assertLt(g, 250_000);
    }
}
