// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPplReturnBurnCredit {
    function creditHubPurchase(address account, uint256 amount) external;
}

/// @title PplSaleDistributor
/// @notice PEOPLE-mainnet side of a `PplCurveHubV2.buy` on Base. It holds the native PPL set aside
/// for the sale and pays each Base purchase out exactly once.
///
/// Flow: a buyer pays USDC to the hub on Base, which emits `Bought(..., recipient, ..., pplOut, ...)`.
/// The delivery relayer waits for that Base block to be safe, then calls `deliver` here with
/// `purchaseId = keccak256(abi.encode(baseChainId, hub, txHash, logIndex))`. In one transaction this
/// contract marks the purchase as delivered, credits it in `PplReturnBurn.hubPurchasedPpl` (so it can
/// be sold back later), and sends the PPL to `recipient`, the same address the buyer used on Base.
///
/// Safety properties:
/// - A purchase id can be paid only once, enforced here on chain. A relayer restart, a rescan or a
///   second relayer cannot double-pay.
/// - Only `relayer` can deliver. Replacing it takes the 48-hour timelock used by the other sale
///   contracts; the owner (the 2-of-3 Safe) can `pause` at once if the relayer key is suspected.
/// - The total the relayer can deliver per period is capped by `PplReturnBurn`'s reporter credit cap:
///   `creditHubPurchase` reverts above the cap and the whole delivery reverts with it.
/// - PPL can leave only to a buyer through `deliver`/`claim`, or to the immutable `communityPool`
///   (unsold supply). There is no owner withdraw to any other address, no upgrade, no delegatecall.
/// - If sending PPL to `recipient` fails (a contract that rejects native PPL), the amount is kept as
///   `owed[recipient]` and the recipient can `claim` it to any address it chooses.
/// - Returned PPL from `PplReturnBurn.burnForReturn` arrive through `receive` and can be delivered
///   to later buyers (the hub lowers `soldPpl` on `sellBack`, so they count as unsold again).
///
/// What still has to be trusted: this contract cannot see Base, so it trusts the relayer to report
/// only real `Bought` events. A stolen relayer key could deliver up to the reporter credit cap per
/// period to addresses of its choice before the Safe pauses. Keep that cap close to real daily volume
/// and run the relayer's alerting.
contract PplSaleDistributor is Ownable, ReentrancyGuard {
    uint256 public constant ADMIN_TIMELOCK = 48 hours;
    uint256 public constant GRACE_PERIOD = 14 days;

    /// @notice PplReturnBurn on this chain; this contract must be its `purchaseReporter`.
    IPplReturnBurnCredit public immutable returnBurn;
    /// @notice Chain id of the Base deployment whose purchases are paid here (8453 on mainnet).
    uint256 public immutable baseChainId;
    /// @notice The PplCurveHubV2 on Base whose `Bought` events are paid here.
    address public immutable baseHub;
    /// @notice Where unsold PPL go. Cannot change.
    address public immutable communityPool;

    address public relayer;
    bool public paused;
    uint256 public totalDelivered;
    mapping(bytes32 => bool) public delivered;
    /// @notice PPL that could not be sent to a recipient; the recipient can `claim` them.
    mapping(address => uint256) public owed;
    uint256 public totalOwed;

    address public pendingRelayer;
    uint64 public pendingRelayerEta;

    event Delivered(bytes32 indexed purchaseId, address indexed recipient, uint256 amount, bool sent);
    event Claimed(address indexed recipient, address indexed to, uint256 amount);
    event RelayerQueued(address indexed relayer, uint256 eta);
    event RelayerQueueCancelled(address indexed relayer);
    event RelayerSet(address indexed previous, address indexed current);
    event Paused(bool paused);
    event SentToCommunityPool(uint256 amount);
    event Received(address indexed from, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error NotRelayer();
    error IsPaused();
    error AlreadyDelivered();
    error InsufficientPpl();
    error NotQueued();
    error Timelocked();
    error OpExpired();
    error TransferFailed();
    error RenounceDisabled();

    constructor(
        address owner_,
        address relayer_,
        IPplReturnBurnCredit returnBurn_,
        uint256 baseChainId_,
        address baseHub_,
        address communityPool_
    ) Ownable(owner_) {
        if (
            relayer_ == address(0) || address(returnBurn_) == address(0) || baseHub_ == address(0)
                || communityPool_ == address(0) || communityPool_ == address(this)
        ) revert ZeroAddress();
        if (baseChainId_ == 0) revert ZeroAmount();
        relayer = relayer_;
        returnBurn = returnBurn_;
        baseChainId = baseChainId_;
        baseHub = baseHub_;
        communityPool = communityPool_;
        emit RelayerSet(address(0), relayer_);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice PPL available for new deliveries (balance minus what is owed to recipients).
    function available() public view returns (uint256) {
        return address(this).balance - totalOwed;
    }

    /// @notice The id the relayer must use for a Base `Bought` log.
    function purchaseIdOf(bytes32 baseTxHash, uint256 logIndex) external view returns (bytes32) {
        return keccak256(abi.encode(baseChainId, baseHub, baseTxHash, logIndex));
    }

    /// @notice Pay one Base purchase: mark it, credit it for sell-back, send the PPL.
    function deliver(bytes32 purchaseId, address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != relayer) revert NotRelayer();
        if (paused) revert IsPaused();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (delivered[purchaseId]) revert AlreadyDelivered();
        if (amount > available()) revert InsufficientPpl();
        delivered[purchaseId] = true;
        totalDelivered += amount;
        returnBurn.creditHubPurchase(recipient, amount);
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) {
            owed[recipient] += amount;
            totalOwed += amount;
        }
        emit Delivered(purchaseId, recipient, amount, sent);
    }

    /// @notice A recipient whose delivery could not be sent takes its PPL to `to`.
    function claim(address payable to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert ZeroAmount();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, to, amount);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function queueSetRelayer(address relayer_) external onlyOwner {
        if (relayer_ == address(0)) revert ZeroAddress();
        pendingRelayer = relayer_;
        pendingRelayerEta = uint64(block.timestamp + ADMIN_TIMELOCK);
        emit RelayerQueued(relayer_, pendingRelayerEta);
    }

    function cancelSetRelayer() external onlyOwner {
        address p = pendingRelayer;
        if (pendingRelayerEta == 0) revert NotQueued();
        pendingRelayer = address(0);
        pendingRelayerEta = 0;
        emit RelayerQueueCancelled(p);
    }

    function executeSetRelayer() external onlyOwner {
        uint256 eta = pendingRelayerEta;
        if (eta == 0) revert NotQueued();
        if (block.timestamp < eta) revert Timelocked();
        if (block.timestamp > eta + GRACE_PERIOD) revert OpExpired();
        emit RelayerSet(relayer, pendingRelayer);
        relayer = pendingRelayer;
        pendingRelayer = address(0);
        pendingRelayerEta = 0;
    }

    /// @notice Unsold PPL may only go to the immutable community pool.
    function sendToCommunityPool(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > available()) revert InsufficientPpl();
        (bool ok,) = communityPool.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit SentToCommunityPool(amount);
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
