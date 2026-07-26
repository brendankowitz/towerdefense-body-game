import type { SimState } from './types';

/**
 * FNV-1a over a canonical field walk. Numbers are rounded to six decimals so the golden run
 * survives an engine upgrade while still failing on any real behavioural change — a 1e-6 shift
 * in a position is numeric noise, and a changed damage outcome is never that small.
 */
export function hashState(state: SimState): string {
  let hash = 0x811c9dc5;

  const mixText = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const mix = (value: number): void => {
    mixText(String(Math.round(value * 1e6)));
  };

  mixText(state.caseId);
  mixText(state.phase);
  mixText(state.result ?? 'none');
  mix(state.waveIndex);
  mix(state.energy);
  mix(state.tissue);
  mix(state.fever);
  mix(state.waveKills);
  mix(state.waveLeaks);
  mix(state.totalKills);
  mix(state.queue.length);
  mix(state.rngState);

  for (const tower of state.towers) {
    mixText(tower.kind);
    mix(tower.spotIndex);
    mix(tower.hp);
    mix(tower.stun);
    mix(tower.matured ? 1 : 0);
    switch (tower.kind) {
      case 'phago':
        mix(tower.digested);
        mix(tower.rest);
        mix(tower.holdingEnemyId ?? -1);
        break;
      case 'clot':
        break;
      case 'anti':
      case 'nk':
        mix(tower.cooldown);
        break;
      case 'mast':
        mix(tower.cooldown);
        mix(tower.flash);
        break;
      case 'mem':
        mix(tower.cooldown);
        mix(tower.xp);
        break;
    }
  }

  for (const enemy of state.enemies) {
    mixText(enemy.kind);
    mix(enemy.id);
    mix(enemy.distance);
    mix(enemy.hp);
    mix(enemy.tag);
    mix(enemy.generation);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
