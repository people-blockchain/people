/**
 * Growth qualification.
 * Epoch length 201600, L1/L2 thresholds, maturation of one completed epoch.
 * Score weights and the C/N event catalogs below are implementation decisions
 * recorded in docs/PROTOCOL-DECISIONS.md, subject to later audit. They are not
 * the original isqrt formula. This module does not settle, claim, or pay.
 */
export const SCORE_C_WEIGHT = 40;
export const SCORE_N_WEIGHT = 14;
export const SCORE_CAP = 1000;

export const GROWTH_EPOCH_LENGTH = 201600;
export const L1_MIN_C = 4;
export const L1_MIN_N = 4;
export const L1_MIN_SCORE = 180;
export const L2_MIN_C = 5;
export const L2_MIN_N = 6;
export const L2_MIN_AGE = 4;
export const L2_MIN_SCORE = 280;
export const REFERRAL_MATURATION_EPOCHS = 1;

/**
 * M13-2 (owner decision): Growth L1/L2 rewards are payable only for
 * identity-verified participants — Telegram or Human Passport, the same two
 * methods the website uses.
 *
 * TODO(M13-2): no transaction writes `participant.identityVerified` yet, so on
 * this chain no participant is verified and L1/L2 payouts are effectively off.
 * That is the approved interim state: a network of throwaway accounts could
 * otherwise take the whole epoch budget for dust (PoC: `audit/m13-economy.test.mjs`,
 * test 2). Turning payouts on requires the on-chain verification path first.
 */
export const GROWTH_IDENTITY_METHODS = ["telegram", "human_passport"] as const;

export type GrowthIdentityMethod = (typeof GROWTH_IDENTITY_METHODS)[number];

export const ELIGIBILITY_REASONS = [
  "NOT_PARTICIPANT",
  "NO_REFERRAL",
  "IDENTITY_NOT_VERIFIED",
  "REFERRAL_NOT_MATURED",
  "INSUFFICIENT_C",
  "INSUFFICIENT_N",
  "INSUFFICIENT_AGE",
  "INSUFFICIENT_SCORE",
  "QUALIFIED"
] as const;

export type EligibilityReason = (typeof ELIGIBILITY_REASONS)[number];

export interface EligibilityResult {
  reason: EligibilityReason;
  qualified: boolean;
}

export interface QualificationParticipant {
  address: string;
  parent?: string;
  linkedAtHeight?: number;
  registeredAtHeight?: number;
  /** See `GROWTH_IDENTITY_METHODS`. Absent means not verified. */
  identityVerified?: { method: string; verifiedAtHeight: number };
}

/** Mutable counters. Production block transitions do not write these. */
export interface GrowthQualificationState {
  participants: Record<string, QualificationParticipant>;
  contributionEpochs: Record<string, number[]>;
  networkActivityEpochs: Record<string, number[]>;
  stateRevision?: number;
}

function requireBlockHeight(height: number): number {
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error("Invalid block height");
  }
  return height;
}

function requireEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error("Invalid growth epoch");
  }
  const end = epoch * GROWTH_EPOCH_LENGTH;
  if (!Number.isSafeInteger(end)) {
    throw new Error("Invalid growth epoch");
  }
  return epoch;
}

/** Height 0 is outside a Growth Epoch. For h >= 1, epoch = floor((h - 1) / 201600) + 1. */
export function growthEpochOfHeight(height: number): number {
  const h = requireBlockHeight(height);
  if (h === 0) {
    return 0;
  }
  return Math.floor((h - 1) / GROWTH_EPOCH_LENGTH) + 1;
}

/** Last height of epoch E, inclusive. */
export function growthEpochEndHeight(epoch: number): number {
  return requireEpoch(epoch) * GROWTH_EPOCH_LENGTH;
}

/** Epochs 1..N whose end height is <= snapshotHeight. */
export function lastFullyCompletedEpoch(snapshotHeight: number): number {
  return Math.floor(requireBlockHeight(snapshotHeight) / GROWTH_EPOCH_LENGTH);
}

