import { BODY_LINKS, BODY_NODES } from './content/body';
import type { BodyNodeId } from './types';

/**
 * The body as a graph, which is what the front line walks over.
 *
 * Built once at module load from `BODY_LINKS`, because the body does not change during a run and
 * the sickness asks these questions every day. Lives beside `progression.ts` rather than in
 * `content/` for the same reason `coverage.ts` does: it is a fact derived from content, not content.
 */
const ADJACENCY: ReadonlyMap<BodyNodeId, readonly BodyNodeId[]> = (() => {
  const map = new Map<BodyNodeId, BodyNodeId[]>();
  for (const node of BODY_NODES) map.set(node.id, []);
  for (const [from, to] of BODY_LINKS) {
    map.get(from)?.push(to);
    map.get(to)?.push(from);
  }
  return map;
})();

export function neighboursOf(node: BodyNodeId): readonly BodyNodeId[] {
  return ADJACENCY.get(node) ?? [];
}

/** The core, and the thing every distance here is measured to. */
const CORE: BodyNodeId = 'heart';

/**
 * Steps from each node to the core, breadth-first. Infinity for a node the links never reach,
 * which `graph.test.ts` refuses to allow — an unreachable region is one the sickness can never
 * take and the player can therefore never lose.
 */
const DISTANCE: ReadonlyMap<BodyNodeId, number> = (() => {
  const distance = new Map<BodyNodeId, number>([[CORE, 0]]);
  const queue: BodyNodeId[] = [CORE];
  let current: BodyNodeId | undefined;
  while ((current = queue.shift()) !== undefined) {
    const step = (distance.get(current) ?? 0) + 1;
    for (const next of neighboursOf(current)) {
      if (distance.has(next)) continue;
      distance.set(next, step);
      queue.push(next);
    }
  }
  return distance;
})();

export function stepsToCore(node: BodyNodeId): number {
  return DISTANCE.get(node) ?? Number.POSITIVE_INFINITY;
}

/**
 * Every road to the core. The heart falls when the sickness holds all of them at once — not to a
 * single breach and not to a countdown, which is what makes the run a campaign and gives the
 * player one defensive rule they can hold in their head: keep a road open.
 */
export const CORE_ROADS: readonly BodyNodeId[] = neighboursOf(CORE);
