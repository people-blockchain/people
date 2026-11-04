#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const rawArgs = process.argv.slice(2);
const filteredArgs = rawArgs.filter((a) => a !== "run" && !a.startsWith("-"));

const targetFiles = [];
if (filteredArgs.length === 0) {
  targetFiles.push("src/lib/partner/*.test.ts");
} else {
  for (const arg of filteredArgs) {
    try {
      const st = statSync(arg);
      if (st.isDirectory()) {
        const entries = readdirSync(arg);
        const tests = entries
          .filter((e) => e.endsWith(".test.ts") || e.endsWith(".test.mjs"))
          .map((e) => join(arg, e));
        targetFiles.push(...tests);
      } else {
        targetFiles.push(arg);
      }
    } catch {
      targetFiles.push(arg);
    }
  }
}

const nodeArgs = [
  "--import",
  "./scripts/node-test-paths.mjs",
  "--experimental-strip-types",
  "--test",
  ...targetFiles,
];

const res = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
process.exit(res.status ?? 0);
