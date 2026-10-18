import { Helmet } from "react-helmet-async";
import { usePrefs } from "./PrefsContext.js";

interface PageMetaProps {
  title: string;
  description?: string;
}

export function PageMeta({ title, description }: PageMetaProps) {
  const { language, t } = usePrefs();
  const fullTitle = title.includes(t.title) ? title : `${title} — ${t.title}`;
  const desc = description ?? t.defaultDescription;

  return (
    <Helmet>
      <html lang={language} />
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="PEOPLE Network" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content="/og-cover.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
    </Helmet>
  );
}
