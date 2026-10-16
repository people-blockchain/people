// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {IPromoRewardsVault} from "../interfaces/IPromoRewardsVault.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";

/// @notice Custodian for the optional creator promo share (owner decision 2026-10-13).
///
/// A creator who launches with `promoBps` of 500 or 1000 has that share of total supply carved
/// out of the **bonding-curve portion** (see `CurveMath.calculateAllocationWithPromo` for why)
/// and deposited here. The creator may then hand it out to referrers and partners, but only
/// within rules this contract enforces and the creator cannot change:
///
///   * only the launching creator may award, and only to third parties — never to themselves,
///     the token, this vault or the zero address;
///   * a single recipient may be awarded at most `PROMO_RECIPIENT_CAP_BPS` of the pool in total,
///     across at most `PROMO_MAX_AWARDS_PER_RECIPIENT` separate awards;
///   * every award vests — `PROMO_UPFRONT_PERCENT` unlocked immediately, the rest linearly over
///     `VESTING_DURATION` — so promo tokens cannot be handed out and dumped in one block;
///   * awards may only be made inside the `PROMO_WINDOW` (180 days from launch);
///   * once the window closes, anyone may call `returnUnused` and every token the creator never
///     awarded goes to the token's Community Pool allocation. Nothing comes back to the creator.
///
/// The vault never holds native PPL and has no owner: there is no privileged path that can move
/// a promo pool anywhere other than to an awarded recipient or to the Community Pool.
contract PromoRewardsVault is IPromoRewardsVault {
    using SafeERC20 for IERC20;

    struct Pool {
        /// @dev The launching creator — the only address allowed to `award` from this pool.
        address creator;
        /// @dev 500 or 1000; 0 pools are never registered (the factory skips this contract).
        uint16 promoBps;
        /// @dev Launch timestamp; the promo window is `[startTime, startTime + PROMO_WINDOW)`.
        uint64 startTime;
        /// @dev Promo tokens deposited at launch.
        uint256 total;
        /// @dev Cumulative amount committed to recipients. Never decreases.
        uint256 awarded;
        /// @dev Cumulative amount actually paid out to recipients.
        uint256 claimed;
        /// @dev True once the undistributed remainder went to the Community Pool.
        bool closed;
    }

    /// @dev One tranche of a recipient's promo reward, vesting on its own clock.
    struct Award {
        uint256 total;
        uint256 claimed;
        uint64 startTime;
    }

    /// @dev `PeopleProtocolRegistry`; `tokenFactoryAddress()` is the only trusted depositor.
    address public immutable core;
    /// @dev Destination for promo tokens the creator never awarded.
    ICommunityTokenVault public immutable communityVault;

    mapping(address => Pool) public pools;
    /// @dev token => recipient => award tranches.
    mapping(address => mapping(address => Award[])) private _awards;

    event PromoRegistered(address indexed token, address indexed creator, uint16 promoBps, uint256 amount);
    event PromoAwarded(address indexed token, address indexed recipient, uint256 amount, uint256 awardIndex);
    event PromoClaimed(address indexed token, address indexed recipient, uint256 amount);
    event PromoUnusedReturned(address indexed token, uint256 amount);

    error Unauthorized();
    error AlreadyRegistered();
    error UnknownToken();
    error ZeroAmount();
    error InvalidRecipient();
    error PromoWindowClosed();
    error PromoWindowOpen();
    error InsufficientPool();
    error RecipientCapExceeded();
    error TooManyAwards();
    error NothingToClaim();
    error AlreadyReturned();
    error ZeroCommunityVault();

    constructor(address core_, ICommunityTokenVault communityVault_) {
        if (address(communityVault_) == address(0)) revert ZeroCommunityVault();
        core = core_;
        communityVault = communityVault_;
    }

    /// @dev Same registry-staticcall gate as `CreatorVesting` / `CommunityTokenVault`.
    modifier onlyFactory() {
        (bool ok, bytes memory data) = core.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        if (!ok || msg.sender != abi.decode(data, (address))) revert Unauthorized();
        _;
    }

    /// @notice Called by `TokenFactory` in the launch transaction, after it transferred `amount`
    /// promo tokens here. Only reached when the creator chose a non-zero promo share.
    function register(address token, address creator, uint16 promoBps, uint256 amount) external onlyFactory {
        if (pools[token].total != 0) revert AlreadyRegistered();
        if (amount == 0) revert ZeroAmount();
        if (creator == address(0)) revert InvalidRecipient();
        pools[token] = Pool({
            creator: creator,
            promoBps: promoBps,
            startTime: uint64(block.timestamp),
            total: amount,
            awarded: 0,
            claimed: 0,
            closed: false
        });
        emit PromoRegistered(token, creator, promoBps, amount);
    }

    /// @notice Timestamp after which no further awards are possible and `returnUnused` opens.
    function promoDeadline(address token) public view returns (uint256) {
        Pool storage p = pools[token];
        if (p.total == 0) revert UnknownToken();
        return uint256(p.startTime) + PeopleConstants.PROMO_WINDOW;
    }

    /// @notice Promo tokens the creator may still hand out.
    function undistributed(address token) public view returns (uint256) {
        Pool storage p = pools[token];
        if (p.closed) return 0;
        return p.total - p.awarded;
    }

    /// @notice Cumulative amount awarded to `recipient`, vested or not.
    function awardedTo(address token, address recipient) public view returns (uint256 amount) {
        Award[] storage list = _awards[token][recipient];
        for (uint256 i = 0; i < list.length; i++) {
            amount += list[i].total;
        }
    }

    /// @notice The per-recipient anti-abuse cap for this pool, in tokens.
    function recipientCap(address token) public view returns (uint256) {
        Pool storage p = pools[token];
        if (p.total == 0) revert UnknownToken();
        return (p.total * PeopleConstants.PROMO_RECIPIENT_CAP_BPS) / 10_000;
    }

    function awardCount(address token, address recipient) external view returns (uint256) {
        return _awards[token][recipient].length;
    }

    function awardAt(address token, address recipient, uint256 index) external view returns (Award memory) {
        return _awards[token][recipient][index];
    }

    /// @notice Creator hands `amount` promo tokens to a referrer or partner. The tokens stay in
    /// this vault and the recipient claims them as they vest.
    function award(address token, address recipient, uint256 amount) external {
        Pool storage p = pools[token];
        if (p.total == 0) revert UnknownToken();
        if (msg.sender != p.creator) revert Unauthorized();
        if (block.timestamp >= uint256(p.startTime) + PeopleConstants.PROMO_WINDOW) revert PromoWindowClosed();
        if (p.closed) revert AlreadyReturned();
        if (amount == 0) revert ZeroAmount();
        // Anti-abuse: the creator must not be able to route promo tokens back to themselves, and
        // the token / this vault are not payable destinations.
        if (
            recipient == address(0) || recipient == p.creator || recipient == token || recipient == address(this)
                || recipient == address(communityVault)
        ) {
            revert InvalidRecipient();
        }
        if (amount > p.total - p.awarded) revert InsufficientPool();

        Award[] storage list = _awards[token][recipient];
        if (list.length >= PeopleConstants.PROMO_MAX_AWARDS_PER_RECIPIENT) revert TooManyAwards();
        if (awardedTo(token, recipient) + amount > recipientCap(token)) revert RecipientCapExceeded();

        p.awarded += amount;
        list.push(Award({total: amount, claimed: 0, startTime: uint64(block.timestamp)}));
        emit PromoAwarded(token, recipient, amount, list.length - 1);
    }

    /// @notice Vested portion of `recipient`'s promo awards: `PROMO_UPFRONT_PERCENT` of each
    /// award unlocked at award time, the remainder linear over `VESTING_DURATION`.
    function vestedOf(address token, address recipient) public view returns (uint256 vested) {
        Award[] storage list = _awards[token][recipient];
        for (uint256 i = 0; i < list.length; i++) {
            vested += _vested(list[i]);
        }
    }

    /// @notice Vested but not yet claimed.
    function claimableOf(address token, address recipient) external view returns (uint256) {
        return vestedOf(token, recipient) - _claimedOf(token, recipient);
    }

    /// @notice Recipient withdraws everything that has vested so far.
    function claim(address token) external returns (uint256 amount) {
        Pool storage p = pools[token];
        if (p.total == 0) revert UnknownToken();
        Award[] storage list = _awards[token][msg.sender];
        for (uint256 i = 0; i < list.length; i++) {
            Award storage g = list[i];
            uint256 vested = _vested(g);
            if (vested > g.claimed) {
                amount += vested - g.claimed;
                g.claimed = vested;
            }
        }
        if (amount == 0) revert NothingToClaim();
        p.claimed += amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit PromoClaimed(token, msg.sender, amount);
    }

    /// @notice After the 180-day promo window, every promo token the creator never awarded goes
    /// to the token's Community Pool allocation. Permissionless — nobody can sit on the
    /// remainder, and the creator gets nothing back. Already-awarded tokens stay claimable by
    /// their recipients on their own vesting schedules and are untouched by this call.
    function returnUnused(address token) external returns (uint256 amount) {
        Pool storage p = pools[token];
        if (p.total == 0) revert UnknownToken();
        if (block.timestamp < uint256(p.startTime) + PeopleConstants.PROMO_WINDOW) revert PromoWindowOpen();
        if (p.closed) revert AlreadyReturned();
        amount = p.total - p.awarded;
        p.closed = true;
        if (amount == 0) {
            emit PromoUnusedReturned(token, 0);
            return 0;
        }
        // CEI: pool marked closed before the external calls.
        IERC20(token).safeTransfer(address(communityVault), amount);
        communityVault.creditPromoReturn(token, amount);
        emit PromoUnusedReturned(token, amount);
    }

    function _vested(Award storage g) private view returns (uint256) {
        uint256 upfront = (g.total * PeopleConstants.PROMO_UPFRONT_PERCENT) / 100;
        uint256 elapsed = block.timestamp - g.startTime;
        if (elapsed >= PeopleConstants.VESTING_DURATION) return g.total;
        return upfront + ((g.total - upfront) * elapsed) / PeopleConstants.VESTING_DURATION;
    }

    function _claimedOf(address token, address recipient) private view returns (uint256 claimed) {
        Award[] storage list = _awards[token][recipient];
        for (uint256 i = 0; i < list.length; i++) {
            claimed += list[i].claimed;
        }
    }
}
