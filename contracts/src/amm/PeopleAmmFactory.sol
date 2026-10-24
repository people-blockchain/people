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
    /// @notice The registry lookup reverted or returned malformed data; pair creation fails closed.
    error RegistryCheckFailed();

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
    ///
    /// MF-10: the guard must not depend on which factory the registry points at TODAY. After
    /// `setTokenFactory` rotates, tokens launched by the retired factory still have a live
    /// curve, but the new factory's `isPeopleToken` is false for them. So the token itself is
    /// asked who created it (`PeopleProjectToken.factory` is immutable, set at construction)
    /// and that factory is asked to vouch for the token and name its curve. The registry's
    /// current factory is still consulted as before. An untrusted token can only point at a
    /// factory that does not vouch for it (-> no guard) or at its own fake one (-> it only
    /// blocks pairs for itself), so nobody can use this to block a legitimate token.
    function _requireCurveMayList(address token) private view {
        // Fail closed: a registry that reverts or answers garbage must not open pair creation.
        (bool ok, bytes memory data) = registry.staticcall(abi.encodeWithSignature("tokenFactoryAddress()"));
        if (!ok || data.length < 32) revert RegistryCheckFailed();
        address current = abi.decode(data, (address));
        address creator = _addressCall(token, abi.encodeWithSignature("factory()"));
        if (creator != address(0)) _requireFactoryCurveMayList(creator, token);
        if (current != address(0) && current != creator) _requireFactoryCurveMayList(current, token);
    }

    function _requireFactoryCurveMayList(address factory, address token) private view {
        (bool ok, bytes memory data) =
            factory.staticcall(abi.encodeWithSignature("isPeopleToken(address)", token));
        if (!ok || data.length < 32 || abi.decode(data, (uint256)) != 1) return;
        address curve = ITokenFactoryCurveView(factory).bondingCurve();
        if (msg.sender == curve) return;
        if (!ICurveMigrationView(curve).isMigrated(token)) revert CurveNotMigrated(token);
    }

    /// @dev Tolerant `staticcall` returning one address; anything malformed yields address(0).
    function _addressCall(address target, bytes memory callData) private view returns (address) {
        (bool ok, bytes memory data) = target.staticcall(callData);
        if (!ok || data.length < 32) return address(0);
        uint256 word = abi.decode(data, (uint256));
        if (word > type(uint160).max) return address(0);
        return address(uint160(word));
    }
}
