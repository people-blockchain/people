// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PeopleProjectToken} from "../token/PeopleProjectToken.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {CurveMath} from "../libs/CurveMath.sol";
import {IBondingCurveMarket} from "../interfaces/IBondingCurveMarket.sol";
import {ICreatorVesting} from "../interfaces/ICreatorVesting.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";
import {IPromoRewardsVault} from "../interfaces/IPromoRewardsVault.sol";

/// @notice Creates ERC-20 project tokens with the same allocation as `applyTokenCreate`.
contract TokenFactory is Ownable {
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply,
        CurveMath.Allocation allocation,
        uint8 leftoverMode
    );

    /// @dev AUD-H4: storage, not `immutable` — see `setFeeRecipient`.
    address public feeRecipient;
    IBondingCurveMarket public immutable bondingCurve;
    ICreatorVesting public immutable creatorVesting;
    ICommunityTokenVault public immutable communityVault;

    mapping(address => bool) public isPeopleToken;

    /// @notice C-01/S1-02: the only address allowed to call `creditPrepaidFee`. Set by the owner
    /// once `StableFeeGateway` is deployed; until then the credit path is simply unreachable.
    address public gateway;

    /// @notice Custodian for the optional creator promo share (owner decision 2026-10-13). Set
    /// by the owner once `PromoRewardsVault` is deployed — same shape and reason as `gateway`:
    /// the vault needs this factory's `communityVault`, so it is deployed after the factory.
    /// While unset, a launch with a non-zero promo share reverts with `PromoVaultNotSet`; the
    /// default 0% launch path never touches it.
    address public promoVault;

    /// @notice C-01/S1-02: PPL a payer has prepaid via `StableFeeGateway` and not yet consumed by
    /// a `createToken` call. Never withdrawable by anyone — only ever spent against this payer's
    /// own future launch fee — so no native PPL can leave this contract without a token being
    /// created in the same transaction.
    mapping(address => uint256) public prepaidCredit;

    event FeeRecipientUpdated(address indexed feeRecipient);
    event GatewaySet(address indexed gateway);
    event PrepaidCreditAdded(address indexed payer, uint256 amount);
    event PromoVaultSet(address indexed promoVault);
    /// @notice Emitted only when a launch actually sets aside a promo share, so a default 0%
    /// launch emits exactly the same logs it did before the option existed.
    event TokenPromoAllocated(address indexed token, address indexed creator, uint16 promoBps, uint256 amount);

    error InvalidParams();
    error InsufficientFee();
    error ZeroFeeRecipient();
    error ZeroGateway();
    error ZeroPromoVault();
    error PromoVaultNotSet();
    error Unauthorized();
    error InvalidLeftoverMode();

    constructor(
        address feeRecipient_,
        IBondingCurveMarket bondingCurve_,
        ICreatorVesting creatorVesting_,
        ICommunityTokenVault communityVault_,
        address initialOwner_
    ) Ownable(initialOwner_) {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        bondingCurve = bondingCurve_;
        creatorVesting = creatorVesting_;
        communityVault = communityVault_;
    }

    /// @notice AUD-H4: rotate the destination of the token-create fee. It used to be
    /// `immutable`, so a recipient that stops accepting ETH would make `createToken` revert
    /// forever with no fix short of redeploying the factory (and with it the registry wiring).
    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }

    function tokenCreateFee() external pure returns (uint256) {
        return PeopleConstants.TOKEN_CREATE_FEE;
    }

    /// @notice C-01/S1-02: rotate the trusted `StableFeeGateway`. Only this address may call
    /// `creditPrepaidFee`.
    function setGateway(address gateway_) external onlyOwner {
        if (gateway_ == address(0)) revert ZeroGateway();
        gateway = gateway_;
        emit GatewaySet(gateway_);
    }

    /// @notice Set or rotate the `PromoRewardsVault` that custodies optional promo shares.
    /// Storage rather than `immutable` for the same reason as `gateway`: the vault is deployed
    /// after this factory, and a retired vault must be replaceable without redeploying the
    /// factory (which would mean rewiring the registry and every live curve).
    /// @dev Rotating it does not move pools already registered in the old vault — those keep
    /// paying out awards under their own rules. It does, however, revoke the old vault's right
    /// to credit `CommunityTokenVault`, so before rotating, either wait out the 180-day promo
    /// windows still open there or have the community vault's owner re-authorize the old vault
    /// with `CommunityTokenVault.setLegacyPromoVault`, otherwise those remainders cannot be
    /// returned.
    function setPromoVault(address promoVault_) external onlyOwner {
        if (promoVault_ == address(0)) revert ZeroPromoVault();
        promoVault = promoVault_;
        emit PromoVaultSet(promoVault_);
    }

    /// @notice C-01/S1-02: called by `StableFeeGateway` with the live PPL launch fee as
    /// `msg.value`, crediting `payer` for a future `createToken` call instead of paying PPL out
    /// to the caller for free. The credit is only ever consumed by `createToken` against a real
    /// token creation — it cannot be withdrawn or redirected.
    function creditPrepaidFee(address payer) external payable {
        if (msg.sender != gateway) revert Unauthorized();
        prepaidCredit[payer] += msg.value;
        emit PrepaidCreditAdded(payer, msg.value);
    }

    /// @notice Launch with the standard split, no promo share and `LeftoverMode.Burn` (0).
    /// @dev Kept so its selector and behaviour match the original five-argument entry point.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI
    ) external payable returns (address token) {
        return _createToken(name, symbol, decimals, totalSupply, metadataURI, PeopleConstants.PROMO_BPS_NONE, 0);
    }

    /// @notice Launch with an optional promo share (0, 500 or 1000 bps; owner decision
    /// 2026-10-13) and the default `LeftoverMode.Burn`. See the seven-argument overload.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI,
        uint16 promoBps
    ) external payable returns (address token) {
        return _createToken(name, symbol, decimals, totalSupply, metadataURI, promoBps, 0);
    }

    /// @notice Full launch: optional promo share plus the creator's leftover choice.
    /// @param promoBps Exactly 0, 500 (5%) or 1000 (10%), carved out of the bonding-curve
    /// portion; promo tokens go to `promoVault` (see `CurveMath.calculateAllocationWithPromo`).
    /// @dev There is deliberately no `(…, uint8 leftoverMode)` six-argument overload: a `uint8`
    /// argument also converts to the promo overload's `uint16`, so Solidity callers could never
    /// select it. Pass `promoBps = 0` here instead.
    /// @param leftoverMode What happens to curve leftovers at migration and to the unsold
    /// remainder at the 180-day finalize: 0 = Burn, 1 = the token's own CommunityPool.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI,
        uint16 promoBps,
        uint8 leftoverMode
    ) external payable returns (address token) {
        return _createToken(name, symbol, decimals, totalSupply, metadataURI, promoBps, leftoverMode);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI,
        uint16 promoBps,
        uint8 leftoverMode
    ) private returns (address token) {
        CurveMath.requireValidPromoBps(promoBps);
        if (leftoverMode > 1) revert InvalidLeftoverMode();
        if (bytes(name).length < 2 || bytes(name).length > 64) revert InvalidParams();
        bytes memory sym = bytes(symbol);
        if (sym.length < 2 || sym.length > 16) revert InvalidParams();
        if (decimals > 18 || totalSupply == 0) revert InvalidParams();

        uint256 fee = PeopleConstants.TOKEN_CREATE_FEE;
        uint256 credit = prepaidCredit[msg.sender];
        uint256 fromCredit = credit < fee ? credit : fee;
        uint256 needed = fee - fromCredit;
        if (msg.value < needed) revert InsufficientFee();
        if (fromCredit > 0) prepaidCredit[msg.sender] = credit - fromCredit;

        (bool sent,) = feeRecipient.call{value: fee}("");
        require(sent, "fee transfer failed");
        uint256 refund = msg.value - needed;
        if (refund > 0) {
            (bool refundOk,) = msg.sender.call{value: refund}("");
            require(refundOk, "refund failed");
        }

        string memory upperSymbol = _upperSymbol(symbol);

        token = address(
            new PeopleProjectToken(
                address(this), msg.sender, name, upperSymbol, decimals, totalSupply, metadataURI
            )
        );
        isPeopleToken[token] = true;

        (CurveMath.Allocation memory allocation, uint256 promo) =
            CurveMath.calculateAllocationWithPromo(totalSupply, promoBps);
        uint256 upfrontCreator = (allocation.creator * 10) / 100;
        PeopleProjectToken t = PeopleProjectToken(token);

        t.transfer(address(communityVault), allocation.communityPool);
        communityVault.register(token, allocation.communityPool);

        t.transfer(msg.sender, upfrontCreator);
        t.transfer(address(creatorVesting), allocation.creator - upfrontCreator);
        creatorVesting.register(token, msg.sender, allocation.creator, upfrontCreator);

        // The promo share is carved out of `allocation.bondingCurve`, so the curve transfer below
        // already excludes it; `promo == 0` skips this block entirely.
        if (promo > 0) {
            address vault = promoVault;
            if (vault == address(0)) revert PromoVaultNotSet();
            t.transfer(vault, promo);
            IPromoRewardsVault(vault).register(token, msg.sender, promoBps, promo);
            emit TokenPromoAllocated(token, msg.sender, promoBps, promo);
        }

        t.transfer(address(bondingCurve), allocation.bondingCurve + allocation.liquidityReserve + allocation.ecosystemReserve);
        bondingCurve.registerToken(
            token,
            allocation.bondingCurve,
            allocation.liquidityReserve,
            allocation.ecosystemReserve,
            leftoverMode
        );

        emit TokenCreated(token, msg.sender, name, upperSymbol, decimals, totalSupply, allocation, leftoverMode);
    }

    function _upperSymbol(string calldata symbol) private pure returns (string memory) {
        bytes memory b = bytes(symbol);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c >= 0x61 && c <= 0x7A) {
                b[i] = bytes1(uint8(c) - 32);
            }
        }
        return string(b);
    }
}
