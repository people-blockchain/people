// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReserveLiquidityEscrow
/// @notice The `liquidityReceiver` of PplCurveHubV2 (SPEC §5.4). It receives the sale reserve when
/// the hub's 30-day liquidity release executes, and holds it until it can go to PPL liquidity.
///
/// Why an escrow and not a hard-coded destination: the liquidity is PPL/USDC on the PEOPLE network
/// (a `PeoplePair`, LP held by `LiquidityLock`), and no bridge for USDC to the PEOPLE network exists
/// yet. The hub needs this address at deploy, long before the bridge exists, so the final
/// destination (a bridge adapter or LP seeder contract) is set later, by the owner, through a
/// public 30-day notice that anyone can watch on chain.
///
/// What the owner (the 2-of-3 Safe) CAN do: propose a destination contract, cancel a pending
/// proposal, and transfer ownership in two steps.
/// What NOBODY can do: send funds anywhere except the current destination; set a destination
/// without the full `DESTINATION_DELAY` notice; set the owner, the treasury, the escrow itself, or
/// an address without code as destination; withdraw to the owner. There is no upgrade path, no delegatecall,
/// no selfdestruct and no emergency withdraw.
///
/// `release` is permissionless once a destination is active and always sends the whole balance of
/// the given token, so stray tokens follow the reserve and nothing can be cherry-picked.
contract ReserveLiquidityEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Public notice between proposing a destination and it becoming active.
    uint256 public constant DESTINATION_DELAY = 30 days;

    /// @notice The reserve token (USDC on Base). Informational; `release` takes any token.
    IERC20 public immutable usdc;
    /// @notice The sale treasury (Safe). Can never be a destination.
    address public immutable treasury;

    /// @notice Where `release` sends funds. Zero until the first proposal has waited out its notice.
    address public destination;
    /// @notice Proposed destination waiting for its notice to pass (zero if none).
    address public pendingDestination;
    /// @notice When `pendingDestination` can be activated (zero if none).
    uint256 public pendingEta;
    /// @notice Hash of the public write-up for the pending proposal (bridge, recipient, LP lock).
    bytes32 public pendingDescriptionHash;

    event DestinationProposed(address indexed destination, uint256 eta, bytes32 descriptionHash);
    event DestinationCancelled(address indexed destination);
    event DestinationActivated(address indexed destination, bytes32 descriptionHash);
    event Released(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error BadDestination();
    error NoPendingDestination();
    error DestinationTimelocked(uint256 eta);
    error NoDestination();
    error NothingToRelease();
    error RenounceDisabled();

    constructor(IERC20 usdc_, address owner_, address treasury_) Ownable(owner_) {
        if (address(usdc_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
        treasury = treasury_;
    }

    /// @notice Owner proposes `dest`, which can be activated after `DESTINATION_DELAY`. A new
    /// proposal replaces a pending one and restarts the full notice.
    function proposeDestination(address dest, bytes32 descriptionHash) external onlyOwner {
        if (!_destinationAllowed(dest) || dest.code.length == 0) revert BadDestination();
        uint256 eta = block.timestamp + DESTINATION_DELAY;
        pendingDestination = dest;
        pendingEta = eta;
        pendingDescriptionHash = descriptionHash;
        emit DestinationProposed(dest, eta, descriptionHash);
    }

    function cancelDestination() external onlyOwner {
        address dest = pendingDestination;
        if (dest == address(0)) revert NoPendingDestination();
        _clearPending();
        emit DestinationCancelled(dest);
    }

    /// @notice Anyone activates the pending destination once its notice has passed.
    function activateDestination() external {
        address dest = pendingDestination;
        if (dest == address(0)) revert NoPendingDestination();
        if (block.timestamp < pendingEta) revert DestinationTimelocked(pendingEta);
        // Ownership may have moved to `dest` during the notice; the owner must never be the sink.
        if (!_destinationAllowed(dest) || dest == pendingOwner()) revert BadDestination();
        bytes32 h = pendingDescriptionHash;
        destination = dest;
        _clearPending();
        emit DestinationActivated(dest, h);
    }

    /// @notice Anyone sends the whole balance of `token` to the active destination.
    function release(IERC20 token) external nonReentrant returns (uint256 amount) {
        address dest = destination;
        if (dest == address(0)) revert NoDestination();
        amount = token.balanceOf(address(this));
        if (amount == 0) revert NothingToRelease();
        token.safeTransfer(dest, amount);
        emit Released(address(token), dest, amount);
    }

    /// @notice Balance of the reserve token held here.
    function reserveBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @dev Without an owner no destination could ever be set and the reserve would be stuck.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @dev Keeps the owner and the sink separate: ownership cannot move to the active destination.
    function transferOwnership(address newOwner) public override {
        if (newOwner != address(0) && newOwner == destination) revert BadDestination();
        super.transferOwnership(newOwner);
    }

    function _destinationAllowed(address dest) private view returns (bool) {
        return dest != address(0) && dest != address(this) && dest != owner() && dest != treasury;
    }

    function _clearPending() private {
        pendingDestination = address(0);
        pendingEta = 0;
        pendingDescriptionHash = bytes32(0);
    }
}
