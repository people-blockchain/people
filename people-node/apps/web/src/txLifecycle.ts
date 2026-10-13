export type TxLifecycleStage = "mempool" | "block" | "attestations" | "finalized";

export function resolveTxLifecycle(tx: {
  blockHeight?: number;
  validatorConfirmations?: number;
  finalized?: boolean;
}): { stage: TxLifecycleStage; steps: TxLifecycleStage[] } {
  const steps: TxLifecycleStage[] = ["mempool", "block", "attestations", "finalized"];
  if (!tx.blockHeight || tx.blockHeight <= 0) {
    return { stage: "mempool", steps };
  }
  if (tx.finalized) {
    return { stage: "finalized", steps };
  }
  if ((tx.validatorConfirmations ?? 0) > 0) {
    return { stage: "attestations", steps };
  }
  return { stage: "block", steps };
}

export function stageReached(current: TxLifecycleStage, candidate: TxLifecycleStage): boolean {
  const order: TxLifecycleStage[] = ["mempool", "block", "attestations", "finalized"];
  return order.indexOf(candidate) <= order.indexOf(current);
}
