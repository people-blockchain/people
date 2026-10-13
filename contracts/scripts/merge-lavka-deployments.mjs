import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = join(root, "broadcast/DeployLavka.s.sol/97401/run-latest.json");
const out = join(root, "deployments/97401.json");
const websiteOut = join(root, "../website/src/data/evm-deployments-97401.json");

function loadAddr(name) {
  const data = JSON.parse(readFileSync(run, "utf8"));
  const hits = data.transactions.filter((t) => t.contractName === name).map((t) => t.contractAddress);
  return hits.at(-1) ?? null;
}

const base = JSON.parse(readFileSync(out, "utf8"));
base.contracts.lavkaPass = loadAddr("LavkaPass");
base.contracts.merchantEscrow = loadAddr("MerchantEscrow");
base.contracts.lavkaPayments = loadAddr("LavkaPayments");
base.rpcUrl = process.env.RPC_URL ?? base.rpcUrl;
writeFileSync(out, `${JSON.stringify(base, null, 2)}\n`);
writeFileSync(websiteOut, `${JSON.stringify(base, null, 2)}\n`);
console.log("merged lavka addresses into", out);
