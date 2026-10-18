import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useWallet } from "../WalletContext.js";
import { useLive } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import { useDeviceVault } from "../DeviceVaultContext.js";
import { labelProposalStatus } from "../i18n.js";

export function GovernancePage() {
  const { t } = usePrefs();
  const notify = useNotify();
  const { session } = useWallet();
  const { getUnlockedKeyByAddress } = useDeviceVault();
  const { feed } = useLive();
  const [minStake, setMinStake] = useState(100);
  const [issuance, setIssuance] = useState(50);
  const privateKey =
    session?.privateKey ??
    (session?.address ? getUnlockedKeyByAddress(session.address) : undefined);
  const address = session?.address;
  const proposals = feed?.proposals ?? [];

  async function resolveNonce(): Promise<number> {
    if (!address) {
      return 0;
    }
    const account = await people.getAddress(address);
    return account.nonce;
  }

  async function createProposal(event: FormEvent) {
    event.preventDefault();
    if (!privateKey) {
      notify.error(t.walletImportFailed);
      return;
    }
    try {
      const nonce = await resolveNonce();
      const result = await people.submitProposal(privateKey, nonce, {
        minStake,
        epochBaseIssuance: issuance
      });
      if (!result.accepted) {
        throw new Error(result.error ?? "proposal_failed");
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "proposal_failed");
    }
  }

  async function vote(proposalId: string, support: boolean) {
    if (!privateKey) {
      notify.error(t.walletImportFailed);
      return;
    }
    try {
      const nonce = await resolveNonce();
      const result = await people.vote(privateKey, nonce, proposalId, support);
      if (!result.accepted) {
        throw new Error(result.error ?? "vote_failed");
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "vote_failed");
    }
  }

  return (
    <>
      <PageMeta title={t.governanceTitle} description={t.governanceDescription} />
      <section className="card page-header">
        <h1>{t.governanceTitle}</h1>
        <p className="lead">{t.governanceDescription}</p>
      </section>
      {!session ? (
        <section className="card">
          <p>{t.walletLoginHint}</p>
          <Link to="/wallet" className="cta button-link">
            {t.wallet}
          </Link>
        </section>
      ) : (
        <section className="card">
          <h2>{t.createProposal}</h2>
          <form className="form" onSubmit={createProposal}>
            <label>
              minStake
              <input type="number" value={minStake} onChange={(e) => setMinStake(Number(e.target.value))} />
            </label>
            <label>
              epochBaseIssuance
              <input type="number" value={issuance} onChange={(e) => setIssuance(Number(e.target.value))} />
            </label>
            <button type="submit">{t.createProposal}</button>
          </form>
        </section>
      )}
      <section className="card">
        <h2>{t.governance}</h2>
        {proposals.length === 0 ? (
          <p>{t.noResults}</p>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>For</th>
                <th>Against</th>
                <th scope="col">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td className="mono">{proposal.id.slice(0, 16)}...</td>
                  <td>{labelProposalStatus(t, proposal.status)}</td>
                  <td>{proposal.votesFor.toFixed(2)}</td>
                  <td>{proposal.votesAgainst.toFixed(2)}</td>
                  <td>
                    {proposal.status === "open" && session && (
                      <div className="link-row">
                        <button className="ghost" onClick={() => void vote(proposal.id, true)}>
                          {t.voteFor}
                        </button>
                        <button className="ghost" onClick={() => void vote(proposal.id, false)}>
                          {t.voteAgainst}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
