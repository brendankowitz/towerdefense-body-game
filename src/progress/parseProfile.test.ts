import { describe, expect, it } from 'vitest';
import { parseProfile } from './parseProfile';
import { IMMUNITY_MAX } from '@game/content/rules';
import { createFront } from '@game/front';

const valid = {
  cleared: ['forearm'],
  immunity: { staph: 1, film: 0, virus: 2 },
  bank: 700,
  kills: 42,
  front: createFront(1),
};

describe('parseProfile', () => {
  it('accepts a well-formed profile', () => {
    expect(parseProfile(valid)).toEqual(valid);
  });

  it('rejects a non-object', () => {
    for (const raw of [null, undefined, 3, 'x', []]) expect(parseProfile(raw)).toBeNull();
  });

  it('rejects a missing field', () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest['bank'];
    expect(parseProfile(rest)).toBeNull();
  });

  it('rejects a field of the wrong type', () => {
    expect(parseProfile({ ...valid, bank: '700' })).toBeNull();
    expect(parseProfile({ ...valid, cleared: 'forearm' })).toBeNull();
  });

  it('rejects a cleared entry that is not a known case', () => {
    expect(parseProfile({ ...valid, cleared: ['elbow'] })).toBeNull();
  });

  it('rejects an immunity value outside 0 to the content-defined maximum', () => {
    expect(parseProfile({ ...valid, immunity: { staph: IMMUNITY_MAX + 1, film: 0, virus: 0 } })).toBeNull();
    expect(parseProfile({ ...valid, immunity: { staph: -1, film: 0, virus: 0 } })).toBeNull();
  });

  it('accepts an immunity value at the content-defined maximum', () => {
    expect(parseProfile({ ...valid, immunity: { staph: IMMUNITY_MAX, film: 0, virus: 0 } })).not.toBeNull();
  });

  it('rejects a missing strain', () => {
    expect(parseProfile({ ...valid, immunity: { staph: 1, virus: 0 } })).toBeNull();
  });

  it('rejects a non-integer counter', () => {
    expect(parseProfile({ ...valid, kills: 1.5 })).toBeNull();
  });

  it('rejects a negative counter', () => {
    expect(parseProfile({ ...valid, bank: -1 })).toBeNull();
  });

  it('drops unknown extra keys rather than carrying them forward', () => {
    const parsed = parseProfile({ ...valid, sneaky: true });
    if (parsed === null) throw new Error('a profile with an unknown key should still parse');
    expect(Object.keys(parsed)).toEqual(['cleared', 'immunity', 'bank', 'kills', 'front']);
  });

  /**
   * A version-1 save has a cleared list and no front — this is what it looks like once the
   * version check above it has already been stripped away, the way a hand-edited save would
   * reach `parseProfile` directly.
   */
  it('rejects a save written before the body had a front line', () => {
    const old = { cleared: [], immunity: { staph: 0, film: 0, virus: 0 }, day: 3, bank: 400, kills: 9 };
    expect(parseProfile(old)).toBeNull();
  });

  /**
   * A siege on ground the save does not claim to hold is not a shape the game can ever produce —
   * `holdRegion` and `stepSickness` both keep `siege` and `held` in lockstep. It is what a
   * hand-edited or half-written save looks like, and it is the one cross-field check worth making.
   */
  it('rejects a siege entry on a node the save does not claim to hold', () => {
    const front = { ...valid.front, siege: { forearm: 1 } };
    expect(parseProfile({ ...valid, front })).toBeNull();
  });

  /**
   * A save written before the last stand existed has no `lost` field at all, and that is a true
   * save rather than a corrupt one — the field's absence has to parse as `false`, not as a reject.
   */
  it('accepts a save from before the heart case existed, reading the missing loss as false', () => {
    const front = Object.fromEntries(
      Object.entries(valid.front).filter(([key]) => key !== 'lost'),
    );
    const parsed = parseProfile({ ...valid, front });
    expect(parsed?.front.lost).toBe(false);
  });

  it('rejects a lost flag that is not a boolean', () => {
    const front = { ...valid.front, lost: 'true' };
    expect(parseProfile({ ...valid, front })).toBeNull();
  });
});
