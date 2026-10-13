// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PeoplePair} from "./PeoplePair.sol";
import {IPeopleAmmFactory} from "../interfaces/ICreatorVesting.sol";

interface ITokenFactoryCurveView {
    function isPeopleToken(address token) external view returns (bool);
    function bondingCurve() external view returns (address);
}

interface ICurveMigrationView {
    function isMigrated(address token) external view returns (bool);
}

contract PeopleAmmFactory is IPeopleAmmFactory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

    /// @notice PeopleProtocolRegistry: resolves the TokenFactory (and through it the curve).
    address public immutable registry;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    error CurveNotMigrated(address token);

    constructor(address registry_) {
        require(registry_ != address(0), "registry");
        registry = registry_;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "identical");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "zero");
        require(getPair[token0][token1] == address(0), "exists");
        _requireCurveMayList(token0);
        _requireCurveMayList(token1);
        PeoplePair p = new PeoplePair();
        p.initialize(token0, token1);
        pair = address(p);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @dev A Token Factory token gets its first pair from its own bonding curve at migration;
    /// before that nobody else may create a pair for it (a pre-seeded pair would set the price
    /// the migration liquidity is added at).
    function _requireCurveMayList(address token) private view {
        (bool ok, bytes memory data) = registry.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        if (!ok || data.length < 32) return;
        address tokenFactory = abi.decode(data, (address));
        if (tokenFactory == address(0)) return;
        ITokenFactoryCurveView tf = ITokenFactoryCurveView(tokenFactory);
        if (!tf.isPeopleToken(token)) return;
        address curve = tf.bondingCurve();
        if (msg.sender == curve) return;
        if (!ICurveMigrationView(curve).isMigrated(token)) revert CurveNotMigrated(token);
    }
}
