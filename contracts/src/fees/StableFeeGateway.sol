// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PeopleConstants} from "../PeopleConstants.sol";

/// @notice Read-only view onto `TokenFactory.tokenCreateFee()`. Declared `view` (not `pure`) on
/// purpose: the deployed factory happens to return a constant today, but the gateway must not
/// assume that forever — a future factory could price the PPL fee from state.
interface ITokenFactoryFee {
    function tokenCreateFee() external view returns (uint256);
}

/// @notice Read-only view onto `NftFactory.mintFee()`, same reasoning as `ITokenFactoryFee`.
interface INftFactoryFee {
    function mintFee() external view returns (uint256);
}

/// @notice C-01/S1-02: the PPL leg is never paid to `msg.sender` directly. Instead it is credited
/// on the factory against the payer's *next* `createToken`/`mint` call, so no native PPL can ever
/// leave the gateway's float without a token or NFT actually being created in a follow-up
/// transaction by that same payer.
interface IPrepayableFactory {
    function creditPrepaidFee(address payer) external payable;
}

/// @notice Accepts a fixed USD stablecoin fee for a token/NFT launch, routes 100% of it to the
/// public PPL buyback recipient, and credits the caller the equivalent PPL launch fee on the
/// relevant factory so the caller can then call the unchanged `TokenFactory` / `NftFactory`
/// directly — keeping `msg.sender` (and therefore the on-chain "creator") the end user, not this
/// gateway. See `docs/design/buyback.md` §5 for why the factories cannot be called on the user's
/// behalf without this two-step shape.
///
/// C-01/S1-02 fix: the PPL leg used to be a raw native transfer to `msg.sender`, with nothing
/// requiring that a token or NFT was ever created — a standing, unconditional stable→PPL vending
/// machine, free whenever the allow-listed stable was itself a public faucet. The PPL now moves
/// gateway → factory as a non-withdrawable credit (`IPrepayableFactory.creditPrepaidFee`) that
/// only `createToken`/`mint` can consume, and only against that same payer's own launch. No PPL
/// ever leaves the protocol's contracts without a launch happening in the same credit's lifetime.
///
/// The stable fee is a fixed USD amount (6 decimals), owner-settable, and intentionally
/// independent of the PPL market price — a future oracle/pool-based pricing model can replace
/// the fixed amount without changing this contract's interface. The PPL amount credited is
/// always read live from the factory via `_pplFee`, never cached, so a factory-side fee change
/// takes effect immediately.
contract StableFeeGateway is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Kind {
        TOKEN_LAUNCH,
        NFT_MINT
    }

    uint256 public constant MIN_STABLE_FEE_USD6 = 1e4; // 0.01 USD
    uint256 public constant MAX_STABLE_FEE_USD6 = 100e6; // 100 USD
    uint256 public constant DEFAULT_DAILY_CALL_CAP = 5;

    address public immutable tokenFactory;
    address public immutable nftFactory;

    address public buybackRecipient;
    uint256 public dailyCallCap;

    mapping(address => bool) public isAcceptedStable;
    mapping(Kind => uint256) public stableFeeUsd6;

    /// @dev `day` is `block.timestamp / 1 days`; `count` resets implicitly when `day` advances.
    mapping(address => uint256) public lastCallDay;
    mapping(address => uint256) public callsToday;

    event StableAllowedSet(address indexed stable, bool allowed);
    event StableFeeSet(Kind indexed kind, uint256 amountUsd6);
    event BuybackRecipientSet(address indexed recipient);
    event DailyCallCapSet(uint256 cap);
    event FloatWithdrawn(address indexed to, uint256 amount);
    event FloatReceived(address indexed from, uint256 amount);
    event ERC20Rescued(address indexed token, address indexed to, uint256 amount);
    event StableFeePaid(
        address indexed payer, Kind indexed kind, address indexed stable, uint256 stableAmount, uint256 pplAmount
    );

    error ZeroAddress();
    error NonSixDecimals(uint8 decimals);
    error StableNotAccepted(address stable);
    error FeeOutOfBounds(uint256 amountUsd6);
    error DailyCapExceeded(address payer);
    error InsufficientFloat(uint256 requested, uint256 available);
    error PplTransferFailed();
    /// @notice `rescueERC20` was pointed at the native-PPL ERC-20 precompile.
    error NativeTokenNotRescuable();
    /// @notice A rescued token's transfer changed the gateway's native balance.
    error NativeBalanceChanged();

    constructor(
        address owner_,
        address buybackRecipient_,
        address tokenFactory_,
        address nftFactory_,
        uint256 tokenStableFeeUsd6,
        uint256 nftStableFeeUsd6
    ) Ownable(owner_) {
        if (buybackRecipient_ == address(0) || tokenFactory_ == address(0) || nftFactory_ == address(0)) {
            revert ZeroAddress();
        }
        buybackRecipient = buybackRecipient_;
        tokenFactory = tokenFactory_;
        nftFactory = nftFactory_;
        dailyCallCap = DEFAULT_DAILY_CALL_CAP;
        _setStableFee(Kind.TOKEN_LAUNCH, tokenStableFeeUsd6);
        _setStableFee(Kind.NFT_MINT, nftStableFeeUsd6);
    }

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Allow or disallow a stablecoin. Only ever allows ERC-20s reporting exactly 6
    /// decimals, matching tUSDC/tUSDT on testnet and USDC/USDT on mainnet — a token with a
    /// different decimal count would silently mis-price `stableFeeUsd6` against `safeTransferFrom`.
    function setStableAllowed(address stable, bool allowed) external onlyOwner {
        if (stable == address(0)) revert ZeroAddress();
        if (allowed) {
            uint8 dec = IERC20Metadata(stable).decimals();
            if (dec != 6) revert NonSixDecimals(dec);
        }
        isAcceptedStable[stable] = allowed;
        emit StableAllowedSet(stable, allowed);
    }

    function setStableFee(Kind kind, uint256 amountUsd6) external onlyOwner {
        _setStableFee(kind, amountUsd6);
    }

    function _setStableFee(Kind kind, uint256 amountUsd6) internal {
        if (amountUsd6 < MIN_STABLE_FEE_USD6 || amountUsd6 > MAX_STABLE_FEE_USD6) revert FeeOutOfBounds(amountUsd6);
        stableFeeUsd6[kind] = amountUsd6;
        emit StableFeeSet(kind, amountUsd6);
    }

    function setBuybackRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        buybackRecipient = recipient;
        emit BuybackRecipientSet(recipient);
    }

    function setDailyCallCap(uint256 cap) external onlyOwner {
        if (cap == 0) revert FeeOutOfBounds(cap);
        dailyCallCap = cap;
        emit DailyCallCapSet(cap);
    }

    /// @notice Withdraw PPL float back to the owner only — the gateway never sends its float
    /// anywhere else.
    function withdrawFloat(uint256 amount) external onlyOwner nonReentrant {
        address to = owner();
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert PplTransferFailed();
        emit FloatWithdrawn(to, amount);
    }

    /// @notice Recover ERC-20s sent to the gateway by mistake. The PPL float is the gateway's
    /// native balance, which an ERC-20 transfer can never touch — `withdrawFloat` stays the only
    /// path for it. The gateway's own address is refused so this can't be pointed at itself.
    /// On People chain the native PPL is also reachable as an ERC-20 precompile
    /// (`PeopleConstants.NATIVE_PPL_ERC20`), where `transfer` moves native balance: that address
    /// is refused outright, and the native balance must be identical before and after the token
    /// call, so no other token contract can drain the float through this function either.
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0) || token == address(this)) revert ZeroAddress();
        if (token == PeopleConstants.NATIVE_PPL_ERC20) revert NativeTokenNotRescuable();
        uint256 nativeBefore = address(this).balance;
        IERC20(token).safeTransfer(to, amount);
        if (address(this).balance != nativeBefore) revert NativeBalanceChanged();
        emit ERC20Rescued(token, to, amount);
    }

    // ---------------------------------------------------------------------
    // Fee source (live read, never cached)
    // ---------------------------------------------------------------------

    function pplFee(Kind kind) public view returns (uint256) {
        return _pplFee(kind);
    }

    function _pplFee(Kind kind) internal view returns (uint256) {
        if (kind == Kind.TOKEN_LAUNCH) return ITokenFactoryFee(tokenFactory).tokenCreateFee();
        return INftFactoryFee(nftFactory).mintFee();
    }

    // ---------------------------------------------------------------------
    // Core flow
    // ---------------------------------------------------------------------

    /// @notice Pull the fixed USD stable fee from the caller straight to `buybackRecipient`
    /// (100% of it — the treasury multisig splits the bought-back PPL 30/25/20/10/15 off-chain
    /// per `docs/design/buyback.md` §4), then credit the caller the live PPL launch fee on the
    /// relevant factory (`TokenFactory` or `NftFactory`). The caller is expected to immediately
    /// call the unchanged `TokenFactory.createToken` / `NftFactory.mint`, which consumes the
    /// credit against its fee — so the factory still records the caller as creator, and the PPL
    /// never leaves this gateway's float except into a factory that will spend it on an actual
    /// launch.
    function payLaunchFee(Kind kind, address stable) external nonReentrant whenNotPaused returns (uint256 pplAmount) {
        if (!isAcceptedStable[stable]) revert StableNotAccepted(stable);

        uint256 today = block.timestamp / 1 days;
        if (lastCallDay[msg.sender] != today) {
            lastCallDay[msg.sender] = today;
            callsToday[msg.sender] = 0;
        }
        if (callsToday[msg.sender] >= dailyCallCap) revert DailyCapExceeded(msg.sender);
        callsToday[msg.sender] += 1;

        uint256 stableAmount = stableFeeUsd6[kind];
        pplAmount = _pplFee(kind);
        if (address(this).balance < pplAmount) revert InsufficientFloat(pplAmount, address(this).balance);

        IERC20(stable).safeTransferFrom(msg.sender, buybackRecipient, stableAmount);

        address factory = kind == Kind.TOKEN_LAUNCH ? tokenFactory : nftFactory;
        IPrepayableFactory(factory).creditPrepaidFee{value: pplAmount}(msg.sender);

        emit StableFeePaid(msg.sender, kind, stable, stableAmount, pplAmount);
    }

    receive() external payable {
        emit FloatReceived(msg.sender, msg.value);
    }
}
