// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title RewardVesting
/// @notice PEOPLE-network custodian for quest/founder rewards (SPEC §5.2). Locked balance cannot
/// be sent to arbitrary contracts; site fees only through an owner whitelist. `PplReturnBurn` and
/// curve hub addresses are permanently forbidden recipients.
contract RewardVesting is Ownable2Step {
    struct Grant {
        uint64 start;
        uint64 duration;
        uint128 total;
        uint128 claimed;
    }

    mapping(address => Grant[]) internal _grants;
    mapping(address => bool) public feeSpendWhitelist;
    mapping(address => bool) public forbiddenRecipient;

    event GrantAdded(address indexed beneficiary, uint256 total, uint64 start, uint64 duration);
    event FeeWhitelistSet(address indexed target, bool allowed);
    event ForbiddenRecipientSet(address indexed target, bool forbidden);
    event Claimed(address indexed beneficiary, address indexed to, uint256 amount);
    event FeeSpent(address indexed beneficiary, address indexed target, uint256 amount);

    error ForbiddenRecipient();
    error NotWhitelisted();
    error InsufficientUnlocked();
    error ZeroAmount();
    error TransferFailed();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Owner marks a contract that may receive unlocked rewards for site fees only.
    function setFeeSpendWhitelist(address target, bool allowed) external onlyOwner {
        if (forbiddenRecipient[target]) revert ForbiddenRecipient();
        feeSpendWhitelist[target] = allowed;
        emit FeeWhitelistSet(target, allowed);
    }

    /// @notice Permanent denylist (e.g. `PplReturnBurn`, Base hub). Clears fee whitelist if set.
    function setForbiddenRecipient(address target, bool forbidden) external onlyOwner {
        forbiddenRecipient[target] = forbidden;
        if (forbidden) feeSpendWhitelist[target] = false;
        emit ForbiddenRecipientSet(target, forbidden);
    }

    /// @notice Fund a linear grant for `beneficiary` (native PPL attached).
    function addGrant(address beneficiary, uint64 start, uint64 duration) external payable onlyOwner {
        if (beneficiary == address(0) || msg.value == 0 || duration == 0) revert ZeroAmount();
        _grants[beneficiary].push(
            Grant({start: start, duration: duration, total: uint128(msg.value), claimed: 0})
        );
        emit GrantAdded(beneficiary, msg.value, start, duration);
    }

    function unlockedOf(address beneficiary) public view returns (uint256 unlocked) {
        Grant[] storage gs = _grants[beneficiary];
        for (uint256 i; i < gs.length; ++i) {
            Grant storage g = gs[i];
            unlocked += _vested(g) - g.claimed;
        }
    }

    /// @notice Send unlocked rewards to the beneficiary wallet (not to forbidden contracts).
    function claim(address payable to, uint256 amount) external {
        _rejectForbidden(to);
        _deduct(msg.sender, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, to, amount);
    }

    /// @notice Pay a whitelisted site-fee contract from unlocked rewards only.
    function spendOnSiteFee(address target, uint256 amount) external {
        if (!feeSpendWhitelist[target]) revert NotWhitelisted();
        _rejectForbidden(target);
        _deduct(msg.sender, amount);
        (bool ok,) = target.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FeeSpent(msg.sender, target, amount);
    }

    function _vested(Grant storage g) internal view returns (uint256) {
        if (block.timestamp < g.start) return 0;
        uint256 elapsed = block.timestamp - g.start;
        if (elapsed >= g.duration) return g.total;
        return (uint256(g.total) * elapsed) / g.duration;
    }

    function _rejectForbidden(address to) internal view {
        if (forbiddenRecipient[to]) revert ForbiddenRecipient();
    }

    function _deduct(address beneficiary, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 left = amount;
        Grant[] storage gs = _grants[beneficiary];
        for (uint256 i; i < gs.length && left != 0; ++i) {
            Grant storage g = gs[i];
            uint256 avail = _vested(g) - g.claimed;
            if (avail == 0) continue;
            uint256 take = avail < left ? avail : left;
            g.claimed += uint128(take);
            left -= take;
        }
        if (left != 0) revert InsufficientUnlocked();
    }

    receive() external payable {}
}
