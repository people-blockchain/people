import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";

export function RoadmapPage() {
  const { t } = usePrefs();

  return (
    <>
      <PageMeta title={t.roadmapTitle} description={t.roadmapDescription} />

      <section className="card page-header">
        <h1>{t.roadmapTitle}</h1>
        <p className="lead">{t.roadmapDescription}</p>
      </section>

      <section className="card">
        <div className="roadmap">
          <div><strong>Q3</strong><p>{t.roadmapQ3}</p></div>
          <div><strong>Q4</strong><p>{t.roadmapQ4}</p></div>
          <div><strong>Q1</strong><p>{t.roadmapQ1}</p></div>
        </div>
        <div className="link-row">
          <Link to="/validators" className="cta button-link">{t.startNow}</Link>
          <Link to="/explorer" className="ghost button-link">{t.openExplorer}</Link>
        </div>
      </section>
    </>
  );
}
