// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SampleCrowdfund
/// @notice Educational all-or-nothing crowdfunding contract. NOT part of the People's
/// Blockchain protocol — standalone teaching contract for the sample contract templates
/// explorer.
///
/// Contributors fund in either native PPL or an ERC20 (e.g. a testnet stablecoin) chosen at
/// deployment via `token_` (address(0) = native PPL). Native contributions use the payable
/// `contribute()`; ERC20 contributions use `contribute(uint256 amount)` after `approve`ing
/// this contract. If the goal is met by the deadline, the owner can claim the full balance
/// (in whichever asset was used); otherwise every contributor can pull back exactly what
/// they put in, in the same asset.
contract SampleCrowdfund {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable token;
    uint256 public immutable goal;
    uint256 public immutable deadline;
    uint256 public totalRaised;
    bool public claimed;

    mapping(address => uint256) public contributions;

    event Contributed(address indexed from, uint256 amount);
    event Claimed(uint256 amount);
    event Refunded(address indexed to, uint256 amount);

    error ZeroGoal();
    error ZeroDuration();
    error NotOwner();
    error TooEarly();
    error GoalNotMet();
    error GoalWasMet();
    error AlreadyClaimed();
    error FundingClosed();
    error ZeroContribution();
    error NothingToRefund();
    error NativeValueNotAccepted();
    error WrongContributeFunction();

    constructor(uint256 goal_, uint256 durationSeconds_, address token_) {
        if (goal_ == 0) revert ZeroGoal();
        if (durationSeconds_ == 0) revert ZeroDuration();
        owner = msg.sender;
        token = token_;
        goal = goal_;
        deadline = block.timestamp + durationSeconds_;
    }

    /// @notice Native-PPL contribution path. Reverts in ERC20 mode — use
    /// `contribute(uint256)` instead.
    function contribute() external payable {
        if (token != address(0)) revert WrongContributeFunction();
        if (msg.value == 0) revert ZeroContribution();
        _record(msg.sender, msg.value);
    }

    /// @notice ERC20 contribution path: pulls `amount` from the caller, who must have
    /// `approve`d this contract first. Reverts in native mode — use payable `contribute()`
    /// instead.
    function contribute(uint256 amount) external {
        if (token == address(0)) revert WrongContributeFunction();
        if (amount == 0) revert ZeroContribution();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _record(msg.sender, amount);
    }

    function _record(address from, uint256 amount) internal {
        if (block.timestamp >= deadline) revert FundingClosed();
        contributions[from] += amount;
        totalRaised += amount;
        emit Contributed(from, amount);
    }

    /// @notice Owner withdraws the full balance once the goal has been met and the
    /// campaign window has closed. One-time claim, guarded by `claimed`.
    function claim() external {
        if (msg.sender != owner) revert NotOwner();
        if (block.timestamp < deadline) revert TooEarly();
        if (totalRaised < goal) revert GoalNotMet();
        if (claimed) revert AlreadyClaimed();
        // Effects before interaction: mark claimed before the external call.
        claimed = true;
        uint256 amount = totalRaised;
        _payOut(owner, amount);
        emit Claimed(amount);
    }

    /// @notice Contributors reclaim their own stake once the campaign has closed without
    /// hitting the goal. Checks-effects-interactions: contribution is zeroed before the
    /// external call so reentrancy can't drain more than what was put in.
    function refund() external {
        if (block.timestamp < deadline) revert TooEarly();
        if (totalRaised >= goal) revert GoalWasMet();
        uint256 amount = contributions[msg.sender];
        if (amount == 0) revert NothingToRefund();
        contributions[msg.sender] = 0;
        _payOut(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    function _payOut(address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
