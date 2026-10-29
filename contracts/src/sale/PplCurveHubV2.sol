// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {PplCurveMath} from "./PplCurveHub.sol";

/// @notice Inverse of `PplCurveMath.soldForRaised`: USD raised once a given amount of PPL is sold.
library PplCurveMathV2 {
    uint256 internal constant WAD = 1e18;

    /// @notice e^y for a wad `y` (the curve only needs y <= ln 50), rounded down. Computed as
    /// (e^(y/8))^8 with a Taylor series for the reduced argument (y/8 < 0.5, terms vanish fast).
    function expWad(uint256 y) internal pure returns (uint256) {
        uint256 z = y >> 3;
        uint256 term = WAD;
        uint256 sum = WAD;
        for (uint256 i = 1; i < 40; ++i) {
            term = (term * z) / (i * WAD);
            if (term == 0) break;
            sum += term;
        }
        sum = (sum * sum) / WAD;
        sum = (sum * sum) / WAD;
        return (sum * sum) / WAD;
    }

    /// @notice USD (6 decimals) raised once `soldPpl` PPL (wad) are on the curve:
    /// raised = p0/k * (e^(k*x) - 1) with x in millions of PPL. Rounded UP by one unit so that a
    /// sell-back (gross = raised - raisedForSold(newSold)) never pays more than the curve area.
    function raisedForSold(uint256 soldPpl) internal pure returns (uint256) {
        if (soldPpl == 0) return 0;
        uint256 y = (soldPpl * PplCurveMath.K_WAD) / 1e24;
        uint256 raisedWad = (PplCurveMath.P0_WAD * 1e6 * (expWad(y) - WAD)) / PplCurveMath.K_WAD;
        return raisedWad / 1e12 + 1;
    }

    /// @notice Spot price p0 * e^(k*x) in USD wad per PPL.
    function spotPriceWad(uint256 soldPpl) internal pure returns (uint256) {
        return (PplCurveMath.P0_WAD * expWad((soldPpl * PplCurveMath.K_WAD) / 1e24)) / WAD;
    }
}

