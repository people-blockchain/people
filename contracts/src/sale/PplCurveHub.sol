// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Fixed-point math for the PPL exponential curve. Only `ln` is needed on-chain: the sale
/// stores the USD raised and derives PPL sold through the inverse of the integral of the price.
library PplCurveMath {
    uint256 internal constant WAD = 1e18;
    /// @dev log2(e) in wad, as in PRBMath.
    uint256 internal constant LOG2_E = 1_442695040888963407;
    /// @dev k = ln(50) / 100 per million PPL, in wad (ln 50 = 3.912023005428146058...).
    uint256 internal constant K_WAD = 39_120230054281461;
    /// @dev p0 = 0.005 USD per PPL, in wad.
    uint256 internal constant P0_WAD = 5e15;

    /// @notice Natural log of a wad `x >= 1e18`, rounded down (PRBMath log2 algorithm).
    function lnWad(uint256 x) internal pure returns (uint256) {
        require(x >= WAD, "ln<1");
        uint256 n = _msb(x / WAD);
        uint256 result = n * WAD;
        uint256 y = x >> n;
        if (y == WAD) return (result * WAD) / LOG2_E;
        for (uint256 delta = WAD / 2; delta > 0; delta >>= 1) {
            y = (y * y) / WAD;
            if (y >= 2 * WAD) {
                result += delta;
                y >>= 1;
            }
        }
        return (result * WAD) / LOG2_E;
    }

    /// @notice PPL sold (wad) once `raisedUsd6` USD (6 decimals) has been raised:
    /// sold = ln(1 + R*k / (p0*1e6)) / k millions, rounded down.
    function soldForRaised(uint256 raisedUsd6) internal pure returns (uint256) {
        if (raisedUsd6 == 0) return 0;
        uint256 raisedWad = raisedUsd6 * 1e12;
        uint256 term = (raisedWad * K_WAD) / (P0_WAD * 1e6);
        // ln is in wad of "millions of PPL * k"; * 1e6 converts millions to PPL.
        return (lnWad(WAD + term) * 1e24) / K_WAD;
    }

    function _msb(uint256 x) private pure returns (uint256 n) {
        if (x >= 2 ** 128) { x >>= 128; n += 128; }
        if (x >= 2 ** 64) { x >>= 64; n += 64; }
        if (x >= 2 ** 32) { x >>= 32; n += 32; }
        if (x >= 2 ** 16) { x >>= 16; n += 16; }
        if (x >= 2 ** 8) { x >>= 8; n += 8; }
        if (x >= 2 ** 4) { x >>= 4; n += 4; }
        if (x >= 2 ** 2) { x >>= 2; n += 2; }
        if (x >= 2 ** 1) { n += 1; }
    }
}

