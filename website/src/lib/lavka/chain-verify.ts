import { decodeEventLog, encodePacked, keccak256, type Hex } from "viem";
import { evmPublicClient } from "@/lib/evm/legacy-gas";
import {
  LAVKA_MAX_VISITS_PER_PURCHASE,
  lavkaPassAddress,
  merchantEscrowAbi,
  merchantEscrowAddress,
} from "@/lib/lavka/contracts";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const escrowCreatedEventAbi = [
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "customer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
] as const;

const visitRedeemedEventAbi = [
  {
    type: "event",
    name: "VisitRedeemed",
    inputs: [
      { name: "programId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "visits", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
    ],
  },
] as const;

const programCreatedEventAbi = [
  {
    type: "event",
    name: "ProgramCreated",
    inputs: [
      { name: "programId", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "visitsPerPurchase", type: "uint16", indexed: false },
      { name: "validUntil", type: "uint64", indexed: false },
      { name: "transferable", type: "bool", indexed: false },
      { name: "priceWei", type: "uint256", indexed: false },
    ],
  },
] as const;

export type ChainTxError =
  | "invalid_tx_hash"
  | "tx_not_found"
  | "tx_failed"
  | "wrong_contract"
  | "event_missing";

type EvmReceipt = Awaited<ReturnType<ReturnType<typeof evmPublicClient>["getTransactionReceipt"]>>;

type FetchContractReceiptResult =
  | { ok: true; contract: `0x${string}`; receipt: EvmReceipt }
  | { ok: false; error: ChainTxError };

/** Fetches a successful receipt whose `to` is exactly `expectedContract`. */
async function fetchContractReceipt(
  txHash: string,
  expectedContract: `0x${string}` | null,
): Promise<FetchContractReceiptResult> {
  if (!TX_HASH_RE.test(txHash)) return { ok: false, error: "invalid_tx_hash" };
  if (!expectedContract) return { ok: false, error: "wrong_contract" };
  const client = evmPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) return { ok: false, error: "tx_not_found" };
  if (receipt.status !== "success") return { ok: false, error: "tx_failed" };
  if (receipt.to?.toLowerCase() !== expectedContract.toLowerCase()) return { ok: false, error: "wrong_contract" };
  return { ok: true, contract: expectedContract, receipt };
}

async function fetchLavkaReceipt(txHash: string) {
  const fetched = await fetchContractReceipt(txHash, lavkaPassAddress());
  if (!fetched.ok) return fetched;
  return { ok: true as const, lavkaPass: fetched.contract, receipt: fetched.receipt };
}

export type RedeemVerifyResult =
  | { ok: true; chainProgramId: number; visits: number }
  | {
      ok: false;
      error:
        | ChainTxError
        | "program_mismatch"
        | "holder_mismatch"
        | "zero_visits"
        | "visits_mismatch";
    };

/**
 * Checks a decoded `VisitRedeemed` event against the program/holder the caller expects and,
 * when given, the visit count the caller itself requested (AUD-M14).
 *
 * The contract rejects `visits == 0` (AUD-H2, `ZeroVisits`), but the website must not rely on
 * that alone: a zero-count event that somehow landed would make the venue page record a free
 * redemption, so it is rejected here too. When `expectedVisits` is provided the on-chain count
 * must equal it, so a client cannot claim it redeemed one visit while the chain recorded another.
 */
export function matchRedeemVisitEvent(
  args: { programId: bigint; holder: string; visits: bigint },
  expectedChainProgramId: number,
  expectedHolder: string,
  expectedVisits?: number,
): RedeemVerifyResult {
  if (Number(args.programId) !== expectedChainProgramId) {
    return { ok: false, error: "program_mismatch" };
  }
  if (args.holder.toLowerCase() !== expectedHolder.toLowerCase()) {
    return { ok: false, error: "holder_mismatch" };
  }
  const visits = Number(args.visits);
  if (!Number.isFinite(visits) || visits < 1) {
    return { ok: false, error: "zero_visits" };
  }
  if (expectedVisits != null && visits !== expectedVisits) {
    return { ok: false, error: "visits_mismatch" };
  }
  return { ok: true, chainProgramId: Number(args.programId), visits };
}

/** Checks `redeemVisit` really happened on-chain for this program and this holder's wallet. */
export async function verifyRedeemVisitTx(
  txHash: string,
  expectedChainProgramId: number,
  expectedHolder: string,
  expectedVisits?: number,
): Promise<RedeemVerifyResult> {
  const fetched = await fetchLavkaReceipt(txHash);
  if (!fetched.ok) return fetched;
  for (const log of fetched.receipt.logs) {
    if (log.address.toLowerCase() !== fetched.lavkaPass.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: visitRedeemedEventAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "VisitRedeemed") continue;
    return matchRedeemVisitEvent(
      decoded.args as { programId: bigint; holder: string; visits: bigint },
      expectedChainProgramId,
      expectedHolder,
      expectedVisits,
    );
  }
  return { ok: false, error: "event_missing" };
}

