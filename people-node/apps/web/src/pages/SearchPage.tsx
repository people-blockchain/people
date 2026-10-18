import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Block, Transaction } from "@people/protocol";
import { addressPath, isWalletAddress } from "../address.js";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useNotify } from "../NotifyContext.js";
import { people } from "../peopleClient.js";
import { labelTxType } from "../i18n.js";

interface AccountInfo {
  address: string;
  balance: number;
  nonce: number;
  chainId: string;
  headHeight: number;
}

interface ExplorerTransaction extends Transaction {
  blockHeight: number;
  blockHash: string;
}

interface SearchResponse {
  blocks: Block[];
  transactions: ExplorerTransaction[];
  addresses: string[];
}

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  const { t } = usePrefs();
  const notify = useNotify();
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [addressBalances, setAddressBalances] = useState<Record<string, number>>({});
  const [addressTxs, setAddressTxs] = useState<ExplorerTransaction[]>([]);
  const [hadError, setHadError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setAccount(null);
      setAddressBalances({});
      setAddressTxs([]);
      return;
    }

    if (isWalletAddress(query)) {
      navigate(addressPath(query.trim()), { replace: true });
      return;
    }

    setLoading(true);
    setHadError(false);

    people.search(query)
      .then(async (data) => {
        setResults(data);

        const primaryAddress = data.addresses.length === 1 ? data.addresses[0]! : null;
        if (primaryAddress && data.blocks.length === 0 && data.transactions.length === 0) {
          const [accountData, txs] = await Promise.all([
            people.getAddress(primaryAddress),
            people.getAddressTransactions(primaryAddress, 50) as Promise<ExplorerTransaction[]>
          ]);
          setAccount(accountData);
          setAddressTxs(txs);
        } else {
          setAccount(null);
          setAddressTxs([]);
        }

        if (data.addresses.length > 0) {
          const balances = await Promise.all(
            data.addresses.map(async (address) => {
              const info = await people.getAddress(address);
              return [address, info.balance] as const;
            })
          );
          setAddressBalances(Object.fromEntries(balances));
        } else {
          setAddressBalances({});
        }
      })
      .catch((err) => {
        setHadError(true);
        notify.error(err instanceof Error ? err.message : t.notFound);
      })
      .finally(() => setLoading(false));
  }, [query, t.notFound, navigate, notify]);

  const isEmpty =
    results &&
    results.blocks.length === 0 &&
    results.transactions.length === 0 &&
    results.addresses.length === 0;

  return (
    <>
      <PageMeta title={`${t.searchResults}: ${query || "—"}`} />

      <section className="card">
        <p className="breadcrumb">
          <Link to="/">{t.home}</Link> / <Link to="/explorer">{t.explorer}</Link> / {t.searchResults}
        </p>
        <h1>{t.searchResults}</h1>
        <p className="wallet-hint">{t.searchHelp}</p>
        {query && (
          <p className="search-query">
            <strong>{query}</strong>
          </p>
        )}

        {loading && <p>{t.loading}</p>}
        {!loading && !hadError && isEmpty && (
          <div>
            <p>{t.noResults}</p>
            <div className="link-row">
              <Link to="/explorer" className="ghost button-link">{t.explorer}</Link>
              <Link to="/wallet" className="ghost button-link">{t.wallet}</Link>
            </div>
          </div>
        )}

        {account && (
          <section className="wallet-overview search-account">
            <h2>{t.addressTitle}</h2>
            <dl className="detail-grid">
              <div>
                <dt>{t.walletAddress}</dt>
                <dd className="mono">{account.address}</dd>
              </div>
              <div>
                <dt>{t.walletBalance}</dt>
                <dd>{account.balance.toFixed(4)} PPL</dd>
              </div>
              <div>
                <dt>{t.nonce}</dt>
                <dd>{account.nonce}</dd>
              </div>
            </dl>
            <Link to={addressPath(account.address)} className="table-link">
              {t.viewAddress}
            </Link>
          </section>
        )}

        {results && results.blocks.length > 0 && (
          <>
            <h2>{t.blocksFound}</h2>
            <div className="table-wrap">
              <table>
              <thead>
                <tr>
                  <th>{t.block}</th>
                  <th>{t.hash}</th>
                  <th className="hide-mobile">{t.transactionsCount}</th>
                  <th scope="col">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {results.blocks.map((block) => (
                  <tr key={block.hash}>
                    <td>{block.header.height}</td>
                    <td className="mono">{block.hash.slice(0, 20)}...</td>
                    <td className="hide-mobile">{block.transactions.length}</td>
                    <td>
                      <Link to={`/block/${block.header.height}`} className="table-link" aria-label={`${t.openBlockAria} ${block.hash}`}>
                        {t.viewBlock}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}

        {results && results.transactions.length > 0 && (
          <>
            <h2>{t.txsFound}</h2>
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
                  <th scope="col">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {results.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="mono">{tx.id.slice(0, 16)}...</td>
                    <td>{tx.blockHeight}</td>
                    <td className="hide-mobile">{labelTxType(t, tx.type)}</td>
                    <td className="mono hide-mobile">
                      <Link to={addressPath(tx.from)} className="table-link" aria-label={`${t.openAddressAria} ${tx.from}`}>
                        {tx.from.slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="mono hide-mobile">
                      <Link to={addressPath(tx.to)} className="table-link" aria-label={`${t.openAddressAria} ${tx.to}`}>
                        {tx.to.slice(0, 12)}...
                      </Link>
                    </td>
                    <td>{tx.amount}</td>
                    <td>
                      <Link to={`/tx/${tx.id}`} className="table-link" aria-label={`${t.openTxAria} ${tx.id}`}>
                        {t.viewTx}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}

        {results && results.addresses.length > 0 && (
          <>
            <h2>{t.addressesFound}</h2>
            <div className="table-wrap">
              <table>
              <thead>
                <tr>
                  <th>{t.walletAddress}</th>
                  <th className="hide-mobile">{t.walletBalance}</th>
                  <th scope="col">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {results.addresses.map((address) => (
                  <tr key={address}>
                    <td className="mono">{address}</td>
                    <td className="hide-mobile">
                      {addressBalances[address] !== undefined
                        ? `${addressBalances[address]!.toFixed(4)} PPL`
                        : t.loading}
                    </td>
                    <td>
                      <Link to={addressPath(address)} className="table-link" aria-label={`${t.openAddressAria} ${address}`}>
                        {t.viewAddress}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}

        {addressTxs.length > 0 && (
          <>
            <h2>{t.latestTransactions}</h2>
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
                </tr>
              </thead>
              <tbody>
                {addressTxs.map((tx) => (
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
                    <td className="hide-mobile">
                      <Link to={addressPath(tx.from)} className="table-link mono" aria-label={`${t.openAddressAria} ${tx.from}`}>
                        {tx.from.slice(0, 10)}...
                      </Link>
                    </td>
                    <td className="hide-mobile">
                      <Link to={addressPath(tx.to)} className="table-link mono" aria-label={`${t.openAddressAria} ${tx.to}`}>
                        {tx.to.slice(0, 10)}...
                      </Link>
                    </td>
                    <td>{tx.amount}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
