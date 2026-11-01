// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PplReturnBurn
/// @notice PEOPLE-network side of a `PplCurveHubV2.sellBack`: the seller hands in the PPL it sells
/// back here, and the hub's `returnVerifier` signs a `MainnetReturn` attestation only for a
/// `ReturnBurned` event of this contract.
///
/// Returned PPL are NOT burned (owner decision 2026-11-01, replacing the earlier burn design): each
/// return is forwarded in the same call to the immutable `returnRecipient`, the sale distribution
/// wallet. `sellBack` lowers the hub's `soldPpl`, so returned PPL count as unsold again: they can be
/// delivered to a later buyer, and what is left at the end goes to the Community Pool with the rest
/// of the unsold supply. This matches the fixed-supply, 0%-burn model (docs/ECONOMICS.md §7).
/// The names `burnForReturn` / `ReturnBurned` are kept so the attestation signer and the site keep
/// working; "burn" here means the PPL leave the seller for good, which is what stops a double sale.
///
/// PPL cannot stay here: there is no `receive`/`fallback`, `delegatecall` or `selfdestruct`, and
/// the only value transfer is the forward to `returnRecipient`. Owner paths that could freeze
/// sell-back (`purchaseReporter`, reporter credit cap) use the same 48-hour timelock as
/// `PplCurveHubV2` admin ops (with grace period and cancel).
///
/// `returnId` commits to the returned amount, the destination hub, the Base seller, the PEOPLE
/// source chain id and the destination chain id (plus this contract and a nonce, so two equal
/// returns still differ). The hub's `MainnetReturn` attestation repeats those fields and checks them.
///
/// Only PPL credited as hub purchases (`hubPurchasedPpl`) may be returned here; reward grants and
/// plain transfers do not increase that ledger (SPEC §5.2 on-chain enforcement).
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PplReturnBurn is Ownable {
    /// @notice Delay before a queued owner action can execute (matches `PplCurveHubV2.ADMIN_TIMELOCK`).
    uint256 public constant ADMIN_TIMELOCK = 48 hours;
    /// @notice Queued owner ops expire if not executed within this window after `eta`.
    uint256 public constant GRACE_PERIOD = 14 days;

    bytes32 private constant OP_SET_PURCHASE_REPORTER = keccak256("setPurchaseReporter");
    bytes32 private constant OP_SET_REPORTER_CREDIT_CAP = keccak256("setReporterCreditCap");

    /// @notice Sale distribution wallet that receives every returned PPL. Cannot change.
    address public immutable returnRecipient;
    /// @notice Total native PPL ever returned through this contract (all forwarded to `returnRecipient`).
    uint256 public totalReturned;
    /// @notice Number of returns so far; feeds `returnId`.
    uint256 public returnCount;
    /// @notice PPL (wei) bought through the hub and delivered to `account`; only this balance may
    /// be sent in `burnForReturn` (SPEC §5.2).
    mapping(address => uint256) public hubPurchasedPpl;
    /// @notice Relayer that credits deliveries after hub `Bought` events.
    address public purchaseReporter;
    /// @notice Max PPL (wei) the reporter may credit per rolling `reporterCreditPeriod`.
    uint256 public reporterCreditLimit;
    /// @notice Rolling window length for `reporterCreditLimit` (seconds).
    uint256 public reporterCreditPeriod;
    /// @notice PPL credited by the reporter in the current window.
    uint256 public reporterCreditUsed;
    /// @notice Start of the current reporter credit window.
    uint256 public reporterCreditWindowStart;

    struct AdminOp {
        uint64 eta;
        address who;
        uint256 amount;
        bytes32 kind;
    }

    mapping(bytes32 => AdminOp) private _adminOps;
    mapping(bytes32 => bytes32) private _pendingByKind;
    uint256 private _adminNonce;

    constructor(address owner_, address returnRecipient_) Ownable(owner_) {
        if (returnRecipient_ == address(0) || returnRecipient_ == address(this)) revert ZeroAddress();
        returnRecipient = returnRecipient_;
    }

    /// @param returnId Unique id the verifier puts into `MainnetReturn.returnId`.
    /// @param from The PEOPLE-network account that returned the PPL.
    /// @param hub The PplCurveHubV2 the PPL are sold back to.
    /// @param personId The person whose lots are sold back.
    /// @param seller The hub-chain address allowed to call `sellBack` for this return.
    /// @param amount Returned PPL (wei) = `MainnetReturn.pplAmount`. Bound into `returnId`.
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
    event PurchaseReporterSet(address indexed previous, address indexed current);
    event ReporterCreditCapSet(uint256 limit, uint256 period);
    event Queued(bytes32 indexed id, bytes params, uint256 eta);
    event Cancelled(bytes32 indexed id);

    error ZeroAmount();
    error ZeroAddress();
    error NotHubPurchasedPpl();
    error UnauthorizedReporter();
    error Timelocked();
    error NotQueued();
    error OpExpired();
    error KindAlreadyQueued();
    error ReporterCreditCapExceeded();
    error ForwardFailed();

    /// @notice Queue the hub delivery relayer. `address(0)` disables crediting (and thus sell-back).
    /// Executable after `ADMIN_TIMELOCK`. There is no immediate setter.
    function queueSetPurchaseReporter(address reporter) external onlyOwner returns (bytes32 id) {
        id = _queue(OP_SET_PURCHASE_REPORTER, reporter, 0);
    }

    /// @notice Execute a queued `queueSetPurchaseReporter`.
    function executeSetPurchaseReporter(bytes32 id) external onlyOwner {
        AdminOp memory op = _take(id, OP_SET_PURCHASE_REPORTER);
        emit PurchaseReporterSet(purchaseReporter, op.who);
        purchaseReporter = op.who;
    }

    /// @notice Queue a rolling cap on reporter-granted credit. `amount` is the limit (wei); `period`
    /// is the window length in seconds (stored in `who` as uint160).
    function queueSetReporterCreditCap(uint256 limit, uint256 period) external onlyOwner returns (bytes32 id) {
        if (period == 0) revert ZeroAmount();
        id = _queue(OP_SET_REPORTER_CREDIT_CAP, address(uint160(period)), limit);
    }

    /// @notice Execute a queued `queueSetReporterCreditCap`.
    function executeSetReporterCreditCap(bytes32 id) external onlyOwner {
        AdminOp memory op = _take(id, OP_SET_REPORTER_CREDIT_CAP);
        uint256 period = uint256(uint160(op.who));
        reporterCreditLimit = op.amount;
        reporterCreditPeriod = period;
        reporterCreditUsed = 0;
        reporterCreditWindowStart = block.timestamp;
        emit ReporterCreditCapSet(op.amount, period);
    }

    /// @notice Owner cancels a queued action. A cancelled id cannot be executed.
    function cancel(bytes32 id) external onlyOwner {
        AdminOp memory op = _adminOps[id];
        if (op.eta == 0) revert NotQueued();
        delete _adminOps[id];
        if (_pendingByKind[op.kind] == id) delete _pendingByKind[op.kind];
        emit Cancelled(id);
    }

    /// @notice Credit hub-delivered PPL to `account` after an off-chain delivery (mirrors Base lots).
    function creditHubPurchase(address account, uint256 amount) external {
        if (msg.sender != purchaseReporter) revert UnauthorizedReporter();
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _consumeReporterCredit(amount);
        hubPurchasedPpl[account] += amount;
    }

    /// @notice Return `msg.value` PPL to `hub` for `personId`, claimable on `destChainId` by `seller`
    /// (the Base address that will call `sellBack` and receive the stablecoin). The PPL go straight
    /// to `returnRecipient`.
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
        if (hubPurchasedPpl[msg.sender] < msg.value) revert NotHubPurchasedPpl();
        hubPurchasedPpl[msg.sender] -= msg.value;
        returnId =
            keccak256(abi.encode(block.chainid, destChainId, hub, seller, msg.value, address(this), returnCount++));
        totalReturned += msg.value;
        emit ReturnBurned(returnId, msg.sender, hub, personId, seller, msg.value, destChainId);
        // Effects are done; the recipient is a fixed wallet chosen at deploy, and any re-entry
        // could only spend the caller's own remaining `hubPurchasedPpl`.
        (bool ok,) = returnRecipient.call{value: msg.value}("");
        if (!ok) revert ForwardFailed();
    }

    function _queue(bytes32 kind, address who, uint256 amount) internal returns (bytes32 id) {
        bytes32 pendingId = _pendingByKind[kind];
        if (pendingId != bytes32(0) && _adminOps[pendingId].eta != 0) revert KindAlreadyQueued();
        id = keccak256(abi.encode(kind, who, amount, _adminNonce++));
        uint256 eta = block.timestamp + ADMIN_TIMELOCK;
        _adminOps[id] = AdminOp({eta: uint64(eta), who: who, amount: amount, kind: kind});
        _pendingByKind[kind] = id;
        emit Queued(id, abi.encode(kind, who, amount), eta);
    }

    function _take(bytes32 id, bytes32 kind) internal returns (AdminOp memory op) {
        op = _adminOps[id];
        if (op.eta == 0 || op.kind != kind) revert NotQueued();
        if (block.timestamp < uint256(op.eta)) revert Timelocked();
        if (block.timestamp > uint256(op.eta) + GRACE_PERIOD) revert OpExpired();
        delete _adminOps[id];
        delete _pendingByKind[kind];
    }

    function _consumeReporterCredit(uint256 amount) internal {
        uint256 limit = reporterCreditLimit;
        uint256 period = reporterCreditPeriod;
        if (limit == 0 || period == 0) revert ReporterCreditCapExceeded();
        uint256 start = reporterCreditWindowStart;
        uint256 used = reporterCreditUsed;
        if (start == 0 || block.timestamp >= start + period) {
            start = block.timestamp;
            used = 0;
        }
        if (used + amount > limit) revert ReporterCreditCapExceeded();
        reporterCreditWindowStart = start;
        reporterCreditUsed = used + amount;
    }
}
