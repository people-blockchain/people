import assert from "node:assert/strict";
import { test } from "node:test";

test("isCloudWalletEnabled defaults to false", async () => {
  const prev = process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED;
  delete process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED;
  const { isCloudWalletEnabled } = await import("./cloud-wallet.ts");
  assert.equal(isCloudWalletEnabled(), false);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED;
  else process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED = prev;
});

test("withCloudWalletCopy prefers *Cloud keys when enabled", async () => {
  const prev = process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED;
  process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED = "true";
  const { withCloudWalletCopy, isCloudWalletEnabled } = await import("./cloud-wallet.ts");
  assert.equal(isCloudWalletEnabled(), true);
  const input = { embeddedHeading: "seed only", embeddedHeadingCloud: "sign in with email" };
  assert.equal(withCloudWalletCopy(input).embeddedHeading, "sign in with email");
  process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED = "false";
  assert.equal(withCloudWalletCopy(input).embeddedHeading, "seed only");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED;
  else process.env.NEXT_PUBLIC_CLOUD_WALLET_ENABLED = prev;
});
