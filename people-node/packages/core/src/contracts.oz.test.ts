import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { describe, expect, test } from "vitest";
import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_CONFIG,
  DEFAULT_TX_GAS_LIMIT,
  MAX_TX_GAS_LIMIT,
  applyTransaction,
  bytesToHex,
  computeStateRoot,
  createInitialState,
  ensureAccount,
  generateKeyPair,
  NATIVE_ASSET_ID,
  quoteContractFeePpl,
  signTransaction,
  staticContractCall
} from "./index.js";
import {
  compileSolidity,
  concatConstructor,
  encodeAddress,
  encodeAddressArrayThenUint,
  encodeUint
} from "./solc-compile.js";

const HEADER = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
`;

const ERC20_SOURCE = `${HEADER}import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PeopleERC20 is ERC20 {
    constructor() ERC20("PeopleTest", "PTST") {
        _mint(msg.sender, 1_000_000 ether);
    }
}
`;

function fund(state: ReturnType<typeof createInitialState>, address: string, amount: number): void {
  const account = ensureAccount(state, address);
  account.balance = amount;
  account.balances[NATIVE_ASSET_ID] = amount;
}

function selector(signature: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(signature)).slice(0, 4));
}

function loadWebsiteTemplates(): Array<{ id: string; fileName: string; source: string }> {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../../../website/src/lib/contract-templates.ts");
  const text = readFileSync(path, "utf8");
  const out: Array<{ id: string; fileName: string; source: string }> = [];
  const re = /id: "([^"]+)"[\s\S]*?fileName: "([^"]+)"[\s\S]*?source: `\$\{HEADER\}([\s\S]*?)`/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push({ id: match[1]!, fileName: match[2]!, source: `${HEADER}${match[3]!}` });
  }
  return out;
}

function bytecodeForTemplate(
  template: { id: string; fileName: string; source: string },
  token: string,
  user: string
): string {
  const compiled = compileSolidity(template.fileName, template.source);
  if (template.id === "vesting") {
    return concatConstructor(
      compiled.bytecode,
      `0x${encodeAddress(token)}${encodeAddress(user)}${encodeUint(86_400n)}${encodeUint(1_000n)}`
    );
  }
  if (template.id === "multisig") {
    return concatConstructor(
      compiled.bytecode,
      encodeAddressArrayThenUint([user, "0x" + "11".repeat(20), "0x" + "22".repeat(20)], 2n)
    );
  }
  if (template.id === "timelock") {
    return concatConstructor(compiled.bytecode, `0x${encodeUint(3600n)}`);
  }
  if (template.id === "escrow") {
    return concatConstructor(compiled.bytecode, `0x${encodeAddress(user)}${encodeUint(60n)}`);
  }
  if (template.id === "airdrop") {
    return concatConstructor(compiled.bytecode, `0x${encodeAddress(token)}`);
  }
  if (template.id === "staking") {
    return concatConstructor(compiled.bytecode, `0x${encodeAddress(token)}${encodeAddress(token)}`);
  }
  if (template.id === "crowdfund") {
    return concatConstructor(compiled.bytecode, `0x${encodeUint(1_000n)}${encodeUint(86_400n)}`);
  }
  if (template.id === "dao") {
    return concatConstructor(compiled.bytecode, `0x${encodeAddress(token)}${encodeUint(1n)}${encodeUint(60n)}`);
  }
  return compiled.bytecode;
}

async function deploy(
  state: ReturnType<typeof createInitialState>,
  user: ReturnType<typeof generateKeyPair>,
  id: string,
  bytecode: string,
  nonce: number,
  gasLimit = MAX_TX_GAS_LIMIT
) {
  const tx = signTransaction(user.privateKey, {
    id,
    from: user.address,
    to: "0x0000000000000000000000000000000000000000",
    amount: 0,
    fee: quoteContractFeePpl(gasLimit),
    nonce,
    timestamp: nonce + 1,
    type: "contractDeploy",
    payload: { bytecode, gasLimit }
  });
  await applyTransaction(state, tx, DEFAULT_CONFIG);
  const receipt = state.contractReceipts?.[id];
  expect(receipt?.status, receipt?.error).toBe(1);
  expect(receipt?.contractAddress).toMatch(/^0x[0-9a-f]{40}$/);
  return receipt!.contractAddress!;
}

describe("OpenZeppelin templates on @ethereumjs/evm", () => {
  test("ERC20 and /create/contract templates share stateRoot across two nodes", async () => {
    expect(APPROVED_CONTRACT_GAS_PRICE_PPL).toBe(8.7e-7);
    const templates = loadWebsiteTemplates();
    expect(templates.map((item) => item.id).sort()).toEqual(
      ["airdrop", "crowdfund", "dao", "escrow", "multisig", "staking", "timelock", "vesting"].sort()
    );

    const erc20 = compileSolidity("PeopleERC20.sol", ERC20_SOURCE);
    const user = generateKeyPair();

    async function runNode() {
      const state = createInitialState();
      fund(state, user.address, 50);
      const token = await deploy(state, user, "oz-erc20", erc20.bytecode, 0);
      let nonce = 1;
      for (const template of templates) {
        const bytecode = bytecodeForTemplate(template, token, user.address);
        await deploy(state, user, `oz-${template.id}`, bytecode, nonce);
        nonce += 1;
      }
      const view = await staticContractCall(state, user.address, token, selector("name()"));
      expect(view.status).toBe(1);
      expect(view.returnData.length).toBeGreaterThan(2);
      expect(Object.keys(state.contracts).length).toBe(templates.length + 1);
      return state;
    }

    const a = await runNode();
    const b = await runNode();
    expect(computeStateRoot(a)).toBe(computeStateRoot(b));
    expect(Object.keys(a.contracts).sort()).toEqual(Object.keys(b.contracts).sort());
    for (const address of Object.keys(a.contracts)) {
      expect(a.contracts[address]!.code).toBe(b.contracts[address]!.code);
      expect(a.contracts[address]!.storage).toEqual(b.contracts[address]!.storage);
    }
  }, 20_000);

  test("OZ ERC-20 deploy runs out of gas without storing code", async () => {
    const erc20 = compileSolidity("PeopleERC20.sol", ERC20_SOURCE);
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 50);
    const hex = erc20.bytecode.replace(/^0x/i, "");
    let calldata = 0;
    for (let i = 0; i < hex.length; i += 2) {
      calldata += hex.slice(i, i + 2) === "00" ? 4 : 16;
    }
    const gasLimit = 21_000 + 32_000 + calldata + 50_000;
    expect(gasLimit).toBeLessThan(1_200_000);
    const fee = quoteContractFeePpl(gasLimit);
    await applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "oz-oog",
        from: user.address,
        to: "0x0000000000000000000000000000000000000000",
        amount: 0,
        fee,
        nonce: 0,
        timestamp: 1,
        type: "contractDeploy",
        payload: { bytecode: erc20.bytecode, gasLimit }
      }),
      DEFAULT_CONFIG
    );
    expect(state.contractReceipts?.["oz-oog"]?.status).toBe(0);
    expect(Object.keys(state.contracts ?? {})).toEqual([]);
  });

  test("rejects deploy when prepaid gas quote exceeds available PPL", async () => {
    const erc20 = compileSolidity("PeopleERC20.sol", ERC20_SOURCE);
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 0.0001);
    const fee = quoteContractFeePpl(MAX_TX_GAS_LIMIT);
    expect(fee).toBeGreaterThan(0.0001);
    const tx = signTransaction(user.privateKey, {
      id: "oz-poor",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode: erc20.bytecode, gasLimit: MAX_TX_GAS_LIMIT }
    });
    await expect(applyTransaction(state, tx, DEFAULT_CONFIG)).rejects.toThrow(/Insufficient balance/);
  });

  test("rejects when tx.fee is below the prepaid gas quote", async () => {
    const erc20 = compileSolidity("PeopleERC20.sol", ERC20_SOURCE);
    const state = createInitialState();
    const user = generateKeyPair();
    fund(state, user.address, 50);
    const tx = signTransaction(user.privateKey, {
      id: "oz-underpay",
      from: user.address,
      to: "0x0000000000000000000000000000000000000000",
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "contractDeploy",
      payload: { bytecode: erc20.bytecode, gasLimit: DEFAULT_TX_GAS_LIMIT }
    });
    await expect(applyTransaction(state, tx, DEFAULT_CONFIG)).rejects.toThrow(/Insufficient PPL for prepaid gas/);
  });
});
