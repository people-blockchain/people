export interface SupplySnapshot {
  liquidBalances: number;
  lockedStake: number;
  circulating: number;
  totalTracked: number;
  issuedRewards: number;
  feePool: number;
  accountCount: number;
  validatorCount: number;
}

export function computeSupply(input: {
  accounts: Array<{ balance: number }>;
  validators: Array<{ stake: number; status: string }>;
  feePool?: number;
  issuedRewards?: number;
}): SupplySnapshot {
  const liquidBalances = input.accounts.reduce((sum, item) => sum + (item.balance || 0), 0);
  const lockedStake = input.validators
    .filter((item) => item.status === "active" || item.status === "joining" || item.status === "unbonding")
    .reduce((sum, item) => sum + (item.stake || 0), 0);
  const feePool = input.feePool ?? 0;
  const issuedRewards = input.issuedRewards ?? 0;
  // Circulating ≈ spendable balances (stake is locked; fee pool not yet paid).
  const circulating = liquidBalances;
  const totalTracked = liquidBalances + lockedStake + feePool;
  return {
    liquidBalances,
    lockedStake,
    circulating,
    totalTracked,
    issuedRewards,
    feePool,
    accountCount: input.accounts.length,
    validatorCount: input.validators.length
  };
}
