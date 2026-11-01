"use client";

import { useCallback, useEffect, useState } from "react";
import { GENESIS_QUEST_COPY as c } from "@/lib/founders/quest/copy";
import { QUEST_POINTS_CAP } from "@/lib/founders/quest/config";
import { founderShareText, founderShareUrl } from "@/lib/founders-share-text";

type QuestPayload = {
  questPoints: number;
  cap: number;
  projectedPpl: number;
  founderPoints: number;
  personalCode: string;
  xHandle: string | null;
  tasks: Record<string, boolean>;
  verifiedInvitees: number;
  referralPplCap: number;
  leaderboard: { founderNumber: number; questPoints: number; verifiedInvitees: number; rank: number }[];
};

function mapError(code: string | undefined): string {
  if (code === "rate_limited") return c.error.rate_limited;
  if (code === "cap_reached") return c.error.cap;
  if (code === "duplicate") return c.error.duplicate;
  if (code === "invalid" || code === "not_eligible") return c.error.invalid;
  return c.error.generic;
}

export function GenesisQuestPanel({
  founderNumber,
  verificationLevel,
  referralWallet,
  onReload,
}: {
  founderNumber: number;
  verificationLevel: number;
  referralWallet: string | null;
  onReload: () => Promise<void>;
}) {
  const [data, setData] = useState<QuestPayload | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [xHandle, setXHandle] = useState("");
  const [replyUrl, setReplyUrl] = useState("");
  const [dailyUrl, setDailyUrl] = useState("");
  const [ytWord, setYtWord] = useState("");
  const [mediumWord, setMediumWord] = useState("");

  const loadQuest = useCallback(async () => {
    const res = await fetch("/api/founders/quest", { cache: "no-store", credentials: "include" });
    if (!res.ok) return;
    const body = (await res.json()) as QuestPayload;
    setData(body);
    setXHandle(body.xHandle ?? "");
  }, []);

  useEffect(() => {
    void loadQuest();
  }, [loadQuest]);

  async function act(body: Record<string, string>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/founders/quest", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        setMsg(c.success);
        await loadQuest();
        await onReload();
      } else {
        setMsg(mapError(json.error));
      }
    } catch {
      setMsg(c.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const pct = data ? Math.min(100, Math.round((data.questPoints / QUEST_POINTS_CAP) * 100)) : 0;
  const shareLink =
    referralWallet && typeof window !== "undefined"
      ? founderShareUrl(window.location.origin, referralWallet)
      : "";
  const shareText = founderShareText("en", founderNumber);

  function openXCardShare() {
    const text = `${shareText} ${data?.personalCode ?? ""}`.trim();
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}${shareLink ? `&url=${encodeURIComponent(shareLink)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!data) return null;

  return (
    <section
      id="genesis-quest"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-8 sm:px-6 lg:px-8"
      data-testid="genesis-quest"
    >
      <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{c.title}</p>
        <h2 className="mt-2 text-2xl font-bold text-ink">{c.title}</h2>
        <p className="mt-2 text-sm text-ink-2">{c.lead}</p>
        <p className="mt-1 text-xs text-ink-3">{c.founderPointsNote}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-canvas-2 p-4">
            <p className="text-xs font-semibold uppercase text-ink-3">{c.questPointsLabel}</p>
            <p className="mt-1 text-3xl font-bold text-ink">
              {data.questPoints.toLocaleString("en")}{" "}
              <span className="text-base font-normal text-ink-3">/ {QUEST_POINTS_CAP.toLocaleString("en")}</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-3">{c.capNote}</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas-2 p-4">
            <p className="text-xs font-semibold uppercase text-ink-3">{c.projectedPpl}</p>
            <p className="mt-1 text-3xl font-bold text-value">{data.projectedPpl.toLocaleString("en")} PPL</p>
            <p className="mt-2 text-xs text-ink-3">{c.vestingNote}</p>
            {verificationLevel < 1 ? <p className="mt-2 text-xs text-warm">{c.verifyRequired}</p> : null}
          </div>
        </div>

        {msg ? (
          <p className="mt-4 text-sm text-ink-2" role="status">
            {msg}
          </p>
        ) : null}

        <ul className="mt-8 space-y-4">
          <TaskRow done={data.tasks.verify} title={c.tasks.verify.title} points={c.tasks.verify.points} />
          <TaskRow done={data.tasks.founder_card} title={c.tasks.founder_card.title} points={c.tasks.founder_card.points} />

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={data.tasks.telegram_join} title={c.tasks.telegram.title} points={c.tasks.telegram.points} />
            <p className="mt-1 text-xs text-ink-3">{c.tasks.telegram.hint}</p>
            <button
              type="button"
              disabled={busy || data.tasks.telegram_join}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() => void act({ action: "telegram_check" })}
            >
              {data.tasks.telegram_join ? c.tasks.verify.done : c.tasks.telegram.cta}
            </button>
          </li>

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={data.tasks.x_engagement} title={c.tasks.x_link.title} points={c.tasks.x_link.points} />
            <p className="mt-2 text-xs text-ink-3">
              {c.tasks.x_link.codeLabel}: <strong className="text-ink">{data.personalCode}</strong>
            </p>
            <label className="mt-3 block text-xs font-medium text-ink-2">{c.tasks.x_link.handleLabel}</label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                className="min-w-[12rem] flex-1 rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm"
                placeholder="@handle"
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                onClick={() => void act({ action: "set_x_handle", handle: xHandle })}
              >
                {c.tasks.x_link.saveHandle}
              </button>
            </div>
            <label className="mt-3 block text-xs font-medium text-ink-2">{c.tasks.x_link.replyLabel}</label>
            <input
              value={replyUrl}
              onChange={(e) => setReplyUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || data.tasks.x_engagement}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() => void act({ action: "x_reply", replyUrl, mode: "engagement" })}
            >
              {c.tasks.x_link.submit}
            </button>
          </li>

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={data.tasks.x_daily} title={c.tasks.x_daily.title} points={c.tasks.x_daily.points} />
            <input
              value={dailyUrl}
              onChange={(e) => setDailyUrl(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm"
              placeholder="https://x.com/…/status/…"
            />
            <button
              type="button"
              disabled={busy || data.tasks.x_daily}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() => void act({ action: "x_reply", replyUrl: dailyUrl, mode: "daily" })}
            >
              {c.tasks.x_daily.submit}
            </button>
          </li>

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={data.tasks.x_card_share} title={c.tasks.x_card.title} points={c.tasks.x_card.points} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-full border border-line px-4 py-2 text-sm font-semibold" onClick={openXCardShare}>
                {c.tasks.x_card.cta}
              </button>
              <button
                type="button"
                disabled={busy || data.tasks.x_card_share}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                onClick={() => void act({ action: "x_card_share" })}
              >
                {c.tasks.x_card.afterShare}
              </button>
            </div>
          </li>

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={false} title={c.tasks.youtube.title} points={c.tasks.youtube.points} />
            <input
              value={ytWord}
              onChange={(e) => setYtWord(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() => void act({ action: "secret_word", platform: "youtube", word: ytWord })}
            >
              {c.tasks.youtube.submit}
            </button>
          </li>

          <li className="rounded-2xl border border-line p-4">
            <TaskHead done={false} title={c.tasks.medium.title} points={c.tasks.medium.points} />
            <input
              value={mediumWord}
              onChange={(e) => setMediumWord(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() => void act({ action: "secret_word", platform: "medium", word: mediumWord })}
            >
              {c.tasks.medium.submit}
            </button>
          </li>
        </ul>

        <div className="mt-8 rounded-2xl border border-line bg-canvas-2 p-4">
          <h3 className="text-lg font-semibold text-ink">{c.referralTitle}</h3>
          <p className="mt-1 text-sm text-ink-2">
            {data.verifiedInvitees} verified invitees · up to {data.referralPplCap.toLocaleString("en")} PPL from bucket B
          </p>
          <p className="mt-1 text-xs text-ink-3">{c.referralCap}</p>
        </div>

        {data.leaderboard.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-ink">{c.leaderboardTitle}</h3>
            <p className="text-xs text-ink-3">{c.leaderboardNote}</p>
            <ol className="mt-3 space-y-1 text-sm text-ink-2">
              {data.leaderboard.slice(0, 10).map((row) => (
                <li key={row.rank}>
                  #{row.rank} Founder {row.founderNumber} — {row.verifiedInvitees} invitees, {row.questPoints} quest pts
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <details className="mt-8 rounded-2xl border border-line p-4">
          <summary className="cursor-pointer font-semibold text-ink">{c.rulesTitle}</summary>
          <p className="mt-3 whitespace-pre-line text-sm text-ink-2">{c.rulesBody}</p>
        </details>
      </div>
    </section>
  );
}

function TaskRow({ done, title, points }: { done: boolean; title: string; points: string }) {
  return (
    <li className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
      <span className="text-sm font-medium text-ink">{title}</span>
      <span className="text-sm text-ink-2">
        {points} pts {done ? "✓" : ""}
      </span>
    </li>
  );
}

function TaskHead({ done, title, points }: { done: boolean; title: string; points: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="text-xs text-ink-3">
        {points} {done ? "✓" : ""}
      </span>
    </div>
  );
}
