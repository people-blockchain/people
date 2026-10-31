type ImageRow = {
  imageUri?: string;
  creationMetadata?: { image?: unknown; [key: string]: unknown };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const METADATA_DOCUMENT = /\/metadata\.json(?:[?#].*)?$/i;

function picture(value: string): string {
  return value && !METADATA_DOCUMENT.test(value) ? value : "";
}

/**
 * Later catalog rows replace earlier ones, except a known image must survive an empty refresh.
 * A metadata document URL is only a placeholder until the JSON `image` is known.
 */
export function withStableImage<T extends ImageRow>(previous: T | undefined, next: T): T {
  if (!previous) return next;
  const imageUri = picture(text(next.imageUri)) || picture(text(previous.imageUri)) || text(next.imageUri) || text(previous.imageUri);
  const image =
    picture(text(next.creationMetadata?.image)) ||
    picture(text(previous.creationMetadata?.image)) ||
    text(next.creationMetadata?.image) ||
    text(previous.creationMetadata?.image) ||
    imageUri;
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
