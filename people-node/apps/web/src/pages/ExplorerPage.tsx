import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addressPath } from "../address.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { useLive } from "../LiveContext.js";
import { useWallet } from "../WalletContext.js";
import { people } from "../peopleClient.js";
import type { Block } from "@people/protocol";
import type { LiveTransaction } from "../LiveContext.js";
import { formatPaymentMemos } from "../txMemo.js";
import { labelTxType } from "../i18n.js";
import { downloadCsv } from "../csvExport.js";
import { computeSupply } from "../supplyMath.js";

export function ExplorerPage() {
  const { t } = usePrefs();
  const notify = useNotify();
  const { session } = useWallet();
  const { feed, metrics, snapshot } = useLive();
  const [searchParams, setSearchParams] = useSearchParams();
  const finalizedHeight = metrics?.finalizedHeight ?? 0;
  const [extraBlocks, setExtraBlocks] = useState<Block[]>([]);
  const [extraTxs, setExtraTxs] = useState<LiveTransaction[]>([]);
  const [blockCursor, setBlockCursor] = useState<number | null>(null);
  const [txCursor, setTxCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const blockSort = (searchParams.get("blockSort") as "desc" | "asc" | null) ?? "desc";
  const txSort = (searchParams.get("txSort") as "desc" | "asc" | null) ?? "desc";
  const txTypeFilter = searchParams.get("type") ?? "all";
  const minAmountFilter = Number(searchParams.get("minAmount") ?? "0") || 0;
  const mineOnly = searchParams.get("mine") === "1";

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      const isDefault =
        value === null ||
        value === "" ||
        value === "all" ||
        (key === "minAmount" && value === "0") ||
        ((key === "blockSort" || key === "txSort") && value === "desc");
      if (isDefault) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  }

  const accounts = feed?.accounts ?? [];
  const blocks = blockCursor === null ? (feed?.blocks ?? []) : extraBlocks;
  const transactions = txCursor === null ? (feed?.transactions.slice(0, 20) ?? []) : extraTxs;
  const visibleBlocks = useMemo(
    () =>
      [...blocks].sort((a, b) =>
        blockSort === "desc" ? b.header.height - a.header.height : a.header.height - b.header.height
      ),
    [blocks, blockSort]
  );
  const visibleTransactions = useMemo(() => {
    const my = session?.address?.toLowerCase();
    const filtered = (txTypeFilter === "all" ? transactions : transactions.filter((tx) => tx.type === txTypeFilter))
      .filter((tx) => tx.amount >= minAmountFilter)
      .filter((tx) =>
        !mineOnly || !my
          ? true
          : tx.from.toLowerCase() === my || tx.to.toLowerCase() === my
      );
    return [...filtered].sort((a, b) =>
      txSort === "desc" ? b.blockHeight - a.blockHeight : a.blockHeight - b.blockHeight
    );
  }, [transactions, txSort, txTypeFilter, minAmountFilter, mineOnly, session?.address]);
  const txTypes = useMemo(() => Array.from(new Set(transactions.map((tx) => tx.type))).sort(), [transactions]);

  const supply = useMemo(
    () =>
      computeSupply({
        accounts,
        validators: snapshot?.validators ?? [],
        feePool: metrics?.feePool,
        issuedRewards: metrics?.totalValidatorRewards
      }),
    [accounts, snapshot?.validators, metrics?.feePool, metrics?.totalValidatorRewards]
  );

  useEffect(() => {
    if (mineOnly && !session?.address) {
      patchParams({ mine: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly, session?.address]);

  async function loadMoreBlocks() {
    setLoadingMore(true);
    try {
      const cursor = blockCursor ?? feed?.blocks.at(-1)?.header.height;
      const page = await people.getBlocksCursor(10, cursor);
      setExtraBlocks(page.items);
      setBlockCursor(page.nextCursor === null ? -1 : Number(page.nextCursor));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.nodeOffline);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreTxs() {
    setLoadingMore(true);
    try {
      const cursor = txCursor ?? feed?.transactions.at(-1)?.id;
      const page = await people.getTransactionsCursor(20, cursor);
      setExtraTxs(page.items as LiveTransaction[]);
      setTxCursor(page.nextCursor === null ? "" : String(page.nextCursor));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.nodeOffline);
    } finally {
      setLoadingMore(false);
    }
  }

  function exportTxCsv() {
    downloadCsv(`people-txs-${Date.now()}.csv`, [
      ["id", "blockHeight", "type", "from", "to", "amount", "fee", "memo", "finalized"],
      ...visibleTransactions.map((tx) => [
        tx.id,
        String(tx.blockHeight),
        tx.type,
        tx.from,
        tx.to,
        String(tx.amount),
        String(tx.fee),
        formatPaymentMemos(tx) ?? "",
        String(finalizedHeight > 0 && tx.blockHeight <= finalizedHeight)
      ])
    ]);
    notify.success(t.explorerCsvExported);
  }

  return (
    <>
      <PageMeta title={t.explorerTitle} description={t.explorerDescription} />

      <section className="card page-header">
        <div className="section-head">
          <div>
            <h1>{t.explorerTitle}</h1>
            <p className="lead">{t.explorerDescription}</p>
            <p className="wallet-hint">{t.searchHelp}</p>
            <div className="link-row">
              <button type="button" className="ghost" onClick={() => patchParams({ type: "transfer" })}>
                {t.filterTransfers}
              </button>
              <button type="button" className="ghost" onClick={() => patchParams({ minAmount: "100" })}>
                {t.filterLargeTx}
              </button>
              <button
                type="button"
                className={`ghost${mineOnly ? " send-action-btn--active" : ""}`}
                disabled={!session}
                onClick={() => patchParams({ mine: mineOnly ? null : "1" })}
              >
                {t.explorerFilterMine}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  patchParams({ type: null, minAmount: null, mine: null, txSort: null, blockSort: null })
                }
              >
                {t.filterAll}
              </button>
              <button type="button" className="ghost" onClick={exportTxCsv} disabled={visibleTransactions.length === 0}>
                {t.explorerExportCsv}
              </button>
            </div>
            <p className="wallet-hint">{t.explorerBookmarkHint}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>{t.supplyTitle}</h2>
        <div className="grid">
          <div>
            <strong>{t.supplyLiquid}</strong>
            <p>{supply.liquidBalances.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyLocked}</strong>
            <p>{supply.lockedStake.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyCirculating}</strong>
            <p>{supply.circulating.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyIssuedRewards}</strong>
            <p>{supply.issuedRewards.toFixed(2)} PPL</p>
          </div>
          <div>
            <strong>{t.supplyFeePool}</strong>
            <p>{supply.feePool.toFixed(2)} PPL</p>
          </div>
        </div>
        <p className="wallet-hint">{t.supplyHint}</p>
      </section>

      <section className="card">
        <h2>{t.allWallets}</h2>
        {accounts.length === 0 ? (
          <p>{t.noWallets}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.walletAddress}</th>
                  <th className="hide-mobile">{t.walletBalance}</th>
                  <th className="hide-mobile">{t.outgoingTxs}</th>
                  <th className="hide-mobile">{t.incomingTxs}</th>
                  <th className="hide-mobile">{t.nonce}</th>
                  <th scope="col">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.address} className="clickable-row">
                    <td>
                      <Link to={addressPath(account.address)} className="table-link mono">
                        {account.address}
                      </Link>
                    </td>
                    <td className="hide-mobile">{account.balance.toFixed(4)} PPL</td>
                    <td className="hide-mobile">{account.outgoingTxs}</td>
                    <td className="hide-mobile">{account.incomingTxs}</td>
                    <td className="hide-mobile">{account.nonce}</td>
                    <td>
                      <Link
                        to={addressPath(account.address)}
                        className="table-link"
                        aria-label={`${t.openAddressAria} ${account.address}`}
                      >
                        {t.viewAddress}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>{t.latestBlocks}</h2>
          <div className="link-row">
            <label>
              {t.sort}
              <select
                value={blockSort}
                onChange={(e) => patchParams({ blockSort: e.target.value })}
              >
                <option value="desc">{t.sortNewest}</option>
                <option value="asc">{t.sortOldest}</option>
              </select>
            </label>
            <button className="ghost" onClick={() => void loadMoreBlocks()} disabled={loadingMore || blockCursor === -1}>
              {t.loadMore}
            </button>
          </div>
        </div>
        {blocks.length === 0 ? (
          <p>{t.noBlocks}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.block}</th>
                  <th>{t.hash}</th>
                  <th className="hide-mobile">{t.txsShort}</th>
                  <th className="hide-mobile">{t.status}</th>
                  <th className="hide-mobile">{t.time}</th>
                </tr>
              </thead>
              <tbody>
                {visibleBlocks.map((block) => {
                  const isFinalized = finalizedHeight > 0 && block.header.height <= finalizedHeight;
                  return (
                    <tr key={block.hash} className="clickable-row">
                      <td>
                        <Link to={`/block/${block.header.height}`} className="table-link mono">
                          {block.header.height}
                        </Link>
                      </td>
                      <td>
                        <Link
                          to={`/search?q=${encodeURIComponent(block.hash)}`}
                          className="table-link mono"
                          aria-label={`${t.openBlockAria} ${block.hash}`}
                        >
                          {block.hash.slice(0, 16)}...
                        </Link>
                      </td>
                      <td className="hide-mobile">{block.transactions.length}</td>
                      <td className="hide-mobile">
                        {isFinalized ? (
                          <span className="status-badge status-badge--ok">{t.finalized}</span>
                        ) : (
                          <span className="status-badge">{t.pendingFinality}</span>
                        )}
                      </td>
                      <td className="hide-mobile">{new Date(block.header.timestamp).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>{t.latestTransactions}</h2>
          <div className="link-row">
            <label>
              {t.filter}
              <select value={txTypeFilter} onChange={(e) => patchParams({ type: e.target.value })}>
                <option value="all">{t.filterAll}</option>
                {txTypes.map((type) => (
                  <option key={type} value={type}>
                    {labelTxType(t, type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.minAmount}
              <input
                type="number"
                min={0}
                value={minAmountFilter}
                onChange={(event) =>
                  patchParams({ minAmount: String(Number(event.target.value) || 0) })
                }
              />
            </label>
            <label>
              {t.sort}
              <select value={txSort} onChange={(e) => patchParams({ txSort: e.target.value })}>
                <option value="desc">{t.sortNewest}</option>
                <option value="asc">{t.sortOldest}</option>
              </select>
            </label>
            <button className="ghost" onClick={() => void loadMoreTxs()} disabled={loadingMore || txCursor === ""}>
              {t.loadMore}
            </button>
          </div>
        </div>
        <p className="wallet-hint">
          {t.paginationInfo}: {visibleTransactions.length}
          {mineOnly ? ` · ${t.explorerFilterMine}` : ""}
        </p>
        {transactions.length === 0 ? (
          <p>{t.noTransactions}</p>
        ) : visibleTransactions.length === 0 ? (
          <p>{t.explorerNoFilteredTx}</p>
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
                  <th className="hide-mobile">{t.status}</th>
                  <th className="hide-mobile">{t.memo}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((tx) => {
                  const isFinalized = finalizedHeight > 0 && tx.blockHeight <= finalizedHeight;
                  return (
                    <tr key={tx.id} className="clickable-row">
                      <td>
                        <Link to={`/tx/${tx.id}`} className="table-link mono" aria-label={`${t.openTxAria} ${tx.id}`}>
                          {tx.id.slice(0, 12)}...
                        </Link>
                      </td>
                      <td>
                        <Link to={`/block/${tx.blockHeight}`} className="table-link mono">
                          {tx.blockHeight}
                        </Link>
                      </td>
                      <td className="hide-mobile">{labelTxType(t, tx.type)}</td>
                      <td className="hide-mobile">
                        <Link
                          to={addressPath(tx.from)}
                          className="table-link mono"
                          aria-label={`${t.openAddressAria} ${tx.from}`}
                        >
                          {tx.from.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="hide-mobile">
                        <Link
                          to={addressPath(tx.to)}
                          className="table-link mono"
                          aria-label={`${t.openAddressAria} ${tx.to}`}
                        >
                          {tx.to.slice(0, 10)}...
                        </Link>
                      </td>
                      <td>{tx.amount}</td>
                      <td className="hide-mobile">
                        {isFinalized ? (
                          <span className="status-badge status-badge--ok">{t.finalized}</span>
                        ) : (
                          <span className="status-badge">{t.pendingFinality}</span>
                        )}
                      </td>
                      <td className="hide-mobile">{formatPaymentMemos(tx) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
