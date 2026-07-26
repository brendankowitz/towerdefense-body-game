import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapProgress } from './MapProgress';
import { IMMUNITY_MAX } from '@game/content/rules';
import type { StrainRow } from '@game/progression';

const rows: readonly StrainRow[] = [
  { key: 'staph', name: 'Tetanus', effect: 'The first Staph of every wave bounces off', progress: 'DONE', held: true },
  { key: 'virus', name: 'Flu B', effect: 'Flu can no longer split when it dies', progress: `1/${String(IMMUNITY_MAX)}`, held: false },
  { key: 'film', name: 'Biofilm', effect: 'Armour drops — phagocytes hurt it properly', progress: `0/${String(IMMUNITY_MAX)}`, held: false },
];

const noop = () => undefined;

describe('MapProgress', () => {
  it('renders one chip per strain row with its exact progress text', () => {
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    for (const row of rows) {
      const chip = screen.getByTestId(`map-strain-${row.key}`);
      expect(chip.querySelector('.map-progress-value')?.textContent).toBe(row.progress);
    }
  });

  it('marks a held strain and leaves the others unmarked', () => {
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    expect(screen.getByTestId('map-strain-staph')).toHaveAttribute('data-held', 'true');
    expect(screen.getByTestId('map-strain-virus')).toHaveAttribute('data-held', 'false');
    expect(screen.getByTestId('map-strain-film')).toHaveAttribute('data-held', 'false');
  });

  it('gives each strain its own colour, distinct from the others', () => {
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    const backgrounds = rows.map((row) => {
      const dot = screen.getByTestId(`map-strain-${row.key}`).querySelector('.map-progress-dot');
      if (!(dot instanceof HTMLElement)) throw new Error(`no dot for ${row.key}`);
      return dot.style.background;
    });
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
    for (const background of backgrounds) expect(background).not.toBe('');
  });

  it('shows the exact regions-held count it was given', () => {
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    expect(screen.getByTestId('held-count').textContent).toBe('2 / 14');
  });

  it('renders however many strains it is given, not a fixed count', () => {
    render(<MapProgress regionsHeld={0} regionsTotal={14} strains={rows.slice(0, 1)} onClick={noop} />);
    expect(screen.getAllByTestId(/^map-strain-/)).toHaveLength(1);
  });

  it('calls onClick when tapped', () => {
    const onClick = vi.fn();
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('map-progress'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a real button, so it meets the tap-target rule enforced in e2e', () => {
    render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    expect(screen.getByTestId('map-progress').tagName).toBe('BUTTON');
  });

  it('uses no exclamation marks and no emoji', () => {
    const { container } = render(<MapProgress regionsHeld={2} regionsTotal={14} strains={rows} onClick={noop} />);
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
