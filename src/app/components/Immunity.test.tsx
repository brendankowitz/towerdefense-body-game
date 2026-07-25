import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Immunity } from './Immunity';
import { IMMUNITY_MAX } from '@game/content/rules';
import type { StrainRow } from '@game/progression';

const rows: readonly StrainRow[] = [
  { key: 'staph', name: 'Tetanus', effect: 'The first Staph of every wave bounces off', progress: 'DONE', held: true },
  { key: 'virus', name: 'Flu B', effect: 'Flu can no longer split when it dies', progress: `1/${String(IMMUNITY_MAX)}`, held: false },
  { key: 'film', name: 'Biofilm', effect: 'Armour drops — phagocytes hurt it properly', progress: `0/${String(IMMUNITY_MAX)}`, held: false },
];

const noop = () => undefined;

describe('Immunity', () => {
  it('renders one strain card per row with its name, effect and progress', () => {
    render(<Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={noop} />);
    for (const row of rows) {
      const card = screen.getByTestId(`strain-${row.key}`);
      expect(card).toHaveTextContent(row.name);
      expect(card).toHaveTextContent(row.effect);
      expect(card.querySelector('.strain-progress')?.textContent).toBe(row.progress);
    }
  });

  it('marks a held strain and leaves the others unmarked', () => {
    render(<Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={noop} />);
    expect(screen.getByTestId('strain-staph')).toHaveAttribute('data-held', 'true');
    expect(screen.getByTestId('strain-virus')).toHaveAttribute('data-held', 'false');
    expect(screen.getByTestId('strain-film')).toHaveAttribute('data-held', 'false');
  });

  it('counts held strains against the total in the kicker', () => {
    render(<Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={noop} />);
    expect(screen.getByText(`KEPT FOREVER · 1 of ${String(rows.length)}`)).toBeInTheDocument();
  });

  it('derives the lede from the immunity max', () => {
    render(<Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={noop} />);
    expect(screen.getByText(
      `Clear a strain ${String(IMMUNITY_MAX)} times and it's blocked in every run after this one.`,
    )).toBeInTheDocument();
  });

  it('shows the run stats exactly as given', () => {
    render(<Immunity rows={rows} day={7} kills={42} regionsHeld={2} onSeasonClick={noop} onResetClick={noop} />);
    expect(screen.getByTestId('stat-days').textContent).toBe('7');
    expect(screen.getByTestId('stat-kills').textContent).toBe('42');
    expect(screen.getByTestId('stat-regions').textContent).toBe('2');
  });

  it('calls onSeasonClick when "Season & vaccines" is tapped', () => {
    const onSeasonClick = vi.fn();
    render(
      <Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={onSeasonClick} onResetClick={noop} />,
    );
    fireEvent.click(screen.getByText('Season & vaccines'));
    expect(onSeasonClick).toHaveBeenCalledOnce();
  });

  it('calls onResetClick when "Start a new body" is tapped', () => {
    const onResetClick = vi.fn();
    render(
      <Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={onResetClick} />,
    );
    fireEvent.click(screen.getByTestId('reset-run'));
    expect(onResetClick).toHaveBeenCalledOnce();
  });

  it('uses no exclamation marks and no emoji', () => {
    const { container } = render(
      <Immunity rows={rows} day={1} kills={0} regionsHeld={0} onSeasonClick={noop} onResetClick={noop} />,
    );
    const text = container.textContent;
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// The swatch answers "which strain", so two strains must never look the same. Colouring it by
// state instead made all three identical green — and green means "already won", so unearned
// vaccines read as earned.
it('gives each strain its own colour, distinct from the others', () => {
  render(
    <Immunity
      rows={rows}
      day={1}
      kills={0}
      regionsHeld={0}
      onSeasonClick={() => undefined}
      onResetClick={() => undefined}
    />,
  );

  const backgrounds = rows.map((row) => {
    const swatch = screen.getByTestId(`strain-${row.key}`).querySelector('.strain-swatch');
    if (!(swatch instanceof HTMLElement)) throw new Error(`no swatch for ${row.key}`);
    return swatch.style.background;
  });

  expect(new Set(backgrounds).size).toBe(backgrounds.length);
  for (const background of backgrounds) expect(background).not.toBe('');
});
