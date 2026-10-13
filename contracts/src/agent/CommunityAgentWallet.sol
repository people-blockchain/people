// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistry8004} from "../interfaces/IAgentRegistry8004.sol";
import {Ix402Payment} from "../interfaces/IAgentRegistry8004.sol";

/// @notice Community AI-agent treasury with spend limits; policy changes only via timelock.
contract CommunityAgentWallet is AccessControl, ReentrancyGuard, IAgentRegistry8004, Ix402Payment {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    /// @notice May instantly set `frozen = true`. Cannot unfreeze — that stays onlyTimelock —
    /// so a compromised or overzealous guardian can only stop spending, never resume it.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    struct Limits {
        uint256 maxPerTx;
        uint256 maxPerDay;
        uint256 maxPerWeek;
        bool whitelistEnabled;
        bool frozen;
    }

    event LimitsUpdated(Limits limits);
    event RecipientAllowed(address indexed recipient, bool allowed);
    event AgentSpend(address indexed executor, address indexed recipient, uint256 amount);
    event EmergencyFreeze(bool frozen);

    /// @dev One entry per spend, consumed in FIFO order as it ages out of the window — a
    /// sliding window, not a calendar bucket, so no sequence of spends can ever clear two
    /// calendar buckets' worth of budget inside a single rolling day/week.
    struct SpendRecord {
        uint64 timestamp;
        uint192 amount;
    }

    struct Window {
        SpendRecord[] records;
        uint256 head;
        uint256 sum;
    }

    Limits public limits;
    address public immutable timelockController;

    mapping(address => bool) public allowedRecipients;
    mapping(bytes32 => address) private _agents;

    Window private _day;
    Window private _week;

    error Frozen();
    error OverLimit();
    error NotWhitelisted();
    error UnauthorizedRecipient();
    error ZeroAmount();

    /// @notice H-03: upper bound on how many stale records a single call will evict from a
    /// window, so no caller — compromised `EXECUTOR_ROLE` or not — can inflate `_day`/`_week`
    /// past the point where the next legitimate spend's eviction pass runs out of gas and
    /// bricks the wallet forever. Any excess stale backlog drains over multiple calls instead.
    uint256 public constant MAX_EVICTIONS_PER_CALL = 50;

    constructor(address executor, address timelockController_, address feeSink, address guardian) {
        timelockController = timelockController_;
        _grantRole(DEFAULT_ADMIN_ROLE, timelockController_);
        _grantRole(EXECUTOR_ROLE, executor);
        _grantRole(GUARDIAN_ROLE, guardian);
        limits = Limits({
            maxPerTx: 1 ether,
            maxPerDay: 5 ether,
            maxPerWeek: 20 ether,
            whitelistEnabled: true,
            frozen: false
        });
        allowedRecipients[feeSink] = true;
        emit RecipientAllowed(feeSink, true);
    }

    modifier onlyTimelock() {
        if (msg.sender != timelockController) revert UnauthorizedRecipient();
        _;
    }

    function setLimits(Limits calldata newLimits) external onlyTimelock {
        limits = newLimits;
        emit LimitsUpdated(newLimits);
    }

    function setRecipientAllowed(address recipient, bool allowed) external onlyTimelock {
        allowedRecipients[recipient] = allowed;
        emit RecipientAllowed(recipient, allowed);
    }

    /// @notice Freezing is open to the timelock or the guardian, for an instant kill switch;
    /// unfreezing stays onlyTimelock, behind the governance delay.
    function setEmergencyFreeze(bool frozen) external {
        if (frozen) {
            if (msg.sender != timelockController && !hasRole(GUARDIAN_ROLE, msg.sender)) {
                revert UnauthorizedRecipient();
            }
        } else if (msg.sender != timelockController) {
            revert UnauthorizedRecipient();
        }
        limits.frozen = frozen;
        emit EmergencyFreeze(frozen);
    }

    function registerAgent(bytes32 agentId, address wallet, string calldata metadataURI) external onlyRole(EXECUTOR_ROLE) {
        _agents[agentId] = wallet;
        emit AgentRegistered(agentId, wallet, metadataURI);
    }

    function agentWallet(bytes32 agentId) external view returns (address) {
        return _agents[agentId];
    }

    /// @notice Records an x402 payment commitment. Authorizations count against the same
    /// daily/weekly budget as `spend`, so the executor cannot issue unbounded receipts that
    /// stay inside the per-transaction limit but exceed the cumulative ones. Fails closed:
    /// a payment later settled through `spend` is counted again, never under-counted.
    function authorizePayment(bytes32 paymentHash, address recipient, uint256 amount) external onlyRole(EXECUTOR_ROLE) {
        _enforceSpend(recipient, amount);
        _recordSpend(amount);
        emit PaymentAuthorized(paymentHash, msg.sender, recipient, amount);
    }

    function spend(address payable recipient, uint256 amount) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        _enforceSpend(recipient, amount);
        _recordSpend(amount);
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "transfer failed");
        emit AgentSpend(msg.sender, recipient, amount);
    }

    function _enforceSpend(address recipient, uint256 amount) internal view {
        if (amount == 0) revert ZeroAmount();
        if (limits.frozen) revert Frozen();
        if (limits.whitelistEnabled && !allowedRecipients[recipient]) revert NotWhitelisted();
        if (amount > limits.maxPerTx) revert OverLimit();
    }

    /// @dev Rolling window, not a calendar bucket: evicts entries older than `windowLength`
    /// before checking the cap, so any 24h/7d span (not just a UTC day/week) is bounded.
    /// H-03: eviction is capped at `MAX_EVICTIONS_PER_CALL` per call so no backlog of stale
    /// records — however large — can make a single call's eviction pass exceed the block gas
    /// limit and permanently brick every future spend; a bigger backlog just drains over more
    /// calls (including the public `evictStale`) instead of all at once.
    function _evict(Window storage w, uint256 windowLength) internal {
        uint256 head = w.head;
        uint256 len = w.records.length;
        uint256 evicted = 0;
        while (head < len && evicted < MAX_EVICTIONS_PER_CALL && w.records[head].timestamp + windowLength <= block.timestamp)
        {
            w.sum -= w.records[head].amount;
            delete w.records[head];
            head++;
            evicted++;
        }
        w.head = head;
    }

    function _recordWindowSpend(Window storage w, uint256 windowLength, uint256 cap, uint256 amount) internal {
        _evict(w, windowLength);
        if (w.sum + amount > cap) revert OverLimit();
        w.sum += amount;
        w.records.push(SpendRecord({timestamp: uint64(block.timestamp), amount: uint192(amount)}));
    }

    function _recordSpend(uint256 amount) internal {
        _recordWindowSpend(_day, 1 days, limits.maxPerDay, amount);
        _recordWindowSpend(_week, 1 weeks, limits.maxPerWeek, amount);
    }

    /// @notice H-03: anyone may call this to incrementally drain a stale-record backlog ahead
    /// of time, bounded the same way as the eviction done inside a spend. Making this public
    /// (not gated to a role) means the wallet can never be "unbrickable but only by the
    /// executor" — a frozen executor, or one with no funds for gas, is not a dependency.
    function evictStale() external {
        _evict(_day, 1 days);
        _evict(_week, 1 weeks);
    }

    receive() external payable {}
}
