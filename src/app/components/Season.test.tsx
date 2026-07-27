import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Season } from './Season';
import type { SeasonRow, VaccineRow } from '@game/progression';

const season: readonly SeasonRow[] = [
  { day: 4, name: 'Deep cut', region: 'Forearm', note: 'Cleared — this region is holding', tier: 1, state: 'done' },
  { day: 5, name: 'Flu', region: 'Throat', note: '', tier: 1, state: 'now' },
  { day: 6, name: 'Food poisoning', region: 'Stomach', note: '', tier: 1, state: 'next' },
  { day: 8, name: 'Measles', region: 'Whole body', note: 'Wipes one immunity you already earned', tier: 2, state: 'warn' },
  { day: 11, name: 'Strain Vesper', region: 'Lungs', note: 'Novel — nothing known about it yet', tier: 3, state: 'unknown' },
];

const vaccines: readonly VaccineRow[] = [
  { name: 'Tetanus', effect: 'First Staph of every wave bounces off', cost: '', label: 'HELD', status: 'held' },
  { name: 'Flu B', effect: 'Flu no longer splits when it dies', cost: '', label: '1/3', status: 'progress' },
  { name: 'Measles, mumps, rubella', effect: 'Blocks the immune-amnesia wipe entirely', cost: 'Costs a day you don’t fight', label: 'AVAILABLE', status: 'available' },
  { name: 'Chickenpox', effect: 'Stops a cleared case reopening later', cost: 'Survive a dormancy case first', label: 'LOCKED', status: 'locked' },
  { name: 'Strain Vesper', effect: 'No vaccine exists yet — this one you fight raw', cost: '', label: 'NONE EXISTS', status: 'none' },
];

const noop = () => undefined;

describe('Season', () => {
  it('states the day range from the first and last row', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText('SEASON · DAYS 4—11')).toBeInTheDocument();
  });

  it('renders one row per season entry with its name, region and day', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows).toHaveLength(season.length);
    expect(rows[0]).toHaveTextContent('Deep cut');
    expect(rows[0]).toHaveTextContent('Forearm');
    expect(rows[0]?.querySelector('.mono')?.textContent).toBe('DAY 4');
  });

  it('shows the note only when the row has one', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows[0]).toHaveTextContent('Cleared — this region is holding');
    expect(rows[1]?.querySelectorAll('.row-note')).toHaveLength(1);
  });

  it('carries the state through to the row for styling', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['done', 'now', 'next', 'warn', 'unknown']);
  });

  /**
   * The labels say what a row is to the player, not which naming-policy bucket it came from.
   * "REAL MECHANIC" and "INVENTED STRAIN" were the policy's own wording on screen, and a reader
   * has no way to know what a mechanic being real would mean.
   */
  it('labels each tier by what it means for the run, not by the naming policy', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const labels = screen.getAllByTestId('season-tier').map((el) => el.textContent);
    expect(labels).toEqual(['EVERYDAY', 'EVERYDAY', 'EVERYDAY', 'LASTING', 'UNKNOWN']);
  });

  it('says nothing on a badge that the design vocabulary would have said', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const labels = screen.getAllByTestId('season-tier').map((el) => el.textContent ?? '');
    for (const label of labels) {
      expect(label, 'a badge is player copy, not the naming policy').not.toMatch(/MECHANIC|INVENTED|TIER/i);
    }
  });

  it('lists all five vaccines with their status carried to the row', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('vaccine-row');
    expect(rows).toHaveLength(vaccines.length);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'held', 'progress', 'available', 'locked', 'none',
    ]);
  });

  it('shows a cost line only for vaccines that carry one', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('vaccine-row');
    expect(rows[0]?.querySelector('.row-cost')).toBeNull();
    expect(rows[2]?.querySelector('.row-cost')?.textContent).toBe('Costs a day you don’t fight');
  });

  it('says vaccines are earned, never bought', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText('EARNED, NEVER BOUGHT')).toBeInTheDocument();
  });

  it('explains the naming policy verbatim', () => {
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText(/measles really does erase immunity you already had/)).toBeInTheDocument();
  });

  it('calls onImmunityClick when "What I\'m immune to" is tapped', () => {
    const onImmunityClick = vi.fn();
    render(
      <Season season={season} vaccines={vaccines} onImmunityClick={onImmunityClick} onMapClick={noop} />,
    );
    fireEvent.click(screen.getByText("What I'm immune to"));
    expect(onImmunityClick).toHaveBeenCalledOnce();
  });

  it('calls onMapClick when "Back to the body" is tapped', () => {
    const onMapClick = vi.fn();
    render(<Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={onMapClick} />);
    fireEvent.click(screen.getByText('Back to the body'));
    expect(onMapClick).toHaveBeenCalledOnce();
  });

  it('uses no exclamation marks and no emoji', () => {
    const { container } = render(
      <Season season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />,
    );
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
