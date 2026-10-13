"use client";

/**
 * Code-splits the chart components into their own chunk so the initial
 * /litepaper bundle stays small — each wrapper below resolves the same
 * module specifier, so webpack emits one shared chunk fetched once.
 */
import dynamic from "next/dynamic";

export const LitepaperAllocationDonut = dynamic(() =>
  import("./LitepaperCharts").then((m) => m.LitepaperAllocationDonut),
);
export const FeeFlowDiagram = dynamic(() => import("./LitepaperCharts").then((m) => m.FeeFlowDiagram));
export const BuybackLoop = dynamic(() => import("./LitepaperCharts").then((m) => m.BuybackLoop));
export const TeamVestingChart = dynamic(() => import("./LitepaperCharts").then((m) => m.TeamVestingChart));
export const FoundersPayoutBar = dynamic(() => import("./LitepaperCharts").then((m) => m.FoundersPayoutBar));
export const RoadmapTimeline = dynamic(() => import("./LitepaperCharts").then((m) => m.RoadmapTimeline));
export const VerificationLevels = dynamic(() => import("./LitepaperCharts").then((m) => m.VerificationLevels));
export const DifferTable = dynamic(() => import("./LitepaperCharts").then((m) => m.DifferTable));
