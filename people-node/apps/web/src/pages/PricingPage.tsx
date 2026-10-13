import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";

export function PricingPage() {
  const { t } = usePrefs();

  return (
    <>
      <PageMeta title={t.pricingTitle} description={t.pricingDescription} />

      <section className="card page-header">
        <h1>{t.pricingTitle}</h1>
        <p className="lead">{t.pricingDescription}</p>
      </section>

      <section className="feature-grid">
        <article className="feature-card pricing">
          <p className="pricing-tier">{t.pricingForIndividuals}</p>
          <h3>{t.starter}</h3>
          <p className="price">$0</p>
          <p>{t.starterDesc}</p>
          <ul className="pricing-list">
            <li>{t.pricingStarterFeature1}</li>
            <li>{t.pricingStarterFeature2}</li>
            <li>{t.pricingStarterFeature3}</li>
          </ul>
          <Link to="/explorer" className="ghost button-link">
            {t.openExplorer}
          </Link>
        </article>
        <article className="feature-card pricing pricing--featured">
          <p className="pricing-badge">{t.pricingRecommended}</p>
          <p className="pricing-tier">{t.pricingForValidators}</p>
          <h3>{t.operator}</h3>
          <p className="price">{t.stakeBased}</p>
          <p>{t.operatorDesc}</p>
          <ul className="pricing-list">
            <li>{t.pricingOperatorFeature1}</li>
            <li>{t.pricingOperatorFeature2}</li>
            <li>{t.pricingOperatorFeature3}</li>
          </ul>
          <Link to="/validators" className="cta button-link">
            {t.startNow}
          </Link>
        </article>
        <article className="feature-card pricing">
          <p className="pricing-tier">{t.pricingForTeams}</p>
          <h3>{t.ecosystem}</h3>
          <p className="price">{t.open}</p>
          <p>{t.ecosystemDesc}</p>
          <ul className="pricing-list">
            <li>{t.pricingEcosystemFeature1}</li>
            <li>{t.pricingEcosystemFeature2}</li>
            <li>{t.pricingEcosystemFeature3}</li>
          </ul>
          <Link to="/roadmap" className="ghost button-link">
            {t.viewRoadmap}
          </Link>
        </article>
      </section>

      <section className="card pricing-note">
        <h2>{t.pricingNoteTitle}</h2>
        <p>{t.pricingNoteBody}</p>
        <div className="link-row">
          <Link to="/wallet" className="ghost button-link">
            {t.wallet}
          </Link>
          <Link to="/validators" className="cta button-link">
            {t.connectValidator}
          </Link>
        </div>
      </section>
    </>
  );
}
