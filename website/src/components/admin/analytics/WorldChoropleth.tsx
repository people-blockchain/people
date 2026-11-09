"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export function WorldChoropleth({
  values,
}: {
  values: { countryCode: string; sessions: number }[];
}) {
  const max = Math.max(1, ...values.map((v) => v.sessions));
  const byIso = new Map(values.map((v) => [v.countryCode.toUpperCase(), v.sessions]));

  return (
    <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={360} className="w-full">
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const iso = (geo.properties as { ISO_A2?: string }).ISO_A2 ?? "";
            const sessions = byIso.get(iso) ?? 0;
            const intensity = sessions / max;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={sessions ? `rgba(37, 99, 235, ${0.15 + intensity * 0.85})` : "#e5e7eb"}
                stroke="#fff"
                strokeWidth={0.4}
                style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