/// @title PplCurveHubV2
/// @notice USDC-only bonding-curve sale of PPL allocation on Base with sell-back. Spec: docs/v2/SPEC.md.
/// price(x) = p0 * e^(k*x), x in millions of PPL. Each buy splits 50/50: half stays here as the
/// sell-back reserve, half goes to `treasury`. PPL is not a Base token: purchases are recorded per
/// address (`pplOf`, lots) and delivered on the PEOPLE network later.
///
/// The reserve can never be withdrawn by the owner or sent to `treasury`. Its only exit (besides
/// sell-backs) is `liquidityReceiver`, fixed at deploy, through a public timelocked announcement
/// at graduation or at the PEOPLE network launch.
contract PplCurveHubV2 is ReentrancyGuard, Ownable2Step, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants (SPEC §2)

    uint256 public constant SUPPLY_PPL = 100_000_000e18;
    uint256 public constant RAISE_CAP_USD6 = 4_000_000e6;
    uint256 public constant MIN_BUY_USD6 = 10e6;
    uint256 public constant MAX_BUY_USD6 = 500e6;
    /// @dev Per recipient address per UTC calendar day (Q5).
    uint256 public constant BUY_CAP_DAY_USD6 = 2_000e6;
    uint256 public constant BUY_COOLDOWN = 60;
    uint256 public constant TERM = 730 days;
    uint256 public constant WHITELIST_PERIOD = 7 days;
    uint256 public constant RESERVE_BPS = 5_000;
    uint256 public constant HOLD = 30 days;
    uint256 public constant SELL_GLOBAL_CAP_BPS = 200;
    uint256 public constant SELL_CAP_DAY_USD6 = 2_000e6;
    uint256 public constant FEE_LOW_BPS = 150;
    uint256 public constant FEE_HIGH_BPS = 300;
    uint256 public constant FEE_HIGH_THRESHOLD_BPS = 100;
    uint256 public constant MAX_LOTS_PER_SELL = 50;
    /// @dev Public notice between announcing and executing the reserve → liquidity release (Q1).
    /// Options for Alex in SPEC §5.4: 30 days (implemented) or 14 days.
    uint256 public constant LIQUIDITY_RELEASE_DELAY = 30 days;
    uint256 private constant BPS = 10_000;

    bytes32 public constant VERIFICATION_TYPEHASH =
        keccak256("Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)");

    IERC20 public immutable usdc;
    address public immutable treasury;
    address public immutable liquidityReceiver;

    // ---------------------------------------------------------------- state (SPEC §3)

    enum Phase {
        NotOpen,
        Whitelist,
        Open,
        Expired,
        Graduated
    }

    struct Lot {
        uint40 boughtAt;
        uint96 boughtUsd6;
        uint120 pplRemaining;
    }

    address public verifier;
    uint64 public openedAt;
    bool public graduated;
    uint64 public releaseAnnouncedAt;
    bool public liquidityReleased;
    /// @notice Set by the first markDelivered; after that a pending release can no longer be cancelled.
    bool public deliveryStarted;

    uint256 public raisedUsd6;
    uint256 public soldPpl;
    uint256 public reserveUsd6;

    mapping(address => uint256) public pplOf;
    mapping(address => bool) public delivered;

    mapping(address => bytes32) public personOf;
    mapping(bytes32 => address) public accountOfPerson;
    mapping(bytes32 => uint256) public bindNonce;

    mapping(address => Lot[]) internal _lots;
    mapping(address => uint256) public lotHead;
    mapping(address => uint64) public lastBuyAt;
    mapping(address => uint256) internal _buyDayOf;
    mapping(address => uint256) internal _buyUsedUsd6;

    uint256 public sellDay;
    uint256 public sellDayReserveSnapshot;
    uint256 public sellDayGrossUsd6;
    mapping(address => uint256) internal _sellDayOf;
    mapping(address => uint256) internal _sellUsedUsd6;

    // ---------------------------------------------------------------- events (SPEC §8)

    event Bought(
        address indexed buyer,
        address indexed recipient,
        address indexed referrer,
        uint256 usdcIn,
        uint256 toReserve,
        uint256 pplOut,
        uint256 lotId
    );
    event SoldBack(address indexed holder, uint256 pplIn, uint256 grossUsd6, uint256 feeUsd6, uint256 payoutUsd6);
    event Verified(address indexed account, bytes32 indexed personId);
    event Unbound(address indexed account, bytes32 indexed personId);
    event VerifierSet(address indexed previous, address indexed current);
    event SaleOpened(uint256 openedAt, uint256 whitelistEndsAt, uint256 closesAt);
    event Graduated(uint256 raisedUsd6, uint256 soldPpl, uint256 reserveUsd6);
    event LiquidityReleaseAnnounced(address indexed to, uint256 reserveUsd6, uint256 executableAt, bool graduated);
    event LiquidityReleaseCancelled();
    event LiquidityReleased(address indexed to, uint256 amount);
    event Delivered(address indexed holder, uint256 ppl);
    event Rescued(address indexed token, uint256 amount);

    // ---------------------------------------------------------------- errors

    error ZeroAddress();
    error BadReceiver();
    error NotSixDecimals();
    error AlreadyOpen();
    error SaleNotActive();
    error NotVerified();
    error BadReferrer();
    error BelowMin();
    error AboveMax();
    error Cooldown();
    error BuyDayCap();
    error ZeroOut();
    error Slippage();
    error SellBackClosed();
    error IsDelivered();
    error NotEnoughUnlocked();
    error GlobalDayCap();
    error AddressDayCap();
    error ReserveExhausted();
    error Expired();
    error BadSignature();
    error BadNonce();
    error AlreadyBound();
    error NotBound();
    error ReleaseNotAllowed();
    error ReleaseNotAnnounced();
    error ReleaseTimelocked();
    error DeliveryNotAllowed();
    error DeliveryStarted();
    error ExceedsSurplus();
    error RenounceDisabled();

    constructor(IERC20 usdc_, address treasury_, address liquidityReceiver_, address owner_, address verifier_)
        Ownable(owner_)
        EIP712("PplCurveHubV2", "1")
    {
        if (address(usdc_) == address(0) || treasury_ == address(0) || liquidityReceiver_ == address(0)) {
            revert ZeroAddress();
        }
        if (liquidityReceiver_ == treasury_ || liquidityReceiver_ == owner_) revert BadReceiver();
        if (IERC20Metadata(address(usdc_)).decimals() != 6) revert NotSixDecimals();
        usdc = usdc_;
        treasury = treasury_;
        liquidityReceiver = liquidityReceiver_;
        verifier = verifier_;
        emit VerifierSet(address(0), verifier_);
    }

    // ================================================================ user

    /// @notice Buy PPL with USDC pulled from `msg.sender`; PPL, limits and lots belong to `recipient`.
    function buy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 pplOut)
    {
        if (!_buyOpen()) revert SaleNotActive();
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp < openedAt + WHITELIST_PERIOD && personOf[recipient] == bytes32(0)) revert NotVerified();
        if (delivered[recipient]) revert IsDelivered();
        if (referrer != address(0) && (referrer == msg.sender || referrer == recipient)) revert BadReferrer();
        if (usdcIn > MAX_BUY_USD6) revert AboveMax();

        uint256 remaining = RAISE_CAP_USD6 - raisedUsd6;
        // Below-min is only allowed when it completes the raise (final partial fill).
        if (usdcIn < MIN_BUY_USD6 && usdcIn < remaining) revert BelowMin();
        uint64 last = lastBuyAt[recipient];
        if (last != 0 && block.timestamp < uint256(last) + BUY_COOLDOWN) revert Cooldown();

        uint256 charged = usdcIn < remaining ? usdcIn : remaining;
        uint256 used = _buyUsedToday(recipient);
        if (used + charged > BUY_CAP_DAY_USD6) revert BuyDayCap();

        uint256 newRaised = raisedUsd6 + charged;
        uint256 newSold = PplCurveMath.soldForRaised(newRaised);
        if (newSold <= soldPpl) revert ZeroOut();
        pplOut = newSold - soldPpl;
        if (pplOut < minPplOut) revert Slippage();

        uint256 toTreasury = (charged * (BPS - RESERVE_BPS)) / BPS;
        uint256 toReserve = charged - toTreasury;

        raisedUsd6 = newRaised;
        soldPpl = newSold;
        reserveUsd6 += toReserve;
        pplOf[recipient] += pplOut;
        lastBuyAt[recipient] = uint64(block.timestamp);
        _buyDayOf[recipient] = _today();
        _buyUsedUsd6[recipient] = used + charged;
        uint256 lotId = _lots[recipient].length;
        _lots[recipient].push(Lot(uint40(block.timestamp), uint96(charged), uint120(pplOut)));

        if (newRaised >= RAISE_CAP_USD6) {
            graduated = true;
            emit Graduated(newRaised, newSold, reserveUsd6);
        }

        usdc.safeTransferFrom(msg.sender, address(this), toReserve);
        if (toTreasury != 0) usdc.safeTransferFrom(msg.sender, treasury, toTreasury);

        emit Bought(msg.sender, recipient, referrer, charged, toReserve, pplOut, lotId);
    }

    /// @notice Sell unlocked PPL back to the curve at the curve-at-exit price (FIFO over lots).
    function sellBack(uint256 pplIn, uint256 minUsdcOut) external nonReentrant whenNotPaused returns (uint256 payout) {
        if (openedAt == 0 || graduated || liquidityReleased) revert SellBackClosed();
        if (personOf[msg.sender] == bytes32(0)) revert NotVerified();
        if (delivered[msg.sender]) revert IsDelivered();
        if (pplIn == 0) revert ZeroOut();

        _consumeLots(msg.sender, pplIn);

        (uint256 snapshot, uint256 dayGross) = _sellDayState();
        uint256 newSold = soldPpl - pplIn;
        uint256 newRaised = PplCurveMathV2.raisedForSold(newSold);
        if (newRaised >= raisedUsd6) revert ZeroOut();
        uint256 gross = raisedUsd6 - newRaised;

        if (dayGross + gross > (snapshot * SELL_GLOBAL_CAP_BPS) / BPS) revert GlobalDayCap();
        uint256 addrUsed = _sellUsedToday(msg.sender);
        if (addrUsed + gross > SELL_CAP_DAY_USD6) revert AddressDayCap();

        uint256 fee = _sellFee(gross, snapshot, dayGross);
        payout = gross - fee;
        if (payout < minUsdcOut) revert Slippage();
        if (payout > reserveUsd6) revert ReserveExhausted();

        uint256 today = _today();
        if (sellDay != today) {
            sellDay = today;
            sellDayReserveSnapshot = snapshot;
        }
        sellDayGrossUsd6 = dayGross + gross;
        _sellDayOf[msg.sender] = today;
        _sellUsedUsd6[msg.sender] = addrUsed + gross;

        soldPpl = newSold;
        raisedUsd6 = newRaised;
        reserveUsd6 -= payout;
        pplOf[msg.sender] -= pplIn;

        usdc.safeTransfer(msg.sender, payout);
        emit SoldBack(msg.sender, pplIn, gross, fee, payout);
    }

    /// @notice Bind `msg.sender` to `personId` with an EIP-712 attestation from `verifier`.
    function verify(bytes32 personId, uint256 deadline, bytes calldata sig) external {
        if (block.timestamp > deadline) revert Expired();
        if (personId == bytes32(0)) revert BadSignature();
        if (personOf[msg.sender] != bytes32(0) || accountOfPerson[personId] != address(0)) revert AlreadyBound();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(VERIFICATION_TYPEHASH, msg.sender, personId, bindNonce[personId], deadline))
        );
        address signer = ECDSA.recover(digest, sig);
        if (signer != verifier || signer == address(0)) revert BadSignature();
        personOf[msg.sender] = personId;
        accountOfPerson[personId] = msg.sender;
        emit Verified(msg.sender, personId);
    }

    // ================================================================ liquidity release (Q1)

    /// @notice Publicly announce moving the whole reserve to `liquidityReceiver` after
    /// LIQUIDITY_RELEASE_DELAY. Used at graduation or at the PEOPLE network launch. Stops new buys
    /// while pending; sell-back keeps working until execution (unless graduated).
    function announceLiquidityRelease() external onlyOwner {
        if (openedAt == 0 || liquidityReleased || releaseAnnouncedAt != 0) revert ReleaseNotAllowed();
        releaseAnnouncedAt = uint64(block.timestamp);
        emit LiquidityReleaseAnnounced(
            liquidityReceiver, reserveUsd6, block.timestamp + LIQUIDITY_RELEASE_DELAY, graduated
        );
    }

    function cancelLiquidityRelease() external onlyOwner {
        if (releaseAnnouncedAt == 0 || liquidityReleased) revert ReleaseNotAnnounced();
        // Frozen (delivered) records must never coexist with a reopened sale / sell-back.
        if (deliveryStarted) revert DeliveryStarted();
        releaseAnnouncedAt = 0;
        emit LiquidityReleaseCancelled();
    }

    /// @notice Permissionless once the notice period has passed.
    function executeLiquidityRelease() external nonReentrant {
        if (releaseAnnouncedAt == 0 || liquidityReleased) revert ReleaseNotAnnounced();
        if (block.timestamp < uint256(releaseAnnouncedAt) + LIQUIDITY_RELEASE_DELAY) revert ReleaseTimelocked();
        liquidityReleased = true;
        uint256 amount = reserveUsd6;
        reserveUsd6 = 0;
        if (amount != 0) usdc.safeTransfer(liquidityReceiver, amount);
        emit LiquidityReleased(liquidityReceiver, amount);
    }

    // ================================================================ delivery (Q2)

    /// @notice Freeze Base records whose PPL were delivered on the PEOPLE network: they can no
    /// longer be sold back (no double spend). Only once the sale is over or the launch release has
    /// been publicly announced, so it cannot be used to block sell-backs during the normal sale.
    function markDelivered(address[] calldata holders) external onlyOwner {
        if (!graduated && releaseAnnouncedAt == 0 && !liquidityReleased) revert DeliveryNotAllowed();
        deliveryStarted = true;
        for (uint256 i; i < holders.length; ++i) {
            address h = holders[i];
            if (delivered[h]) continue;
            delivered[h] = true;
            emit Delivered(h, pplOf[h]);
        }
    }

    // ================================================================ owner

    function open() external onlyOwner {
        if (openedAt != 0) revert AlreadyOpen();
        openedAt = uint64(block.timestamp);
        emit SaleOpened(block.timestamp, block.timestamp + WHITELIST_PERIOD, block.timestamp + TERM);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rotate or revoke (address(0)) the verification signer.
    function setVerifier(address v) external onlyOwner {
        emit VerifierSet(verifier, v);
        verifier = v;
    }

    /// @notice Unbind a lost/abused address. Lots and `pplOf` stay; old attestations die (nonce bump).
    function unbind(address account) external onlyOwner {
        bytes32 person = personOf[account];
        if (person == bytes32(0)) revert NotBound();
        delete personOf[account];
        delete accountOfPerson[person];
        ++bindNonce[person];
        emit Unbound(account, person);
    }

    /// @notice Recover tokens sent by mistake to `treasury`: any non-USDC token, or USDC above the reserve.
    function rescue(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(usdc)) {
            uint256 bal = usdc.balanceOf(address(this));
            if (bal < reserveUsd6 || amount > bal - reserveUsd6) revert ExceedsSurplus();
        }
        IERC20(token).safeTransfer(treasury, amount);
        emit Rescued(token, amount);
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ================================================================ views

    function phase() public view returns (Phase) {
        if (openedAt == 0) return Phase.NotOpen;
        if (graduated) return Phase.Graduated;
        if (block.timestamp >= uint256(openedAt) + TERM) return Phase.Expired;
        if (block.timestamp < uint256(openedAt) + WHITELIST_PERIOD) return Phase.Whitelist;
        return Phase.Open;
    }

    function quoteBuy(uint256 usdcIn) external view returns (uint256 pplOut, uint256 chargedUsd6) {
        uint256 remaining = RAISE_CAP_USD6 - raisedUsd6;
        chargedUsd6 = usdcIn < remaining ? usdcIn : remaining;
        uint256 newSold = PplCurveMath.soldForRaised(raisedUsd6 + chargedUsd6);
        pplOut = newSold > soldPpl ? newSold - soldPpl : 0;
    }

    /// @notice Price/fee for selling `pplIn` now; does not check lots, holds or caps.
    function quoteSellBack(address, uint256 pplIn) external view returns (uint256 gross, uint256 fee, uint256 payout) {
        if (pplIn == 0 || pplIn > soldPpl) return (0, 0, 0);
        uint256 newRaised = PplCurveMathV2.raisedForSold(soldPpl - pplIn);
        if (newRaised >= raisedUsd6) return (0, 0, 0);
        gross = raisedUsd6 - newRaised;
        (uint256 snapshot, uint256 dayGross) = _sellDayState();
        fee = _sellFee(gross, snapshot, dayGross);
        payout = gross - fee;
    }

    /// @notice PPL sellable in one `sellBack` (unlocked lots, at most MAX_LOTS_PER_SELL from the head).
    function sellableNow(address holder) external view returns (uint256 ppl) {
        Lot[] storage ls = _lots[holder];
        uint256 end = ls.length;
        uint256 i = lotHead[holder];
        for (uint256 touched; i < end && touched < MAX_LOTS_PER_SELL; ++touched) {
            Lot storage l = ls[i++];
            if (uint256(l.boughtAt) + HOLD > block.timestamp) break;
            ppl += l.pplRemaining;
        }
    }

    function sellBackCapToday() external view returns (uint256 globalRemainingUsd6, uint256 feeLowRemainingUsd6) {
        (uint256 snapshot, uint256 dayGross) = _sellDayState();
        uint256 cap = (snapshot * SELL_GLOBAL_CAP_BPS) / BPS;
        uint256 line = (snapshot * FEE_HIGH_THRESHOLD_BPS) / BPS;
        globalRemainingUsd6 = cap > dayGross ? cap - dayGross : 0;
        feeLowRemainingUsd6 = line > dayGross ? line - dayGross : 0;
    }

    function addressSellRemainingToday(address a) external view returns (uint256) {
        return SELL_CAP_DAY_USD6 - _sellUsedToday(a);
    }

    function buyRemainingToday(address a) external view returns (uint256) {
        return BUY_CAP_DAY_USD6 - _buyUsedToday(a);
    }

    function nextBuyAt(address a) external view returns (uint256) {
        uint64 last = lastBuyAt[a];
        return last == 0 ? 0 : uint256(last) + BUY_COOLDOWN;
    }

    function lotCount(address a) external view returns (uint256) {
        return _lots[a].length;
    }

    function lots(address a, uint256 from, uint256 n) external view returns (Lot[] memory out) {
        Lot[] storage ls = _lots[a];
        if (from >= ls.length) return out;
        if (n > ls.length - from) n = ls.length - from;
        out = new Lot[](n);
        for (uint256 i; i < n; ++i) out[i] = ls[from + i];
    }

    /// @notice PPL never sold on the curve; goes to the Community Pool on the PEOPLE network.
    function unsoldPpl() external view returns (uint256) {
        return SUPPLY_PPL - soldPpl;
    }

    function spotPriceWad() external view returns (uint256) {
        return PplCurveMathV2.spotPriceWad(soldPpl);
    }

    // ================================================================ internal

    function _buyOpen() internal view returns (bool) {
        return openedAt != 0 && !graduated && releaseAnnouncedAt == 0 && !liquidityReleased
            && block.timestamp < uint256(openedAt) + TERM;
    }

    /// @dev Q5: buy and sell-back limits count per UTC calendar day.
    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _buyUsedToday(address a) internal view returns (uint256) {
        return _buyDayOf[a] == _today() ? _buyUsedUsd6[a] : 0;
    }

    function _sellUsedToday(address a) internal view returns (uint256) {
        return _sellDayOf[a] == _today() ? _sellUsedUsd6[a] : 0;
    }

    /// @dev Day-start reserve snapshot and today's total gross; a new day snapshots the current reserve.
    function _sellDayState() internal view returns (uint256 snapshot, uint256 dayGross) {
        if (sellDay == _today()) return (sellDayReserveSnapshot, sellDayGrossUsd6);
        return (reserveUsd6, 0);
    }

    /// @dev Q3: marginal fee — 1.5% on the part of today's sell-backs below 1% of the day-start
    /// reserve, 3% only on the part above it. Each part rounds up.
    function _sellFee(uint256 gross, uint256 snapshot, uint256 dayGross) internal pure returns (uint256) {
        uint256 line = (snapshot * FEE_HIGH_THRESHOLD_BPS) / BPS;
        uint256 lowRoom = line > dayGross ? line - dayGross : 0;
        uint256 low = gross < lowRoom ? gross : lowRoom;
        uint256 high = gross - low;
        return _ceilBps(low, FEE_LOW_BPS) + _ceilBps(high, FEE_HIGH_BPS);
    }

    function _ceilBps(uint256 amount, uint256 bps) private pure returns (uint256) {
        return (amount * bps + BPS - 1) / BPS;
    }

    /// @dev FIFO from `lotHead`; only lots past HOLD; at most MAX_LOTS_PER_SELL lots touched.
    function _consumeLots(address holder, uint256 pplIn) internal {
        Lot[] storage ls = _lots[holder];
        uint256 end = ls.length;
        uint256 i = lotHead[holder];
        uint256 left = pplIn;
        for (uint256 touched; left != 0; ++touched) {
            if (i >= end || touched >= MAX_LOTS_PER_SELL) revert NotEnoughUnlocked();
            Lot storage l = ls[i];
            if (uint256(l.boughtAt) + HOLD > block.timestamp) revert NotEnoughUnlocked();
            uint256 have = l.pplRemaining;
            if (have > left) {
                l.pplRemaining = uint120(have - left);
                left = 0;
            } else {
                l.pplRemaining = 0;
                left -= have;
                ++i;
            }
        }
        lotHead[holder] = i;
    }
}
