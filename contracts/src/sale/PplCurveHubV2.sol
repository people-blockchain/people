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

/// @notice Exact rolling 24-hour spend window (A4: "any 24 hours", not a UTC day).
/// A ring buffer of the spends themselves, oldest first, each packed as `timestamp << 88 | amount`.
/// A spend made at `t` counts while `now < t + 24h` and stops counting at exactly `t + 24h`.
/// Expired spends always form a prefix (timestamps only grow), so `prune` drops them by moving
/// `head`. Gas is bounded by CAPACITY: the hub never appends once the live count reaches its
/// owner-set entry limit (<= CAPACITY), so a window holds at most CAPACITY entries (25 slots).
library RollingWindow24h {
    uint256 internal constant WINDOW = 24 hours;
    uint256 internal constant CAPACITY = 50;
    uint256 private constant AMOUNT_BITS = 88;
    uint256 private constant AMOUNT_MASK = (1 << AMOUNT_BITS) - 1;

    struct Window {
        uint8 head;
        uint8 count;
        uint128[CAPACITY] entries;
    }

    /// @dev Sum and number of the spends still inside the window. Read-only twin of `prune`.
    function used(Window storage w) internal view returns (uint256 sum, uint256 live) {
        (, sum, live) = _scan(w);
    }

    /// @dev Drops expired spends and returns the sum and number of the live ones.
    function prune(Window storage w) internal returns (uint256 sum, uint256 live) {
        uint256 expired;
        (expired, sum, live) = _scan(w);
        if (expired != 0) {
            w.head = uint8((w.head + expired) % CAPACITY);
            w.count = uint8(live);
        }
    }

    /// @dev Records a spend now. Callers `prune` first and enforce their entry limit (<= CAPACITY).
    function append(Window storage w, uint256 amount) internal {
        uint256 count = w.count;
        assert(count < CAPACITY && amount <= AMOUNT_MASK);
        w.entries[(w.head + count) % CAPACITY] = uint128((block.timestamp << AMOUNT_BITS) | amount);
        w.count = uint8(count + 1);
    }

    function _scan(Window storage w) private view returns (uint256 expired, uint256 sum, uint256 live) {
        uint256 head = w.head;
        uint256 count = w.count;
        for (uint256 i; i < count; ++i) {
            uint256 e = w.entries[(head + i) % CAPACITY];
            if ((e >> AMOUNT_BITS) + WINDOW <= block.timestamp) ++expired;
            else sum += e & AMOUNT_MASK;
        }
        live = count - expired;
    }
}

