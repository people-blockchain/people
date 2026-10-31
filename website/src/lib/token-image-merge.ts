type ImageRow = {
  imageUri?: string;
  creationMetadata?: { image?: unknown; [key: string]: unknown };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Later catalog rows replace earlier ones, except a known image must survive an empty refresh.
 * The same rule is used by the server merge and the browser list cache.
 */
export function withStableImage<T extends ImageRow>(previous: T | undefined, next: T): T {
  if (!previous) return next;
  const imageUri = text(next.imageUri) || text(previous.imageUri);
  const image =
    text(next.creationMetadata?.image) || text(previous.creationMetadata?.image) || imageUri;
  if (!imageUri && !image) return next;
  return {
    ...next,
    ...(imageUri ? { imageUri } : {}),
    creationMetadata: {
      ...(previous.creationMetadata ?? {}),
      ...(next.creationMetadata ?? {}),
      ...(image ? { image } : {}),
    },
  };
}
