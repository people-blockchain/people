// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PplReturnBurn
/// @notice PEOPLE-network side of a `PplCurveHubV2.sellBack`: the seller burns the PPL it sells
/// back here, and the hub's `returnVerifier` signs a `MainnetReturn` attestation only for a
/// `ReturnBurned` event of this contract (owner decision A1: returned PPL are burned, there is no
/// treasury sink).
///
/// Burn = native PPL sent here can never leave: there is no owner, admin, withdraw, setter,
/// `receive`/`fallback`, `delegatecall` or `selfdestruct`. The only state-changing entry point is
/// `burnForReturn`. A return whose attestation expired before the hub consumed it stays burned;
/// the verifier can sign the same `returnId` again with a new deadline (the hub consumes each
/// `returnId` at most once).
///
/// `returnId` commits to the burned amount, the destination hub, the Base seller, the PEOPLE
/// source chain id and the destination chain id (plus this contract and a nonce, so two equal
/// burns still differ). The hub's `MainnetReturn` attestation repeats those fields and checks them.
contract PplReturnBurn {
    /// @notice Total native PPL ever burned here (equals this contract's balance).
    uint256 public totalBurned;
    /// @notice Number of returns burned so far; feeds `returnId`.
    uint256 public returnCount;

    /// @param returnId Unique id the verifier puts into `MainnetReturn.returnId`.
    /// @param from The PEOPLE-network account that burned the PPL.
    /// @param hub The PplCurveHubV2 the PPL are sold back to.
    /// @param personId The person whose lots are sold back.
    /// @param seller The hub-chain address allowed to call `sellBack` for this return.
    /// @param amount Burned PPL (wei) = `MainnetReturn.pplAmount`. Bound into `returnId`.
    /// @param destChainId Hub chain id bound into `returnId`. Signers must match it to their hub.
    event ReturnBurned(
        bytes32 indexed returnId,
        address indexed from,
        address indexed hub,
        bytes32 personId,
        address seller,
        uint256 amount,
        uint256 destChainId
    );

    error ZeroAmount();
    error ZeroAddress();

    /// @notice Burn `msg.value` PPL as a return to `hub` for `personId`, claimable on `destChainId`
    /// by `seller` (the Base address that will call `sellBack` and receive the stablecoin).
    /// @param destChainId Chain id of the hub deployment (Base). Bound into `returnId` with
    /// `block.chainid` (the PEOPLE source chain), `hub`, `seller` and `msg.value`.
    function burnForReturn(address hub, bytes32 personId, address seller, uint256 destChainId)
        external
        payable
        returns (bytes32 returnId)
    {
        if (msg.value == 0) revert ZeroAmount();
        if (hub == address(0) || seller == address(0) || personId == bytes32(0) || destChainId == 0) {
            revert ZeroAddress();
        }
        returnId =
            keccak256(abi.encode(block.chainid, destChainId, hub, seller, msg.value, address(this), returnCount++));
        totalBurned += msg.value;
        emit ReturnBurned(returnId, msg.sender, hub, personId, seller, msg.value, destChainId);
    }
}
