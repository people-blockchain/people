// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC5192} from "./IERC5192.sol";

/// @title PeopleFounderNFT
/// @notice Free, non-transferable (ERC-5192 soulbound) "People Founder" NFT. One token per person
/// (`personId`) and one token per address. Token ids are sequential from 1.
///
/// @dev ELIGIBILITY. The contract cannot verify identity itself. The off-chain backend signs a mint
/// authorisation ONLY for a person verified through Human Passport (level 2). Telegram-only users are
/// never signed for. This check happens before signing; on-chain the signature is the sole gate.
///
/// SIGNER RISK. `signer` is immutable: there is no rotation, no owner and no arbitrary mint. If the
/// signing key is compromised, an attacker can issue new tokens (to fresh `personId`s) and rebind
/// existing ones until the key is replaced by redeploying. Mitigation: a short mint window
/// (`mintDeadline`, fixed in the constructor) after which `mint` is permanently closed. Note that
/// `rebind` stays signable after the window, so the key remains security-relevant for rebinds.
///
/// REBIND. `rebind` moves an existing token (same token id, same `personId`) from `oldHolder` to
/// `newHolder` on a backend-signed authorisation (wallet recovery / migration). It is not a new
/// issuance: it does not consume a new id, does not change `totalMinted`/`totalSupply`, and is
/// therefore allowed after `mintDeadline`. There is no on/off switch. The caller must be `newHolder`.
/// Mint and rebind share one nonce space per `personId`.
contract PeopleFounderNFT is ERC721, EIP712, IERC5192 {
    using Strings for uint256;

    bytes32 public constant MINT_TYPEHASH =
        keccak256("Mint(bytes32 personId,address to,uint256 nonce,uint256 deadline)");
    bytes32 public constant REBIND_TYPEHASH =
        keccak256("Rebind(bytes32 personId,address oldHolder,address newHolder,uint256 nonce,uint256 deadline)");

    /// @notice Address whose signatures authorise `mint` and `rebind`. Immutable.
    address public immutable signer;
    /// @notice Last timestamp (inclusive) at which `mint` is accepted. Does not limit `rebind`.
    uint256 public immutable mintDeadline;

    /// @notice Count of ids issued so far (ids are 1..totalMinted).
    uint256 public totalMinted;

    mapping(bytes32 personId => uint256 tokenId) private _tokenOfPerson;
    mapping(uint256 tokenId => bytes32 personId) private _personOf;
    /// @notice Whether `nonce` has been consumed for `personId` (shared by mint and rebind).
    mapping(bytes32 personId => mapping(uint256 nonce => bool used)) public usedNonces;

    event Minted(bytes32 indexed personId, uint256 indexed tokenId, address indexed to);
    event Rebound(bytes32 indexed personId, uint256 indexed tokenId, address oldHolder, address newHolder);

    error Soulbound();
    error ZeroSigner();
    error InvalidMintDeadline();
    error MintWindowClosed();
    error Expired();
    error NotRecipient();
    error ZeroAddress();
    error NonceUsed();
    error InvalidSignature();
    error InvalidPersonId();
    error PersonAlreadyMinted();
    error AddressAlreadyHolder();
    error OldHolderHasNoToken();
    error PersonMismatch();

    constructor(address signer_, uint256 mintDeadline_)
        ERC721("People Founder", "PFOUNDER")
        EIP712("PeopleFounderNFT", "1")
    {
        if (signer_ == address(0)) revert ZeroSigner();
        if (mintDeadline_ <= block.timestamp) revert InvalidMintDeadline();
        signer = signer_;
        mintDeadline = mintDeadline_;
    }

    // ------------------------------------------------------------------ mint / rebind

    /// @notice Mint the caller's Founder NFT using a backend signature. Free; caller must equal `to`.
    function mint(bytes32 personId, address to, uint256 nonce, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > mintDeadline) revert MintWindowClosed();
        if (block.timestamp > deadline) revert Expired();
        if (msg.sender != to) revert NotRecipient();
        if (to == address(0)) revert ZeroAddress();
        if (personId == bytes32(0)) revert InvalidPersonId();
        _consumeNonce(personId, nonce);
        _checkSignature(mintDigest(personId, to, nonce, deadline), signature);
        if (_tokenOfPerson[personId] != 0) revert PersonAlreadyMinted();
        if (balanceOf(to) != 0) revert AddressAlreadyHolder();

        uint256 tokenId = ++totalMinted;
        _tokenOfPerson[personId] = tokenId;
        _personOf[tokenId] = personId;
        _mint(to, tokenId);

        emit Locked(tokenId);
        emit Minted(personId, tokenId, to);
    }

    /// @notice Move the person's existing token from `oldHolder` to the caller (`newHolder`) on a backend
    /// signature. Same token id; supply is unchanged. Allowed after `mintDeadline`.
    function rebind(
        bytes32 personId,
        address oldHolder,
        address newHolder,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (msg.sender != newHolder) revert NotRecipient();
        if (newHolder == address(0)) revert ZeroAddress();
        _consumeNonce(personId, nonce);
        _checkSignature(rebindDigest(personId, oldHolder, newHolder, nonce, deadline), signature);
        if (oldHolder == address(0) || balanceOf(oldHolder) == 0) revert OldHolderHasNoToken();
        uint256 tokenId = _tokenOfPerson[personId];
        if (tokenId == 0 || _ownerOf(tokenId) != oldHolder) revert PersonMismatch();
        if (balanceOf(newHolder) != 0) revert AddressAlreadyHolder();

        _burn(tokenId);
        _mint(newHolder, tokenId);

        emit Locked(tokenId);
        emit Rebound(personId, tokenId, oldHolder, newHolder);
    }

    // ------------------------------------------------------------------ views

    /// @notice EIP-712 digest the backend signs for `mint`.
    function mintDigest(bytes32 personId, address to, uint256 nonce, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(MINT_TYPEHASH, personId, to, nonce, deadline)));
    }

    /// @notice EIP-712 digest the backend signs for `rebind`.
    function rebindDigest(bytes32 personId, address oldHolder, address newHolder, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(REBIND_TYPEHASH, personId, oldHolder, newHolder, nonce, deadline)));
    }

    /// @notice Token id held by `personId`, or 0 if none.
    function tokenOfPerson(bytes32 personId) external view returns (uint256) {
        return _tokenOfPerson[personId];
    }

    /// @notice `personId` bound to `tokenId` (zero for ids that were never issued).
    function personOf(uint256 tokenId) external view returns (bytes32) {
        return _personOf[tokenId];
    }

    /// @notice Total supply; equals `totalMinted` because rebind re-mints the same id it burns.
    function totalSupply() external view returns (uint256) {
        return totalMinted;
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice Fully on-chain metadata: JSON with an SVG image, both base64 data URIs.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory id = tokenId.toString();
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#111827"/>',
            '<text x="200" y="170" fill="#f9fafb" font-family="sans-serif" font-size="28" text-anchor="middle">People Founder</text>',
            '<text x="200" y="240" fill="#fbbf24" font-family="sans-serif" font-size="56" text-anchor="middle">#',
            id,
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"People Founder #',
            id,
            '","description":"Soulbound People Founder NFT, one per verified person.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ------------------------------------------------------------------ soulbound: block approvals and transfers

    function transferFrom(address, address, uint256) public pure override {
        revert Soulbound();
    }

    /// @dev The three-argument `safeTransferFrom` forwards here and therefore also reverts.
    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert Soulbound();
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ------------------------------------------------------------------ internals

    function _consumeNonce(bytes32 personId, uint256 nonce) private {
        if (usedNonces[personId][nonce]) revert NonceUsed();
        usedNonces[personId][nonce] = true;
    }

    function _checkSignature(bytes32 digest, bytes calldata signature) private view {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidSignature();
    }
}
