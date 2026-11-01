import { resolveSaleChain, type SaleChainEnv } from "@/lib/sale/saleChain";
import { buildV2OwnershipMessage, saleDomain } from "@/lib/sale/v2/ownership";
import { validV2Address } from "@/lib/sale/v2/logic";

export type SaleVerifyVersion = "v1" | "v2";

export type VerifyTarget = {
  version: SaleVerifyVersion;
  hub: string | null;
  chainId: number;
  signerModeEnv: "SALE_VERIFIER_MODE" | "SALE_V2_VERIFIER_MODE";
  signerLocalKeyEnv: "SALE_VERIFIER_LOCAL_KEY" | "SALE_V2_VERIFIER_LOCAL_KEY";
  signerKmsEnvName: "SALE_VERIFIER_KMS_KEY_ID" | "SALE_V2_VERIFIER_KMS_KEY_ID";
};

/** Missing or unknown versions stay on the v1 sale. Only the exact token `"v2"` selects v2. */
export function parseSaleVerifyVersion(raw: unknown): SaleVerifyVersion {
  return raw === "v2" ? "v2" : "v1";
}

/**
 * Hub, chain and signer env names for one sale generation.
 * v2 reads only `NEXT_PUBLIC_PPL_V2_*` and `SALE_V2_VERIFIER_*`.
 * v1 reads only the original sale hub and `SALE_VERIFIER_*`.
 */
export function resolveVerifyTarget(version: SaleVerifyVersion, env: SaleChainEnv): VerifyTarget {
  if (version === "v2") {
    const chainId = Number.parseInt((env.NEXT_PUBLIC_PPL_V2_CHAIN_ID ?? "").trim(), 10);
    const chainOk = Number.isInteger(chainId) && chainId > 0;
    return {
      version: "v2",
      hub: chainOk ? validV2Address(env.NEXT_PUBLIC_PPL_V2_HUB_ADDRESS) : null,
      chainId: chainOk ? chainId : 0,
      signerModeEnv: "SALE_V2_VERIFIER_MODE",
      signerLocalKeyEnv: "SALE_V2_VERIFIER_LOCAL_KEY",
      signerKmsEnvName: "SALE_V2_VERIFIER_KMS_KEY_ID",
    };
  }
  const chain = resolveSaleChain(env);
  return {
    version: "v1",
    hub: chain.hubAddress,
    chainId: chain.id,
    signerModeEnv: "SALE_VERIFIER_MODE",
    signerLocalKeyEnv: "SALE_VERIFIER_LOCAL_KEY",
    signerKmsEnvName: "SALE_VERIFIER_KMS_KEY_ID",
  };
}

/** Ownership message for `target`. v2 strips a trailing slash; v1 keeps its previous domain shape. */
export function saleOwnershipMessage(
  target: VerifyTarget,
  input: {
    domain: string;
    account: string;
    nonceCode: string;
    issuedAt: string;
    expiresAt: string;
  },
): string {
  if (!target.hub || target.chainId <= 0) throw new Error("sale_not_configured");
  const domain = target.version === "v2" ? saleDomain(input.domain) : input.domain.replace(/^https?:\/\//, "");
  return buildV2OwnershipMessage({
    domain,
    account: input.account,
    chainId: target.chainId,
    hub: target.hub,
    nonceCode: input.nonceCode,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

/** Env the route must read with literal names so Next can inline the public values. */
export function readVerifyTargetEnv(): SaleChainEnv {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SALE_CHAIN: process.env.NEXT_PUBLIC_SALE_CHAIN,
    NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    NEXT_PUBLIC_SALE_HUB_ADDRESS: process.env.NEXT_PUBLIC_SALE_HUB_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS,
    NEXT_PUBLIC_BASE_TEST_HUB_ADDRESS: process.env.NEXT_PUBLIC_BASE_TEST_HUB_ADDRESS,
    NEXT_PUBLIC_BASE_TEST_USDC_ADDRESS: process.env.NEXT_PUBLIC_BASE_TEST_USDC_ADDRESS,
    NEXT_PUBLIC_BASE_TEST_USDT_ADDRESS: process.env.NEXT_PUBLIC_BASE_TEST_USDT_ADDRESS,
    NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: process.env.NEXT_PUBLIC_PPL_V2_HUB_ADDRESS,
    NEXT_PUBLIC_PPL_V2_CHAIN_ID: process.env.NEXT_PUBLIC_PPL_V2_CHAIN_ID,
  };
}
