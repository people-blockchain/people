import { NextResponse } from "next/server";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { consumeFounderPassportNonce } from "@/lib/founders/passport-wallet-nonce";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { getVerifierSignerForVersion } from "@/lib/sale/verifier/signer";
import {
  evaluateSaleEligibilityForUser,
  recordSaleBinding,
} from "@/lib/sale/eligibility";
import { PPL_CURVE_HUB_ABI, saleHubPublicClient } from "@/lib/sale/hub-read";
import { verificationDigest } from "@/lib/sale/verifier/typed-data";
import { parseSaleNonceCode } from "@/lib/sale/v2/ownership";
import { parseSaleVerifyVersion, readVerifyTargetEnv, resolveVerifyTarget, saleOwnershipMessage } from "@/lib/sale/verify-target";
import { SITE_URL } from "@/lib/site";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
const DEADLINE_SECONDS = 15 * 60;
const RATE_NAMESPACE = "sale-verify-signature";
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  if (!(await checkSharedRateLimit(RATE_NAMESPACE, guard.userId, RATE_MAX, RATE_WINDOW_MS))) {
    return errorResponse("rate_limited", 429);
  }

  let body: { account?: unknown; ownershipSignature?: unknown; nonceCode?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", 400);
  }

  const nonceCode = parseSaleNonceCode(body.nonceCode);
  if (!nonceCode) return errorResponse("nonce_required", 400);

  if (
    typeof body.account !== "string" ||
    !isAddress(body.account) ||
    typeof body.ownershipSignature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(body.ownershipSignature)
  ) {
    return errorResponse("invalid_input", 400);
  }

  const account = getAddress(body.account);
  const version = parseSaleVerifyVersion(body.version);
  const target = resolveVerifyTarget(version, readVerifyTargetEnv());
  if (!target.hub) return errorResponse("sale_not_configured", 503);
  const hub = getAddress(target.hub);
  const chainId = target.chainId;

  const consumed = await consumeFounderPassportNonce(nonceCode, guard.userId);
  if (!consumed.ok) return errorResponse("nonce_invalid", 422);
  const issuedAt = consumed.issuedAt.toISOString();
  const expiresAt = consumed.expiresAt.toISOString();

  const message = saleOwnershipMessage(target, {
    domain: version === "v2" ? SITE_URL : process.env.AUTH_URL?.trim() || SITE_URL,
    account,
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
    const signer = await getVerifierSignerForVersion(version, chainId);
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
