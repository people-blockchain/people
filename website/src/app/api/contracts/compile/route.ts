import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { lookupPrecompiledTemplate } from "@/lib/contract-precompiled";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import {
  CONTRACT_COMPILE_IP_RATE_PER_MIN,
  CONTRACT_COMPILE_RATE_PER_MIN,
  MAX_CONTRACT_SOURCE_BYTES,
  sourceWithinLimit
} from "@/lib/contract-api-guards";
import { clientIpFromRequest } from "@/lib/request-client-ip";

export const runtime = "nodejs";
export const maxDuration = 60;

/** JSON envelope overhead allowed on top of the source cap (fileName, templateId, escaping). */
const MAX_BODY_BYTES = MAX_CONTRACT_SOURCE_BYTES * 2 + 1024;

/**
 * MF-16: sign-in is required, and this endpoint never invokes solc. It only serves artifacts that
 * were precompiled at build time from the reviewed templates, matched by template id, file name
 * and exact source hash. Arbitrary ("freeform") Solidity is rejected server-side: the former
 * `freeform` flag and `CONTRACT_AI_FREEFORM` env switch were only a client-side hint.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  const ip = clientIpFromRequest(request);
  if (
    !(await checkSharedRateLimit("contracts-compile-user", userId, CONTRACT_COMPILE_RATE_PER_MIN, 60_000)) ||
    !(await checkSharedRateLimit("contracts-compile-ip", ip, CONTRACT_COMPILE_IP_RATE_PER_MIN, 60_000))
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "source_too_large" }, { status: 413 });
  }
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "source_too_large" }, { status: 413 });
  }
  let body: { source?: unknown; fileName?: unknown; templateId?: unknown; freeform?: unknown } = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as typeof body;
  } catch {
    body = {};
  }

  // Do not trim: template artifacts are matched by the hash of the exact, untrimmed source.
  const source = typeof body.source === "string" ? body.source : "";
  if (source.trim().length < 20) {
    return NextResponse.json({ error: "source_required" }, { status: 400 });
  }
  if (!sourceWithinLimit(source)) {
    return NextResponse.json({ error: "source_too_large" }, { status: 413 });
  }
  if (body.freeform) {
    return NextResponse.json({ error: "freeform_disabled" }, { status: 400 });
  }
  const fileName =
    (typeof body.fileName === "string" ? body.fileName : "Contract.sol").replace(/[^A-Za-z0-9._-]/g, "") ||
    "Contract.sol";
  const templateId = typeof body.templateId === "string" ? body.templateId : undefined;

  const precompiled = lookupPrecompiledTemplate(templateId, source, fileName);
  if (!precompiled) {
    return NextResponse.json({ error: "template_required" }, { status: 400 });
  }
  return NextResponse.json({
    name: precompiled.name,
    abi: precompiled.abi,
    bytecode: precompiled.bytecode,
    deployedBytecode: precompiled.deployedBytecode,
    compiler: precompiled.compiler
  });
}
