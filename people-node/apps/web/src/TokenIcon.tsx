interface TokenIconProps {
  className?: string;
  size?: number;
}

export function TokenIcon({ className = "", size = 18 }: TokenIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" fill="url(#pplGrad)" />
      <circle cx="16" cy="16" r="13.2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
      <path
        d="M9.5 10.5L15 22.5C15.35 23.25 16.45 23.25 16.8 22.5L22.5 10.5"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.8 16.5H20.2"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="pplGrad" x1="7" y1="6" x2="25" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#27b9a4" />
          <stop offset="1" stopColor="#0b5f54" />
        </linearGradient>
      </defs>
    </svg>
  );
}
