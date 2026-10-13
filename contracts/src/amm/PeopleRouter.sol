// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PeoplePair} from "./PeoplePair.sol";
import {WPPL} from "./WPPL.sol";
import {PeopleAmmFactory} from "./PeopleAmmFactory.sol";
import {AmmMath} from "../libs/AmmMath.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {IPeopleRouter} from "../interfaces/ICreatorVesting.sol";

contract PeopleRouter is IPeopleRouter {
    using SafeERC20 for IERC20;

    address public immutable override WETH;
    address public immutable factory;

    error Expired();
    error InvalidPath();
    error Slippage();

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    WPPL public immutable wpplToken;

    constructor(address factory_, WPPL wppl_) {
        factory = factory_;
        wpplToken = wppl_;
        WETH = address(wppl_);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pair = PeopleAmmFactory(factory).getPair(token, WETH);
        if (pair == address(0)) {
            pair = PeopleAmmFactory(factory).createPair(token, WETH);
        }
        (amountToken, amountETH) =
            _addLiquidityAmounts(pair, token, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        wpplToken.deposit{value: amountETH}();
        IERC20(WETH).safeTransfer(pair, amountETH);
        liquidity = PeoplePair(pair).mint(to);
        if (msg.value > amountETH) {
            (bool ok,) = msg.sender.call{value: msg.value - amountETH}("");
            require(ok, "eth");
        }
    }

    /// @notice Atomic LP exit: pulls `liquidity` from the caller (ERC-20 allowance on the pair),
    /// burns it, unwraps WPPL and pays `to` in token + native PPL.
    /// @dev AUD-C1: this is the only safe exit. Without it an LP had to park LP on the pair in one
    /// transaction and burn it in the next, which let anyone front-run the burn and take the whole
    /// position. Minimums are checked against the amounts actually received, before payout.
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        if (to == address(0)) revert InvalidPath();
        address pair = PeopleAmmFactory(factory).getPair(token, WETH);
        if (pair == address(0)) revert InvalidPath();
        (uint256 amount0, uint256 amount1) = PeoplePair(pair).burn(msg.sender, address(this), liquidity);
        (amountToken, amountETH) = token == PeoplePair(pair).token0() ? (amount0, amount1) : (amount1, amount0);
        if (amountToken < amountTokenMin || amountETH < amountETHMin) revert Slippage();
        IERC20(token).safeTransfer(to, amountToken);
        wpplToken.withdraw(amountETH);
        (bool ok,) = to.call{value: amountETH}("");
        require(ok, "eth");
    }

    /// @dev Uniswap V2 `_addLiquidity`: an empty pair takes the desired amounts; otherwise only
    /// the amounts matching the current reserves ratio are used. Minimums apply to what is added.
    function _addLiquidityAmounts(
        address pair,
        address token,
        uint256 amountTokenDesired,
        uint256 amountETHDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin
    ) internal view returns (uint256 amountToken, uint256 amountETH) {
        (uint256 r0, uint256 r1,) = PeoplePair(pair).getReserves();
        (uint256 reserveToken, uint256 reserveETH) = token == PeoplePair(pair).token0() ? (r0, r1) : (r1, r0);
        if (reserveToken == 0 && reserveETH == 0) {
            (amountToken, amountETH) = (amountTokenDesired, amountETHDesired);
        } else {
            uint256 amountETHOptimal = _quote(amountTokenDesired, reserveToken, reserveETH);
            if (amountETHOptimal <= amountETHDesired) {
                (amountToken, amountETH) = (amountTokenDesired, amountETHOptimal);
            } else {
                uint256 amountTokenOptimal = _quote(amountETHDesired, reserveETH, reserveToken);
                (amountToken, amountETH) = (amountTokenOptimal, amountETHDesired);
            }
        }
        if (amountToken < amountTokenMin || amountETH < amountETHMin) revert Slippage();
    }

    function _quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256) {
        if (reserveA == 0 || reserveB == 0) revert Slippage();
        return (amountA * reserveB) / reserveA;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2 || path[0] != WETH) revert InvalidPath();
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        wpplToken.deposit{value: msg.value}();
        amounts[1] = _swap(path, msg.value, to);
        if (amounts[1] < amountOutMin) revert Slippage();
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2 || path[1] != WETH) revert InvalidPath();
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        amounts[1] = _swap(path, amountIn, address(this));
        // AUD-M13: enforce the minimum before any external call. The native-PPL transfer to `to`
        // used to happen first; a revert rolled it back, but the check belongs before the call —
        // same order as `swapExactETHForTokens` and `removeLiquidityETH` above.
        if (amounts[1] < amountOutMin) revert Slippage();
        wpplToken.withdraw(amounts[1]);
        (bool ok,) = to.call{value: amounts[1]}("");
        require(ok, "eth");
    }

    function _swap(address[] calldata path, uint256 amountIn, address to) internal returns (uint256 amountOut) {
        address pair = PeopleAmmFactory(factory).getPair(path[0], path[1]);
        if (pair == address(0)) revert InvalidPath();
        address token0 = PeoplePair(pair).token0();
        bool zeroForOne = path[0] == token0;
        (uint256 r0, uint256 r1,) = PeoplePair(pair).getReserves();
        (uint256 reserveIn, uint256 reserveOut) = zeroForOne ? (r0, r1) : (r1, r0);
        (amountOut,,) = AmmMath.swapExactIn(reserveIn, reserveOut, amountIn, PeopleConstants.AMM_FEE_BPS, 0);
        IERC20(path[0]).safeTransfer(pair, amountIn);
        if (zeroForOne) {
            PeoplePair(pair).swap(0, amountOut, to);
        } else {
            PeoplePair(pair).swap(amountOut, 0, to);
        }
    }

    receive() external payable {}
}
