import { OvnClient, generateKeyPair, keyPairFromPrivateKey, signTransaction } from "@ovn/sdk";

const baseUrl = process.env.NODE_API_URL ?? "http://localhost:4001";
const client = new OvnClient({ baseUrl });

const validatorKey = process.env.VALIDATOR_PRIVATE_KEY
  ? keyPairFromPrivateKey(process.env.VALIDATOR_PRIVATE_KEY)
  : generateKeyPair();

async function waitForNode(maxAttempts = 60, delayMs = 500): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const health = await client.getHealth();
      if (health.ok) {
        console.log(`[light-validator] node ready at ${baseUrl}`);
        return;
      }
    } catch {
      // Node is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Node API not reachable at ${baseUrl}`);
}

async function ensureValidator(): Promise<void> {
  await client.fundFromFaucet(validatorKey.address, 500);
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const account = await client.getAddress(validatorKey.address);
  await client.joinValidator(validatorKey.privateKey, 120, "light", account.nonce);
}

let lastAttestedHeight = 0;

async function heartbeat(): Promise<void> {
  const snapshot = await client.getSnapshot();
  const headHeight = snapshot.head.height;
  const finalized = snapshot.finalizedHeight ?? 0;
  const from = Math.max(finalized + 1, lastAttestedHeight + 1, 1);
  const to = headHeight;
  for (let height = from; height <= to && height <= from + 4; height += 1) {
    const block = await client.getBlock(height);
    const account = await client.getAddress(validatorKey.address);
    const attestation = signTransaction(validatorKey.privateKey, {
            chainId: (await client.getHealth()).chainId,
      id: `${validatorKey.address}-att-${height}-${Date.now()}`,
      from: validatorKey.address,
      to: "network",
      amount: 0,
      fee: 0,
      nonce: account.nonce,
      timestamp: Date.now(),
      type: "attestation",
      payload: { headerHeight: height, blockHash: block.hash, kind: "light" }
    });
    await client.submitTx(attestation);
    lastAttestedHeight = height;
  }
}

async function main(): Promise<void> {
  await waitForNode();
  await ensureValidator();
  setInterval(async () => {
    try {
      await heartbeat();
      const snapshot = await client.getSnapshot();
      console.log(
        `[light-validator] ${validatorKey.address} syncedHeight=${snapshot.head.height} finalized=${snapshot.finalizedHeight} validators=${snapshot.validators.length}`
      );
    } catch (error) {
      console.error("[light-validator] heartbeat failed", error);
    }
  }, 5000);
}

main().catch((error) => {
  console.error("[light-validator] startup failed", error);
  process.exit(1);
});
