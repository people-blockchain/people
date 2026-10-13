// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PeopleConstants} from "../PeopleConstants.sol";
import {AmmMath} from "../libs/AmmMath.sol";

/// @dev Uniswap V2–style constant-product pair (token / WPPL).
contract PeoplePair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = PeopleConstants.AMM_MINIMUM_LIQUIDITY;

    address public factory;
    address public token0;
    address public token1;
    uint256 private reserve0;
    uint256 private reserve1;
    uint32 private blockTimestampLast;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    event Sync(uint256 reserve0, uint256 reserve1);

    error Forbidden();
    error InsufficientLiquidity();
    error InsufficientOutput();
    error InvalidTo();
    error K();

    modifier onlyFactory() {
        if (msg.sender != factory) revert Forbidden();
        _;
    }

    constructor() ERC20("People LP", "PPL-LP") {}

    function initialize(address token0_, address token1_) external {
        if (factory != address(0)) revert Forbidden();
        factory = msg.sender;
        token0 = token0_;
        token1 = token1_;
    }

    function getReserves() public view returns (uint256, uint256, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 _reserve0, uint256 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        if (_reserve0 == 0 && _reserve1 == 0) {
            (liquidity,) = AmmMath.mintInitial(amount0, amount1);
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            liquidity = AmmMath.mintProportional(amount0, amount1, _reserve0, _reserve1, totalSupply());
        }
        if (liquidity == 0) revert InsufficientLiquidity();
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burn `liquidity` LP held by `from` and send the pro-rata reserves to `to`.
    /// @dev AUD-C1: the Uniswap-V2 `burn(to)` shape — "whatever LP is parked on the pair" — is
    /// unsafe without a router that owns the whole flow. There is no `removeLiquidity` here that
    /// transfers and burns in one call, so every exit was `transfer(pair, lp)` in one transaction
    /// followed by `burn(me)` in the next, and anyone could win that race and call `burn(attacker)`
    /// in between to take the whole position. Burning a named holder's balance (own, or via ERC-20
    /// allowance, which is how `PeopleRouter.removeLiquidityETH` does it) removes the window
    /// entirely: there is never LP sitting on the pair with no owner recorded.
    function burn(address from, address to, uint256 liquidity)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        if (liquidity == 0) revert InsufficientLiquidity();
        address token0_ = token0;
        address token1_ = token1;
        if (to == address(0) || to == address(this) || to == token0_ || to == token1_) revert InvalidTo();
        if (msg.sender != from) _spendAllowance(from, msg.sender, liquidity);

        uint256 balance0 = IERC20(token0_).balanceOf(address(this));
        uint256 balance1 = IERC20(token1_).balanceOf(address(this));
        // Pro-rata share uses the supply before this burn: L / S of each balance.
        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();
        _burn(from, liquidity);
        IERC20(token0_).safeTransfer(to, amount0);
        IERC20(token1_).safeTransfer(to, amount1);
        balance0 = IERC20(token0_).balanceOf(address(this));
        balance1 = IERC20(token1_).balanceOf(address(this));
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutput();
        (uint256 _reserve0, uint256 _reserve1,) = getReserves();
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidTo();

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInput();

        uint256 balance0Adjusted = balance0 * 10_000 - amount0In * PeopleConstants.AMM_FEE_BPS;
        uint256 balance1Adjusted = balance1 * 10_000 - amount1In * PeopleConstants.AMM_FEE_BPS;
        if (balance0Adjusted * balance1Adjusted < _reserve0 * _reserve1 * (10_000 ** 2)) revert K();

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @dev S2-03: before the first `mint`, `totalSupply() == 0` and reserves are still zero, so
    /// anyone could donate a 1-wei-skewed balance and call `sync()` to desync reserves away from
    /// the true (zero) state. The next real `mint` then divides by a stale one-sided reserve in
    /// `AmmMath.mintProportional`, permanently bricking the pair. `sync()`'s only legitimate use
    /// (resyncing reserves to balances, e.g. after a rebasing token) requires the pair to already
    /// have minted liquidity, so blocking it pre-mint closes the griefing path with no loss of
    /// function.
    function sync() external nonReentrant {
        if (totalSupply() == 0) revert Forbidden();
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        emit Sync(reserve0, reserve1);
    }

    error InsufficientInput();
}
