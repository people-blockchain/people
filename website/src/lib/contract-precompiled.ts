import { createHash } from "node:crypto";
import artifacts from "./generated/contract-template-artifacts.json" with { type: "json" };
import type { ContractTemplateId } from "./contract-templates";

export interface PrecompiledTemplateArtifact {
  templateId: ContractTemplateId;
  fileName: string;
  sourceHash: string;
  name: string;
  abi: unknown;
  bytecode: string;
  deployedBytecode: string;
  compiler: string;
}

const byId = artifacts.templates as Record<string, PrecompiledTemplateArtifact>;

export function hashContractSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function lookupPrecompiledTemplate(
  templateId: string | undefined,
  source: string,
  fileName: string
): PrecompiledTemplateArtifact | null {
  if (!templateId || !(templateId in byId)) return null;
  const entry = byId[templateId]!;
  if (entry.fileName !== fileName) return null;
  if (entry.sourceHash !== hashContractSource(source)) return null;
  return entry;
}
