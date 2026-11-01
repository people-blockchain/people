// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LiquidityLock
/// @notice Holds the liquidity built from the PplCurveHubV2 reserve, locked ENTIRELY until
/// `unlockTime` (at least 730 days after deploy). No partial unlock, no cliff, no linear release.
///
/// LP type: `PeoplePair` (src/amm) is a Uniswap-V2-style pair whose LP share is an ERC-20, so
/// `release(token)` covers it. Concentrated-liquidity DEXes a Base pool could use instead issue an
/// ERC-721 position, so `releaseNft` and `onERC721Received` cover that case too.
///
/// Fully immutable by construction: `beneficiary` and `unlockTime` are immutables set once in the
/// constructor. There is no owner, admin, setter, upgrade path, emergency withdraw, extension or
/// shortening, no `delegatecall` and no `selfdestruct`. The only state-changing entry points are
/// `release`, `releaseNft` and `onERC721Received` (which only accepts the NFT).
contract LiquidityLock is IERC721Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Minimum lock length enforced at deploy: 24 months.
    uint256 public constant MIN_LOCK = 730 days;

    /// @notice The only address that can take the liquidity out, and only after `unlockTime`.
    address public immutable beneficiary;
    /// @notice Unix time from which `release` / `releaseNft` work. Cannot change.
    uint256 public immutable unlockTime;

    event Locked(address indexed beneficiary, uint256 unlockTime);
    event Released(address indexed token, address indexed to, uint256 amount);
    event NftReceived(address indexed token, uint256 indexed tokenId, address indexed from);
    event NftReleased(address indexed token, uint256 indexed tokenId, address indexed to);

    error ZeroBeneficiary();
    error LockTooShort(uint256 unlockTime, uint256 minUnlockTime);
    error NotBeneficiary();
    error StillLocked(uint256 unlockTime);
    error NothingToRelease();

    constructor(address beneficiary_, uint256 unlockTime_) {
        if (beneficiary_ == address(0)) revert ZeroBeneficiary();
        uint256 minUnlock = block.timestamp + MIN_LOCK;
        if (unlockTime_ < minUnlock) revert LockTooShort(unlockTime_, minUnlock);
        beneficiary = beneficiary_;
        unlockTime = unlockTime_;
        emit Locked(beneficiary_, unlockTime_);
    }

    modifier onlyUnlockedBeneficiary() {
        if (msg.sender != beneficiary) revert NotBeneficiary();
        if (block.timestamp < unlockTime) revert StillLocked(unlockTime);
        _;
    }

    /// @notice Balance of an ERC-20 (LP or any token sent here) held by the lock.
    function lockedBalance(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice After `unlockTime`, send the whole balance of `token` to `beneficiary`.
    /// @dev The whole current balance is sent, so fee-on-transfer or rebasing tokens cannot
    /// leave a stuck accounting remainder: there is no accounting to drift.
    function release(IERC20 token) external nonReentrant onlyUnlockedBeneficiary returns (uint256 amount) {
        amount = token.balanceOf(address(this));
        if (amount == 0) revert NothingToRelease();
        token.safeTransfer(beneficiary, amount);
        emit Released(address(token), beneficiary, amount);
    }

    /// @notice After `unlockTime`, send ERC-721 position `tokenId` of `token` to `beneficiary`.
    /// @dev Works for NFTs that arrived through `safeTransferFrom` and through plain `transferFrom`.
    function releaseNft(IERC721 token, uint256 tokenId) external nonReentrant onlyUnlockedBeneficiary {
        token.safeTransferFrom(address(this), beneficiary, tokenId);
        emit NftReleased(address(token), tokenId, beneficiary);
    }

    /// @inheritdoc IERC721Receiver
    /// @dev Accepts any ERC-721: anything sent here is only locked longer, never exposed.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        emit NftReceived(msg.sender, tokenId, from);
        return IERC721Receiver.onERC721Received.selector;
    }
}
