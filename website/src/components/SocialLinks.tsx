import { SOCIAL_PROFILES, type SocialProfile } from "@/lib/social-profiles";

const iconClass = "h-[18px] w-[18px]";

function IconX() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.95 4.57a1.2 1.2 0 0 0-1.22-.15L2.36 11.37c-1.55.64-1.53 2.77.03 3.37l4.7 1.83 1.8 5.58c.42 1.31 2.23 1.6 3.08.48l2.75-3.58 5.14 3.79c1.11.82 2.69.2 2.92-1.26l3.12-18.01c.22-1.28-.97-2.33-2.09-1.82zM9.5 13.77l7.22-4.46-5.58 5.9-.28 3.04-1.36-4.48z"
      />
    </svg>
  );
}

function IconYouTube() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.58 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5.25 12 5.25 12 5.25s-6.25 0-7.82.18A2.5 2.5 0 0 0 2.42 7.2 26 26 0 0 0 2.25 12a26 26 0 0 0 .17 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 18.75 12 18.75 12 18.75s6.25 0 7.82-.18a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 21.75 12a26 26 0 0 0-.17-4.8zM10 15.5v-7l6 3.5-6 3.5z"
      />
    </svg>
  );
}

const ICONS = {
  x: IconX,
  telegram: IconTelegram,
  youtube: IconYouTube,
} as const;

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {SOCIAL_PROFILES.filter((profile): profile is SocialProfile & { id: keyof typeof ICONS } =>
        Object.hasOwn(ICONS, profile.id),
      ).map((profile) => {
        const Icon = ICONS[profile.id];
        return (
          <a
            key={profile.id}
            href={profile.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={profile.label}
            title={profile.label}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-brand"
          >
            <Icon />
          </a>
        );
      })}
    </div>
  );
}
