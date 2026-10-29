import { NextResponse } from "next/server";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { consumeFounderPassportNonce } from "@/lib/founders/passport-wallet-nonce";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { SALE_CHAIN, saleContractAddress } from "@/lib/sale/config";
import {
  evaluateSaleEligibilityForUser,
  recordSaleBinding,
} from "@/lib/sale/eligibility";
import { PPL_CURVE_HUB_ABI, saleHubPublicClient } from "@/lib/sale/hub-read";
import { getVerifierSigner } from "@/lib/sale/verifier/signer";
import { verificationDigest } from "@/lib/sale/verifier/typed-data";
import { SITE_URL } from "@/lib/site";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
const DEADLINE_SECONDS = 15 * 60;
const RATE_NAMESPACE = "sale-verify-signature";
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** SIWE-style proof that the session user owns the wallet it wants bound. */
export function buildSaleOwnershipMessage(input: {
  domain: string;
  account: Address;
  chainId: number;
  hub: Address;
  nonceCode?: string;
  issuedAt?: string;
  expiresAt?: string;
}): string {
  const lines = [
    `${input.domain} wants you to verify this wallet for the PPL sale.`,
    "",
    "This proves wallet ownership only. It does not move funds.",
    `Address: ${input.account}`,
    `Chain ID: ${input.chainId}`,
    `Hub: ${input.hub}`,
  ];
  if (input.nonceCode) {
    lines.push(`Nonce: ${input.nonceCode}`);
    if (input.issuedAt) lines.push(`Issued At: ${input.issuedAt}`);
    if (input.expiresAt) lines.push(`Expiration Time: ${input.expiresAt}`);
  }
  return lines.join("\n");
}

function saleDomain(): string {
  return (process.env.AUTH_URL?.trim() || SITE_URL).replace(/^https?:\/\//, "");
}

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  if (!(await checkSharedRateLimit(RATE_NAMESPACE, guard.userId, RATE_MAX, RATE_WINDOW_MS))) {
    return errorResponse("rate_limited", 429);
  }

  let body: { account?: unknown; ownershipSignature?: unknown; nonceCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", 400);
  }

  if (
    typeof body.account !== "string" ||
    !isAddress(body.account) ||
    typeof body.ownershipSignature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(body.ownershipSignature) ||
    (body.nonceCode !== undefined && typeof body.nonceCode !== "string")
  ) {
    return errorResponse("invalid_input", 400);
  }

  const account = getAddress(body.account);
  const hubRaw = saleContractAddress();
  if (!hubRaw) return errorResponse("sale_not_configured", 503);
  const hub = getAddress(hubRaw);
  const chainId = SALE_CHAIN.id;

  let nonceCode: string | undefined;
  let issuedAt: string | undefined;
  let expiresAt: string | undefined;
  if (typeof body.nonceCode === "string" && body.nonceCode.trim()) {
    nonceCode = body.nonceCode.trim();
    const consumed = await consumeFounderPassportNonce(nonceCode, guard.userId);
    if (!consumed.ok) return errorResponse("nonce_invalid", 422);
    issuedAt = consumed.issuedAt.toISOString();
    expiresAt = consumed.expiresAt.toISOString();
  }

  const message = buildSaleOwnershipMessage({
    domain: saleDomain(),
    account,
    chainId,
    hub,
    nonceCode,
    issuedAt,
    expiresAt,
  });
  let ownershipValid = false;
  try {
    ownershipValid = await verifyMessage({
      address: account,
      message,
      signature: body.ownershipSignature as Hex,
    });
  } catch {
    ownershipValid = false;
  }
  if (!ownershipValid) return errorResponse("invalid_signature", 422);

  let eligibility: Awaited<ReturnType<typeof evaluateSaleEligibilityForUser>>;
  try {
    eligibility = await evaluateSaleEligibilityForUser(guard.userId, account);
  } catch {
    return errorResponse("eligibility_unavailable", 503);
  }
  if (!eligibility.ok) {
    switch (eligibility.reason) {
      case "not_registered":
        return errorResponse("not_registered", 403);
      case "invalid_account":
        return errorResponse("invalid_input", 400);
      default:
        return errorResponse(eligibility.reason, 409);
    }
  }

  const personId = eligibility.personId;
  const client = saleHubPublicClient();
  let verifierOnChain: Address;
  let onChainPersonId: Hex;
  let onChainNonce: bigint;
  try {
    const [verifier, person, nonce] = await Promise.all([
      client.readContract({
        address: hub,
        abi: PPL_CURVE_HUB_ABI,
        functionName: "verifier",
      }),
      client.readContract({
        address: hub,
        abi: PPL_CURVE_HUB_ABI,
        functionName: "personOf",
        args: [account],
      }),
      client.readContract({
        address: hub,
        abi: PPL_CURVE_HUB_ABI,
        functionName: "bindNonce",
        args: [personId],
      }),
    ]);
    verifierOnChain = getAddress(verifier as Address);
    onChainPersonId = person as Hex;
    onChainNonce = nonce as bigint;
  } catch {
    return errorResponse("onchain_unavailable", 503);
  }

  if (onChainPersonId.toLowerCase() !== ZERO_BYTES32) {
    if (onChainPersonId.toLowerCase() === personId.toLowerCase()) {
      return errorResponse("already_bound", 409);
    }
    return errorResponse("account_bound_elsewhere", 409);
  }

  let signerAddress: Address;
  let signature: Hex;
  try {
    const signer = await getVerifierSigner(chainId);
    signerAddress = await signer.getAddress();
    if (getAddress(signerAddress) !== verifierOnChain) {
      return errorResponse("verifier_mismatch", 503);
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    const digest = verificationDigest({
      chainId,
      hub,
      message: { account, personId, nonce: onChainNonce, deadline },
    });
    signature = await signer.signDigest(digest);

    await recordSaleBinding({
      personId,
      account,
      chainId,
      hub,
      nonce: onChainNonce.toString(),
      deadline: new Date(Number(deadline) * 1000),
      status: "issued",
    });

    return NextResponse.json({
      personId,
      nonce: onChainNonce.toString(),
      deadline: Number(deadline),
      signature,
      hub,
      chainId,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "23505") return errorResponse("account_bound_elsewhere", 409);
    return errorResponse("signer_unavailable", 503);
  }
}
