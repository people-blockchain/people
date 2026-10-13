// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Loyalty passes: ERC-1155 balance per program = remaining visits.
contract LavkaPass is ERC1155, Ownable, ReentrancyGuard {
    struct Program {
        address merchant;
        uint16 visitsPerPurchase;
        uint64 validUntil;
        bool transferable;
        uint256 priceWei;
        bool active;
    }

    event ProgramCreated(
        uint256 indexed programId,
        address indexed merchant,
        uint16 visitsPerPurchase,
        uint64 validUntil,
        bool transferable,
        uint256 priceWei
    );
    event PassPurchased(uint256 indexed programId, address indexed buyer, uint256 visits);
    event VisitRedeemed(uint256 indexed programId, address indexed holder, uint256 visits, bytes32 nonce);
    event PassRefunded(uint256 indexed programId, address indexed holder, uint256 visits, uint256 amount);

    /// AUD-M10: upper bound on `visitsPerPurchase`. A program with `priceWei == 0` and a huge
    /// visit count let anyone mint an unbounded ERC-1155 balance and spam catalog/indexers for
    /// free. 100 is well above any real loyalty pass while still bounding one program's supply.
    uint16 public constant MAX_VISITS_PER_PURCHASE = 100;

    uint256 public nextProgramId = 1;
    mapping(uint256 => Program) public programs;
    /// @notice One-time redemption nonces (QR codes), so the same in-person confirmation can't be
    /// replayed on-chain. Keyed by `(programId, nonce)` — see `redemptionKey`. AUD-H2: a single
    /// global `nonce => bool` namespace let any address consume another merchant's QR for free.
    mapping(bytes32 => bool) public usedRedemptionKey;

    error InactiveProgram();
    error ExpiredProgram();
    error InsufficientVisits();
    error InsufficientPayment();
    error NotTransferable();
    error InvalidProgram();
    error NonceUsed();
    error ZeroNonce();
    error ZeroVisits();
    error ZeroPrice();
    error TooManyVisits();
    error ProgramStillActive();
    error NothingToRefund();

    constructor(address owner_) ERC1155("") Ownable(owner_) {}

    function createProgram(
        uint16 visitsPerPurchase,
        uint64 validUntil,
        bool transferable,
        uint256 priceWei
    ) external returns (uint256 programId) {
        require(visitsPerPurchase > 0, "visits");
        // AUD-M10: a free program is a free, unbounded ERC-1155 mint (catalog/indexer spam), and
        // an enormous `visitsPerPurchase` makes the per-visit escrow amount round to zero dust.
        if (priceWei == 0) revert ZeroPrice();
        if (visitsPerPurchase > MAX_VISITS_PER_PURCHASE) revert TooManyVisits();
        programId = nextProgramId++;
        programs[programId] = Program({
            merchant: msg.sender,
            visitsPerPurchase: visitsPerPurchase,
            validUntil: validUntil,
            transferable: transferable,
            priceWei: priceWei,
            active: true
        });
        emit ProgramCreated(programId, msg.sender, visitsPerPurchase, validUntil, transferable, priceWei);
    }

    function setProgramActive(uint256 programId, bool active) external {
        Program storage p = programs[programId];
        if (p.merchant == address(0)) revert InvalidProgram();
        if (p.merchant != msg.sender && msg.sender != owner()) revert InvalidProgram();
        p.active = active;
    }

    /// @notice Payment stays escrowed in this contract; the merchant is paid out per visit as
    /// the holder redeems them (see `redeemVisit`), and any unredeemed balance is refundable to
    /// the holder once the merchant disables the program (see `claimRefund`).
    function purchasePass(uint256 programId) external payable nonReentrant {
        Program storage p = _requireLiveProgram(programId);
        if (msg.value < p.priceWei) revert InsufficientPayment();
        uint256 visits = uint256(p.visitsPerPurchase);
        _mint(msg.sender, programId, visits, "");
        if (msg.value > p.priceWei) {
            (bool refund,) = msg.sender.call{value: msg.value - p.priceWei}("");
            require(refund, "refund");
        }
        emit PassPurchased(programId, msg.sender, visits);
    }

    /// @notice Burns `visits` and pays the merchant their escrowed share. `nonce` is a one-time
    /// code exchanged in person (e.g. a QR the merchant displays for this specific visit) so a
    /// redemption can't be replayed, and the merchant's off-chain app can match the on-chain
    /// event to the exact visit it confirmed.
    function redeemVisit(uint256 programId, uint256 visits, bytes32 nonce) external nonReentrant {
        if (nonce == bytes32(0)) revert ZeroNonce();
        // AUD-H2: a redemption must actually burn something. `visits == 0` used to pass every
        // check below — no balance needed, nothing burned, no payout — while still consuming the
        // nonce and emitting a fully valid-looking `VisitRedeemed(programId, holder, 0, nonce)`.
        // That let any address manufacture "redemptions" against any live program for free.
        if (visits == 0) revert ZeroVisits();
        bytes32 key = redemptionKey(programId, nonce);
        if (usedRedemptionKey[key]) revert NonceUsed();
        Program storage p = _requireLiveProgram(programId);
        uint256 bal = balanceOf(msg.sender, programId);
        if (bal < visits) revert InsufficientVisits();
        usedRedemptionKey[key] = true;
        _burn(msg.sender, programId, visits);
        uint256 amount = _escrowedAmount(p, visits);
        if (amount > 0) {
            (bool sent,) = p.merchant.call{value: amount}("");
            require(sent, "pay merchant");
        }
        emit VisitRedeemed(programId, msg.sender, visits, nonce);
    }

    /// @notice Once a program has ended — the merchant disabled it, or it passed its
    /// `validUntil` — a holder can reclaim the escrowed value of their remaining (unredeemed)
    /// visits instead of it being stranded in the contract.
    function claimRefund(uint256 programId) external nonReentrant {
        Program storage p = programs[programId];
        if (p.merchant == address(0)) revert InvalidProgram();
        if (!_programEnded(p)) revert ProgramStillActive();
        uint256 bal = balanceOf(msg.sender, programId);
        if (bal == 0) revert NothingToRefund();
        uint256 amount = _escrowedAmount(p, bal);
        _burn(msg.sender, programId, bal);
        if (amount > 0) {
            (bool sent,) = msg.sender.call{value: amount}("");
            require(sent, "refund");
        }
        emit PassRefunded(programId, msg.sender, bal, amount);
    }

    /// @dev Redemption nonces are scoped to their program: a QR is still single-use for the
    /// program it was issued for, but one merchant's nonce can no longer be burned by a
    /// redemption against an unrelated program.
    function redemptionKey(uint256 programId, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode(programId, nonce));
    }

    /// @notice Whether `nonce` has already been redeemed against `programId`.
    function isNonceUsed(uint256 programId, bytes32 nonce) external view returns (bool) {
        return usedRedemptionKey[redemptionKey(programId, nonce)];
    }

    /// @dev Escrowed wei backing `visits` units of this program, at the program's fixed per-visit price.
    function _escrowedAmount(Program storage p, uint256 visits) internal view returns (uint256) {
        return (visits * p.priceWei) / uint256(p.visitsPerPurchase);
    }

    /// @dev A program that can no longer be redeemed against: disabled, or past its validity.
    /// Escrow must be refundable once either is true, or funds would be stuck forever.
    function _programEnded(Program storage p) internal view returns (bool) {
        return !p.active || (p.validUntil != 0 && block.timestamp > p.validUntil);
    }

    function _requireLiveProgram(uint256 programId) internal view returns (Program storage p) {
        p = programs[programId];
        if (p.merchant == address(0)) revert InvalidProgram();
        if (!p.active) revert InactiveProgram();
        if (p.validUntil != 0 && block.timestamp > p.validUntil) revert ExpiredProgram();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (!programs[ids[i]].transferable) revert NotTransferable();
            }
        }
        super._update(from, to, ids, values);
    }
}
