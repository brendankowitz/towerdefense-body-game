import type { DefenderKind, PaletteToken } from '../types';
import { TAG_REWARD_MULTIPLIER } from './rules';

interface DefenderBase {
  readonly cost: number;
  readonly range: number;
  readonly label: string;
  readonly unlock: number;
  readonly token: PaletteToken;
}

/**
 * `capacity` is the phagocyte's appetite, measured in health rather than in bodies: it banks the
 * damage it deals, and once the bank reaches capacity it takes its long `rest` instead of the
 * brief `gap` it takes after any other body. Counting bodies made every meal cost the same, so the
 * heaviest thing on the vessel bought many times the matter of the lightest for one recovery.
 * Counting health prices the meal by what it was, and a half-eaten body that a burst finished
 * still counts for the half this cell did.
 */
export type DefenderStats =
  | (DefenderBase & { readonly kind: 'phago'; readonly dps: number; readonly gap: number; readonly capacity: number; readonly rest: number })
  | (DefenderBase & { readonly kind: 'clot'; readonly slow: number; readonly wear: number })
  | (DefenderBase & { readonly kind: 'anti'; readonly rate: number; readonly tag: number; readonly dot: number })
  | (DefenderBase & { readonly kind: 'nk'; readonly rate: number; readonly dmg: number; readonly execute: number })
  | (DefenderBase & { readonly kind: 'mast'; readonly rate: number; readonly dmg: number })
  | (DefenderBase & { readonly kind: 'mem'; readonly rate: number; readonly dmg: number; readonly learn: number; readonly cap: number });

/**
 * The dock opens one cell at a time, and this is the season's progression schedule.
 *
 * **It used to open five cells on day one and the sixth on day two**, which left days 3 to 10 with
 * nothing to unlock and made every board after the second a rearrangement of the same six pieces.
 * That was a balance decision before it was a progression one — the holistic review's candidate D
 * moved `mast` to 0 and `mem` to 1 because, at the stats of the time, the opening cases could not
 * be won without them. Reach and the clot's lifetime have both been retuned since, and the opening
 * case now clears well inside the band on the three cheapest cells alone, so the schedule is free
 * to be a schedule.
 *
 * What each day adds, and why in this order:
 *
 * - **Day 1 — engulf, block, tag.** Eat one thing, slow everything, mark what is armoured. Three
 *   cells is a 243-board space and a decision a new player can hold in their head, and the wound
 *   rule's forced clot purchase is one of the three.
 * - **Day 2 — execute.** The multiplying case is where killing in the wrong order first costs
 *   something, so it is where a cell that finishes a wounded body belongs.
 * - **Day 3 — burst.** The toxic case punishes standing anywhere useful; area damage is the answer
 *   that makes one good spot worth two bad ones.
 * - **Day 4 — learn.** The relapsing case sends the same bodies back up, so a cell that gets
 *   permanently stronger with every kill nearby is the one that pays for a long fight.
 *
 * The two matured forms carry days 5 and 7 — see `MATURED_FORMS`. Every day of the season now adds
 * a cell, a form, a rule or a strain; before this, six of the ten added a rule and nothing else.
 */
export const DEFENDERS: { readonly [K in DefenderKind]: Extract<DefenderStats, { kind: K }> } = {
  phago: { kind: 'phago', cost: 40, range: 74, dps: 15, gap: 0.7, capacity: 104, rest: 3.4, label: 'Engulf', unlock: 0, token: 'frontline' },
  clot: { kind: 'clot', cost: 70, range: 76, slow: 0.28, wear: 6, label: 'Block', unlock: 0, token: 'control' },
  anti: { kind: 'anti', cost: 95, range: 94, rate: 1.5, tag: 10, dot: 6, label: 'Tag', unlock: 0, token: 'support' },
  nk: { kind: 'nk', cost: 130, range: 78, rate: 2.4, dmg: 58, execute: 0.35, label: 'Execute', unlock: 1, token: 'execute' },
  mast: { kind: 'mast', cost: 150, range: 72, rate: 1.1, dmg: 11, label: 'Burst', unlock: 2, token: 'burst' },
  mem: { kind: 'mem', cost: 175, range: 82, rate: 1.3, dmg: 12, learn: 2.5, cap: 46, label: 'Learn', unlock: 3, token: 'learn' },
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
    text: `Digests one body at a time and fills up — ${String(DEFENDERS.phago.capacity)} health of matter, then a long rest. A big body costs it far more than a small one.`,
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
    text: `Slow, heavy hit on the most wounded thing. Finishes anything under ${percent(DEFENDERS.nk.execute)}.${unlockSentence(DEFENDERS.nk.unlock)}`,
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
