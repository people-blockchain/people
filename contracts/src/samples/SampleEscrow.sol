// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SampleEscrow
/// @notice Educational two-party escrow with a neutral arbiter. NOT part of the People's
/// Blockchain protocol — this is a standalone teaching contract shown in the sample
/// contract templates explorer.
///
/// Flow: the deployer is the buyer. Settles in either native PPL or an ERC20 (e.g. a
/// testnet stablecoin) chosen at deployment via `token_` (address(0) = native PPL). Native
/// deposits happen at construction (`msg.value`); ERC20 deposits happen via a separate
/// `deposit()` call after the buyer `approve`s this contract for `amount_`, since an ERC20
/// transfer can't be pulled before the contract address exists. The arbiter can release
/// funds to the seller or refund the buyer at any time once deposited; the buyer can also
/// unilaterally release to the seller (e.g. once satisfied with delivery), but the buyer
/// cannot refund themself — only the arbiter can do that, since that's the dispute-resolution role.
contract SampleEscrow {
    using SafeERC20 for IERC20;

    address public immutable buyer;
    address public immutable seller;
    address public immutable arbiter;
    address public immutable token;
    uint256 public immutable amount;
    bool public deposited;
    bool public settled;

    event Deposited(address from, uint256 amount);
    event Released(address to, uint256 amount);
    event Refunded(address to, uint256 amount);

    error NotAuthorized();
    error AlreadySettled();
    error ZeroDeposit();
    error NativeValueNotAccepted();
    error AlreadyDeposited();
    error NotDeposited();

    /// @param token_ address(0) for native PPL (deposited via `msg.value` at construction),
    /// or an ERC20 token address (deposited via `deposit()` after `approve`).
    /// @param amount_ ignored in native mode (amount is `msg.value`); the ERC20 amount to
    /// pull in `deposit()` otherwise.
    constructor(address seller_, address arbiter_, address token_, uint256 amount_) payable {
        buyer = msg.sender;
        seller = seller_;
        arbiter = arbiter_;
        token = token_;
        if (token_ == address(0)) {
            if (msg.value == 0) revert ZeroDeposit();
            amount = msg.value;
            deposited = true;
        } else {
            if (msg.value != 0) revert NativeValueNotAccepted();
            if (amount_ == 0) revert ZeroDeposit();
            amount = amount_;
        }
    }

    /// @notice ERC20 mode only: pulls `amount` from the buyer, who must have `approve`d
    /// this contract first. No-op path for native mode, which deposits at construction.
    function deposit() external {
        if (token == address(0)) revert NativeValueNotAccepted();
        if (msg.sender != buyer) revert NotAuthorized();
        if (deposited) revert AlreadyDeposited();
        deposited = true;
        IERC20(token).safeTransferFrom(buyer, address(this), amount);
        emit Deposited(buyer, amount);
    }

    /// @notice Pays the deposit to the seller. Callable by the arbiter (dispute resolution
    /// in the seller's favor) or by the buyer directly (happy path: buyer is satisfied).
    function release() external {
        if (msg.sender != buyer && msg.sender != arbiter) revert NotAuthorized();
        if (!deposited) revert NotDeposited();
        if (settled) revert AlreadySettled();
        // Effects before interaction: prevents any reentrancy from re-triggering a payout.
        settled = true;
        _payOut(seller);
        emit Released(seller, amount);
    }

    /// @notice Returns the deposit to the buyer. Only the arbiter may do this — it is the
    /// dispute-resolution path when the arbiter decides in the buyer's favor.
    function refund() external {
        if (msg.sender != arbiter) revert NotAuthorized();
        if (!deposited) revert NotDeposited();
        if (settled) revert AlreadySettled();
        settled = true;
        _payOut(buyer);
        emit Refunded(buyer, amount);
    }

    function _payOut(address to) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
