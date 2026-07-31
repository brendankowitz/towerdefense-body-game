import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFENDERS } from '@game/content/defenders';
import { MATURED_FORMS } from '@game/content/maturation';
import { PATHOGENS } from '@game/content/pathogens';
import { CASES } from '@game/content/cases';
import { resetTuning } from '@game/content/tuning';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import { TuningPanel } from './TuningPanel';

function testLoop(): GameLoop {
  return new GameLoop(createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    day: 1,
    totalKills: 0,
  }));
}

afterEach(() => { resetTuning(); });

describe('TuningPanel', () => {
  it('starts collapsed, as a handle that does not obstruct the board', () => {
    render(<TuningPanel loop={testLoop()} />);
    expect(screen.getByTestId('tuning-handle')).toBeInTheDocument();
    expect(screen.queryByTestId('tuning-panel')).not.toBeInTheDocument();
  });

  it('opens on tap and closes again', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));
    expect(screen.getByTestId('tuning-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tuning-close'));
    expect(screen.queryByTestId('tuning-panel')).not.toBeInTheDocument();
  });

  it('moves a defender stat against the live table when its field changes', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const before = DEFENDERS.phago.cost;
    const input = screen.getByTestId('tuning-defender-phago-cost');
    fireEvent.change(input, { target: { value: String(before + 12) } });

    expect(DEFENDERS.phago.cost).toBe(before + 12);
  });

  it('moves a pathogen stat against the live table when its field changes', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const before = PATHOGENS.staph.speed;
    const input = screen.getByTestId('tuning-pathogen-staph-speed');
    fireEvent.change(input, { target: { value: String(before + 9) } });

    expect(PATHOGENS.staph.speed).toBe(before + 9);
  });

  it('moves a matured form against the live table, which the defender rows cannot reach', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const before = MATURED_FORMS.phago?.stats.range;
    if (before === undefined) throw new Error('fixture expects the macrophage to override range');

    fireEvent.change(screen.getByTestId('tuning-matured-phago-range'), { target: { value: String(before + 20) } });

    expect(MATURED_FORMS.phago?.stats.range).toBe(before + 20);
  });

  it('offers no matured section for a cell that has nothing to grow into', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    expect(screen.getByTestId('tuning-matured-phago')).toBeInTheDocument();
    expect(screen.queryByTestId('tuning-matured-nk')).not.toBeInTheDocument();
  });

  it('ignores an unparseable field edit rather than corrupting the live table', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const before = DEFENDERS.phago.cost;
    fireEvent.change(screen.getByTestId('tuning-defender-phago-cost'), { target: { value: 'not a number' } });

    expect(DEFENDERS.phago.cost).toBe(before);
  });

  it('steps a wave count up and down against the live case table', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const forearm = CASES.find((c) => c.id === 'forearm');
    if (forearm === undefined) throw new Error('fixture expects the forearm case to exist');
    const before = forearm.waves[0]?.[0]?.count;
    if (before === undefined) throw new Error('fixture expects forearm wave 0 entry 0 to exist');

    fireEvent.click(screen.getByTestId('tuning-wave-0-staph-inc'));
    expect(forearm.waves[0]?.[0]?.count).toBe(before + 1);
    expect(screen.getByTestId('tuning-wave-0-staph-count')).toHaveTextContent(String(before + 1));

    fireEvent.click(screen.getByTestId('tuning-wave-0-staph-dec'));
    fireEvent.click(screen.getByTestId('tuning-wave-0-staph-dec'));
    expect(forearm.waves[0]?.[0]?.count).toBe(before - 1);
  });

  it('never steps a wave count below zero', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const forearm = CASES.find((c) => c.id === 'forearm');
    if (forearm === undefined) throw new Error('fixture expects the forearm case to exist');
    const entry = forearm.waves[0]?.[0];
    if (entry === undefined) throw new Error('fixture expects forearm wave 0 entry 0 to exist');

    // Captured once: entry.count mutates with every click, so the loop bound must not
    // re-read it (a live bound would shrink under itself and stop the loop early).
    const clicksNeeded = entry.count + 5;
    for (let i = 0; i < clicksNeeded; i += 1) {
      fireEvent.click(screen.getByTestId('tuning-wave-0-staph-dec'));
    }

    expect(forearm.waves[0]?.[0]?.count).toBe(0);
  });

  it('restores every seed value on Reset to seeds', () => {
    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));

    const before = DEFENDERS.phago.cost;
    fireEvent.change(screen.getByTestId('tuning-defender-phago-cost'), { target: { value: String(before + 40) } });
    expect(DEFENDERS.phago.cost).toBe(before + 40);

    fireEvent.click(screen.getByTestId('tuning-reset'));
    expect(DEFENDERS.phago.cost).toBe(before);
  });

  it('copies the exported defenders module to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<TuningPanel loop={testLoop()} />);
    fireEvent.click(screen.getByTestId('tuning-handle'));
    fireEvent.click(screen.getByTestId('tuning-copy-defenders'));

    expect(writeText).toHaveBeenCalledOnce();
    const [text] = writeText.mock.calls[0] as [string];
    expect(text).toContain('export const DEFENDERS');
    await screen.findByText(/defenders\.ts copied/i);
  });
});
