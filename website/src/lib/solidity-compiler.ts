import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import solc from "solc";

export interface CompilationOutput {
  errors?: Array<{ severity: string; formattedMessage: string }>;
  contracts?: Record<
    string,
    Record<string, { abi: unknown; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>
  >;
}

const ozRoot = fs.realpathSync(path.join(process.cwd(), "node_modules/@openzeppelin/contracts"));

/** Only reviewed OpenZeppelin paths under node_modules; blocks traversal and arbitrary reads. */
export function findSolidityImport(name: string): { contents?: string; error?: string } {
  try {
    if (
      typeof name !== "string" ||
      !name.startsWith("@openzeppelin/contracts/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    ) {
      return { error: "import_not_allowed" };
    }
    const resolved = fs.realpathSync(path.join(process.cwd(), "node_modules", name));
    if (!resolved.startsWith(ozRoot + path.sep) || !resolved.endsWith(".sol")) {
      return { error: "import_not_allowed" };
    }
    return { contents: fs.readFileSync(resolved, "utf8") };
  } catch {
    return { error: "import_not_allowed" };
  }
}

export function compileSoliditySync(fileName: string, source: string): CompilationOutput {
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  return JSON.parse(solc.compile(JSON.stringify(input), { import: findSolidityImport })) as CompilationOutput;
}

/**
 * Compiler worker source. `solc.compile` is synchronous and cannot be interrupted, so it is
 * run in a worker thread that the caller can terminate on timeout. Kept as an `eval` worker
 * string so it needs no extra file to be traced into the deployment bundle.
 */
const COMPILE_WORKER_SOURCE = `
const fs = require("node:fs");
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");
const solc = require("solc");

function findImport(name) {
  try {
    if (
      typeof name !== "string" ||
      !name.startsWith("@openzeppelin/contracts/") ||
      name.includes("\\\\") ||
      name.split("/").includes("..")
    ) {
      return { error: "import_not_allowed" };
    }
    const ozRoot = fs.realpathSync(path.join(process.cwd(), "node_modules/@openzeppelin/contracts"));
    const resolved = fs.realpathSync(path.join(process.cwd(), "node_modules", name));
    if (!resolved.startsWith(ozRoot + path.sep) || !resolved.endsWith(".sol")) {
      return { error: "import_not_allowed" };
    }
    return { contents: fs.readFileSync(resolved, "utf8") };
  } catch (e) {
    return { error: "import_not_allowed" };
  }
}

try {
  const input = {
    language: "Solidity",
    sources: { [workerData.fileName]: { content: workerData.source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  parentPort.postMessage({ ok: true, output });
} catch (e) {
  parentPort.postMessage({ ok: false });
}
`;

let active = 0;

export async function compileIsolated(
  fileName: string,
  source: string,
  timeoutMs = 25_000
): Promise<CompilationOutput> {
  if (active >= 2) throw new Error("compiler_busy");
  active++;
  try {
    return await new Promise<CompilationOutput>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(COMPILE_WORKER_SOURCE, {
        eval: true,
        workerData: { fileName, source },
        resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 },
      });
      const finish = (run: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        run();
      };
      const timer = setTimeout(() => finish(() => reject(new Error("compile_timeout"))), timeoutMs);
      worker.once("message", (message: { ok?: boolean; output?: CompilationOutput }) => {
        if (message?.ok && message.output) finish(() => resolve(message.output as CompilationOutput));
        else finish(() => reject(new Error("compile_failed")));
      });
      worker.once("error", () => finish(() => reject(new Error("compile_failed"))));
      worker.once("exit", (code) => {
        if (code !== 0) finish(() => reject(new Error("compile_failed")));
      });
    });
  } finally {
    active--;
  }
}
