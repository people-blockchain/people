/**
 * Read model and write requests for a deployed `SimpleCrowdfund` (see the `crowdfund` template in
 * `contract-templates.ts`). Everything here is pure or takes an injected client so it can be tested
 * without a network; the page sends every transaction through `writeViaActiveSigner`, which runs the
 * shared simulate + estimate preflight first.
 */
import { formatEther, isAddress, parseAbi, type Address } from "viem";
import { parseDecimalUnits } from "@/lib/contract-constructor";

export const CROWDFUND_ABI = parseAbi([
  "function goal() view returns (uint256)",
  "function deadline() view returns (uint256)",
  "function raised() view returns (uint256)",
  "function claimed() view returns (bool)",
  "function owner() view returns (address)",
  "function contributions(address) view returns (uint256)",
  "function contribute() payable",
  "function claim()",
  "function refund()",
]);

export type CampaignAction = "contribute" | "claim" | "refund";

export type CampaignSnapshot = {
  address: Address;
  owner: Address;
  /** Wei. */
  goal: bigint;
  /** Unix seconds. */
  deadline: bigint;
  raised: bigint;
  claimed: boolean;
  /** What `account` has put in (0 without an account). */
  contribution: bigint;
  /** Chain time in unix seconds when the snapshot was read. */
  now: bigint;
};

export type CampaignStatus = "open" | "reached" | "claimed" | "failed";

export type CampaignView = {
  status: CampaignStatus;
  goalReached: boolean;
  ended: boolean;
  /** Integer percent of the goal (can exceed 100). */
  percent: number;
  /** Progress bar width, clamped to 0..100. */
  barPercent: number;
  secondsLeft: number;
  isCreator: boolean;
  canContribute: boolean;
  /** Creator only, once the goal is reached (the contract allows it before the deadline too). */
  canClaim: boolean;
  /** Deadline passed, goal missed and this account has something to take back. */
  canRefund: boolean;
};

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

export function deriveCampaign(snapshot: CampaignSnapshot, account?: string | null): CampaignView {
  const { goal, raised, deadline, now, claimed } = snapshot;
  const goalReached = raised >= goal;
  const ended = now >= deadline;
  const isCreator = !!account && account.toLowerCase() === snapshot.owner.toLowerCase();
  const status: CampaignStatus = claimed ? "claimed" : goalReached ? "reached" : ended ? "failed" : "open";
  const percent = goal > ZERO ? Number((raised * HUNDRED) / goal) : 0;
  return {
    status,
    goalReached,
    ended,
    percent,
    barPercent: Math.max(0, Math.min(100, percent)),
    secondsLeft: ended ? 0 : Number(deadline - now),
    isCreator,
    canContribute: !ended && !claimed,
    canClaim: isCreator && goalReached && !claimed,
    canRefund: ended && !goalReached && snapshot.contribution > ZERO,
  };
}

export function countdownParts(totalSeconds: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(totalSeconds));
  return { d: Math.floor(t / 86_400), h: Math.floor((t % 86_400) / 3_600), m: Math.floor((t % 3_600) / 60), s: t % 60 };
}

export type CountdownUnits = { dayShort: string; hourShort: string; minShort: string; secShort: string };

/** "2d 3h 4m 5s"; leading zero units are dropped ("4m 5s"), the last unit is always shown. */
export function formatCountdown(totalSeconds: number, units: CountdownUnits): string {
  const { d, h, m, s } = countdownParts(totalSeconds);
  const parts: Array<[number, string]> = [
    [d, units.dayShort],
    [h, units.hourShort],
    [m, units.minShort],
    [s, units.secShort],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return parts
    .slice(first === -1 ? 3 : first)
    .map(([n, label]) => `${n}${label}`)
    .join(" ");
}

/** Wei -> "1.5" (no trailing zeros), for display. */
export function formatPpl(wei: bigint): string {
  return formatEther(wei);
}

/** User text ("1.5", "1,5") -> wei; null unless it is a positive amount. */
export function parseContribution(text: string): bigint | null {
  return parseDecimalUnits(text, 18);
}

export type CampaignWriteRequest = {
  address: Address;
  abi: typeof CROWDFUND_ABI;
  functionName: CampaignAction;
  args: readonly [];
  value?: bigint;
};

/** The request handed to `writeViaActiveSigner` (which preflights it before anything is signed). */
export function buildCampaignRequest(action: CampaignAction, address: Address, amountWei?: bigint): CampaignWriteRequest {
  if (action === "contribute") {
    if (!amountWei || amountWei <= ZERO) throw new RangeError("contribution must be positive");
    return { address, abi: CROWDFUND_ABI, functionName: action, args: [], value: amountWei };
  }
  return { address, abi: CROWDFUND_ABI, functionName: action, args: [] };
}

export type CampaignReadClient = {
  getCode(args: { address: Address }): Promise<string | undefined>;
  getBlock(): Promise<{ timestamp: bigint }>;
  readContract(args: {
    address: Address;
    abi: typeof CROWDFUND_ABI;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
};

export class CampaignReadError extends Error {
  readonly reason: "invalid_address" | "not_campaign" | "load_failed";
  constructor(reason: "invalid_address" | "not_campaign" | "load_failed", cause?: unknown) {
    super(reason, cause === undefined ? undefined : { cause });
    this.name = "CampaignReadError";
    this.reason = reason;
  }
}

const NOT_A_CONTRACT_CALL = new Set([
  "ContractFunctionZeroDataError",
  "ContractFunctionRevertedError",
  "AbiDecodingZeroDataError",
]);

/** True when the call itself failed (no such function / empty return), as opposed to a network error. */
function callRejected(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (NOT_A_CONTRACT_CALL.has((current as { name?: string }).name ?? "")) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function readCampaign(
  client: CampaignReadClient,
  address: string,
  account?: string | null,
): Promise<CampaignSnapshot> {
  if (!isAddress(address)) throw new CampaignReadError("invalid_address");
  const addr = address as Address;
  try {
    const code = await client.getCode({ address: addr });
    if (!code || code === "0x") throw new CampaignReadError("not_campaign");
    const read = (functionName: string, args?: readonly unknown[]) =>
      client.readContract({ address: addr, abi: CROWDFUND_ABI, functionName, args });
    const [goal, deadline, raised, claimed, owner, contribution, block] = await Promise.all([
      read("goal"),
      read("deadline"),
      read("raised"),
      read("claimed"),
      read("owner"),
      account && isAddress(account) ? read("contributions", [account]) : Promise.resolve(ZERO),
      client.getBlock(),
    ]);
    return {
      address: addr,
      owner: owner as Address,
      goal: goal as bigint,
      deadline: deadline as bigint,
      raised: raised as bigint,
      claimed: claimed as boolean,
      contribution: contribution as bigint,
      now: block.timestamp,
    };
  } catch (error) {
    if (error instanceof CampaignReadError) throw error;
    throw new CampaignReadError(callRejected(error) ? "not_campaign" : "load_failed", error);
  }
}
