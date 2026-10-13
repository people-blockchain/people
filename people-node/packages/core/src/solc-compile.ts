import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

/** Import roots a submitted contract may pull in. */
const ALLOWED_IMPORT_PREFIXES = ["@openzeppelin/contracts/"];

/** Reject absolute paths, parent traversal, backslashes and anything outside the allowlist. */
export function isAllowedImportPath(importPath: string): boolean {
  if (typeof importPath !== "string" || importPath.length === 0 || importPath.length > 256) {
    return false;
  }
  if (importPath.includes("..") || importPath.includes("\\") || importPath.startsWith("/")) {
    return false;
  }
  return ALLOWED_IMPORT_PREFIXES.some((prefix) => importPath.startsWith(prefix));
}

export function compileSolidity(fileName: string, source: string): { name: string; bytecode: string; abi: unknown } {
  const solc = require("solc") as {
    compile: (input: string, callback?: unknown) => string;
  };
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] }
      }
    }
  };
  // Only the vendored OpenZeppelin tree may be resolved. Without this, a deployer could name
  // an absolute path or a node core module and read any file resolvable by this process back
  // through compiler diagnostics (`formattedMessage` quotes source lines).
  const findImports = (importPath: string): { contents: string } | { error: string } => {
    if (!isAllowedImportPath(importPath)) {
      return { error: `import not allowed ${importPath}` };
    }
    try {
      return { contents: readFileSync(require.resolve(importPath), "utf8") };
    } catch {
      return { error: `missing import ${importPath}` };
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports })) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<
      string,
      Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>
    >;
  };
  const errors = (output.errors ?? []).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  }
  const compiled = output.contracts?.[fileName];
  const name = compiled ? Object.keys(compiled)[0] : undefined;
  if (!name || !compiled?.[name]?.evm.bytecode.object) {
    throw new Error(`compile produced no bytecode for ${fileName}`);
  }
  const bytecode = compiled[name]!.evm.bytecode.object;
  return {
    name,
    abi: compiled[name]!.abi,
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`
  };
}

export function encodeAddress(addr: string): string {
  return addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

export function encodeUint(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

export function encodeAddressArrayThenUint(addresses: string[], n: bigint): string {
  return `0x${encodeUint(64n)}${encodeUint(n)}${encodeUint(BigInt(addresses.length))}${addresses
    .map(encodeAddress)
    .join("")}`;
}

export function concatConstructor(bytecode: string, argsHex: string): string {
  const args = argsHex.replace(/^0x/i, "");
  return `${bytecode}${args}`;
}
