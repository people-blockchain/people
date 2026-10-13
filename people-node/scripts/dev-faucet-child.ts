async function main(): Promise<void> {
  const mode = process.argv[2];

  if (mode === "missing") {
    await import("../packages/core/src/crypto.ts");
    console.log("unexpected-success");
    return;
  }

  if (mode === "sign") {
    const { DEV_FAUCET_PRIVATE_KEY, FAUCET_ADDRESS, signTransaction } = await import(
      "../packages/core/src/crypto.ts"
    );
    const { createInitialState, enqueueTransaction, generateKeyPair } = await import(
      "../packages/core/src/index.ts"
    );
    const state = createInitialState();
    const recipient = generateKeyPair();
    const tx = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: "dev-faucet-check",
      from: FAUCET_ADDRESS,
      to: recipient.address,
      amount: 1,
      fee: 0,
      nonce: 0,
      timestamp: 1,
      type: "transfer"
    });
    enqueueTransaction(state, tx, true);
    if (!state.mempool.some((item) => item.id === tx.id)) {
      process.exit(1);
    }
    console.log("accepted");
    return;
  }

  process.exit(2);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "dev_faucet_check_failed";
  console.error(message);
  process.exit(1);
});
