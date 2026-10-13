/**
 * Catalog of the 4 "sample contract templates" shown at /explorer/contracts: a known,
 * fixed constructor shape per template (unlike the open-ended ContractWizard templates),
 * compiled from contracts/src/samples/*.sol. ABI/bytecode/source come from a committed
 * JSON artifact generated from `forge build` output (see
 * scripts/generate-sample-contract-artifacts.mjs) because forge isn't available on the
 * website's own build runner.
 */
import artifacts from "./generated/sample-contracts-artifacts.json" with { type: "json" };
import deployments from "@/data/evm-deployments-97401-samples.json" with { type: "json" };
import testStables from "@/data/evm-test-stables-97401.json" with { type: "json" };
import { zeroAddress, type Address, type Hex } from "viem";

export type SampleFieldKind = "address" | "uint256" | "string";

export type SampleField = {
  /** Solidity constructor parameter name, used only for the UI label lookup. */
  name: string;
  kind: SampleFieldKind;
  /** Key into samplesCopy[lang].fields. */
  labelKey: string;
  /** Unit the human enters the value in; encodeSampleArgs converts to the on-chain uint256. */
  scale?: "tokens" | "days";
  /** Value to prefill the field with when the deploy form opens. */
  prefill?: "now" | "wallet" | "asset";
};

export type SampleTemplateId = "escrow" | "vesting" | "crowdfund" | "erc20";

export const SAMPLE_TEMPLATE_IDS: SampleTemplateId[] = ["escrow", "vesting", "crowdfund", "erc20"];

const FIELDS: Record<SampleTemplateId, SampleField[]> = {
  escrow: [
    { name: "seller_", kind: "address", labelKey: "seller", prefill: "wallet" },
    { name: "arbiter_", kind: "address", labelKey: "arbiter", prefill: "wallet" },
    { name: "token_", kind: "address", labelKey: "token", prefill: "asset" },
    { name: "amount_", kind: "uint256", labelKey: "amount", scale: "tokens" },
  ],
  vesting: [
    { name: "beneficiary_", kind: "address", labelKey: "beneficiary", prefill: "wallet" },
    { name: "start_", kind: "uint256", labelKey: "start", prefill: "now" },
    { name: "duration_", kind: "uint256", labelKey: "duration", scale: "days" },
  ],
  crowdfund: [
    { name: "goal_", kind: "uint256", labelKey: "goal", scale: "tokens" },
    { name: "durationSeconds_", kind: "uint256", labelKey: "durationSeconds" },
    { name: "token_", kind: "address", labelKey: "token", prefill: "asset" },
  ],
  erc20: [
    { name: "name_", kind: "string", labelKey: "name" },
    { name: "symbol_", kind: "string", labelKey: "symbol" },
    { name: "supply_", kind: "uint256", labelKey: "supply", scale: "tokens" },
  ],
};

/** Whether the template's constructor is `payable` (a native PPL deposit may be sent along). */
const PAYABLE: Record<SampleTemplateId, boolean> = {
  escrow: true,
  vesting: true,
  crowdfund: false,
  erc20: false,
};

/** Templates whose deploy form offers a "Pay in: PPL / tUSDC / tUSDT" selector. */
const SUPPORTS_PAY_ASSET: Record<SampleTemplateId, boolean> = {
  escrow: true,
  vesting: false,
  crowdfund: true,
  erc20: false,
};

export type PayAssetId = "PPL" | "tUSDC" | "tUSDT";

export type PayAsset = {
  id: PayAssetId;
  symbol: string;
  /** address(0) for native PPL. */
  address: Address;
  decimals: number;
};

type TestStablesData = {
  tokens: Record<"tUSDC" | "tUSDT", { address: string; symbol: string; decimals: number }>;
};

const typedTestStables = testStables as TestStablesData;

/** PPL plus the testnet mock stablecoins, for the Escrow/Crowdfund "Pay in" selector. */
export const PAY_ASSETS: PayAsset[] = [
  { id: "PPL", symbol: "PPL", address: zeroAddress, decimals: 18 },
  {
    id: "tUSDC",
    symbol: typedTestStables.tokens.tUSDC.symbol,
    address: (typedTestStables.tokens.tUSDC.address || zeroAddress) as Address,
    decimals: typedTestStables.tokens.tUSDC.decimals,
  },
  {
    id: "tUSDT",
    symbol: typedTestStables.tokens.tUSDT.symbol,
    address: (typedTestStables.tokens.tUSDT.address || zeroAddress) as Address,
    decimals: typedTestStables.tokens.tUSDT.decimals,
  },
];

export type SampleTemplate = {
  id: SampleTemplateId;
  fileName: string;
  source: string;
  abi: unknown[];
  bytecode: Hex;
  payable: boolean;
  supportsPayAsset: boolean;
  fields: SampleField[];
  /** Empty string when not deployed yet. */
  testnetAddress: string;
};

type Artifacts = {
  templates: Record<string, { fileName: string; source: string; abi: unknown[]; bytecode: string }>;
};

type SamplesDeployments = { contracts: Record<string, string> };

const typedArtifacts = artifacts as Artifacts;
const typedDeployments = deployments as SamplesDeployments;

export function sampleTemplate(id: SampleTemplateId): SampleTemplate {
  const artifact = typedArtifacts.templates[id];
  if (!artifact) throw new Error(`unknown sample template: ${id}`);
  return {
    id,
    fileName: artifact.fileName,
    source: artifact.source,
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    payable: PAYABLE[id],
    supportsPayAsset: SUPPORTS_PAY_ASSET[id],
    fields: FIELDS[id],
    testnetAddress: typedDeployments.contracts[id] ?? "",
  };
}

/** ABI for the testnet mock stablecoin faucet (`mint()`), used by the "Get test stablecoins" button. */
export function testStablecoinAbi(): unknown[] {
  const artifact = typedArtifacts.templates.stablecoin;
  if (!artifact) throw new Error("missing stablecoin artifact");
  return artifact.abi;
}

export function sampleTemplates(): SampleTemplate[] {
  return SAMPLE_TEMPLATE_IDS.map(sampleTemplate);
}
