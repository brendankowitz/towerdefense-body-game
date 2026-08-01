import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Season } from './Season';
import type { SeasonRow, VaccineRow } from '@game/progression';

const season: readonly SeasonRow[] = [
  { name: 'Deep cut', region: 'Forearm', note: 'Cleared — this region is holding', status: 'HOLDING', tier: 1, state: 'done' },
  { name: 'Food poisoning', region: 'Stomach', note: 'Cleared — the wall is under siege', status: '2 DAYS LEFT', tier: 1, state: 'done' },
  { name: 'Flu', region: 'Throat', note: '', status: 'UNDER ATTACK', tier: 1, state: 'now' },
  { name: 'Measles', region: 'Right lung', note: 'Lost — the sickness has retaken this ground', status: 'UNDER ATTACK', tier: 2, state: 'now' },
];

const vaccines: readonly VaccineRow[] = [
  { name: 'Tetanus', effect: 'First Staph of every wave bounces off', label: 'HELD', status: 'held' },
  { name: 'Flu B', effect: 'Flu no longer splits when it dies', label: '1/3', status: 'progress' },
  { name: 'Measles, mumps, rubella', effect: 'Blocks the immune-amnesia wipe entirely', label: 'AVAILABLE', status: 'available' },
  { name: 'Chickenpox', effect: 'Stops a cleared case reopening', label: 'LOCKED', status: 'locked' },
  { name: 'Strain Vesper', effect: 'No vaccine exists yet — this one you fight raw', label: 'NONE EXISTS', status: 'none' },
];

const noop = () => undefined;

describe('Season', () => {
  it('states the day the run has reached', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText('SEASON · DAY 11')).toBeInTheDocument();
  });

  it('renders one row per season entry with its name, region and status', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows).toHaveLength(season.length);
    expect(rows[0]).toHaveTextContent('Deep cut');
    expect(rows[0]).toHaveTextContent('Forearm');
    expect(rows[0]?.querySelector('.mono')?.textContent).toBe('HOLDING');
  });

  it('shows the note only when the row has one', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows[0]).toHaveTextContent('Cleared — this region is holding');
    expect(rows[2]?.querySelectorAll('.row-note')).toHaveLength(1);
  });

  it('carries the state through to the row for styling', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['done', 'done', 'now', 'now']);
  });

  it('says how long a wall has left when it is under siege', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('season-row');
    expect(rows[1]?.querySelector('.mono')?.textContent).toBe('2 DAYS LEFT');
  });

  it('says ground lost and retaken by the sickness is lost, not new', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText('Lost — the sickness has retaken this ground')).toBeInTheDocument();
  });

  /**
   * The labels say what a row is to the player, not which naming-policy bucket it came from.
   * "REAL MECHANIC" and "INVENTED STRAIN" were the policy's own wording on screen, and a reader
   * has no way to know what a mechanic being real would mean.
   */
  it('labels each tier by what it means for the run, not by the naming policy', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const labels = screen.getAllByTestId('season-tier').map((el) => el.textContent);
    expect(labels).toEqual(['EVERYDAY', 'EVERYDAY', 'EVERYDAY', 'LASTING']);
  });

  it('says nothing on a badge that the design vocabulary would have said', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const labels = screen.getAllByTestId('season-tier').map((el) => el.textContent);
    for (const label of labels) {
      expect(label, 'a badge is player copy, not the naming policy').not.toMatch(/MECHANIC|INVENTED|TIER/i);
    }
  });

  it('lists all five vaccines with their status carried to the row', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    const rows = screen.getAllByTestId('vaccine-row');
    expect(rows).toHaveLength(vaccines.length);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual([
      'held', 'progress', 'available', 'locked', 'none',
    ]);
  });

  it('says vaccines are earned, never bought', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText('EARNED, NEVER BOUGHT')).toBeInTheDocument();
  });

  it('explains the naming policy verbatim', () => {
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />);
    expect(screen.getByText(/measles really does erase immunity you already had/)).toBeInTheDocument();
  });

  it('calls onImmunityClick when "What I\'m immune to" is tapped', () => {
    const onImmunityClick = vi.fn();
    render(
      <Season day={11} season={season} vaccines={vaccines} onImmunityClick={onImmunityClick} onMapClick={noop} />,
    );
    fireEvent.click(screen.getByText("What I'm immune to"));
    expect(onImmunityClick).toHaveBeenCalledOnce();
  });

  it('calls onMapClick when "Back to the body" is tapped', () => {
    const onMapClick = vi.fn();
    render(<Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={onMapClick} />);
    fireEvent.click(screen.getByText('Back to the body'));
    expect(onMapClick).toHaveBeenCalledOnce();
  });

  it('uses no exclamation marks and no emoji', () => {
    const { container } = render(
      <Season day={11} season={season} vaccines={vaccines} onImmunityClick={noop} onMapClick={noop} />,
    );
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
