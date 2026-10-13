import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Any } from "cosmjs-types/google/protobuf/any.js";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin.js";
import { PubKey as Secp256k1PubKey } from "cosmjs-types/cosmos/crypto/secp256k1/keys.js";
import { MsgVote, MsgSubmitProposal } from "cosmjs-types/cosmos/gov/v1/tx.js";
import { VoteOption } from "cosmjs-types/cosmos/gov/v1/gov.js";
import { TxBody, AuthInfo, SignDoc, TxRaw, Fee, SignerInfo, ModeInfo } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing.js";
import { bech32FromEvmAddress } from "./address";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { hexToBytes } = secp.etc;

/**
 * The node is a cosmos-evm chain: accounts hold an ethsecp256k1 key, but
 * cosmjs-types only ships the stock secp256k1 PubKey message. Both encode as
 * a single `bytes key = 1` field, so reuse that codec under the chain's
 * actual type URL.
 */
export const ETHSECP256K1_PUBKEY_TYPE_URL = "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey";

export { VoteOption };

export interface GovSigner {
  /** 0x-prefixed hex, 32 bytes. */
  privateKey: string;
  /** 0x-prefixed hex, 33-byte compressed public key. */
  publicKey: string;
}

export interface SignedTxParts {
  bodyBytes: Uint8Array;
  authInfoBytes: Uint8Array;
  signature: Uint8Array;
}

function compressedPubKeyBytes(publicKeyHex: string): Uint8Array {
  const hex = publicKeyHex.replace(/^0x/i, "");
  const bytes = hexToBytes(hex);
  if (bytes.length === 33) return bytes;
  if (bytes.length === 65) return secp.Point.fromBytes(bytes).toBytes(true);
  throw new Error("invalid_public_key");
}

export function voterAddressFromSigner(signer: GovSigner): string {
  const compressed = compressedPubKeyBytes(signer.publicKey);
  const uncompressed = secp.Point.fromBytes(compressed).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  const evmAddress = `0x${secp.etc.bytesToHex(hash.slice(-20))}`;
  return bech32FromEvmAddress(evmAddress);
}

function signerPubKeyAny(signer: GovSigner): Any {
  const key = compressedPubKeyBytes(signer.publicKey);
  return Any.fromPartial({
    typeUrl: ETHSECP256K1_PUBKEY_TYPE_URL,
    value: Secp256k1PubKey.encode({ key }).finish(),
  });
}

function signDirect(signer: GovSigner, bodyBytes: Uint8Array, authInfoBytes: Uint8Array, chainId: string, accountNumber: bigint): Uint8Array {
  const signDocBytes = SignDoc.encode(
    SignDoc.fromPartial({ bodyBytes, authInfoBytes, chainId, accountNumber })
  ).finish();
  const digest = keccak_256(signDocBytes);
  const privateKey = hexToBytes(signer.privateKey.replace(/^0x/i, ""));
  // `digest` is already the keccak256 hash the chain expects to verify against — noble's
  // `sign()` defaults to re-hashing its input with sha256 (`prehash: true`), which would sign
  // sha256(digest) instead and fail on-chain verification. Disable that.
  return secp.sign(digest, privateKey, { prehash: false });
}

function buildAuthInfoBytes(signer: GovSigner, sequence: bigint, gasLimit: bigint, feeAmount: Coin[]): Uint8Array {
  const authInfo: AuthInfo = AuthInfo.fromPartial({
    signerInfos: [
      SignerInfo.fromPartial({
        publicKey: signerPubKeyAny(signer),
        modeInfo: ModeInfo.fromPartial({ single: { mode: SignMode.SIGN_MODE_DIRECT } }),
        sequence,
      }),
    ],
    fee: Fee.fromPartial({ amount: feeAmount, gasLimit }),
  });
  return AuthInfo.encode(authInfo).finish();
}

function finalizeSignedTx(
  signer: GovSigner,
  bodyBytes: Uint8Array,
  sequence: bigint,
  gasLimit: bigint,
  feeAmount: Coin[],
  chainId: string,
  accountNumber: bigint
): Uint8Array {
  const authInfoBytes = buildAuthInfoBytes(signer, sequence, gasLimit, feeAmount);
  const signature = signDirect(signer, bodyBytes, authInfoBytes, chainId, accountNumber);
  const txRaw: TxRaw = TxRaw.fromPartial({ bodyBytes, authInfoBytes, signatures: [signature] });
  return TxRaw.encode(txRaw).finish();
}

export interface BuildVoteTxInput {
  signer: GovSigner;
  proposalId: bigint;
  option: VoteOption;
  sequence: bigint;
  accountNumber: bigint;
  chainId: string;
  gasLimit: bigint;
  feeAmount: Coin[];
  memo?: string;
}

/** Encodes and signs a single `MsgVote`; the returned bytes are ready for `/cosmos/tx/v1beta1/txs`. */
export function buildSignedVoteTx(input: BuildVoteTxInput): Uint8Array {
  const voter = voterAddressFromSigner(input.signer);
  const msg = MsgVote.fromPartial({ proposalId: input.proposalId, voter, option: input.option, metadata: "" });
  const bodyBytes = TxBody.encode(
    TxBody.fromPartial({
      messages: [Any.fromPartial({ typeUrl: "/cosmos.gov.v1.MsgVote", value: MsgVote.encode(msg).finish() })],
      memo: input.memo ?? "",
    })
  ).finish();
  return finalizeSignedTx(
    input.signer,
    bodyBytes,
    input.sequence,
    input.gasLimit,
    input.feeAmount,
    input.chainId,
    input.accountNumber
  );
}

export interface BuildSubmitProposalTxInput {
  signer: GovSigner;
  title: string;
  summary: string;
  initialDeposit: Coin[];
  sequence: bigint;
  accountNumber: bigint;
  chainId: string;
  gasLimit: bigint;
  feeAmount: Coin[];
  memo?: string;
  /** x/gov rejects a proposal with both empty `messages` and empty `metadata` (ErrNoProposalMsgs), so a pure text proposal needs a non-empty value here. */
  metadata?: string;
}

/** Encodes and signs a messages-less `MsgSubmitProposal` (a pure text/signalling proposal). */
export function buildSignedSubmitProposalTx(input: BuildSubmitProposalTxInput): Uint8Array {
  const proposer = voterAddressFromSigner(input.signer);
  const msg = MsgSubmitProposal.fromPartial({
    messages: [],
    initialDeposit: input.initialDeposit,
    proposer,
    metadata: input.metadata ?? "",
    title: input.title,
    summary: input.summary,
    expedited: false,
  });
  const bodyBytes = TxBody.encode(
    TxBody.fromPartial({
      messages: [
        Any.fromPartial({ typeUrl: "/cosmos.gov.v1.MsgSubmitProposal", value: MsgSubmitProposal.encode(msg).finish() }),
      ],
      memo: input.memo ?? "",
    })
  ).finish();
  return finalizeSignedTx(
    input.signer,
    bodyBytes,
    input.sequence,
    input.gasLimit,
    input.feeAmount,
    input.chainId,
    input.accountNumber
  );
}
