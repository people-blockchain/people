/** Epoch boundary every 10 blocks × ~3s block time. */
export const EPOCH_SECONDS = 30;
export const EPOCHS_PER_YEAR = (365.25 * 24 * 3600) / EPOCH_SECONDS;

export function networkSharePercent(stake: number, totalActiveStake: number): number {
  if (totalActiveStake <= 0 || stake <= 0) {
    return 0;
  }
  return (stake / totalActiveStake) * 100;
}

/** Projected annualized yield from one epoch reward sample. */
export function forecastAprPercent(epochReward: number, stake: number): number {
  if (stake <= 0 || epochReward <= 0) {
    return 0;
  }
  return (epochReward / stake) * EPOCHS_PER_YEAR * 100;
}

/** Realized annualized yield from observed epoch rewards. */
export function realizedAprPercent(
  lifetimeReward: number,
  stake: number,
  epochsObserved: number
): number {
  if (stake <= 0 || lifetimeReward <= 0 || epochsObserved <= 0) {
    return 0;
  }
  const perEpoch = lifetimeReward / epochsObserved;
  return (perEpoch / stake) * EPOCHS_PER_YEAR * 100;
}

export function totalActiveStake(
  validators: Array<{ status: string; stake: number }>
): number {
  return validators
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + item.stake, 0);
}
