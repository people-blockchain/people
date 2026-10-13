"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import {
  createBrowserPublicClient,
  createInjectedWalletClient,
  ensurePeopleChain,
  readInjectedProvider,
  waitForInjectedProvider,
} from "@/lib/evm/client";
import { isMobileBrowser, walletAppDeepLink } from "@/lib/mobile-env";

const MULTISIG: Address = "0xbE38DD4bEA1406878FF40AE1D5cE7c7e6Dc7ddaB";
const GATEWAY: Address = "0x78e9F226de7078ec9D03F96bA3e62B6995ecc5d9";
const ACCEPT_OWNERSHIP: Hex = "0x79ba5097";
const METAMASK_DEEPLINK =
  "https://metamask.app.link/dapp/www.peopleblockchain.network/multisig";

const abi = [
  {
    type: "function",
    name: "owners",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "threshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transactionCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getTransaction",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "executed", type: "bool" },
      { name: "confirmations", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "confirm",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
] as const;

const COPY = {
  en: {
    title: "Testnet multisig",
    lead: "People's own 2-of-3 multisig contract on the People testnet. Owners can submit, confirm and execute transactions here.",
    connect: "Connect MetaMask",
    openInApp: "Open in the MetaMask app",
    connected: "Connected",
    noWallet:
      "MetaMask was not found in this browser. Install it, or open this page in the MetaMask app.",
    owners: "Owners",
    threshold: "Confirmations needed",
    txs: "Transactions",
    none: "No transactions yet.",
    to: "To",
    data: "Data",
    confirmations: "Confirmations",
    executed: "Executed",
    pending: "Pending",
    submitAccept: "Submit: accept fee gateway ownership",
    confirm: "Confirm",
    execute: "Execute",
    notOwner: "This wallet is not a multisig owner, so actions are hidden.",
    sent: "Transaction sent",
    loading: "Loading…",
  },
  ru: {
    title: "Мультисиг тестнета",
    lead: "Собственный мультисиг-контракт People 2-из-3 в тестнете People. Владельцы могут здесь создавать, подтверждать и исполнять транзакции.",
    connect: "Подключить MetaMask",
    openInApp: "Открыть в приложении MetaMask",
    connected: "Подключено",
    noWallet: "MetaMask не найден в этом браузере.",
    owners: "Владельцы",
    threshold: "Нужно подтверждений",
    txs: "Транзакции",
    none: "Транзакций пока нет.",
    to: "Кому",
    data: "Данные",
    confirmations: "Подтверждения",
    executed: "Исполнена",
    pending: "Ожидает",
    submitAccept: "Создать: принять владение fee gateway",
    confirm: "Подтвердить",
    execute: "Исполнить",
    notOwner: "Этот кошелёк не владелец мультисига, поэтому действия скрыты.",
    sent: "Транзакция отправлена",
    loading: "Загрузка…",
  },
} as const;

type Tx = {
  id: number;
  to: Address;
  data: Hex;
  executed: boolean;
  confirmations: bigint;
};

export function MultisigPanel() {
  const { lang } = useLanguage();
  const t = lang === "ru" ? COPY.ru : COPY.en;
  const [owners, setOwners] = useState<Address[]>([]);
  const [threshold, setThreshold] = useState<bigint | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async () => {
    const client = createBrowserPublicClient();
    const o = await Promise.all(
      [0, 1, 2]
        .map(BigInt)
        .map((i) =>
          client.readContract({
            address: MULTISIG,
            abi,
            functionName: "owners",
            args: [i],
          }),
        ),
    );
    setOwners(o as Address[]);
    setThreshold(
      (await client.readContract({
        address: MULTISIG,
        abi,
        functionName: "threshold",
      })) as bigint,
    );
    const n = Number(
      await client.readContract({
        address: MULTISIG,
        abi,
        functionName: "transactionCount",
      }),
    );
    const list: Tx[] = [];
    for (let i = 0; i < n; i++) {
      const [to, , data, executed, confirmations] = (await client.readContract({
        address: MULTISIG,
        abi,
        functionName: "getTransaction",
        args: [BigInt(i)],
      })) as readonly [Address, bigint, Hex, boolean, bigint];
      list.push({ id: i, to, data, executed, confirmations });
    }
    setTxs(list);
  }, []);

  useEffect(() => {
    load().catch((e) => setStatus(String((e as Error).message ?? e)));
  }, [load]);

  async function connect() {
    const provider =
      readInjectedProvider("any") ?? (await waitForInjectedProvider("any"));
    if (!provider) {
      // Mobile Chrome/Safari have no injected wallet: open this page inside the MetaMask app.
      if (isMobileBrowser()) {
        window.location.assign(
          walletAppDeepLink("metamask", window.location.href),
        );
        return;
      }
      return setStatus(t.noWallet);
    }
    try {
      const accs = (await provider.request({
        method: "eth_requestAccounts",
      })) as Address[];
      await ensurePeopleChain(provider);
      setAccount(accs[0] ?? null);
      setStatus("");
    } catch (e) {
      setStatus(String((e as Error).message ?? e));
    }
  }

  async function send(
    functionName: "submit" | "confirm" | "execute",
    args: readonly unknown[],
  ) {
    const provider = readInjectedProvider("any");
    if (!provider || !account) return;
    try {
      await ensurePeopleChain(provider);
      const wallet = createInjectedWalletClient(provider);
      const hash = await wallet.writeContract({
        address: MULTISIG,
        abi,
        functionName,
        args: args as never,
        account,
        chain: wallet.chain,
      });
      setStatus(`${t.sent}: ${hash}`);
      await createBrowserPublicClient().waitForTransactionReceipt({ hash });
      await load();
    } catch (e) {
      setStatus(String((e as Error).message ?? e));
    }
  }

  const isOwner =
    account !== null &&
    owners.some((o) => o.toLowerCase() === account.toLowerCase());

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <div className="mt-4" data-testid="multisig-actions">
        <div>
          {account ? (
            <p className="text-sm">
              {t.connected}: <span className="font-mono">{account}</span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={connect}
                data-testid="multisig-connect"
                className="rounded-xl bg-brand px-4 py-2 text-sm text-brand-ink"
              >
                {t.connect}
              </button>
              <a
                href={METAMASK_DEEPLINK}
                data-testid="multisig-open-metamask"
                className="text-sm text-ink-2 underline"
              >
                {t.openInApp}
              </a>
            </div>
          )}
          {account && !isOwner ? (
            <p className="mt-2 text-sm text-ink-3">{t.notOwner}</p>
          ) : null}
        </div>

        {isOwner ? (
          <button
            type="button"
            onClick={() =>
              send("submit", [GATEWAY, BigInt(0), ACCEPT_OWNERSHIP])
            }
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm text-brand-ink"
          >
            {t.submitAccept}
          </button>
        ) : null}
        {isOwner
          ? txs
              .filter((tx) => !tx.executed)
              .map((tx) => (
                <div
                  key={tx.id}
                  className="mt-3 flex flex-wrap items-center gap-2 text-sm"
                  data-testid="multisig-quick-actions"
                >
                  <span className="font-semibold">#{tx.id}</span>
                  <span className="text-ink-3">
                    {tx.confirmations.toString()} /{" "}
                    {threshold?.toString() ?? "…"}
                  </span>
                  <button
                    type="button"
                    onClick={() => send("confirm", [BigInt(tx.id)])}
                    className="rounded-xl bg-brand px-3 py-1.5 text-brand-ink"
                  >
                    {t.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => send("execute", [BigInt(tx.id)])}
                    className="rounded-xl bg-surface px-3 py-1.5 ring-1 ring-line"
                  >
                    {t.execute}
                  </button>
                </div>
              ))
          : null}
        {status ? (
          <p className="mt-3 break-all text-xs text-ink-3">{status}</p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-ink-2">{t.lead}</p>
      <p className="mt-2 break-all font-mono text-xs text-ink-3">{MULTISIG}</p>

      <h2 className="mt-8 font-semibold">{t.owners}</h2>
      {owners.length === 0 ? (
        <p className="text-sm text-ink-3">{t.loading}</p>
      ) : (
        <ul
          className="mt-2 space-y-1 font-mono text-xs"
          data-testid="multisig-owners"
        >
          {owners.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">
        {t.threshold}: <b>{threshold === null ? "…" : threshold.toString()}</b>
      </p>

      <h2 className="mt-8 font-semibold">{t.txs}</h2>
      {txs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t.none}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {txs.map((tx) => (
            <li
              key={tx.id}
              className="rounded-2xl border border-line bg-surface-2 p-4 text-sm"
            >
              <p className="font-semibold">
                #{tx.id} · {tx.executed ? t.executed : t.pending}
              </p>
              <p className="break-all font-mono text-xs">
                {t.to}: {tx.to}
              </p>
              <p className="break-all font-mono text-xs">
                {t.data}: {tx.data}
              </p>
              <p>
                {t.confirmations}: {tx.confirmations.toString()} /{" "}
                {threshold?.toString() ?? "…"}
              </p>
              {isOwner && !tx.executed ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => send("confirm", [BigInt(tx.id)])}
                    className="rounded-xl bg-surface px-3 py-1.5 text-sm ring-1 ring-line"
                  >
                    {t.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => send("execute", [BigInt(tx.id)])}
                    className="rounded-xl bg-surface px-3 py-1.5 text-sm ring-1 ring-line"
                  >
                    {t.execute}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
