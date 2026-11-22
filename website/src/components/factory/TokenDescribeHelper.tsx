"use client";

import { DescribeHelper, type DescribeHelperPayload } from "@/components/factory/DescribeHelper";
import type { PromoBps } from "@/lib/token-promo";

type PricePayload = {
  spotPplPerWholeToken: number;
  spotPplFormatted: string;
  bondingCurveWholeTokens: string;
  virtualNativePpl: number;
};

type ApplyPayload = {
  name: string;
  symbol: string;
  supply: string;
  rationale: string;
  warnings: string[];
  price: PricePayload;
  source: string;
};

type Props = {
  promoBps?: PromoBps;
  onApply: (payload: ApplyPayload) => void;
};

export function TokenDescribeHelper({ promoBps = 0, onApply }: Props) {
  return (
    <DescribeHelper
      kind="token"
      extraBody={{ promoBps }}
      onApply={(payload: DescribeHelperPayload) => {
        const price = payload.price;
        if (!price) return;
        onApply({
          name: String(payload.name ?? ""),
          symbol: String(payload.symbol ?? ""),
          supply: String(payload.supply ?? ""),
          rationale: String(payload.rationale ?? ""),
          warnings: payload.warnings ?? [],
          price,
          source: String(payload.source ?? ""),
        });
      }}
    />
  );
}
