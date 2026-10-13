import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { useLive } from "../LiveContext.js";
import { showDevnetTools } from "../networkEnv.js";
import { InstallPwaButton } from "../InstallPwaButton.js";
import { TokenIcon } from "../TokenIcon.js";
import { ActivityChart } from "../components/ActivityChart.js";
import {
  IconAttest,
  IconFinalize,
  IconKey,
  IconOnline,
  IconPhone,
  IconReward,
  IconServer,
  IconStake,
  IconWallet,
  NetworkLoopDiagram
} from "../components/GuideIcons.js";

export function LandingPage() {
  const { t, language } = usePrefs();
  const { metrics, connected, headHeight, feed } = useLive();

  const height = connected ? String(headHeight || metrics?.height || "—") : "…";
  const finalized =
    connected && metrics?.finalizedHeight !== undefined
      ? String(metrics.finalizedHeight)
      : connected
        ? "—"
        : "…";
  const finalizedLag =
    connected && metrics?.finalizedLag !== undefined
      ? String(metrics.finalizedLag)
      : connected
        ? "—"
        : "…";
  const txCount = connected ? String(metrics?.transactionCount ?? "—") : "…";
  const validatorPayouts =
    connected && metrics?.totalValidatorRewards !== undefined
      ? `${metrics.totalValidatorRewards.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
          maximumFractionDigits: 2
        })} PPL`
      : connected
        ? "—"
        : "…";
  const validatorCount = connected ? String(metrics?.validators ?? "—") : "…";
  const tokenPrice =
    connected && metrics?.tokenPriceUsd !== undefined
      ? metrics.tokenPriceUsd.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 4
        })
      : connected
        ? "—"
        : "…";
  const throughput =
    connected && metrics?.maxThroughputTps !== undefined
      ? `~${metrics.maxThroughputTps.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
          maximumFractionDigits: 1
        })} ${t.throughputUnit}`
      : connected
        ? "—"
        : "…";

  return (
    <>
      <PageMeta title={t.title} description={t.defaultDescription} />

      <header className="hero hero--landing">
        <div className="hero-beacon">
          <p className="hero-beacon__label">{t.head}</p>
          <p className="hero-beacon__value">{height}</p>
          <p className="hero-beacon__meta">
            {t.finalized}: {finalized}
            {connected && metrics?.finalizedLag !== undefined ? ` · ${t.finalizedLag}: ${finalizedLag}` : ""}
          </p>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <p className="hero-stat__label">{t.tokenPrice}</p>
            <p className="hero-stat__value">{tokenPrice}</p>
            {showDevnetTools(metrics?.chainId) && (
              <p className="hero-stat__hint wallet-hint">{t.tokenPriceHint}</p>
            )}
          </div>
          <div className="hero-stat">
            <p className="hero-stat__label">{t.validatorsCount}</p>
            <p className="hero-stat__value">{validatorCount}</p>
          </div>
          <div className="hero-stat">
            <p className="hero-stat__label">{t.transactionsCount}</p>
            <p className="hero-stat__value">{txCount}</p>
          </div>
          <div className="hero-stat">
            <p className="hero-stat__label">{t.totalValidatorRewards}</p>
            <p className="hero-stat__value">{validatorPayouts}</p>
          </div>
        </div>

        <div className="hero-content">
          <p className="hero-brand">Open Validator Network</p>
          <h1 className="hero-title">{t.heroLead}</h1>
          <p className="lead">{t.subtitle}</p>
          <div className="hero-actions">
            <Link to="/validators" className="cta button-link">
              {t.startNow}
            </Link>
            <Link to="/wallet" className="ghost button-link">
              {t.wallet}
            </Link>
            <a href="#how-to-validate" className="button-link hero-guide-link">
              {t.guideTitle}
            </a>
          </div>
        </div>
      </header>

      <section className="card section-prose">
        <h2>{t.aboutNetworkTitle}</h2>
        <p className="lead">{t.aboutNetworkBody}</p>
        <p className="wallet-hint">{t.consensusNote}</p>
      </section>

      <section className="card activity-section">
        <div className="section-head">
          <div>
            <h2>{t.activityChartTitle}</h2>
            <p className="lead">{t.activityChartBody}</p>
          </div>
          <p className="activity-section__meta">
            {t.throughput}: <strong>{throughput}</strong>
          </p>
        </div>
        <ActivityChart
          blocks={feed?.blocks ?? []}
          emptyLabel={t.activityChartEmpty}
          blockLabel={t.block}
          txsLabel={t.activityChartTxs}
        />
      </section>

      <section className="section-signal">
        <h2>{t.joinTitle}</h2>
        <p className="lead">{t.joinBody}</p>
        <div className="feature-grid participate-grid">
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconWallet size={36} />
            </div>
            <h3>{t.pathWalletTitle}</h3>
            <p>{t.pathWalletBody}</p>
            <div className="link-row">
              <Link to="/wallet" className="cta button-link">
                {t.pathWalletCta}
              </Link>
            </div>
          </article>
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconPhone size={36} />
            </div>
            <h3>{t.pathLightTitle}</h3>
            <p>{t.pathLightBody}</p>
            <div className="link-row">
              <InstallPwaButton className="cta" />
              <Link to="/validators" className="ghost button-link">
                {t.launch}
              </Link>
              <Link to="/light" className="ghost button-link">
                {t.pathLightCta}
              </Link>
            </div>
          </article>
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconServer size={36} />
            </div>
            <h3>{t.pathFullTitle}</h3>
            <p>{t.pathFullBody}</p>
            <div className="link-row">
              <Link to="/validators" className="cta button-link">
                {t.pathFullCta}
              </Link>
              <Link to="/docs" className="ghost button-link">
                {t.docs}
              </Link>
            </div>
          </article>
        </div>
        <div className="card section-prose participate-watch">
          <h3>{t.pathWatchTitle}</h3>
          <p className="lead">{t.pathWatchBody}</p>
          <div className="link-row">
            <Link to="/explorer" className="ghost button-link">
              {t.openExplorer}
            </Link>
          </div>
        </div>
      </section>

      <section className="section-signal" id="how-it-works">
        <h2>{t.howItWorksTitle}</h2>
        <p className="lead">{t.howItWorksLead}</p>
        <NetworkLoopDiagram
          labels={{
            join: t.howFlowJoin,
            propose: t.howFlowPropose,
            attest: t.howFlowAttest,
            finalize: t.howFlowFinalize,
            earn: t.howFlowEarn
          }}
        />
        <div className="feature-grid">
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconStake size={36} />
            </div>
            <h3>{t.howStep1Title}</h3>
            <p>{t.howStep1Body}</p>
          </article>
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconAttest size={36} />
            </div>
            <h3>{t.howStep2Title}</h3>
            <p>{t.howStep2Body}</p>
          </article>
          <article className="feature-card">
            <div className="guide-card__icon">
              <IconFinalize size={36} />
            </div>
            <h3>{t.howStep3Title}</h3>
            <p>{t.howStep3Body}</p>
          </article>
        </div>
      </section>

      <section className="card guide-section" id="how-to-validate">
        <div className="section-head">
          <div>
            <h2>{t.guideTitle}</h2>
            <p className="lead">{t.guideLead}</p>
          </div>
          <div className="link-row">
            <Link to="/validators" className="cta button-link">
              {t.startNow}
            </Link>
            <Link to="/light" className="ghost button-link">
              {t.lightTitle}
            </Link>
          </div>
        </div>

        <ol className="guide-steps">
          <li className="guide-step">
            <IconKey size={40} />
            <div>
              <strong>{t.guideStep1Title}</strong>
              <p>{t.guideStep1Body}</p>
            </div>
          </li>
          <li className="guide-step">
            <IconStake size={40} />
            <div>
              <strong>{t.guideStep2Title}</strong>
              <p>{t.guideStep2Body}</p>
            </div>
          </li>
          <li className="guide-step">
            <IconReward size={40} />
            <div>
              <strong>{t.guideStep3Title}</strong>
              <p>{t.guideStep3Body}</p>
            </div>
          </li>
          <li className="guide-step">
            <IconOnline size={40} />
            <div>
              <strong>{t.guideStep4Title}</strong>
              <p>{t.guideStep4Body}</p>
            </div>
          </li>
        </ol>

        <div className="guide-split">
          <article className="guide-path">
            <IconPhone size={36} />
            <h3>{t.guideLightTitle}</h3>
            <p>{t.guideLightBody}</p>
            <div className="link-row">
              <InstallPwaButton className="ghost" />
              <Link to="/light" className="ghost button-link">
                {t.pathLightCta}
              </Link>
            </div>
          </article>
          <article className="guide-path">
            <IconServer size={36} />
            <h3>{t.guideFullTitle}</h3>
            <p>{t.guideFullBody}</p>
            <div className="link-row">
              <Link to="/validators" className="ghost button-link">
                {t.pathFullCta}
              </Link>
              <Link to="/docs" className="ghost button-link">
                {t.docs}
              </Link>
            </div>
          </article>
        </div>

        <div className="guide-needs">
          <h3>{t.guideNeedTitle}</h3>
          <ul className="guide-needs__list">
            <li>
              <IconStake size={22} />
              <span>{t.guideNeedStake}</span>
            </li>
            <li>
              <IconKey size={22} />
              <span>{t.guideNeedKey}</span>
            </li>
            <li>
              <IconOnline size={22} />
              <span>{t.guideNeedOnline}</span>
            </li>
            <li>
              <IconServer size={22} />
              <span>{t.guideNeedNode}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="section-signal">
        <h2>{t.why}</h2>
        <div className="metrics-row">
          <div className="metric">
            <strong>
              {connected && metrics?.tokenPriceUsd !== undefined
                ? metrics.tokenPriceUsd.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })
                : connected
                  ? "—"
                  : "…"}
            </strong>
            <span>{t.tokenPrice}</span>
          </div>
          <div className="metric">
            <strong>{connected ? String(metrics?.validators ?? "—") : "…"}</strong>
            <span>{t.validatorsCount}</span>
          </div>
          <div className="metric">
            <strong>{connected ? String(metrics?.transactionCount ?? "—") : "…"}</strong>
            <span>{t.transactionsCount}</span>
          </div>
          <div className="metric">
            <strong>
              {connected && metrics?.totalValidatorRewards !== undefined
                ? `${metrics.totalValidatorRewards.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
                    maximumFractionDigits: 1
                  })} PPL`
                : connected
                  ? "—"
                  : "…"}
            </strong>
            <span>{t.totalValidatorRewards}</span>
          </div>
          <div className="metric">
            <strong>{connected ? String(metrics?.activeValidators ?? "—") : "…"}</strong>
            <span>{t.activeValidators}</span>
          </div>
          <div className="metric">
            <strong>{connected ? String(metrics?.peerCount ?? "—") : "…"}</strong>
            <span>{t.peers}</span>
          </div>
          <div className="metric">
            <strong>{connected ? String(metrics?.mempoolSize ?? "—") : "…"}</strong>
            <span>{t.mempool}</span>
          </div>
        </div>
      </section>

      <section className="card section-prose">
        <h2>{t.tokenTitle}</h2>
        <div className="token-badge">
          <TokenIcon size={24} />
          <strong>People (PPL)</strong>
        </div>
        <p className="lead">{t.tokenBody}</p>
        <div className="link-row">
          <Link to="/explorer" className="ghost button-link">
            {t.openExplorer}
          </Link>
          <Link to="/staking" className="ghost button-link">
            {t.staking}
          </Link>
        </div>
      </section>

      <section className="section-signal">
        <h2>{t.featuresTitle}</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <h3>{t.openAccess}</h3>
            <p>{t.openAccessDesc}</p>
          </article>
          <article className="feature-card">
            <h3>{t.builtInSecurity}</h3>
            <p>{t.builtInSecurityDesc}</p>
          </article>
          <article className="feature-card">
            <h3>{t.operatorUx}</h3>
            <p>{t.operatorUxDesc}</p>
          </article>
        </div>
      </section>
    </>
  );
}
