// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {ICreatorVesting} from "../interfaces/ICreatorVesting.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";

contract CreatorVesting is ICreatorVesting {
    using SafeERC20 for IERC20;

    event VestingRegistered(address indexed token, address indexed creator, uint256 total, uint256 upfront);
    event VestingClaimed(address indexed token, address indexed creator, uint256 amount);

    address public immutable core;

    struct Schedule {
        address creator;
        uint256 totalAllocation;
        uint256 upfrontUnlocked;
        uint256 claimed;
        uint256 startTime;
    }

    mapping(address => Schedule) public schedules;

    error Unauthorized();
    error NothingToClaim();
    /// @notice A schedule for this token already exists; `register` never overwrites one.
    error AlreadyRegistered();

    constructor(address core_) {
        core = core_;
    }

    modifier onlyFactory() {
        (bool ok, bytes memory data) = core.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        if (!ok || msg.sender != abi.decode(data, (address))) revert Unauthorized();
        _;
    }

    function register(address token, address creator, uint256 totalAllocation, uint256 upfrontUnlocked) external onlyFactory {
        // `startTime` is always non-zero once registered (even when `creator` is zero), so a
        // swapped-in factory cannot reset `claimed`/`startTime` or reassign `creator`.
        if (schedules[token].startTime != 0) revert AlreadyRegistered();
        schedules[token] = Schedule({
            creator: creator,
            totalAllocation: totalAllocation,
            upfrontUnlocked: upfrontUnlocked,
            claimed: upfrontUnlocked,
            startTime: block.timestamp
        });
        emit VestingRegistered(token, creator, totalAllocation, upfrontUnlocked);
    }

    function vestedAmount(address token) public view returns (uint256) {
        Schedule memory s = schedules[token];
        if (s.totalAllocation == 0) return 0;
        uint256 elapsed = block.timestamp - s.startTime;
        if (elapsed >= PeopleConstants.VESTING_DURATION) {
            return s.totalAllocation;
        }
        uint256 vestingPart = s.totalAllocation - s.upfrontUnlocked;
        return s.upfrontUnlocked + (vestingPart * elapsed) / PeopleConstants.VESTING_DURATION;
    }

    function claim(address token) external {
        Schedule storage s = schedules[token];
        if (msg.sender != s.creator) revert Unauthorized();
        uint256 vested = vestedAmount(token);
        uint256 amount = vested - s.claimed;
        if (amount == 0) revert NothingToClaim();
        s.claimed = vested;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit VestingClaimed(token, msg.sender, amount);
    }
}

contract CommunityTokenVault is ICommunityTokenVault, Ownable {
    using SafeERC20 for IERC20;

    event CommunityRegistered(address indexed token, uint256 amount);
    event CommunityDeposited(address indexed token, address indexed from, uint256 amount);
    event CommunityWithdrawn(address indexed token, address indexed to, uint256 amount);
    event RecipientAllowed(address indexed recipient, bool allowed);
    event LegacyPromoVaultAllowed(address indexed vault, bool allowed);

    address public immutable core;
    mapping(address => uint256) public balances;

    /// @notice H-01: `withdraw`'s `to` must be on this allow-list, set only by `owner()`
    /// (the `PeopleTimelock`, behind its 2-day delay — see `Deploy.s.sol`). Without this, an
    /// unrestricted `to` let two keys sweep 10% of every launched token to an arbitrary EOA
    /// within one block.
    mapping(address => bool) public allowedRecipient;

    /// @notice Promo vaults the factory no longer points at but which may still credit returned
    /// promo tokens here. Owner-only, see `setLegacyPromoVault`.
    mapping(address => bool) public legacyPromoVault;

    error Unauthorized();
    error InsufficientBalance();
    error RecipientNotAllowed(address to);
    error CreditExceedsHoldings();

    event CommunityPromoReturned(address indexed token, uint256 amount);

    constructor(address core_, address initialOwner_) Ownable(initialOwner_) {
        core = core_;
    }

    function register(address token, uint256 amount) external {
        if (msg.sender != _tokenFactory()) revert Unauthorized();
        balances[token] = amount;
        emit CommunityRegistered(token, amount);
    }

    /// @notice Re-authorizes a `PromoRewardsVault` the factory has since rotated away from, so
    /// promo pools registered in it can still return their unawarded remainder here instead of
    /// being stranded. Owner-only — the `PeopleTimelock`, behind its 2-day delay, same gate as
    /// `setRecipientAllowed`. Granting this is not a spending power: a credit still has to be
    /// backed by tokens actually transferred in (see `creditPromoReturn`).
    function setLegacyPromoVault(address vault, bool allowed) external onlyOwner {
        legacyPromoVault[vault] = allowed;
        emit LegacyPromoVaultAllowed(vault, allowed);
    }

    /// @notice Credits promo tokens the creator never handed out (owner decision 2026-10-13) to
    /// this token's Community Pool allocation, after `PromoRewardsVault` transferred them in.
    /// @dev Callable by the `PromoRewardsVault` the factory is currently wired to — resolved live
    /// through the registry, so there is no second copy of that address to keep in sync — or by
    /// one the owner re-authorized via `setLegacyPromoVault` after a rotation. The credit is
    /// bounded by tokens actually held, so neither a buggy vault nor a stale one can inflate
    /// `balances` beyond what `withdraw` can really pay out.
    function creditPromoReturn(address token, uint256 amount) external {
        address current = _promoVault();
        if (msg.sender != current && !legacyPromoVault[msg.sender]) revert Unauthorized();
        if (balances[token] + amount > IERC20(token).balanceOf(address(this))) revert CreditExceedsHoldings();
        balances[token] += amount;
        emit CommunityPromoReturned(token, amount);
    }

    function _tokenFactory() private view returns (address) {
        (bool ok, bytes memory data) = core.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        if (!ok || data.length != 32) revert Unauthorized();
        return abi.decode(data, (address));
    }

    /// @dev `address(0)` when the registry's factory exposes no promo vault (or none is set yet),
    /// rather than a revert, so the `setLegacyPromoVault` path stays usable either way. The
    /// caller must never treat `address(0)` as authorized.
    function _promoVault() private view returns (address) {
        (bool ok, bytes memory data) = _tokenFactory().staticcall(abi.encodeWithSignature("promoVault()"));
        if (!ok || data.length != 32) return address(0);
        return abi.decode(data, (address));
    }

    /// @notice Add tokens to a token's community pool (e.g. unsold curve tokens after
    /// `BondingCurveMarket.finalize`). Pulls exactly `amount` from the caller, so the balance only
    /// grows by tokens the vault really received. Permissionless: it can only add, never take.
    function deposit(address token, uint256 amount) external {
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        balances[token] += received;
        emit CommunityDeposited(token, msg.sender, received);
    }

    /// @notice H-01: only `owner()` may grow the set of addresses `withdraw` may send to.
    function setRecipientAllowed(address recipient, bool allowed) external onlyOwner {
        allowedRecipient[recipient] = allowed;
        emit RecipientAllowed(recipient, allowed);
    }

    /// @notice M07-4/H-01: withdraw from a per-token community allocation. Gated to `owner()`
    /// — the `PeopleTimelock`, so every withdrawal carries the timelock's 2-day delay — and
    /// `to` must be on the `allowedRecipient` allow-list, itself only settable by `owner()`.
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (!allowedRecipient[to]) revert RecipientNotAllowed(to);
        if (amount > balances[token]) revert InsufficientBalance();
        balances[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit CommunityWithdrawn(token, to, amount);
    }
}