/**
 * End height of the first epoch boundary strictly after `height`.
 * An edge included on an epoch's last block waits for the next epoch end.
 */
export function nextEpochEndStrictlyAfter(height: number): number {
  const h = requireBlockHeight(height);
  if (h < 1) {
    throw new Error("Invalid block height");
  }
  const end = (Math.floor(h / GROWTH_EPOCH_LENGTH) + REFERRAL_MATURATION_EPOCHS) * GROWTH_EPOCH_LENGTH;
  if (!Number.isSafeInteger(end)) {
    throw new Error("Invalid block height");
  }
  return end;
}

export function referralMaturedAt(linkedAtHeight: number, snapshotHeight: number): boolean {
  return requireBlockHeight(snapshotHeight) >= nextEpochEndStrictlyAfter(linkedAtHeight);
}

/**
 * Fully completed Growth Epochs since registration, including the registration
 * epoch once its last block is at or below the snapshot. Not wall clock.
 */
export function completedEpochsSinceRegistration(registeredAtHeight: number, snapshotHeight: number): number {
  const registrationEpoch = growthEpochOfHeight(registeredAtHeight);
  if (registrationEpoch < 1) {
    throw new Error("Invalid block height");
  }
  const last = lastFullyCompletedEpoch(snapshotHeight);
  if (last < registrationEpoch) {
    return 0;
  }
  const age = last - registrationEpoch + 1;
  if (!Number.isSafeInteger(age)) {
    throw new Error("Invalid block height");
  }
  return age;
}

function countEpochsAtMost(epochs: readonly number[] | undefined, snapshotEpoch: number): number {
  const limit = requireEpoch(snapshotEpoch);
  if (!epochs || epochs.length === 0) {
    return 0;
  }
  let count = 0;
  for (const epoch of epochs) {
    if (!Number.isSafeInteger(epoch)) {
      throw new Error("Invalid growth epoch");
    }
    if (epoch <= limit) {
      count += 1;
    }
  }
  return count;
}

export function contributionEpochCount(
  state: GrowthQualificationState,
  address: string,
  snapshotEpoch: number
): number {
  return countEpochsAtMost(state.contributionEpochs[address], snapshotEpoch);
}

export function networkActivityEpochCount(
  state: GrowthQualificationState,
  address: string,
  snapshotEpoch: number
): number {
  return countEpochsAtMost(state.networkActivityEpochs[address], snapshotEpoch);
}

/**
 * Integer score. S stays 0 and is not added.
 * Score = min(1000, 40*C + 14*N). No float and no isqrt.
 * The previous `70×isqrt(C)+20×isqrt(N)+100×S` formula is superseded.
 */
export function growthScore(contributionEpochs: number, networkActivityEpochs: number): number {
  if (!Number.isSafeInteger(contributionEpochs) || contributionEpochs < 0) {
    throw new Error("Invalid contribution count");
  }
  if (!Number.isSafeInteger(networkActivityEpochs) || networkActivityEpochs < 0) {
    throw new Error("Invalid network activity count");
  }
  const raw =
    BigInt(SCORE_C_WEIGHT) * BigInt(contributionEpochs) +
    BigInt(SCORE_N_WEIGHT) * BigInt(networkActivityEpochs);
  const capped = raw > BigInt(SCORE_CAP) ? BigInt(SCORE_CAP) : raw;
  return Number(capped);
}

function insertEpoch(existing: readonly number[] | undefined, epoch: number): { epochs: number[]; added: boolean } {
  const value = requireEpoch(epoch);
  const epochs = existing ? [...existing] : [];
  let index = 0;
  while (index < epochs.length && epochs[index]! < value) {
    index += 1;
  }
  if (epochs[index] === value) {
    return { epochs, added: false };
  }
  epochs.splice(index, 0, value);
  return { epochs, added: true };
}

