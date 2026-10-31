import { NextResponse } from "next/server";
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { isDatabaseConfigured } from "@/db";
import { evmJsonRpc } from "@/lib/evm/rpc-server";
import { resolveKnownToken } from "@/lib/evm/people-compat";
import { upsertTokenIconOverride } from "@/lib/evm/token-icon-overrides";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { isTokenIconUri, tokenIconMessage } from "@/lib/token-icon-rules";

export const runtime = "nodejs";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_MESSAGE_AGE_MS = 10 * 60_000;

const CREATOR_ABI = [
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

type Body = {
  token?: unknown;
  imageUri?: unknown;
  signature?: unknown;
  issuedAt?: unknown;
};

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return bad("storage_unavailable", 503);
  if (!(await checkSharedRateLimit("evm-token-icon", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS))) {
    return bad("rate_limited", 429);
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return bad("invalid_body");
  const tokenRaw = typeof body.token === "string" ? body.token.trim() : "";
  const imageUri = typeof body.imageUri === "string" ? body.imageUri.trim() : "";
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const issuedAt = typeof body.issuedAt === "string" ? body.issuedAt.trim() : "";

  if (!isAddress(tokenRaw)) return bad("invalid_token");
  if (!isTokenIconUri(imageUri)) return bad("invalid_image_uri");
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return bad("invalid_signature");
  const issuedMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedMs) || Math.abs(Date.now() - issuedMs) > MAX_MESSAGE_AGE_MS) {
    return bad("stale_signature");
  }

  const known = await resolveKnownToken(tokenRaw).catch(() => null);
  if (!known) return bad("unknown_token", 404);
  const token = getAddress(known);
  const tokenLower = token.toLowerCase();

  const creator = await evmJsonRpc<string>("eth_call", [
    {
      to: token,
      data: encodeFunctionData({ abi: CREATOR_ABI, functionName: "creator" }),
    },
    "latest",
  ])
    .then((out) =>
      decodeFunctionResult({
        abi: CREATOR_ABI,
        functionName: "creator",
        data: (out && out !== "0x" ? out : `0x${"0".repeat(64)}`) as Hex,
      }),
    )
    .catch(() => null);
  if (!creator || !isAddress(creator) || /^0x0{40}$/i.test(creator)) return bad("unknown_token", 404);

  const message = tokenIconMessage(tokenLower, imageUri, issuedAt);
  const valid = await verifyMessage({
    address: getAddress(creator),
    message,
    signature: signature as Hex,
  }).catch(() => false);
  if (!valid) return bad("invalid_signature", 403);

  try {
    await upsertTokenIconOverride(tokenLower, imageUri, creator);
  } catch {
    return bad("storage_unavailable", 503);
  }
  return NextResponse.json({ ok: true, token: tokenLower, imageUri });
}
