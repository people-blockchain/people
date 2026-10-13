// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Protocol constants aligned with `people-node` (`curve.ts`, `factory-fees.ts`).
library PeopleConstants {
    /// 60 PPL virtual native reserve (18-decimal `appl`).
    uint256 internal constant VIRTUAL_NATIVE_RESERVE = 60 ether;
    uint256 internal constant CURVE_FEE_BPS = 100;
    uint256 internal constant AMM_FEE_BPS = 30;
    uint256 internal constant AMM_MINIMUM_LIQUIDITY = 1000;
    /// `DEFAULT_TOKEN_CREATE_MIN_FEE` (~1.045005 PPL).
    uint256 internal constant TOKEN_CREATE_FEE = 1_045_005_000_000_000_000;
    /// `DEFAULT_NFT_MINT_MIN_FEE` (2.925 PPL).
    uint256 internal constant NFT_MINT_FEE = 2_925_000_000_000_000_000;
    uint256 internal constant VESTING_DURATION = 180 days;
    uint256 internal constant PEOPLE_EVM_CHAIN_ID = 97401;
}
