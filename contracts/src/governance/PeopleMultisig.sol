// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal 2-of-3 multisig executor for the treasury/community/ecosystem withdrawal
/// path (M11-2, M07-4). Owners are configured once at deploy (owner, co-founder, owner's cold
/// address); any owner submits a call, a second confirms, then any owner executes it. This
/// contract is itself expected to hold `Ownable.owner()` on the vaults it controls (see
/// `CommunityTokenVault`, `BondingCurveMarket`) — handing control to on-chain governance later
/// is a single `transferOwnership(address(timelock))` call submitted/confirmed/executed the
/// same way, no redeploy required.
contract PeopleMultisig {
    uint256 public constant OWNER_COUNT = 3;

    address[] public owners;
    mapping(address => bool) public isOwner;
    /// @notice Confirmations required to execute; starts at 2 (the original 2-of-3) and is
    /// only changeable by the multisig acting on itself (`changeThreshold`).
    uint256 public threshold;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
        uint256 configNonceAtSubmit;
    }

    Transaction[] private _transactions;
    mapping(uint256 => mapping(address => bool)) public confirmedBy;

    /// @notice S1-03: bumped by every owner/threshold change. A transaction's confirmations
    /// are only valid while `configNonceAtSubmit == configNonce`, so rotating a compromised
    /// owner out invalidates every confirmation that owner placed (including its own
    /// auto-confirmed `submit`), Gnosis-Safe style — a removed owner's pre-staged transactions
    /// can no longer be executed with just one more (honest) confirmation.
    uint256 public configNonce;

    event Submitted(uint256 indexed txId, address indexed proposer, address to, uint256 value);
    event Confirmed(uint256 indexed txId, address indexed owner);
    event Revoked(uint256 indexed txId, address indexed owner);
    event Executed(uint256 indexed txId, address indexed executor);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event OwnerReplaced(address indexed oldOwner, address indexed newOwner);
    event ThresholdChanged(uint256 threshold);

    error NotOwner();
    error NotSelf();
    error DuplicateOwner();
    error UnknownTransaction();
    error AlreadyConfirmed();
    error NotConfirmed();
    error AlreadyExecuted();
    error NotEnoughConfirmations();
    error CallFailed();
    error InvalidOwner();
    error InvalidThreshold();
    error StaleConfirmations();

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    /// @notice Owner/threshold management is only reachable via the multisig executing a call
    /// against itself (submit/confirm/execute), never a direct external call.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    constructor(address[OWNER_COUNT] memory owners_) {
        for (uint256 i = 0; i < OWNER_COUNT; i++) {
            address o = owners_[i];
            require(o != address(0), "zero owner");
            if (isOwner[o]) revert DuplicateOwner();
            isOwner[o] = true;
            owners.push(o);
        }
        threshold = 2;
    }

    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 txId) {
        txId = _transactions.length;
        _transactions.push(
            Transaction({
                to: to,
                value: value,
                data: data,
                executed: false,
                confirmations: 0,
                configNonceAtSubmit: configNonce
            })
        );
        emit Submitted(txId, msg.sender, to, value);
        _confirm(txId);
    }

    function confirm(uint256 txId) external onlyOwner {
        _confirm(txId);
    }

    /// @notice Withdraws a prior confirmation. Only possible before `execute`.
    function revokeConfirmation(uint256 txId) external onlyOwner {
        if (txId >= _transactions.length) revert UnknownTransaction();
        Transaction storage t = _transactions[txId];
        if (t.executed) revert AlreadyExecuted();
        if (!confirmedBy[txId][msg.sender]) revert NotConfirmed();
        confirmedBy[txId][msg.sender] = false;
        t.confirmations -= 1;
        emit Revoked(txId, msg.sender);
    }

    function _confirm(uint256 txId) private {
        if (txId >= _transactions.length) revert UnknownTransaction();
        Transaction storage t = _transactions[txId];
        if (t.executed) revert AlreadyExecuted();
        if (confirmedBy[txId][msg.sender]) revert AlreadyConfirmed();
        confirmedBy[txId][msg.sender] = true;
        t.confirmations += 1;
        emit Confirmed(txId, msg.sender);
    }

    function execute(uint256 txId) external onlyOwner {
        if (txId >= _transactions.length) revert UnknownTransaction();
        Transaction storage t = _transactions[txId];
        if (t.executed) revert AlreadyExecuted();
        if (t.confirmations < threshold) revert NotEnoughConfirmations();
        // S1-03: any owner/threshold change since this transaction was submitted invalidates
        // its confirmations — a removed owner's auto-confirmed `submit` (or any confirmation
        // placed before the rotation) can no longer count toward execution.
        if (t.configNonceAtSubmit != configNonce) revert StaleConfirmations();
        t.executed = true;
        (bool ok,) = t.to.call{value: t.value}(t.data);
        if (!ok) revert CallFailed();
        emit Executed(txId, msg.sender);
    }

    // ------------------------------------------------------------------ owner management
    // Reachable only via a submit/confirm/execute cycle targeting this contract itself, so
    // adding, removing or replacing an owner, or changing the threshold, carries the same
    // 2-of-N (or however many signers `threshold` requires) approval as any other transaction.

    function addOwner(address newOwner) external onlySelf {
        if (newOwner == address(0) || isOwner[newOwner]) revert InvalidOwner();
        isOwner[newOwner] = true;
        owners.push(newOwner);
        configNonce += 1;
        emit OwnerAdded(newOwner);
    }

    function removeOwner(address owner_) external onlySelf {
        if (!isOwner[owner_]) revert InvalidOwner();
        uint256 len = owners.length;
        if (len - 1 < threshold) revert InvalidThreshold();
        isOwner[owner_] = false;
        for (uint256 i = 0; i < len; i++) {
            if (owners[i] == owner_) {
                owners[i] = owners[len - 1];
                owners.pop();
                break;
            }
        }
        configNonce += 1;
        emit OwnerRemoved(owner_);
    }

    function replaceOwner(address oldOwner, address newOwner) external onlySelf {
        if (!isOwner[oldOwner]) revert InvalidOwner();
        if (newOwner == address(0) || isOwner[newOwner]) revert InvalidOwner();
        isOwner[oldOwner] = false;
        isOwner[newOwner] = true;
        uint256 len = owners.length;
        for (uint256 i = 0; i < len; i++) {
            if (owners[i] == oldOwner) {
                owners[i] = newOwner;
                break;
            }
        }
        configNonce += 1;
        emit OwnerReplaced(oldOwner, newOwner);
    }

    /// @notice H-02: floor of 2 — the threshold can never be dropped to 1-of-N, no matter how
    /// many owners exist, closing the self-downgrade-to-a-single-key path.
    function changeThreshold(uint256 newThreshold) external onlySelf {
        if (newThreshold < 2 || newThreshold > owners.length) revert InvalidThreshold();
        threshold = newThreshold;
        configNonce += 1;
        emit ThresholdChanged(newThreshold);
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }

    function transactionCount() external view returns (uint256) {
        return _transactions.length;
    }

    function getTransaction(uint256 txId)
        external
        view
        returns (address to, uint256 value, bytes memory data, bool executed, uint256 confirmations)
    {
        if (txId >= _transactions.length) revert UnknownTransaction();
        Transaction storage t = _transactions[txId];
        return (t.to, t.value, t.data, t.executed, t.confirmations);
    }

    receive() external payable {}
}
