"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import {
  createBrowserPublicClient,
  createInjectedWalletClient,
  ensurePeopleChain,
  discoverWallets,
  type DiscoveredWallet,
} from "@/lib/evm/client";
import { isMobileBrowser } from "@/lib/mobile-env";

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
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "NotSelf", inputs: [] },
  { type: "error", name: "DuplicateOwner", inputs: [] },
  { type: "error", name: "UnknownTransaction", inputs: [] },
  { type: "error", name: "AlreadyConfirmed", inputs: [] },
  { type: "error", name: "NotConfirmed", inputs: [] },
  { type: "error", name: "AlreadyExecuted", inputs: [] },
  { type: "error", name: "NotEnoughConfirmations", inputs: [] },
  { type: "error", name: "CallFailed", inputs: [] },
  { type: "error", name: "InvalidOwner", inputs: [] },
  { type: "error", name: "InvalidThreshold", inputs: [] },
  { type: "error", name: "StaleConfirmations", inputs: [] },
  {
    type: "function",
    name: "confirmedBy",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const REVERT_HINTS: Record<string, string> = {
  AlreadyConfirmed: "you already confirmed this transaction. Next step: Execute.",
  NotEnoughConfirmations: "not enough confirmations yet. Another owner must Confirm first.",
  AlreadyExecuted: "this transaction was already executed.",
  NotOwner: "the connected wallet is not a multisig owner.",
  StaleConfirmations: "the owner set changed after submission; submit a new transaction.",
  CallFailed: "the target call reverted (e.g. the gateway's pendingOwner is not this multisig).",
  UnknownTransaction: "unknown transaction id.",
};

function decodeRevert(e: unknown): string {
  const err = e as { walk?: (fn: (x: unknown) => boolean) => unknown; shortMessage?: string; message?: string };
  const reverted = err?.walk?.((x) => (x as { name?: string })?.name === "ContractFunctionRevertedError") as
    | { data?: { errorName?: string } }
    | undefined;
  const name = reverted?.data?.errorName;
  if (name) return `Reverted: ${name}${REVERT_HINTS[name] ? ` — ${REVERT_HINTS[name]}` : ""}`;
  return err?.shortMessage ?? err?.message ?? String(e);
}

const BTN_PRIMARY =
  "cursor-pointer rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink shadow-sm transition hover:bg-brand/85 hover:shadow-md active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-brand";

const COPY = {
  en: {
    pick: "Choose a wallet",
    switchWallet: "Switch wallet",
    expected: "Expected owner addresses:",
    searching: "Looking for wallets…",
    title: "Testnet multisig",
    lead: "People's own 2-of-3 multisig contract on the People testnet. Owners can submit, confirm and execute transactions here.",
    connect: "Connect wallet",
    openInApp: "Open in the MetaMask app",
    connected: "Connected",
    noWallet:
      "No browser wallet was found. Install MetaMask (or another wallet extension) and reload.",
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
    notOwner: "This address is not a multisig owner, so actions are hidden.",
    sent: "Transaction sent",
    loading: "Loading…",
  },
  ru: {
    pick: "Выберите кошелёк",
    switchWallet: "Сменить кошелёк",
    expected: "Ожидаемые адреса владельцев:",
    searching: "Ищем кошельки…",
    title: "Мультисиг тестнета",
    lead: "Собственный мультисиг-контракт People 2-из-3 в тестнете People. Владельцы могут здесь создавать, подтверждать и исполнять транзакции.",
    connect: "Подключить кошелёк",
    openInApp: "Открыть в приложении MetaMask",
    connected: "Подключено",
    noWallet:
      "Кошелёк в браузере не найден. Установите MetaMask (или другое расширение) и перезагрузите страницу.",
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
    notOwner: "Этот адрес не владелец мультисига, поэтому действия скрыты.",
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
  mine?: boolean;
};

export function MultisigPanel() {
  const { lang } = useLanguage();
  const t = lang === "ru" ? COPY.ru : COPY.en;
  const [owners, setOwners] = useState<Address[]>([]);
  const [threshold, setThreshold] = useState<bigint | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [status, setStatus] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const accountRef = useRef<Address | null>(null);

  const load = useCallback(async () => {
    const client = createBrowserPublicClient();
    const o = await Promise.all(
      [0, 1, 2].map(BigInt).map((i) =>
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
      const mine = accountRef.current
        ? ((await client.readContract({
            address: MULTISIG,
            abi,
            functionName: "confirmedBy",
            args: [BigInt(i), accountRef.current],
          })) as boolean)
        : undefined;
      list.push({ id: i, to, data, executed, confirmations, mine });
    }
    setTxs(list);
  }, []);

  useEffect(() => {
    accountRef.current = account;
    load().catch((e) => setStatus(String((e as Error).message ?? e)));
  }, [load, account]);

  const providerRef = useRef<DiscoveredWallet["provider"] | null>(null);
  const [wallets, setWallets] = useState<DiscoveredWallet[] | null>(null);
  const [mobileNoWallet, setMobileNoWallet] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    discoverWallets(600).then((list) => {
      if (alive) setMobileNoWallet(list.length === 0 && isMobileBrowser());
    });
    return () => {
      alive = false;
    };
  }, []);

  async function pickWallet(w: DiscoveredWallet) {
    setBusy(true);
    try {
      try {
        // Let the wallet show its account picker again (e.g. on "Switch wallet").
        await w.provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        /* optional; not every wallet supports it */
      }
      const accs = (await w.provider.request({
        method: "eth_requestAccounts",
      })) as Address[];
      await ensurePeopleChain(w.provider);
      providerRef.current = w.provider;
      setAccount(accs[0] ?? null);
      setWallets(null);
      setStatus("");
    } catch (e) {
      setStatus(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setStatus(t.searching);
    const list = await discoverWallets(400);
    setBusy(false);
    setStatus("");
    if (list.length === 0) {
      if (isMobileBrowser()) {
        window.location.assign(METAMASK_DEEPLINK);
        return;
      }
      setStatus(t.noWallet);
      return;
    }
    if (list.length === 1) return pickWallet(list[0]);
    setWallets(list);
  }

  function switchWallet() {
    providerRef.current = null;
    setAccount(null);
    void connect();
  }

  async function send(
    functionName: "submit" | "confirm" | "execute",
    args: readonly unknown[],
  ) {
    const provider = providerRef.current;
    if (!provider || !account) return;
    setSending(true);
    try {
      await ensurePeopleChain(provider);
      const wallet = createInjectedWalletClient(provider);
      await createBrowserPublicClient().simulateContract({ address: MULTISIG, abi, functionName, args: args as never, account });
      const hash = await wallet.writeContract({
        gas: functionName === "submit" ? undefined : BigInt(300000),
        address: MULTISIG,
        abi,
        functionName,
        args: args as never,
        account,
        chain: wallet.chain,
      });
      setStatus(`${t.sent}: ${hash}`);
      const receipt = await createBrowserPublicClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        try {
          await createBrowserPublicClient().simulateContract({ address: MULTISIG, abi, functionName, args: args as never, account });
          setStatus(`Transaction ${hash} failed on-chain.`);
        } catch (se) {
          setStatus(decodeRevert(se));
        }
      } else {
        setStatus(`${t.sent}: ${hash}`);
      }
      await load();
    } catch (e) {
      setStatus(decodeRevert(e));
    } finally {
      setSending(false);
    }
  }

  function actions(tx: Tx) {
    const enough = threshold !== null && tx.confirmations >= threshold;
    if (enough)
      return (
        <div className="mt-2" data-testid="multisig-actions">
          <span className="mr-2 text-xs text-ink-3">Step 2 of 2</span>
          <button type="button" disabled={sending} onClick={() => send("execute", [BigInt(tx.id)])} className={BTN_PRIMARY}>
            {sending ? "Waiting for wallet…" : t.execute}
          </button>
        </div>
      );
    if (!tx.mine)
      return (
        <div className="mt-2" data-testid="multisig-actions">
          <span className="mr-2 text-xs text-ink-3">Step 1 of 2</span>
          <button type="button" disabled={sending} onClick={() => send("confirm", [BigInt(tx.id)])} className={BTN_PRIMARY}>
            {sending ? "Waiting for wallet…" : t.confirm}
          </button>
        </div>
      );
    return (
      <p className="mt-2 text-xs text-ink-3" data-testid="multisig-actions">
        You confirmed. Waiting for another owner to confirm ({tx.confirmations.toString()}/{threshold?.toString() ?? "…"}).
      </p>
    );
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
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm" data-testid="multisig-account">
                {t.connected}:{" "}
                <span className="break-all font-mono">{account}</span>
              </p>
              <button
                type="button"
                onClick={switchWallet}
                disabled={busy}
                data-testid="multisig-switch"
                className="cursor-pointer rounded-xl bg-surface px-3 py-1.5 text-sm ring-1 ring-line transition hover:bg-surface-2 hover:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.switchWallet}
              </button>
            </div>
          ) : mobileNoWallet ? (
            <a
              href={METAMASK_DEEPLINK}
              data-testid="multisig-open-metamask"
              className="cursor-pointer rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-ink shadow-sm transition hover:bg-brand/85 hover:shadow-md active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-brand inline-block"
            >
              {t.openInApp}
            </a>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              data-testid="multisig-connect"
              className="cursor-pointer rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-ink shadow-sm transition hover:bg-brand/85 hover:shadow-md active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-brand"
            >
              {t.connect}
            </button>
          )}
          {wallets && !account ? (
            <div
              className="mt-3 rounded-2xl border border-line bg-surface-2 p-3"
              data-testid="multisig-wallets"
            >
              <p className="text-sm font-semibold">{t.pick}</p>
              <ul className="mt-2 space-y-2">
                {wallets.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => pickWallet(w)}
                      disabled={busy}
                      data-testid="multisig-wallet-option"
                      data-rdns={w.rdns}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left text-sm ring-1 ring-line transition hover:bg-canvas hover:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {w.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.icon} alt="" className="h-6 w-6" />
                      ) : null}
                      <span>{w.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {account && !isOwner && owners.length ? (
            <div
              className="mt-2 text-sm text-ink-3"
              data-testid="multisig-not-owner"
            >
              <p>{t.notOwner}</p>
              <p className="mt-1">{t.expected}</p>
              <ul className="mt-1 space-y-0.5 break-all font-mono text-xs">
                {owners.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {isOwner ? (
          <div className="mt-3">
            <button type="button" onClick={() => setShowNew((v) => !v)} className="text-xs text-ink-3 underline hover:text-ink">
              {showNew ? "− New transaction" : "+ New transaction"}
            </button>
            {showNew ? (
          <button
            type="button"
            onClick={() =>
              send("submit", [GATEWAY, BigInt(0), ACCEPT_OWNERSHIP])
            }
            disabled={sending}
            className={`mt-3 ${BTN_PRIMARY}`}
          >
            {t.submitAccept}
          </button>
            ) : null}
          </div>
        ) : null}
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
                actions(tx)
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
