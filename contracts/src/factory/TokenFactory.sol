// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PeopleProjectToken} from "../token/PeopleProjectToken.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {CurveMath} from "../libs/CurveMath.sol";
import {IBondingCurveMarket} from "../interfaces/IBondingCurveMarket.sol";
import {ICreatorVesting} from "../interfaces/ICreatorVesting.sol";
import {ICommunityTokenVault} from "../interfaces/ICommunityTokenVault.sol";

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

    /// @notice C-01/S1-02: PPL a payer has prepaid via `StableFeeGateway` and not yet consumed by
    /// a `createToken` call. Never withdrawable by anyone — only ever spent against this payer's
    /// own future launch fee — so no native PPL can leave this contract without a token being
    /// created in the same transaction.
    mapping(address => uint256) public prepaidCredit;

    event FeeRecipientUpdated(address indexed feeRecipient);
    event GatewaySet(address indexed gateway);
    event PrepaidCreditAdded(address indexed payer, uint256 amount);

    error InvalidParams();
    error InsufficientFee();
    error ZeroFeeRecipient();
    error ZeroGateway();
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

    /// @notice C-01/S1-02: called by `StableFeeGateway` with the live PPL launch fee as
    /// `msg.value`, crediting `payer` for a future `createToken` call instead of paying PPL out
    /// to the caller for free. The credit is only ever consumed by `createToken` against a real
    /// token creation — it cannot be withdrawn or redirected.
    function creditPrepaidFee(address payer) external payable {
        if (msg.sender != gateway) revert Unauthorized();
        prepaidCredit[payer] += msg.value;
        emit PrepaidCreditAdded(payer, msg.value);
    }

    /// @notice Backwards-compatible 5-arg overload. Defaults to `LeftoverMode.Burn` (0) per the
    /// owner rule 2026-10-13, so existing callers and tests keep compiling and behaving.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI
    ) external payable returns (address token) {
        return _createToken(name, symbol, decimals, totalSupply, metadataURI, 0);
    }

    /// @notice 6-arg overload: creator picks what happens to curve leftovers and the unsold
    /// remainder at 180-day finalize. 0 = Burn (default), 1 = CommunityPool. Never the creator,
    /// never the treasury.
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI,
        uint8 leftoverMode
    ) external payable returns (address token) {
        return _createToken(name, symbol, decimals, totalSupply, metadataURI, leftoverMode);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        string calldata metadataURI,
        uint8 leftoverMode
    ) internal returns (address token) {
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

        CurveMath.Allocation memory allocation = CurveMath.calculateAllocation(totalSupply);
        uint256 upfrontCreator = (allocation.creator * 10) / 100;
        PeopleProjectToken t = PeopleProjectToken(token);

        t.transfer(address(communityVault), allocation.communityPool);
        communityVault.register(token, allocation.communityPool);

        t.transfer(msg.sender, upfrontCreator);
        t.transfer(address(creatorVesting), allocation.creator - upfrontCreator);
        creatorVesting.register(token, msg.sender, allocation.creator, upfrontCreator);

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
