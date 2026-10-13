import type { ReactNode } from "react";

interface GuideIconProps {
  className?: string;
  size?: number;
}

function IconShell({
  className = "",
  size = 28,
  children
}: GuideIconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconKey({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <circle cx="16" cy="20" r="5" stroke="var(--primary-strong)" strokeWidth="2" />
      <path
        d="M20.5 20H31v3.5h-3V27h-3.5v-3.5H24"
        stroke="var(--primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconShell>
  );
}

export function IconStake({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <path
        d="M13 27V15.5L20 11l7 4.5V27"
        stroke="var(--primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 21h14" stroke="var(--primary-strong)" strokeWidth="2" strokeLinecap="round" />
    </IconShell>
  );
}

export function IconPhone({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <rect
        x="14"
        y="10"
        width="12"
        height="20"
        rx="2.5"
        stroke="var(--primary-strong)"
        strokeWidth="2"
      />
      <path d="M17.5 27h5" stroke="var(--primary-strong)" strokeWidth="2" strokeLinecap="round" />
    </IconShell>
  );
}

export function IconServer({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <rect x="11" y="12" width="18" height="7" rx="1.5" stroke="var(--primary-strong)" strokeWidth="2" />
      <rect x="11" y="21" width="18" height="7" rx="1.5" stroke="var(--primary-strong)" strokeWidth="2" />
      <circle cx="15" cy="15.5" r="1.2" fill="var(--primary-strong)" />
      <circle cx="15" cy="24.5" r="1.2" fill="var(--primary-strong)" />
    </IconShell>
  );
}

export function IconWallet({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <rect x="11" y="14" width="18" height="13" rx="2" stroke="var(--primary-strong)" strokeWidth="2" />
      <path d="M11 17.5h18" stroke="var(--primary-strong)" strokeWidth="2" />
      <circle cx="24.5" cy="22.5" r="1.4" fill="var(--primary-strong)" />
    </IconShell>
  );
}

export function IconAttest({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <path
        d="M13 20.5l4.2 4.2L27 14.5"
        stroke="var(--primary-strong)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconShell>
  );
}

export function IconFinalize({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <circle cx="20" cy="20" r="8" stroke="var(--primary-strong)" strokeWidth="2" />
      <path
        d="M20 14v6l4 2.5"
        stroke="var(--primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconShell>
  );
}

export function IconReward({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <circle cx="20" cy="20" r="8" stroke="var(--primary-strong)" strokeWidth="2" />
      <path
        d="M20 14.5v11M16.5 17.2c.8-1 2-1.5 3.5-1.5 2 0 3.5 1 3.5 2.5S22.5 21 20 21s-3.5.8-3.5 2.3 1.6 2.5 3.8 2.5c1.4 0 2.5-.5 3.2-1.4"
        stroke="var(--primary-strong)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </IconShell>
  );
}

export function IconOnline({ className, size }: GuideIconProps) {
  return (
    <IconShell className={className} size={size}>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--primary-soft)" />
      <path
        d="M12 22c2.2-2.2 5-3.4 8-3.4s5.8 1.2 8 3.4"
        stroke="var(--primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14.8 18.5c1.5-1.4 3.3-2.1 5.2-2.1s3.7.7 5.2 2.1"
        stroke="var(--primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="25.5" r="1.6" fill="var(--primary-strong)" />
    </IconShell>
  );
}

/** Compact SVG illustration of the network loop for the guide section. */
export function NetworkLoopDiagram({
  labels
}: {
  labels: { join: string; propose: string; attest: string; finalize: string; earn: string };
}) {
  return (
    <div className="guide-diagram" role="img" aria-label={`${labels.join} → ${labels.earn}`}>
      <svg className="guide-diagram__svg" viewBox="0 0 720 180" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="guideFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.15" />
          </linearGradient>
          <marker id="guideArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--primary)" />
          </marker>
        </defs>
        <rect x="8" y="28" width="704" height="100" rx="20" fill="url(#guideFlow)" />
        {[
          { x: 72, label: labels.join },
          { x: 216, label: labels.propose },
          { x: 360, label: labels.attest },
          { x: 504, label: labels.finalize },
          { x: 648, label: labels.earn }
        ].map((node, index, arr) => (
          <g key={node.label}>
            {index < arr.length - 1 && (
              <line
                x1={node.x + 36}
                y1={78}
                x2={arr[index + 1]!.x - 36}
                y2={78}
                stroke="var(--primary)"
                strokeWidth="2"
                strokeDasharray="4 5"
                markerEnd="url(#guideArrow)"
              />
            )}
            <circle cx={node.x} cy={78} r="28" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
            <text
              x={node.x}
              y={84}
              textAnchor="middle"
              fill="var(--primary-strong)"
              fontSize="15"
              fontFamily="var(--font-mono)"
              fontWeight="600"
            >
              {index + 1}
            </text>
            <text
              x={node.x}
              y="148"
              textAnchor="middle"
              fill="var(--text)"
              fontSize="13"
              fontFamily="var(--font-body)"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
