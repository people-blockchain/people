#!/usr/bin/env node
/** Compare ovn-export.json vs on-chain reads after migration. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, formatEther } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = join(ROOT, "deployments", "ovn-export.json");
const DEPLOYED = join(ROOT, "deployments", "97401.json");
const OUT = join(ROOT, "deployments", "migration-verification.md");

const chain = {
  id: 97401,
  name: "People",
  nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://node.peopleblockchain.network/rpc"] } },
};

async function main() {
  const exp = JSON.parse(readFileSync(EXPORT, "utf8"));
  const dep = JSON.parse(readFileSync(DEPLOYED, "utf8"));
  const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });

  const rows = [];
  for (const acct of exp.accounts ?? []) {
    const onChain = await client.getBalance({ address: acct.address });
    const expected = BigInt(Math.round(Number(acct.balance ?? 0) * 1e12));
    const ok = onChain >= expected * 99n / 100n;
    rows.push({
      address: acct.address,
      legacy: acct.legacyAddress,
      expectedPpl: acct.balance,
      onChainPpl: formatEther(onChain),
      ok,
    });
  }

  const md = [
    "# Testnet migration verification",
    "",
    `| Address (canonical) | Legacy | Expected PPL (OVN) | On-chain PPL (EVM) | OK |`,
    `| --- | --- | ---: | ---: | --- |`,
    ...rows.map(
      (r) => `| \`${r.address}\` | \`${r.legacy}\` | ${r.expectedPpl} | ${r.onChainPpl} | ${r.ok ? "yes" : "no"} |`
    ),
    "",
    `Assets mapped: ${Object.keys(dep.assetMap ?? {}).length}`,
    `Pools recorded: ${(dep.pools ?? []).length}`,
  ].join("\n");

  writeFileSync(OUT, `${md}\n`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
