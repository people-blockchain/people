import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Block, Transaction } from "@people/protocol";
import { addressPath } from "../address.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useLive } from "../LiveContext.js";
import { people } from "../peopleClient.js";
import { formatPaymentMemos, formatTxMemo, getBatchRecipients, getTxMemo } from "../txMemo.js";
import { labelTxType } from "../i18n.js";
import { resolveTxLifecycle, stageReached, type TxLifecycleStage } from "../txLifecycle.js";

interface ExplorerTransaction extends Transaction {
  blockHeight: number;
  blockHash: string;
  validatorConfirmations?: number;
  activeValidators?: number;
  finalized?: boolean;
}

export function BlockPage() {
  const { height } = useParams<{ height: string }>();
  const { t, language } = usePrefs();
  const notify = useNotify();
  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!height) {
      return;
    }
    setLoading(true);
    people.getBlock(Number(height))
      .then(setBlock)
      .catch((err) => notify.error(err instanceof Error ? err.message : t.notFound))
      .finally(() => setLoading(false));
  }, [height, t.notFound, notify]);

  const title = block ? `${t.block} #${block.header.height}` : t.blockDetails;

  return (
    <>
      <PageMeta title={title} />

      <section className="card">
        <p className="breadcrumb">
          <Link to="/">{t.home}</Link> / <Link to="/explorer">{t.explorer}</Link> / {t.blockDetails}
        </p>
        <h1>{t.blockDetails}</h1>

        {loading && <p>{t.loading}</p>}

        {block && (
          <>
            <dl className="detail-grid">
              <div>
                <dt>{t.height}</dt>
                <dd>{block.header.height}</dd>
              </div>
              <div>
                <dt>{t.hash}</dt>
                <dd className="mono">{block.hash}</dd>
              </div>
              <div>
                <dt>{t.parentHash}</dt>
                <dd className="mono">{block.header.previousHash}</dd>
              </div>
              <div>
                <dt>{t.proposer}</dt>
                <dd className="mono">
                  <Link to={addressPath(block.header.proposer)} className="table-link">
                    {block.header.proposer}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>{t.timestamp}</dt>
                <dd>{new Date(block.header.timestamp).toLocaleString(language === "ru" ? "ru-RU" : "en-US")}</dd>
              </div>
              <div>
                <dt>{t.transactionsCount}</dt>
                <dd>{block.transactions.length}</dd>
              </div>
            </dl>

            <h2>{t.transactionsCount}</h2>
            {block.transactions.length === 0 ? (
              <p>{t.noTransactions}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t.txId}</th>
                    <th>{t.type}</th>
                    <th>{t.from}</th>
                    <th>{t.to}</th>
                    <th>{t.amount}</th>
                    <th>{t.memo}</th>
                  </tr>
                </thead>
                <tbody>
                  {block.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <Link to={`/tx/${tx.id}`} className="table-link">
                          {tx.id.slice(0, 16)}...
                        </Link>
                      </td>
                      <td>{labelTxType(t, tx.type)}</td>
                      <td>
                        <Link to={addressPath(tx.from)} className="table-link">
                          {tx.from.slice(0, 12)}...
                        </Link>
                      </td>
                      <td>
                        <Link to={addressPath(tx.to)} className="table-link">
                          {tx.to.slice(0, 12)}...
                        </Link>
                      </td>
                      <td>{tx.amount}</td>
                      <td>{formatPaymentMemos(tx) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function TxPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = usePrefs();
  const notify = useNotify();
  const { metrics, headHeight } = useLive();
  const [tx, setTx] = useState<ExplorerTransaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    people.getTransaction(id)
      .then(setTx)
      .catch((err) => notify.error(err instanceof Error ? err.message : t.notFound))
      .finally(() => setLoading(false));
  }, [id, t.notFound, notify]);

  const title = tx ? `${t.txId} ${tx.id.slice(0, 12)}...` : t.txDetails;
  const recipients = tx ? getBatchRecipients(tx) : null;
  const memo = tx && !recipients ? getTxMemo(tx) : null;
  const extraPayload =
    tx?.payload
      ? Object.fromEntries(
          Object.entries(tx.payload).filter(([key]) => key !== "memo" && key !== "recipients")
        )
      : null;
  const hasExtraPayload = extraPayload && Object.keys(extraPayload).length > 0;
  const finalizedHeight = metrics?.finalizedHeight ?? 0;
  const effectiveFinalized =
    tx?.finalized ?? (tx ? tx.blockHeight > 0 && tx.blockHeight <= finalizedHeight : false);
  const lifecycle = tx
    ? resolveTxLifecycle({
        blockHeight: tx.blockHeight,
        validatorConfirmations: tx.validatorConfirmations,
        finalized: effectiveFinalized
      })
    : null;
  const confirmations =
    tx && tx.blockHeight > 0 ? Math.max(0, headHeight - tx.blockHeight) : 0;

  function stageLabel(stage: TxLifecycleStage): string {
    if (stage === "mempool") {
      return t.txLifeMempool;
    }
    if (stage === "block") {
      return t.txLifeBlock;
    }
    if (stage === "attestations") {
      return t.txLifeAttestations;
    }
    return t.txLifeFinalized;
  }

  return (
    <>
      <PageMeta title={title} />

      <section className="card">
        <p className="breadcrumb">
          <Link to="/">{t.home}</Link> / <Link to="/explorer">{t.explorer}</Link> / {t.txDetails}
        </p>
        <h1>{t.txDetails}</h1>

        {loading && <p>{t.loading}</p>}

        {tx && lifecycle && (
          <>
            <ol className="tx-lifecycle" aria-label={t.txLifecycleTitle}>
              {lifecycle.steps.map((step) => {
                const done = stageReached(lifecycle.stage, step);
                const current = lifecycle.stage === step;
                return (
                  <li
                    key={step}
                    className={`tx-lifecycle__step${done ? " tx-lifecycle__step--done" : ""}${
                      current ? " tx-lifecycle__step--current" : ""
                    }`}
                  >
                    <span className="tx-lifecycle__dot" aria-hidden="true" />
                    <strong>{stageLabel(step)}</strong>
                    {step === "attestations" && (
                      <em>
                        {tx.validatorConfirmations ?? 0}
                        {tx.activeValidators ? ` / ${tx.activeValidators}` : ""}
                      </em>
                    )}
                    {step === "block" && tx.blockHeight > 0 && <em>#{tx.blockHeight}</em>}
                    {step === "finalized" && effectiveFinalized && <em>{t.finalized}</em>}
                  </li>
                );
              })}
            </ol>
            <p className="wallet-hint">
              {t.txLifecycleHint
                .replace("{confirmations}", String(confirmations))
                .replace("{stage}", stageLabel(lifecycle.stage))}
            </p>
          </>
        )}

        {tx && (
          <dl className="detail-grid">
            <div>
              <dt>{t.txId}</dt>
              <dd className="mono">{tx.id}</dd>
            </div>
            <div>
              <dt>{t.block}</dt>
              <dd>
                <Link to={`/block/${tx.blockHeight}`} className="table-link">
                  #{tx.blockHeight}
                </Link>
              </dd>
            </div>
            <div>
              <dt>{t.validatorConfirmations}</dt>
              <dd>
                {tx.validatorConfirmations ?? 0}
                {tx.activeValidators ? ` / ${tx.activeValidators}` : ""}
                {effectiveFinalized ? ` · ${t.finalized}` : ""}
              </dd>
            </div>
            <div>
              <dt>{t.txQueueConfirmations}</dt>
              <dd>{confirmations}</dd>
            </div>
            <div>
              <dt>{t.hash}</dt>
              <dd className="mono">{tx.blockHash}</dd>
            </div>
            <div>
              <dt>{t.type}</dt>
              <dd>{labelTxType(t, tx.type)}</dd>
            </div>
            <div>
              <dt>{t.from}</dt>
              <dd className="mono">
                <Link to={addressPath(tx.from)} className="table-link">
                  {tx.from}
                </Link>
              </dd>
            </div>
            <div>
              <dt>{t.to}</dt>
              <dd className="mono">
                <Link to={addressPath(tx.to)} className="table-link">
                  {tx.to}
                </Link>
              </dd>
            </div>
            <div>
              <dt>{t.amount}</dt>
              <dd>{tx.amount}</dd>
            </div>
            <div>
              <dt>{t.fee}</dt>
              <dd>{tx.fee}</dd>
            </div>
            <div>
              <dt>{t.nonce}</dt>
              <dd>{tx.nonce}</dd>
            </div>
            <div>
              <dt>{t.timestamp}</dt>
              <dd>{new Date(tx.timestamp).toLocaleString(language === "ru" ? "ru-RU" : "en-US")}</dd>
            </div>
            {memo && (
              <div className="detail-wide">
                <dt>{t.memo}</dt>
                <dd>{memo}</dd>
              </div>
            )}
            {recipients && (
              <div className="detail-wide">
                <dt>{t.walletBatchTitle}</dt>
                <dd>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.to}</th>
                          <th>{t.amount}</th>
                          <th>{t.memo}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipients.map((item, index) => (
                          <tr key={`${item.to}-${index}`}>
                            <td className="mono">
                              <Link to={addressPath(item.to)} className="table-link">
                                {item.to}
                              </Link>
                            </td>
                            <td>{item.amount}</td>
                            <td>{item.memo ? formatTxMemo(item.memo, 80) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </dd>
              </div>
            )}
            {hasExtraPayload && (
              <div className="detail-wide">
                <dt>{t.payload}</dt>
                <dd>
                  <pre>{JSON.stringify(extraPayload, null, 2)}</pre>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </>
  );
}
