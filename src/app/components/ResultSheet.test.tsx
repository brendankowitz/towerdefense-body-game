import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CASE_CLEAR_BANK, TISSUE_PIPS, WAVE_CLEAR_ENERGY } from '@game/content/rules';
import type { ResultKind } from '@game/types';
import { ResultSheet } from './ResultSheet';

const RESULTS: readonly ResultKind[] = ['wave', 'case', 'lost'];

const base = {
  waveIndex: 0,
  waveCount: 5,
  kills: 12,
  leaks: 1,
  tissue: TISSUE_PIPS,
  caseTitle: 'Deep cut',
  lastStand: false,
  onPrimary: () => undefined,
  onLeave: () => undefined,
};

/** The core's own sheet, which is a different result to announce — see `copyFor`. */
const lastStand = { ...base, caseTitle: 'The last stand', lastStand: true };

describe('ResultSheet', () => {
  /**
   * Reported from play: a run that had already lost four pips showed "1 got through" on the
   * loss sheet, because the figure was the wave's. One leak reads as the thing that ended the
   * run. On a loss the number that explains it is the case total.
   */
  it('reports the case total on a loss, not the leaks of the final wave', () => {
    render(<ResultSheet {...base} result="lost" leaks={1} tissue={0} />);
    expect(screen.getByTestId('result-leaks').textContent).toBe(String(TISSUE_PIPS));
    expect(screen.getByText('Got through in all')).toBeInTheDocument();
  });

  it('still reports the wave figure when a wave is held', () => {
    render(<ResultSheet {...base} result="wave" leaks={2} tissue={TISSUE_PIPS - 2} />);
    expect(screen.getByTestId('result-leaks').textContent).toBe('2');
    expect(screen.getByText('Got through')).toBeInTheDocument();
  });

  it('states which wave was held and offers the next one', () => {
    render(<ResultSheet {...base} result="wave" waveIndex={2} waveCount={5} />);
    expect(screen.getByTestId('result-kicker').textContent).toBe('WAVE 3 OF 5 HELD');
    expect(screen.getByTestId('result-cta').textContent).toBe('Build for wave 4');
  });

  it('reports the wave reward from the constant that pays it', () => {
    render(<ResultSheet {...base} result="wave" />);
    expect(screen.getByTestId('result-reward').textContent).toBe(`+${String(WAVE_CLEAR_ENERGY)}`);
  });

  it('reports the banked reward on a cleared case, not the wave reward', () => {
    render(<ResultSheet {...base} result="case" />);
    expect(screen.getByTestId('result-kicker').textContent).toBe('DEEP CUT CLEARED');
    expect(screen.getByTestId('result-cta').textContent).toBe('Back to the body');
    expect(screen.getByTestId('result-reward').textContent).toBe(`+${String(CASE_CLEAR_BANK)}`);
  });

  it('pays nothing for a loss', () => {
    render(<ResultSheet {...base} result="lost" />);
    expect(screen.getByTestId('result-reward').textContent).toBe('0');
  });

  it('states a loss without scolding and offers the next move', () => {
    render(<ResultSheet {...base} result="lost" waveIndex={3} />);
    expect(screen.getByTestId('result-kicker').textContent).toBe('TISSUE FAILED · WAVE 4');
    expect(screen.getByTestId('result-title').textContent).toBe('It got into the blood.');
    expect(screen.getByTestId('result-cta').textContent).toBe('Come back tomorrow');
  });

  /**
   * The one result in the game that is not about a region and not about today. Written out here
   * rather than asserted as "not the ordinary copy", because what it must not do is specific:
   * losing the run used to be announced as a region lost "for today" under a button reading
   * "Come back tomorrow", one tap from a map that says the run is over.
   */
  it('announces the end of the run on a lost last stand, rather than a bad day', () => {
    render(<ResultSheet {...lastStand} result="lost" waveIndex={4} />);
    expect(screen.getByTestId('result-kicker').textContent).toBe('THE CORE FAILED · WAVE 5');
    expect(screen.getByTestId('result-title').textContent).toBe('The sickness reached the heart.');
    expect(screen.getByTestId('result-cta').textContent).toBe('End the run');
    expect(screen.getByTestId('result-cta').textContent).not.toBe('Come back tomorrow');
  });

  it('offers no second way out of a lost last stand, the way a cleared case offers none', () => {
    render(<ResultSheet {...lastStand} result="lost" />);
    expect(screen.queryByTestId('result-leave')).not.toBeInTheDocument();
  });

  it('says what winning the last stand did to the map, which is more than the core', () => {
    render(<ResultSheet {...lastStand} result="case" />);
    expect(screen.getByTestId('result-kicker').textContent).toBe('THE CORE HELD');
    expect(screen.getByTestId('result-title').textContent).toBe('The body rallied.');
    expect(screen.getByTestId('result-cta').textContent).toBe('Back to the body');
  });

  it('reports what the wave cost, both ways', () => {
    render(<ResultSheet {...base} result="wave" kills={17} leaks={2} />);
    expect(screen.getByTestId('result-kills').textContent).toBe('17');
    expect(screen.getByTestId('result-leaks').textContent).toBe('2');
  });

  it('uses no exclamation marks and no emoji anywhere, the last stand\'s own copy included', () => {
    for (const props of [base, lastStand]) {
      for (const result of RESULTS) {
        const { container, unmount } = render(<ResultSheet {...props} result={result} />);
        const text = container.textContent;
        expect(text).not.toMatch(/!/);
        expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
        unmount();
      }
    }
  });

  it('offers a way out of a held wave and of a loss, but not out of a cleared case', () => {
    const { rerender } = render(<ResultSheet {...base} result="wave" />);
    expect(screen.queryByTestId('result-leave')).toBeInTheDocument();

    rerender(<ResultSheet {...base} result="lost" />);
    expect(screen.queryByTestId('result-leave')).toBeInTheDocument();

    rerender(<ResultSheet {...base} result="case" />);
    expect(screen.queryByTestId('result-leave')).not.toBeInTheDocument();
  });

  it('reports the primary action and the way out separately', () => {
    const onPrimary = vi.fn();
    const onLeave = vi.fn();
    render(<ResultSheet {...base} result="wave" onPrimary={onPrimary} onLeave={onLeave} />);

    fireEvent.click(screen.getByTestId('result-cta'));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('result-leave'));
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('rises rather than sliding or bouncing', () => {
    const { container } = render(<ResultSheet {...base} result="wave" />);
    expect(container.querySelectorAll('.rise')).toHaveLength(1);
  });
});
