import { useId, useMemo } from "react";
import type { Block } from "@people/protocol";

interface ActivityChartProps {
  blocks: Block[];
  emptyLabel: string;
  blockLabel: string;
  txsLabel: string;
}

export function ActivityChart({ blocks, emptyLabel, blockLabel, txsLabel }: ActivityChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => a.header.height - b.header.height).slice(-12);
    return sorted.map((block) => ({
      height: block.header.height,
      txs: block.transactions.length
    }));
  }, [blocks]);

  if (points.length === 0) {
    return <p className="wallet-hint">{emptyLabel}</p>;
  }

  const width = 640;
  const height = 220;
  const padX = 28;
  const padTop = 18;
  const padBottom = 36;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;
  const maxTxs = Math.max(1, ...points.map((p) => p.txs));
  const gap = 8;
  const barW = Math.max(10, (chartW - gap * (points.length - 1)) / points.length);

  return (
    <div className="activity-chart" role="img" aria-label={txsLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="activity-chart__svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + chartH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              className="activity-chart__grid"
            />
          );
        })}
        {points.map((point, index) => {
          const barH = (point.txs / maxTxs) * chartH;
          const x = padX + index * (barW + gap);
          const y = padTop + chartH - barH;
          return (
            <g key={point.height}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={6}
                fill={`url(#${gradientId})`}
              >
                <title>
                  {blockLabel} #{point.height}: {point.txs} {txsLabel}
                </title>
              </rect>
              <text
                x={x + barW / 2}
                y={height - 14}
                textAnchor="middle"
                className="activity-chart__label"
              >
                {point.height}
              </text>
              {point.txs > 0 && (
                <text
                  x={x + barW / 2}
                  y={Math.max(padTop + 12, y - 6)}
                  textAnchor="middle"
                  className="activity-chart__value"
                >
                  {point.txs}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
