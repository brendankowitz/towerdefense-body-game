import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Brief } from './Brief';
import { arrivalKindFor, strainOf } from '@game/arrivals';
import { CASES, CASE_BY_ID, caseHasRule, type CaseDefinition } from '@game/content/cases';
import { DEFENDER_ORDER } from '@game/content/defenders';
import { IMMUNITY_MAX } from '@game/content/rules';
import { STRAIN_ROWS } from '@game/content/vaccines';
import type { StrainId } from '@game/types';

/**
 * `ARRIVALS_ENABLED` ships `false` until Task 9 measures the response, so every assertion that the
 * memory line *appears* would otherwise pass for the wrong reason — or rather fail for one, since
 * nothing at all can appear behind a flag that is off. Mocked through a getter rather than a fixed
 * value so the one test that needs the flag off can turn it off in the same file, and so the
 * promise-the-build-cannot-keep rule is proven rather than assumed.
 */
const arrivals = vi.hoisted(() => ({ enabled: true }));

vi.mock('@game/content/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@game/content/rules')>();
  return { ...actual, get ARRIVALS_ENABLED() { return arrivals.enabled; } };
});

const forearm = CASE_BY_ID.forearm;
const noop = () => undefined;

const NO_MEMORY: Readonly<Record<StrainId, number>> = { staph: 0, film: 0, virus: 0 };
const FULL_MEMORY: Readonly<Record<StrainId, number>> = {
  staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX,
};

/**
 * The strains a case's wave table sends, asked the way the simulation asks it. Used to *choose*
 * fixtures from the season rather than to assert anything, so the tests below keep following the
 * content the way the "gives a card to every rule" test does.
 */
function sends(definition: CaseDefinition): readonly StrainId[] {
  return [...new Set(definition.waves.flat().flatMap((entry) => strainOf(NO_MEMORY, entry.kind) ?? []))];
}

beforeEach(() => {
  arrivals.enabled = true;
});

