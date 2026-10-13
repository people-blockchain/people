// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Cross-chain stablecoin sale for PPL allocation (delivery on People chain is off-chain).
/// Linear bonding curve matches website `BONDING_CURVE` (100M PPL, 0.01–0.05 USDT spot).
contract PeopleCommunitySale is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant SUPPLY_PPL = 100_000_000;
    uint256 public constant PRICE_START_USDT_6 = 10_000; // 0.01 USDT (6 decimals)
    uint256 public constant PRICE_END_USDT_6 = 50_000; // 0.05 USDT

    IERC20 public immutable stablecoin;
    address public immutable treasury;
    /// @dev Scales the internal 6-decimal cost into the stablecoin's native units (decimals >= 6 required).
    uint256 public immutable stableScale;
    uint256 public soldPpl;

    event Purchased(address indexed buyer, address indexed beneficiary, uint256 usdtPaid, uint256 pplOut, uint256 soldAfter);

    constructor(address stablecoin_, address treasury_, address owner_) Ownable(owner_) {
        require(stablecoin_ != address(0) && treasury_ != address(0), "zero");
        stablecoin = IERC20(stablecoin_);
        treasury = treasury_;
        uint8 stableDecimals = IERC20Metadata(stablecoin_).decimals();
        require(stableDecimals >= 6, "decimals");
        stableScale = 10 ** (stableDecimals - 6);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function remainingPpl() public view returns (uint256) {
        return SUPPLY_PPL - soldPpl;
    }

    /// @dev `usdtAmount` is in the stablecoin's native units (e.g. 18 decimals on BNB Chain).
    function quotePplForUsdt(uint256 usdtAmount) public view returns (uint256 pplOut, uint256 usdtUsed) {
        if (usdtAmount == 0 || soldPpl >= SUPPLY_PPL) {
            return (0, 0);
        }
        uint256 usdtAmount6 = usdtAmount / stableScale;
        uint256 remaining = SUPPLY_PPL - soldPpl;
        uint256 lo = 0;
        uint256 hi = remaining;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (_costUsdt(soldPpl, mid) <= usdtAmount6) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        pplOut = lo;
        usdtUsed = pplOut == 0 ? 0 : _costUsdt(soldPpl, pplOut) * stableScale;
    }

    function buy(address beneficiary, uint256 usdtAmount, uint256 minPplOut) external nonReentrant whenNotPaused {
        require(beneficiary != address(0), "beneficiary");
        require(usdtAmount > 0, "amount");
        (uint256 pplOut, uint256 usdtUsed) = quotePplForUsdt(usdtAmount);
        require(pplOut >= minPplOut && pplOut > 0, "slippage");
        stablecoin.safeTransferFrom(msg.sender, treasury, usdtUsed);
        soldPpl += pplOut;
        emit Purchased(msg.sender, beneficiary, usdtUsed, pplOut, soldPpl);
    }

    /// @dev Trapezoid under the linear spot curve, in 6-decimal stablecoin units:
    /// pplAmount * (p(s0) + p(s1)) / 2 with p(s) = START + (END - START) * s / SUPPLY.
    /// Prices are kept as exact fractions (no per-spot truncation) and the total is
    /// rounded up, so the contract never charges less than the website curve.
    function _costUsdt(uint256 soldBefore, uint256 pplAmount) internal pure returns (uint256) {
        if (pplAmount == 0) return 0;
        uint256 s0 = soldBefore;
        uint256 s1 = soldBefore + pplAmount;
        uint256 num =
            pplAmount * (2 * PRICE_START_USDT_6 * SUPPLY_PPL + (PRICE_END_USDT_6 - PRICE_START_USDT_6) * (s0 + s1));
        uint256 den = 2 * SUPPLY_PPL;
        return (num + den - 1) / den;
    }
}
