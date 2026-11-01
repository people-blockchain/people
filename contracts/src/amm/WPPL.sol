// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Wrapped native PPL (`appl`) for AMM pairs — Uniswap WETH pattern.
// TODO(A8): person-to-person transfers of native PPL stay closed until ~1000 verified people. That
// gate belongs to the PEOPLE chain itself (native coin, chain/ code), not to a Solidity contract.
// Once it exists, WPPL transfers (and pair swaps) must honour it too, otherwise deposit -> ERC-20
// transfer -> withdraw moves PPL between people around the native gate.
contract WPPL is ERC20 {
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    error TransferFailed();

    constructor() ERC20("Wrapped People", "WPPL") {}

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }
}
