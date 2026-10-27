// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PplLiquidityEscrow
/// @notice Immutable `liquidityReceiver` of PplCurveHubV2. Holds the released reserve until the owner
/// publicly announces an LP-seeding / bridge CONTRACT; after NOTICE anyone may execute the transfer.
/// The only path that moves USDC is `execute()` to the announced destination. No rescue, no renounce.
contract PplLiquidityEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Public notice period between `announce` and `execute`.
    uint256 public constant NOTICE = 30 days;

    IERC20 public immutable usdc;
    address public immutable treasury;

    /// @notice Pending release (zero destination = none).
    address public pendingDestination;
    bytes32 public pendingPlanHash;
    uint64 public announcedAt;

    event ReleaseAnnounced(address indexed destination, bytes32 planHash, uint256 executableAt);
    event ReleaseCancelled(address indexed destination, bytes32 planHash);
    event Released(address indexed destination, uint256 amount);

    error ZeroAddress();
    error BadDestination();
    error ReleasePending();
    error NoPendingRelease();
    error NoticeNotElapsed();
    error RenounceDisabled();

    constructor(IERC20 usdc_, address owner_, address treasury_) Ownable(owner_) {
        if (address(usdc_) == address(0) || owner_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
        treasury = treasury_;
    }

    /// @notice Announce the destination (must be a contract, never owner/treasury/EOA). One pending at a time.
    function announce(address destination, bytes32 planHash) external onlyOwner {
        if (pendingDestination != address(0)) revert ReleasePending();
        if (destination == address(0) || destination == owner() || destination == treasury || destination.code.length == 0)
        {
            revert BadDestination();
        }
        pendingDestination = destination;
        pendingPlanHash = planHash;
        announcedAt = uint64(block.timestamp);
        emit ReleaseAnnounced(destination, planHash, block.timestamp + NOTICE);
    }

    /// @notice Cancel the pending release.
    function cancel() external onlyOwner {
        address d = pendingDestination;
        if (d == address(0)) revert NoPendingRelease();
        bytes32 h = pendingPlanHash;
        _clear();
        emit ReleaseCancelled(d, h);
    }

    /// @notice Permissionless after NOTICE: sends the full USDC balance to the announced destination.
    function execute() external nonReentrant {
        address d = pendingDestination;
        if (d == address(0)) revert NoPendingRelease();
        if (block.timestamp < uint256(announcedAt) + NOTICE) revert NoticeNotElapsed();
        // owner may have changed since the announcement
        if (d == owner() || d == treasury) revert BadDestination();
        _clear();
        uint256 amount = usdc.balanceOf(address(this));
        if (amount != 0) usdc.safeTransfer(d, amount);
        emit Released(d, amount);
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function _clear() private {
        pendingDestination = address(0);
        pendingPlanHash = bytes32(0);
        announcedAt = 0;
    }
}