/// @title PplCurveHub
/// @notice Base-chain bonding-curve sale of PPL allocation for allowlisted stablecoins. Matches the
/// website model (`curve.ts`): price(x) = p0 * e^(k*x), x in millions of PPL, p0 = 0.005 USD,
/// k = ln(50)/100. The curve closes ("graduates") once 4,000,000 USD has been raised.
///
/// PPL is NOT transferred on Base: purchases are recorded in `purchasedOf` and delivered on the
/// People chain off this contract. Stablecoins go straight to the immutable `treasury`; the hub
/// never holds funds.
///
/// Peg assumption: every allowlisted token is valued at exactly 1 USD. The owner must remove a token
/// with `setToken(token, false)` if it depegs.
///
/// TODO v2: sell-back (SELL_BACK in website config) — not implemented, no sell-back in v1.
contract PplCurveHub is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Min / max USD value (6 decimals) of one purchase, as requested.
    uint256 public constant MIN_BUY_USD6 = 10e6;
    uint256 public constant MAX_BUY_USD6 = 500e6;
    /// @notice Max USD value one address may buy in any rolling WINDOW.
    uint256 public constant DAILY_CAP_USD6 = 2_000e6;
    /// @notice Min gap between two purchases of the same address.
    uint256 public constant COOLDOWN = 60;
    uint256 public constant WINDOW = 24 hours;
    /// @notice The sale runs 24 months from `open`; the term is never extended.
    uint256 public constant TERM = 730 days;
    /// @notice The curve graduates once this much USD (6 decimals) has been raised.
    uint256 public constant RAISE_CAP_USD6 = 4_000_000e6;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    struct TokenInfo {
        bool allowed;
        uint8 decimals;
    }

    /// @dev One slot: purchase time and USD6 value.
    struct Entry {
        uint40 ts;
        uint216 usd6;
    }

    /// @dev One slot per buyer: head index into `_entries`, USD6 still inside the window, last purchase time.
    struct UserState {
        uint40 lastBuyAt;
        uint32 head;
        uint184 windowSum;
    }

    address public immutable treasury;

    uint256 public openedAt;
    bool public graduated;
    uint256 public raisedUsd6;
    /// @notice PPL sold so far (18 decimals).
    uint256 public soldPpl;

    mapping(address => TokenInfo) public tokenInfo;
    /// @notice PPL (18 decimals) bought by an address; delivered on the People chain.
    mapping(address => uint256) public purchasedOf;

    mapping(address => UserState) internal _users;
    mapping(address => Entry[]) internal _entries;

    /*//////////////////////////////////////////////////////////////
                              EVENTS / ERRORS
    //////////////////////////////////////////////////////////////*/

    event Bought(address indexed buyer, address token, uint256 amountIn, uint256 pplOut);
    event TokenSet(address indexed token, bool allowed, uint8 decimals);
    event SaleOpened(uint256 openedAt, uint256 closesAt);
    event Graduated(uint256 raisedUsd6, uint256 soldPpl);
    event TokenRescued(address indexed token, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error AlreadyOpened();
    error NotOpen();
    error SaleEnded();
    error SoldOut();
    error TokenNotAllowed();
    error BadDecimals();
    error BelowMin();
    error AboveMax();
    error DailyCapExceeded();
    error Cooldown();
    error Slippage();
    error TransferMismatch();
    error RenounceDisabled();

    constructor(address owner_, address treasury_) Ownable(owner_) {
        if (owner_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    /// @notice Disabled: renouncing would leave the hub without an owner (no pause, no depeg response).
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Opens the 24-month window once.
    function open() external onlyOwner {
        if (openedAt != 0) revert AlreadyOpened();
        openedAt = block.timestamp;
        emit SaleOpened(block.timestamp, block.timestamp + TERM);
    }

    /// @notice Allows or disables a payment token. Enabling reads and stores its decimals (1..18).
    /// Every allowed token is treated as exactly 1 USD (peg assumption).
    function setToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        uint8 d;
        if (allowed) {
            d = IERC20Metadata(token).decimals();
            if (d < 1 || d > 18) revert BadDecimals();
        }
        tokenInfo[token] = TokenInfo({allowed: allowed, decimals: d});
        emit TokenSet(token, allowed, d);
    }

    /// @notice Sends tokens that were sent here by mistake to the treasury.
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(treasury, amount);
        emit TokenRescued(token, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                   BUY
    //////////////////////////////////////////////////////////////*/

    /// @notice Buys PPL with `amountIn` of an allowlisted stablecoin (token units). If the request
    /// exceeds what is left to raise, only the remainder is charged and the curve graduates.
    /// Dust below 1 USD6 unit (tokens with more than 6 decimals) is not charged.
    /// @return pplOut PPL bought (18 decimals), rounded down.
    function buyWith(address token, uint256 amountIn, uint256 minPplOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 pplOut)
    {
        // ---- checks
        if (openedAt == 0) revert NotOpen();
        if (graduated) revert SoldOut();
        if (block.timestamp >= openedAt + TERM) revert SaleEnded();
        if (amountIn == 0) revert ZeroAmount();
        TokenInfo memory info = tokenInfo[token];
        if (!info.allowed) revert TokenNotAllowed();

        uint256 requested = _toUsd6(amountIn, info.decimals);
        if (requested < MIN_BUY_USD6) revert BelowMin();
        if (requested > MAX_BUY_USD6) revert AboveMax();

        UserState memory u = _users[msg.sender];
        if (u.lastBuyAt != 0 && block.timestamp < uint256(u.lastBuyAt) + COOLDOWN) revert Cooldown();

        (uint256 usd6, uint256 charged, uint256 newSold) = _fill(requested, amountIn, info.decimals);
        pplOut = newSold - soldPpl;
        if (pplOut == 0 || pplOut < minPplOut) revert Slippage();

        // rolling window: drop expired entries, then check the cap
        Entry[] storage list = _entries[msg.sender];
        uint256 head = u.head;
        uint256 sum = u.windowSum;
        uint256 len = list.length;
        while (head < len && uint256(list[head].ts) + WINDOW <= block.timestamp) {
            sum -= list[head].usd6;
            delete list[head];
            unchecked {
                ++head;
            }
        }
        if (sum + usd6 > DAILY_CAP_USD6) revert DailyCapExceeded();

        // ---- effects
        _users[msg.sender] = UserState({
            lastBuyAt: uint40(block.timestamp), head: uint32(head), windowSum: uint184(sum + usd6)
        });
        list.push(Entry({ts: uint40(block.timestamp), usd6: uint216(usd6)}));
        raisedUsd6 += usd6;
        soldPpl = newSold;
        purchasedOf[msg.sender] += pplOut;
        bool grad = raisedUsd6 >= RAISE_CAP_USD6;
        if (grad) graduated = true;

        // ---- interactions
        IERC20 t = IERC20(token);
        uint256 balBefore = t.balanceOf(treasury);
        t.safeTransferFrom(msg.sender, treasury, charged);
        if (t.balanceOf(treasury) - balBefore != charged) revert TransferMismatch();

        emit Bought(msg.sender, token, charged, pplOut);
        if (grad) emit Graduated(raisedUsd6, newSold);
    }

    /// @notice PPL out (18 decimals) for `amountIn` token units against the current curve state.
    /// Applies token, normalisation and partial-fill rules; per-address limits (min/max, cap,
    /// cooldown) and the sale window are not checked. Returns 0 once the curve has graduated.
    function quoteBuy(address token, uint256 amountIn) external view returns (uint256 pplOut) {
        TokenInfo memory info = tokenInfo[token];
        if (!info.allowed) revert TokenNotAllowed();
        if (amountIn == 0) revert ZeroAmount();
        if (graduated) return 0;
        uint256 requested = _toUsd6(amountIn, info.decimals);
        if (requested == 0) return 0;
        (,, uint256 newSold) = _fill(requested, amountIn, info.decimals);
        return newSold - soldPpl;
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Total PPL sold (18 decimals); same as `soldPpl`.
    function totalPurchasedPpl() external view returns (uint256) {
        return soldPpl;
    }

    function closesAt() public view returns (uint256) {
        return openedAt == 0 ? 0 : openedAt + TERM;
    }

    function isActive() public view returns (bool) {
        return openedAt != 0 && !graduated && block.timestamp < openedAt + TERM;
    }

    function remainingRaiseUsd6() public view returns (uint256) {
        return RAISE_CAP_USD6 - raisedUsd6;
    }

    /// @notice USD6 `who` bought inside the rolling window ending now.
    function dailyUsed(address who) public view returns (uint256 sum) {
        UserState memory u = _users[who];
        sum = u.windowSum;
        Entry[] storage list = _entries[who];
        uint256 len = list.length;
        for (uint256 i = u.head; i < len; ++i) {
            Entry memory e = list[i];
            if (uint256(e.ts) + WINDOW > block.timestamp) break;
            sum -= e.usd6;
        }
    }

    /// @notice Earliest time `who` may buy again (0 if never bought).
    function nextBuyAt(address who) external view returns (uint256) {
        uint40 last = _users[who].lastBuyAt;
        return last == 0 ? 0 : uint256(last) + COOLDOWN;
    }

    /*//////////////////////////////////////////////////////////////
                                 INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @dev Token units to USD6 (1 token = 1 USD), rounded down.
    function _toUsd6(uint256 amountIn, uint8 d) internal pure returns (uint256) {
        if (d > 6) return amountIn / (10 ** (d - 6));
        return amountIn * (10 ** (6 - d));
    }

    /// @dev Applies the partial fill and the curve. Returns USD6 added to the raise, token units
    /// charged and the new total sold. Rounds in favour of the protocol.
    function _fill(uint256 requested, uint256 amountIn, uint8 d)
        internal
        view
        returns (uint256 usd6, uint256 charged, uint256 newSold)
    {
        uint256 remaining = RAISE_CAP_USD6 - raisedUsd6;
        if (requested > remaining) {
            usd6 = remaining;
            // d > 6: exact; d < 6: round up to a whole token unit (never more than amountIn)
            charged = d >= 6
                ? remaining * (10 ** (d - 6))
                : (remaining + 10 ** (6 - d) - 1) / (10 ** (6 - d));
        } else {
            usd6 = requested;
            charged = d > 6 ? requested * (10 ** (d - 6)) : amountIn;
        }
        newSold = PplCurveMath.soldForRaised(raisedUsd6 + usd6);
        if (newSold < soldPpl) newSold = soldPpl;
    }
}
