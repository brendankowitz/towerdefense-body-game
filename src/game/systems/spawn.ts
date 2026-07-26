import { CASE_BY_ID } from '../content/cases';
import { PATHOGENS } from '../content/pathogens';
import {
  IMMUNITY_MAX,
  SPAWN_BASE_INTERVAL,
  SPAWN_INTERVAL_PER_WAVE,
  SPAWN_MIN_INTERVAL,
} from '../content/rules';
import { positionAt } from '../path';
import { createRng, waveSeed } from '../rng';
import type { PathogenKind, SimState } from '../types';

/** Entries are expanded in wave-table order, then shuffled with the wave's own seeded generator. */
export function buildQueue(state: SimState): PathogenKind[] {
  const wave = CASE_BY_ID[state.caseId].waves[state.waveIndex] ?? [];
  const queue: PathogenKind[] = [];
  for (const entry of wave) {
    for (let i = 0; i < entry.count; i += 1) queue.push(entry.kind);
  }

  const rng = createRng(waveSeed(state.caseId, state.waveIndex));
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = queue[i];
    const b = queue[j];
    if (a === undefined || b === undefined) continue;
    queue[i] = b;
    queue[j] = a;
  }
  state.rngState = rng.state;

  return queue;
}

function spawnInterval(waveIndex: number): number {
  return Math.max(SPAWN_MIN_INTERVAL, SPAWN_BASE_INTERVAL - waveIndex * SPAWN_INTERVAL_PER_WAVE);
}

export function applySpawn(state: SimState, dt: number): void {
  if (state.queue.length === 0) return;

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const kind = state.queue.shift();
  if (kind === undefined) return;

  // Decision D2: the spent marker is sim state, so a replayed case gets its bounce back.
  const bounced =
    state.rule === 'wound' &&
    kind === 'staph' &&
    state.immunity.staph >= IMMUNITY_MAX &&
    state.shieldedWave !== state.waveIndex;

  if (bounced) {
    state.shieldedWave = state.waveIndex;
  } else {
    const stats = PATHOGENS[kind];
    const [x, y] = positionAt(state.path, 0);
    state.enemies.push({
      id: state.nextEnemyId,
      kind,
      distance: 0,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      tag: 0,
      generation: 0,
    });
    state.nextEnemyId += 1;
  }

  state.spawnTimer = spawnInterval(state.waveIndex);
}
