// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {PromoRewardsVault} from "../src/promo/PromoRewardsVault.sol";
import {ICommunityTokenVault} from "../src/interfaces/ICommunityTokenVault.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";

/// Owner decision 2026-10-13: a creator may optionally set aside 0% / 5% / 10% of total supply
/// as a promo share for referral and partner rewards, taken out of the bonding-curve portion and
/// custodied by `PromoRewardsVault` under contract-enforced rules.
contract PromoRewardsVaultTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal factory;
    BondingCurveMarket internal bondingCurve;
    CreatorVesting internal vesting;
    CommunityTokenVault internal communityVault;
    PromoRewardsVault internal promoVault;

    address internal creator = address(0xC0FFEE);
    address internal feeRecipient = address(0xFEE);
    address internal treasury = address(0x7EA5);
    address internal referrerA = address(0xA1);
    address internal referrerB = address(0xB2);

    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint16 internal constant LOW = PeopleConstants.PROMO_BPS_LOW;
    uint16 internal constant HIGH = PeopleConstants.PROMO_BPS_HIGH;

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        WPPL wppl = new WPPL();
        PeopleAmmFactory ammFactory = new PeopleAmmFactory(address(registry));
        PeopleRouter router = new PeopleRouter(address(ammFactory), wppl);
        bondingCurve =
            new BondingCurveMarket(address(registry), feeRecipient, router, ammFactory, address(this), treasury);
        vesting = new CreatorVesting(address(registry));
        communityVault = new CommunityTokenVault(address(registry), address(this));
        factory = new TokenFactory(feeRecipient, bondingCurve, vesting, communityVault, address(this));
        registry.setTokenFactory(address(factory));
        promoVault = new PromoRewardsVault(address(registry), ICommunityTokenVault(address(communityVault)));
        factory.setPromoVault(address(promoVault));
        vm.deal(creator, 1_000 ether);
    }

    function _launch(uint16 promoBps) internal returns (address token) {
        vm.prank(creator);
        return factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Promo Test", "PROMO", 18, SUPPLY, "ipfs://promo", promoBps
        );
    }

    // ------------------------------------------------------------------ launch allocation

    function test_launch_with_no_promo_leaves_the_vault_untouched() public {
        address token = _launch(0);
        (,,, uint256 total,,,) = promoVault.pools(token);
        assertEq(total, 0, "no pool registered");
        assertEq(PeopleProjectToken(token).balanceOf(address(promoVault)), 0);

        CurveMath.Allocation memory a = CurveMath.calculateAllocation(SUPPLY);
        assertEq(PeopleProjectToken(token).balanceOf(address(communityVault)), a.communityPool);
        assertEq(
            PeopleProjectToken(token).balanceOf(address(bondingCurve)),
            a.bondingCurve + a.liquidityReserve + a.ecosystemReserve
        );
    }

    /// The default path must be indistinguishable from the pre-promo factory: same balances and
    /// the same logs, whether the creator calls the five-argument entry point or passes 0 bps.
    function test_zero_bps_matches_the_five_argument_entry_point_exactly() public {
        uint256 snap = vm.snapshotState();

        vm.recordLogs();
        vm.prank(creator);
        address legacyToken = factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Promo Test", "PROMO", 18, SUPPLY, "ipfs://promo"
        );
        Vm.Log[] memory legacyLogs = vm.getRecordedLogs();
        uint256[5] memory legacyBalances = _balances(legacyToken);

        vm.revertToState(snap);

        vm.recordLogs();
        address promoToken = _launch(0);
        Vm.Log[] memory promoLogs = vm.getRecordedLogs();
        uint256[5] memory promoBalances = _balances(promoToken);

        assertEq(promoToken, legacyToken, "same deployment, same address");
        assertEq(abi.encode(promoBalances), abi.encode(legacyBalances), "identical token flows");
        assertEq(promoLogs.length, legacyLogs.length, "no extra events at 0 bps");
        for (uint256 i = 0; i < legacyLogs.length; i++) {
            assertEq(promoLogs[i].emitter, legacyLogs[i].emitter);
            assertEq(abi.encode(promoLogs[i].topics), abi.encode(legacyLogs[i].topics));
            assertEq(promoLogs[i].data, legacyLogs[i].data);
        }
    }

    function _balances(address token) private view returns (uint256[5] memory b) {
        PeopleProjectToken t = PeopleProjectToken(token);
        b[0] = t.balanceOf(creator);
        b[1] = t.balanceOf(address(communityVault));
        b[2] = t.balanceOf(address(vesting));
        b[3] = t.balanceOf(address(bondingCurve));
        b[4] = t.balanceOf(address(promoVault));
    }

    function test_launch_with_promo_funds_the_vault_out_of_the_curve() public {
        address token = _launch(HIGH);
        PeopleProjectToken t = PeopleProjectToken(token);
        CurveMath.Allocation memory legacy = CurveMath.calculateAllocation(SUPPLY);
        uint256 promo = SUPPLY / 10;

        assertEq(t.balanceOf(address(promoVault)), promo, "10% of supply in the promo vault");
        // Everything else is exactly what a 0% launch produces, and the curve is short by promo.
        assertEq(t.balanceOf(address(communityVault)), legacy.communityPool);
        assertEq(
            t.balanceOf(address(bondingCurve)),
            legacy.bondingCurve - promo + legacy.liquidityReserve + legacy.ecosystemReserve
        );
        assertEq(t.totalSupply(), SUPPLY);
        assertEq(
            t.balanceOf(creator) + t.balanceOf(address(vesting)) + t.balanceOf(address(communityVault))
                + t.balanceOf(address(bondingCurve)) + t.balanceOf(address(promoVault)),
            SUPPLY,
            "nothing minted, nothing lost"
        );
    }

    /// The curve must be registered with the reduced inventory, not the full 60%, otherwise it
    /// would try to sell tokens that are sitting in the promo vault.
    function test_curve_is_registered_with_the_reduced_inventory() public {
        address token = _launch(LOW);
        (, uint256 liquidityReserve, uint256 ecosystemReserve, uint256 curveInventory) = bondingCurve.curves(token);
        CurveMath.Allocation memory legacy = CurveMath.calculateAllocation(SUPPLY);
        assertEq(curveInventory, legacy.bondingCurve - SUPPLY / 20, "55% of supply on the curve");
        assertEq(liquidityReserve, legacy.liquidityReserve, "liquidity reserve untouched");
        assertEq(ecosystemReserve, legacy.ecosystemReserve, "ecosystem reserve untouched");
    }

    function test_launch_emits_the_promo_event() public {
        vm.expectEmit(false, true, false, true, address(factory));
        emit TokenFactory.TokenPromoAllocated(address(0), creator, LOW, SUPPLY / 20);
        _launch(LOW);
    }

    function test_launch_with_an_unsupported_promo_share_reverts() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(CurveMath.InvalidPromoBps.selector, uint16(750)));
        factory.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}(
            "Promo Test", "PROMO", 18, SUPPLY, "ipfs://promo", uint16(750)
        );
    }

    function test_promo_launch_reverts_while_the_vault_is_unwired() public {
        TokenFactory bare = new TokenFactory(feeRecipient, bondingCurve, vesting, communityVault, address(this));
        registry.setTokenFactory(address(bare));
        vm.prank(creator);
        vm.expectRevert(TokenFactory.PromoVaultNotSet.selector);
        bare.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("No Vault", "NOVL", 18, SUPPLY, "", LOW);
        // ...while the default path keeps working untouched.
        vm.prank(creator);
        bare.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("No Vault", "NOVL", 18, SUPPLY, "");
    }

    function test_setPromoVault_is_owner_only_and_rejects_zero() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setPromoVault(address(0xDEAD));
        vm.expectRevert(TokenFactory.ZeroPromoVault.selector);
        factory.setPromoVault(address(0));
    }

    function test_only_the_factory_may_register_a_pool() public {
        address token = _launch(LOW);
        vm.prank(creator);
        vm.expectRevert(PromoRewardsVault.Unauthorized.selector);
        promoVault.register(token, creator, LOW, 1 ether);
    }

    // ------------------------------------------------------------------ awarding

    function test_creator_awards_a_referrer_and_the_pool_accounting_follows() public {
        address token = _launch(LOW);
        uint256 pool = SUPPLY / 20;
        uint256 amount = pool / 100;

        vm.prank(creator);
        promoVault.award(token, referrerA, amount);

        assertEq(promoVault.awardedTo(token, referrerA), amount);
        assertEq(promoVault.undistributed(token), pool - amount);
        assertEq(promoVault.awardCount(token, referrerA), 1);
    }

    function test_only_the_creator_may_award() public {
        address token = _launch(LOW);
        vm.prank(referrerA);
        vm.expectRevert(PromoRewardsVault.Unauthorized.selector);
        promoVault.award(token, referrerB, 1 ether);
        // Not even the factory owner.
        vm.expectRevert(PromoRewardsVault.Unauthorized.selector);
        promoVault.award(token, referrerB, 1 ether);
    }

    function test_creator_cannot_award_to_themselves_or_to_a_protocol_address() public {
        address token = _launch(LOW);
        vm.startPrank(creator);
        vm.expectRevert(PromoRewardsVault.InvalidRecipient.selector);
        promoVault.award(token, creator, 1 ether);
        vm.expectRevert(PromoRewardsVault.InvalidRecipient.selector);
        promoVault.award(token, address(0), 1 ether);
        vm.expectRevert(PromoRewardsVault.InvalidRecipient.selector);
        promoVault.award(token, token, 1 ether);
        vm.expectRevert(PromoRewardsVault.InvalidRecipient.selector);
        promoVault.award(token, address(promoVault), 1 ether);
        vm.expectRevert(PromoRewardsVault.InvalidRecipient.selector);
        promoVault.award(token, address(communityVault), 1 ether);
        vm.expectRevert(PromoRewardsVault.ZeroAmount.selector);
        promoVault.award(token, referrerA, 0);
        vm.stopPrank();
    }

    /// Anti-abuse: a creator cannot funnel the whole pool to one address (e.g. an alt they
    /// control) — a single recipient is capped at `PROMO_RECIPIENT_CAP_BPS` of the pool.
    function test_a_single_recipient_is_capped() public {
        address token = _launch(HIGH);
        uint256 cap = promoVault.recipientCap(token);
        assertEq(cap, (SUPPLY / 10) * PeopleConstants.PROMO_RECIPIENT_CAP_BPS / 10_000);

        vm.prank(creator);
        promoVault.award(token, referrerA, cap);

        vm.prank(creator);
        vm.expectRevert(PromoRewardsVault.RecipientCapExceeded.selector);
        promoVault.award(token, referrerA, 1);

        // A different recipient is unaffected.
        vm.prank(creator);
        promoVault.award(token, referrerB, cap);
        assertEq(promoVault.undistributed(token), SUPPLY / 10 - 2 * cap);
    }

    function test_the_cap_applies_to_the_sum_of_separate_awards() public {
        address token = _launch(HIGH);
        uint256 cap = promoVault.recipientCap(token);
        vm.startPrank(creator);
        promoVault.award(token, referrerA, cap / 2);
        promoVault.award(token, referrerA, cap / 2);
        vm.expectRevert(PromoRewardsVault.RecipientCapExceeded.selector);
        promoVault.award(token, referrerA, cap / 2);
        vm.stopPrank();
    }

    function test_award_tranches_per_recipient_are_bounded() public {
        address token = _launch(HIGH);
        uint256 max = PeopleConstants.PROMO_MAX_AWARDS_PER_RECIPIENT;
        vm.startPrank(creator);
        for (uint256 i = 0; i < max; i++) {
            promoVault.award(token, referrerA, 1 ether);
        }
        vm.expectRevert(PromoRewardsVault.TooManyAwards.selector);
        promoVault.award(token, referrerA, 1 ether);
        vm.stopPrank();
    }

    function test_cannot_award_more_than_the_pool_holds() public {
        address token = _launch(LOW);
        // Stay under the per-recipient cap so this exercises the pool bound, not the cap: spread
        // the whole pool over exactly `1 / PROMO_RECIPIENT_CAP_BPS` recipients first.
        uint256 pool = SUPPLY / 20;
        uint256 cap = promoVault.recipientCap(token);
        vm.startPrank(creator);
        for (uint256 i = 0; i < 10_000 / PeopleConstants.PROMO_RECIPIENT_CAP_BPS; i++) {
            promoVault.award(token, address(uint160(0x1000 + i)), cap);
        }
        assertEq(promoVault.undistributed(token), pool - cap * (10_000 / PeopleConstants.PROMO_RECIPIENT_CAP_BPS));
        vm.expectRevert(PromoRewardsVault.InsufficientPool.selector);
        promoVault.award(token, referrerA, 1);
        vm.stopPrank();
    }

    function test_no_awards_after_the_window_closes() public {
        address token = _launch(LOW);
        vm.warp(promoVault.promoDeadline(token));
        vm.prank(creator);
        vm.expectRevert(PromoRewardsVault.PromoWindowClosed.selector);
        promoVault.award(token, referrerA, 1 ether);
    }

    function test_unknown_token_has_no_pool() public {
        vm.expectRevert(PromoRewardsVault.UnknownToken.selector);
        promoVault.award(address(0xDEAD), referrerA, 1 ether);
        vm.expectRevert(PromoRewardsVault.UnknownToken.selector);
        promoVault.returnUnused(address(0xDEAD));
        vm.expectRevert(PromoRewardsVault.UnknownToken.selector);
        promoVault.promoDeadline(address(0xDEAD));
    }

    // ------------------------------------------------------------------ vesting and claiming

    /// Anti-abuse: an award cannot be dumped in the block it is handed out. Only
    /// `PROMO_UPFRONT_PERCENT` unlocks immediately; the rest is linear over `VESTING_DURATION`.
    function test_an_award_vests_and_cannot_be_taken_at_once() public {
        address token = _launch(LOW);
        uint256 amount = 1_000_000 ether;
        vm.prank(creator);
        promoVault.award(token, referrerA, amount);

        uint256 upfront = amount * PeopleConstants.PROMO_UPFRONT_PERCENT / 100;
        assertEq(promoVault.claimableOf(token, referrerA), upfront, "only the upfront slice at t0");

        vm.prank(referrerA);
        assertEq(promoVault.claim(token), upfront);
        assertEq(PeopleProjectToken(token).balanceOf(referrerA), upfront);

        vm.prank(referrerA);
        vm.expectRevert(PromoRewardsVault.NothingToClaim.selector);
        promoVault.claim(token);

        // Halfway through: upfront plus half of the remainder.
        vm.warp(block.timestamp + PeopleConstants.VESTING_DURATION / 2);
        assertEq(promoVault.vestedOf(token, referrerA), upfront + (amount - upfront) / 2);
        vm.prank(referrerA);
        promoVault.claim(token);
        assertEq(PeopleProjectToken(token).balanceOf(referrerA), upfront + (amount - upfront) / 2);

        // Fully vested at the end.
        vm.warp(block.timestamp + PeopleConstants.VESTING_DURATION);
        vm.prank(referrerA);
        promoVault.claim(token);
        assertEq(PeopleProjectToken(token).balanceOf(referrerA), amount, "the whole award, eventually");
        assertEq(promoVault.claimableOf(token, referrerA), 0);
    }

    function test_each_award_vests_on_its_own_clock() public {
        address token = _launch(HIGH);
        uint256 upfront = 1_000 ether * PeopleConstants.PROMO_UPFRONT_PERCENT / 100;
        vm.prank(creator);
        promoVault.award(token, referrerA, 1_000 ether);

        // A second award halfway through the window starts its own 180 days from scratch, so an
        // early award can never be topped up to reset or accelerate anything.
        vm.warp(block.timestamp + PeopleConstants.VESTING_DURATION / 2);
        vm.prank(creator);
        promoVault.award(token, referrerA, 1_000 ether);

        assertEq(
            promoVault.vestedOf(token, referrerA),
            (upfront + (1_000 ether - upfront) / 2) + upfront,
            "first award half way, second only its upfront slice"
        );

        vm.warp(block.timestamp + PeopleConstants.VESTING_DURATION);
        assertEq(promoVault.vestedOf(token, referrerA), 2_000 ether, "both fully vested eventually");
    }

    function test_nothing_to_claim_without_an_award() public {
        address token = _launch(LOW);
        vm.prank(referrerA);
        vm.expectRevert(PromoRewardsVault.NothingToClaim.selector);
        promoVault.claim(token);
    }

    // ------------------------------------------------------------------ the 180-day return

    /// The headline rule: whatever the creator never handed out goes to the token's Community
    /// Pool allocation after 180 days — not back to the creator — and anyone may trigger it.
    function test_unused_promo_returns_to_the_community_pool_after_180_days() public {
        address token = _launch(HIGH);
        uint256 pool = SUPPLY / 10;
        uint256 awarded = 10_000 ether;
        vm.prank(creator);
        promoVault.award(token, referrerA, awarded);

        uint256 communityBefore = communityVault.balances(token);
        assertEq(communityBefore, CurveMath.calculateAllocation(SUPPLY).communityPool);

        vm.expectRevert(PromoRewardsVault.PromoWindowOpen.selector);
        promoVault.returnUnused(token);

        vm.warp(promoVault.promoDeadline(token));
        // Permissionless: a random address, not the creator, closes the pool.
        vm.prank(referrerB);
        uint256 returned = promoVault.returnUnused(token);

        assertEq(returned, pool - awarded, "everything not awarded");
        assertEq(communityVault.balances(token), communityBefore + returned, "credited to the community pool");
        assertEq(PeopleProjectToken(token).balanceOf(address(communityVault)), communityBefore + returned);
        assertEq(promoVault.undistributed(token), 0);
        assertEq(PeopleProjectToken(token).balanceOf(creator) > 0, true);
        // The creator received nothing from the promo pool — only their own vested allocation.
        assertEq(
            PeopleProjectToken(token).balanceOf(creator),
            CurveMath.calculateAllocation(SUPPLY).creator * 10 / 100,
            "no promo tokens leak back to the creator"
        );
    }

    /// Returning the remainder must not touch tokens already committed to recipients: they keep
    /// vesting and stay claimable in full afterwards.
    function test_awarded_tokens_survive_the_return() public {
        address token = _launch(HIGH);
        uint256 awarded = 10_000 ether;
        vm.prank(creator);
        promoVault.award(token, referrerA, awarded);

        vm.warp(promoVault.promoDeadline(token));
        promoVault.returnUnused(token);

        // The award is fully vested by now (window == vesting duration).
        vm.prank(referrerA);
        promoVault.claim(token);
        assertEq(PeopleProjectToken(token).balanceOf(referrerA), awarded);
        assertEq(PeopleProjectToken(token).balanceOf(address(promoVault)), 0, "vault fully drained");
    }

    function test_the_return_cannot_be_run_twice() public {
        address token = _launch(LOW);
        vm.warp(promoVault.promoDeadline(token));
        assertEq(promoVault.returnUnused(token), SUPPLY / 20);
        vm.expectRevert(PromoRewardsVault.AlreadyReturned.selector);
        promoVault.returnUnused(token);
    }

    function test_a_fully_distributed_pool_closes_with_nothing_to_return() public {
        address token = _launch(LOW);
        uint256 cap = promoVault.recipientCap(token);
        vm.startPrank(creator);
        for (uint256 i = 0; i < 10_000 / PeopleConstants.PROMO_RECIPIENT_CAP_BPS; i++) {
            promoVault.award(token, address(uint160(0x2000 + i)), cap);
        }
        vm.stopPrank();
        uint256 communityBefore = communityVault.balances(token);

        vm.warp(promoVault.promoDeadline(token));
        assertEq(promoVault.returnUnused(token), 0);
        assertEq(communityVault.balances(token), communityBefore, "nothing to credit");
        vm.expectRevert(PromoRewardsVault.AlreadyReturned.selector);
        promoVault.returnUnused(token);
    }

    /// End to end: the returned tokens are really spendable as community-pool tokens, through
    /// the vault's own timelock-gated, allow-listed withdrawal path.
    function test_returned_promo_is_withdrawable_as_community_pool_tokens() public {
        address token = _launch(HIGH);
        vm.warp(promoVault.promoDeadline(token));
        promoVault.returnUnused(token);

        communityVault.setRecipientAllowed(referrerB, true);
        uint256 balance = communityVault.balances(token);
        communityVault.withdraw(token, referrerB, balance);
        assertEq(PeopleProjectToken(token).balanceOf(referrerB), balance);
        assertEq(communityVault.balances(token), 0);
    }

    function test_only_the_wired_promo_vault_may_credit_the_community_pool() public {
        address token = _launch(LOW);
        vm.prank(creator);
        vm.expectRevert(CommunityTokenVault.Unauthorized.selector);
        communityVault.creditPromoReturn(token, 1 ether);

        // Rotating the factory's vault immediately revokes the old one's credit rights.
        factory.setPromoVault(address(0xBEEF));
        vm.warp(promoVault.promoDeadline(token));
        vm.expectRevert(CommunityTokenVault.Unauthorized.selector);
        promoVault.returnUnused(token);
    }

    /// Rotating the factory's promo vault must not strand the remainder of pools already living
    /// in the old one: the community vault's owner can re-authorize it so they still return.
    function test_a_rotated_out_vault_can_be_reauthorized_to_return_its_pools() public {
        address token = _launch(HIGH);
        factory.setPromoVault(address(0xBEEF));
        vm.warp(promoVault.promoDeadline(token));

        vm.expectRevert(CommunityTokenVault.Unauthorized.selector);
        promoVault.returnUnused(token);

        communityVault.setLegacyPromoVault(address(promoVault), true);
        uint256 communityBefore = communityVault.balances(token);
        uint256 returned = promoVault.returnUnused(token);
        assertEq(returned, SUPPLY / 10);
        assertEq(communityVault.balances(token), communityBefore + returned);
    }

    function test_setLegacyPromoVault_is_owner_only() public {
        vm.prank(creator);
        vm.expectRevert();
        communityVault.setLegacyPromoVault(creator, true);
    }

    /// A credit must be backed by tokens actually received, so `withdraw` can never promise more
    /// than the vault holds.
    function test_a_credit_beyond_the_vault_holdings_reverts() public {
        address token = _launch(LOW);
        factory.setPromoVault(address(this));
        vm.expectRevert(CommunityTokenVault.CreditExceedsHoldings.selector);
        communityVault.creditPromoReturn(token, 1);
    }

    // ------------------------------------------------------------------ invariants

    /// Across any sequence of awards and claims, the vault always holds at least what it still
    /// owes: the undistributed remainder plus every awarded-but-unclaimed token.
    function testFuzz_vault_always_covers_what_it_owes(uint256 amountA, uint256 amountB, uint256 skipSeconds) public {
        address token = _launch(HIGH);
        uint256 cap = promoVault.recipientCap(token);
        amountA = bound(amountA, 1, cap);
        amountB = bound(amountB, 1, cap);
        skipSeconds = bound(skipSeconds, 0, PeopleConstants.PROMO_WINDOW - 1);

        vm.startPrank(creator);
        promoVault.award(token, referrerA, amountA);
        promoVault.award(token, referrerB, amountB);
        vm.stopPrank();

        vm.warp(block.timestamp + skipSeconds);
        // A tiny award can have a zero upfront slice (floor rounding), so there may be nothing
        // claimable yet; that is legitimate, the invariant below still has to hold.
        if (promoVault.claimableOf(token, referrerA) > 0) {
            vm.prank(referrerA);
            promoVault.claim(token);
        }

        uint256 owed =
            promoVault.undistributed(token) + (amountA - PeopleProjectToken(token).balanceOf(referrerA)) + amountB;
        assertGe(PeopleProjectToken(token).balanceOf(address(promoVault)), owed);
    }
}
