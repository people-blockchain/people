import catalog from "./roadmap-catalog.data.json" with { type: "json" };
import { PREDICT_ENABLED } from "./features";

export type RoadmapStatus =
  | "done"
  | "live_on_testnet"
  | "in_progress"
  | "proposed_pending_vote"
  | "planned_unapproved";

export type RoadmapCatalogItem = {
  id: string;
  status: RoadmapStatus;
  evidence: string;
};

export type RoadmapCatalog = {
  version: number;
  updated: string;
  statusVocabulary: Record<RoadmapStatus, string>;
  items: RoadmapCatalogItem[];
};

// hidden: PeoplePredict (feature flag) — the roadmap entry stays in the JSON
// and locale files; it is only filtered out of the public catalog while the
// flag is off.
const HIDDEN_ROADMAP_ITEM_IDS = new Set<string>(PREDICT_ENABLED ? [] : ["people-predict-testnet-mvp"]);

export const roadmapCatalog: RoadmapCatalog = {
  ...(catalog as RoadmapCatalog),
  items: (catalog as RoadmapCatalog).items.filter((item) => !HIDDEN_ROADMAP_ITEM_IDS.has(item.id)),
};

export const ROADMAP_STATUS_ORDER: RoadmapStatus[] = [
  "done",
  "live_on_testnet",
  "in_progress",
  "proposed_pending_vote",
  "planned_unapproved",
];
