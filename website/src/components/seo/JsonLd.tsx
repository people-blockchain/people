type JsonLdProps = {
  data: Record<string, unknown>;
};

/** Inline JSON-LD for crawlers (same payload for bots and visitors — no cloaking). */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}