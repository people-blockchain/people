import { FOUNDER_STAKE_MIN_PPL, FOUNDER_SWAP_MIN_PPL } from "./config.ts";

export function swapMeetsMinimumAmount(amountPpl: number): boolean {
  return Number.isFinite(amountPpl) && amountPpl >= FOUNDER_SWAP_MIN_PPL;
}

export function stakeMeetsMinimumAmount(amountPpl: number): boolean {
  return Number.isFinite(amountPpl) && amountPpl >= FOUNDER_STAKE_MIN_PPL;
}

/** Undirected interaction graph: userId -> set of peer userIds (Discover authors). */
export type InteractionGraph = Map<string, Set<string>>;

function componentContaining(graph: InteractionGraph, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    const peers = graph.get(node);
    if (!peers) continue;
    for (const p of peers) {
      if (!seen.has(p)) stack.push(p);
    }
    for (const [other, set] of graph) {
      if (set.has(node) && !seen.has(other)) stack.push(other);
    }
  }
  return seen;
}

/**
 * True when the user's component is a closed clique (size ≥ 2) where every member
 * only interacts with others inside the component — no credit for in-group likes/follows.
 */
export function isClosedInteractionClique(
  graph: InteractionGraph,
  userId: string,
  targetPeerUserId: string,
): boolean {
  if (!userId || !targetPeerUserId || userId === targetPeerUserId) return false;
  const component = componentContaining(graph, userId);
  if (component.size < 2) return false;
  if (!component.has(targetPeerUserId)) return false;

  for (const member of component) {
    const peers = graph.get(member) ?? new Set<string>();
    for (const peer of peers) {
      if (!component.has(peer)) return false;
    }
    for (const [other, set] of graph) {
      if (!component.has(other)) continue;
      if (set.has(member) && !component.has(other)) return false;
    }
  }
  return true;
}

export function withinRegistrationCap(currentCount: number, max: number): boolean {
  return currentCount < max;
}
