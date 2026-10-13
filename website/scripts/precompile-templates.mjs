import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_TEMPLATES } from "../src/lib/contract-templates.ts";
import { compileSoliditySync } from "../src/lib/solidity-compiler.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templates = {};

for (const template of CONTRACT_TEMPLATES) {
  const output = compileSoliditySync(template.fileName, template.source);
  const errors = (output.errors ?? []).filter((item) => item.severity === "error");
  if (errors.length > 0 || !output.contracts?.[template.fileName]) {
    const detail = errors.map((e) => e.formattedMessage).join("\n") || "missing contract output";
    throw new Error(`precompile failed for ${template.id}: ${detail}`);
  }
  const contracts = output.contracts[template.fileName];
  const name = Object.keys(contracts)[0];
  const compiled = contracts[name];
  const bytecode = compiled.evm.bytecode.object;
  if (!bytecode) throw new Error(`precompile empty bytecode for ${template.id}`);
  const sourceHash = createHash("sha256").update(template.source, "utf8").digest("hex");
  templates[template.id] = {
    templateId: template.id,
    fileName: template.fileName,
    sourceHash,
    name,
    abi: compiled.abi,
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
    deployedBytecode: compiled.evm.deployedBytecode.object,
    compiler: "solc-0.8"
  };
}

const outDir = join(root, "src/lib/generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "contract-template-artifacts.json"), `${JSON.stringify({ templates }, null, 2)}\n`, "utf8");
console.log(`precompiled ${Object.keys(templates).length} contract templates`);
