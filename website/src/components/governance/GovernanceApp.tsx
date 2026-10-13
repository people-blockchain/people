"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { governanceCopy, type GovernanceCopy } from "@/lib/governance-content";
import { fill } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import {
  fetchAccount,
  fetchBondedPool,
  fetchProposals,
  fetchTally,
  fetchVote,
  fetchVotingParams,
  simulateTx,
  broadcastTx,
  pollForSequenceIncrease,
  type GovProposal,
  type GovTallyResult,
  type GovVotingParams,
} from "@/lib/gov/rest";
import { tallyToPpl, quorumPercent, yesThresholdPercent, decToPercent, type TallyTotals } from "@/lib/gov/math";
import { buildSignedVoteTx, voterAddressFromSigner, VoteOption } from "@/lib/gov/tx";
import { gasLimitWithMargin, feeForGasLimit } from "@/lib/gov/fee";

const PEOPLE_CHAIN_ID = "people_97401-1";
const DEFAULT_SIMULATE_GAS = BigInt(200_000);

const ghostBtn =
  "min-h-9 rounded-lg border border-line px-3 text-xs font-semibold text-ink-2 hover:border-brand hover:text-ink disabled:opacity-40";
const ctaBtn =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50";

type Status = "deposit" | "voting" | "passed" | "rejected" | "failed" | "unspecified";

function statusFromRaw(raw: string): Status {
  if (raw.includes("DEPOSIT")) return "deposit";
  if (raw.includes("VOTING")) return "voting";
  if (raw.includes("PASSED")) return "passed";
  if (raw.includes("REJECTED")) return "rejected";
  if (raw.includes("FAILED")) return "failed";
  return "unspecified";
}

function statusLabel(status: Status, t: GovernanceCopy): string {
  switch (status) {
    case "deposit":
      return t.statusDeposit;
    case "voting":
      return t.statusVoting;
    case "passed":
      return t.statusPassed;
    case "rejected":
      return t.statusRejected;
    case "failed":
      return t.statusFailed;
    default:
      return t.statusUnspecified;
  }
}

function statusTone(status: Status): "brand" | "value" | "warm" | "neutral" {
  switch (status) {
    case "voting":
      return "brand";
    case "passed":
      return "value";
    case "rejected":
    case "failed":
      return "warm";
    default:
      return "neutral";
  }
}

function proposalTitle(p: GovProposal, t: GovernanceCopy): string {
  return p.title?.trim() || t.untitled;
}

