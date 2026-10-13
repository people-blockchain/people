import { expect, test } from "vitest";
import { isAllowedImportPath } from "./solc-compile.js";

test("M12-7: only the vendored OpenZeppelin tree may be imported", () => {
  expect(isAllowedImportPath("@openzeppelin/contracts/token/ERC20/ERC20.sol")).toBe(true);
});

test("M12-7: absolute paths, core modules and traversal are refused", () => {
  for (const path of [
    "/etc/passwd",
    "/proc/self/environ",
    "fs",
    "node:fs",
    "child_process",
    "../../../../etc/passwd",
    "@openzeppelin/contracts/../../../etc/passwd",
    "@openzeppelin/contracts\\..\\..\\secret",
    "swagger-ui-dist/package.json",
    "",
    "x".repeat(300)
  ]) {
    expect(isAllowedImportPath(path), path).toBe(false);
  }
});

test("M12-7: a non-string import request is refused", () => {
  expect(isAllowedImportPath(undefined as unknown as string)).toBe(false);
  expect(isAllowedImportPath({} as unknown as string)).toBe(false);
});
