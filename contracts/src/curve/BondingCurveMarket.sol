// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CurveMath} from "../libs/CurveMath.sol";
import {IBondingCurveMarket} from "../interfaces/IBondingCurveMarket.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";
import {IPeopleRouter} from "../interfaces/ICreatorVesting.sol";
import {IPeopleAmmFactory} from "../interfaces/ICreatorVesting.sol";

contract BondingCurveMarket is IBondingCurveMarket, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    event TokenRegistered(address indexed token, uint256 curveInventory, uint256 liquidityReserve, uint256 ecosystemReserve);
    event CurveBuy(address indexed token, address indexed buyer, uint256 nativeIn, uint256 tokensOut, uint256 fee);
    event CurveSell(address indexed token, address indexed seller, uint256 tokensIn, uint256 nativeOut, uint256 fee);
    event CurveMigrated(address indexed token, address indexed pair, uint256 poolNative, uint256 poolToken);
    event EcosystemReserveWithdrawn(address indexed token, address indexed to, uint256 amount);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event TreasuryUpdated(address indexed treasury);
    event MigrationLeftoversSwept(address indexed token, address indexed to, uint256 amount);
    event CurveFinalized(address indexed token, address indexed vault, uint256 unsold);
    event UnsoldSentToCommunity(address indexed token, address indexed vault, uint256 amount);

    /// @notice Owner rule 2026-10-13: a curve that has not sold out (migrated) within this
    /// window after launch can be finalized by anyone; its unsold tokens go to the token's own
    /// community pool (`CommunityTokenVault`).
    uint256 public constant FINALIZE_AFTER = 180 days;

    address public immutable core;
    /// @dev AUD-H4: storage, not `immutable` — see `setFeeRecipient`.
    address public feeRecipient;
    /// @notice AUD-M1: destination for the tokens a curve still holds when it migrates — the
    /// unsold curve inventory plus the unused part of the liquidity reserve. They used to be
    /// stranded in this contract forever (`withdrawEcosystemReserve` only reaches
    /// `ecosystemReserve`). Owner decision 2026-10-13: they go to the token's community pool; kept for ABI compatibility.
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

    error Unauthorized();
    error UnknownToken();
    error InsufficientReserve();
    error ZeroFeeRecipient();
    error ZeroTreasury();
    error NotFinalizable();

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

    /// @notice AUD-M1: rotate the destination of a migrated curve's leftover tokens. Storage,
    /// not a constructor-only value, for the same reason as `setFeeRecipient` — a wrong or
    /// compromised recipient must be correctable without redeploying the market.
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
        uint256 ecosystemReserve
    ) external onlyFactory {
        TokenCurve storage tc = curves[token];
        tc.curveInventory = curveInventory;
        tc.liquidityReserve = liquidityReserve;
        tc.ecosystemReserve = ecosystemReserve;
        tc.state = CurveMath.initialState(curveInventory);
        launchedAt[token] = block.timestamp;
        emit TokenRegistered(token, curveInventory, liquidityReserve, ecosystemReserve);
    }

    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        TokenCurve storage tc = _requireActive(token);
        (uint256 tokensOut, uint256 fee, uint256 netIn, CurveMath.State memory next, bool migrate) =
            CurveMath.calculateBuy(tc.state, msg.value, minTokensOut);
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

    function sell(address token, uint256 tokenAmount, uint256 minNativeOut) external nonReentrant {
        // After `finalize`, holders can still sell back to the curve (their PPL stays claimable);
        // buying is closed and the tokens sold back are forwarded to the community pool.
        bool isFinal = finalized[token];
        TokenCurve storage tc = isFinal ? curves[token] : _requireActive(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        CurveMath.State memory cur = tc.state;
        if (isFinal) cur.active = true; // pricing only; the stored curve stays closed to buys
        (uint256 netOut, uint256 fee,, CurveMath.State memory next) =
            CurveMath.calculateSell(cur, tokenAmount, minNativeOut);
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
    /// which keeps its own `onlyOwner` path) goes to the token's community pool.
    function finalize(address token) external nonReentrant {
        if (!canFinalize(token)) revert NotFinalizable();
        TokenCurve storage tc = curves[token];
        tc.state.active = false;
        finalized[token] = true;
        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 unsold = held > tc.ecosystemReserve ? held - tc.ecosystemReserve : 0;
        tc.curveInventory = 0;
        tc.liquidityReserve = 0;
        address vault = _sendToCommunity(token, unsold);
        emit CurveFinalized(token, vault, unsold);
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

        // AUD-M1: whatever the curve still holds after seeding the pool — the unsold curve
        // inventory plus the unused liquidity reserve — is swept to the treasury instead of
        // being stranded in this contract (nothing could withdraw it: `withdrawEcosystemReserve`
        // is bounded by `ecosystemReserve`, which is deliberately kept back here and keeps its
        // own `onlyOwner` path).
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
            // Owner decision 2026-10-13: leftovers go to the token's own community pool.
            address vault = _sendToCommunity(token, leftover);
            emit MigrationLeftoversSwept(token, vault, leftover);
        }
    }

    function _requireActive(address token) internal view returns (TokenCurve storage tc) {
        tc = curves[token];
        if (tc.state.active == false && tc.state.migrated == false) revert UnknownToken();
        if (!tc.state.active) revert UnknownToken();
    }

    receive() external payable {}
}