function TallyBars({ tally, quorumPct, yesPct, t }: { tally: TallyTotals; quorumPct: number; yesPct: number; t: GovernanceCopy }) {
  const total = tally.yes + tally.no + tally.abstain + tally.noWithVeto;
  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const rows: { label: string; value: number; className: string }[] = [
    { label: t.yesLabel, value: tally.yes, className: "bg-value" },
    { label: t.noLabel, value: tally.no, className: "bg-warm" },
    { label: t.abstainLabel, value: tally.abstain, className: "bg-ink-3" },
    { label: t.vetoLabel, value: tally.noWithVeto, className: "bg-violet" },
  ];
  return (
    <div className="mt-3 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 text-xs">
          <span className="w-20 shrink-0 text-ink-2">{row.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${row.className}`} style={{ width: `${pct(row.value)}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono tabular-nums text-ink-3">{row.value.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-4 pt-1 text-xs text-ink-3">
        <span>
          {t.quorumLabel}: <strong className="text-ink">{quorumPct.toFixed(1)}%</strong>
        </span>
        <span>
          {t.thresholdLabel}: <strong className="text-ink">{yesPct.toFixed(1)}%</strong>
        </span>
      </div>
    </div>
  );
}

export function GovernanceApp() {
  const { lang } = useLanguage();
  const t = governanceCopy[lang];
  const { session } = useWallet();

  const [proposals, setProposals] = useState<GovProposal[]>([]);
  const [bondedTokens, setBondedTokens] = useState<bigint>(BigInt(0));
  const [votingParams, setVotingParams] = useState<GovVotingParams | null>(null);
  const [tallies, setTallies] = useState<Record<string, GovTallyResult>>({});
  const [reachable, setReachable] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<VoteOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const loadList = useCallback(async () => {
    try {
      const [rows, pool, params] = await Promise.all([fetchProposals(), fetchBondedPool(), fetchVotingParams()]);
      setProposals(rows);
      setBondedTokens(pool.bondedTokens);
      setVotingParams(params);
      const tallyEntries = await Promise.all(
        rows.map(async (p: GovProposal) => {
          try {
            const tally = statusFromRaw(p.status) === "voting" ? await fetchTally(p.id) : p.final_tally_result;
            return [p.id, tally] as const;
          } catch {
            return [p.id, p.final_tally_result] as const;
          }
        })
      );
      setTallies(Object.fromEntries(tallyEntries));
      setReachable(true);
    } catch {
      setReachable(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    const id = setInterval(() => void loadList(), 20_000);
    return () => clearInterval(id);
  }, [loadList]);

  const selected = useMemo(() => proposals.find((p) => p.id === selectedId) ?? null, [proposals, selectedId]);

  const voterAddress = useMemo(() => {
    if (!session) return null;
    try {
      return voterAddressFromSigner({ privateKey: session.privateKey, publicKey: session.publicKey });
    } catch {
      return null;
    }
  }, [session]);

  const loadMyVote = useCallback(async () => {
    if (!selectedId || !voterAddress) {
      setMyVote(null);
      return;
    }
    try {
      const vote = await fetchVote(selectedId, voterAddress);
      setMyVote(vote?.options[0]?.option ?? null);
    } catch {
      setMyVote(null);
    }
  }, [selectedId, voterAddress]);

  useEffect(() => {
    void loadMyVote();
  }, [loadMyVote]);

  const closeVoteModal = () => {
    setVoteTarget(null);
    setError("");
  };

  const submitVote = async () => {
    if (!session || !selectedId || voteTarget === null) return;
    setBusy(true);
    setError("");
    try {
      const signer = { privateKey: session.privateKey, publicKey: session.publicKey };
      const voter = voterAddressFromSigner(signer);
      const account = await fetchAccount(voter);
      if (!account) throw new Error("account_not_found");

      const draftTx = buildSignedVoteTx({
        signer,
        proposalId: BigInt(selectedId),
        option: voteTarget,
        sequence: account.sequence,
        accountNumber: account.accountNumber,
        chainId: PEOPLE_CHAIN_ID,
        gasLimit: DEFAULT_SIMULATE_GAS,
        feeAmount: feeForGasLimit(DEFAULT_SIMULATE_GAS),
      });
      const simulated = await simulateTx(draftTx).catch(() => ({ gasUsed: DEFAULT_SIMULATE_GAS }));
      const gasLimit = gasLimitWithMargin(simulated.gasUsed);
      const finalTx = buildSignedVoteTx({
        signer,
        proposalId: BigInt(selectedId),
        option: voteTarget,
        sequence: account.sequence,
        accountNumber: account.accountNumber,
        chainId: PEOPLE_CHAIN_ID,
        gasLimit,
        feeAmount: feeForGasLimit(gasLimit),
      });
      const broadcast = await broadcastTx(finalTx);
      if (broadcast.code !== 0) throw new Error(broadcast.rawLog || "broadcast_rejected");
      setTxHash(broadcast.txHash);
      await pollForSequenceIncrease(voter, account.sequence).catch(() => null);
      closeVoteModal();
      await Promise.all([loadList(), loadMyVote()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.voteError);
    } finally {
      setBusy(false);
    }
  };

  // The gov REST returns the enum name ("VOTE_OPTION_YES"); older nodes return the number.
  const parseVoteOption = (raw: string): VoteOption => {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n as VoteOption;
    const named = (VoteOption as unknown as Record<string, number>)[raw];
    return (typeof named === "number" ? named : -1) as VoteOption;
  };

  const voteOptionLabel = (option: VoteOption): string => {
    switch (option) {
      case VoteOption.VOTE_OPTION_YES:
        return t.yesLabel;
      case VoteOption.VOTE_OPTION_NO:
        return t.noLabel;
      case VoteOption.VOTE_OPTION_ABSTAIN:
        return t.abstainLabel;
      case VoteOption.VOTE_OPTION_NO_WITH_VETO:
        return t.vetoLabel;
      default:
        return "";
    }
  };

  if (selected) {
    const status = statusFromRaw(selected.status);
    const rawTally = tallies[selected.id] ?? selected.final_tally_result;
    const tally = tallyToPpl(rawTally);
    const quorumPct = quorumPercent(tally, bondedTokens);
    const yesPct = yesThresholdPercent(tally);
    const quorumRequirement = votingParams?.params ? decToPercent(votingParams.params.quorum) : null;
    const thresholdRequirement = votingParams?.params ? decToPercent(votingParams.params.threshold) : null;

    return (
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setSelectedId(null)}>
          {t.backToList}
        </button>

        <div className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={statusTone(status)}>{statusLabel(status, t)}</Chip>
            <span className="text-xs text-ink-3">
              {t.proposalIdLabel} #{selected.id}
            </span>
          </div>
          <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink text-balance">{proposalTitle(selected, t)}</h1>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-3">{t.votingEndsLabel}</dt>
              <dd className="font-medium text-ink">{new Date(selected.voting_end_time).toLocaleString(lang)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">{t.submittedLabel}</dt>
              <dd className="font-medium text-ink">{new Date(selected.submit_time).toLocaleString(lang)}</dd>
            </div>
            {selected.proposer ? (
              <div className="sm:col-span-2">
                <dt className="text-ink-3">{t.proposerLabel}</dt>
                <dd className="truncate font-mono text-xs text-ink">{selected.proposer}</dd>
              </div>
            ) : null}
          </dl>

          {selected.summary ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-ink">{t.summaryTitle}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{selected.summary}</p>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl bg-canvas-2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t.tallyTitle}</h2>
            <TallyBars tally={tally} quorumPct={quorumPct} yesPct={yesPct} t={t} />
            {quorumRequirement !== null && thresholdRequirement !== null ? (
              <p className="mt-2 text-xs text-ink-3">
                {t.quorumLabel} ≥ {quorumRequirement.toFixed(1)}% · {t.thresholdLabel} ≥ {thresholdRequirement.toFixed(1)}%
              </p>
            ) : null}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-canvas-2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t.voteSectionTitle}</h2>
            <p className="mt-2 text-xs text-ink-3">{t.votingPowerNote}</p>

            {!session ? (
              <div className="mt-4">
                <p className="text-sm text-ink-2">{t.connectPrompt}</p>
                <div className="mt-3">
                  <ConnectWalletMenu />
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink-2">
                  {t.yourVoteLabel}:{" "}
                  <strong className="text-ink">
                    {myVote ? voteOptionLabel(parseVoteOption(myVote)) || myVote : t.notVotedLabel}
                  </strong>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={ctaBtn} onClick={() => setVoteTarget(VoteOption.VOTE_OPTION_YES)}>
                    {t.voteButtonYes}
                  </button>
                  <button type="button" className={ghostBtn} onClick={() => setVoteTarget(VoteOption.VOTE_OPTION_NO)}>
                    {t.voteButtonNo}
                  </button>
                  <button type="button" className={ghostBtn} onClick={() => setVoteTarget(VoteOption.VOTE_OPTION_ABSTAIN)}>
                    {t.voteButtonAbstain}
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => setVoteTarget(VoteOption.VOTE_OPTION_NO_WITH_VETO)}
                  >
                    {t.voteButtonVeto}
                  </button>
                </div>
              </>
            )}

            {txHash ? (
              <p className="mt-4 text-sm text-value">
                {t.voteSuccess} {t.txLink}:{" "}
                <Link href={`/explorer/tx/${txHash}`} className="underline">
                  {txHash.slice(0, 18)}…
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        {voteTarget !== null ? (
          <WalletDialog title={t.voteConfirmTitle} onClose={closeVoteModal} busy={busy}>
            <p className="text-sm text-ink-2">
              {fill(t.voteConfirmBody, { option: voteOptionLabel(voteTarget), id: selected.id })}
            </p>
            {error ? <p className="mt-2 text-sm text-warm">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={closeVoteModal} disabled={busy}>
                {t.cancel}
              </button>
              <button type="button" className={ctaBtn} onClick={() => void submitVote()} disabled={busy}>
                {busy ? t.voteSending : t.voteConfirm}
              </button>
            </div>
          </WalletDialog>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.lead}</p>
      <Chip tone="value" className="mt-4">
        {t.networkBadge}
      </Chip>
      {!reachable ? <p className="mt-4 text-sm text-warm">{t.unreachable}</p> : null}

      <div className="relative mt-8 overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
        <div className="glow-brand pointer-events-none absolute -right-24 -top-24 h-64 w-64" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{t.listTitle}</h2>
        {proposals.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">{t.listEmpty}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {proposals.map((p) => {
              const status = statusFromRaw(p.status);
              const rawTally = tallies[p.id] ?? p.final_tally_result;
              const tally = tallyToPpl(rawTally);
              const yesPct = yesThresholdPercent(tally);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="block w-full rounded-2xl border border-line bg-canvas-2 p-4 text-left transition-colors hover:border-brand sm:p-5"
                  data-testid="governance-proposal-row"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-ink-3">#{p.id}</span>
                      <span className="font-semibold text-ink">{proposalTitle(p, t)}</span>
                    </div>
                    <Chip tone={statusTone(status)}>{statusLabel(status, t)}</Chip>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-3">
                    <span>
                      {t.votingEndsLabel}: {new Date(p.voting_end_time).toLocaleDateString(lang)}
                    </span>
                    <span>
                      {t.yesLabel}: <strong className="text-ink">{yesPct.toFixed(1)}%</strong>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
