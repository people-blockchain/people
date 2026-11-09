"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#4f46e5"];

export function TimeSeriesArea({
  data,
  dataKey,
  label,
}: {
  data: { bucket: string; [k: string]: string | number }[];
  dataKey: string;
  label: string;
}) {
  if (!data.length) return <p className="text-xs text-ink-3">No data in range.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Area type="monotone" dataKey={dataKey} name={label} stroke="#2563eb" fill="#93c5fd" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  xKey,
  yKey,
  layout = "vertical",
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  layout?: "vertical" | "horizontal";
}) {
  if (!data.length) return <p className="text-xs text-ink-3">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.min(360, 40 + data.length * 22)}>
      <BarChart data={data} layout={layout === "horizontal" ? "vertical" : "horizontal"} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        {layout === "horizontal" ? (
          <>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey={xKey} width={120} tick={{ fontSize: 10 }} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
          </>
        )}
        <Tooltip />
        <Bar dataKey={yKey} fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimplePieChart({ data, nameKey, valueKey }: { data: Record<string, string | number>[]; nameKey: string; valueKey: string }) {
  if (!data.length) return <p className="text-xs text-ink-3">No data.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} outerRadius={90} label={(e) => String(e[nameKey]).slice(0, 12)}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FunnelChart({ steps }: { steps: { step: string; count: number; rateFromPrevious: number | null }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.step}>
          <div className="flex justify-between text-xs text-ink-2">
            <span>{s.step}</span>
            <span>
              {s.count.toLocaleString()}
              {s.rateFromPrevious != null ? ` (${(s.rateFromPrevious * 100).toFixed(1)}%)` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 rounded bg-surface-2">
            <div className="h-2 rounded bg-brand" style={{ width: `${(s.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
