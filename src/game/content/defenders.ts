import type { DefenderKind, PaletteToken } from '../types';
import { TAG_REWARD_MULTIPLIER } from './rules';

interface DefenderBase {
  readonly cost: number;
  readonly range: number;
  readonly label: string;
  readonly unlock: number;
  readonly token: PaletteToken;
}

export type DefenderStats =
  | (DefenderBase & { readonly kind: 'phago'; readonly dps: number; readonly gap: number; readonly streak: number; readonly rest: number })
  | (DefenderBase & { readonly kind: 'clot'; readonly slow: number; readonly wear: number })
  | (DefenderBase & { readonly kind: 'anti'; readonly rate: number; readonly tag: number; readonly dot: number })
  | (DefenderBase & { readonly kind: 'nk'; readonly rate: number; readonly dmg: number; readonly execute: number })
  | (DefenderBase & { readonly kind: 'mast'; readonly rate: number; readonly dmg: number })
  | (DefenderBase & { readonly kind: 'mem'; readonly rate: number; readonly dmg: number; readonly learn: number; readonly cap: number });

export const DEFENDERS: { readonly [K in DefenderKind]: Extract<DefenderStats, { kind: K }> } = {
  phago: { kind: 'phago', cost: 40, range: 74, dps: 15, gap: 0.7, streak: 4, rest: 3.4, label: 'Engulf', unlock: 0, token: 'frontline' },
  clot: { kind: 'clot', cost: 70, range: 76, slow: 0.28, wear: 6, label: 'Block', unlock: 0, token: 'control' },
  anti: { kind: 'anti', cost: 95, range: 94, rate: 1.5, tag: 10, dot: 6, label: 'Tag', unlock: 0, token: 'support' },
  nk: { kind: 'nk', cost: 130, range: 78, rate: 2.4, dmg: 58, execute: 0.35, label: 'Execute', unlock: 0, token: 'execute' },
  mast: { kind: 'mast', cost: 150, range: 72, rate: 1.1, dmg: 11, label: 'Burst', unlock: 0, token: 'burst' },
  mem: { kind: 'mem', cost: 175, range: 82, rate: 1.3, dmg: 12, learn: 2.5, cap: 46, label: 'Learn', unlock: 1, token: 'learn' },
};

/** Dock order, left to right. Prototype line 374. */
export const DEFENDER_ORDER: readonly DefenderKind[] = ['phago', 'clot', 'anti', 'nk', 'mast', 'mem'];

/**
 * Brief-screen copy, prototype lines 1074–1081. The clot entry departs from the prototype's
 * wording deliberately: load-proportional wear (spec §5.1) is kept and stated here rather than
 * left as an emergent surprise.
 */
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const;

function countWord(value: number): string {
  return COUNT_WORDS[value] ?? String(value);
}

function percent(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

function unlockSentence(unlock: number): string {
  if (unlock <= 0) return '';
  const cases = unlock === 1 ? 'case' : 'cases';
  return ` Clear ${countWord(unlock)} ${cases} to unlock.`;
}

/**
 * Brief-screen copy, prototype lines 1074–1081. Every number here is interpolated from the
 * stat it describes: content values are tunable, and copy that quotes a stale one lies to the
 * player. The clot entry departs from the prototype's wording deliberately — load-proportional
 * wear (spec §5.1) is stated rather than left as an emergent surprise.
 */
export const DEFENDER_BLURBS: { readonly [K in DefenderKind]: { readonly name: string; readonly text: string } } = {
  phago: {
    name: 'Phagocyte · engulf',
    text: `Digests one at a time, then tires — ${countWord(DEFENDERS.phago.streak)} and it rests.`,
  },
  clot: {
    name: 'Clot · block',
    text: 'Everything crawls through, and every body inside wears it down — a crowd destroys it fast. Stops bleeding.',
  },
  anti: {
    name: 'Antibody · tag',
    text: `Kills little. Marked: no armour, slow burn, +${percent(TAG_REWARD_MULTIPLIER - 1)} energy.`,
  },
  nk: {
    name: 'Killer cell · execute',
    text: `Slow, heavy hit on the most wounded thing. Finishes anything under ${percent(DEFENDERS.nk.execute)}.`,
  },
  mast: {
    name: 'Mast cell · burst',
    text: `Hits everything close at once — double damage on tagged.${unlockSentence(DEFENDERS.mast.unlock)}`,
  },
  mem: {
    name: 'Memory cell · learn',
    text: `Weak, then permanently stronger with every kill nearby. Immune to toxin.${unlockSentence(DEFENDERS.mem.unlock)}`,
  },
};
