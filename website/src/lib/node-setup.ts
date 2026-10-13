import {
  DEFAULT_PUBLIC_NODE_IMAGE,
  DEFAULT_PUBLIC_NODE_NETWORK_URL,
} from "./public-node-defaults.ts";

/** Release settings: env overrides, then verified built-in defaults. */
export function publicNodeSetup(env: {
  PUBLIC_NODE_IMAGE?: string;
  PUBLIC_NODE_NETWORK_URL?: string;
}) {
  const image = (env.PUBLIC_NODE_IMAGE ?? "").trim() || DEFAULT_PUBLIC_NODE_IMAGE;
  const endpoint =
    (env.PUBLIC_NODE_NETWORK_URL ?? "").trim() || DEFAULT_PUBLIC_NODE_NETWORK_URL;
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(image)) {
    return { available: false as const };
  }
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[a-zA-Z0-9:/._-]+$/.test(endpoint)
    ) {
      return { available: false as const };
    }
  } catch {
    return { available: false as const };
  }
  return {
    available: true as const,
    image,
    endpoint,
    command: `docker run -d --name people-node --restart unless-stopped -p 127.0.0.1:4001:4001 -v people-node-data:/data -e NODE_NETWORK_URL=${endpoint} ${image}`,
  };
}

export function resolvePublicNodeSetup(env?: {
  PUBLIC_NODE_IMAGE?: string;
  PUBLIC_NODE_NETWORK_URL?: string;
}) {
  return publicNodeSetup(env ?? {});
}
