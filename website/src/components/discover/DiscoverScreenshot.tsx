import Image from "next/image";
import { resolveScreenshotUrl } from "@/lib/discover/screenshots";

function isOptimizableScreenshotUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "www.peopleblockchain.network" ||
      host === "peopleblockchain.network" ||
      host.endsWith(".vercel.app") ||
      host.endsWith(".ipfs.dweb.link") ||
      host.endsWith(".ipfs.w3s.link") ||
      host === "ipfs.io"
    );
  } catch {
    return false;
  }
}

export function DiscoverScreenshot({ uri }: { uri: string }) {
  const src = resolveScreenshotUrl(uri);
  const optimizable = isOptimizableScreenshotUrl(src);

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      {optimizable ? (
        <Image
          src={src}
          alt=""
          width={640}
          height={360}
          className="aspect-video w-full object-cover"
          sizes="(max-width: 640px) 100vw, 320px"
          loading="lazy"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={640}
          height={360}
          className="aspect-video w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
    </li>
  );
}