function markEpoch(
  state: GrowthQualificationState,
  bucket: "contributionEpochs" | "networkActivityEpochs",
  address: string,
  epoch: number
): void {
  if (!state.participants[address]) {
    throw new Error("Not a participant");
  }
  const { epochs, added } = insertEpoch(state[bucket][address], epoch);
  if (!added) {
    state[bucket][address] = epochs;
    return;
  }
  state[bucket][address] = epochs;
  state.stateRevision = (state.stateRevision ?? 0) + 1;
}

/** One qualifying contribution epoch. A repeat of the same epoch does not add another. */
export function markQualifyingContribution(state: GrowthQualificationState, address: string, epoch: number): void {
  markEpoch(state, "contributionEpochs", address, epoch);
}

/** One qualifying network-activity epoch. A repeat of the same epoch does not add another. */
export function markNetworkActivity(state: GrowthQualificationState, address: string, epoch: number): void {
  markEpoch(state, "networkActivityEpochs", address, epoch);
}

function result(reason: EligibilityReason): EligibilityResult {
  return { reason, qualified: reason === "QUALIFIED" };
}

/**
 * M13-2: an address counts as a verified human only with a recorded proof whose
 * method is one of `GROWTH_IDENTITY_METHODS`. Fails closed: an absent, malformed
 * or unknown-method record is not verified.
 */
export function isGrowthIdentityVerified(
  state: GrowthQualificationState,
  address: string
): boolean {
  const proof = state.participants[address]?.identityVerified;
  if (!proof || typeof proof.method !== "string") {
    return false;
  }
  if (!Number.isSafeInteger(proof.verifiedAtHeight) || proof.verifiedAtHeight < 1) {
    return false;
  }
  return (GROWTH_IDENTITY_METHODS as readonly string[]).includes(proof.method);
}

function gate(
  state: GrowthQualificationState,
  address: string,
  snapshotEpoch: number,
  level: "L1" | "L2"
): EligibilityResult {
  const snapshotHeight = growthEpochEndHeight(snapshotEpoch);
  const participant = state.participants[address];
  if (!participant) {
    return result("NOT_PARTICIPANT");
  }
  const parent = participant.parent;
  if (!parent || !state.participants[parent]) {
    return result("NO_REFERRAL");
  }
  // M13-2: an unverified invitee is never payable. The referrer's own
  // verification is checked where the edge is formed (`collectTuples`).
  if (!isGrowthIdentityVerified(state, address)) {
    return result("IDENTITY_NOT_VERIFIED");
  }
  if (
    participant.linkedAtHeight === undefined ||
    !referralMaturedAt(participant.linkedAtHeight, snapshotHeight)
  ) {
    return result("REFERRAL_NOT_MATURED");
  }
  const minC = level === "L1" ? L1_MIN_C : L2_MIN_C;
  const minN = level === "L1" ? L1_MIN_N : L2_MIN_N;
  if (contributionEpochCount(state, address, snapshotEpoch) < minC) {
    return result("INSUFFICIENT_C");
  }
  if (networkActivityEpochCount(state, address, snapshotEpoch) < minN) {
    return result("INSUFFICIENT_N");
  }
  if (level === "L2") {
    if (participant.registeredAtHeight === undefined) {
      return result("INSUFFICIENT_AGE");
    }
    const age = completedEpochsSinceRegistration(participant.registeredAtHeight, snapshotHeight);
    if (age < L2_MIN_AGE) {
      return result("INSUFFICIENT_AGE");
    }
  }
  const minScore = level === "L1" ? L1_MIN_SCORE : L2_MIN_SCORE;
  const score = growthScore(
    contributionEpochCount(state, address, snapshotEpoch),
    networkActivityEpochCount(state, address, snapshotEpoch)
  );
  if (score < minScore) {
    return result("INSUFFICIENT_SCORE");
  }
  return result("QUALIFIED");
}

export function isL1Eligible(
  state: GrowthQualificationState,
  address: string,
  snapshotEpoch: number
): EligibilityResult {
  return gate(state, address, snapshotEpoch, "L1");
}

export function isL2Eligible(
  state: GrowthQualificationState,
  address: string,
  snapshotEpoch: number
): EligibilityResult {
  return gate(state, address, snapshotEpoch, "L2");
}
