export interface StatusSample {
  at: number;
  online: boolean;
  lag?: number;
  peers?: number;
  head?: number;
}

export interface StatusIncident {
  id: string;
  at: number;
  kind: "offline" | "degraded" | "recovered";
  detail: string;
}

const SAMPLES_KEY = "ovn-status-samples";
const INCIDENTS_KEY = "ovn-status-incidents";
const MAX_SAMPLES = 288; // ~24h if sampled every 5m
const MAX_INCIDENTS = 40;

export function loadStatusSamples(): StatusSample[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAMPLES_KEY) ?? "[]") as StatusSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadStatusIncidents(): StatusIncident[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(INCIDENTS_KEY) ?? "[]") as StatusIncident[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordStatusSample(sample: StatusSample): StatusSample[] {
  const next = [sample, ...loadStatusSamples()].slice(0, MAX_SAMPLES);
  localStorage.setItem(SAMPLES_KEY, JSON.stringify(next));
  return next;
}

export function recordStatusIncident(incident: Omit<StatusIncident, "id">): StatusIncident[] {
  const entry: StatusIncident = { ...incident, id: `${incident.at}-${incident.kind}` };
  const next = [entry, ...loadStatusIncidents().filter((item) => item.id !== entry.id)].slice(
    0,
    MAX_INCIDENTS
  );
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(next));
  return next;
}

export function uptimePercent(samples: StatusSample[], windowMs = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - windowMs;
  const windowed = samples.filter((item) => item.at >= cutoff);
  if (windowed.length === 0) {
    return 0;
  }
  const online = windowed.filter((item) => item.online).length;
  return (online / windowed.length) * 100;
}
