/**
 * Reads the forge build output for contracts/src/samples/*.sol and writes a committed JSON
 * artifact (ABI + creation bytecode + the exact .sol source text) that the website reads at
 * build/runtime. Run `cd contracts && forge build` first, then this script, whenever the
 * sample contracts change. Not wired into the website's own build because forge isn't
 * available on the website's build runner.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(websiteRoot, "..");
const contractsOut = join(repoRoot, "contracts", "out");
const samplesSrc = join(repoRoot, "contracts", "src", "samples");

const TEMPLATES = [
  { id: "escrow", file: "SampleEscrow.sol", contract: "SampleEscrow" },
  { id: "vesting", file: "SampleVestingTimelock.sol", contract: "SampleVestingTimelock" },
  { id: "crowdfund", file: "SampleCrowdfund.sol", contract: "SampleCrowdfund" },
  { id: "erc20", file: "SampleERC20.sol", contract: "SampleERC20" },
  { id: "stablecoin", file: "TestStablecoin.sol", contract: "TestStablecoin" },
];

const templates = {};
for (const t of TEMPLATES) {
  const artifactPath = join(contractsOut, t.file, `${t.contract}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const source = readFileSync(join(samplesSrc, t.file), "utf8");
  const bytecode = artifact.bytecode?.object;
  if (!bytecode) throw new Error(`missing bytecode for ${t.id} at ${artifactPath}`);
  templates[t.id] = {
    templateId: t.id,
    fileName: t.file,
    contractName: t.contract,
    source,
    abi: artifact.abi,
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
  };
}

const outDir = join(websiteRoot, "src", "lib", "generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "sample-contracts-artifacts.json"),
  `${JSON.stringify({ templates }, null, 2)}\n`,
  "utf8"
);
console.log(`generated artifacts for ${Object.keys(templates).length} sample contracts`);
