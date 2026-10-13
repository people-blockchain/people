import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderDiscoverPeers } from "@/db/schema";
import { type InteractionGraph, isClosedInteractionClique } from "./antibot.ts";

export async function recordDiscoverPeer(userId: string, peerUserId: string | null | undefined) {
  if (!peerUserId || peerUserId === userId) return;
  const db = await getDbReady();
  await db
    .insert(founderDiscoverPeers)
    .values({ userId, peerUserId })
    .onConflictDoNothing();
}

export async function loadInteractionGraph(userId: string): Promise<InteractionGraph> {
  const db = await getDbReady();
  const rows = await db.select().from(founderDiscoverPeers).where(eq(founderDiscoverPeers.userId, userId));
  const graph: InteractionGraph = new Map();
  for (const row of rows) {
    if (!graph.has(row.userId)) graph.set(row.userId, new Set());
    graph.get(row.userId)!.add(row.peerUserId);
  }
  const reverse = await db
    .select()
    .from(founderDiscoverPeers)
    .where(eq(founderDiscoverPeers.peerUserId, userId));
  for (const row of reverse) {
    if (!graph.has(row.userId)) graph.set(row.userId, new Set());
    graph.get(row.userId)!.add(row.peerUserId);
    if (!graph.has(row.peerUserId)) graph.set(row.peerUserId, new Set());
    graph.get(row.peerUserId)!.add(row.userId);
  }
  return graph;
}

export async function shouldBlockDiscoverPoints(
  userId: string,
  projectAuthorUserId: string | null | undefined,
): Promise<boolean> {
  if (!projectAuthorUserId) return false;
  await recordDiscoverPeer(userId, projectAuthorUserId);
  const graph = await loadInteractionGraph(userId);
  return isClosedInteractionClique(graph, userId, projectAuthorUserId);
}
