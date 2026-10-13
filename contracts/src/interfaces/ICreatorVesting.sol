// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICreatorVesting {
    function register(address token, address creator, uint256 totalAllocation, uint256 upfrontUnlocked) external;

    function claim(address token) external;
}

interface ICommunityTokenVault {
    function register(address token, uint256 amount) external;
}

interface IPeopleRouter {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function WETH() external view returns (address);
}

interface IPeopleAmmFactory {
    function createPair(address tokenA, address tokenB) external returns (address pair);

    function getPair(address tokenA, address tokenB) external view returns (address);
}
