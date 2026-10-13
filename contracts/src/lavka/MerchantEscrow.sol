// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Prepaid merchant commitments in native PPL. PII and chat stay off-chain.
contract MerchantEscrow is Ownable, ReentrancyGuard {
    enum Status {
        Locked,
        Released,
        Refunded,
        Disputed,
        Split
    }

    struct Escrow {
        address merchant;
        address customer;
        uint256 amount;
        uint64 deadline;
        Status status;
        bytes32 termsHash;
        uint64 disputeDeadline;
    }

    event EscrowCreated(uint256 indexed escrowId, address indexed merchant, address indexed customer, uint256 amount, uint64 deadline);
    event EscrowReleased(uint256 indexed escrowId);
    event EscrowRefunded(uint256 indexed escrowId);
    event DisputeOpened(uint256 indexed escrowId, uint64 disputeDeadline);
    event DisputeResolved(uint256 indexed escrowId, bool refundCustomer);
    /// @notice S2-02: emitted when an unresolved dispute auto-closes with a 50/50 split.
    event DisputeAutoSplit(uint256 indexed escrowId, uint256 toCustomer, uint256 toMerchant);

    /// @notice Minimum time a customer must wait before unilaterally refunding themselves.
    uint256 public constant MIN_ESCROW_DURATION = 3 days;
    /// @notice A dispute left unresolved this long can be auto-closed by anyone, so funds can
    /// never be frozen forever behind a resolver who never acts.
    uint256 public constant DISPUTE_AUTO_CLOSE_WINDOW = 14 days;
    /// @notice After `deadline`, the merchant has exclusive priority to claim release for this
    /// long before the customer gains a self-refund path, so the two can never race for the
    /// same payout.
    uint256 public constant MERCHANT_CLAIM_WINDOW = 7 days;

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) public escrows;

    error BadStatus();
    error NotParty();
    error ZeroAmount();
    error DeadlineNotReached();
    error BadMerchant();
    error BadDeadline();
    error DisputeWindowNotElapsed();
    error ClaimWindowElapsed();

    constructor(address owner_) Ownable(owner_) {}

    function createEscrow(
        address merchant,
        uint64 deadline,
        bytes32 termsHash
    ) external payable nonReentrant returns (uint256 escrowId) {
        if (msg.value == 0) revert ZeroAmount();
        if (merchant == address(0) || merchant == msg.sender) revert BadMerchant();
        if (deadline < block.timestamp + MIN_ESCROW_DURATION) revert BadDeadline();
        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            merchant: merchant,
            customer: msg.sender,
            amount: msg.value,
            deadline: deadline,
            disputeDeadline: 0,
            status: Status.Locked,
            termsHash: termsHash
        });
        emit EscrowCreated(escrowId, merchant, msg.sender, msg.value, deadline);
    }

    function releaseToMerchant(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Locked) revert BadStatus();
        if (msg.sender != e.customer) revert NotParty();
        e.status = Status.Released;
        (bool sent,) = e.merchant.call{value: e.amount}("");
        require(sent, "release");
        emit EscrowReleased(escrowId);
    }

    /// @notice The merchant and the customer can never race for the same payout: the merchant
    /// has exclusive priority to `claimRelease` for `MERCHANT_CLAIM_WINDOW` after `deadline`,
    /// and only once that window has elapsed can the customer self-refund here. The merchant or
    /// the owner may still refund the customer at any time while `Locked`, deadline or not.
    function refundCustomer(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Locked) revert BadStatus();
        if (msg.sender != e.merchant && msg.sender != e.customer && msg.sender != owner()) {
            revert NotParty();
        }
        if (msg.sender == e.customer && block.timestamp < uint256(e.deadline) + MERCHANT_CLAIM_WINDOW) {
            revert DeadlineNotReached();
        }
        e.status = Status.Refunded;
        (bool sent,) = e.customer.call{value: e.amount}("");
        require(sent, "refund");
        emit EscrowRefunded(escrowId);
    }

    /// @notice The merchant's exclusive window to claim payment if the customer has not
    /// released or disputed: `[deadline, deadline + MERCHANT_CLAIM_WINDOW)`. Once that window
    /// elapses the customer gains the self-refund path above, so the two can never race.
    function claimRelease(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Locked) revert BadStatus();
        if (msg.sender != e.merchant) revert NotParty();
        if (block.timestamp < e.deadline) revert DeadlineNotReached();
        if (block.timestamp >= uint256(e.deadline) + MERCHANT_CLAIM_WINDOW) revert ClaimWindowElapsed();
        e.status = Status.Released;
        (bool sent,) = e.merchant.call{value: e.amount}("");
        require(sent, "release");
        emit EscrowReleased(escrowId);
    }

    function openDispute(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Locked) revert BadStatus();
        if (msg.sender != e.customer && msg.sender != e.merchant) revert NotParty();
        e.status = Status.Disputed;
        uint64 disputeDeadline = uint64(block.timestamp + DISPUTE_AUTO_CLOSE_WINDOW);
        e.disputeDeadline = disputeDeadline;
        emit DisputeOpened(escrowId, disputeDeadline);
    }

    /// @dev Governance resolution hook; `owner` is the protocol timelock, never the deployer EOA.
    function resolveDispute(uint256 escrowId, bool refundCustomer_) external onlyOwner nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Disputed) revert BadStatus();
        _settleDispute(escrowId, e, refundCustomer_);
    }

    /// @notice S2-02: if the resolver never acts, anyone can close a dispute after
    /// `DISPUTE_AUTO_CLOSE_WINDOW`. The old behavior refunded the customer unconditionally,
    /// which let any customer open a free dispute and win 100% of the escrow by default simply
    /// by waiting out the window — no bond, no evidence, no cost. A 50/50 split removes that
    /// free win for either side while still guaranteeing funds are never frozen forever behind
    /// an unresponsive or malicious resolver; a real resolution (via `resolveDispute`,
    /// governance-only) can still award either side 100% before the window elapses.
    function autoCloseDispute(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != Status.Disputed) revert BadStatus();
        if (block.timestamp < e.disputeDeadline) revert DisputeWindowNotElapsed();
        _settleDisputeSplit(escrowId, e);
    }

    function _settleDispute(uint256 escrowId, Escrow storage e, bool refundCustomer_) internal {
        if (refundCustomer_) {
            e.status = Status.Refunded;
            (bool sent,) = e.customer.call{value: e.amount}("");
            require(sent, "refund");
            emit EscrowRefunded(escrowId);
        } else {
            e.status = Status.Released;
            (bool sent,) = e.merchant.call{value: e.amount}("");
            require(sent, "release");
            emit EscrowReleased(escrowId);
        }
        emit DisputeResolved(escrowId, refundCustomer_);
    }

    /// @dev S2-02: splits `e.amount` 50/50 between customer and merchant. Any dust from integer
    /// division (at most 1 wei) stays with the merchant, matching `toMerchant = amount -
    /// toCustomer` below.
    function _settleDisputeSplit(uint256 escrowId, Escrow storage e) internal {
        uint256 toCustomer = e.amount / 2;
        uint256 toMerchant = e.amount - toCustomer;
        e.status = Status.Split;
        (bool sentCustomer,) = e.customer.call{value: toCustomer}("");
        require(sentCustomer, "refund");
        (bool sentMerchant,) = e.merchant.call{value: toMerchant}("");
        require(sentMerchant, "release");
        emit DisputeAutoSplit(escrowId, toCustomer, toMerchant);
    }
}
