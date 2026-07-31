import { describe, expect, it } from 'vitest';
import { CASES, caseHasRule, ruleLabels } from './cases';
import { IMMUNITY_MAX, SPAWN_FIRST_DELAY } from './rules';
import { STRAIN_ROWS, VACCINES } from './vaccines';
import { createSimState } from '../state';
import { applySpawn } from '../systems/spawn';
import type { CaseId, CaseRuleKind } from '../types';

/**
 * Holds the Tetanus copy to what the Tetanus shield actually does.
 *
 * The shield is conditional — `applySpawn` bounces a staph only in a `wound` case — and the copy
 * promised it unconditionally. The brief shows the held copy of whichever strain a case credits, so
 * the first non-wound case to credit staph would have told a vaccinated player about something that
 * would not happen. Nothing caught it, because a promise and the code that breaks it were in
 * different files and only ever read apart.
 *
 * So the two tests below are a pair and only work as one. The first *measures* that the effect is
 * conditional, on the real simulation, so the second is not asserting a magic word: it is asserting
 * that copy describing a conditional effect names the condition. Delete the first and the second
 * becomes a spelling test.
 */

/**
 * The rule the bounce is gated on, stated rather than imported — `spawn.ts` keeps it inline, and a
 * test that read the gate out of the code under test would agree with whatever the code said.
 */
const SHIELDED_RULE: CaseRuleKind = 'wound';

/** The word the copy owes the player, and the reason it is this word rather than a nicer one. */
const CONDITION_WORD = SHIELDED_RULE;

/** Plays a single staph into a case with the vaccine held, and reports whether it bounced. */
function bouncesStaph(caseId: CaseId): boolean {
  const state = createSimState({
    caseId,
    immunity: { staph: IMMUNITY_MAX, film: 0, virus: 0 },
    clearedCount: 0,
    totalKills: 0,
  });
  state.phase = 'wave';
  state.queue = ['staph'];
  state.spawnTimer = 0;
  applySpawn(state, SPAWN_FIRST_DELAY);
  return state.enemies.length === 0;
}

describe('the Tetanus shield', () => {
  const shieldedCase = CASES.find((definition) => caseHasRule(definition, SHIELDED_RULE));
  const otherCase = CASES.find((definition) => !caseHasRule(definition, SHIELDED_RULE));

  it('really is conditional, which is the only thing that makes the caveat below worth having', () => {
    expect(shieldedCase, `no ${SHIELDED_RULE} case to bounce a staph in`).toBeDefined();
    expect(otherCase, 'no case with another rule to fail to bounce a staph in').toBeDefined();
    if (shieldedCase === undefined || otherCase === undefined) return;

    expect(
      bouncesStaph(shieldedCase.id),
      `${shieldedCase.id} is a ${SHIELDED_RULE} case and did not bounce a staph`,
    ).toBe(true);
    expect(
      bouncesStaph(otherCase.id),
      `${otherCase.id} is a ${ruleLabels(otherCase)} case and bounced a staph anyway`,
    ).toBe(false);
  });

  /**
   * Every surface is named rather than filtered for. A filter that stopped matching would pass this
   * over an empty list, and the failure this exists to prevent is copy that goes unchecked.
   */
  it('says where it works in every line of copy the player is shown', () => {
    const vaccine = VACCINES.find((entry) => entry.strain === 'staph');
    const row = STRAIN_ROWS.find((entry) => entry.key === 'staph');
    expect(vaccine, 'no staph vaccine on the season screen').toBeDefined();
    expect(row, 'no staph row on the immunity screen').toBeDefined();
    if (vaccine === undefined || row === undefined) return;

    // The season screen, the immunity screen, and the brief's shield line.
    const shown = [vaccine.effect, row.effect, row.heldCopy];
    for (const line of shown) {
      expect(
        line.toLowerCase(),
        `"${line}" promises the bounce without saying it only happens in a ${CONDITION_WORD}`,
      ).toContain(CONDITION_WORD);
    }
  });
});
