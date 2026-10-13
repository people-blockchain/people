// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal ERC-8004–compatible agent identity surface for registry integrations.
interface IAgentRegistry8004 {
    event AgentRegistered(bytes32 indexed agentId, address indexed wallet, string metadataURI);

    function registerAgent(bytes32 agentId, address wallet, string calldata metadataURI) external;

    function agentWallet(bytes32 agentId) external view returns (address);
}

/// @dev Hook for x402-style HTTP payment receipts (hash-only commitment on-chain).
interface Ix402Payment {
    event PaymentAuthorized(bytes32 indexed paymentHash, address indexed payer, address indexed recipient, uint256 amount);

    function authorizePayment(bytes32 paymentHash, address recipient, uint256 amount) external;
}
