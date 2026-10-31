// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LiquidityLock} from "./LiquidityLock.sol";

interface IGenesisVaultFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

interface IGenesisVaultPair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint256, uint256, uint32);
    function mint(address to) external returns (uint256);
}

interface IGenesisVaultWppl {
    function deposit() external payable;
}

/// @title GenesisLiquidityVault
/// @notice Holds the genesis liquidity bucket (native PPL) on the PEOPLE network. The ONLY way
/// it can ever leave is `seed`: wrapped to WPPL, paired with quote tokens the seeder brings, added
/// to the WPPL/quote PeoplePair, and the LP minted straight into a fresh `LiquidityLock` (730 days,
/// immutable). Nobody, including the seeder, the beneficiary, the owner or a Safe, can withdraw,
/// transfer or spend it any other way.
///
/// Deployment: the runtime code is placed at a keyless address (see
/// chain/emission/genesis-liquidity-vault.json) in the genesis `evm.accounts` with the six
/// parameters below written straight into storage slots 0..5, and the bucket as that address's
/// bank balance. No constructor runs there, so there are no immutables; the constructor exists
/// for tests only. There is no owner, setter, `receive`, `fallback`, `delegatecall` or
/// `selfdestruct`, so the parameters pinned in genesis can never change. If any parameter is zero
/// (or the WPPL/factory addresses are wrong) `seed` reverts forever: the liquidity stays sealed,
/// it can never become spendable.
contract GenesisLiquidityVault {
    using SafeERC20 for IERC20;

    /// @notice LP lock length for every seed: 24 months.
    uint256 public constant LOCK_DURATION = 730 days;

    // Storage slots 0..5 (written directly in genesis; keep the order).
    /// @notice slot 0: WPPL (wrapped native PPL).
    address public wppl;
    /// @notice slot 1: PeopleAmmFactory.
    address public factory;
    /// @notice slot 2: quote token of the pool (bridged USDC).
    address public quoteToken;
    /// @notice slot 3: receives the LP from each `LiquidityLock` after 730 days.
    address public beneficiary;
    /// @notice slot 4: the only caller of `seed`; brings the quote tokens.
    address public seeder;
    /// @notice slot 5: price floor, quote base units per 1e18 aPPL (1 PPL); the pool after a seed
    /// must price PPL at or above it.
    uint256 public minQuotePerPpl;

    event Seeded(
        address indexed pair, address indexed lock, uint256 pplAmount, uint256 quoteAmount, uint256 liquidity
    );

    error NotSeeder();
    error NotConfigured();
    error ZeroAmount();
    error InsufficientPpl();
    error InsufficientPplAmount();
    error InsufficientQuoteAmount();
    error BelowPriceFloor();

    /// @dev Tests only; the real vault gets the same values via genesis storage.
    constructor(
        address wppl_,
        address factory_,
        address quoteToken_,
        address beneficiary_,
        address seeder_,
        uint256 minQuotePerPpl_
    ) {
        wppl = wppl_;
        factory = factory_;
        quoteToken = quoteToken_;
        beneficiary = beneficiary_;
        seeder = seeder_;
        minQuotePerPpl = minQuotePerPpl_;
    }

    /// @notice Add up to `pplDesired` vault PPL and `quoteDesired` seeder quote tokens to the
    /// WPPL/quote pool (creating it if needed) at the pool's current ratio, LP locked 730 days.
    /// `pplMin` / `quoteMin` bound the amounts actually used (router-style slippage guard).
    function seed(uint256 pplDesired, uint256 quoteDesired, uint256 pplMin, uint256 quoteMin)
        external
        returns (address lock, uint256 liquidity)
    {
        if (msg.sender != seeder) revert NotSeeder();
        address w = wppl;
        address f = factory;
        address q = quoteToken;
        address b = beneficiary;
        uint256 floor = minQuotePerPpl;
        if (w == address(0) || f == address(0) || q == address(0) || b == address(0) || floor == 0) {
            revert NotConfigured();
        }

        address pair = IGenesisVaultFactory(f).getPair(w, q);
        if (pair == address(0)) pair = IGenesisVaultFactory(f).createPair(w, q);

        (uint256 pplAmount, uint256 quoteAmount) = _amounts(pair, w, pplDesired, quoteDesired);
        if (pplAmount == 0 || quoteAmount == 0) revert ZeroAmount();
        if (pplAmount < pplMin) revert InsufficientPplAmount();
        if (quoteAmount < quoteMin) revert InsufficientQuoteAmount();
        if (pplAmount > address(this).balance) revert InsufficientPpl();
        if (quoteAmount * 1e18 < pplAmount * floor) revert BelowPriceFloor();

        lock = address(new LiquidityLock(b, block.timestamp + LOCK_DURATION));
        IGenesisVaultWppl(w).deposit{value: pplAmount}();
        IERC20(w).safeTransfer(pair, pplAmount);
        IERC20(q).safeTransferFrom(msg.sender, pair, quoteAmount);
        liquidity = IGenesisVaultPair(pair).mint(lock);

        // The pool as left (including any tokens donated to it before) must respect the floor.
        (uint256 rPpl, uint256 rQuote) = _reserves(pair, w);
        if (rQuote * 1e18 < rPpl * floor) revert BelowPriceFloor();

        emit Seeded(pair, lock, pplAmount, quoteAmount, liquidity);
    }

    function _amounts(address pair, address w, uint256 pplDesired, uint256 quoteDesired)
        private
        view
        returns (uint256, uint256)
    {
        (uint256 rPpl, uint256 rQuote) = _reserves(pair, w);
        if (rPpl == 0 && rQuote == 0) return (pplDesired, quoteDesired);
        uint256 quoteOptimal = pplDesired * rQuote / rPpl;
        if (quoteOptimal <= quoteDesired) return (pplDesired, quoteOptimal);
        return (quoteDesired * rPpl / rQuote, quoteDesired);
    }

    function _reserves(address pair, address w) private view returns (uint256 rPpl, uint256 rQuote) {
        (uint256 r0, uint256 r1,) = IGenesisVaultPair(pair).getReserves();
        (rPpl, rQuote) = IGenesisVaultPair(pair).token0() == w ? (r0, r1) : (r1, r0);
    }
}
