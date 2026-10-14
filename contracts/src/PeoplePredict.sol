// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Testnet-only binary markets. No PPL issuance, AMM, fees or privileged withdrawals.
contract PeoplePredict is ReentrancyGuard {
    uint256 public constant VERSION = 1;
    uint256 public constant UNIT = 1 ether;
    uint256 public constant LOT = 1e14; // 0.0001 positions/PPL price tick; every void payout is exact.
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    address public immutable admin;
    uint256 public marketCount;
    uint256 public orderCount;
    uint256 public totalCollateral;
    uint256 public totalBuyEscrow;
    uint256 public totalCredits;

    struct Market {
        string title;
        string terms;
        string source;
        string category;
        uint64 closeAt;
        address resolver;
        address arbiter;
        uint64 proposedAt;
        uint8 proposedOutcome; // 1 YES, 2 NO, 3 VOID
        bool disputed;
        uint8 outcome; // 0 unresolved
        uint256 collateral;
    }

    struct Order {
        address maker;
        uint256 marketId;
        bool yes;
        bool buy;
        uint256 price; // PPL atoms per whole position
        uint256 remaining; // position atoms
        uint64 expiresAt;
    }
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => Order) public orders;
    mapping(uint256 => mapping(address => uint256[2])) private _positions;
    mapping(address => uint256) public credits;

    event MarketCreated(uint256 indexed marketId, address indexed resolver, address indexed arbiter);
    event Split(uint256 indexed marketId, address indexed account, uint256 amount);
    event Merge(uint256 indexed marketId, address indexed account, uint256 amount);
    event OrderPlaced(uint256 indexed orderId, uint256 indexed marketId, address indexed maker);
    event Trade(
        uint256 indexed orderId,
        uint256 indexed marketId,
        address indexed taker,
        address maker,
        bool yes,
        bool buy,
        uint256 amount,
        uint256 price,
        uint256 cost
    );
    event OrderCancelled(uint256 indexed orderId);
    event OutcomeProposed(uint256 indexed marketId, uint8 outcome, bytes32 evidenceHash);
    event Disputed(uint256 indexed marketId, address indexed account, bytes32 evidenceHash);
    event Finalized(uint256 indexed marketId, uint8 outcome, bytes32 evidenceHash);
    event Redeemed(uint256 indexed marketId, address indexed account, uint256 yes, uint256 no, uint256 payout);
    event Withdrawn(address indexed account, uint256 amount);

    constructor(address admin_) {
        require(block.chainid == 97401 || block.chainid == 31337, "testnet only");
        require(admin_ != address(0), "admin");
        admin = admin_;
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return _market(id);
    }

    function positions(uint256 id, address account) external view returns (uint256 yes, uint256 no) {
        _market(id);
        return (_positions[id][account][0], _positions[id][account][1]);
    }

    function createMarket(
        string calldata title,
        string calldata terms,
        string calldata source,
        string calldata category,
        uint64 closeAt,
        address resolver,
        address arbiter
    ) external returns (uint256 id) {
        require(msg.sender == admin, "admin only");
        require(bytes(title).length > 0 && bytes(title).length <= 256, "title");
        require(bytes(terms).length > 0 && bytes(terms).length <= 8192, "terms");
        require(bytes(source).length > 0 && bytes(source).length <= 1024, "source");
        require(bytes(category).length > 0 && bytes(category).length <= 64, "category");
        require(closeAt > block.timestamp, "close time");
        require(
            resolver != address(0) && arbiter != address(0) && resolver != arbiter && resolver != admin
                && arbiter != admin,
            "separate roles"
        );
        id = ++marketCount;
        Market storage m = _markets[id];
        m.title = title;
        m.terms = terms;
        m.source = source;
        m.category = category;
        m.closeAt = closeAt;
        m.resolver = resolver;
        m.arbiter = arbiter;
        emit MarketCreated(id, resolver, arbiter);
    }

    function split(uint256 id) external payable {
        Market storage m = _open(id);
        _lot(msg.value);
        _positions[id][msg.sender][0] += msg.value;
        _positions[id][msg.sender][1] += msg.value;
        m.collateral += msg.value;
        totalCollateral += msg.value;
        emit Split(id, msg.sender, msg.value);
    }

    function merge(uint256 id, uint256 amount) external {
        Market storage m = _market(id);
        require(m.outcome == 0, "finalized");
        _lot(amount);
        _positions[id][msg.sender][0] -= amount;
        _positions[id][msg.sender][1] -= amount;
        m.collateral -= amount;
        totalCollateral -= amount;
        _credit(msg.sender, amount);
        emit Merge(id, msg.sender, amount);
    }

    function placeOrder(uint256 id, bool yes, bool buy, uint256 amount, uint256 price, uint64 expiresAt)
        external
        payable
        returns (uint256 orderId)
    {
        Market storage m = _open(id);
        _lot(amount);
        _lot(price);
        require(price < UNIT, "price");
        require(expiresAt > block.timestamp && expiresAt <= m.closeAt, "expiry");
        uint256 cost = amount * price / UNIT;
        if (buy) {
            require(msg.value == cost, "exact payment");
            totalBuyEscrow += cost;
        } else {
            require(msg.value == 0, "no payment");
            _positions[id][msg.sender][yes ? 0 : 1] -= amount;
        }
        orderId = ++orderCount;
        orders[orderId] = Order(msg.sender, id, yes, buy, price, amount, expiresAt);
        emit OrderPlaced(orderId, id, msg.sender);
    }

    function fillOrder(uint256 orderId, uint256 amount) external payable {
        Order storage o = orders[orderId];
        require(o.maker != address(0) && o.maker != msg.sender, "order");
        _open(o.marketId);
        require(block.timestamp < o.expiresAt, "expired");
        _lot(amount);
        require(amount <= o.remaining, "remaining");
        uint256 cost = amount * o.price / UNIT;
        o.remaining -= amount;
        if (o.buy) {
            require(msg.value == 0, "no payment");
            _positions[o.marketId][msg.sender][o.yes ? 0 : 1] -= amount;
            _positions[o.marketId][o.maker][o.yes ? 0 : 1] += amount;
            totalBuyEscrow -= cost;
            _credit(msg.sender, cost);
        } else {
            require(msg.value == cost, "exact payment");
            _positions[o.marketId][msg.sender][o.yes ? 0 : 1] += amount;
            _credit(o.maker, cost);
        }
        emit Trade(orderId, o.marketId, msg.sender, o.maker, o.yes, o.buy, amount, o.price, cost);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage o = orders[orderId];
        require(o.maker == msg.sender, "maker only");
        uint256 amount = o.remaining;
        require(amount > 0, "empty");
        o.remaining = 0;
        if (o.buy) {
            uint256 cost = amount * o.price / UNIT;
            totalBuyEscrow -= cost;
            _credit(msg.sender, cost);
        } else {
            _positions[o.marketId][msg.sender][o.yes ? 0 : 1] += amount;
        }
        emit OrderCancelled(orderId);
    }

    function propose(uint256 id, uint8 outcome, bytes32 evidenceHash) external {
        Market storage m = _market(id);
        require(msg.sender == m.resolver, "resolver only");
        require(block.timestamp >= m.closeAt && m.proposedAt == 0 && m.outcome == 0, "proposal time");
        _outcome(outcome);
        require(evidenceHash != bytes32(0), "evidence");
        m.proposedAt = uint64(block.timestamp);
        m.proposedOutcome = outcome;
        emit OutcomeProposed(id, outcome, evidenceHash);
    }

    function dispute(uint256 id, bytes32 evidenceHash) external {
        Market storage m = _market(id);
        require(
            m.proposedAt > 0 && block.timestamp < uint256(m.proposedAt) + DISPUTE_WINDOW && m.outcome == 0,
            "dispute time"
        );
        require(!m.disputed && evidenceHash != bytes32(0), "evidence/disputed");
        m.disputed = true;
        emit Disputed(id, msg.sender, evidenceHash);
    }

    function finalize(uint256 id, uint8 outcome, bytes32 evidenceHash) external {
        Market storage m = _market(id);
        require(
            m.proposedAt > 0 && block.timestamp >= uint256(m.proposedAt) + DISPUTE_WINDOW && m.outcome == 0,
            "finalize time"
        );
        if (m.disputed) {
            require(msg.sender == m.arbiter && evidenceHash != bytes32(0), "arbiter/evidence");
            _outcome(outcome);
        } else {
            require(outcome == m.proposedOutcome, "proposed outcome");
        }
        m.outcome = outcome;
        emit Finalized(id, outcome, evidenceHash);
    }

    function redeem(uint256 id) external {
        Market storage m = _market(id);
        require(m.outcome != 0, "unresolved");
        uint256 yes = _positions[id][msg.sender][0];
        uint256 no = _positions[id][msg.sender][1];
        require(yes + no > 0, "empty");
        delete _positions[id][msg.sender];
        uint256 payout = m.outcome == 1 ? yes : m.outcome == 2 ? no : (yes + no) / 2;
        m.collateral -= payout;
        totalCollateral -= payout;
        _credit(msg.sender, payout);
        emit Redeemed(id, msg.sender, yes, no, payout);
    }

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        require(amount > 0, "empty");
        credits[msg.sender] = 0;
        totalCredits -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }

    function _market(uint256 id) private view returns (Market storage m) {
        require(id > 0 && id <= marketCount, "market");
        return _markets[id];
    }

    function _open(uint256 id) private view returns (Market storage m) {
        m = _market(id);
        require(block.timestamp < m.closeAt && m.outcome == 0, "closed");
    }

    function _lot(uint256 amount) private pure {
        require(amount > 0 && amount % LOT == 0, "precision");
    }

    function _outcome(uint8 outcome) private pure {
        require(outcome >= 1 && outcome <= 3, "outcome");
    }

    function _credit(address account, uint256 amount) private {
        credits[account] += amount;
        totalCredits += amount;
    }
}
