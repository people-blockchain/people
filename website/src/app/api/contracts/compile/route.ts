import { NextResponse } from "next/server";
import { compileIsolated, type CompilationOutput } from "@/lib/solidity-compiler";
import { lookupPrecompiledTemplate } from "@/lib/contract-precompiled";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import {
  CONTRACT_COMPILE_RATE_PER_MIN,
  CONTRACT_COMPILE_TIMEOUT_MS,
  sourceWithinLimit
} from "@/lib/contract-api-guards";
import { clientIpFromRequest } from "@/lib/request-client-ip";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonFromOutput(fileName: string, output: CompilationOutput) {
  const errors = (output.errors ?? []).filter((item) => item.severity === "error");
  if (errors.length > 0 || !output.contracts?.[fileName]) {
    return NextResponse.json(
      { error: "compile_failed", details: errors.map((e) => e.formattedMessage) },
      { status: 400 }
    );
  }
  const contracts = output.contracts[fileName]!;
  const name = Object.keys(contracts)[0];
  if (!name) {
    return NextResponse.json({ error: "no_contract" }, { status: 400 });
  }
  const compiled = contracts[name]!;
  const bytecode = compiled.evm.bytecode.object;
  if (!bytecode) {
    return NextResponse.json({ error: "empty_bytecode" }, { status: 400 });
  }
  return NextResponse.json({
    name,
    abi: compiled.abi,
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
    deployedBytecode: compiled.evm.deployedBytecode.object,
    compiler: "solc-0.8"
  });
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!checkSlidingWindowRateLimit("contracts-compile", ip, CONTRACT_COMPILE_RATE_PER_MIN, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    source?: string;
    fileName?: string;
    templateId?: string;
    freeform?: boolean;
  };
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  if (source.length < 20) {
    return NextResponse.json({ error: "source_required" }, { status: 400 });
  }
  if (!sourceWithinLimit(source)) {
    return NextResponse.json({ error: "source_too_large" }, { status: 413 });
  }
  if (body.freeform && process.env.CONTRACT_AI_FREEFORM !== "1" && process.env.CONTRACT_AI_FREEFORM !== "true") {
    return NextResponse.json({ error: "freeform_disabled" }, { status: 400 });
  }
  const fileName = (typeof body.fileName === "string" ? body.fileName : "Contract.sol").replace(/[^A-Za-z0-9._-]/g, "") || "Contract.sol";
  const templateId = typeof body.templateId === "string" ? body.templateId : undefined;

  const precompiled = lookupPrecompiledTemplate(templateId, source, fileName);
  if (precompiled) {
    return NextResponse.json({
      name: precompiled.name,
      abi: precompiled.abi,
      bytecode: precompiled.bytecode,
      deployedBytecode: precompiled.deployedBytecode,
      compiler: precompiled.compiler
    });
  }

  let output: CompilationOutput;
  try {
    output = await compileIsolated(fileName, source, CONTRACT_COMPILE_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "compile_failed";
    const status = message === "compile_timeout" ? 504 : message === "compiler_busy" ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return jsonFromOutput(fileName, output);
}
