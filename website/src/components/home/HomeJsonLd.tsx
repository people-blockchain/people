import { JsonLd } from "@/components/seo/JsonLd";
import {
  jsonLdGraph,
  mainnetBetaEventJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo/json-ld";

export function HomeJsonLd() {
  return (
    <JsonLd
      data={jsonLdGraph(organizationJsonLd(), webSiteJsonLd(), mainnetBetaEventJsonLd())}
    />
  );
}