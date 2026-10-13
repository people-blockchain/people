// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SampleVestingTimelock
/// @notice Educational linear-vesting lockup for native PPL. NOT part of the People's
/// Blockchain protocol — standalone teaching contract for the sample contract templates
/// explorer.
///
/// The full deposit (`msg.value` at deployment) vests linearly from `start` to
/// `start + duration`. Anyone may call `release()`; the payout always goes to the fixed
/// `beneficiary`, so there's no incentive issue in letting any caller trigger it (e.g. a
/// keeper bot on the beneficiary's behalf).
contract SampleVestingTimelock {
    address public immutable beneficiary;
    uint256 public immutable start;
    uint256 public immutable duration;
    uint256 public immutable total;
    uint256 public released;

    event Released(uint256 amount);

    error ZeroDuration();
    error ZeroBeneficiary();
    error NothingToRelease();

    constructor(address beneficiary_, uint256 start_, uint256 duration_) payable {
        if (duration_ == 0) revert ZeroDuration();
        if (beneficiary_ == address(0)) revert ZeroBeneficiary();
        beneficiary = beneficiary_;
        start = start_;
        duration = duration_;
        total = msg.value;
    }

    /// @notice Amount vested as of `timestamp`: 0 before start, linear ramp during the
    /// vesting window, full `total` once the window has elapsed.
    function vestedAmount(uint256 timestamp) public view returns (uint256) {
        if (timestamp < start) return 0;
        uint256 elapsed = timestamp - start;
        if (elapsed >= duration) return total;
        // Linear interpolation: safe from overflow since total and elapsed are both
        // bounded well under 2^128 in any realistic deployment, and duration > 0 is
        // enforced in the constructor.
        return (total * elapsed) / duration;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount(block.timestamp) - released;
    }

    /// @notice Pays out whatever has vested since the last release. Open to any caller —
    /// funds always flow to the immutable `beneficiary`.
    function release() external {
        uint256 amount = releasable();
        if (amount == 0) revert NothingToRelease();
        // Effects before interaction to block reentrancy from inflating the payout.
        released += amount;
        (bool ok,) = beneficiary.call{value: amount}("");
        require(ok, "transfer failed");
        emit Released(amount);
    }
}
