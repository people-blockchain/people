// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommunityAgentWallet} from "../src/agent/CommunityAgentWallet.sol";

/// H-03: `CommunityAgentWallet` hardening.
///
/// (a) `_enforceSpend` now rejects `amount == 0` up front (`ZeroAmount`), closing a no-op
/// spend/authorization path that previously recorded a zero-value entry for nothing.
///
/// (b) Pre-fix, `_recordWindowSpend`'s eviction loop walked every stale `SpendRecord` in one
/// unbounded pass before checking the cap. A wallet that sat mostly idle (or was deliberately
/// spammed with many small, cap-respecting spends) could accumulate an arbitrarily large backlog
/// of stale records; the next legitimate `spend`/`authorizePayment` would then have to evict all
/// of them in a single call, and a large enough backlog would exceed the block gas limit and
/// revert forever — permanently bricking the wallet (no spend could ever succeed again, since
/// eviction always runs first). Post-fix, `_evict` stops after `MAX_EVICTIONS_PER_CALL` (50)
/// records regardless of backlog size, and the public `evictStale()` lets anyone drain a backlog
/// incrementally ahead of time. This PoC builds backlogs well past that cap and shows eviction
/// cost stays bounded (does not scale with backlog size) and a backlog drains fully across
/// multiple calls without ever reverting.
contract PocAgentWalletUnbrickableTest is Test {
    address internal executor = address(0xA11CE);
    address internal timelock = address(0x71);
    address internal recipient = address(0xFEE);
    address internal guardian = address(0x6D1A);

    function _freshWallet() internal returns (CommunityAgentWallet w) {
        w = new CommunityAgentWallet(executor, timelock, recipient, guardian);
        vm.deal(address(w), 1000 ether);
    }

    /// Loosen every cap so a large number of 1-wei authorizations can be queued without
    /// individually tripping the daily/weekly budget while the backlog is being built.
    function _loosenForBacklog(CommunityAgentWallet w) internal {
        vm.prank(timelock);
        w.setLimits(
            CommunityAgentWallet.Limits({
                maxPerTx: 1_000_000 ether,
                maxPerDay: 1_000_000 ether,
                maxPerWeek: 1_000_000 ether,
                whitelistEnabled: true,
                frozen: false
            })
        );
    }

    function _buildBacklog(CommunityAgentWallet w, uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            vm.prank(executor);
            w.authorizePayment(keccak256(abi.encode(address(w), i)), recipient, 1);
        }
    }

    // ------------------------------------------------------------------ (a) ZeroAmount

    function test_zeroAmountSpendReverts() public {
        CommunityAgentWallet w = _freshWallet();
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.ZeroAmount.selector);
        w.spend(payable(recipient), 0);
    }

    function test_zeroAmountAuthorizePaymentReverts() public {
        CommunityAgentWallet w = _freshWallet();
        vm.prank(executor);
        vm.expectRevert(CommunityAgentWallet.ZeroAmount.selector);
        w.authorizePayment(keccak256("zero"), recipient, 0);
    }

    // ------------------------------------------------------------------ (b) bounded eviction

    /// Pre-fix, a single call's eviction pass had to walk the *entire* stale backlog, so its gas
    /// cost scaled ~linearly with backlog size — a 10x bigger backlog meant ~10x the gas, and
    /// eventually (for a big enough backlog) a revert past the block gas limit. Post-fix,
    /// `_evict` stops after `MAX_EVICTIONS_PER_CALL` (50) per window no matter how large the
    /// backlog is, so `evictStale()`'s gas cost for a 600-record backlog should be essentially
    /// the same as for a 60-record one, not ~10x larger.
    function test_evictStaleGasIsBoundedRegardlessOfBacklogSize() public {
        CommunityAgentWallet small = _freshWallet();
        _loosenForBacklog(small);
        _buildBacklog(small, 60); // just over MAX_EVICTIONS_PER_CALL

        CommunityAgentWallet big = _freshWallet();
        _loosenForBacklog(big);
        _buildBacklog(big, 600); // 10x more stale records queued

        // Age every record out of both the daily and weekly rolling windows.
        vm.warp(block.timestamp + 8 days);

        uint256 g0 = gasleft();
        small.evictStale();
        uint256 usedSmall = g0 - gasleft();

        uint256 g1 = gasleft();
        big.evictStale();
        uint256 usedBig = g1 - gasleft();

        assertLt(usedBig, usedSmall * 3, "a single evictStale() call must not scale with backlog size");
        assertLt(usedBig, 2_000_000, "a single call must stay well under any realistic block gas limit");
    }

    /// Even a backlog far bigger than one call can clear must never cause a revert; it just
    /// takes more calls. This is the "unbrickable" property itself: no amount of accumulated
    /// stale records can permanently stop the wallet from making progress.
    function test_largeBacklogDrainsAcrossMultipleEvictStaleCallsWithoutReverting() public {
        CommunityAgentWallet w = _freshWallet();
        _loosenForBacklog(w);
        _buildBacklog(w, 600);
        vm.warp(block.timestamp + 8 days);

        // 600 records / 50-per-call-per-window = 12 calls to fully drain both windows; none of
        // these may revert.
        for (uint256 i = 0; i < 12; i++) {
            w.evictStale();
        }

        // Fully drained: a fresh spend bound by a tight cap now succeeds, proving the entire
        // 600-entry backlog's weight is gone from both windows, not merely hidden behind a
        // still-growing `head` — i.e. the wallet is fully usable again, not just "not reverting".
        vm.prank(timelock);
        w.setLimits(
            CommunityAgentWallet.Limits({
                maxPerTx: 1 ether,
                maxPerDay: 1 ether,
                maxPerWeek: 1 ether,
                whitelistEnabled: true,
                frozen: false
            })
        );
        vm.prank(executor);
        w.spend(payable(recipient), 1 ether);
    }

    /// Spend/authorizePayment themselves evict (bounded) before checking the cap, so a caller
    /// never has to know about `evictStale()` to keep making progress — an ordinary spend after
    /// the window has passed must not revert out-of-gas, even with a 200-record backlog queued
    /// (4x `MAX_EVICTIONS_PER_CALL`) and the eviction pass bounded to only 50 of them.
    function test_ordinarySpendAfterWindowElapsesEvictsAndSucceedsWithoutManualEvictStale() public {
        CommunityAgentWallet w = _freshWallet();
        _loosenForBacklog(w);
        _buildBacklog(w, 200);
        vm.warp(block.timestamp + 8 days);

        // Never calls evictStale() directly — the spend's own bounded eviction pass (at most 50
        // of the 200 stale records per window) must be enough for this not to revert, under the
        // same loosened limits used to build the backlog.
        vm.prank(executor);
        w.spend(payable(recipient), 1 ether);
    }
}
