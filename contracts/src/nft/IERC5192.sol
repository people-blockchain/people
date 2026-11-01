// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC5192 - Minimal Soulbound NFTs
/// @notice ERC-165 interface id of this interface is `0xb45a3c0e` (only `locked` counts; events do not).
interface IERC5192 {
    /// @notice Emitted when the locking status of `tokenId` is set to locked.
    event Locked(uint256 tokenId);

    /// @notice Emitted when the locking status of `tokenId` is set to unlocked.
    event Unlocked(uint256 tokenId);

    /// @notice Returns the locking status of an NFT.
    /// @dev Reverts if `tokenId` does not exist.
    function locked(uint256 tokenId) external view returns (bool);
}
