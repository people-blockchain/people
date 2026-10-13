export const GOV_REST_BASE = "https://node.peopleblockchain.network/rest";

export type GovCoin = { denom: string; amount: string };

export type GovProposalMessage = { "@type"?: string } & Record<string, unknown>;

export interface GovProposal {
  id: string;
  messages: GovProposalMessage[];
  status: string;
  final_tally_result: {
    yes_count: string;
    abstain_count: string;
    no_count: string;
    no_with_veto_count: string;
  };
  submit_time: string;
  deposit_end_time: string;
  total_deposit: GovCoin[];
  voting_start_time: string;
  voting_end_time: string;
  metadata?: string;
  title: string;
  summary: string;
  proposer?: string;
  expedited?: boolean;
}

export interface GovTallyResult {
  yes_count: string;
  abstain_count: string;
  no_count: string;
  no_with_veto_count: string;
}

export interface GovVotingParams {
  voting_params: { voting_period: string };
  params: {
    min_deposit: GovCoin[];
    max_deposit_period: string;
    voting_period: string;
    quorum: string;
    threshold: string;
    veto_threshold: string;
    expedited_voting_period?: string;
    expedited_threshold?: string;
    expedited_min_deposit?: GovCoin[];
  } | null;
}

export interface GovVote {
  proposal_id: string;
  voter: string;
  options: { option: string; weight: string }[];
  metadata?: string;
}

export interface AuthAccount {
  "@type"?: string;
  address: string;
  pub_key?: { "@type": string; key: string } | null;
  account_number: string;
  sequence: string;
}

class GovRestNotFoundError extends Error {}

async function getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
  const url = new URL(GOV_REST_BASE + path);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 404) throw new GovRestNotFoundError(`not_found: ${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`gov_rest_${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProposals(): Promise<GovProposal[]> {
  const body = await getJson<{ proposals: GovProposal[] }>("/cosmos/gov/v1/proposals", {
    "pagination.limit": "200",
    "pagination.reverse": "true",
  });
  return body.proposals;
}

export async function fetchProposal(id: string): Promise<GovProposal> {
  const body = await getJson<{ proposal: GovProposal }>(`/cosmos/gov/v1/proposals/${id}`);
  return body.proposal;
}

export async function fetchTally(id: string): Promise<GovTallyResult> {
  const body = await getJson<{ tally: GovTallyResult }>(`/cosmos/gov/v1/proposals/${id}/tally`);
  return body.tally;
}

export async function fetchVote(id: string, voter: string): Promise<GovVote | null> {
  try {
    const body = await getJson<{ vote: GovVote }>(`/cosmos/gov/v1/proposals/${id}/votes/${voter}`);
    return body.vote;
  } catch (err) {
    if (err instanceof GovRestNotFoundError) return null;
    throw err;
  }
}

export async function fetchVotingParams(): Promise<GovVotingParams> {
  return getJson<GovVotingParams>("/cosmos/gov/v1/params/voting");
}

export async function fetchBondedPool(): Promise<{ bondedTokens: bigint }> {
  const body = await getJson<{ pool: { bonded_tokens: string; not_bonded_tokens: string } }>(
    "/cosmos/staking/v1beta1/pool"
  );
  return { bondedTokens: BigInt(body.pool.bonded_tokens) };
}

export async function fetchAccount(address: string): Promise<{ accountNumber: bigint; sequence: bigint } | null> {
  try {
    const body = await getJson<{ account: AuthAccount }>(`/cosmos/auth/v1beta1/accounts/${address}`);
    return { accountNumber: BigInt(body.account.account_number), sequence: BigInt(body.account.sequence) };
  } catch (err) {
    if (err instanceof GovRestNotFoundError) return null;
    throw err;
  }
}

export interface SimulateResult {
  gasUsed: bigint;
}

export async function simulateTx(txBytes: Uint8Array): Promise<SimulateResult> {
  const res = await fetch(`${GOV_REST_BASE}/cosmos/tx/v1beta1/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx_bytes: bytesToBase64(txBytes) }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    gas_info?: { gas_used?: string };
    message?: string;
    code?: number;
  };
  if (!res.ok || typeof body.code === "number" && body.code !== 0) {
    throw new Error(body.message ?? `simulate_failed_${res.status}`);
  }
  return { gasUsed: BigInt(body.gas_info?.gas_used ?? "200000") };
}

export interface BroadcastResult {
  txHash: string;
  code: number;
  rawLog: string;
}

export async function broadcastTx(txBytes: Uint8Array): Promise<BroadcastResult> {
  const res = await fetch(`${GOV_REST_BASE}/cosmos/tx/v1beta1/txs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx_bytes: bytesToBase64(txBytes), mode: "BROADCAST_MODE_SYNC" }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    tx_response?: { txhash?: string; code?: number; raw_log?: string };
    message?: string;
  };
  if (!res.ok) throw new Error(body.message ?? `broadcast_failed_${res.status}`);
  const txResponse = body.tx_response;
  if (!txResponse) throw new Error(body.message ?? "broadcast_failed_empty_response");
  return { txHash: txResponse.txhash ?? "", code: txResponse.code ?? 0, rawLog: txResponse.raw_log ?? "" };
}

/**
 * Polling the signer's account sequence is a reliable proxy for "included in a block": it only
 * advances once the ante handler has run against a committed block. (The REST gateway also
 * exposes `GET /cosmos/tx/v1beta1/txs/{hash}` now, which the explorer uses to show a tx; the
 * vote flow keeps the sequence poll so it waits on exactly the account it signed with.)
 */
export async function pollForSequenceIncrease(
  address: string,
  fromSequence: bigint,
  timeoutMs = 60_000,
  intervalMs = 2_000
): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const account = await fetchAccount(address);
    if (account && account.sequence > fromSequence) return account;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("tx_not_included_in_time");
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