describe('Brief', () => {
  it('states the region, the title and the story', () => {
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.getByText(forearm.region)).toBeInTheDocument();
    expect(screen.getByText(forearm.title)).toBeInTheDocument();
    expect(screen.getByText(forearm.story)).toBeInTheDocument();
  });

  it('states the case rule and its sub-line', () => {
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    const [rule] = forearm.rules;
    expect(screen.getByText(rule.label)).toBeInTheDocument();
    expect(screen.getByText(rule.sub)).toBeInTheDocument();
  });

  /**
   * A compound case is played under two rules, and a brief that showed one of them would be hiding
   * half of what the case does. Found by rule count rather than by id, so this follows the season.
   */
  it('gives a card to every rule a case is played under, not just its first', () => {
    const compound = CASES.find((definition) => definition.rules.length > 1);
    expect(compound, 'no case in the season carries more than one rule').toBeDefined();
    if (compound === undefined) return;

    render(<Brief definition={compound} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.getAllByTestId('brief-rule')).toHaveLength(compound.rules.length);
    for (const rule of compound.rules) {
      expect(screen.getByText(rule.sub)).toBeInTheDocument();
    }
  });

  /**
   * The novel rule, asserted where it actually lives. It is the only rule in the season with no
   * effect on the simulation at all — what it changes is this screen — so a test that read the
   * simulation would prove nothing about it.
   */
  it('lists nothing that is coming on a case whose rule is that nobody knows', () => {
    const novel = CASES.find((definition) => caseHasRule(definition, 'novel'));
    expect(novel, 'no novel case in the season').toBeDefined();
    if (novel === undefined) return;

    render(<Brief definition={novel} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.queryAllByTestId('brief-enemy')).toHaveLength(0);
    expect(screen.getByTestId('brief-unknown')).toBeInTheDocument();
  });

  it('lists every pathogen kind in the case with its whole-case total', () => {
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    const rows = screen.getAllByTestId('brief-enemy');
    const entries = forearm.waves.flat();
    const kinds = new Set(entries.map((e) => e.kind));
    const staphTotal = entries.filter((e) => e.kind === 'staph').reduce((sum, e) => sum + e.count, 0);

    expect(rows).toHaveLength(kinds.size);
    expect(rows[0]).toHaveTextContent(`×${String(staphTotal)}`);
  });

  it('lists every defender kind as a way to stop them', () => {
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.getAllByTestId('brief-verb')).toHaveLength(DEFENDER_ORDER.length);
  });

  it('shows progress copy when the credited strain has not reached the immunity max', () => {
    render(<Brief definition={forearm} strainClears={1} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.getByTestId('brief-shield')).toHaveTextContent(
      `No vaccine for this strain yet — 1 of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`,
    );
  });

  it('shows the held copy once the credited strain reaches the immunity max', () => {
    render(<Brief definition={forearm} strainClears={IMMUNITY_MAX} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    const heldCopy = STRAIN_ROWS.find((row) => row.key === forearm.credits)?.heldCopy;
    expect(heldCopy).toBeDefined();
    if (heldCopy !== undefined) {
      expect(screen.getByTestId('brief-shield')).toHaveTextContent(heldCopy);
    }
  });

  it('calls onStartCase when "Get in there" is tapped', () => {
    const onStartCase = vi.fn();
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={onStartCase} onBack={noop} />);
    fireEvent.click(screen.getByTestId('get-in-there'));
    expect(onStartCase).toHaveBeenCalledOnce();
  });

  it('calls onBack when "Back to the body" is tapped', () => {
    const onBack = vi.fn();
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={onBack} />);
    fireEvent.click(screen.getByText('Back to the body'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('uses no exclamation marks and no emoji anywhere in the brief', () => {
    // Rendered at full memory rather than none, so the memory line is on screen and inside the
    // check — copy that only appears for a vaccinated player is still copy this holds.
    const { container } = render(
      <Brief definition={forearm} strainClears={IMMUNITY_MAX} memory={FULL_MEMORY} onStartCase={noop} onBack={noop} />,
    );
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

/**
 * What memory will send against *this* wave table. Every test here asserts the derivation — which
 * of the three answers the screen reached — rather than the sentence it prints, because a test
 * comparing a string the component built from the same literal proves only that the literal exists.
 */
describe('the memory line', () => {
  it('says nothing when no strain the case sends has memory behind it', () => {
    render(<Brief definition={forearm} strainClears={0} memory={NO_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.queryByTestId('brief-memory')).not.toBeInTheDocument();
  });

  /**
   * The line answers to the wave table, not to `definition.credits`. Reading the credited strain
   * instead is the plausible shortcut here and it is wrong in both directions — this is the half
   * that shows up as help silently missing from a screen that had every reason to promise it.
   */
  it('promises help for a strain the case sends but does not credit', () => {
    const sending = CASES.find((definition) => !caseHasRule(definition, 'novel')
      && sends(definition).some((strain) => strain !== definition.credits));
    expect(sending, 'no case sends a strain it does not credit').toBeDefined();
    if (sending === undefined) return;

    const uncredited = sends(sending).find((strain) => strain !== sending.credits);
    if (uncredited === undefined) return;

    render(
      <Brief
        definition={sending}
        strainClears={0}
        memory={{ ...NO_MEMORY, [uncredited]: IMMUNITY_MAX }}
        onStartCase={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId('brief-memory')).toBeInTheDocument();
  });

  /**
   * The biology gate, and it holds however `KILLER_MIX_CHANCE` is eventually measured: nothing
   * short of a held vaccine ever buys a killer, so nothing short of one may be promised one.
   */
  it('promises marks and no killers below the immunity max', () => {
    for (let held = 1; held < IMMUNITY_MAX; held += 1) {
      const memory = { staph: held, film: held, virus: held };
      const { unmount } = render(
        <Brief definition={forearm} strainClears={held} memory={memory} onStartCase={noop} onBack={noop} />,
      );
      expect(screen.getByTestId('brief-memory'), `${String(held)} clears`)
        .toHaveAttribute('data-response', 'marks');
      unmount();
    }
  });

  /**
   * `KILLER_MIX_CHANCE` is a Task 9 placeholder that may yet be measured down to zero, which would
   * make "marks and killers" a promise no board keeps. Asking `arrivalKindFor` what a full-memory
   * call can buy is what makes that a measurement this test follows rather than a copy edit.
   */
  it('promises killers at full memory for as long as the mix sends any', () => {
    const reachable = arrivalKindFor(IMMUNITY_MAX, 0) === 'killer';
    render(<Brief definition={forearm} strainClears={IMMUNITY_MAX} memory={FULL_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.getByTestId('brief-memory'))
      .toHaveAttribute('data-response', reachable ? 'killers' : 'marks');
  });

  /** Nothing to read is the whole of the novel rule, and that includes what the body would send. */
  it('says nothing on a case whose rule is that nobody knows', () => {
    const novel = CASES.find((definition) => caseHasRule(definition, 'novel'));
    expect(novel, 'no novel case in the season').toBeDefined();
    if (novel === undefined) return;
    expect(sends(novel).length, 'the novel case sends no tracked strain, so this proves nothing')
      .toBeGreaterThan(0);

    render(<Brief definition={novel} strainClears={0} memory={FULL_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.queryByTestId('brief-memory')).not.toBeInTheDocument();
  });

  /** A promise the build cannot keep: with the feature off, no arrival ever lands. */
  it('says nothing while no arrival can land', () => {
    const { unmount } = render(
      <Brief definition={forearm} strainClears={IMMUNITY_MAX} memory={FULL_MEMORY} onStartCase={noop} onBack={noop} />,
    );
    expect(screen.getByTestId('brief-memory'), 'the same board promises nothing with the flag on')
      .toBeInTheDocument();
    unmount();

    arrivals.enabled = false;
    render(<Brief definition={forearm} strainClears={IMMUNITY_MAX} memory={FULL_MEMORY} onStartCase={noop} onBack={noop} />);
    expect(screen.queryByTestId('brief-memory')).not.toBeInTheDocument();
  });
});
