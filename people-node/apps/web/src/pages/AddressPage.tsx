import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useLive } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import type { LiveTransaction } from "../LiveContext.js";
import { formatTxMemo, getPaymentMemoForAddress } from "../txMemo.js";
import { labelTxType } from "../i18n.js";

export function AddressPage() {
  const { address = "" } = useParams<{ address: string }>();
  const { t } = usePrefs();
  const notify = useNotify();
  const { feed, offline, headHeight, metrics } = useLive();
  const [extraHistory, setExtraHistory] = useState<LiveTransaction[] | null>(null);
  const [loading, setLoading] = useState(false);

  const account = useMemo(() => {
    if (!address) {
      return null;
    }
    const fromFeed = feed?.accounts.find((item) => item.address.toLowerCase() === address.toLowerCase());
    if (fromFeed) {
      return {
        ...fromFeed,
        chainId: metrics?.chainId ?? "",
        headHeight
      };
    }
    return null;
  }, [address, feed, headHeight, metrics?.chainId]);

  const history = useMemo(() => {
    if (extraHistory) {
      return extraHistory;
    }
    if (!address || !feed) {
      return [];
    }
    const normalized = address.toLowerCase();
    return feed.transactions.filter(
      (tx) => tx.from.toLowerCase() === normalized || tx.to.toLowerCase() === normalized
    );
  }, [address, feed, extraHistory]);

  async function reload() {
    if (!address) {
      return;
    }
    setLoading(true);
    try {
      setExtraHistory((await people.getAddressTransactions(address, 50)) as LiveTransaction[]);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.notFound);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta title={`${t.walletAddress}: ${address.slice(0, 12)}...`} description={t.addressDescription} />

      <section className="card page-header">
        <div className="section-head">
          <div>
            <p className="breadcrumb">
              <Link to="/">{t.home}</Link> / <Link to="/explorer">{t.explorer}</Link> / {t.walletAddress}
            </p>
            <h1>{t.addressTitle}</h1>
            <p className="lead mono">{address}</p>
          </div>
          <button onClick={() => void reload()} disabled={loading}>
            {loading ? t.refreshing : t.refresh}
          </button>
        </div>
      </section>

      {account && (
        <section className="card wallet-overview">
          <dl className="detail-grid">
            <div>
              <dt>{t.walletBalance}</dt>
              <dd>{account.balance.toFixed(4)} PPL</dd>
            </div>
            <div>
              <dt>{t.nonce}</dt>
              <dd>{account.nonce}</dd>
            </div>
            <div>
              <dt>{t.outgoingTxs}</dt>
              <dd>{account.outgoingTxs}</dd>
            </div>
            <div>
              <dt>{t.incomingTxs}</dt>
              <dd>{account.incomingTxs}</dd>
            </div>
            <div>
              <dt>{t.head}</dt>
              <dd>{account.headHeight}</dd>
            </div>
          </dl>
        </section>
      )}

      {!account && !offline && <p>{t.noWallets}</p>}

      <section className="card">
        <h2>{t.walletHistory}</h2>
        {history.length === 0 ? (
          <p>{t.noTransactions}</p>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>{t.txId}</th>
                <th>{t.block}</th>
                <th className="hide-mobile">{t.type}</th>
                <th className="hide-mobile">{t.from}</th>
                <th className="hide-mobile">{t.to}</th>
                <th>{t.amount}</th>
                <th className="hide-mobile">{t.memo}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <Link to={`/tx/${tx.id}`} className="table-link" aria-label={`${t.openTxAria} ${tx.id}`}>
                      {tx.id.slice(0, 12)}...
                    </Link>
                  </td>
                  <td>
                    <Link to={`/block/${tx.blockHeight}`} className="table-link">
                      {tx.blockHeight}
                    </Link>
                  </td>
                  <td className="hide-mobile">{labelTxType(t, tx.type)}</td>
                  <td className="mono hide-mobile">{tx.from.slice(0, 10)}...</td>
                  <td className="mono hide-mobile">{tx.to.slice(0, 10)}...</td>
                  <td>{tx.amount}</td>
                  <td className="hide-mobile">
                    {(() => {
                      const paymentMemo = getPaymentMemoForAddress(tx, address);
                      return paymentMemo ? formatTxMemo(paymentMemo) : "—";
                    })()}
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
