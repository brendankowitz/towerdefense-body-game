import { describe, expect, it } from 'vitest';
import { CEILING_EXEMPT, CLEAR_RATE_CEILING, CLEAR_RATE_FLOOR, OFF_THE_CURVE } from './band';

/**
 * The membership of the two exemptions, named here rather than left to whatever the sets happen
 * to contain — the same reason `content.invariants.test.ts` names the four joints instead of
 * counting them.
 *
 * An escape hatch nothing asserts is one comma wide: a future author facing an inconvenient rate
 * can add a case to either set and no test turns red. Naming the members makes widening one a
 * deliberate act with a diff that says so. Changing these lists is allowed; changing them by
 * accident, or quietly, is what this stops. It runs in `npm test` rather than inside the sweep
 * because a gate that only runs in a minutes-long harness is a gate nobody exercises.
 */
describe('the band the season answers to', () => {
  /**
   * Empty since the run sweep measured the last stand at the entry a run actually makes and the
   * case was retuned against it — see `band.ts`. An exemption is a case the season stopped holding
   * to its own rule, so the list being empty is the state to defend, not a gap to fill.
   */
  it('exempts no case from the ceiling', () => {
    expect([...CEILING_EXEMPT]).toEqual([]);
  });

  it('keeps exactly one case off the season curve — the last stand', () => {
    expect([...OFF_THE_CURVE]).toEqual(['heart']);
  });

  it('leaves a band with room in it, so the floor and the ceiling are two different numbers', () => {
    expect(CLEAR_RATE_FLOOR).toBeLessThan(CLEAR_RATE_CEILING);
  });
});
