"use client";

import { useMemo } from "react";

function hueFromByte(byte: number) {
  return Math.floor((byte / 255) * 360);
}

/** Deterministic 4×4 identicon from an EVM address (no external deps). */
export function WalletIdenticon({ address, size = 20 }: { address: string; size?: number }) {
  const cells = useMemo(() => {
    const hex = address.replace(/^0x/i, "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < 16; i++) {
      bytes.push(parseInt(hex.slice(i * 2, i * 2 + 2) || "00", 16));
    }
    const h1 = hueFromByte(bytes[0]);
    const h2 = hueFromByte(bytes[1]);
    const grid: boolean[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        const on = (bytes[2 + row] >> col) & 1;
        grid.push(Boolean(on));
      }
    }
    return { h1, h2, grid };
  }, [address]);

  const cell = size / 4;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 rounded-md"
      aria-hidden="true"
    >
      {cells.grid.map((on, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const mirrorCol = 3 - col;
        const fill = on ? `hsl(${cells.h1} 65% 45%)` : `hsl(${cells.h2} 55% 72%)`;
        return (
          <g key={i}>
            <rect x={col * cell} y={row * cell} width={cell} height={cell} fill={fill} />
            <rect x={mirrorCol * cell} y={row * cell} width={cell} height={cell} fill={fill} />
          </g>
        );
      })}
    </svg>
  );
}
