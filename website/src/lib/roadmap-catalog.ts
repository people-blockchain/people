import catalog from "./roadmap-catalog.data.json" with { type: "json" };

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

export const roadmapCatalog: RoadmapCatalog = catalog as RoadmapCatalog;

export const ROADMAP_STATUS_ORDER: RoadmapStatus[] = [
  "done",
  "live_on_testnet",
  "in_progress",
  "proposed_pending_vote",
  "planned_unapproved",
];
