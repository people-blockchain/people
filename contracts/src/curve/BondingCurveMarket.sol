// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CurveMath} from "../libs/CurveMath.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {IBondingCurveMarket} from "../interfaces/IBondingCurveMarket.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";
import {IPeopleRouter} from "../interfaces/ICreatorVesting.sol";
import {IPeopleAmmFactory} from "../interfaces/ICreatorVesting.sol";

contract BondingCurveMarket is IBondingCurveMarket, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @dev Canonical burn sink. Never the creator, never the treasury.
    address public constant BURN_ADDRESS = address(0xdead);

    event TokenRegistered(
        address indexed token,
        uint256 curveInventory,
        uint256 liquidityReserve,
        uint256 ecosystemReserve,
        uint8 leftoverMode
    );
    event CurveBuy(address indexed token, address indexed buyer, uint256 nativeIn, uint256 tokensOut, uint256 fee);
    event CurveSell(address indexed token, address indexed seller, uint256 tokensIn, uint256 nativeOut, uint256 fee);
    event CurveMigrated(address indexed token, address indexed pair, uint256 poolNative, uint256 poolToken);
    event EcosystemReserveWithdrawn(address indexed token, address indexed to, uint256 amount);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event TreasuryUpdated(address indexed treasury);
    event MigrationLeftoversSwept(address indexed token, address indexed to, uint256 amount);
    event CurveFinalized(address indexed token, address indexed vault, uint256 unsold);
    event UnsoldSentToCommunity(address indexed token, address indexed vault, uint256 amount);
    /// @notice Emitted when leftovers are burned (owner rule 2026-10-13, mode Burn).
    event LeftoversBurned(address indexed token, address indexed to, uint256 amount);
    event NativeDustSwept(address indexed token, address indexed to, uint256 amount);

    /// @notice Owner rule 2026-10-13: a curve that has not sold out (migrated) within this
    /// window after launch can be finalized by anyone; its unsold tokens go to the token's own
    /// community pool (`CommunityTokenVault`) or are burned, per the creator's launch choice.
    uint256 public constant FINALIZE_AFTER = 180 days;

    address public immutable core;
    /// @dev AUD-H4: storage, not `immutable` — see `setFeeRecipient`.
    address public feeRecipient;
    /// @notice AUD-M1: legacy destination for migrated-curve leftovers. Kept for ABI
    /// compatibility only; owner rule 2026-10-13 routes leftovers to burn or the token's own
    /// community pool — never to this address.
    address public treasury;
    IPeopleRouter public immutable router;
    IPeopleAmmFactory public immutable ammFactory;

    struct TokenCurve {
        CurveMath.State state;
        uint256 liquidityReserve;
        uint256 ecosystemReserve;
        uint256 curveInventory;
    }

    mapping(address => TokenCurve) public curves;
    /// @notice Launch time of each curve (set in `registerToken`).
    mapping(address => uint256) public launchedAt;
    /// @notice True once `finalize` closed a curve that did not sell out in time.
    mapping(address => bool) public finalized;
    /// @notice Owner rule 2026-10-13: per-token disposition of curve leftovers and unsold
    /// remainder. 0 = Burn (default), 1 = CommunityPool. Set at launch, immutable afterwards.
    mapping(address => uint8) public leftoverMode;

    /// @notice Native balance the market owes to curves: the sum of `actualNativeReserve` over
    /// every curve that has not migrated (migration moves the reserve into the AMM and zeroes it
    /// on the curve). A finalized curve is not migrated, so whatever reserve it still holds stays
    /// accounted — and out of reach of `sweepNativeDust` — until its holders sell back, even if
    /// they never do. Kept in lock-step with the per-curve state so `sweepNativeDust` can only
    /// ever take `balance - totalAccountedNative`.
    uint256 public totalAccountedNative;

    error Unauthorized();
    error UnknownToken();
    error InsufficientReserve();
    error ZeroFeeRecipient();
    error ZeroTreasury();
    error NotFinalizable();
    error InvalidLeftoverMode();
    /// @notice A curve for this token already exists; `registerToken` never overwrites one.
    error AlreadyRegistered();
    error Expired();
    /// @notice `minTokensOut` / `minNativeOut` of zero disables slippage protection entirely.
    error ZeroMinOut();
    error ZeroRecipient();
    /// @notice The dust sweep only runs against a finalized or migrated curve.
    error CurveNotSettled();
    error NothingToSweep();
    /// @notice The token is the native-PPL ERC-20 precompile or has no code, so it cannot be a curve token.
    error InvalidToken();

    modifier onlyFactory() {
        (bool ok, bytes memory data) = core.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        require(ok && msg.sender == abi.decode(data, (address)), "Unauthorized");
        _;
    }

    constructor(
        address core_,
        address feeRecipient_,
        IPeopleRouter router_,
        IPeopleAmmFactory ammFactory_,
        address initialOwner_,
        address treasury_
    ) Ownable(initialOwner_) {
        core = core_;
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        router = router_;
        ammFactory = ammFactory_;
        _setTreasury(treasury_);
    }

    /// @notice AUD-H4: rotate the destination of the 1% curve trading fee. It used to be
    /// `immutable`, so a wrong or compromised recipient — or one that stops accepting ETH, which
    /// reverts every buy and sell — could only be fixed by redeploying the whole market and
    /// stranding every live curve. Same shape and reason as `LavkaPayments.setBuckets` (M08-8).
    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }

    /// @notice AUD-M1: legacy setter kept for ABI compatibility. Owner rule 2026-10-13 means
    /// curve leftovers no longer route here — they burn or go to the token's own community pool.
    function setTreasury(address treasury_) external onlyOwner {
        _setTreasury(treasury_);
    }

    function _setTreasury(address treasury_) internal {
        if (treasury_ == address(0)) revert ZeroTreasury();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice M07-4: withdraw from a per-token ecosystem reserve. Gated to `owner()` —
    /// deployed as `PeopleMultisig` (2-of-3) initially, transferable to the `PeopleTimelock`
    /// DAO later via the standard `Ownable.transferOwnership`.
    function withdrawEcosystemReserve(address token, address to, uint256 amount) external onlyOwner {
        TokenCurve storage tc = curves[token];
        if (amount > tc.ecosystemReserve) revert InsufficientReserve();
        tc.ecosystemReserve -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit EcosystemReserveWithdrawn(token, to, amount);
    }

    function registerToken(
        address token,
        uint256 curveInventory,
        uint256 liquidityReserve,
        uint256 ecosystemReserve,
        uint8 leftoverMode_
    ) external onlyFactory {
        if (leftoverMode_ > uint8(LeftoverMode.CommunityPool)) revert InvalidLeftoverMode();
        // The native-PPL ERC-20 precompile (`transfer` there moves native balance) and code-less
        // addresses can never be curve tokens: `buy` would pay "tokens" out of other curves' native
        // reserves, or silently succeed against an EOA.
        if (token == PeopleConstants.NATIVE_PPL_ERC20 || token.code.length == 0) revert InvalidToken();
        // A token registers exactly once: re-registering would reset `state` (incl. `migrated`)
        // and `launchedAt`, e.g. through a swapped-in factory.
        if (launchedAt[token] != 0) revert AlreadyRegistered();
        TokenCurve storage tc = curves[token];
        tc.curveInventory = curveInventory;
        tc.liquidityReserve = liquidityReserve;
        tc.ecosystemReserve = ecosystemReserve;
        tc.state = CurveMath.initialState(curveInventory);
        launchedAt[token] = block.timestamp;
        leftoverMode[token] = leftoverMode_;
        emit TokenRegistered(token, curveInventory, liquidityReserve, ecosystemReserve, leftoverMode_);
    }

    /// @notice Owner-gated sweep of native dust (forced sends, `receive()` surplus, rounding)
    /// from the market. It only ever moves `balance - totalAccountedNative`, so no active
    /// curve's reserve, and no reserve a finalized curve still owes to sellers, can be touched.
    /// @dev Dust accounting is global, not per token: the surplus is not attributable to any one
    /// curve. The `token` argument is only a gate: it must name a finalized or migrated curve,
    /// so at least one such curve must exist. It does not scope the amount swept to that token,
    /// and any settled token unlocks the same global surplus.
    function sweepNativeDust(address token, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroRecipient();
        if (!finalized[token] && !curves[token].state.migrated) revert CurveNotSettled();
        uint256 bal = address(this).balance;
        uint256 accounted = totalAccountedNative;
        if (bal <= accounted) revert NothingToSweep();
        uint256 dust = bal - accounted;
        (bool sent,) = to.call{value: dust}("");
        require(sent, "sweep");
        emit NativeDustSwept(token, to, dust);
    }

    function buy(address token, uint256 minTokensOut, uint256 deadline) external payable nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        if (minTokensOut == 0) revert ZeroMinOut();
        TokenCurve storage tc = _requireActive(token);
        (uint256 tokensOut, uint256 fee, uint256 netIn, CurveMath.State memory next, bool migrate) =
            CurveMath.calculateBuy(tc.state, msg.value, minTokensOut);
        totalAccountedNative += netIn;
        tc.state = next;
        if (fee > 0) {
            (bool sent,) = feeRecipient.call{value: fee}("");
            require(sent, "fee");
        }
        IERC20(token).safeTransfer(msg.sender, tokensOut);
        emit CurveBuy(token, msg.sender, msg.value, tokensOut, fee);
        if (migrate) {
            _migrate(token, tc);
        }
    }

    function sell(address token, uint256 tokenAmount, uint256 minNativeOut, uint256 deadline) external nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        if (minNativeOut == 0) revert ZeroMinOut();
        // After `finalize`, holders can still sell back to the curve (their PPL stays claimable);
        // buying is closed and the tokens sold back are forwarded to the community pool.
        // NOTE: this is a user sell, not a leftover — it always goes to the community pool and
        // is deliberately NOT routed through `_disposeLeftovers` / `leftoverMode`.
        bool isFinal = finalized[token];
        TokenCurve storage tc = isFinal ? curves[token] : _requireActive(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        CurveMath.State memory cur = tc.state;
        if (isFinal) cur.active = true; // pricing only; the stored curve stays closed to buys
        (uint256 netOut, uint256 fee, uint256 grossOut, CurveMath.State memory next) =
            CurveMath.calculateSell(cur, tokenAmount, minNativeOut);
        totalAccountedNative -= grossOut;
        if (isFinal) next.active = false;
        tc.state = next;
        if (fee > 0) {
            (bool sent,) = feeRecipient.call{value: fee}("");
            require(sent, "fee");
        }
        (bool pay,) = msg.sender.call{value: netOut}("");
        require(pay, "payout");
        emit CurveSell(token, msg.sender, tokenAmount, netOut, fee);
        if (isFinal) {
            _sendToCommunity(token, tokenAmount);
        }
    }

    /// @notice True when `finalize(token)` would succeed.
    function canFinalize(address token) public view returns (bool) {
        TokenCurve storage tc = curves[token];
        return tc.state.active && !tc.state.migrated && launchedAt[token] != 0
            && block.timestamp >= launchedAt[token] + FINALIZE_AFTER;
    }

    /// @notice Permissionless: close a curve that did not sell out within `FINALIZE_AFTER` of
    /// launch. Buying stops; every unsold token the curve holds (except the ecosystem reserve,
    /// which keeps its own `onlyOwner` path) is disposed of per the creator's launch choice:
    /// burned (default) or sent to the token's own community pool. Never the creator, never
    /// the treasury.
    function finalize(address token) external nonReentrant {
        if (!canFinalize(token)) revert NotFinalizable();
        TokenCurve storage tc = curves[token];
        tc.state.active = false;
        finalized[token] = true;
        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 unsold = held > tc.ecosystemReserve ? held - tc.ecosystemReserve : 0;
        tc.curveInventory = 0;
        tc.liquidityReserve = 0;
        address dest = _disposeLeftovers(token, unsold);
        emit CurveFinalized(token, dest, unsold);
    }

    /// @notice Owner rule 2026-10-13: route curve leftovers (post-migration sweep and 180-day
    /// finalize) according to the creator's launch choice. Burn (0) sends to 0xdead;
    /// CommunityPool (1) sends to the token's own `CommunityTokenVault`. Never the creator,
    /// never the treasury.
    function _disposeLeftovers(address token, uint256 amount) internal returns (address dest) {
        if (leftoverMode[token] == uint8(LeftoverMode.CommunityPool)) {
            return _sendToCommunity(token, amount);
        }
        // Burn (default).
        if (amount == 0) return BURN_ADDRESS;
        IERC20(token).safeTransfer(BURN_ADDRESS, amount);
        emit LeftoversBurned(token, BURN_ADDRESS, amount);
        return BURN_ADDRESS;
    }

    function _sendToCommunity(address token, uint256 amount) internal returns (address vault) {
        (bool ok, bytes memory data) = core.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        require(ok, "factory");
        address factory = abi.decode(data, (address));
        (ok, data) = factory.staticcall(abi.encodeWithSignature("communityVault()"));
        require(ok, "vault");
        vault = abi.decode(data, (address));
        if (amount == 0) return vault;
        IERC20(token).forceApprove(vault, amount);
        ICommunityTokenVault(vault).deposit(token, amount);
        emit UnsoldSentToCommunity(token, vault, amount);
    }

    function quoteBuy(address token, uint256 nativeIn)
        external
        view
        returns (uint256 tokensOut, uint256 fee)
    {
        TokenCurve storage tc = curves[token];
        (tokensOut, fee,,,) = CurveMath.calculateBuy(tc.state, nativeIn, 0);
    }

    function quoteSell(address token, uint256 tokenIn) external view returns (uint256 nativeOut, uint256 fee) {
        TokenCurve storage tc = curves[token];
        (nativeOut, fee,,) = CurveMath.calculateSell(tc.state, tokenIn, 0);
    }

    /// @notice True once the curve moved its liquidity into the AMM (AMM factory gate, M07-2).
    function isMigrated(address token) external view returns (bool) {
        return curves[token].state.migrated;
    }

    function _migrate(address token, TokenCurve storage tc) internal {
        tc.state.active = false;
        tc.state.migrated = true;
        (uint256 poolNative, uint256 poolToken, uint256 fromLiq, uint256 fromCurve) =
            CurveMath.calculateMigration(tc.state, tc.liquidityReserve);
        totalAccountedNative -= poolNative;
        // The reserve now lives in the AMM pool; zero it so the `curves()` getter does not
        // report native the market no longer holds. Nothing reads it afterwards: buy/sell revert
        // on a migrated curve and `calculateMigration` above has already consumed it.
        tc.state.actualNativeReserve = 0;
        tc.liquidityReserve -= fromLiq;
        tc.curveInventory -= fromCurve;

        address wppl = router.WETH();
        address pair = ammFactory.getPair(token, wppl);
        if (pair == address(0)) {
            pair = ammFactory.createPair(token, wppl);
        }

        IERC20(token).forceApprove(address(router), poolToken);
        router.addLiquidityETH{value: poolNative}(token, poolToken, poolToken, poolNative, address(0xdead), block.timestamp + 600);
        emit CurveMigrated(token, pair, poolNative, poolToken);

        // Owner rule 2026-10-13: whatever the curve still holds after seeding the pool — the
        // unsold curve inventory plus the unused liquidity reserve — is disposed of per the
        // creator's launch choice: burned (default) or sent to the token's own community pool.
        // Never the creator, never the treasury.
        //
        // Measured against the real token balance, not `curveInventory + liquidityReserve`:
        // `curveInventory` is only decremented here, never by the buys that drew the curve down,
        // so the two fields overstate what is actually held. `balanceOf(this) - ecosystemReserve`
        // is exactly the stranded amount. Note `_migrate` runs with `tc.state.migrated == true`,
        // so the reserve fields are dead afterwards — clearing them keeps the getter honest.
        // State is updated before the transfer (CEI).
        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 leftover = held > tc.ecosystemReserve ? held - tc.ecosystemReserve : 0;
        if (leftover > 0) {
            tc.curveInventory = 0;
            tc.liquidityReserve = 0;
            address dest = _disposeLeftovers(token, leftover);
            emit MigrationLeftoversSwept(token, dest, leftover);
        }
    }

    function _requireActive(address token) internal view returns (TokenCurve storage tc) {
        tc = curves[token];
        if (tc.state.active == false && tc.state.migrated == false) revert UnknownToken();
        if (!tc.state.active) revert UnknownToken();
    }

    receive() external payable {}
}