export type ProgramCreatedVerifyResult =
  | {
      ok: true;
      chainProgramId: number;
      visitsPerPurchase: number;
      validUntil: Date | null;
      transferable: boolean;
      pricePpl: number;
    }
  | { ok: false; error: ChainTxError | "merchant_mismatch" | "invalid_program_terms" };

/** Checks `createProgram` really happened on-chain for this merchant's wallet. */
export async function verifyProgramCreatedTx(
  txHash: string,
  expectedMerchantWallet: string,
): Promise<ProgramCreatedVerifyResult> {
  const fetched = await fetchLavkaReceipt(txHash);
  if (!fetched.ok) return fetched;
  for (const log of fetched.receipt.logs) {
    if (log.address.toLowerCase() !== fetched.lavkaPass.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: programCreatedEventAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "ProgramCreated") continue;
    const args = decoded.args as {
      programId: bigint;
      merchant: string;
      visitsPerPurchase: number;
      validUntil: bigint;
      transferable: boolean;
      priceWei: bigint;
    };
    if (args.merchant.toLowerCase() !== expectedMerchantWallet.toLowerCase()) {
      return { ok: false, error: "merchant_mismatch" };
    }
    // AUD-M10: mirror the contract's `createProgram` bounds — never index a free program or
    // one with an unbounded visit count. Pre-redeploy deployments still emit such events.
    if (args.priceWei === BigInt(0) || Number(args.visitsPerPurchase) > LAVKA_MAX_VISITS_PER_PURCHASE) {
      return { ok: false, error: "invalid_program_terms" };
    }
    const validUntilSeconds = Number(args.validUntil);
    return {
      ok: true,
      chainProgramId: Number(args.programId),
      visitsPerPurchase: Number(args.visitsPerPurchase),
      validUntil: validUntilSeconds > 0 ? new Date(validUntilSeconds * 1000) : null,
      transferable: args.transferable,
      pricePpl: Number(args.priceWei) / 1e18,
    };
  }
  return { ok: false, error: "event_missing" };
}

export type EscrowCreatedVerifyResult =
  | {
      ok: true;
      chainEscrowId: number;
      merchant: string;
      customer: string;
      amountPpl: number;
      deadline: Date;
      termsHash: string;
    }
  | {
      ok: false;
      error: ChainTxError | "merchant_mismatch" | "customer_mismatch" | "terms_mismatch";
    };

/**
 * Checks `createEscrow` really happened on-chain, and returns the escrow's terms as the chain
 * recorded them. Callers must store *these* values, never the ones they sent: the id, the payer,
 * the payee and the amount are all attacker-controlled in the request body otherwise.
 *
 * When `termsNote` is given it must hash to the `termsHash` the escrow was created with, so the
 * off-chain note cannot be rewritten after the fact.
 */
export async function verifyEscrowCreatedTx(
  txHash: string,
  expectedMerchantWallet: string,
  expectedCustomerWallet: string,
  termsNote?: string | null,
): Promise<EscrowCreatedVerifyResult> {
  const merchantEscrow = merchantEscrowAddress();
  if (!merchantEscrow) return { ok: false, error: "wrong_contract" };
  const fetched = await fetchContractReceipt(txHash, merchantEscrow);
  if (!fetched.ok) return fetched;

  for (const log of fetched.receipt.logs) {
    if (log.address.toLowerCase() !== merchantEscrow.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: escrowCreatedEventAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== "EscrowCreated") continue;
    const args = decoded.args as {
      escrowId: bigint;
      merchant: string;
      customer: string;
      amount: bigint;
      deadline: bigint;
    };
    if (args.merchant.toLowerCase() !== expectedMerchantWallet.toLowerCase()) {
      return { ok: false, error: "merchant_mismatch" };
    }
    if (args.customer.toLowerCase() !== expectedCustomerWallet.toLowerCase()) {
      return { ok: false, error: "customer_mismatch" };
    }

    // `termsHash` is not in the event; read it back off the escrow itself.
    const escrow = await evmPublicClient()
      .readContract({
        address: merchantEscrow,
        abi: merchantEscrowAbi,
        functionName: "escrows",
        args: [args.escrowId],
      })
      .catch(() => null);
    if (!escrow) return { ok: false, error: "tx_not_found" };
    const termsHash = escrow[5] as Hex;
    if (termsNote) {
      const expected = keccak256(encodePacked(["string"], [termsNote.slice(0, 500)]));
      if (expected.toLowerCase() !== termsHash.toLowerCase()) {
        return { ok: false, error: "terms_mismatch" };
      }
    }

    return {
      ok: true,
      chainEscrowId: Number(args.escrowId),
      merchant: args.merchant.toLowerCase(),
      customer: args.customer.toLowerCase(),
      amountPpl: Number(args.amount) / 1e18,
      deadline: new Date(Number(args.deadline) * 1000),
      termsHash,
    };
  }
  return { ok: false, error: "event_missing" };
}
