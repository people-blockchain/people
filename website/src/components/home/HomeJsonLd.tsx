import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { SOCIAL_SAME_AS } from "@/lib/social-profiles";

export function HomeJsonLd() {
  const payload = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    sameAs: SOCIAL_SAME_AS,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
