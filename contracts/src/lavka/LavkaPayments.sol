// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Checkout / tip payments in PPL with the approved Model A fee split.
/// Merchant receives (100% - `protocolFeeBps`) of the payment; the protocol slice is routed
/// validators 30 / community pool 25 / treasury 20 / liquidity & ecosystem 10 / growth 15 /
/// burn 0 (`docs/PROTOCOL-DECISIONS.md`, "Model A ... APPROVED как спецификация").
contract LavkaPayments is Ownable, ReentrancyGuard {
    /// @notice AUD-M15: the rate is a protocol parameter, not a compile-time constant — the
    /// owner (governance: the Lavka `PeopleTimelock`, whose admin/proposer is `PeopleMultisig`)
    /// changes it with `setProtocolFee`. Starts at the approved 1%.
    uint16 public protocolFeeBps = 100;
    /// @notice AUD-M15: hard cap on `protocolFeeBps` — 3% (300 bps). The approved Model A
    /// split assumes a payment-routing fee of this order; a setter without a ceiling would let
    /// a compromised owner key turn `payMerchant` into an arbitrary toll on merchants.
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 300;

    /// Model A weights in basis points of the protocol fee. Validators are not stored: they take
    /// the remainder, so the slices always sum to exactly the fee (`docs/PROTOCOL-DECISIONS.md`:
    /// "Остаток деления остаётся в доле валидаторов").
    uint16 public constant COMMUNITY_BPS = 2500;
    uint16 public constant TREASURY_BPS = 2000;
    uint16 public constant LIQUIDITY_BPS = 1000;
    uint16 public constant GROWTH_BPS = 1500;
    uint16 public constant BURN_BPS = 0;

    address public communityVault;
    address public treasury;
    address public validators;
    address public liquidityEcosystem;
    address public growthPool;

    event Payment(
        address indexed payer,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 protocolFee,
        bytes32 memoHash
    );
    /// @notice Bucket addresses are a protocol parameter, not a one-time deploy value: this
    /// lets governance (the `owner`, a timelock) rotate a bucket without redeploying.
    event BucketsUpdated(
        address communityVault,
        address treasury,
        address validators,
        address liquidityEcosystem,
        address growthPool
    );

    error ZeroBucket();
    error FeeTooHigh();
    error NothingOwed();

    /// @notice AUD-M15: emitted when governance changes the payment-routing fee.
    event ProtocolFeeUpdated(uint16 protocolFeeBps);

    /// @notice S2-01: a fee slice that could not be pushed to `bucket` (e.g. it rejects native
    /// PPL, such as `CommunityTokenVault`) accrues here instead of reverting the checkout.
    mapping(address bucket => uint256 amount) public owed;

    /// @notice S2-01: emitted when a slice could not be pushed and was accrued instead.
    event SendFailed(address indexed bucket, uint256 amount);
    /// @notice S2-01: emitted when accrued funds are successfully pushed out, either by
    /// `retrySend` (to the original bucket) or `withdrawAccrued` (governance redirect).
    event AccruedWithdrawn(address indexed bucket, address indexed to, uint256 amount);

    constructor(
        address owner_,
        address communityVault_,
        address treasury_,
        address validators_,
        address liquidityEcosystem_,
        address growthPool_
    ) Ownable(owner_) {
        _setBuckets(communityVault_, treasury_, validators_, liquidityEcosystem_, growthPool_);
    }

    /// @notice Governance-only: set the payment-routing fee, in basis points of the payment.
    /// AUD-M15: bounded by `MAX_PROTOCOL_FEE_BPS` (3%) — anything above reverts, so the fee can
    /// never be raised into an arbitrary toll even by a compromised owner key.
    function setProtocolFee(uint16 protocolFeeBps_) external onlyOwner {
        if (protocolFeeBps_ > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = protocolFeeBps_;
        emit ProtocolFeeUpdated(protocolFeeBps_);
    }

    /// @notice Governance-only: rotate one or more fee-bucket addresses.
    function setBuckets(
        address communityVault_,
        address treasury_,
        address validators_,
        address liquidityEcosystem_,
        address growthPool_
    ) external onlyOwner {
        _setBuckets(communityVault_, treasury_, validators_, liquidityEcosystem_, growthPool_);
    }

    /// @dev AUD-H3: every bucket must be a real address. `_send` skips `address(0)`, so a zero
    /// bucket would silently retain that slice of every fee in a contract with no withdrawal
    /// path — the funds would be unrecoverable rather than merely misrouted.
    function _setBuckets(
        address communityVault_,
        address treasury_,
        address validators_,
        address liquidityEcosystem_,
        address growthPool_
    ) internal {
        if (
            communityVault_ == address(0) || treasury_ == address(0) || validators_ == address(0)
                || liquidityEcosystem_ == address(0) || growthPool_ == address(0)
        ) {
            revert ZeroBucket();
        }
        communityVault = communityVault_;
        treasury = treasury_;
        validators = validators_;
        liquidityEcosystem = liquidityEcosystem_;
        growthPool = growthPool_;
        emit BucketsUpdated(communityVault_, treasury_, validators_, liquidityEcosystem_, growthPool_);
    }

    function payMerchant(address merchant, bytes32 memoHash) external payable nonReentrant {
        require(merchant != address(0), "merchant");
        require(msg.value > 0, "amount");
        uint256 fee = (msg.value * protocolFeeBps) / 10_000;
        uint256 toMerchant = msg.value - fee;
        _splitModelA(fee);
        (bool sent,) = merchant.call{value: toMerchant}("");
        require(sent, "merchant");
        emit Payment(msg.sender, merchant, toMerchant, fee, memoHash);
    }

    /// @dev AUD-H3: this used to send the 30% slice to a burn sink (defaulting to `0xdead`) and
    /// give validators the 10% liquidity slice, so 30% of every Lavka fee was destroyed while the
    /// approved Model A specifies burn 0% and validators 30%. Each slice floors independently and
    /// the remainder stays with validators, as the live node-side split does.
    function _splitModelA(uint256 fee) internal {
        if (fee == 0) return;
        uint256 community = (fee * COMMUNITY_BPS) / 10_000;
        uint256 treasuryShare = (fee * TREASURY_BPS) / 10_000;
        uint256 liquidity = (fee * LIQUIDITY_BPS) / 10_000;
        uint256 growth = (fee * GROWTH_BPS) / 10_000;
        uint256 burned = (fee * BURN_BPS) / 10_000;
        uint256 validatorShare = fee - community - treasuryShare - liquidity - growth - burned;
        _send(validators, validatorShare);
        _send(communityVault, community);
        _send(treasury, treasuryShare);
        _send(liquidityEcosystem, liquidity);
        _send(growthPool, growth);
    }

    /// @dev S2-01: a bucket that rejects native PPL (e.g. `CommunityTokenVault`, which has no
    /// `receive`/`fallback`) used to brick every checkout via `require(ok, "split")`. One
    /// bucket's inability to accept value must not block the merchant or the other buckets, so
    /// a failed push now accrues to `owed[to]` instead of reverting.
    function _send(address to, uint256 amount) internal {
        if (amount == 0 || to == address(0)) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            owed[to] += amount;
            emit SendFailed(to, amount);
        }
    }

    /// @notice Permissionless retry: anyone may re-attempt delivery of a bucket's accrued
    /// balance, e.g. after the bucket is upgraded to accept native PPL.
    function retrySend(address bucket) external nonReentrant {
        uint256 amount = owed[bucket];
        if (amount == 0) revert NothingOwed();
        owed[bucket] = 0;
        (bool ok,) = bucket.call{value: amount}("");
        if (!ok) {
            owed[bucket] = amount;
            revert NothingOwed();
        }
        emit AccruedWithdrawn(bucket, bucket, amount);
    }

    /// @notice Governance-only rescue: redirect a bucket's accrued balance to any address
    /// (e.g. a payable wallet that can forward it on, if the bucket itself can never accept
    /// native PPL).
    function withdrawAccrued(address bucket, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroBucket();
        uint256 amount = owed[bucket];
        if (amount == 0) revert NothingOwed();
        owed[bucket] = 0;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw");
        emit AccruedWithdrawn(bucket, to, amount);
    }
}
