// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PeopleProtocolRegistry} from "../src/PeopleProtocolRegistry.sol";
import {TokenFactory} from "../src/factory/TokenFactory.sol";
import {BondingCurveMarket} from "../src/curve/BondingCurveMarket.sol";
import {CreatorVesting, CommunityTokenVault} from "../src/vesting/CreatorVesting.sol";
import {WPPL} from "../src/amm/WPPL.sol";
import {PeopleAmmFactory} from "../src/amm/PeopleAmmFactory.sol";
import {PeoplePair} from "../src/amm/PeoplePair.sol";
import {PeopleRouter} from "../src/amm/PeopleRouter.sol";
import {PeopleConstants} from "../src/PeopleConstants.sol";
import {PeopleProjectToken} from "../src/token/PeopleProjectToken.sol";

contract RotPlainToken is ERC20 {
    constructor() ERC20("Plain", "PLN") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// An unrelated token that happens to expose `factory()` (like a Uniswap-style LP token) pointing at
/// a contract that is not a People Token Factory. Must not be blocked.
contract RotLookalikeToken is ERC20 {
    address public factory;

    constructor(address factory_) ERC20("Look", "LKL") {
        factory = factory_;
        _mint(msg.sender, 1_000_000 ether);
    }
}

/// MF-10: the AMM pre-listing guard must survive `PeopleProtocolRegistry.setTokenFactory` rotation.
contract PeopleAmmFactoryRotationTest is Test {
    PeopleProtocolRegistry internal registry;
    TokenFactory internal factoryOld;
    TokenFactory internal factoryNew;
    BondingCurveMarket internal curveOld;
    BondingCurveMarket internal curveNew;
    PeopleRouter internal router;
    WPPL internal wppl;
    PeopleAmmFactory internal ammFactory;

    address internal fee = address(0xFEE);
    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA11CE);
    address internal mallory = address(0xBAD);

    function setUp() public {
        registry = new PeopleProtocolRegistry();
        wppl = new WPPL();
        ammFactory = new PeopleAmmFactory(address(registry));
        router = new PeopleRouter(address(ammFactory), wppl);
        curveOld = new BondingCurveMarket(address(registry), fee, router, ammFactory, address(this), address(0x7EA5));
        curveNew = new BondingCurveMarket(address(registry), fee, router, ammFactory, address(this), address(0x7EA5));
        factoryOld = _newFactory(curveOld);
        factoryNew = _newFactory(curveNew);
        registry.setTokenFactory(address(factoryOld));

        vm.deal(creator, 10 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(mallory, 1_000 ether);
    }

    function _newFactory(BondingCurveMarket c) internal returns (TokenFactory) {
        CreatorVesting vesting = new CreatorVesting(address(registry));
        CommunityTokenVault vault = new CommunityTokenVault(address(registry), address(this));
        return new TokenFactory(fee, c, vesting, vault, address(this));
    }

    function _launch(TokenFactory f) internal returns (PeopleProjectToken) {
        vm.prank(creator);
        return PeopleProjectToken(
            f.createToken{value: PeopleConstants.TOKEN_CREATE_FEE}("Tok", "TOK", 18, 1_000_000_000 ether, "")
        );
    }

    function _expectBlocked(address token) internal {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(PeopleAmmFactory.CurveNotMigrated.selector, token));
        ammFactory.createPair(token, address(wppl));
    }

    /// Rotation to a factory with its OWN curve: the retired factory's live curve stays guarded.
    function test_outsiderCannotPrelistOldCurveTokenAfterRotation() public {
        PeopleProjectToken t = _launch(factoryOld);
        _expectBlocked(address(t)); // sanity: guarded before rotation

        registry.setTokenFactory(address(factoryNew));
        assertFalse(factoryNew.isPeopleToken(address(t)), "new factory does not know the old token");

        _expectBlocked(address(t));
        assertEq(ammFactory.getPair(address(t), address(wppl)), address(0));

        // Pairing with another token is guarded the same way (either side of the pair).
        RotPlainToken plain = new RotPlainToken();
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(PeopleAmmFactory.CurveNotMigrated.selector, address(t)));
        ammFactory.createPair(address(plain), address(t));
    }

    /// The old curve migrates by itself after rotation and creates the pair.
    function test_oldCurveMigrationStillCreatesPairAfterRotation() public {
        PeopleProjectToken t = _launch(factoryOld);
        registry.setTokenFactory(address(factoryNew));

        vm.prank(alice);
        curveOld.buy{value: 200 ether}(address(t), 1, block.timestamp);
        assertTrue(curveOld.isMigrated(address(t)));

        PeoplePair pair = PeoplePair(ammFactory.getPair(address(t), address(wppl)));
        assertTrue(address(pair) != address(0), "pair created by migration");
        assertEq(pair.balanceOf(address(0xdead)), pair.totalSupply(), "migration LP locked");

        // Migrated: outsiders may list the token against other assets again.
        RotPlainToken plain = new RotPlainToken();
        vm.prank(mallory);
        ammFactory.createPair(address(t), address(plain));
    }

    /// Rotation to a factory that reuses the SAME curve (registry owner redeploys only the factory).
    function test_sameCurveRotationKeepsGuardAndMigration() public {
        BondingCurveMarket shared = curveOld;
        TokenFactory factorySameCurve = _newFactory(shared);
        PeopleProjectToken t = _launch(factoryOld);
        registry.setTokenFactory(address(factorySameCurve));

        _expectBlocked(address(t));
        vm.prank(alice);
        shared.buy{value: 200 ether}(address(t), 1, block.timestamp);
        assertTrue(ammFactory.getPair(address(t), address(wppl)) != address(0));
    }

    /// Tokens of the NEW factory are guarded too, and the old factory stays guarded after a
    /// second rotation back and forth.
    function test_newAndOldFactoryTokensBothGuardedAcrossRotations() public {
        PeopleProjectToken tOld = _launch(factoryOld);
        registry.setTokenFactory(address(factoryNew));
        PeopleProjectToken tNew = _launch(factoryNew);

        _expectBlocked(address(tOld));
        _expectBlocked(address(tNew));

        registry.setTokenFactory(address(factoryOld));
        _expectBlocked(address(tOld));
        _expectBlocked(address(tNew));

        vm.prank(alice);
        curveNew.buy{value: 200 ether}(address(tNew), 1, block.timestamp);
        assertTrue(ammFactory.getPair(address(tNew), address(wppl)) != address(0));
        _expectBlocked(address(tOld)); // still live
    }

    /// Tokens that did not come from any People factory behave as before.
    function test_nonFactoryTokensUnaffectedByRotation() public {
        RotPlainToken plain = new RotPlainToken();
        vm.prank(mallory);
        address p1 = ammFactory.createPair(address(plain), address(wppl));
        assertTrue(p1 != address(0));

        registry.setTokenFactory(address(factoryNew));
        RotPlainToken plain2 = new RotPlainToken();
        vm.prank(mallory);
        assertTrue(ammFactory.createPair(address(plain2), address(wppl)) != address(0));

        // A token exposing `factory()` that is not a People factory (EOA / unrelated contract).
        RotLookalikeToken eoaPointing = new RotLookalikeToken(address(0xdead));
        RotLookalikeToken contractPointing = new RotLookalikeToken(address(wppl));
        vm.startPrank(mallory);
        assertTrue(ammFactory.createPair(address(eoaPointing), address(wppl)) != address(0));
        assertTrue(ammFactory.createPair(address(contractPointing), address(wppl)) != address(0));
        vm.stopPrank();
    }

    /// A lookalike token naming a real People factory (which does not vouch for it) is not guarded.
    function test_lookalikeNamingRealFactoryIsNotGuarded() public {
        RotLookalikeToken fake = new RotLookalikeToken(address(factoryOld));
        vm.prank(mallory);
        assertTrue(ammFactory.createPair(address(fake), address(wppl)) != address(0));
    }
}