/// @title PplCurveHubV2
/// @notice USDC-only bonding-curve sale of PPL on Base with sell-back. Spec: docs/v2/SPEC.md.
/// price(x) = p0 * e^(k*x), x in millions of PPL. Each buy splits 50/50 at buy time (A6): half
/// goes to `treasury` (the Safe) right away, half stays here as the sell-back reserve; an odd unit
/// stays in the reserve.
///
/// PPL is not a Base token. Each `Bought` event is the delivery trigger: an off-chain relayer
/// credits `pplOut` to `recipient` on the PEOPLE network (chain id 97401) right away. Base keeps
/// the per-person purchase record (`lots`) that drives the hold, the limits and sell-back. Because
/// the PPL are already spendable on the PEOPLE network, `sellBack` only pays against an attestation
/// that the same amount was returned there (A1).
///
/// Every buyer must be a verified person for the whole sale (A2). Limits, cooldown, lots and the
/// PPL record are keyed by `personId`, so every address ever bound to one person shares them.
///
/// The reserve can never be withdrawn by the owner or sent to `treasury`. Its only exit (besides
/// sell-backs) is `liquidityReceiver`, fixed at deploy, through a public timelocked announcement
/// at graduation or at the PEOPLE network launch. The LP tokens of the pool built from it are meant
/// to be held by an immutable 730-day `LiquidityLock` (A7, src/sale/LiquidityLock.sol).
contract PplCurveHubV2 is ReentrancyGuard, Ownable2Step, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants (SPEC §2)

    uint256 public constant SUPPLY_PPL = 100_000_000e18;
    uint256 public constant RAISE_CAP_USD6 = 4_000_000e6;
    /// @dev Default of `minBuyUsd6`.
    uint256 public constant MIN_BUY_USD6 = 10e6;
    uint256 public constant MAX_BUY_USD6 = 500e6;
    /// @dev Per person per exact rolling 24 hours (A4, see `RollingWindow24h`).
    uint256 public constant BUY_CAP_DAY_USD6 = 2_000e6;
    uint256 public constant BUY_COOLDOWN = 60;
    /// @dev Buys a trusted router makes for a person (`recipient != msg.sender`) per exact rolling
    /// 24 hours. Counted apart from the person's own `maxBuysPer24h` slots (owner decision).
    uint256 public constant MAX_ROUTER_BUYS_24H = 5;
    uint256 public constant TERM = 730 days;
    /// @dev Launch-week label for `phase()` only: verification is required for the whole sale (A2).
    uint256 public constant WHITELIST_PERIOD = 7 days;
    uint256 public constant RESERVE_BPS = 5_000;
    uint256 public constant HOLD = 30 days;
    uint256 public constant SELL_GLOBAL_CAP_BPS = 200;
    /// @dev Per person per exact rolling 24 hours (A4, see `RollingWindow24h`).
    uint256 public constant SELL_CAP_DAY_USD6 = 2_000e6;
    uint256 public constant FEE_LOW_BPS = 150;
    uint256 public constant FEE_HIGH_BPS = 300;
    uint256 public constant FEE_HIGH_THRESHOLD_BPS = 100;
    uint256 public constant MAX_LOTS_PER_SELL = 50;
    /// @dev Public notice between announcing and executing the reserve → liquidity release (Q1).
    /// Options in SPEC §5.4: 30 days (implemented) or 14 days.
    uint256 public constant LIQUIDITY_RELEASE_DELAY = 30 days;
    /// @notice Chain id of the PEOPLE network, where PPL live and where sell-back returns happen.
    uint256 public constant PEOPLE_CHAIN_ID = 97401;
    /// @dev Lowest `minBuyUsd6` / `minSellUsd6` the owner may set (A4 anti-spam floor).
    uint256 public constant MIN_AMOUNT_FLOOR_USD6 = 1e6;
    uint256 private constant BPS = 10_000;

    bytes32 public constant VERIFICATION_TYPEHASH =
        keccak256("Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)");
    bytes32 public constant MAINNET_RETURN_TYPEHASH = keccak256(
        "MainnetReturn(bytes32 personId,address seller,uint256 pplAmount,uint256 sourceChainId,bytes32 returnId,uint256 deadline)"
    );

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
    /// @notice Signer of `MainnetReturn` attestations. address(0) disables sell-back (safe default).
    address public returnVerifier;
    uint64 public openedAt;
    bool public graduated;
    uint64 public releaseAnnouncedAt;
    bool public liquidityReleased;

    uint256 public raisedUsd6;
    uint256 public soldPpl;
    uint256 public reserveUsd6;

    mapping(bytes32 => uint256) public pplOfPerson;

    mapping(address => bytes32) public personOf;
    mapping(bytes32 => address) public accountOfPerson;
    mapping(bytes32 => uint256) public bindNonce;

    /// @notice Callers allowed to buy for a `recipient` other than themselves (A3).
    mapping(address => bool) public trustedRouter;
    /// @notice Consumed `MainnetReturn.returnId`s (replay protection, A1).
    mapping(bytes32 => bool) public returnUsed;

    mapping(bytes32 => Lot[]) internal _lots;
    mapping(bytes32 => uint256) internal _lotHead;
    mapping(bytes32 => uint64) internal _lastBuyAt;
    mapping(bytes32 => RollingWindow24h.Window) internal _buyWindow;
    mapping(bytes32 => RollingWindow24h.Window) internal _sellWindow;
    /// @dev Buys made for the person by trusted routers; never touch `_buyWindow` or `_lastBuyAt`.
    mapping(bytes32 => RollingWindow24h.Window) internal _routerBuyWindow;

    /// @notice A4 limits per person per rolling 24h, owner-set within bounds (`setWindowLimits`):
    /// at most `maxBuysPer24h` buys and `maxSellsPer24h` sell-backs, each buy >= `minBuyUsd6`
    /// (except the final partial fill) and each sell-back gross >= `minSellUsd6` (except selling
    /// the whole remaining record). They bound the window size and so the gas of every buy/sell.
    uint8 public maxBuysPer24h = 20;
    uint8 public maxSellsPer24h = 10;
    uint64 public minBuyUsd6 = uint64(MIN_BUY_USD6);
    uint64 public minSellUsd6 = 1e6;

    uint256 public sellDay;
    uint256 public sellDayReserveSnapshot;
    uint256 public sellDayGrossUsd6;

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
    /// @notice The PEOPLE-network return `returnId` was paid out; it can never be used again.
    event MainnetReturnConsumed(bytes32 indexed returnId, bytes32 indexed personId, uint256 ppl);
    event Verified(address indexed account, bytes32 indexed personId);
    event Unbound(address indexed account, bytes32 indexed personId);
    event VerifierSet(address indexed previous, address indexed current);
    event ReturnVerifierSet(address indexed previous, address indexed current);
    event TrustedRouterSet(address indexed router, bool trusted);
    event WindowLimitsSet(uint256 maxBuysPer24h, uint256 minBuyUsd6, uint256 maxSellsPer24h, uint256 minSellUsd6);
    event SaleOpened(uint256 openedAt, uint256 whitelistEndsAt, uint256 closesAt);
    event Graduated(uint256 raisedUsd6, uint256 soldPpl, uint256 reserveUsd6);
    event LiquidityReleaseAnnounced(address indexed to, uint256 reserveUsd6, uint256 executableAt, bool graduated);
    event LiquidityReleaseCancelled();
    event LiquidityReleased(address indexed to, uint256 amount);
    event Rescued(address indexed token, uint256 amount);

    // ---------------------------------------------------------------- errors

    error ZeroAddress();
    error BadReceiver();
    error NotSixDecimals();
    error AlreadyOpen();
    error SaleNotActive();
    error NotVerified();
    error UntrustedRouter();
    error BadReferrer();
    error BelowMin();
    error AboveMax();
    error Cooldown();
    error BuyDayCap();
    error TooManyBuys();
    error TooManyRouterBuys();
    error ZeroOut();
    error Slippage();
    error SellBackClosed();
    error SellBackDisabled();
    error ReturnUsed();
    error NotEnoughUnlocked();
    error GlobalDayCap();
    error PersonDayCap();
    error TooManySells();
    error BelowMinSell();
    error BadLimits();
    error ReserveExhausted();
    error Expired();
    error BadSignature();
    error BadNonce();
    error AlreadyBound();
    error NotBound();
    error ReleaseNotAllowed();
    error ReleaseNotAnnounced();
    error ReleaseTimelocked();
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

    /// @notice Buy PPL with USDC pulled from `msg.sender` for the verified person bound to
    /// `recipient`; the PPL are credited to `recipient` on the PEOPLE network (see `Bought`).
    /// @dev A3: `recipient` must be `msg.sender` unless the caller is a `trustedRouter` (an
    /// owner-approved cross-chain swap executor that pays on the user's behalf). Arbitrary callers
    /// can therefore no longer reset a victim's cooldown or spend the victim's daily limit. A trusted
    /// router runs calldata chosen by its own users, so `recipient = victim` stays reachable through
    /// it. Router buys therefore use their own counter (`MAX_ROUTER_BUYS_24H` per person per rolling
    /// 24 h) and neither occupy the person's own `maxBuysPer24h` slots nor reset the person's
    /// cooldown, so a router caller cannot lock a victim out of buying. The $2k/24h amount cap stays
    /// shared by both paths (else a router would lift it); using it up is never free: the caller pays
    /// real USDC and the victim receives all of the PPL.
    function buy(uint256 usdcIn, uint256 minPplOut, address recipient, address referrer)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 pplOut)
    {
        if (!_buyOpen()) revert SaleNotActive();
        if (recipient == address(0)) revert ZeroAddress();
        if (recipient != msg.sender && !trustedRouter[msg.sender]) revert UntrustedRouter();
        bytes32 person = personOf[recipient];
        if (person == bytes32(0)) revert NotVerified();
        if (referrer != address(0) && (referrer == msg.sender || referrer == recipient)) revert BadReferrer();
        if (usdcIn > MAX_BUY_USD6) revert AboveMax();

        uint256 remaining = RAISE_CAP_USD6 - raisedUsd6;
        // Below-min is only allowed when it completes the raise (final partial fill).
        if (usdcIn < minBuyUsd6 && usdcIn < remaining) revert BelowMin();
        bool viaRouter = recipient != msg.sender;
        if (!viaRouter) {
            uint64 last = _lastBuyAt[person];
            if (last != 0 && block.timestamp < uint256(last) + BUY_COOLDOWN) revert Cooldown();
        }

        uint256 charged = usdcIn < remaining ? usdcIn : remaining;
        (uint256 bought24h, uint256 buys24h) = RollingWindow24h.prune(_buyWindow[person]);
        (uint256 routerBought24h, uint256 routerBuys24h) = RollingWindow24h.prune(_routerBuyWindow[person]);
        if (viaRouter) {
            if (routerBuys24h >= MAX_ROUTER_BUYS_24H) revert TooManyRouterBuys();
        } else if (buys24h >= maxBuysPer24h) {
            revert TooManyBuys();
        }
        if (bought24h + routerBought24h + charged > BUY_CAP_DAY_USD6) revert BuyDayCap();

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
        pplOfPerson[person] += pplOut;
        if (viaRouter) {
            RollingWindow24h.append(_routerBuyWindow[person], charged);
        } else {
            _lastBuyAt[person] = uint64(block.timestamp);
            RollingWindow24h.append(_buyWindow[person], charged);
        }
        uint256 lotId = _lots[person].length;
        _lots[person].push(Lot(uint40(block.timestamp), uint96(charged), uint120(pplOut)));

        if (newRaised >= RAISE_CAP_USD6) {
            graduated = true;
            emit Graduated(newRaised, newSold, reserveUsd6);
        }

        usdc.safeTransferFrom(msg.sender, address(this), toReserve);
        if (toTreasury != 0) usdc.safeTransferFrom(msg.sender, treasury, toTreasury);

        emit Bought(msg.sender, recipient, referrer, charged, toReserve, pplOut, lotId);
    }

    /// @notice Sell unlocked PPL of the caller's person back to the curve at the curve-at-exit
    /// price (FIFO over lots), against a `MainnetReturn` attestation (A1).
    /// @dev The PPL were credited on the PEOPLE network at buy time, so paying USDC here without
    /// taking them back there would be a double spend. `returnVerifier` signs
    /// `MainnetReturn(personId, seller, pplAmount, sourceChainId, returnId, deadline)` only after it
    /// has observed on chain `sourceChainId` (= PEOPLE_CHAIN_ID) that exactly `pplAmount` PPL of this
    /// person were moved into the sink designated for this hub. The EIP-712 domain binds this hub
    /// and `block.chainid`; `returnId` (unique per PEOPLE-network return, e.g. its tx hash and log
    /// index) is consumed here, so one return pays out at most once even across signer rotations.
    /// Returned PPL are burned (owner decision A1, no treasury sink): the "sink" is `PplReturnBurn`
    /// on the PEOPLE network, and the verifier signs only for its `ReturnBurned` event, using that
    /// event's `returnId`. A return not consumed here by `deadline` stays burned; the verifier may
    /// sign the same `returnId` again with a new deadline.
    function sellBack(uint256 pplIn, uint256 minUsdcOut, bytes32 returnId, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 payout)
    {
        if (openedAt == 0 || graduated || liquidityReleased) revert SellBackClosed();
        bytes32 person = personOf[msg.sender];
        if (person == bytes32(0)) revert NotVerified();
        if (pplIn == 0) revert ZeroOut();
        _consumeReturn(person, pplIn, returnId, deadline, sig);

        _consumeLots(person, pplIn);

        (uint256 snapshot, uint256 dayGross) = _sellDayState();
        uint256 newSold = soldPpl - pplIn;
        uint256 newRaised = PplCurveMathV2.raisedForSold(newSold);
        if (newRaised >= raisedUsd6) revert ZeroOut();
        uint256 gross = raisedUsd6 - newRaised;

        if (dayGross + gross > (snapshot * SELL_GLOBAL_CAP_BPS) / BPS) revert GlobalDayCap();
        (uint256 sold24h, uint256 sells24h) = RollingWindow24h.prune(_sellWindow[person]);
        if (sells24h >= maxSellsPer24h) revert TooManySells();
        if (sold24h + gross > SELL_CAP_DAY_USD6) revert PersonDayCap();
        if (gross < minSellUsd6 && pplIn != pplOfPerson[person]) revert BelowMinSell();

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
        RollingWindow24h.append(_sellWindow[person], gross);

        soldPpl = newSold;
        raisedUsd6 = newRaised;
        reserveUsd6 -= payout;
        pplOfPerson[person] -= pplIn;

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

    /// @notice Set, rotate or revoke (address(0) = sell-back disabled) the `MainnetReturn` signer.
    function setReturnVerifier(address v) external onlyOwner {
        emit ReturnVerifierSet(returnVerifier, v);
        returnVerifier = v;
    }

    /// @notice Allow or disallow `router` to buy for recipients other than itself (A3).
    function setTrustedRouter(address router, bool trusted) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        trustedRouter[router] = trusted;
        emit TrustedRouterSet(router, trusted);
    }

    /// @notice Set the A4 rolling-24h anti-spam limits (see `maxBuysPer24h`). Entry limits are
    /// 1..RollingWindow24h.CAPACITY; minimums are MIN_AMOUNT_FLOOR_USD6..MAX_BUY_USD6 (buy) and
    /// MIN_AMOUNT_FLOOR_USD6..SELL_CAP_DAY_USD6 (sell-back). The $2k caps themselves are constants.
    function setWindowLimits(uint256 maxBuys, uint256 minBuy, uint256 maxSells, uint256 minSell) external onlyOwner {
        uint256 cap = RollingWindow24h.CAPACITY;
        if (
            maxBuys == 0 || maxBuys > cap || maxSells == 0 || maxSells > cap || minBuy < MIN_AMOUNT_FLOOR_USD6
                || minBuy > MAX_BUY_USD6 || minSell < MIN_AMOUNT_FLOOR_USD6 || minSell > SELL_CAP_DAY_USD6
        ) revert BadLimits();
        maxBuysPer24h = uint8(maxBuys);
        minBuyUsd6 = uint64(minBuy);
        maxSellsPer24h = uint8(maxSells);
        minSellUsd6 = uint64(minSell);
        emit WindowLimitsSet(maxBuys, minBuy, maxSells, minSell);
    }

    /// @notice Unbind a lost/abused address; old attestations die (nonce bump). Lots, limits and
    /// the PPL record belong to the person and carry over to the next bound address (A5).
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

    /// @notice Price/fee for selling `pplIn` now; does not check lots, holds, caps or attestations.
    function quoteSellBack(address, uint256 pplIn) external view returns (uint256 gross, uint256 fee, uint256 payout) {
        if (pplIn == 0 || pplIn > soldPpl) return (0, 0, 0);
        uint256 newRaised = PplCurveMathV2.raisedForSold(soldPpl - pplIn);
        if (newRaised >= raisedUsd6) return (0, 0, 0);
        gross = raisedUsd6 - newRaised;
        (uint256 snapshot, uint256 dayGross) = _sellDayState();
        fee = _sellFee(gross, snapshot, dayGross);
        payout = gross - fee;
    }

    /// @notice PPL record of the person currently bound to `a` (0 if unbound).
    function pplOf(address a) external view returns (uint256) {
        return pplOfPerson[personOf[a]];
    }

    /// @notice PPL sellable in one `sellBack` by the person bound to `holder` (unlocked lots, at
    /// most MAX_LOTS_PER_SELL from the head).
    function sellableNow(address holder) external view returns (uint256 ppl) {
        bytes32 person = personOf[holder];
        Lot[] storage ls = _lots[person];
        uint256 end = ls.length;
        uint256 i = _lotHead[person];
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

    /// @notice Sell-back gross the person bound to `a` may still use in the rolling 24 hours.
    function sellRemaining24h(address a) external view returns (uint256) {
        (uint256 used,) = RollingWindow24h.used(_sellWindow[personOf[a]]);
        return used >= SELL_CAP_DAY_USD6 ? 0 : SELL_CAP_DAY_USD6 - used;
    }

    /// @notice Buy amount the person bound to `a` may still use in the rolling 24 hours.
    /// Shared by the person's own buys and router buys.
    function buyRemaining24h(address a) external view returns (uint256) {
        bytes32 person = personOf[a];
        (uint256 used,) = RollingWindow24h.used(_buyWindow[person]);
        (uint256 routerUsed,) = RollingWindow24h.used(_routerBuyWindow[person]);
        used += routerUsed;
        return used >= BUY_CAP_DAY_USD6 ? 0 : BUY_CAP_DAY_USD6 - used;
    }

    /// @notice Rolling-24h buys trusted routers made for the person bound to `a`: amount and count.
    function routerUsage24h(address a) external view returns (uint256 boughtUsd6, uint256 buys) {
        return RollingWindow24h.used(_routerBuyWindow[personOf[a]]);
    }

    /// @notice Rolling-24h usage of the person bound to `a`: amounts and number of own buys (router
    /// buys: `routerUsage24h`) and sell-backs.
    function usage24h(address a)
        external
        view
        returns (uint256 boughtUsd6, uint256 buys, uint256 soldGrossUsd6, uint256 sells)
    {
        bytes32 person = personOf[a];
        (boughtUsd6, buys) = RollingWindow24h.used(_buyWindow[person]);
        (soldGrossUsd6, sells) = RollingWindow24h.used(_sellWindow[person]);
    }

    function lastBuyAt(address a) public view returns (uint64) {
        return _lastBuyAt[personOf[a]];
    }

    function nextBuyAt(address a) external view returns (uint256) {
        uint64 last = lastBuyAt(a);
        return last == 0 ? 0 : uint256(last) + BUY_COOLDOWN;
    }

    function lotHead(address a) external view returns (uint256) {
        return _lotHead[personOf[a]];
    }

    function lotCount(address a) external view returns (uint256) {
        return _lots[personOf[a]].length;
    }

    function lots(address a, uint256 from, uint256 n) external view returns (Lot[] memory out) {
        Lot[] storage ls = _lots[personOf[a]];
        if (from >= ls.length) return out;
        if (n > ls.length - from) n = ls.length - from;
        out = new Lot[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = ls[from + i];
        }
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

    /// @dev The global 2%-of-reserve sell-back cap counts per UTC calendar day (Q5; not part of A4).
    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
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

    /// @dev Checks and consumes a `MainnetReturn` attestation for exactly `pplIn` PPL of `person`
    /// paid out to `msg.sender` (see `sellBack`).
    function _consumeReturn(bytes32 person, uint256 pplIn, bytes32 returnId, uint256 deadline, bytes calldata sig)
        internal
    {
        address signer = returnVerifier;
        if (signer == address(0)) revert SellBackDisabled();
        if (block.timestamp > deadline) revert Expired();
        if (returnUsed[returnId]) revert ReturnUsed();
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(MAINNET_RETURN_TYPEHASH, person, msg.sender, pplIn, PEOPLE_CHAIN_ID, returnId, deadline)
            )
        );
        if (ECDSA.recover(digest, sig) != signer) revert BadSignature();
        returnUsed[returnId] = true;
        emit MainnetReturnConsumed(returnId, person, pplIn);
    }

    /// @dev FIFO from the person's lot head; only lots past HOLD; at most MAX_LOTS_PER_SELL lots touched.
    function _consumeLots(bytes32 person, uint256 pplIn) internal {
        Lot[] storage ls = _lots[person];
        uint256 end = ls.length;
        uint256 i = _lotHead[person];
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
        _lotHead[person] = i;
    }
}
