import { register } from "node:module";

register("./founder-nft-allowlist-loader.mjs", import.meta.url);

const { POST } = await import("../../src/app/api/founders/nft/signature/route.ts");

const res = await POST(
  new Request("http://localhost/api/founders/nft/signature", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "mint",
      address: process.env.FOUNDER_NFT_ANON_ADDRESS,
      nonce: "nonce-anon",
      chainId: 97401,
      walletSignature: `0x${"ab".repeat(65)}`,
    }),
  }),
);
const body = await res.json();
process.stdout.write(`${JSON.stringify({ status: res.status, error: body.error })}\n`);
